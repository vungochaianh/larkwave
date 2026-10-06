import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { AssistantChatRequest, AssistantChatResponse } from '@larkwave/shared';
import { AnthropicService } from '../engine/anthropic.service';
import { MaicService } from '../maic/maic.service';
import { RenderService } from '../video/render.service';
import { AppConfigService } from '../config/app-config.service';
import { MaicUsageService } from '../maic/maic-usage.service';
import type { AuthUser } from '../common/auth-user';

// Knowledge base for the help assistant — kept in sync with the ACTUAL platform
// (plans, deploy options, per-app workspace, social, bug-bounty). Update here when
// features change so the bot stays accurate.
const SYSTEM = `Bạn là "Trợ lý Larkwave" — trợ lý AI hỗ trợ người dùng nền tảng Larkwave (prompt-to-app: mô tả ý tưởng → AI tạo ra app hoàn chỉnh → build → preview → deploy).

KIẾN THỨC NỀN TẢNG (dùng để trả lời chính xác):
• Tạo app: ở trang chủ, gõ mô tả ý tưởng → chọn loại (Web / Mobile Expo / Extension) → hệ thống sinh code, build và cho xem preview. Có thể bật "Cơ sở dữ liệu & API" để tạo app full-stack (mặc định là app TĨNH nếu không bật).
• Mô hình AI & credit: hệ thống TỰ ĐỘNG chọn model phù hợp (nhanh, tiết kiệm) — mỗi lần tạo/sửa tốn 1 credit; có thể chọn Opus (mạnh hơn) tốn 5 credit. Mỗi lần chỉnh sửa (iterate) cũng tốn credit.
• Gói cước: Miễn phí (0 credit, 1 app) · Khởi đầu 199k (30 credit, 3 app) · Chuyên nghiệp 499k (80 credit, 12 app, + Chạy trên Server Docker) · Doanh nghiệp 999k (180 credit, app không giới hạn). Nâng cấp GIỮA kỳ chỉ trả phần chênh lệch theo thời gian còn lại của chu kỳ (giá hợp lý); hạ gói áp dụng ngay. Xem ở trang Gói & Thanh toán (/pricing), thanh toán bằng chuyển khoản QR (tự động kích hoạt).
• Deploy: (1) Cloudflare Pages — web tĩnh hoặc full-stack (D1 database + Functions API), tự động, mỗi app 1 subdomain *.toolswave.net; (2) Chạy trên Server Docker (gói Chuyên nghiệp trở lên) — chạy backend/DB/Python thật, mỗi service 1 subdomain riêng, hỗ trợ import workspace nhiều service. Nếu app không phải web tĩnh (cần SSR/backend) mà deploy Cloudflare bị lỗi → dùng "Chạy trên Server".
• Workspace của mỗi app (mở app trong /apps): các mục Tổng quan · Code · Console · API · Dữ liệu (D1) · Analytics · SEO & GEO · Bảo mật (biến môi trường/secrets) · Automations (cron/webhook định kỳ) · Tên miền (custom domain) · Deployments · Phiên bản · Cộng tác (mời thành viên) · Cấu trúc · Logs. Ô chat trong app dùng để SỬA app (iterate) hoặc hỏi Trợ giúp.
• Import: kết nối GitLab/GitHub ở /import để nhập repo có sẵn thành app.
• Bạn bè & cộng tác: /friends để kết bạn; nút Tin nhắn (bong bóng nổi) để chat; "Chia sẻ dự án" trong chat = thêm bạn làm cộng tác viên (editor) để CÙNG xây dựng trong workspace.
• Báo lỗi & thưởng: nút "Báo lỗi" (con bọ, góc dưới phải) để gửi lỗi/góp ý kèm ảnh; báo lỗi hợp lệ được tính điểm + thưởng (tester). Xem báo lỗi của mình + phản hồi của admin ở /reports.
• App sinh ra có thể tích hợp sẵn Auth (đăng nhập/đăng ký) dùng D1.
• Vẽ hình / tạo ảnh: bạn có thể VẼ bằng code — trả về khối \`\`\`html hoặc \`\`\`svg (biểu đồ, poster, canvas, hoạt hoạ…) sẽ được render sống ngay trong chat. Trên mỗi khối hình có nút "Tạo ảnh PNG" (render thành ảnh PNG thật để lưu về máy) và "Tải file mã" (tải file .html/.svg). Khối code thường cũng có nút "Tải" để tải thành file. Khi người dùng muốn "tạo hình ảnh"/poster/logo, hãy VẼ bằng HTML/SVG rồi nhắc họ bấm "Tạo ảnh PNG" để xuất ảnh. (Muốn ảnh marketing/poster nhiều mẫu tự động thì dùng Marketing → Make Picture.)

CÁCH TRẢ LỜI:
• Tiếng Việt, thân thiện, NGẮN GỌN và đi thẳng vào việc. Dùng markdown nhẹ: **in đậm** cho ý chính, gạch đầu dòng "- " cho các bước, emoji vừa phải.
• Hướng dẫn theo TỪNG BƯỚC cụ thể (bấm nút nào, ở trang nào).
• Bạn KHÔNG tự thực hiện hành động thay người dùng — chỉ hướng dẫn.
• Nếu không chắc hoặc là lỗi kỹ thuật, gợi ý dùng nút "Báo lỗi" hoặc liên hệ fanpage hỗ trợ.`;

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);
  constructor(
    private readonly anthropic: AnthropicService,
    private readonly maic: MaicService,
    private readonly render: RenderService,
    private readonly config: AppConfigService,
    private readonly maicUsage: MaicUsageService,
  ) {}

  /**
   * Chặn trước + tính sau cho trợ lý trợ giúp.
   *
   * Trước đây bốn đường AI này KHÔNG qua hệ thống hạn mức: đã đăng nhập là gọi Claude/OpenAI
   * không giới hạn, và chi phí không xuất hiện ở bất kỳ báo cáo nào. Chatbot trợ giúp tuy nhẹ
   * nhưng vẫn là token thật, và một vòng lặp phía client có thể đốt hết hạn mức chung.
   */
  private async gate(user?: AuthUser): Promise<void> {
    if (user) await this.maicUsage.assertMaicAllowed(user);
  }

  private async meter(userId: string | undefined, runId: string, res: { inputTokens?: number; outputTokens?: number; costUsd?: number }): Promise<void> {
    if (!userId) return;
    await this.maicUsage
      .meterMaic(userId, {
        runId,
        kind: 'ask',
        inputTokens: res.inputTokens,
        outputTokens: res.outputTokens,
        costUsd: res.costUsd,
      })
      .catch(() => undefined); // đã trả lời rồi — không để việc ghi sổ làm hỏng câu trả lời
  }

  /**
   * Generate a REAL AI image (OpenAI Images) from a text prompt and store it under uploads → return
   * its URL. This is the "vẽ tranh" path (distinct from HTML/SVG artifacts). Uses OPENAI_API_KEY;
   * inert until that env is set. The key NEVER leaves the server.
   */
  async generateImage(prompt: string, size?: string, user?: AuthUser): Promise<{ url: string }> {
    // Sinh ảnh AI là đường TỐN NHẤT trong nhóm này — càng phải qua hạn mức.
    await this.gate(user);
    const key = this.config.env.OPENAI_API_KEY;
    if (!key) throw new BadRequestException('Tính năng tạo ảnh AI chưa được bật (thiếu OPENAI_API_KEY trên máy chủ).');
    const p = (prompt || '').trim();
    if (!p) throw new BadRequestException('Thiếu mô tả ảnh.');
    if (p.length > 4000) throw new BadRequestException('Mô tả ảnh quá dài (tối đa 4000 ký tự).');
    const sizes = ['1024x1024', '1024x1536', '1536x1024', 'auto'];
    const sz = sizes.includes(size || '') ? (size as string) : '1024x1024';
    const model = this.config.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';

    let res: Response;
    try {
      res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, prompt: p, size: sz, n: 1 }),
      });
    } catch (e) {
      throw new BadRequestException(`Không gọi được dịch vụ tạo ảnh: ${(e as Error).message}`);
    }
    const text = await res.text();
    if (!res.ok) {
      let msg = `${res.status}`;
      try { msg = (JSON.parse(text)?.error?.message as string) || msg; } catch { /* keep status */ }
      this.logger.warn(`OpenAI image ${res.status}: ${text.slice(0, 200)}`);
      throw new BadRequestException(`Tạo ảnh thất bại: ${msg}`);
    }
    const item = (JSON.parse(text)?.data ?? [])[0] as { b64_json?: string; url?: string } | undefined;
    let buf: Buffer;
    if (item?.b64_json) {
      buf = Buffer.from(item.b64_json, 'base64');
    } else if (item?.url) {
      const im = await fetch(item.url);
      buf = Buffer.from(await im.arrayBuffer());
    } else {
      throw new BadRequestException('Dịch vụ ảnh không trả về hình.');
    }
    const outDir = join(this.config.uploadsDir, 'images');
    await fs.mkdir(outDir, { recursive: true });
    const name = `ai-${Date.now()}-${randomBytes(4).toString('hex')}.png`;
    await fs.writeFile(join(outDir, name), buf);
    return { url: `${this.config.publicApiUrl}/uploads/images/${name}` };
  }

  /**
   * Render a self-contained HTML/SVG artifact (authored by the assistant in chat) to a real PNG via
   * the shared Playwright renderer — the same pipeline "Make Picture" uses. This is how the web
   * assistant produces an actual image FILE (the /v1/ask chat path itself has no tools/file output).
   */
  async renderImage(html: string, width?: number, height?: number, user?: AuthUser): Promise<{ url: string }> {
    await this.gate(user);
    const doc = (html || '').trim();
    if (!doc) throw new BadRequestException('Thiếu nội dung HTML/SVG để render.');
    if (doc.length > 800_000) throw new BadRequestException('Nội dung quá lớn để render thành ảnh (tối đa ~800KB).');
    const w = Math.min(2400, Math.max(160, Math.round(width || 1200)));
    const h = Math.min(3000, Math.max(160, Math.round(height || 800)));
    const { url } = await this.render.renderImage({ html: doc, w, h });
    return { url };
  }

  /** Build the conversation prompt from the recent turns + optional page context. */
  private buildPrompt(dto: AssistantChatRequest): string {
    const msgs = (dto?.messages ?? []).slice(-12);
    const convo = msgs
      .map(
        (m) =>
          `${m.role === 'assistant' ? 'Trợ lý' : 'Người dùng'}: ${String(m.content ?? '').slice(0, 4000)}`,
      )
      .join('\n');
    const ctx = dto?.context ? `[Ngữ cảnh hiện tại: ${String(dto.context).slice(0, 300)}]\n` : '';
    return `${ctx}${convo}\nTrợ lý:`;
  }

  private fallback(text: string): string {
    return text.trim() || 'Xin lỗi, mình chưa trả lời được. Bạn thử hỏi lại nhé.';
  }

  async chat(dto: AssistantChatRequest, user?: AuthUser): Promise<AssistantChatResponse> {
    await this.gate(user);
    // Prefer the hosted MAIC gateway (Larkwave subscription) so the help bot works without our own
    // Anthropic key. Falls back to AnthropicService when MAIC isn't configured.
    if (this.maic.enabled) {
      try {
        const res = await this.maic.ask({ prompt: this.buildPrompt(dto), systemPrompt: SYSTEM, effort: 'low' });
        await this.meter(user?.id, res.runId, res);
        return { reply: this.fallback(res.answer) };
      } catch {
        /* fall through to Anthropic */
      }
    }
    const { text } = await this.anthropic.complete(this.buildPrompt(dto), {
      system: SYSTEM,
      maxTokens: 700,
      model: 'claude-sonnet-4-6',
    });
    return { reply: this.fallback(text) };
  }

  /**
   * Streaming variant: forwards each text delta via `onDelta` (for live SSE to the
   * chatbot UI) and returns the final reassembled reply. Not credit-charged.
   */
  async chatStream(dto: AssistantChatRequest, onDelta: (delta: string) => void, user?: AuthUser): Promise<string> {
    await this.gate(user);
    // MAIC first (hosted, no own key). /v1/ask is one-shot (no token streaming), so emit the whole
    // reply as a single delta — the UI still renders it. Fall back to streaming Anthropic if MAIC off.
    if (this.maic.enabled) {
      try {
        const res = await this.maic.ask({ prompt: this.buildPrompt(dto), systemPrompt: SYSTEM, effort: 'low' });
        await this.meter(user?.id, res.runId, res);
        const reply = this.fallback(res.answer);
        onDelta(reply);
        return reply;
      } catch {
        /* fall through to Anthropic */
      }
    }
    const { text } = await this.anthropic.complete(this.buildPrompt(dto), {
      system: SYSTEM,
      maxTokens: 700,
      model: 'claude-sonnet-4-6',
      onText: onDelta,
    });
    return this.fallback(text);
  }
}
