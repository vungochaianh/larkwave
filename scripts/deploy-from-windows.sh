#!/usr/bin/env bash
if [ "${ALLOW_DEPLOY:-}" != "1" ]; then echo "Chặn: script này vẫn trỏ vào hạ tầng Toolswave. Phase deploy chưa làm — đặt ALLOW_DEPLOY=1 khi đã đổi đích." >&2; exit 1; fi
# Deploy lên máy chủ TỪ MÁY WINDOWS, chạy trong WSL2.
#
#   wsl -d Ubuntu-22.04 -- bash /mnt/c/tw/app/scripts/deploy-from-windows.sh
#
# (Từ Git Bash phải đặt MSYS_NO_PATHCONV=1 trước lệnh wsl, nếu không Git Bash sẽ dịch /mnt/c/…
# thành đường dẫn Windows và wsl báo "No such file or directory".)
#
# Trước đây tài liệu bàn giao ghi "chỉ máy Mac deploy được". Điều đó đúng khi deploy phải đi qua
# deploy/ci-deploy.sh — script ấy cần rsync + sshpass + mật khẩu root, mà Git Bash không có rsync
# lẫn sshpass một cách đáng tin. Đi vòng qua WSL2 + tailnet thì cả hai ràng buộc đều biến mất:
# xác thực bằng danh tính tailnet (không mật khẩu), đẩy mã bằng git archive (không rsync).
#
# ──────────────────────────────────────────────────────────────────────────────
# VÌ SAO LÀ `git archive`, KHÔNG PHẢI `tar` THƯ MỤC LÀM VIỆC
#
# Máy Windows đặt core.autocrlf=true và repo không có .gitattributes, nên thư mục làm việc giữ
# CRLF. Đóng gói thẳng thư mục đó rồi bung trên máy chủ là chết ngay dòng đầu của deploy.sh:
#
#     set: pipefail: invalid option name
#
# vì `set -euo pipefail\r` — ký tự \r dính vào chữ cuối. Blob trong git là LF thuần (đã đo: 0 byte
# CR), nên lấy thẳng từ git là xong.
#
# CỜ `-c core.autocrlf=false` LÀ BẮT BUỘC. `git archive` có áp cấu hình autocrlf của máy: thiếu cờ
# này thì nó vẫn trả ra CRLF y như thư mục làm việc — đã đo bằng cách bung thử tarball ra xem.
#
# Lợi thêm, và là lợi lớn: git archive CHỈ xuất file đã commit, nên .env, .blog-autopost.env,
# .lark-report.env không thể lọt lên máy chủ. Máy chủ giữ .env riêng với toàn bộ khoá thật; đè lên
# là hỏng cả hệ thống và ở đây không có bản sao nào để khôi phục. Với rsync thì phải nhớ liệt kê
# đúng từng --exclude; với git archive thì an toàn theo cấu tạo, quên cũng không sai được.
#
# GIỐNG rsync Ở CHỖ KHÔNG XOÁ: bung tar đè lên chỉ ghi chồng, file đã bị xoá khỏi repo vẫn nằm lại
# trên máy chủ. Route cũ bị bỏ mà còn sót sẽ làm `next build` gãy vì hai route cùng đường dẫn —
# deploy.sh có dọn sẵn một chỗ đã từng dính, chỗ khác thì phải xoá tay.
# ──────────────────────────────────────────────────────────────────────────────
set -uo pipefail

export PATH="$HOME/ts:$PATH"   # ProxyCommand của `tailscale ssh` gọi lại `tailscale` từ PATH;
                               # thiếu thì đứt giữa chừng với lỗi không hề nhắc tới PATH.
SOCK="${TS_SOCK:-$HOME/ts/ts.sock}"
HOST="${DEPLOY_HOST:-100.100.164.92}"
REPO="${REPO_DIR:-/mnt/c/tw/app}"
TARBALL="$(mktemp -t tw-src-XXXXXX.tar.gz)"
MANIFEST="$(mktemp -t tw-files-XXXXXX.txt)"
trap 'rm -f "$TARBALL" "$MANIFEST"' EXIT

tssh() { tailscale --socket="$SOCK" ssh "root@${HOST}" "$@"; }
step() { echo; echo "===== $* ====="; }

step "0/5 đóng gói từ git (LF thuần, không kèm file chưa commit)"
cd "$REPO" || { echo "!! không vào được $REPO"; exit 1; }
# HÀM, KHÔNG PHẢI BIẾN CHUỖI. `GIT="git -c safe.directory=*"` rồi gọi `$GIT diff` là hỏng: shell
# bung dấu * thành danh sách file trong thư mục hiện tại trước khi git kịp thấy, và lệnh thành rác.
# Nguy ở chỗ nó hỏng LẶNG: git thoát khác 0 vì cú pháp sai, mà cổng bên dưới đọc "khác 0" thành
# "có thay đổi chưa commit", nên nó chặn một cây làm việc sạch và báo sai hẳn nguyên nhân.
# safe.directory: git trong WSL nhìn repo trên /mnt/c thấy chủ sở hữu khác nên từ chối chạy.
g() { git -c "safe.directory=*" "$@"; }

g rev-parse --short HEAD | sed 's/^/     HEAD: /'

# HAI CỜ NGƯỢC NHAU, CỐ Ý, và đừng "sửa cho nhất quán":
#
#   • so sánh (ngay dưới) cần core.autocrlf=TRUE
#   • đóng gói (archive)   cần core.autocrlf=FALSE
#
# Vì git trong WSL không thừa hưởng autocrlf=true của người dùng Windows, trong khi thư mục làm
# việc trên /mnt/c lại đã được git bên Windows chép ra dạng CRLF. Để mặc thì WSL đem CRLF so với
# blob LF và báo MỌI file đều đổi — cổng bên dưới chặn oan một cây sạch. Đo trên máy này: để mặc
# ra hơn 400 file "đã đổi", thêm -c core.autocrlf=true ra đúng 0.
#
# Còn khi đóng gói thì phải lấy đúng blob LF, nên ở đó là false. Hai chỗ khác nhau vì hỏi hai câu
# khác nhau: "cây làm việc có khác HEAD không" và "nội dung chuẩn trong git là gì".
if ! g -c core.autocrlf=true diff --quiet || ! g -c core.autocrlf=true diff --cached --quiet; then
  echo "!! thư mục làm việc còn thay đổi CHƯA COMMIT — git archive sẽ BỎ QUA chúng."
  echo "   Commit rồi chạy lại, nếu không bản lên máy chủ sẽ khác bản đang sửa ở đây."
  g -c core.autocrlf=true status --short | head -20
  exit 1
fi
g -c core.autocrlf=false archive --format=tar HEAD | gzip -c > "$TARBALL" || { echo "!! đóng gói hỏng"; exit 1; }
echo "     $(du -h "$TARBALL" | cut -f1)"
# Canh lại chính thứ vừa nói ở trên, vì đây là lỗi im lặng: tarball vẫn bung được, chỉ có script
# là không chạy. Thà dừng ở đây còn hơn để máy chủ nuốt một deploy.sh đầy \r.
if [ "$(tar xzf "$TARBALL" -O deploy/deploy.sh | tr -cd '\r' | wc -c)" != "0" ]; then
  echo "!! deploy.sh trong gói còn ký tự CR — máy chủ sẽ chết ở 'set: pipefail: invalid option name'"
  exit 1
fi

step "1/5 đẩy mã nguồn"
if ! gzip -dc "$TARBALL" | tssh "tar xf - -C /home/app/toolswave && chown -R app:app /home/app/toolswave && echo OK"; then
  echo "!! đẩy mã thất bại — dừng, chưa đụng tới phần build"; exit 1
fi

step "1b/5 dọn file nguồn đã bị xoá khỏi repo"
# ──────────────────────────────────────────────────────────────────────────────
# VÌ SAO PHẢI DỌN TAY: bung tar (và rsync không có --delete, y như nhau) chỉ GHI CHỒNG. File đã bị
# xoá hoặc đổi tên trong repo vẫn nằm nguyên trên máy chủ, và `next build` quét CẢ THƯ MỤC chứ
# không chỉ những file được nhắc tới — nên một file mồ côi vẫn được biên dịch.
#
# Đã trả giá đúng lần này: đổi tên khu làm việc hai lượt (/claude → /wave → /edualc) để lại cả ba
# thế hệ cùng lúc trên máy chủ. Hai bản cũ vẫn import token màu đã bị xoá khỏi theme.ts, build gãy
# ngay, trong khi ở máy này mọi thứ xanh vì máy này KHÔNG có file mồ côi nào.
#
# Cách dọn: git biết chính xác repo có những file nào, nên lấy danh sách đó làm chuẩn và xoá mọi
# file nằm ngoài danh sách — NHƯNG chỉ trong những thư mục do git quản lý trọn vẹn. Không đụng tới
# node_modules, .next, dist, .env, hay thư mục dữ liệu: ở đó file "không có trong git" là chuyện
# bình thường, xoá đi là hỏng máy chủ.
# ──────────────────────────────────────────────────────────────────────────────
g ls-files > "$MANIFEST" || { echo "!! không lấy được danh sách file từ git"; exit 1; }
echo "     repo có $(wc -l < "$MANIFEST") file được theo dõi"
if ! tssh "cat > /tmp/tw-manifest.txt" < "$MANIFEST"; then
  echo "!! không gửi được danh sách sang máy chủ"; exit 1
fi
tssh 'bash -s' <<'REMOTE_PRUNE'
set -uo pipefail
cd /home/app/toolswave
# CHỈ những thư mục mà mọi file trong đó đều phải có trong git.
DIRS=""
for d in apps/*/src packages/*/src scripts deploy; do [ -d "$d" ] && DIRS="$DIRS $d"; done
[ -z "$DIRS" ] && { echo "   không có thư mục nào để dọn"; exit 0; }
sort -u /tmp/tw-manifest.txt > /tmp/tw-manifest.sorted
find $DIRS -type f | sort > /tmp/tw-onserver.txt
comm -23 /tmp/tw-onserver.txt /tmp/tw-manifest.sorted > /tmp/tw-stale.txt
n=$(wc -l < /tmp/tw-stale.txt)
if [ "$n" = "0" ]; then echo "   không có file thừa"; else
  echo "   xoá $n file không còn trong repo:"
  sed 's/^/     /' /tmp/tw-stale.txt | head -40
  xargs -r rm -f < /tmp/tw-stale.txt
  find $DIRS -type d -empty -delete 2>/dev/null || true
fi
REMOTE_PRUNE
[ $? -ne 0 ] && { echo "!! dọn file thừa hỏng — DỪNG, vì build sau đó sẽ gãy vì lý do khó đoán"; exit 1; }

step "2/5 build + migrate + seed (dưới user app)"
if ! tssh "runuser -u app -- bash -lc 'cd /home/app/toolswave && bash deploy/deploy.sh'"; then
  echo "!! build thất bại — DỪNG TRƯỚC KHI RESTART."
  echo "   Bản đang chạy vẫn nguyên (.next/dist cũ không nằm trong gói), website không sao."
  exit 1
fi

step "3/5 cổng chặn: chờ build + lượt AI của người dùng kết thúc"
# Phải đo Ở ĐÂY, ngay trước restart, chứ không phải lúc gõ lệnh: từ lúc kiểm tới lúc restart mất
# vài phút, người dùng bấm dựng app trong khoảng đó thì build của họ chết. Đếm CẢ lượt MAIC còn
# mở, vì Trợ lý AI không nằm trong bảng Build.
tssh 'bash -s' <<'REMOTE_DRAIN'
set -uo pipefail
cd /home/app/toolswave/apps/api
set -a; . /home/app/toolswave/.env; set +a
deadline=$(( $(date +%s) + ${DEPLOY_DRAIN_MAX:-1800} ))
while :; do
  n=$(node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();Promise.all([p.build.count({where:{status:{in:['running','queued']}}}),p.maicRun.count({where:{closedAt:null}})]).then(([b,m])=>{console.log(b+m);process.exit(0)}).catch(()=>{console.log(-1);process.exit(0)})")
  # -1 = không hỏi được CSDL. Đi tiếp: không biết thì không được coi là "có build".
  if [ "$n" = "0" ] || [ "$n" = "-1" ]; then echo "   không còn việc nào đang chạy (n=$n)"; break; fi
  if [ "$(date +%s)" -ge "$deadline" ]; then echo "!! vẫn còn $n việc sau khi hết giờ chờ — DỪNG"; exit 1; fi
  echo "   còn $n việc đang chạy, chờ 15s…"; sleep 15
done
REMOTE_DRAIN
[ $? -ne 0 ] && { echo "!! cổng chặn không cho đi tiếp — KHÔNG restart"; exit 1; }

step "4/5 khởi động lại luân phiên"
tssh 'bash -s' <<'REMOTE'
set -uo pipefail
wait_up() {
  local url="$1" max="${2:-40}" i code
  for ((i=0; i<max; i++)); do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$url" || echo 000)
    case "$code" in 2*|3*) echo "   $url -> $code"; return 0;; esac
    sleep 1
  done
  echo "!! quá giờ chờ $url (mã cuối=$code)"; return 1
}
# api trước (một bản chạy duy nhất, cron trong tiến trình không được nhân đôi), rồi web luân phiên
# 4100 → 4102 để nginx luôn còn ít nhất một bản sống.
systemctl restart toolswave-api  && wait_up http://127.0.0.1:4101/v1/health 60 || exit 1
systemctl restart toolswave-web  && wait_up http://127.0.0.1:4100/ 40        || exit 1
systemctl restart toolswave-web2 && wait_up http://127.0.0.1:4102/ 40        || exit 1
REMOTE
[ $? -ne 0 ] && { echo "!! restart có vấn đề — xem log phía trên"; exit 1; }

step "5/5 kiểm tra cuối"
tssh 'systemctl is-active toolswave-api toolswave-web toolswave-web2; echo -n "front web 4090 -> "; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4090/; echo -n "front api 4091 -> "; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4091/v1/health'

echo; echo "===== deploy xong ====="
