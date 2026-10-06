// server/claude.js — gọi Claude API. Key đọc từ env, không hardcode.
const API = "https://api.anthropic.com/v1/messages";

export async function askClaude(prompt, { system, maxTokens = 4000 } = {}) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key.startsWith("dien-")) {
    throw new Error("Chưa cấu hình ANTHROPIC_API_KEY trong .env");
  }
  const res = await fetch(API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-opus-4-8",
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages: [{ role: "user", content: prompt }]
    })
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Claude API ${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.content.filter(b => b.type === "text").map(b => b.text).join("\n").trim();
}
