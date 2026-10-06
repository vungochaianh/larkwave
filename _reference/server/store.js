// server/store.js — lưu config + job vào file JSON (đơn giản, tự chứa).
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = join(root, "config", "pipeline.json");
const DEFAULT_PATH = join(root, "config", "pipeline.default.json");
const JOBS_DIR = join(root, "jobs");

export async function getConfig() {
  const path = existsSync(CONFIG_PATH) ? CONFIG_PATH : DEFAULT_PATH;
  return JSON.parse(await readFile(path, "utf8"));
}

export async function saveConfig(cfg) {
  await writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf8");
  return cfg;
}

export async function saveJob(job) {
  if (!existsSync(JOBS_DIR)) await mkdir(JOBS_DIR, { recursive: true });
  await writeFile(join(JOBS_DIR, `${job.id}.json`), JSON.stringify(job, null, 2), "utf8");
  return job;
}

export async function getJob(id) {
  const p = join(JOBS_DIR, `${id}.json`);
  return existsSync(p) ? JSON.parse(await readFile(p, "utf8")) : null;
}

export async function listJobs() {
  if (!existsSync(JOBS_DIR)) return [];
  const files = (await readdir(JOBS_DIR)).filter(f => f.endsWith(".json"));
  const jobs = await Promise.all(files.map(f => readFile(join(JOBS_DIR, f), "utf8").then(JSON.parse)));
  return jobs.sort((a, b) => b.createdAt - a.createdAt);
}
