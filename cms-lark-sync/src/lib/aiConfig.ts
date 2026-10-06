/**
 * Client-side AI provider configuration.
 *
 * Stores the user's preferred provider, API key, and model in localStorage.
 * Passed as { aiProvider, aiApiKey, aiModel } in every AI request body so
 * the server can use the user's own keys without requiring server env changes.
 *
 * To add a new provider:
 *   1. Add an entry to AI_PROVIDERS
 *   2. Add the provider key to ProviderKey in aiProvider.ts (server-side)
 */

export const AI_PROVIDERS = {
  anthropic: {
    label:       'Anthropic (Claude)',
    keyLabel:    'API Key',
    keyPrefix:   'sk-ant-',
    placeholder: 'sk-ant-api03-…',
    docsUrl:     'https://console.anthropic.com/settings/keys',
    models: [
      { value: 'claude-sonnet-4-6',        label: 'Claude Sonnet 4.6  (Recommended)' },
      { value: 'claude-opus-4-6',          label: 'Claude Opus 4.6  (Most capable)' },
      { value: 'claude-haiku-4-5-20251001',label: 'Claude Haiku 4.5  (Fastest / cheapest)' },
    ],
    defaultModel: 'claude-sonnet-4-6',
  },
  openai: {
    label:       'OpenAI (GPT)',
    keyLabel:    'API Key',
    keyPrefix:   'sk-',
    placeholder: 'sk-proj-…',
    docsUrl:     'https://platform.openai.com/api-keys',
    models: [
      { value: 'gpt-4o',       label: 'GPT-4o  (Recommended)' },
      { value: 'gpt-4o-mini',  label: 'GPT-4o Mini  (Fast / cheap)' },
      { value: 'gpt-4-turbo',  label: 'GPT-4 Turbo' },
      { value: 'o1-mini',      label: 'o1 Mini  (Reasoning)' },
    ],
    defaultModel: 'gpt-4o',
  },
  gemini: {
    label:       'Google (Gemini)',
    keyLabel:    'API Key',
    keyPrefix:   'AIza',
    placeholder: 'AIzaSy…',
    docsUrl:     'https://aistudio.google.com/app/apikey',
    models: [
      { value: 'gemini-1.5-pro',   label: 'Gemini 1.5 Pro  (Recommended)' },
      { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash  (Fast / cheap)' },
      { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash  (Latest)' },
    ],
    defaultModel: 'gemini-1.5-pro',
  },
  nvidia: {
    label:       'NVIDIA NIM (Free tier)',
    keyLabel:    'API Key',
    keyPrefix:   'nvapi-',
    placeholder: 'nvapi-…',
    docsUrl:     'https://build.nvidia.com/explore/discover',
    models: [
      { value: 'meta/llama-3.3-70b-instruct',           label: 'Llama 3.3 70B  (Recommended)' },
      { value: 'deepseek-ai/deepseek-r1',               label: 'DeepSeek R1  (Reasoning)' },
      { value: 'qwen/qwen2.5-72b-instruct',             label: 'Qwen 2.5 72B' },
      { value: 'nvidia/llama-3.1-nemotron-70b-instruct',label: 'Nemotron 70B' },
      { value: 'meta/llama-3.1-405b-instruct',          label: 'Llama 3.1 405B  (Largest)' },
    ],
    defaultModel: 'meta/llama-3.3-70b-instruct',
  },
  ollama: {
    label:       'Ollama (Self-hosted, Free)',
    keyLabel:    'API Key (leave blank)',
    keyPrefix:   '',
    placeholder: '(not required)',
    docsUrl:     'https://ollama.com/library',
    models: [
      { value: 'llama3.1:8b',   label: 'Llama 3.1 8B  (Fast / light)' },
      { value: 'qwen2.5:14b',   label: 'Qwen 2.5 14B' },
      { value: 'qwen2.5:72b',   label: 'Qwen 2.5 72B  (Best quality)' },
      { value: 'llama3.3:70b',  label: 'Llama 3.3 70B' },
      { value: 'deepseek-r1:14b', label: 'DeepSeek R1 14B  (Reasoning)' },
      { value: 'llava:13b',     label: 'LLaVA 13B  (Vision)' },
    ],
    defaultModel: 'llama3.1:8b',
  },
} as const

export type ProviderKey = keyof typeof AI_PROVIDERS

export interface AIConfig {
  provider: ProviderKey
  /** API keys per provider — stored separately so switching doesn't wipe other keys */
  keys: Partial<Record<ProviderKey, string>>
  /** Selected model per provider */
  models: Partial<Record<ProviderKey, string>>
}

const STORAGE_KEY = 'hn_ai_config'

const DEFAULT_CONFIG: AIConfig = {
  provider: 'anthropic',
  keys:     {},
  models:   {},
}

// ── Accessors ─────────────────────────────────────────────────────────────────

export function getAIConfig(): AIConfig {
  if (typeof window === 'undefined') return DEFAULT_CONFIG
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  } catch {}
  return DEFAULT_CONFIG
}

export function saveAIConfig(config: AIConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

/** Convenience: get the active provider key, api key, and model as flat fields for request bodies. */
export function getActiveAIParams(): { aiProvider: ProviderKey; aiApiKey: string; aiModel: string } {
  const cfg      = getAIConfig()
  const provider = cfg.provider
  const apiKey   = cfg.keys[provider] ?? ''
  const model    = cfg.models[provider] ?? AI_PROVIDERS[provider].defaultModel
  return { aiProvider: provider, aiApiKey: apiKey, aiModel: model }
}
