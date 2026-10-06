/**
 * Direct-API multi-provider agent runner — the CLI-less path.
 *
 * Instead of spawning a local CLI (claude/grok/gemini/codex), this calls the
 * provider's HTTP API directly with the user's API key and drives the tool-use
 * loop ourselves. One `runApiAgent()` covers three wire shapes:
 *   - anthropic          → POST /v1/messages          (tool_use / tool_result)
 *   - openai-compatible  → POST /chat/completions     (tool_calls / role:"tool")   [openai + xai]
 *   - google (gemini)    → :generateContent           (functionCall / functionResponse)
 *
 * Non-streaming per turn (bounded chat turns) for robustness; the whole assistant
 * text of a turn is emitted at once via `onText`. Token-level streaming can be
 * layered on later per shape. Zero deps (Node 20 global fetch).
 *
 * ⚠️ The exact request/response shapes for openai/xai/google are implemented from
 * their public API docs but NOT exercised here (no keys in this env). Verify each
 * provider against a live key on-machine. The Anthropic path follows the current
 * Messages API (claude-api skill) and defaults to `claude-opus-4-8`.
 */

export type ApiProvider = 'anthropic' | 'openai' | 'xai' | 'google';

/** Map a desktop runner id → the direct-API provider + its default model + endpoint. */
export const API_PROVIDER: Record<string, { provider: ApiProvider; base: string; defaultModel: string; keyHint: string }> = {
  claude: { provider: 'anthropic', base: 'https://api.anthropic.com', defaultModel: 'claude-opus-4-8', keyHint: 'sk-ant-api…' },
  grok: { provider: 'xai', base: 'https://api.x.ai/v1', defaultModel: 'grok-4', keyHint: 'xai-…' },
  gemini: { provider: 'google', base: 'https://generativelanguage.googleapis.com/v1beta', defaultModel: 'gemini-2.5-pro', keyHint: 'AIza…' },
  codex: { provider: 'openai', base: 'https://api.openai.com/v1', defaultModel: 'gpt-5', keyHint: 'sk-…' },
};

/** Resolve the concrete API model id from a runner id + a (possibly CLI-style) model hint. */
export function resolveApiModel(runnerId: string, model?: string): string {
  const cfg = API_PROVIDER[runnerId];
  const def = cfg?.defaultModel ?? 'claude-opus-4-8';
  if (!model) return def;
  // Claude CLI aliases → real API ids.
  if (runnerId === 'claude') {
    const m: Record<string, string> = { opus: 'claude-opus-4-8', sonnet: 'claude-sonnet-4-6', haiku: 'claude-haiku-4-5' };
    if (m[model]) return m[model];
    return /^claude-/.test(model) ? model : def;
  }
  // gemini catalog ids are already valid API ids (gemini-2.5-pro/flash).
  if (runnerId === 'gemini') return /^gemini-/.test(model) ? model : def;
  // grok/codex catalog ids are CLI-specific → use the API default unless it looks like an API id.
  if (runnerId === 'grok') return /^grok-/.test(model) && /latest|\d/.test(model) ? model : def;
  // (xAI redirects retired slugs to the current model, so a close-enough grok-* id still works.)
  if (runnerId === 'codex') return /^(gpt|o\d)/.test(model) ? model.replace('-codex', '') : def;
  return model || def;
}

/** A tool the agent may call — provider-agnostic; converted per shape internally. */
export interface ApiTool {
  name: string;
  description: string;
  /** JSON Schema object for the parameters. */
  parameters: Record<string, unknown>;
}

export type ApiAgentEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool'; name: string; input: Record<string, unknown>; ok: boolean }
  | { type: 'error'; message: string }
  | { type: 'done' };

export interface RunApiAgentOptions {
  runnerId: string; // claude | grok | gemini | codex
  apiKey: string;
  model?: string;
  system: string;
  /** The current user prompt. */
  prompt: string;
  /** Prior transcript as plain turns (optional) — kept simple: user/assistant text only. */
  history?: { role: 'user' | 'assistant'; text: string }[];
  tools: ApiTool[];
  /** Execute a tool call → return a JSON-serialisable result (or throw). */
  execTool: (name: string, input: Record<string, unknown>) => Promise<unknown>;
  maxRounds?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

const DEFAULT_ROUNDS = 12;
const DEFAULT_MAX_TOKENS = 8192;

/** Drive the provider's tool-use loop to completion, yielding text + tool events. */
export async function* runApiAgent(opts: RunApiAgentOptions): AsyncGenerator<ApiAgentEvent> {
  const cfg = API_PROVIDER[opts.runnerId];
  if (!cfg) {
    yield { type: 'error', message: `Không hỗ trợ chạy API trực tiếp cho "${opts.runnerId}".` };
    yield { type: 'done' };
    return;
  }
  if (!opts.apiKey) {
    yield { type: 'error', message: `Chưa có API key cho ${opts.runnerId}. Dán key ở phần cài đặt agent.` };
    yield { type: 'done' };
    return;
  }
  const model = resolveApiModel(opts.runnerId, opts.model);
  const maxRounds = opts.maxRounds ?? DEFAULT_ROUNDS;
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
  try {
    if (cfg.provider === 'anthropic') {
      yield* runAnthropic(cfg.base, opts.apiKey, model, opts, maxRounds, maxTokens);
    } else if (cfg.provider === 'openai' || cfg.provider === 'xai') {
      yield* runOpenAICompatible(cfg.provider, cfg.base, opts.apiKey, model, opts, maxRounds, maxTokens);
    } else {
      yield* runGemini(cfg.base, opts.apiKey, model, opts, maxRounds);
    }
  } catch (e) {
    yield { type: 'error', message: (e as Error)?.message || 'Lỗi gọi API.' };
  }
  yield { type: 'done' };
}

// ── Anthropic Messages API ───────────────────────────────────────────────────
async function* runAnthropic(
  base: string,
  key: string,
  model: string,
  opts: RunApiAgentOptions,
  maxRounds: number,
  maxTokens: number,
): AsyncGenerator<ApiAgentEvent> {
  type Block =
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
    | { type: 'tool_result'; tool_use_id: string; content: string | ResultBlock[]; is_error?: boolean };
  const messages: { role: 'user' | 'assistant'; content: string | Block[] }[] = [];
  for (const h of opts.history ?? []) messages.push({ role: h.role, content: h.text });
  messages.push({ role: 'user', content: opts.prompt });
  const tools = opts.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));

  /**
   * Gọi API, và nếu hỏng 4xx thì THỬ LẠI MỘT LẦN sau khi bỏ hết tệp đính kèm (ảnh/PDF) khỏi lịch sử.
   *
   * Vì sao: PDF có trần 600 trang, nhưng trần đó tụt xuống 100 khi model có ngữ cảnh dưới 1M — mà
   * người dùng đổi được model. Cộng thêm PDF khoá mật khẩu, ảnh hỏng, tổng payload vượt 32MB…
   * Không có đường lui thì một tệp đính kèm quá khổ giết cả lượt chat, tức là đưa tệp vào còn TỆ
   * HƠN trước khi có tính năng này. Bỏ tệp ra rồi chạy tiếp: model vẫn còn phần chữ để trả lời.
   */
  const stripAttachments = (): boolean => {
    let removed = false;
    for (const m of messages) {
      if (typeof m.content === 'string') continue;
      for (const b of m.content) {
        if (b.type !== 'tool_result' || typeof b.content === 'string') continue;
        const kept = b.content.filter((x) => x.type === 'text');
        if (kept.length === b.content.length) continue;
        const what = b.content.some((x) => x.type === 'document') ? 'PDF' : 'ảnh';
        b.content = [
          ...(kept.length ? kept : []),
          { type: 'text', text: `[Không gửi kèm được ${what} — tệp vượt giới hạn của model. Hãy trả lời dựa trên phần chữ, và nói rõ cho người dùng là bạn chưa xem được tệp.]` },
        ];
        removed = true;
      }
    }
    return removed;
  };

  for (let round = 0; round < maxRounds; round++) {
    const call = (): Promise<Response> =>
      fetch(`${base}/v1/messages`, {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: maxTokens, system: opts.system, tools, messages }),
        signal: opts.signal,
      });
    let res = await call();
    if (!res.ok && res.status >= 400 && res.status < 500 && stripAttachments()) res = await call();
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as { content: Block[]; stop_reason: string };
    const assistant: Block[] = data.content ?? [];
    for (const b of assistant) if (b.type === 'text' && b.text) yield { type: 'text', delta: b.text };
    messages.push({ role: 'assistant', content: assistant });
    const calls = assistant.filter((b): b is Extract<Block, { type: 'tool_use' }> => b.type === 'tool_use');
    if (data.stop_reason !== 'tool_use' || !calls.length) return;
    const results: Block[] = [];
    for (const c of calls) {
      const { value, ok } = await execToolValue(opts, c.name, c.input);
      const text = await textFor(value);
      yield { type: 'tool', name: c.name, input: c.input, ok };
      const blocks = ok ? await imageBlocksFor(value, text) : null;
      results.push({ type: 'tool_result', tool_use_id: c.id, content: blocks ?? text, is_error: !ok });
    }
    messages.push({ role: 'user', content: results });
  }
}

// ── OpenAI-compatible (OpenAI + xAI Grok) chat/completions ───────────────────
async function* runOpenAICompatible(
  provider: 'openai' | 'xai',
  base: string,
  key: string,
  model: string,
  opts: RunApiAgentOptions,
  maxRounds: number,
  maxTokens: number,
): AsyncGenerator<ApiAgentEvent> {
  // GPT-5 / o-series REJECT `max_tokens` (400) — they require `max_completion_tokens`.
  // xAI Grok keeps the classic `max_tokens`. Send the provider-correct key.
  const tokenParam = provider === 'openai' ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens };
  interface Msg {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content?: string | null;
    tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
    tool_call_id?: string;
  }
  const messages: Msg[] = [{ role: 'system', content: opts.system }];
  for (const h of opts.history ?? []) messages.push({ role: h.role, content: h.text });
  messages.push({ role: 'user', content: opts.prompt });
  const tools = opts.tools.map((t) => ({ type: 'function' as const, function: { name: t.name, description: t.description, parameters: t.parameters } }));

  for (let round = 0; round < maxRounds; round++) {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, ...tokenParam, messages, tools, tool_choice: 'auto' }),
      signal: opts.signal,
    });
    if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as { choices: { message: Msg; finish_reason: string }[] };
    const msg = data.choices?.[0]?.message;
    if (!msg) return;
    if (msg.content) yield { type: 'text', delta: msg.content };
    messages.push(msg);
    const calls = msg.tool_calls ?? [];
    if (!calls.length) return;
    for (const c of calls) {
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(c.function.arguments || '{}');
      } catch {
        /* bad args → empty */
      }
      const { text, ok } = await execToolText(opts, c.function.name, input);
      yield { type: 'tool', name: c.function.name, input, ok };
      messages.push({ role: 'tool', tool_call_id: c.id, content: text });
    }
  }
}

// ── Google Gemini generateContent ────────────────────────────────────────────
async function* runGemini(
  base: string,
  key: string,
  model: string,
  opts: RunApiAgentOptions,
  maxRounds: number,
): AsyncGenerator<ApiAgentEvent> {
  interface Part {
    text?: string;
    functionCall?: { name: string; args: Record<string, unknown> };
    functionResponse?: { name: string; response: Record<string, unknown> };
  }
  interface Content {
    role: 'user' | 'model';
    parts: Part[];
  }
  const contents: Content[] = [];
  for (const h of opts.history ?? []) contents.push({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.text }] });
  contents.push({ role: 'user', parts: [{ text: opts.prompt }] });
  // Gemini's functionDeclarations take an OpenAPI-subset schema and REJECT some JSON-Schema
  // keywords our Lark tools use (additionalProperties, $schema). Strip them recursively.
  const tools = [
    { functionDeclarations: opts.tools.map((t) => ({ name: t.name, description: t.description, parameters: geminiSchema(t.parameters) })) },
  ];

  for (let round = 0; round < maxRounds; round++) {
    const res = await fetch(`${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: opts.system }] }, contents, tools }),
      signal: opts.signal,
    });
    if (!res.ok) throw new Error(`Gemini API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as { candidates?: { content?: Content }[] };
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    for (const p of parts) if (p.text) yield { type: 'text', delta: p.text };
    contents.push({ role: 'model', parts });
    const calls = parts.filter((p) => p.functionCall).map((p) => p.functionCall!);
    if (!calls.length) return;
    const respParts: Part[] = [];
    for (const c of calls) {
      // Qua execToolText chứ KHÔNG phải execToolValue: đường Gemini trước đây bỏ qua trần độ dài
      // hoàn toàn, nên một kết quả khổng lồ đi thẳng vào ngữ cảnh (các nhà cung cấp khác thì có
      // trần). Cùng một đường cắt = cùng một hành vi, và kết quả bị cắt vẫn là JSON hợp lệ.
      const { text, ok } = await execToolText(opts, c.name, c.args || {});
      yield { type: 'tool', name: c.name, input: c.args || {}, ok };
      respParts.push({ functionResponse: { name: c.name, response: ok ? { result: text } : { error: text } } });
    }
    contents.push({ role: 'user', parts: respParts });
  }
}

/** Strip JSON-Schema keywords Gemini's OpenAPI-subset schema rejects. */
function geminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(geminiSchema);
  if (schema && typeof schema === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
      if (k === 'additionalProperties' || k === '$schema' || k === 'default') continue;
      out[k] = geminiSchema(v);
    }
    return out;
  }
  return schema;
}

/** Khối được phép nằm trong `tool_result.content` của Anthropic. */
export type ResultBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } };

/** Ảnh lớn hơn mức này thì không nhét vào ngữ cảnh (base64 phình ~4/3 lần). */
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
/** PDF: hợp đồng của Anthropic cho phép tới 32MB, nhưng một tệp lớn thế nuốt trọn ngữ cảnh và
 *  tốn tiền vô ích cho một lượt chat — tự hạ xuống mức vừa phải. */
const MAX_PDF_BYTES = 8 * 1024 * 1024;

/**
 * Kết quả tool có kèm ẢNH thì trả về khối ảnh THẬT thay vì chỉ đường dẫn.
 *
 * Vì sao cần: đường "API trực tiếp" chỉ nạp tool Lark, model ở đó KHÔNG có công cụ đọc tệp nào.
 * Nên `lark_read_attachment` tải ảnh về đĩa rồi trả đường dẫn là ngõ cụt — người dùng hỏi "trong
 * ảnh này có gì" và không bao giờ có câu trả lời. Anthropic cho phép nhét khối ảnh vào chính
 * tool_result, nên chỗ này đọc tệp lên và gửi kèm.
 *
 * Chỉ kích hoạt khi CHÍNH TOOL tự khai báo `{kind:'image', path}` — đường dẫn đến từ mã của ta,
 * không phải do model chọn, nên đây không phải một công cụ đọc tệp tuỳ ý trá hình.
 */
export async function imageBlocksFor(value: unknown, text: string): Promise<ResultBlock[] | null> {
  if (!value || typeof value !== 'object') return null;
  const o = value as { kind?: unknown; path?: unknown; mime?: unknown; size?: unknown };
  if (typeof o.path !== 'string') return null;

  // PDF đi khối `document` — tài liệu Anthropic cho phép nó ngay trong tool_result, nên đường
  // "API trực tiếp" (vốn không có công cụ đọc tệp nào) vẫn XEM được PDF đính kèm.
  const isPdf = o.kind === 'pdf';
  const isImage = o.kind === 'image';
  if (!isPdf && !isImage) return null;
  const mime = String(o.mime || (isPdf ? 'application/pdf' : 'image/png')).toLowerCase();
  const cap = isPdf ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
  if (isPdf ? !mime.includes('pdf') : !IMAGE_MIMES.includes(mime)) return null;
  if (typeof o.size === 'number' && o.size > cap) return null;
  try {
    const { readFile, stat } = await import('node:fs/promises');
    const st = await stat(o.path);
    if (st.size > cap) return null;
    const data = (await readFile(o.path)).toString('base64');
    return [
      { type: 'text', text },
      isPdf
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
        : { type: 'image', source: { type: 'base64', media_type: mime, data } },
    ];
  } catch {
    return null; // đọc không được thì cứ trả chữ như cũ
  }
}

// ── tool execution helpers ───────────────────────────────────────────────────
async function execToolValue(
  opts: RunApiAgentOptions,
  name: string,
  input: Record<string, unknown>,
): Promise<{ value: unknown; ok: boolean }> {
  try {
    return { value: await opts.execTool(name, input), ok: true };
  } catch (e) {
    return { value: (e as Error)?.message || 'lỗi tool', ok: false };
  }
}
/** Trần độ dài MỘT kết quả tool nhét vào ngữ cảnh. Đường CLI/MCP không có trần này. */
const TOOL_TEXT_CAP = 20_000;

async function execToolText(
  opts: RunApiAgentOptions,
  name: string,
  input: Record<string, unknown>,
): Promise<{ text: string; ok: boolean }> {
  const { value, ok } = await execToolValue(opts, name, input);
  return { text: await textFor(value), ok };
}

/** Chuỗi hoá một kết quả tool, có cắt theo trần và giữ lại ghi chú phiên bản. */
async function textFor(value: unknown): Promise<string> {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const raw = text || '';
  if (raw.length <= TOOL_TEXT_CAP) return raw;
  // Cắt MÙ ở giữa một chuỗi JSON là tệ hơn cắt: model nhận về JSON vỡ, và mọi bản ghi sau mốc cắt
  // biến mất LẶNG LẼ cùng file_token của chúng (đúng lúc cần chúng để đọc tệp đính kèm). Trả về một
  // bọc JSON HỢP LỆ, nói thẳng là đã cắt và phải làm gì để lấy đủ.
  // Ghi chú phiên bản nằm CUỐI object nên cắt mù sẽ nuốt đúng nó — nhấc lên trước khi cắt.
  const note =
    value && typeof value === 'object' ? (value as { _phien_ban?: unknown })._phien_ban : undefined;
  const wrapper = {
    _cat: 'kết quả quá dài nên bị cắt',
    _huong_dan: 'Gọi lại với field_names hẹp hơn hoặc page_size nhỏ hơn để lấy đủ dữ liệu.',
    _do_dai_that: raw.length,
    ...(typeof note === 'string' ? { _phien_ban: note } : {}),
    phan_dau: raw.slice(0, TOOL_TEXT_CAP),
  };
  return JSON.stringify(wrapper);
}
