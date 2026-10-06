import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * renderGuard.ts — stop a generated Vite app from booting to a WHITE SCREEN.
 *
 * The CLI sometimes writes the game/logic files but forgets the React ENTRY chain
 * (`index.html` → `/src/main.tsx` → `./App` + `./index.css`). Vite still serves fine, the
 * entry module 404s, and NOTHING errors — so the old post-build guard (which only checks JS
 * relative imports) missed it and the build reported "ready" over a blank page.
 *
 * This guard parses index.html for the module entry and DETERMINISTICALLY scaffolds any missing
 * boilerplate (main.tsx, index.css) — no AI needed. If the app's own `App` screen is missing it
 * writes a clear PLACEHOLDER (never a blank page) and flags `missingApp` so the caller can mark the
 * build as needing a real fix. Runs both after a build AND on preview open (auto-fix first).
 */

export interface RenderGuardResult {
  /** Files this guard created (relative to `dir`). */
  scaffolded: string[];
  /** The app's own main screen (src/App.*) was missing → a placeholder was written; needs a real fix. */
  missingApp: boolean;
}

const PLACEHOLDER_APP = `// Màn tạm do Larkwave tạo vì app chưa có src/App — để không bị trắng trang.
// Bấm "Nhờ AI sửa" (hoặc chạy lại) để AI dựng màn hình chính thật.
export default function App() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b0b13', color: '#e7e7f2', fontFamily: 'system-ui, sans-serif', textAlign: 'center', padding: 24 }}>
      <div style={{ maxWidth: 460 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🛠️</div>
        <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Ứng dụng chưa dựng xong màn hình chính</h1>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: '#a9a9c0', margin: 0 }}>
          Bản dựng thiếu <code>src/App</code>. Larkwave đã tạo màn tạm này để không bị trắng trang.
          Bấm <b>“Nhờ AI sửa”</b> ở khung xem trước (hoặc chạy lại) để AI hoàn tất giao diện.
        </p>
      </div>
    </div>
  );
}
`;

function mainEntrySource(isTs: boolean): string {
  const bang = isTs ? '!' : '';
  return (
    `import React from 'react';\n` +
    `import { createRoot } from 'react-dom/client';\n` +
    `import App from './App';\n` +
    `import './index.css';\n\n` +
    `createRoot(document.getElementById('root')${bang}).render(\n` +
    `  <React.StrictMode>\n` +
    `    <App />\n` +
    `  </React.StrictMode>,\n` +
    `);\n`
  );
}

/** The entry-chain files that are MISSING (for a repair-turn prompt). Empty = renderable or N/A. */
export async function entryChainMissing(dir: string): Promise<string[]> {
  let html: string;
  try {
    html = await readFile(join(dir, 'index.html'), 'utf8');
  } catch {
    return []; // no index.html → not a Vite web app we guard
  }
  const entryRel = htmlEntry(html);
  if (!entryRel) return [];
  const out: string[] = [];
  if (!existsSync(join(dir, entryRel))) out.push(entryRel);
  if (!existsSync(join(dir, 'src', 'App.tsx')) && !existsSync(join(dir, 'src', 'App.jsx'))) out.push('src/App.tsx');
  if (!existsSync(join(dir, 'src', 'index.css'))) out.push('src/index.css');
  return out;
}

/** Markers of a NON-real App: our own scaffold placeholder. Kept in sync with PLACEHOLDER_APP. */
const STUB_MARKERS = ['Màn tạm do Larkwave', 'Bản dựng thiếu'];

/** src/ subdirs that indicate a real logic/UI layer was written (used by both the stub heuristic
 *  and the continuation prompt so the agent wires up existing code instead of rebuilding). */
const LIB_DIR_CANDIDATES = ['lib', 'pages', 'components', 'features', 'game', 'data', 'utils', 'hooks', 'store', 'services', 'views'];

/** Which of LIB_DIR_CANDIDATES actually exist under dir/src (e.g. ['lib','pages']). */
export function existingSrcDirs(dir: string): string[] {
  return LIB_DIR_CANDIDATES.filter((d) => existsSync(join(dir, 'src', d))).map((d) => `src/${d}`);
}

/**
 * True when src/App EXISTS but is a PLACEHOLDER/STUB (logic/lib built, but the screen is still
 * empty) — the "thiếu giao diện" case entryChainMissing (file-existence only) cannot see.
 * CONSERVATIVE: our own placeholder always counts; otherwise a small App only counts as a stub when
 * it wires up NOTHING relative AND a real lib/UI layer exists (so we never mis-flag a legitimately
 * tiny self-contained app). Worst case of a false positive = one wasted continuation turn.
 */
export async function appLooksStub(dir: string): Promise<boolean> {
  const appPath = ['src/App.tsx', 'src/App.jsx'].map((p) => join(dir, p)).find((p) => existsSync(p));
  if (!appPath) return false; // no App at all → entryChainMissing owns that case
  const src = await readFile(appPath, 'utf8').catch(() => '');
  if (STUB_MARKERS.some((m) => src.includes(m))) return true; // our own scaffold placeholder
  const importsAppCode = /\b(?:from|import)\s+['"]\.[^'"]+['"]/.test(src); // imports ./pages, ../lib, …
  if (importsAppCode) return false; // wires up app code → a real screen
  if (src.length >= 900) return false; // sizeable self-contained App → treat as complete
  return existingSrcDirs(dir).length > 0; // tiny + wires nothing up + a lib layer exists → stub
}

/** Parse index.html for the ES-module entry under /src (e.g. "src/main.tsx"), or null. */
function htmlEntry(html: string): string | null {
  const re = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const src = m[1];
    if (!/type=["']module["']/i.test(tag)) continue;
    const rel = src.replace(/^\//, '');
    if (/^src\/.+\.(t|j)sx?$/.test(rel)) return rel;
  }
  return null;
}

/**
 * Guarantee the Vite entry chain exists so the app renders SOMETHING (never a blank page).
 * Deterministic — no AI. Returns what was created + whether the real App was missing.
 */
export async function ensureRenderableEntry(dir: string): Promise<RenderGuardResult> {
  const scaffolded: string[] = [];
  let missingApp = false;

  let html: string;
  try {
    html = await readFile(join(dir, 'index.html'), 'utf8');
  } catch {
    return { scaffolded, missingApp: false }; // no index.html → nothing to guard (e.g. Expo/mobile)
  }
  const entryRel = htmlEntry(html);
  if (!entryRel) return { scaffolded, missingApp: false };

  const isTs = /\.tsx?$/.test(entryRel) || existsSync(join(dir, 'tsconfig.json'));
  const appExt = isTs ? 'tsx' : 'jsx';
  const hasTailwind =
    existsSync(join(dir, 'tailwind.config.js')) ||
    existsSync(join(dir, 'tailwind.config.ts')) ||
    existsSync(join(dir, 'tailwind.config.cjs'));

  // 1) index.css — main imports it; without it the import throws and blanks the app.
  const cssPath = join(dir, 'src', 'index.css');
  if (!existsSync(cssPath)) {
    const css = hasTailwind
      ? '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n'
      : '*{box-sizing:border-box}html,body,#root{height:100%}body{margin:0;font-family:system-ui,-apple-system,sans-serif}\n';
    await writeFile(cssPath, css);
    scaffolded.push('src/index.css');
  }

  // 2) src/App.{tsx,jsx} — the app's own main screen. Missing → placeholder (no white screen) + flag.
  if (!existsSync(join(dir, 'src', 'App.tsx')) && !existsSync(join(dir, 'src', 'App.jsx'))) {
    missingApp = true;
    await writeFile(join(dir, 'src', `App.${appExt}`), PLACEHOLDER_APP);
    scaffolded.push(`src/App.${appExt}`);
  }

  // 3) the module entry (main.tsx) — the file index.html points at.
  if (!existsSync(join(dir, entryRel))) {
    await writeFile(join(dir, entryRel), mainEntrySource(isTs));
    scaffolded.push(entryRel);
  }

  return { scaffolded, missingApp };
}
