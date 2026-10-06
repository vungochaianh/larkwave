import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AppConfigService } from '../config/app-config.service';

const pexec = promisify(execFile);

/**
 * Renders a self-contained, SEEKABLE scene.html (exposes `window.TW = { duration, fps, seek(t) }`)
 * to an mp4 by driving a headless Chromium frame-by-frame (Playwright) and muxing with ffmpeg.
 * Deterministic (each frame is a pure function of t) so it renders faster/slower than real-time.
 */
@Injectable()
export class RenderService {
  private readonly logger = new Logger(RenderService.name);
  constructor(private readonly config: AppConfigService) {}

  async render(opts: {
    sceneHtml: string;
    audioPath: string;
    durationSec: number;
    w: number;
    h: number;
    fps?: number;
  }): Promise<{ url: string; path: string; thumbnailUrl: string }> {
    const fps = opts.fps ?? 30;
    const work = join(this.config.uploadsDir, 'videos', '.work', randomBytes(6).toString('hex'));
    const framesDir = join(work, 'frames');
    await fs.mkdir(framesDir, { recursive: true });
    const scenePath = join(work, 'scene.html');
    await fs.writeFile(scenePath, opts.sceneHtml);

    // Lazy import — Playwright/Chromium is heavy; only load it when actually rendering.
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    try {
      const page = await browser.newPage({ viewport: { width: opts.w, height: opts.h }, deviceScaleFactor: 1 });
      await page.goto('file://' + scenePath, { waitUntil: 'load', timeout: 30000 });
      const meta = await page
        .evaluate(() => {
          const tw = (window as unknown as { TW?: { duration?: number; fps?: number } }).TW;
          return tw ? { duration: tw.duration, fps: tw.fps } : null;
        })
        .catch(() => null);
      // The VIDEO length is driven by the AUDIO length (so voice + visuals stay in lockstep and
      // neither gets truncated by ffmpeg -shortest). The scene's own declared duration only sets
      // its animation timeline, which we MAP across the audio: t = progress * sceneDuration.
      const audioDur = Math.min(180, Math.max(1, opts.durationSec || 1));
      const sceneDur = Math.min(600, Math.max(0.5, meta?.duration || audioDur));
      const useFps = Math.min(60, Math.max(12, meta?.fps || fps));
      const total = Math.max(1, Math.round(audioDur * useFps));
      for (let f = 0; f < total; f++) {
        const t = total > 1 ? (f / (total - 1)) * sceneDur : 0;
        await page
          .evaluate((tt) => {
            const tw = (window as unknown as { TW?: { seek?: (t: number) => void } }).TW;
            tw?.seek?.(tt);
          }, t)
          .catch(() => undefined);
        await page.screenshot({ path: join(framesDir, `${String(f).padStart(6, '0')}.png`) });
      }
      await browser.close();

      const outDir = join(this.config.uploadsDir, 'videos');
      await fs.mkdir(outDir, { recursive: true });
      const name = `${Date.now()}-${randomBytes(4).toString('hex')}.mp4`;
      const outPath = join(outDir, name);
      await pexec(
        'ffmpeg',
        [
          '-y',
          '-framerate', String(useFps),
          '-i', join(framesDir, '%06d.png'),
          '-i', opts.audioPath,
          '-c:v', 'libx264',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-shortest',
          '-movflags', '+faststart',
          outPath,
        ],
        { maxBuffer: 1 << 26 },
      );
      await fs.rm(work, { recursive: true, force: true }).catch(() => undefined);
      // Extract a poster frame (~10% in) for the Telegram thumbnail.
      const thumbUrl = await this.thumbnail(outPath, name).catch(() => '');
      return { url: `${this.config.publicApiUrl}/uploads/videos/${name}`, path: outPath, thumbnailUrl: thumbUrl };
    } catch (e) {
      await browser.close().catch(() => undefined);
      await fs.rm(work, { recursive: true, force: true }).catch(() => undefined);
      throw e;
    }
  }

  /** Extract a single poster frame from a rendered mp4 → PNG under uploads/videos. */
  private async thumbnail(videoPath: string, videoName: string): Promise<string> {
    const name = videoName.replace(/\.mp4$/, '') + '-thumb.jpg';
    const outPath = join(this.config.uploadsDir, 'videos', name);
    await pexec('ffmpeg', ['-y', '-ss', '1', '-i', videoPath, '-frames:v', '1', '-q:v', '3', outPath], { maxBuffer: 1 << 24 });
    return `${this.config.publicApiUrl}/uploads/videos/${name}`;
  }

  /**
   * Render a self-contained HTML document to a single PNG (poster / social card / blog cover).
   * Waits for fonts + a short settle so gradients/webfonts paint, then screenshots at w×h.
   */
  async renderImage(opts: { html: string; w: number; h: number }): Promise<{ url: string; path: string }> {
    const work = join(this.config.uploadsDir, 'images', '.work', randomBytes(6).toString('hex'));
    await fs.mkdir(work, { recursive: true });
    const scenePath = join(work, 'poster.html');
    await fs.writeFile(scenePath, opts.html);
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    try {
      const page = await browser.newPage({ viewport: { width: opts.w, height: opts.h }, deviceScaleFactor: 2 });
      await page.goto('file://' + scenePath, { waitUntil: 'load', timeout: 30000 });
      await page.evaluate(() => (document as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts?.ready).catch(() => undefined);
      await page.waitForTimeout(400);
      const outDir = join(this.config.uploadsDir, 'images');
      await fs.mkdir(outDir, { recursive: true });
      const name = `${Date.now()}-${randomBytes(4).toString('hex')}.png`;
      const outPath = join(outDir, name);
      await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: opts.w, height: opts.h } });
      await browser.close();
      await fs.rm(work, { recursive: true, force: true }).catch(() => undefined);
      return { url: `${this.config.publicApiUrl}/uploads/images/${name}`, path: outPath };
    } catch (e) {
      await browser.close().catch(() => undefined);
      await fs.rm(work, { recursive: true, force: true }).catch(() => undefined);
      throw e;
    }
  }
}
