/**
 * Khoá lượt AI của tiến trình chính — nay là NHIỀU LƯỢT SONG SONG, khoá theo từng hội thoại.
 *
 * Trước đây đây là khoá "một lượt AI tại một thời điểm" cho cả tiến trình: một biến `current`
 * duy nhất, và `tryAcquire` từ chối thẳng lượt thứ hai. Điều đó đúng khi Lark chỉ có một hội
 * thoại đang mở, nhưng chặn hẳn việc hỏi nhiều hội thoại cùng lúc.
 *
 * Mô hình mới: mỗi lượt giữ một khoá RIÊNG (`lark:<hội thoại>`, `relay:<hội thoại>`…). Từ chối chỉ xảy
 * ra khi (a) ĐÚNG khoá đó đang chạy — chống bấm Gửi hai lần trong cùng một hội thoại, hoặc
 * (b) đã chạm TRẦN số lượt song song. Có trần vì mỗi lượt là một tiến trình CLI thật: mở vô hạn
 * thì máy người dùng chết chứ không phải nhanh hơn.
 *
 * Giữ nguyên hai bất biến của bản cũ:
 *  - lease mang danh tính, nên một lượt sắp kết thúc KHÔNG BAO GIỜ nhả được khoá mà lượt mới vừa
 *    lấy (`release` kiểm tra leaseId);
 *  - cưỡng chế nhả thì GIẾT tiến trình con TRƯỚC rồi mới nhả — nhả suông sẽ mở khoá giao diện
 *    trong khi một CLI mồ côi vẫn đang ghi tệp.
 * Mỗi lượt nay có đồng hồ canh RIÊNG: dùng chung một timer thì lượt mới sẽ vô hiệu hoá đồng hồ
 * của lượt cũ, và một lượt treo sẽ không bao giờ bị dọn.
 */

export type LockKind = 'lark' | 'relay';

export interface LockOwner {
  kind: LockKind;
  /** Lark conversation id. */
  sessionId?: string;
  /** Human label for the blocked-tab banner. */
  label?: string;
  startedAt: number;
}

export interface Lease {
  readonly id: number;
  /** Khoá mà lease này đang giữ — để `release` tìm đúng ô mà không cần dò cả map. */
  readonly key: string;
}

type Entry = LockOwner & { leaseId: number; kill?: () => void; timer: ReturnType<typeof setTimeout> | null };

const HARD_TTL_MS = 10 * 60 * 1000; // backstop: a turn stuck longer than this is force-killed

/**
 * Trần số lượt AI chạy cùng lúc. 3 là điểm cân bằng: đủ để vừa hỏi vài hội thoại vừa chờ, mà
 * không biến máy thành ba tiến trình CLI cùng nghiến CPU. Đổi được qua biến môi trường cho người
 * dùng máy mạnh.
 */
const MAX_CONCURRENT = Math.max(1, Number(process.env.TW_MAX_CONCURRENT_TURNS) || 3);

const current = new Map<string, Entry>();
let seq = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const l of [...listeners]) {
    try {
      l();
    } catch {
      /* ignore */
    }
  }
}

/** Khoá của một lượt — theo hội thoại. */
export function lockKeyFor(owner: LockOwner): string {
  return `${owner.kind}:${owner.sessionId ?? 'default'}`;
}

/** Còn chỗ cho một lượt nữa không (dùng cho huy hiệu giao diện). */
export function hasFreeSlot(): boolean {
  return current.size < MAX_CONCURRENT;
}

export function maxConcurrent(): number {
  return MAX_CONCURRENT;
}

/**
 * Nhận khoá, hoặc null khi (a) chính hội thoại này đang chạy, hoặc (b) hết chỗ.
 * `kill` dừng tiến trình con khi bị cưỡng chế nhả (đồng hồ canh / mở khoá tay / thoát app).
 */
export function tryAcquire(owner: LockOwner, kill?: () => void): Lease | null {
  const key = lockKeyFor(owner);
  if (current.has(key)) return null; // cùng một hội thoại — chống bấm Gửi hai lần
  if (current.size >= MAX_CONCURRENT) return null; // hết chỗ
  const leaseId = ++seq;
  const entry: Entry = { ...owner, leaseId, kill, timer: null };
  entry.timer = setTimeout(() => forceRelease(key, 'timeout'), HARD_TTL_MS);
  current.set(key, entry);
  emit();
  return { id: leaseId, key };
}

/** Nhả — chỉ khi `lease` vẫn đang giữ đúng ô đó (kiểm tra danh tính). */
export function release(lease: Lease | null): void {
  if (!lease) return;
  const e = current.get(lease.key);
  if (!e || e.leaseId !== lease.id) return;
  if (e.timer) clearTimeout(e.timer);
  current.delete(lease.key);
  emit();
}

/** Mọi lượt đang chạy (bỏ phần nội bộ), để giao diện soi. */
export function owners(): LockOwner[] {
  return [...current.values()].map(({ leaseId, kill, timer, ...pub }) => {
    void leaseId;
    void kill;
    void timer;
    return pub;
  });
}

/**
 * Chủ khoá "hiện tại" — giữ lại cho những chỗ gọi cũ chỉ hiểu MỘT chủ.
 * Trả lượt bắt đầu SỚM NHẤT để thông báo có tính ổn định (không nhảy lung tung theo thứ tự Map).
 */
export function currentOwner(): LockOwner | null {
  const all = owners();
  if (!all.length) return null;
  return all.reduce((a, b) => (a.startedAt <= b.startedAt ? a : b));
}

export function onLockChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Có phải hội thoại/app này đang chạy không. */
export function isBusy(key: string): boolean {
  return current.has(key);
}

/** GIẾT tiến trình con của MỘT lượt rồi nhả khoá của nó. */
export function forceRelease(key: string, _reason: string): void {
  const e = current.get(key);
  if (!e) return;
  if (e.timer) clearTimeout(e.timer);
  if (e.kill) {
    try {
      e.kill();
    } catch {
      /* ignore */
    }
  }
  current.delete(key);
  emit();
}

/** Giết TẤT CẢ — dùng lúc thoát app và khi người dùng bấm "mở khoá" khẩn cấp. */
export function forceReleaseAll(_reason: string): void {
  for (const key of [...current.keys()]) forceRelease(key, _reason);
}
