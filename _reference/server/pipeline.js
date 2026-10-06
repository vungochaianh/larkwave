// server/pipeline.js — logic 6 giai đoạn. Mỗi bước cập nhật job và lưu lại.
import { askClaude } from "./claude.js";
import { getConfig, saveJob } from "./store.js";

const STAGES = ["intake", "spec", "code", "build", "preview", "deploy"];

function slugify(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 40) || "app";
}

function fill(tpl, vars) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

async function step(job, name, n, fn) {
  job.stages[name] = { status: "running", startedAt: Date.now() };
  await saveJob(job);
  try {
    const out = await fn();
    job.stages[name] = { status: "done", finishedAt: Date.now(), output: out };
    job.log.push(`[${n}/6] ${name} ✔`);
    await saveJob(job);
    return out;
  } catch (e) {
    job.stages[name] = { status: "error", error: String(e.message || e) };
    job.status = "error";
    job.log.push(`[${n}/6] ${name} ✘ LỖI: ${e.message}`);
    await saveJob(job);
    throw e;
  }
}

export async function runPipeline(job) {
  const cfg = await getConfig();
  job.status = "running";
  job.log = job.log || [];
  job.stages = {};
  await saveJob(job);

  try {
    // [1/6] INTAKE — phân loại track
    const track = await step(job, "intake", 1, async () => {
      const raw = (await askClaude(fill(cfg.prompts.classify, { USER_PROMPT: job.prompt }))).toLowerCase();
      const t = ["web", "mobile", "extension"].find(x => raw.includes(x)) || "web";
      job.track = t;
      job.slug = slugify(job.name || job.prompt);
      return { track: t, slug: job.slug };
    });

    // [2/6] SPEC
    const spec = await step(job, "spec", 2, () =>
      askClaude(fill(cfg.prompts.spec, { TRACK: track.track, USER_PROMPT: job.prompt }), { maxTokens: 1500 })
    );
    job.spec = spec;

    // [3/6] CODE
    const stack = JSON.stringify(cfg.tracks[track.track].stack);
    const code = await step(job, "code", 3, () =>
      askClaude(fill(cfg.prompts.codegen, { STACK: stack, SPEC: spec }), { maxTokens: 8000 })
    );
    job.code = code;

    // [4/6] BUILD — placeholder: nơi gọi runner thật trên server qua Tailscale/SSH.
    await step(job, "build", 4, async () => {
      // TODO production: gọi script deploy/build trên DEPLOY_HOST với DEPLOY_USER.
      // Hiện trả về trạng thái mô phỏng để pipeline chạy thông end-to-end.
      return { built: true, note: "Build runner thật cấu hình ở deploy/ — xem README" };
    });

    // [5/6] PREVIEW
    await step(job, "preview", 5, async () => ({
      ready: true,
      note: track.track === "mobile"
        ? "Expo Go QR (cấu hình EAS ở deploy/)"
        : "Cloudflare Pages preview (cấu hình ở deploy/.gitlab-ci.yml)"
    }));

    // [6/6] DEPLOY
    await step(job, "deploy", 6, async () => {
      const domain = process.env.DOMAIN_GOC || "toolswave.net";
      if (track.track === "web")
        return { url: `https://${job.slug}.${domain}`, status: "cần runner deploy thật (deploy/)" };
      if (track.track === "mobile")
        return { status: "EAS build — cần token thật trong .env" };
      return { status: "đã sinh source + hướng dẫn (Track C)" };
    });

    job.status = "done";
    job.log.push("✔ Hoàn tất pipeline");
    await saveJob(job);
  } catch (e) {
    // đã ghi lỗi trong step()
  }
  return job;
}

export { STAGES };
