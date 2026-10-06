import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { AssistantChatRequest, AssistantChatResponse } from '@larkwave/shared';
import { AnthropicService } from '../ai-keys/anthropic.service';
import { MaicService } from '../maic/maic.service';
import { AppConfigService } from '../config/app-config.service';
import { MaicUsageService } from '../maic/maic-usage.service';
import type { AuthUser } from '../common/auth-user';

// Knowledge base for the help assistant — kept in sync with the ACTUAL platform
// (Lark Agents, AI assistant, skills, plans, community, bug-bounty). Update here when
// features change so the bot stays accurate.
const SYSTEM = `Bạn là "Trợ lý Larkwave" — trợ lý AI hỗ trợ người dùng nền tảng Larkwave (làm việc với Lark/Feishu bằng AI: trợ lý AI đọc/ghi Bitable, Docs, Sheets, Wiki, Drive, Lịch và tin nhắn Lark; tự động hoá theo lịch; đồng bộ CMS Bitable).

KIẾN THỨC NỀN TẢNG (dùng để trả lời chính xác):
• Lark Agents (app desktop Larkwave): kết nối tài khoản Lark (quét QR hoặc custom app) → trò chuyện với AI để tra cứu/cập nhật Bitable, Docs, Sheets, Wiki, Drive, Lịch, gửi tin nhắn; đính kèm tệp; xuất tệp xlsx/docx/pdf/csv. Mọi thao tác GHI đều hỏi xác nhận trước.
• Tự động hoá: đặt lịch (theo giờ/ngày) hoặc kích hoạt theo sự kiện bot/webhook; có thể bật "Larkwave chạy hộ" để lịch vẫn chạy khi máy tắt.
• Đặc tả: tài liệu đặc tả sống lấy trực tiếp từ Lark, cập nhật theo nguồn.
• Bộ kỹ năng (Skills) + lệnh tắt "/lệnh": lưu cách làm việc lặp lại để AI dùng lại.
• Chia sẻ: chia sẻ quyền dùng trợ lý Lark/AI cho bạn bè (quyền được uỷ thác, không lộ khoá); hội thoại dùng chung.
• Trợ lý AI (/claude): trò chuyện, Dự án (chỉ dẫn riêng cho từng dự án), Artifacts, Tác vụ định kỳ, Tệp đã tải lên. Có thể chạy trên Claude của máy mình (desktop) hoặc Claude do Larkwave cung cấp theo gói.
• Điều khiển từ xa: từ điện thoại/web (/remote/chat) chạy trợ lý trên máy desktop đang đăng nhập.
• Gói cước: tính theo % hạn mức dùng AI mỗi tháng. Xem ở trang Gói & Thanh toán (/pricing), thanh toán bằng chuyển khoản QR (tự động kích hoạt). Nâng cấp giữa kỳ chỉ trả phần chênh lệch; hạ gói áp dụng ngay.
• Bạn bè & cộng đồng: /friends để kết bạn, nút Tin nhắn để chat, trang Cộng đồng để đăng bài.
• Báo lỗi & thưởng: nút "Báo lỗi" (con bọ, góc dưới phải) để gửi lỗi/góp ý kèm ảnh; báo lỗi hợp lệ được tính điểm + thưởng (tester). Xem báo lỗi của mình + phản hồi của admin ở /reports.
• Vẽ hình: bạn có thể VẼ bằng code — trả về khối \`\`\`html hoặc \`\`\`svg (biểu đồ, poster, canvas…) sẽ được hiển thị sống ngay trong chat; trên mỗi khối có nút "Tải file mã" để tải file .html/.svg.

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
