import { Injectable, Logger } from '@nestjs/common';
import type { TokenUsage } from '@larkwave/shared';
import { AppConfigService } from '../config/app-config.service';
import { AiKeysService } from '../ai-keys/ai-keys.service';

type CompatProvider = 'openai' | 'grok';

// Rough public pricing per model ($/Mtok). Informational only (credits drive billing).
const PRICING: Record<string, { in: number; out: number }> = {
  'gpt-4o-mini': { in: 0.15, out: 0.6 },
  'gpt-4o': { in: 2.5, out: 10 },
  'gpt-4.1': { in: 2, out: 8 },
  'gpt-4.1-mini': { in: 0.4, out: 1.6 },
  'grok-2-1212': { in: 2, out: 10 },
  'grok-3': { in: 3, out: 15 },
  'grok-4': { in: 5, out: 15 },
};
const DEFAULT_PRICE = { in: 0.5, out: 1.5 };

const ENDPOINTS: Record<CompatProvider, string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  grok: 'https://api.x.ai/v1/chat/completions',
};

/**
 * Secondary LLM providers that speak the OpenAI Chat-Completions API: OpenAI and
 * xAI Grok. INERT until the matching key is set. Token usage is priced + returned
 * so it flows into Build.usage and the thu-chi (revenue/cost) report like Anthropic.
 */
@Injectable()
export class OpenaiService {
  private readonly logger = new Logger(OpenaiService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly keys: AiKeysService,
  ) {}

  get enabled(): boolean {
    return this.keys.enabled('openai');
  }

  get grokEnabled(): boolean {
    return this.keys.enabled('grok');
  }

  private keyFor(p: CompatProvider): string {
    return this.keys.keyFor(p);
  }

  private defaultModel(p: CompatProvider): string {
    return p === 'grok' ? this.config.env.GROK_MODEL : this.config.env.OPENAI_MODEL;
  }

  private usage(model: string, promptTokens = 0, completionTokens = 0): TokenUsage {
    const p = PRICING[model] ?? DEFAULT_PRICE;
    const usd = (promptTokens / 1e6) * p.in + (completionTokens / 1e6) * p.out;
    return { inputTokens: promptTokens, outputTokens: completionTokens, usd };
  }

  /** One-shot completion (Chat Completions). Mirrors AnthropicService.complete. */
  async complete(
    prompt: string,
    opts: {
      system?: string;
      maxTokens?: number;
      model?: string;
      signal?: AbortSignal;
      provider?: CompatProvider;
    } = {},
  ): Promise<{ text: string; usage: TokenUsage }> {
    const provider = opts.provider ?? 'openai';
    const key = this.keyFor(provider);
    if (!key) throw new Error(`${provider} chưa được cấu hình (thiếu API key)`);
    const model = opts.model || this.defaultModel(provider);
    const messages: { role: string; content: string }[] = [];
    if (opts.system) messages.push({ role: 'system', content: opts.system });
    messages.push({ role: 'user', content: prompt });

    const res = await fetch(ENDPOINTS[provider], {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, max_tokens: opts.maxTokens ?? 1024 }),
      signal: opts.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`${provider} ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = data.choices?.[0]?.message?.content ?? '';
    return {
      text,
      usage: this.usage(model, data.usage?.prompt_tokens, data.usage?.completion_tokens),
    };
  }
}
