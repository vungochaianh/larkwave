#!/usr/bin/env bash
if [ "${ALLOW_DEPLOY:-}" != "1" ]; then echo "Chặn: script này vẫn trỏ vào hạ tầng Toolswave. Phase deploy chưa làm — đặt ALLOW_DEPLOY=1 khi đã đổi đích." >&2; exit 1; fi
# Hoán đổi ba cặp tên miền giữa hai hệ thống Toolswave.
#
#   wsl -d Ubuntu-22.04 -- bash /mnt/c/tw/app/scripts/doi-ten-mien.sh          # xem trước, KHÔNG đổi gì
#   wsl -d Ubuntu-22.04 -- bash /mnt/c/tw/app/scripts/doi-ten-mien.sh --lam    # thực hiện
#   wsl -d Ubuntu-22.04 -- bash /mnt/c/tw/app/scripts/doi-ten-mien.sh --lui    # lùi về như cũ
#
# (Từ Git Bash phải đặt MSYS_NO_PATHCONV=1 trước lệnh wsl.)
#
# ĐỔI GÌ
#
#   toolswave.net       Portal (cổng 4000)  →  App    (cổng 4090)
#   app.toolswave.net   App    (cổng 4090)  →  Portal (cổng 4000)
#   api.toolswave.net   Backend(cổng 4001)  →  API    (cổng 4091)
#   apia.toolswave.net  API    (cổng 4091)  →  Backend(cổng 4001)
#   cms.toolswave.net   CRM    (nginx :80)  →  Quản trị (cổng 4090)
#   aapp.toolswave.net  Quản trị(cổng 4090) →  CRM    (nginx :80)
#
# KHÔNG ĐỤNG TỚI subdomain app người dùng (msnede.toolswave.net…) — chúng đi qua tunnel riêng.
# KHÔNG ĐỔI biến DOMAIN_GOC: đó là gốc để CẤP subdomain cho app người dùng, không liên quan tới
# việc trang chính nằm ở tên miền nào. Đổi nhầm là hỏng toàn bộ app đã deploy.
#
# VÌ SAO PHẢI BUILD LẠI, KHÔNG CHỈ ĐỔI BIẾN
#
# Next.js nhúng mọi biến NEXT_PUBLIC_* vào bundle JavaScript lúc BUILD, không đọc lúc chạy. Vite
# cũng vậy với VITE_*. Đổi .env rồi restart là KHÔNG có tác dụng — trình duyệt vẫn gọi địa chỉ cũ.
# Đo được: bundle portal đang chạy nhúng "https://api.toolswave.net" 235 lần.
#
# THỨ TỰ: build TRƯỚC, đổi tuyến SAU. Lùi tuyến mất 10 giây (chép lại config.yml + reload), còn
# lùi một bản build hỏng thì đắt. Build hỏng ở bước 2 thì dừng, chưa ai bị ảnh hưởng.
set -uo pipefail

CHE_DO="${1:-xem}"
MAY_CHU="${DEPLOY_HOST:-100.100.164.92}"
export PATH="$HOME/ts:$PATH"
SOCK="$HOME/ts/ts.sock"

ssh_may_chu() { tailscale --socket="$SOCK" ssh "root@${MAY_CHU}" "$@"; }
buoc() { echo; echo "===== $* ====="; }

A_ENV=/home/app/toolswave/.env
B_ENV=/var/www/toolswave/backend/.env
CF=/etc/cloudflared/config.yml

# ── LÙI ────────────────────────────────────────────────────────────────────────
if [ "$CHE_DO" = "--lui" ]; then
  buoc "LÙI: khôi phục bản sao lưu mới nhất"
  ssh_may_chu 'bash -s' <<'REMOTE'
set -uo pipefail
for f in /etc/cloudflared/config.yml /home/app/toolswave/.env /var/www/toolswave/backend/.env; do
  b=$(ls -1t "$f".bak.* 2>/dev/null | head -1)
  if [ -n "$b" ]; then cp -a "$b" "$f" && echo "  khôi phục $f  ←  $b"; else echo "  !! không có bản lưu cho $f"; fi
done
# reload KHÔNG có tác dụng: unit cloudflared có ExecReload rỗng, systemd báo thành công rồi
# thôi còn tuyến vẫn y nguyên. Đo ngày 22/09: sau "reload", sáu tên miền vẫn trỏ cổng cũ.
# Trả server_name của CRM về cms. Không làm thì lùi xong cms -> :80 nhưng nginx chỉ còn biết
# tên aapp, và CRM chết đúng lúc đang chữa cháy.
SA=/etc/nginx/sites-available; SE=/etc/nginx/sites-enabled
if [ -L "$SE/aapp.toolswave.net" ]; then
  rm -f "$SE/aapp.toolswave.net"; ln -sfn "$SA/cms.toolswave.net" "$SE/cms.toolswave.net"
  nginx -t >/dev/null 2>&1 && systemctl reload nginx && echo "  nginx: CRM trả về tên cms.toolswave.net"
fi
systemctl restart cloudflared && echo "  đã khởi động lại cloudflared"
systemctl restart toolswave-api toolswave-web toolswave-web2 && echo "  đã khởi động lại hệ A"
su - deveris -c 'pm2 restart all' >/dev/null 2>&1 && echo "  đã khởi động lại hệ B"
REMOTE
  echo
  echo "Đã lùi. Lưu ý: bản BUILD vẫn là bản mới (dựng theo tên miền mới)."
  echo "Muốn sạch hẳn thì build lại sau khi .env đã về như cũ."
  exit 0
fi

# ── XEM TRƯỚC ─────────────────────────────────────────────────────────────────
buoc "TRẠNG THÁI HIỆN TẠI"
ssh_may_chu "grep -A1 -E 'hostname: (toolswave|app|api|apia|cms|aapp)\.toolswave\.net' $CF | grep -E 'hostname|service' | sed 's/^/  /'"

if [ "$CHE_DO" != "--lam" ]; then
  echo
  echo "Đây là chế độ XEM TRƯỚC — chưa đổi gì."
  echo "Chạy lại với  --lam  để thực hiện."
  exit 0
fi

# ── THỰC HIỆN ─────────────────────────────────────────────────────────────────
buoc "0/6 sao lưu"
ssh_may_chu "TS=\$(date +%Y%m%d%H%M%S); for f in $A_ENV $B_ENV $CF; do cp -a \"\$f\" \"\$f.bak.\$TS\" && echo \"  \$f.bak.\$TS\"; done"

buoc "0b/6 cổng chặn hệ A (không restart khi còn việc của người dùng)"
ssh_may_chu 'bash -s' <<'REMOTE'
cd /home/app/toolswave/apps/api || exit 0
set -a; . /home/app/toolswave/.env; set +a
n=$(node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();Promise.all([p.build.count({where:{status:{in:['running','queued']}}}),p.maicRun.count({where:{closedAt:null}})]).then(([b,m])=>{console.log(b+m)}).catch(()=>console.log(-1))")
if [ "$n" = "0" ] || [ "$n" = "-1" ]; then echo "  sạch (n=$n), đi tiếp"; else echo "  !! còn $n việc đang chạy — DỪNG"; exit 1; fi
REMOTE
[ $? -ne 0 ] && { echo "!! cổng chặn không cho đi tiếp"; exit 1; }

buoc "1/6 đổi biến môi trường"
ssh_may_chu 'bash -s' <<'REMOTE'
set -uo pipefail
dat() {  # $1=file $2=KEY $3=value
  KEY="$2" VAL="$3" python3 - "$1" <<'PY'
import os, sys
p, key, val = sys.argv[1], os.environ['KEY'], os.environ['VAL']
noi_dung = open(p, encoding='utf-8').read()
# Tệp không kết thúc bằng xuống dòng thì dòng nối thêm sẽ DÍNH vào đuôi dòng cuối. Đo ngày
# 22/09: GOOGLE_REDIRECT_URI thành ".../callbackWEB_PUBLIC_URL=https://toolswave.net", Google
# trả redirect_uri_mismatch nên không ai đăng nhập được — mà .env hỏng kiểu này không báo lỗi.
if noi_dung and not noi_dung.endswith('\n'):
    noi_dung += '\n'
lines = noi_dung.split('\n')
for i, l in enumerate(lines):
    if l.startswith(key + '='):
        lines[i] = f'{key}={val}'; break
else:
    lines.append(f'{key}={val}')
ra = '\n'.join(lines)
open(p, 'w', encoding='utf-8').write(ra if ra.endswith('\n') else ra + '\n')
print(f'  {key} = {val}')
PY
}
A=/home/app/toolswave/.env
B=/var/www/toolswave/backend/.env
echo " hệ A:"
dat "$A" CORS_ORIGINS "https://toolswave.net,https://cms.toolswave.net"
dat "$A" NEXT_PUBLIC_API_BASE "https://api.toolswave.net"
# Trước đây để TRỐNG nên mã dùng mặc định ghi cứng trong config/env.ts (apia...). Đặt tường minh.
dat "$A" GOOGLE_REDIRECT_URI "https://api.toolswave.net/v1/auth/google/callback"
echo " hệ B:"
dat "$B" FRONTEND_URL "https://app.toolswave.net"
dat "$B" ADMIN_URL "https://aapp.toolswave.net"
OLD=$(grep -m1 '^GOOGLE_CALLBACK_URL=' "$B" | cut -d= -f2-)
dat "$B" GOOGLE_CALLBACK_URL "$(echo "$OLD" | sed 's|//api\.toolswave\.net|//apia.toolswave.net|')"
REMOTE

buoc "2/6 build hệ A (chưa restart — chưa ai bị ảnh hưởng)"
ssh_may_chu "runuser -u app -- bash -lc 'cd /home/app/toolswave && bash deploy/deploy.sh'" || {
  echo "!! build hệ A hỏng — DỪNG. Chưa đổi tuyến nên website vẫn chạy bản cũ."; exit 1; }

buoc "3/6 build hệ B (portal + crm)"
echo "  ⚠ BƯỚC NÀY CẦN LÀM TAY — xem ghi chú cuối file."
echo "  Máy chủ KHÔNG có mã nguồn hệ B (chỉ có .next, node_modules, public),"
echo "  nên phải build từ máy có mã rồi chép .next và crm/dist lên."

buoc "4/6 đổi tuyến"
ssh_may_chu 'bash -s' <<'REMOTE'
set -uo pipefail
python3 - /etc/cloudflared/config.yml <<'PY'
import re, sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
doi = {
  'toolswave.net':      '4090',
  'api.toolswave.net':  '4091',
  'cms.toolswave.net':  '4090',
  'app.toolswave.net':  '4000',
  'apia.toolswave.net': '4001',
  'aapp.toolswave.net': '80',
}
n = 0
for host, port in doi.items():
    # Chỉ khớp ĐÚNG hostname đó, rồi đổi dòng service NGAY SAU nó.
    pat = re.compile(r'(- hostname: ' + re.escape(host) + r'\s*\n\s*service: http://(?:localhost|127\.0\.0\.1):)(\d+)')
    s, k = pat.subn(lambda m: m.group(1) + port, s)
    if k: n += k
    print(f'  {host:22s} -> {port}  ({"đổi" if k else "KHÔNG THẤY"})')
open(p, 'w', encoding='utf-8').write(s)
print(f'  tổng: {n} dòng đã đổi')
PY
# reload KHÔNG có tác dụng: unit cloudflared có ExecReload rỗng, systemd báo thành công rồi
# thôi còn tuyến vẫn y nguyên. Đo ngày 22/09: sau "reload", sáu tên miền vẫn trỏ cổng cũ.
systemctl restart cloudflared && echo "  đã khởi động lại cloudflared"
REMOTE

buoc "4b/6 đổi server_name của nginx cho CRM"
# CRM là file tĩnh do nginx phục vụ ở cổng 80, và nginx chọn khối theo TÊN MIỀN chứ không theo
# cổng. Đổi tuyến cloudflared cho aapp -> :80 là CHƯA ĐỦ: khối CRM vẫn khai `server_name
# cms.toolswave.net` nên aapp không khớp tên nào và rơi vào trang mặc định "Welcome to nginx".
# Đúng lỗi gặp ngày 22/09.
ssh_may_chu 'bash -s' <<'REMOTE'
set -uo pipefail
SA=/etc/nginx/sites-available; SE=/etc/nginx/sites-enabled
[ -f "$SA/cms.toolswave.net" ] || { echo "  !! không thấy $SA/cms.toolswave.net"; exit 0; }
cp -a "$SA/cms.toolswave.net" "$SA/cms.toolswave.net.bak.$(date +%Y%m%d%H%M%S)"
sed 's/server_name cms.toolswave.net;/server_name aapp.toolswave.net;/'   "$SA/cms.toolswave.net" > "$SA/aapp.toolswave.net"
rm -f "$SE/cms.toolswave.net"
ln -sfn "$SA/aapp.toolswave.net" "$SE/aapp.toolswave.net"
if nginx -t >/dev/null 2>&1; then
  systemctl reload nginx && echo "  nginx: CRM giờ trả lời tên aapp.toolswave.net"
else
  echo "  !! nginx -t hỏng — lùi lại"; rm -f "$SE/aapp.toolswave.net"
  ln -sfn "$SA/cms.toolswave.net" "$SE/cms.toolswave.net"; exit 1
fi
REMOTE

buoc "5/6 khởi động lại hai hệ"
ssh_may_chu "systemctl restart toolswave-api toolswave-web toolswave-web2; sleep 3; systemctl is-active toolswave-api toolswave-web toolswave-web2 | tr '\n' ' '; echo; su - deveris -c 'pm2 restart all' >/dev/null 2>&1 && echo '  hệ B đã khởi động lại'"

buoc "6/6 kiểm tra"
for u in https://toolswave.net https://app.toolswave.net https://api.toolswave.net/v1/health https://apia.toolswave.net https://cms.toolswave.net https://aapp.toolswave.net https://msnede.toolswave.net; do
  printf '  %-42s ' "$u"
  curl -s -o /dev/null -w '%{http_code}\n' --max-time 20 "$u"
done

echo
echo "XONG. Còn hai việc:"
echo "  1. Sửa 22 ảnh blog:  node scripts/blog-fix-image-host.mjs"
echo "  2. Build lại hệ B (bước 3) nếu chưa làm."
echo
echo "Hỏng thì lùi:  bash scripts/doi-ten-mien.sh --lui"
