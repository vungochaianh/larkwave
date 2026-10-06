#!/usr/bin/env node
/**
 * Diagnose a Toolswave build from just its URL (or build id).
 *
 *   node scripts/diagnose-build.mjs "https://toolswave.net/apps/<appId>?build=<buildId>"
 *   node scripts/diagnose-build.mjs <buildId>
 *
 * Admin-authenticates with the creds in `.deploy-secrets` (TW_ADMIN_EMAIL /
 * TW_ADMIN_PASSWORD — gitignored, never committed) and calls GET /v1/builds/:id,
 * which for an admin returns the build's error + stages + logs + the FULL source
 * `files`. It prints a diagnosis summary and writes the source to
 * /tmp/diag-<buildId>/ (and logs to /tmp/diag-<buildId>.log) so the source can be
 * read/grepped to find the root cause — no repo clone or pasted error needed.
 *
 * Override the API base with TW_API_BASE (default https://api.toolswave.net/v1).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const API = process.env.TW_API_BASE || "https://api.toolswave.net/v1";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const arg = process.argv[2];
if (!arg) {
  console.error("Usage: node scripts/diagnose-build.mjs <build-url-or-id>");
  process.exit(1);
}
// Build id from ?build=<id> (or &build=), else treat the whole arg as the id.
const buildId = arg.match(/[?&]build=([a-z0-9]+)/i)?.[1] || arg.trim();
const appId = arg.match(/\/apps\/([a-z0-9]+)/i)?.[1] || null;

const secrets = Object.fromEntries(
  readFileSync(resolve(repoRoot, ".deploy-secrets"), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1)];
    }),
);
const email = secrets.TW_ADMIN_EMAIL;
const password = secrets.TW_ADMIN_PASSWORD;
if (!email || !password) {
  console.error("Missing TW_ADMIN_EMAIL / TW_ADMIN_PASSWORD in .deploy-secrets");
  process.exit(1);
}

const login = await fetch(`${API}/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password }),
});
if (!login.ok) {
  console.error("Login failed:", login.status, await login.text());
  process.exit(1);
}
const { token } = await login.json();

const r = await fetch(`${API}/builds/${buildId}`, {
  headers: { authorization: `Bearer ${token}` },
});
if (!r.ok) {
  console.error(`GET /builds/${buildId} failed:`, r.status, await r.text());
  if (appId) console.error(`(app ${appId} — append ?build=<id> to a specific build)`);
  process.exit(1);
}
const b = await r.json();

console.log(`=== BUILD ${buildId} ===`);
console.log(`app: ${b.appId} | mode: ${b.mode} | track: ${b.track} | status: ${b.status}`);
console.log(`prompt: ${(b.prompt || "").slice(0, 140)}`);
if (Array.isArray(b.stages)) {
  console.log("stages: " + b.stages.map((s) => `${s.name}:${s.status}`).join("  "));
}
console.log("\n--- ERROR ---\n" + (b.error || "(none)"));

const files = Array.isArray(b.files) ? b.files : [];
const out = `/tmp/diag-${buildId}`;
for (const f of files) {
  const p = join(out, String(f.path).replace(/^\/+/, ""));
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, f.content ?? "");
}
console.log(`\n--- SOURCE (${files.length} files) → ${out}/ ---`);
console.log(
  files
    .map((f) => f.path)
    .sort()
    .slice(0, 100)
    .join("\n"),
);

if (Array.isArray(b.logs) && b.logs.length) {
  const logPath = `/tmp/diag-${buildId}.log`;
  writeFileSync(
    logPath,
    b.logs.map((l) => (typeof l === "string" ? l : JSON.stringify(l))).join("\n"),
  );
  console.log(`\n--- logs (${b.logs.length}) → ${logPath} ---`);
}
