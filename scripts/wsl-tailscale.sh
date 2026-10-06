#!/usr/bin/env bash
if [ "${ALLOW_DEPLOY:-}" != "1" ]; then echo "Chặn: script này vẫn trỏ vào hạ tầng Toolswave. Phase deploy chưa làm — đặt ALLOW_DEPLOY=1 khi đã đổi đích." >&2; exit 1; fi
# Đưa máy Windows vào tailnet mà KHÔNG cần quyền quản trị — chạy trong WSL2.
#
# VÌ SAO PHẢI ĐI ĐƯỜNG NÀY. Trên Windows, Tailscale không cài được nếu không có quyền quản trị:
#
#   winget                        không có trên máy
#   trình cài .msi/.exe           cần quản trị (cài dịch vụ + card mạng ảo)
#   giải nén msi rồi chạy tay     giải nén ĐƯỢC (`msiexec /a`), nhưng tailscaled vẫn chết:
#                                 nó tạo named pipe dưới \\.\pipe\ProtectedPrefix\Administrators\
#                                 → "Access is denied"; ép sang pipe khác thì
#                                 → "This security ID may not be assigned as the owner"
#                                 Nó gán chủ sở hữu pipe là nhóm Administrators, cứng trong mã.
#
# Trong WSL2 thì khác: Linux cho chạy userspace-networking bằng quyền người dùng thường, socket là
# một file unix trong thư mục nhà. Không cần root, không cài gói, không đụng gì vào hệ thống.
#
# Và đây cũng đúng chỗ deploy vốn phải chạy: deploy/ci-deploy.sh cần rsync + sshpass, mà tài liệu
# đã nói rõ Git Bash không có hai thứ đó một cách đáng tin.
#
# Dùng:
#   wsl -d Ubuntu-22.04 -- bash /mnt/c/tw/app/scripts/wsl-tailscale.sh          # dựng + lấy link
#   wsl -d Ubuntu-22.04 -- bash /mnt/c/tw/app/scripts/wsl-tailscale.sh status   # xem đã vào chưa
set -u

TS_DIR="$HOME/ts"
SOCK="$TS_DIR/ts.sock"
VER="${TS_VERSION:-1.102.4}"

ts() { "$TS_DIR/tailscale" --socket="$SOCK" "$@"; }

if [ "${1:-up}" = "status" ]; then
  ts status 2>&1 | head -20
  echo "--- tới được máy chủ chưa ---"
  if ping -c1 -W3 "${DEPLOY_HOST:-100.100.164.92}" >/dev/null 2>&1; then
    echo "  ĐƯỢC"
  else
    echo "  CHƯA (có thể chưa xác thực xong, hoặc route chưa nhận)"
  fi
  exit 0
fi

mkdir -p "$TS_DIR/state"

if [ ! -x "$TS_DIR/tailscaled" ]; then
  echo "==> tải Tailscale $VER (bản tĩnh, không cài gói)"
  curl -fsSL --max-time 300 "https://pkgs.tailscale.com/stable/tailscale_${VER}_amd64.tgz" -o "$TS_DIR/ts.tgz"
  tar xzf "$TS_DIR/ts.tgz" -C "$TS_DIR" --strip-components=1
  chmod +x "$TS_DIR/tailscale" "$TS_DIR/tailscaled"
fi

if ! pgrep -f "tailscaled --tun=userspace" >/dev/null 2>&1; then
  echo "==> khởi động tailscaled (userspace, không root)"
  # SOCKS5 ở 1055: công cụ nào cần đi qua tailnet thì trỏ proxy vào đó, vì userspace-networking
  # KHÔNG đổi bảng định tuyến của hệ thống — đó chính là lý do nó chạy được mà không cần root.
  nohup setsid "$TS_DIR/tailscaled" \
    --tun=userspace-networking \
    --socket="$SOCK" \
    --statedir="$TS_DIR/state" \
    --socks5-server=localhost:1055 \
    --outbound-http-proxy-listen=localhost:1056 \
    >"$TS_DIR/d.log" 2>&1 &
  sleep 5
fi

if ts status >/dev/null 2>&1 && ! ts status 2>&1 | grep -qi "stopped\|logged out"; then
  echo "==> đã ở trong tailnet rồi"
  ts status | head -5
  exit 0
fi

echo "==> xin link đăng nhập"
nohup setsid "$TS_DIR/tailscale" --socket="$SOCK" up \
  --hostname="${TS_HOSTNAME:-tw-windows-release}" --accept-routes \
  >"$TS_DIR/up.log" 2>&1 &
sleep 5
URL=$(grep -o 'https://login.tailscale.com/a/[a-z0-9]*' "$TS_DIR/up.log" | head -1)
if [ -n "$URL" ]; then
  echo "$URL"
  echo "(mở link này để xác thực; tiến trình đang chờ sẵn)"
else
  echo "không lấy được link — xem $TS_DIR/up.log"
  tail -5 "$TS_DIR/up.log"
fi

# ── SAU KHI VÀO ĐƯỢC TAILNET: chạy lệnh và đẩy file thế nào ──────────────────
#
# `tailscale ssh` dùng được ngay, KHÔNG cần mật khẩu — xác thực bằng danh tính tailnet:
#
#   export PATH="$HOME/ts:$PATH"        # BẮT BUỘC, xem lý do bên dưới
#   tailscale --socket=$HOME/ts/ts.sock ssh root@100.100.164.92 "lệnh"
#
# PATH là bắt buộc vì `tailscale ssh` shell ra `ssh` với ProxyCommand="tailscale nc". Không có
# binary trên PATH thì ProxyCommand chết với "tailscale: command not found" và kết nối đứt giữa
# chừng — thông báo lỗi không hề nhắc tới PATH.
#
# ĐẨY FILE: dùng tar qua chính kênh ssh, ĐỪNG dùng rsync -e.
#
#   tar czf - --exclude=.git --exclude=node_modules --exclude=dist --exclude=.next #     --exclude=.workspace --exclude=.artifacts --exclude='*.env' --exclude=prompts.chat . #   | tailscale --socket=$HOME/ts/ts.sock ssh root@100.100.164.92 #       "tar xzf - -C /home/app/toolswave"
#
# Vì sao không rsync: `rsync -e "<lệnh>"` gọi lệnh đó theo kiểu ssh — `<rsh> [-l user] <host> …`.
# `tailscale ssh` không nhận `-l` nên chết ngay ở "Failed to exec -l". Viết lớp đệm dịch `-l user`
# thành `user@host` thì qua được chỗ đó, nhưng lại vấp tiếp ProxyCommand: PATH không truyền xuống
# tiến trình con mà ssh sinh ra, nên export trong lớp đệm cũng vô ích. Đã thử cả hai, cùng tắc.
#
# LOẠI TRỪ MỌI FILE .env: máy chủ giữ .env riêng với toàn bộ khoá thật. Đè lên là hỏng cả hệ thống
# và không có bản sao nào ở đây để khôi phục.
#
# NHỚ KIỂM CỔNG CHẶN TRƯỚC KHI DEPLOY — deploy/ci-deploy.sh dựng nó lên vì một sự cố có thật:
# năm lượt chạy của người dùng bị giết đúng ở năm mốc deploy. Đếm build đang chạy và lượt MAIC còn
# mở, cả hai phải bằng 0.
