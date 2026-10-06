#!/usr/bin/env bash
if [ "${ALLOW_DEPLOY:-}" != "1" ]; then echo "Chặn: script này vẫn trỏ vào hạ tầng Toolswave. Phase deploy chưa làm — đặt ALLOW_DEPLOY=1 khi đã đổi đích." >&2; exit 1; fi
# firewall.sh — default-closed host firewall for the Toolswave box. Run as root.
#
#   bash deploy/firewall.sh            # apply, with a 10-minute auto-rollback safety net
#   bash deploy/firewall.sh --commit   # cancel the safety net (run ONLY after you have
#                                      # re-connected and confirmed everything still works)
#   bash deploy/firewall.sh --off      # disable the firewall entirely
#
# ── Why this is safe to run ──────────────────────────────────────────────────
# The box is behind NAT, so the threat this closes is the SHARED OFFICE LAN and the tailnet,
# not the open internet. Nothing the public site needs is exposed here: cloudflared reaches
# every service over `http://localhost:<port>` (see /etc/cloudflared/config.yml), so no
# inbound port has to be open for app/aapp/apia or any generated app to work.
#
# ── Why it might NOT be enough ───────────────────────────────────────────────
# Docker publishes ports with DNAT rules that are evaluated BEFORE ufw's INPUT chain, so
# `ufw deny` does NOT filter a published container port. Every other developer's containers
# on this box (3xxx/5xxx/6xxx/7xxx/9xxx) therefore keep working — and also stay reachable.
# Closing those needs rules in the DOCKER-USER chain, which is deliberately out of scope here
# because it would affect services this project does not own.
set -euo pipefail

LAN=192.168.1.0/24
ROLLBACK_MIN=10
FLAG=/run/toolswave-ufw-rollback.pid

case "${1:-}" in
  --off)
    ufw --force disable
    echo "firewall disabled."
    exit 0
    ;;
  --commit)
    if [ -f "$FLAG" ]; then
      kill "$(cat "$FLAG")" 2>/dev/null || true
      rm -f "$FLAG"
      echo "safety net cancelled — the firewall now stays on across reboots."
    else
      echo "no safety net running (already committed, or it already fired)."
    fi
    ufw status verbose
    exit 0
    ;;
esac

command -v ufw >/dev/null || { echo "ufw is not installed (apt install ufw)"; exit 1; }
ip -br link show tailscale0 >/dev/null 2>&1 || {
  echo "REFUSING: no tailscale0 interface — allowing it is the rule that keeps YOUR ssh alive."
  exit 1
}

echo "==> resetting rules"
ufw --force reset >/dev/null

# Containers must keep routing. ufw defaults DEFAULT_FORWARD_POLICY=DROP, which can cut
# container→internet traffic for everyone else on this box. Keep the pre-existing behaviour.
sed -i 's/^DEFAULT_FORWARD_POLICY=.*/DEFAULT_FORWARD_POLICY="ACCEPT"/' /etc/default/ufw

ufw default deny incoming
ufw default allow outgoing
ufw default allow routed

# 1. Tailscale — FIRST, and unrestricted. This is the administrative path (and the one this
#    script is most likely being run over). If nothing else in this file is right, this rule
#    is what lets you get back in and fix it.
ufw allow in on tailscale0 comment 'tailnet: admin access'

# 2. Loopback — cloudflared → nginx → every app rides this. Explicit, never rely on a default.
ufw allow in on lo comment 'loopback: cloudflared → nginx → apps'

# 3. Docker bridges — inter-container traffic and container → host services.
for br in $(ip -br link show type bridge | awk '{print $1}'); do
  ufw allow in on "$br" comment 'docker bridge' >/dev/null
done

# 4. SSH from the office LAN. Kept so you are not Tailscale-only if the tailnet is down.
#    Remove this line for a stricter posture (Tailscale becomes the ONLY way in).
ufw allow from "$LAN" to any port 22 proto tcp comment 'ssh from office LAN'

# 5. nginx from the office LAN. Other developers share this box and reach vhosts by host IP;
#    dropping this would break them, and it is not the exposure that mattered.
ufw allow from "$LAN" to any port 80 proto tcp comment 'nginx (shared box) from LAN'
ufw allow from "$LAN" to any port 8080 proto tcp comment 'nginx alt (shared box) from LAN'

# Everything else — the API (now loopback-only anyway), the cms-keeper on 8790, and anything
# someone binds to 0.0.0.0 in the future — is denied by the default. That default-closed
# posture is the real point of this file.

echo "==> enabling with a ${ROLLBACK_MIN}-minute auto-rollback"
# Dead-man's switch: if this locks you out, ufw turns itself off and you get back in.
# `at` is not installed on this box, so a detached sleep does the job.
nohup sh -c "sleep $((ROLLBACK_MIN * 60)); ufw --force disable; rm -f $FLAG" >/dev/null 2>&1 &
echo $! > "$FLAG"

ufw --force enable
ufw status verbose

cat <<EOF

────────────────────────────────────────────────────────────────────────────
The firewall is ON, and will turn ITSELF OFF in ${ROLLBACK_MIN} minutes.

NOW, from another terminal, verify you can still:
  - ssh in over Tailscale
  - load https://app.toolswave.net and https://apia.toolswave.net/v1/health
  - reach the other services on this box that you care about

Then make it permanent:   bash deploy/firewall.sh --commit
If anything broke, just wait — it reverts on its own.
────────────────────────────────────────────────────────────────────────────
EOF
