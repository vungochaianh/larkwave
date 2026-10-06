import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { AssistantChatRequest, AssistantChatResponse } from '@larkwave/shared';
import { AssistantService } from './assistant.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/auth-user';

/** AI help-assistant chat (the floating chatbot). Auth-guarded by the global guard. */
@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  /** Non-streaming reply (kept for fallback / non-stream callers). */
  @Post('chat')
  chat(@CurrentUser() user: AuthUser, @Body() dto: AssistantChatRequest): Promise<AssistantChatResponse> {
    return this.assistant.chat(dto, user);
  }

  /**
   * Render an HTML/SVG artifact (drawn by the assistant in chat) to a real PNG and return its URL —
   * so the web assistant can produce an actual image file (the chat text path has no file output).
   */
  @Post('render')
  render(
    @CurrentUser() user: AuthUser,
    @Body() body: { html: string; width?: number; height?: number },
  ): Promise<{ url: string }> {
    return this.assistant.renderImage(body?.html, body?.width, body?.height, user);
  }

  /** Generate a REAL AI image (OpenAI) from a text prompt → returns its stored URL. */
  @Post('image')
  image(
    @CurrentUser() user: AuthUser,
    @Body() body: { prompt: string; size?: string },
  ): Promise<{ url: string }> {
    return this.assistant.generateImage(body?.prompt, body?.size, user);
  }

  /**
   * SSE stream of the reply: emits `{delta}` per token, a final `{done,reply}`,
   * or `{error}`. Client uses POST fetch + Authorization header (not EventSource).
   */
  @Post('chat/stream')
  async stream(
    @CurrentUser() user: AuthUser,
    @Body() dto: AssistantChatRequest,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    const send = (obj: unknown): void => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(obj)}\n\n`);
    };
    try {
      const reply = await this.assistant.chatStream(dto, (delta) => send({ delta }), user);
      send({ done: true, reply });
    } catch (e) {
      send({ error: (e as Error)?.message || 'Trợ lý gặp sự cố, bạn thử lại nhé.' });
    } finally {
      if (!res.writableEnded) res.end();
    }
  }
}
