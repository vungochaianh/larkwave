const _base = process.env.NEXT_PUBLIC_API_BASE || 'https://apihoanam.toolswave.net/api'
// The Lark Base Designer chat endpoint is mounted at /api-openai (legacy path)
const CHAT_URL = _base.replace(/\/api$/, '/api-openai/chat')

export async function generateSpec(payload: any) {
  const res = await fetch(CHAT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).error || "API error");
  }
  return res.json();
}
