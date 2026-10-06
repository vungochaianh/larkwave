# Video Studio — design & plan (2026-08-29)

AI video generator with templates (game / pixel / whiteboard-draw), ElevenLabs voice, and
scheduled auto-delivery to Telegram. Decision: **self-host rendering on the VPS** (60GB/16-core).

## Feasibility (verified)
- MAIC canNOT render/return video (`/v1/ask` = text; `/v1/runs` = text-only file return, no
  ffmpeg/chromium documented). Our old API image had no video tooling either.
- **ffmpeg 6.1.1 + libx264 installed on the VPS** (apt). **Playwright Chromium cached** at
  `/root/.cache/ms-playwright/chromium-1234`.
- **POC PROVEN on the VPS**: seekable HTML canvas → Playwright per-frame screenshot → ffmpeg →
  h264 mp4 (60 frames @30fps, 2.0s). This is the render engine.

## Pipeline
1. User picks **template + topic + voice** (+ optional schedule + Telegram target).
2. MAIC (Claude) writes the **narration script** from the topic in the template's style.
3. **ElevenLabs** TTS → narration mp3; `ffprobe` → `durationSec`.
4. MAIC generates a **self-contained seekable scene** (`scene.html`) in the chosen style, timed to
   `durationSec`. Contract: the page exposes `window.TW = { duration, fps, seek(t) }` where
   `seek(t)` deterministically renders the frame at time `t` (like Remotion).
5. **Render** (VPS): Playwright loads scene.html at 1080×1920 (or 1280×720), loops
   `0..duration*fps` calling `TW.seek(t)` + screenshot; ffmpeg assembles frames + mp3 →
   `-c:v libx264 -pix_fmt yuv420p -c:a aac -shortest` → mp4.
6. Store mp4 in `UPLOADS_DIR/videos/<id>.mp4` → served at `${PUBLIC_API_URL}/uploads/videos/...`.
7. **Deliver**: on schedule, Telegram `sendVideo` by URL (≤20MB URL / ≤50MB multipart).

## Build phases
- **Infra (done)**: ffmpeg installed; Chromium cached. TODO: make Chromium usable by the `app`
  user (deploy runs as `app`) — set `PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright` + `npx playwright
  install chromium` in deploy, OR install into app's cache. Add `playwright` to apps/api deps.
- **P1 backend**: `video` module — RenderService (playwright+ffmpeg), TtsService (ElevenLabs
  `GET /v1/voices` list w/ `preview_url`, `POST /v1/text-to-speech/{id}` synth), template registry
  (game/pixel/draw prompts + seekable harness), VideoProject Prisma model, controller (voices,
  create, list, get, render async, delete). `TelegramService.sendVideo`. env `ELEVENLABS_API_KEY`
  (add to env.ts `.optional().default('')` + forward in deploy/gitlab-bootstrap.sh).
- **P2 web UI**: "Video Studio" (under /claude group per the Claude-workspace directive): template
  cards, topic input, voice picker (list + play `preview_url` + pick), render + preview, my videos.
- **P3 scheduling→Telegram**: extend `ScheduledTask` (already has `deliver` + cron runner) OR a
  dedicated VideoSchedule; wire `runTask` to render + `sendVideo` to the user's `TelegramBinding`
  (the `deliver='telegram'` branch is currently declared but NOT acted on).

## Key files
- Render/infra: VPS ffmpeg (`/usr/bin/ffmpeg`), Playwright chromium cache.
- TTS/env: `apps/api/src/config/env.ts` (add ELEVENLABS_API_KEY), `.deploy-secrets` (key present),
  `deploy/gitlab-bootstrap.sh` (forward), `apps/api/src/main.ts` (`/uploads` static), `me.service.ts`
  (disk-write recipe).
- Scheduled: `apps/api/src/scheduled/*` (model has `deliver`; runner ignores it). Telegram:
  `apps/api/src/agent/telegram.service.ts` (only `sendMessage` today; add `sendVideo`),
  `TelegramBinding` model, `notifyTaskDone` pattern.
