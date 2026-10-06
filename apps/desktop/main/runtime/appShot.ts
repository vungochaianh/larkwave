import { BrowserWindow } from 'electron';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppShot, AppShotResult } from '@larkwave/core';

/**
 * appShot.ts — screenshot the views of a LOCALLY RUNNING app so its card can show what the app
 * actually looks like instead of a generic icon.
 *
 * Same engine as siteCapture.ts (hidden BrowserWindow → loadURL → settle → capturePage), but the
 * host guard is INVERTED: siteCapture deliberately REJECTS localhost / 127.x / private hosts (SSRF
 * guard for user-supplied URLs), while every URL here is one of OUR OWN dev servers on loopback.
 * So we allow loopback http only — nothing else ever reaches the render window.
 *
 * Storage: `<appDir>/.toolswave/shots/<slug>.png` + `index.json`. NOT `meta.json` — that file is
 * rewritten wholesale at build start/end and would silently drop the pointer.
 */

/** One view to shoot: a label (for the file name) + the live URL that serves it. */
export interface ShotTarget {
  label: string;
  url: string;
}

export interface CaptureOptions {
  /** Max views to shoot in one pass (each costs a page load + settle). */
  max?: number;
  /** How long to let images / fonts / data fetches settle before shooting. */
  settleMs?: number;
  /** Per-view page-load budget. */
  timeoutMs?: number;
}

const MAX_SHOTS = 6;
const SETTLE_MS = 1800;
const LOAD_TIMEOUT_MS = 15000;
/** Card covers are ~260-640px wide — a full-size PNG would bloat the data: URL for nothing. */
const SHOT_WIDTH = 640;

/** The index written next to the PNGs. `v` lets a later format change be detected, not guessed. */
interface ShotIndex {
  v: 1;
  at: string;
  /** File name of the shot used as the card cover (the first view captured). */
  cover: string;
  shots: AppShot[];
}

/** Allow ONLY our own loopback dev servers — the exact inverse of siteCapture.isUnsafeUrl(). */
function isLoopbackHttp(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:') return false; // https/file/app/… never
    const h = u.hostname.toLowerCase();
    return h === 'localhost' || h === '::1' || h === '[::1]' || /^127\./.test(h);
  } catch {
    return false;
  }
}

/** kebab-case, diacritic-stripped file stem for a Vietnamese view label ("Trang chính" → trang-chinh). */
function slugLabel(label: string): string {
  return (
    (label || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/gi, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/g, '') || 'view'
  );
}

/** Stable, collision-free `<slug>.png` — same labels reuse the same files across captures. */
function fileNameFor(label: string, used: Set<string>): string {
  const stem = slugLabel(label);
  let name = `${stem}.png`;
  for (let n = 2; used.has(name); n++) name = `${stem}-${n}.png`;
  used.add(name);
  return name;
}

/** Drop PNGs left behind by a previous capture whose views no longer exist. Best-effort. */
async function pruneStale(dir: string, keep: Set<string>): Promise<void> {
  try {
    for (const name of await readdir(dir)) {
      if (name.endsWith('.png') && !keep.has(name)) await rm(join(dir, name), { force: true });
    }
  } catch {
    /* the shots we just wrote are what matters — leftovers are harmless */
  }
}

/**
 * Shoot each target in ONE reused hidden window and save the PNGs into
 * `${appDir}/.toolswave/shots/`, plus an `index.json` pointing at them.
 * Never throws — returns `{ ok: false, shots: [] }` when nothing could be captured.
 */
export async function captureAppShots(
  appDir: string,
  targets: ShotTarget[],
  opts?: CaptureOptions,
): Promise<AppShotResult> {
  const at = new Date().toISOString();
  const empty: AppShotResult = { ok: false, shots: [], at };
  // A dev server that died between listRunningPreviews() and here just yields no shots.
  const list = targets.filter((t) => isLoopbackHttp(t.url)).slice(0, Math.max(1, opts?.max ?? MAX_SHOTS));
  if (!list.length) return empty;

  const dir = join(appDir, '.toolswave', 'shots');
  const shots: AppShot[] = [];
  let win: BrowserWindow | null = null;
  try {
    await mkdir(dir, { recursive: true });
    win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 800,
      // A page with a transparent body captures BLACK without this — the card would look broken.
      backgroundColor: '#ffffff',
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true },
    });
    const w = win;
    const used = new Set<string>();
    for (const t of list) {
      try {
        await Promise.race([
          w.loadURL(t.url),
          new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), opts?.timeoutMs ?? LOAD_TIMEOUT_MS),
          ),
        ]);
        // Let images / web fonts / first data fetch land before shooting.
        await new Promise((r) => setTimeout(r, opts?.settleMs ?? SETTLE_MS));
        const img = await w.webContents.capturePage();
        if (img.isEmpty()) continue; // route 404'd / rendered nothing — don't save a blank card
        const file = fileNameFor(t.label, used);
        await writeFile(join(dir, file), img.resize({ width: SHOT_WIDTH }).toPNG());
        shots.push({ label: t.label, path: `.toolswave/shots/${file}`, file });
      } catch {
        /* this view failed (slow route, dev server restarting) — keep the others */
      }
    }
    if (!shots.length) return empty;

    const index: ShotIndex = { v: 1, at, cover: shots[0].file, shots };
    await writeFile(join(dir, 'index.json'), JSON.stringify(index, null, 2));
    await pruneStale(dir, new Set(shots.map((s) => s.file)));
    return { ok: true, shots, at };
  } catch {
    return empty;
  } finally {
    try {
      win?.destroy();
    } catch {
      /* already gone */
    }
  }
}
