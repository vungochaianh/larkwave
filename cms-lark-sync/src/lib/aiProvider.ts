/**
 * Unified AI provider — abstracts Anthropic, OpenAI, Gemini, NVIDIA NIM, and
 * self-hosted Ollama behind a single `aiChat()` / `aiChatStream()` call.
 *
 * Used exclusively by Next.js API routes (server-side).
 * The client sends { aiProvider, aiApiKey, aiModel } in each request body;
 * routes fall back to environment variables when those are absent.
 *
 * Adding a new OpenAI-compatible provider:
 *   1. Add it to ProviderKey union + DEFAULT_MODELS + PROVIDER_BASE_URLS
 *   2. Add a case in aiChat() and aiChatStream() that calls openaiCompatibleChat(Stream)
 */

export type ProviderKey = 'anthropic' | 'openai' | 'gemini' | 'nvidia' | 'ollama'

export interface ChatInput {
  provider:     ProviderKey
  apiKey:       string
  model?:       string
  systemPrompt: string
  userMessage:  string
  maxTokens?:   number
  /** Optional override for OpenAI-compatible providers (e.g. custom Ollama host) */
  baseUrl?:     string
}

/** Default models per provider */
const DEFAULT_MODELS: Record<ProviderKey, string> = {
  anthropic: 'claude-sonnet-4-6',
  openai:    'gpt-4o',
  gemini:    'gemini-1.5-pro',
  nvidia:    'meta/llama-3.3-70b-instruct',
  ollama:    'llama3.1:8b',
}

/** Base URLs for OpenAI-compatible providers */
const PROVIDER_BASE_URLS: Record<'openai' | 'nvidia' | 'ollama', string> = {
  openai: 'https://api.openai.com',
  nvidia: 'https://integrate.api.nvidia.com',
  ollama: 'http://ollama:11434',     // docker-compose service; override via input.baseUrl for local dev
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Send a chat message to the configured AI provider and return the text response.
 * Throws on network or API error.
 */
export async function aiChat(input: ChatInput): Promise<string> {
  switch (input.provider) {
    case 'anthropic': return anthropicChat(input)
    case 'openai':    return openaiCompatibleChat(input, input.baseUrl || PROVIDER_BASE_URLS.openai)
    case 'nvidia':    return openaiCompatibleChat(input, input.baseUrl || PROVIDER_BASE_URLS.nvidia)
    case 'ollama':    return openaiCompatibleChat(input, input.baseUrl || PROVIDER_BASE_URLS.ollama)
    case 'gemini':    return geminiChat(input)
    default:
      throw new Error(`Unknown AI provider: "${(input as ChatInput).provider}". Supported: anthropic, openai, gemini, nvidia, ollama`)
  }
}

/**
 * Resolve the effective AI config from a request body + process env.
 * Priority: stored config (aiConfigId) > body fields > env
 *
 * Usage in API routes:
 *   const { provider, apiKey, model } = await resolveAIConfig(body)
 */
export async function resolveAIConfig(body: Record<string, any>): Promise<{ provider: ProviderKey; apiKey: string; model: string; baseUrl?: string }> {
  // New: resolve from stored config ID
  if (body.aiConfigId) {
    const base = process.env.NEXT_PUBLIC_API_BASE || 'https://apihoanam.toolswave.net/api'
    try {
      const res = await fetch(`${base}/ai-configs/${body.aiConfigId}/resolve`, { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        if (data.success && data.data) {
          const cfg = data.data
          const provider: ProviderKey = (cfg.provider === 'google' ? 'gemini' : cfg.provider) as ProviderKey
          const apiKey = cfg.apiKey ?? (provider === 'ollama' ? 'ollama' : '')
          return { provider, apiKey, model: cfg.model ?? DEFAULT_MODELS[provider], baseUrl: cfg.baseUrl || undefined }
        }
      }
    } catch { /* fall through to legacy */ }
  }

  // Legacy: from request body fields
  const provider: ProviderKey = body.aiProvider ?? process.env.AI_PROVIDER ?? 'anthropic'
  const apiKey: string =
    body.aiApiKey ??
    (provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY :
     provider === 'openai'    ? process.env.OPENAI_API_KEY    :
     provider === 'gemini'    ? process.env.GEMINI_API_KEY    :
     provider === 'nvidia'    ? process.env.NVIDIA_API_KEY    :
     provider === 'ollama'    ? 'ollama'                      : '') ?? ''
  if (!apiKey) {
    throw new Error(`No API key for provider "${provider}". Configure AI in Settings → AI API Keys.`)
  }
  const model: string = body.aiModel ?? DEFAULT_MODELS[provider]
  return { provider, apiKey, model, baseUrl: body.aiBaseUrl || undefined }
}

// ── Anthropic ─────────────────────────────────────────────────────────────────

async function anthropicChat(input: ChatInput): Promise<string> {
  const model = input.model ?? DEFAULT_MODELS.anthropic

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'x-api-key':         input.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: input.maxTokens ?? 4096,
      system:     input.systemPrompt,
      messages:   [{ role: 'user', content: input.userMessage }],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `Anthropic API error ${res.status}`)
  }

  const data = await res.json()
  return data.content?.[0]?.text ?? ''
}

// ── OpenAI-compatible (openai, nvidia, ollama, and future providers) ─────────

async function openaiCompatibleChat(input: ChatInput, baseUrl: string): Promise<string> {
  const model = input.model ?? DEFAULT_MODELS[input.provider] ?? DEFAULT_MODELS.openai

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${input.apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: input.maxTokens ?? 4096,
      messages: [
        { role: 'system', content: input.systemPrompt },
        { role: 'user',   content: input.userMessage  },
      ],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `${input.provider} API error ${res.status}`)
  }

  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

// ── Streaming API ─────────────────────────────────────────────────────────────

/**
 * Send a streaming chat message. Returns a `Response` with a plain-text
 * streaming body. Gemini falls back to a single-chunk response.
 */
export async function aiChatStream(input: ChatInput): Promise<Response> {
  switch (input.provider) {
    case 'anthropic': return anthropicChatStream(input)
    case 'openai':    return openaiCompatibleChatStream(input, input.baseUrl || PROVIDER_BASE_URLS.openai)
    case 'nvidia':    return openaiCompatibleChatStream(input, input.baseUrl || PROVIDER_BASE_URLS.nvidia)
    case 'ollama':    return openaiCompatibleChatStream(input, input.baseUrl || PROVIDER_BASE_URLS.ollama)
    case 'gemini': {
      // Gemini v1beta does not support SSE streaming — return full text as one chunk
      const text = await geminiChat(input)
      return new Response(text, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    }
    default:
      throw new Error(`Unknown AI provider: "${(input as ChatInput).provider}"`)
  }
}

/**
 * Sentinel prefix written into the stream when a mid-stream API error is
 * detected (e.g. Anthropic overloaded, OpenAI rate limit).
 * The client checks for this prefix BEFORE attempting JSON.parse.
 */
export const STREAM_ERROR_SENTINEL = '\x00ERR:'

async function anthropicChatStream(input: ChatInput): Promise<Response> {
  const model = input.model ?? DEFAULT_MODELS.anthropic
  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method:  'POST',
    headers: {
      'x-api-key':         input.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: input.maxTokens ?? 4096,
      stream:     true,
      system:     input.systemPrompt,
      messages:   [{ role: 'user', content: input.userMessage }],
    }),
  })

  if (!upstream.ok) {
    const err = await upstream.json().catch(() => ({}))
    throw new Error(err.error?.message || `Anthropic API error ${upstream.status}`)
  }

  const stream = new ReadableStream({
    async start(controller) {
      const reader  = upstream.body!.getReader()
      // Use { fatal: false } so split multi-byte sequences don't throw
      const decoder = new TextDecoder('utf-8', { fatal: false })
      const enc     = new TextEncoder()
      // Buffer incomplete SSE lines across chunk boundaries
      let lineBuffer = ''
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          // Append decoded text; { stream: true } keeps buffered bytes for split multi-byte chars
          lineBuffer += decoder.decode(value, { stream: true })
          const lines = lineBuffer.split('\n')
          // The last element may be an incomplete line — keep it in buffer
          lineBuffer = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const raw = line.slice(6).trim()
            if (!raw || raw === '[DONE]') continue
            try {
              const parsed = JSON.parse(raw)
              if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
                controller.enqueue(enc.encode(parsed.delta.text))
              } else if (parsed.type === 'error') {
                const msg = parsed.error?.message || parsed.error?.type || 'Anthropic stream error'
                controller.enqueue(enc.encode(`${STREAM_ERROR_SENTINEL}${msg}`))
                controller.close(); return
              }
            } catch { /* skip truly malformed SSE events */ }
          }
        }
        // Flush decoder + handle any remaining complete line in buffer
        lineBuffer += decoder.decode()
        if (lineBuffer.startsWith('data: ')) {
          const raw = lineBuffer.slice(6).trim()
          if (raw && raw !== '[DONE]') {
            try {
              const parsed = JSON.parse(raw)
              if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
                controller.enqueue(enc.encode(parsed.delta.text))
              }
            } catch { }
          }
        }
      } finally { controller.close() }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':      'text/plain; charset=utf-8',
      'X-Accel-Buffering': 'no',
    },
  })
}

async function openaiCompatibleChatStream(input: ChatInput, baseUrl: string): Promise<Response> {
  const model = input.model ?? DEFAULT_MODELS[input.provider] ?? DEFAULT_MODELS.openai
  const upstream = await fetch(`${baseUrl}/v1/chat/completions`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${input.apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: input.maxTokens ?? 4096,
      stream:     true,
      messages: [
        { role: 'system', content: input.systemPrompt },
        { role: 'user',   content: input.userMessage  },
      ],
    }),
  })

  if (!upstream.ok) {
    const err = await upstream.json().catch(() => ({}))
    throw new Error(err.error?.message || `${input.provider} API error ${upstream.status}`)
  }

  const stream = new ReadableStream({
    async start(controller) {
      const reader  = upstream.body!.getReader()
      const decoder = new TextDecoder('utf-8', { fatal: false })
      const enc     = new TextEncoder()
      let lineBuffer = ''
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          lineBuffer += decoder.decode(value, { stream: true })
          const lines = lineBuffer.split('\n')
          lineBuffer = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const raw = line.slice(6).trim()
            if (!raw || raw === '[DONE]') continue
            try {
              const parsed = JSON.parse(raw)
              if (parsed.error) {
                const msg = parsed.error?.message || `${input.provider} stream error`
                controller.enqueue(enc.encode(`${STREAM_ERROR_SENTINEL}${msg}`))
                controller.close(); return
              }
              const text = parsed.choices?.[0]?.delta?.content
              if (text) controller.enqueue(enc.encode(text))
            } catch { }
          }
        }
        // Flush remaining
        lineBuffer += decoder.decode()
        if (lineBuffer.startsWith('data: ')) {
          const raw = lineBuffer.slice(6).trim()
          if (raw && raw !== '[DONE]') {
            try {
              const parsed = JSON.parse(raw)
              const text = parsed.choices?.[0]?.delta?.content
              if (text) controller.enqueue(enc.encode(text))
            } catch { }
          }
        }
      } finally { controller.close() }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':      'text/plain; charset=utf-8',
      'X-Accel-Buffering': 'no',
    },
  })
}

// ── Google Gemini ─────────────────────────────────────────────────────────────

async function geminiChat(input: ChatInput): Promise<string> {
  const model = input.model ?? DEFAULT_MODELS.gemini

  // Gemini uses system instruction + user turn
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${input.apiKey}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: input.systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: input.userMessage }] }],
        generationConfig: { maxOutputTokens: input.maxTokens ?? 4096 },
      }),
    },
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `Gemini API error ${res.status}`)
  }

  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}
