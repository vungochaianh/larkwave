import { LarkClient } from './larkClient';
import { AutomationEngine } from './automationEngine';
import { createToolBridge } from './toolBridge';
import { findHeadlessTool, headlessReadOnlyTools, headlessTools } from './tools/headless';
import { setFileOutDir } from './tools/files';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LarkChatEvent, LarkChatMode } from '@larkwave/core';
import type { StoredAutomation } from './secretStore';

/**
 * Bộ chạy lịch tự động hoá Lark KHÔNG CẦN GIAO DIỆN — dùng cho một máy chạy nền (VM), giống cách
 * `tw-cms-keeper` giữ phiên Lark 24/7 để Đồng bộ Bitable không chết khi tắt app desktop.
 *
 * Vì sao nằm ở ĐÂY chứ không phải viết lại trong thư mục VM: `larkClient`, `automationEngine` và
 * `createToolBridge` đều đã sạch Electron, và chúng chứa những thứ không được phép có hai bản —
 * cách phân loại lỗi tool, luật chống trùng lịch, mốc sàn "đừng chạy ngay khi vừa tạo". Bản dựng
 * cho VM chỉ gói lại chính những file này.
 *
 * Khoá Lark vẫn nằm TRÊN MÁY NGƯỜI DÙNG — chỉ là máy đó nay là VM của họ, không phải Mac. Máy chủ
 * Larkwave vẫn không giữ chất liệu khoá Lark nào (xem chú thích ở model LarkGrant).
 */
export interface HeadlessRunnerOpts {
  appId: string;
  appSecret: string;
  /**
   * Token tài khoản Larkwave — để gọi /agent/maic-tools và giành quyền chạy lịch.
   *
   * Nhận cả hàm vì chế độ chạy hộ nhiều tenant ký lại token mỗi vài giờ (xem `signForRunner`):
   * giữ một chuỗi cố định ở đây thì runner sẽ ôm token hết hạn và im lặng hỏng sau 6 tiếng.
   */
  accountToken: string | (() => string);
  apiBase: string;
  /** Định danh + nhãn của máy này trong cơ chế chống chạy trùng. */
  ownerId: string;
  label: string;
  log?: (level: 'info' | 'warn' | 'error', msg: string) => void;
}

export class HeadlessRunner {
  private readonly client: LarkClient;
  private readonly engine: AutomationEngine;
  private rules: StoredAutomation[] = [];
  private readonly log: (level: 'info' | 'warn' | 'error', msg: string) => void;

  constructor(private readonly o: HeadlessRunnerOpts) {
    this.log = o.log ?? (() => {});
    this.client = new LarkClient(o.appId, o.appSecret);
    this.engine = new AutomationEngine(
      () => this.client,
      () => this.rules,
      (list) => {
        this.rules = list;
        void this.pushRules();
      },
      () => this.amRunner(),
      {
        run: (prompt, mode, stats) => this.runTurn(prompt, mode, stats),
        // Máy nền KHÔNG lưu hội thoại và KHÔNG bắn thông báo: không ai ngồi đó đọc, và hội thoại
        // của lịch đã có bản trên máy desktop qua đồng bộ sao lưu.
        notify: () => {},
      },
      // Bộ headless: KHÔNG đi qua tools/index.ts, nếu không electron lọt vào bundle cho VM.
      (name) => findHeadlessTool(name),
    );
  }

  /** Token hiện hành — gọi lại mỗi lần dùng, đừng cache. */
  private tok(): string {
    return typeof this.o.accountToken === 'function' ? this.o.accountToken() : this.o.accountToken;
  }

  /** Kéo lịch từ bản sao lưu trên máy chủ (cùng nguồn với app desktop). */
  async pullRules(): Promise<number> {
    const r = await fetch(`${this.o.apiBase}/me/lark-backup`, {
      headers: { Authorization: `Bearer ${this.tok()}` },
    });
    if (!r.ok) throw new Error(`Không tải được lịch (HTTP ${r.status})`);
    // Tài khoản CHƯA có bản sao lưu nào thì máy chủ trả 200 kèm THÂN RỖNG (controller trả null),
    // và `r.json()` nổ với "Unexpected end of JSON input". Đó là trạng thái hợp lệ — người vừa
    // bật chạy hộ trước khi máy tính kịp đồng bộ lần nào — chứ không phải lỗi. Trước khi vá,
    // đúng người dùng lần đầu là người bị chặn: chế độ chạy hộ ghi lỗi khó hiểu cho họ, còn chế
    // độ VM một-người thì `entry.ts` exit(1) nên service crash-loop 10 giây một lần.
    const body = (await r.text()).trim();
    const j = body
      ? (JSON.parse(body) as { data?: { automations?: StoredAutomation[] } } | null)
      : null;
    this.rules = j?.data?.automations ?? [];
    return this.rules.length;
  }

  /**
   * Đẩy trạng thái lịch (lastRunAt, runCount, lịch sử chạy) ngược lên máy chủ.
   *
   * Đọc-sửa-ghi cả khối để KHÔNG xoá mất `sessions`/`bases`/`settings` của máy desktop: bản sao
   * lưu là một blob chung, ghi đè nguyên khối bằng dữ liệu của riêng máy này là xoá sạch phần còn
   * lại — đúng lớp lỗi mà chú thích hợp-nhất ở larkService đã cảnh báo.
   */
  private async pushRules(): Promise<void> {
    try {
      const r = await fetch(`${this.o.apiBase}/me/lark-backup`, {
        headers: { Authorization: `Bearer ${this.tok()}` },
      });
      // Cùng bẫy thân-rỗng với pullRules: chưa có sao lưu ⇒ 200 + 0 byte. Ở đây nó còn tệ hơn —
      // ngoại lệ bị `catch` bên dưới nuốt, nên trạng thái lịch im lặng KHÔNG bao giờ được ghi lên.
      const curText = r.ok ? (await r.text()).trim() : '';
      const cur = curText
        ? (((JSON.parse(curText) as { data?: Record<string, unknown> })?.data ?? {}) as Record<string, unknown>)
        : {};
      await fetch(`${this.o.apiBase}/me/lark-backup`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${this.tok()}`, 'content-type': 'application/json' },
        body: JSON.stringify({ data: { ...cur, automations: this.rules } }),
      });
    } catch (e) {
      this.log('warn', `không đẩy được trạng thái lịch: ${(e as Error)?.message}`);
    }
  }

  /** Máy này có đang là chủ chạy lịch không (chống chạy trùng với app desktop). */
  private async amRunner(): Promise<boolean> {
    try {
      const r = await fetch(`${this.o.apiBase}/me/lark-runner/beat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.tok()}`, 'content-type': 'application/json' },
        body: JSON.stringify({ ownerId: this.o.ownerId, ownerKind: 'vm', label: this.o.label }),
      });
      if (!r.ok) return true; // máy chủ hỏng thì cứ chạy — thà trùng một lúc còn hơn lịch đứng im
      return ((await r.json()) as { isMine?: boolean }).isMine !== false;
    } catch {
      return true;
    }
  }

  /** Một lượt agent: MAIC nghĩ, máy NÀY thực thi công cụ Lark. */
  private async runTurn(
    prompt: string,
    mode: LarkChatMode,
    stats: { tools: number; writes: number },
  ): Promise<string> {
    // Nơi `create_file` ghi tệp. Máy chạy nền KHÔNG có thư mục hội thoại như bản desktop, nên
    // dùng một thư mục tạm riêng cho mỗi lượt. Tệp ở đây chỉ là bước trung gian: người dùng không
    // ngồi trước máy này, nên thứ có nghĩa là `send_file` đẩy nó lên Lark. Không dọn ngay sau lượt
    // vì `send_file` chạy ở lượt sau đó của cùng phiên; hệ điều hành dọn thư mục tạm.
    setFileOutDir(mkdtempSync(join(tmpdir(), 'tw-lark-out-')));
    const queue: LarkChatEvent[] = [];
    const { registry, execTool } = createToolBridge(
      mode,
      {
        client: this.client,
        // Máy nền: bộ công cụ headless, tiêm vào để KHÔNG kéo tools/index.ts (→ electron).
        baseTools: (m) => (m === 'ask' ? headlessReadOnlyTools() : headlessTools()),
        // Máy nền không có khái niệm "bản cài đã cũ" — và versionNote kéo theo codePush → electron.
        versionNote: async () => '',
        // Không có ai ngồi xác nhận. Chế độ thực thi là sự cho phép người dùng đã cho khi đặt lịch.
        autoApprove: mode === 'build',
        awaitConfirm: async () => mode === 'build',
        allowVersionHint: false,
      },
      (e) => queue.push(e),
    );
    const tools = [...registry.values()].map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as object,
    }));

    const res = await fetch(`${this.o.apiBase}/agent/maic-tools`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.tok()}`,
        'content-type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ prompt: prompt.slice(0, 100_000), tools }),
    });
    if (!res.ok || !res.body) {
      const t = await res.text().catch(() => '');
      throw new Error(res.status === 402 ? 'Hết hạn mức gói tháng này.' : `Máy chủ lỗi ${res.status}: ${t.slice(0, 200)}`);
    }

    let runId = '';
    let out = '';
    let buf = '';
    const dec = new TextDecoder();
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      buf += dec.decode(chunk, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const ln of lines) {
        if (!ln.startsWith('data: ')) continue;
        let ev: Record<string, unknown>;
        try {
          ev = JSON.parse(ln.slice(6)) as Record<string, unknown>;
        } catch {
          continue;
        }
        if (ev.type === 'run' && typeof ev.runId === 'string') runId = ev.runId;
        else if (ev.type === 'delta' && typeof ev.text === 'string') out += ev.text;
        else if (ev.type === 'tool_use') {
          const name = String(ev.name || '');
          stats.tools += 1;
          if (findWrite(registry, name)) stats.writes += 1;
          let content: string;
          let isError = false;
          try {
            content = JSON.stringify(await execTool(name, (ev.input ?? {}) as Record<string, unknown>));
          } catch (e) {
            // Công cụ hỏng vẫn PHẢI trả kết quả kèm cờ lỗi — im lặng thì model chờ tới hết giờ.
            content = (e as Error)?.message || 'lỗi công cụ';
            isError = true;
          }
          await fetch(`${this.o.apiBase}/agent/maic-tools/${encodeURIComponent(runId)}/result`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${this.tok()}`, 'content-type': 'application/json' },
            body: JSON.stringify({ toolUseId: String(ev.id || ''), content: content.slice(0, 200_000), isError }),
          }).catch(() => undefined);
        } else if (ev.type === 'error') {
          throw new Error(String(ev.message || 'Lỗi từ trợ lý'));
        }
      }
    }
    return out.trim() || '(agent không trả về nội dung)';
  }

  start(): void {
    this.engine.start();
  }

  stop(): void {
    this.engine.stop();
  }

  /** Số lịch đang bật — để bản ghi log nói được điều gì đó có nghĩa. */
  enabledCount(): number {
    return this.rules.filter((r) => r.enabled).length;
  }
}

function findWrite(registry: Map<string, { gated?: boolean }>, name: string): boolean {
  return !!registry.get(name)?.gated;
}
