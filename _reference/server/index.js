// server/index.js — API orchestrator + phục vụ CMS tĩnh.
import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFile } from "node:fs/promises";
import { getConfig, saveConfig, saveJob, getJob, listJobs } from "./store.js";
import { runPipeline } from "./pipeline.js";

// nạp .env đơn giản (không cần thư viện ngoài)
try {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const env = await readFile(join(root, ".env"), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* .env chưa có cũng chạy được phần CMS */ }

const app = express();
app.use(express.json({ limit: "2mb" }));
const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
app.use(express.static(PUBLIC));

// auth CMS đơn giản qua header (đặt CMS_PASSWORD trong .env)
app.use("/api", (req, res, next) => {
  const pw = process.env.CMS_PASSWORD;
  if (!pw || pw.startsWith("dat-mot")) return next(); // chưa đặt pass thì mở
  if (req.headers["x-cms-pass"] === pw) return next();
  res.status(401).json({ error: "Sai mật khẩu CMS" });
});

// --- Config (CMS đọc/sửa) ---
app.get("/api/config", async (_, res) => res.json(await getConfig()));
app.put("/api/config", async (req, res) => res.json(await saveConfig(req.body)));

// --- Jobs ---
app.get("/api/jobs", async (_, res) => res.json(await listJobs()));
app.get("/api/jobs/:id", async (req, res) => {
  const j = await getJob(req.params.id);
  j ? res.json(j) : res.status(404).json({ error: "Không thấy job" });
});

// --- Tạo app từ prompt ---
app.post("/api/build", async (req, res) => {
  const { prompt, name } = req.body || {};
  if (!prompt) return res.status(400).json({ error: "Thiếu prompt" });
  const job = {
    id: Date.now().toString(36),
    prompt, name: name || "",
    status: "queued", createdAt: Date.now(), log: [], stages: {}
  };
  await saveJob(job);
  res.json({ id: job.id }); // trả ngay, chạy nền
  runPipeline(job).catch(() => {});
});

const PORT = process.env.CMS_PORT || 8080;
app.listen(PORT, () => console.log(`Toolswave App Builder CMS: http://localhost:${PORT}`));
