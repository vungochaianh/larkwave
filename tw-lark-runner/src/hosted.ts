import { HeadlessRunner } from '../../apps/desktop/main/runtime/lark/headlessRunner';

/**
 * Chế độ CHẠY HỘ: một tiến trình gánh lịch tự động hoá cho NHIỀU người dùng, dùng app_secret họ
 * đã cố ý gửi lên máy chủ (model `LarkHostedRunner`).
 *
 * Khác hẳn chế độ VM một-người ở `entry.ts`: ở đó khoá nằm trong `.env` trên máy của chính người
 * dùng và không ai khác chạm tới. Ở đây tiến trình này cầm khoá của nhiều tenant cùng lúc, nên
 * mọi thứ trong file phải theo một luật: **một tenant hỏng không được kéo theo tenant khác**.
 * Một lần `throw` không bắt ở vòng lặp tenant là cả nhà cùng đứng.
 */

export interface HostedOpts {
  apiBase: string;
  serviceKey: string;
  /** Bao lâu nạp lại danh sách tenant + ký lại token (ms). Token sống 6h nên phải < 6h. */
  refreshMs: number;
  log: (level: 'info' | 'warn' | 'error', msg: string) => void;
}

interface Tenant {
  userId: string;
  appId: string;
  appSecret: string;
  accountToken: string;
  label: string;
}

/** Một tenant đang chạy: runner + token mới nhất (runner đọc qua hàm nên thay được tại chỗ). */
interface Live {
  runner: HeadlessRunner;
  token: string;
  appId: string;
  appSecret: string;
}

/**
 * Tenant này cần làm gì: dựng mới, dựng lại, hay chỉ gia hạn token?
 *
 * Tách thành hàm thuần để bài kiểm gọi ĐÚNG luật này chứ không phải một bản chép — cùng lý do
 * với `canTakeRunner` bên máy chủ. Cái giá khi sai ở đây rất cụ thể: trả 'refresh' sau khi người
 * dùng đổi app_secret thì runner ôm khoá cũ chạy tiếp và mọi lịch của họ hỏng lặng lẽ, còn trả
 * 'rebuild' khi không cần thì cứ 30 phút lại giết và dựng lại runner một lần.
 */
export function tenantAction(
  cur: { appId: string; appSecret: string } | undefined,
  next: { appId: string; appSecret: string },
): 'create' | 'rebuild' | 'refresh' {
  if (!cur) return 'create';
  // LarkClient ôm app_secret từ lúc khởi tạo, nên khoá đổi là PHẢI dựng lại — nhét token mới
  // vào không làm nó quên khoá cũ.
  if (cur.appId !== next.appId || cur.appSecret !== next.appSecret) return 'rebuild';
  return 'refresh';
}

export class HostedSupervisor {
  private readonly live = new Map<string, Live>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly o: HostedOpts) {}

  private async fetchTenants(): Promise<Tenant[]> {
    const r = await fetch(`${this.o.apiBase}/internal/lark-hosted/tenants`, {
      headers: { 'x-runner-key': this.o.serviceKey },
    });
    // 404 ở đây gần như luôn là khoá tiến trình sai, không phải đường dẫn sai — máy chủ cố ý
    // trả 404 thay vì 401 để endpoint không tự xác nhận là nó có thật.
    if (r.status === 404) throw new Error('Máy chủ từ chối (khoá tiến trình sai, hoặc chưa đặt LARK_RUNNER_SERVICE_KEY)');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = (await r.json()) as { tenants?: Tenant[] };
    return Array.isArray(j?.tenants) ? j.tenants : [];
  }

  /** Báo trạng thái một tenant về máy chủ để người dùng THẤY được ở giao diện. */
  private async report(userId: string, error: string | null): Promise<void> {
    await fetch(`${this.o.apiBase}/internal/lark-hosted/${encodeURIComponent(userId)}/status`, {
      method: 'POST',
      headers: { 'x-runner-key': this.o.serviceKey, 'content-type': 'application/json' },
      body: JSON.stringify({ error }),
    }).catch(() => undefined);
  }

  /**
   * Đưa tập tenant đang chạy về khớp với danh sách máy chủ vừa trả: thêm người mới, bỏ người đã
   * tắt, thay token cho người còn lại. Khoá đổi thì phải dựng lại runner — `LarkClient` ôm
   * app_secret từ lúc khởi tạo, nhét token mới vào không làm nó quên khoá cũ.
   */
  private async reconcile(tenants: Tenant[]): Promise<void> {
    const seen = new Set<string>();

    for (const t of tenants) {
      seen.add(t.userId);
      const cur = this.live.get(t.userId);
      const act = tenantAction(cur, t);

      if (act === 'refresh') {
        cur!.token = t.accountToken; // chỉ gia hạn token, runner đang chạy giữ nguyên
        continue;
      }
      if (act === 'rebuild' && cur) {
        cur.runner.stop();
        this.live.delete(t.userId);
        this.o.log('info', `${t.userId}: khoá đổi — dựng lại`);
      }

      const entry: Live = { runner: null as unknown as HeadlessRunner, token: t.accountToken, appId: t.appId, appSecret: t.appSecret };
      entry.runner = new HeadlessRunner({
        appId: t.appId,
        appSecret: t.appSecret,
        // Hàm, không phải chuỗi: cứ 6 giờ máy chủ ký token mới và `reconcile` thay vào đây.
        accountToken: () => entry.token,
        apiBase: this.o.apiBase,
        // Định danh ỔN ĐỊNH theo người dùng: khởi động lại tiến trình không được sinh chủ mới,
        // nếu không lease cũ còn sống 90 giây sẽ chặn chính mình.
        ownerId: `hosted-${t.userId}`,
        label: t.label || 'Larkwave chạy hộ',
        // Log của tenant nào phải kèm tên tenant đó, nếu không nhật ký chung thành vô dụng.
        log: (lvl, msg) => this.o.log(lvl, `[${t.userId}] ${msg}`),
      });

      try {
        const n = await entry.runner.pullRules();
        entry.runner.start();
        this.live.set(t.userId, entry);
        this.o.log('info', `${t.userId}: ${n} lịch (${entry.runner.enabledCount()} đang bật)`);
        await this.report(t.userId, null);
      } catch (e) {
        // Tenant này hỏng (khoá sai, tài khoản hết hạn mức…) — ghi lỗi cho người dùng tự sửa
        // rồi đi tiếp. Lần nạp sau sẽ thử lại.
        const msg = (e as Error)?.message || 'không rõ';
        this.o.log('warn', `${t.userId}: không chạy được — ${msg}`);
        await this.report(t.userId, msg);
      }
    }

    for (const [userId, l] of [...this.live]) {
      if (seen.has(userId)) continue;
      l.runner.stop();
      this.live.delete(userId);
      this.o.log('info', `${userId}: đã tắt chạy hộ — dừng`);
    }
  }

  async start(): Promise<void> {
    await this.refresh();
    this.timer = setInterval(() => void this.refresh(), this.o.refreshMs);
  }

  private async refresh(): Promise<void> {
    try {
      const tenants = await this.fetchTenants();
      await this.reconcile(tenants);
      this.o.log('info', `đang gánh ${this.live.size} tài khoản`);
    } catch (e) {
      // Máy chủ hỏng/mạng chập: GIỮ NGUYÊN các tenant đang chạy. Dừng hết vì một lần gọi lỗi là
      // biến một sự cố thoáng qua thành lịch chết trên diện rộng.
      this.o.log('warn', `không nạp được danh sách tài khoản: ${(e as Error)?.message} — giữ nguyên ${this.live.size} đang chạy`);
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    for (const l of this.live.values()) l.runner.stop();
    this.live.clear();
  }

  count(): number {
    return this.live.size;
  }
}
