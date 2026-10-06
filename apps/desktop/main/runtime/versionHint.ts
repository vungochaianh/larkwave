import { app } from 'electron';

/**
 * "Bản cài của bạn đã cũ" — nói cho ĐÚNG CHỖ người dùng đang gặp lỗi.
 *
 * Vì sao cần: bản sửa cho phần LÕI (main process) chỉ tới được người dùng qua một bản cài mới;
 * code-push chỉ thay được giao diện. Nên có những lỗi mà agent thử bao nhiêu lần cũng hỏng, trong
 * khi bản sửa đã nằm sẵn trên máy chủ từ lâu. Trước đây thông tin đó chỉ nằm trong màn "phiên bản"
 * — người dùng phải tự mở mới thấy, mà đang bí thì không ai đi mở.
 *
 * Cờ `reinstall` của codePush KHÔNG dùng được cho việc này: nó chỉ bật khi `minMain > bản đang cài`
 * (tức renderer mới KHÔNG chạy nổi trên lõi cũ). Một bản vá lõi phát hành mà vẫn giữ nguyên minMain
 * — đúng cách phát hành 1.0.284 — cho `reinstall = false`, dù đó chính là bản chứa bản sửa. Ở đây ta
 * so `latestVersion` với bản đang chạy, đó mới là câu hỏi "có bản mới hơn không".
 */

export interface VersionSnapshot {
  /** Bản đang chạy (main process). */
  current: string;
  /** Bản cài mới nhất máy chủ đang quảng bá. */
  latest?: string;
  /** Bản gần nhất có thay đổi phần LÕI — bản sửa lõi chỉ tới được qua bản cài, không qua code-push. */
  mainChangedAt?: string;
  notice?: string;
  /** latest > current. */
  hasNewer: boolean;
  /** Có thay đổi lõi trong khoảng (current, latest] → cài lại mới thật sự nhận được bản sửa. */
  mainFixPending: boolean;
}

/** So sánh kiểu semver rút gọn: 1 nếu a>b, -1 nếu a<b, 0 nếu bằng. */
function cmp(a: string, b: string): number {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

/**
 * Hình dạng tối thiểu cần để dựng ảnh chụp. KHÔNG import từ `codePush` — chiều ngược lại đã có
 * (background nạp sẵn ảnh chụp SAU khi codePush lấy manifest), và một vòng import vòng tròn ở
 * main process là đúng thứ từng làm app trắng màn hình khi một hằng số hoá ra `undefined`.
 */
export interface VersionFacts {
  latestVersion?: string;
  mainChangedAt?: string;
  notice?: string;
}

/** Bao lâu thì hỏi lại máy chủ. Đủ lâu để không thành một vòng lặp mạng, đủ ngắn để cùng phiên vẫn kịp. */
const TTL_MS = 30 * 60_000;
/** Khi CHƯA lấy được manifest thì thử lại sớm hơn nhiều — nhưng vẫn phải có hạn, xem `store`. */
const RETRY_MS = 2 * 60_000;

let cached: VersionSnapshot | null = null;
let cachedUntil = 0;
let inflight: Promise<VersionSnapshot> | null = null;

/**
 * Ghi ảnh chụp kèm HẠN DÙNG.
 *
 * Hai cái bẫy ở đây, đều đã sập một lần:
 * 1. `fetchManifest` KHÔNG BAO GIỜ ném — mất mạng thì nó trả `null`. Nếu cứ thế ghi đè, một lần
 *    hỏng sẽ XOÁ ảnh chụp tốt và ghim "không có bản mới" suốt 30 phút — đúng lúc tool hỏng nhiều
 *    nhất thì agent lại im. Nên: hỏng thì GIỮ ảnh chụp cũ (last-known-good).
 * 2. Nhưng cũng không được bỏ hạn dùng đi: `versionNote()` được await ngay trên mỗi tool hỏng, mà
 *    fetch có timeout 5s — không có hạn thì mỗi tool hỏng cộng thêm 5 giây chờ, lặp mãi. Nên ca
 *    hỏng vẫn được đóng dấu, chỉ là hạn ngắn (RETRY_MS).
 */
function store(snap: VersionSnapshot, fresh: boolean): void {
  cached = snap;
  cachedUntil = Date.now() + (fresh ? TTL_MS : RETRY_MS);
}

function currentVersion(): string {
  // `app` không sẵn sàng trong test/harness → đừng để việc lấy phiên bản làm hỏng một lượt chat.
  try {
    return app.getVersion();
  } catch {
    return '0.0.0';
  }
}

function build(m: VersionFacts | null): VersionSnapshot {
  const current = currentVersion();
  const latest = m?.latestVersion;
  // Manifest phát hành TRƯỚC tính năng này không có `mainChangedAt`. Lùi về `latestVersion` là
  // đúng chứ không phải đoán bừa: push-renderer chỉ nâng `latestVersion` khi phát hành kèm
  // `--main-change` (scripts/push-renderer.mjs), tức mọi bản cài mới hơn theo định nghĩa đều có
  // đổi phần lõi. Khi manifest có trường tường minh thì trường đó thắng.
  const mainChangedAt = m?.mainChangedAt || m?.latestVersion;
  const hasNewer = !!latest && cmp(latest, current) > 0;
  // Bản vá lõi chỉ đáng nhắc khi nó nằm SAU bản đang cài — mainChangedAt cũ hơn nghĩa là lõi của ta
  // đã có nó rồi.
  const mainFixPending = hasNewer && !!mainChangedAt && cmp(mainChangedAt, current) > 0;
  return { current, latest, mainChangedAt, notice: m?.notice, hasNewer, mainFixPending };
}

/**
 * Ảnh chụp phiên bản, có nhớ đệm. KHÔNG BAO GIỜ ném: một lượt chat không được hỏng chỉ vì
 * không hỏi được máy chủ phát hành.
 */
export async function versionSnapshot(): Promise<VersionSnapshot> {
  if (cached && Date.now() < cachedUntil) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      // Nạp muộn để KHÔNG tạo vòng import tĩnh với codePush (xem VersionFacts).
      const { fetchManifest } = await import('../codePush');
      const m = await fetchManifest();
      if (m?.latestVersion) store(build(m), true);
      else if (!cached) store(build(null), false);
      else store(cached, false); // giữ last-known-good, chỉ hẹn thử lại sớm
    } catch {
      if (!cached) store(build(null), false);
      else store(cached, false);
    }
    inflight = null;
    return cached as VersionSnapshot;
  })();
  return inflight;
}

/**
 * Nạp sẵn từ manifest ai đó vừa lấy — khỏi gọi mạng lần nữa.
 *
 * Bỏ qua khi không có dữ liệu thật: gọi vô điều kiện (kể cả lúc mất mạng, khi `resolveRenderer`
 * trả về info rỗng mà KHÔNG ném) sẽ xoá mất ảnh chụp tốt — đúng lỗi ở `store`.
 */
export function primeVersionSnapshot(m: VersionFacts | null): void {
  if (m?.latestVersion) store(build(m), true);
  else if (!cached) store(build(null), false);
}

/**
 * Đoạn ghi chú gắn vào một lỗi tool, viết cho MODEL đọc.
 *
 * Chỉ nói khi thật sự có bản mới hơn — im lặng là mặc định. Và nói theo lối "có thể", vì ta không
 * biết chắc lỗi này có nằm trong bản vá kia hay không; khẳng định chắc chắn sẽ thành nói dối
 * đúng vào lúc người dùng đang cần tin mình nhất.
 */
let lastNoteAt = 0;
/** Nhắc lại sớm nhất sau bằng này. Một lượt hỏng 5 tool thì chỉ lần đầu mang ghi chú. */
const NOTE_COOLDOWN_MS = 2 * 60_000;

export async function toolFailureVersionNote(): Promise<string> {
  const v = await versionSnapshot().catch(() => null);
  if (!v?.hasNewer) return '';
  // Một lượt có thể hỏng nhiều tool liên tiếp; nhắc lại mỗi lần chỉ tổ chiếm ngữ cảnh và làm
  // model bám vào chuyện phiên bản thay vì việc người dùng hỏi.
  const now = Date.now();
  if (now - lastNoteAt < NOTE_COOLDOWN_MS) return '';
  lastNoteAt = now;
  const what = v.mainFixPending
    ? `Bản ${v.latest} có sửa phần LÕI của ứng dụng — những sửa đó CHỈ tới được qua bản cài mới, không tự cập nhật được.`
    : `Đã có bản ${v.latest} mới hơn.`;

  return (
    `\n\n[THÔNG TIN PHIÊN BẢN — dành cho bạn, hãy nói lại cho người dùng nếu có liên quan] ` +
    `Bản CÀI (phần lõi) đang chạy là ${v.current} — lưu ý số hiện ở cuối thanh bên là bản GIAO DIỆN, ` +
    `hai số này có thể khác nhau. ${what} ` +
    `Nếu lỗi trên có vẻ là lỗi của ỨNG DỤNG, hãy NÓI RÕ cho người dùng: có bản ${v.latest}, lỗi này ` +
    `CÓ THỂ đã được sửa ở đó, và tải bản cài mới tại https://toolswave.net/download ` +
    `(hoặc bấm vào số phiên bản ở CUỐI THANH BÊN rồi chọn "Tải bản cài mới"). ` +
    `HAI ĐIỀU KHÔNG ĐƯỢC LÀM: (1) đừng nói chắc chắn là đã sửa — chỉ nói "có thể"; ` +
    `(2) nếu lỗi rõ ràng là do DỮ LIỆU, QUYỀN, hay tham số gọi sai thì ĐỪNG nhắc phiên bản, ` +
    `hãy sửa lời gọi rồi thử lại — đổ cho bản cũ trong trường hợp đó là đánh lạc hướng người dùng.`
  );
}

/**
 * Một dòng cho system prompt, để agent biết mình đang chạy bản nào ngay cả khi không có lỗi nào.
 *
 * CHỈ đọc ảnh chụp đã có, KHÔNG gọi mạng: dòng này nằm trên đường dựng prompt của MỌI lượt chat,
 * kể cả lượt hoàn toàn khoẻ mạnh — chờ mạng ở đây là bắt người dùng trả giá cho một thông tin phụ.
 * Ảnh chụp đã được nạp sẵn lúc khởi động và mỗi lần kiểm tra cập nhật (xem codePush.resolveRenderer).
 */
export function versionPromptLine(): string {
  const v = cached;
  if (!v) return '';
  // Không hỏi được máy chủ thì KHÔNG được nói "mới nhất" — đó là khẳng định một điều mình không
  // biết, trong đúng tính năng có nhiệm vụ nói thật về phiên bản.
  if (!v.latest) return `PHIÊN BẢN: ứng dụng đang chạy bản ${v.current}.`;
  if (!v.hasNewer) return `PHIÊN BẢN: ứng dụng đang chạy bản ${v.current} (mới nhất).`;
  return (
    `PHIÊN BẢN: ứng dụng đang chạy bản ${v.current}, đã có bản ${v.latest}` +
    (v.mainFixPending ? ' (có sửa phần lõi — chỉ nhận được khi cài lại)' : '') +
    '. Khi một việc hỏng theo kiểu LỖI ỨNG DỤNG (không phải do dữ liệu/quyền/tham số), hãy nhắc ' +
    'người dùng tải bản cài mới tại https://toolswave.net/download — đừng chỉ xin lỗi rồi thôi.'
  );
}
