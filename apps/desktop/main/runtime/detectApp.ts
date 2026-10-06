/**
 * detectApp.ts — figure out how to install + run an ARBITRARY local app (a generated
 * Vite app, or a project cloned from Git) so the preview works beyond the
 * "npm + vite" assumption.
 *
 * Detects the package manager (from the lockfile / packageManager field) and the dev
 * command (from package.json scripts + the framework), and only injects Vite's
 * `--host --port 0` flags when the project is actually Vite. Next/Remix/CRA/etc. run
 * their own dev script unchanged and print their own localhost URL.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { builtinModules } from 'node:module';

export type PackageManager = 'pnpm' | 'yarn' | 'bun' | 'npm';
export type Framework = 'vite' | 'next' | 'expo' | 'other';

function readPkg(dir: string): any {
  try {
    return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  } catch {
    return {};
  }
}

/** Lockfile (then the corepack `packageManager` field) decides the package manager. */
export function detectPackageManager(dir: string): PackageManager {
  if (existsSync(join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(dir, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(dir, 'bun.lockb')) || existsSync(join(dir, 'bun.lock'))) return 'bun';
  if (existsSync(join(dir, 'package-lock.json'))) return 'npm';
  const pm = String(readPkg(dir).packageManager || '');
  if (pm.startsWith('pnpm')) return 'pnpm';
  if (pm.startsWith('yarn')) return 'yarn';
  if (pm.startsWith('bun')) return 'bun';
  return 'npm';
}

export interface DevPlan {
  pm: PackageManager;
  /** Spawn args for the install step (`<pm> …`). */
  installArgs: string[];
  /** Spawn args for the dev server (`<pm> …`), incl. Vite host/port flags when relevant. */
  devArgs: string[];
  framework: Framework;
  /** The package.json script we run (dev/develop/start/serve), or null if none found. */
  devScript: string | null;
  /** Expo (React Native) app; preview it via Expo Go (QR) or, when web-capable, in an iframe. */
  expo?: boolean;
  /** Expo app that can run in a browser (react-native-web / a `web` script) → previewable in-frame. */
  expoWeb?: boolean;
}

/**
 * Build the install + dev command for `dir`. Returns the package-manager binary in
 * `pm` and the args arrays; the caller spawns `pm` with each.
 */
export function detectDevPlan(dir: string): DevPlan {
  const pm = detectPackageManager(dir);
  const pkg = readPkg(dir);
  const scripts: Record<string, string> = pkg.scripts || {};
  // Prefer the conventional dev script; fall back to start/develop/serve.
  const devScript = ['dev', 'develop', 'serve', 'start'].find((s) => scripts[s]) || null;
  const devCmd = devScript ? scripts[devScript] : '';
  const deps: Record<string, string> = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

  const isExpo = !!deps.expo || !!deps['react-native'] || /\bexpo\s+start\b/.test(devCmd);
  const expoWeb = isExpo && (!!deps['react-native-web'] || !!scripts.web);

  let framework: Framework = 'other';
  if (isExpo) framework = 'expo';
  else if (/\bvite\b/.test(devCmd) || deps.vite) framework = 'vite';
  else if (/\bnext\b/.test(devCmd) || deps.next) framework = 'next';

  // Install — make sure devDependencies land even under NODE_ENV=production.
  const installArgs =
    pm === 'npm'
      ? ['install', '--include=dev', '--no-audit', '--no-fund']
      : pm === 'pnpm'
        ? ['install', '--prod=false']
        : ['install']; // yarn / bun install dev deps by default

  // Dev — `<pm> run <script>` (yarn uses `<pm> <script>`); append Vite flags only for Vite.
  const script = devScript || 'dev';
  const runOf = (s: string) => (pm === 'yarn' ? [s] : ['run', s]);
  const forward = (base: string[], flags: string[]) => (pm === 'yarn' ? [...base, ...flags] : [...base, '--', ...flags]);
  const runPrefix = runOf(script);
  const viteFlags = ['--host', '--port', '0']; // bind 0.0.0.0 + pick a free port
  let devArgs: string[];
  if (framework === 'vite') {
    devArgs = forward(runPrefix, viteFlags);
  } else if (framework === 'expo' && expoWeb) {
    // Web-capable Expo → run it in the browser so the iframe can show it. Prefer a `web` script;
    // otherwise force `--web` on the start script.
    devArgs = scripts.web ? runOf('web') : forward(runPrefix, ['--web']);
  } else {
    devArgs = runPrefix; // next / expo (QR mode) / other run their own script unchanged
  }

  return { pm, installArgs, devArgs, framework, devScript, expo: isExpo, expoWeb };
}

const NODE_BUILTINS = new Set<string>([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

/** Map an import specifier to the npm package it belongs to (null = local/alias/builtin/virtual). */
function packageOfImport(spec: string): string | null {
  if (!spec) return null;
  // Relative ("./x"), absolute ("/x"), TS/Vite aliases ("@/x", "~/x") → local files, not packages.
  if (spec[0] === '.' || spec[0] === '/' || spec[0] === '~' || spec.startsWith('@/')) return null;
  // node:fs, virtual:…, http://…, data:… → not an installable bare package.
  if (spec.includes(':')) return null;
  // Scoped: keep "@scope/name"; unscoped: keep the first segment ("antd/locale/x" → "antd").
  const name = spec[0] === '@' ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
  if (!name || NODE_BUILTINS.has(name)) return null;
  if (!/^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name)) return null;
  return name;
}

const SCAN_SKIP = new Set(['node_modules', 'dist', 'build', '.git', '.next', '.toolswave', 'coverage', '.cache']);
const SCAN_EXT = /\.(tsx?|jsx?|mjs|cjs|vue|svelte|astro)$/;
// `from "x"`, `import "x"`, `import("x")`, `require("x")`, `export … from "x"`.
const IMPORT_RE = /\b(?:from|import|require)\b\s*\(?\s*['"]([^'"]+)['"]/g;

/** Every bare package imported anywhere in the app's source (bounded walk, ≤600 files). */
function scanImportedPackages(dir: string): Set<string> {
  const found = new Set<string>();
  let budget = 600;
  const walk = (d: string): void => {
    if (budget <= 0) return;
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (budget <= 0) return;
      if (e.isDirectory()) {
        if (!SCAN_SKIP.has(e.name) && !e.name.startsWith('.')) walk(join(d, e.name));
        continue;
      }
      if (!SCAN_EXT.test(e.name)) continue;
      budget -= 1;
      let text = '';
      try {
        text = readFileSync(join(d, e.name), 'utf8');
      } catch {
        continue;
      }
      if (text.length > 400_000) continue;
      IMPORT_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = IMPORT_RE.exec(text))) {
        const pkg = packageOfImport(m[1]);
        if (pkg) found.add(pkg);
      }
    }
  };
  walk(dir);
  return found;
}

export interface DepPlan {
  /** A full install is due — node_modules is absent, or a DECLARED dep isn't installed. */
  reinstall: boolean;
  /** Packages the source imports that are NEITHER declared in package.json NOR installed. */
  extra: string[];
}

/**
 * Work out what to install so Vite/Next resolves every import — the reliable guard against
 * "Failed to resolve import …". Catches the two real failure modes seen in practice:
 *  1. an iterate adds `antd` to package.json but node_modules was never refreshed (→ reinstall);
 *  2. code does `import "x"` without declaring "x" in package.json (→ extra, installed on the fly).
 * Cheap to run before every preview (existsSync checks + a bounded source scan).
 */
export function planDeps(dir: string): DepPlan {
  const pkg = readPkg(dir);
  const declared: Record<string, string> = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const nm = join(dir, 'node_modules');
  const installed = (name: string) => existsSync(join(nm, ...name.split('/')));

  let reinstall = !existsSync(nm);
  if (!reinstall) {
    for (const name of Object.keys(declared)) {
      if (!installed(name)) {
        reinstall = true;
        break;
      }
    }
  }

  const extra: string[] = [];
  for (const name of scanImportedPackages(dir)) {
    if (declared[name] || installed(name)) continue;
    extra.push(name);
    if (extra.length >= 24) break;
  }
  return { reinstall, extra };
}

/** A `.env.example` (or `.env.sample`) present but no `.env` → the project likely needs config. */
export function needsEnvConfig(dir: string): boolean {
  const hasEnv = existsSync(join(dir, '.env')) || existsSync(join(dir, '.env.local'));
  const hasExample = existsSync(join(dir, '.env.example')) || existsSync(join(dir, '.env.sample'));
  return !hasEnv && hasExample;
}

/** One env var the project expects, parsed from its `.env.example`. */
export interface EnvVar {
  name: string;
  /** Inline ` # comment` hint (what the value is for), if any. */
  comment?: string;
  /** The example/default value, if the template gave one. */
  defaultValue?: string;
}

/**
 * Parse `.env.example` (or `.env.sample`) into the list of vars the project wants.
 * Handles `KEY=value`, `KEY=value # comment`, and bare `# comment` lines (skipped).
 */
export function parseEnvExample(dir: string): EnvVar[] {
  const file = existsSync(join(dir, '.env.example'))
    ? join(dir, '.env.example')
    : existsSync(join(dir, '.env.sample'))
      ? join(dir, '.env.sample')
      : null;
  if (!file) return [];
  let text = '';
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  const out: EnvVar[] = [];
  for (const raw of text.split(/\r?\n/).slice(0, 400)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const name = line.slice(0, eq).trim().replace(/^export\s+/, '');
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
    let rest = line.slice(eq + 1).trim();
    let comment: string | undefined;
    // Split an inline " # comment" off the value (space-hash, so KEY=a#b isn't split).
    const hash = rest.indexOf(' #');
    if (hash >= 0) {
      comment = rest.slice(hash + 2).trim() || undefined;
      rest = rest.slice(0, hash).trim();
    }
    rest = rest.replace(/^["']|["']$/g, ''); // unquote
    out.push({ name, comment, defaultValue: rest || undefined });
    if (out.length >= 200) break;
  }
  return out;
}

/** Parse a real `.env` (KEY=value lines) into a name→value map. */
function parseEnvFile(file: string): Record<string, string> {
  let text = '';
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return {};
  }
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const name = line.slice(0, eq).trim().replace(/^export\s+/, '');
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
    out[name] = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

/**
 * Env spec for the renderer's "Cấu hình .env" form: the expected vars (from `.env.example`)
 * with values pre-filled from any existing `.env`, plus whether a `.env` exists. So reopening
 * the form shows what the user already saved — not just the template defaults.
 */
export function readEnvSpec(dir: string): { keys: EnvVar[]; hasEnv: boolean } {
  const envPath = existsSync(join(dir, '.env'))
    ? join(dir, '.env')
    : existsSync(join(dir, '.env.local'))
      ? join(dir, '.env.local')
      : null;
  const saved = envPath ? parseEnvFile(envPath) : {};
  const keys = parseEnvExample(dir).map((k) => (k.name in saved ? { ...k, defaultValue: saved[k.name] } : k));
  // Surface any vars present in the real .env but missing from .env.example, so they're editable too.
  for (const [name, value] of Object.entries(saved)) {
    if (!keys.some((k) => k.name === name)) keys.push({ name, defaultValue: value });
  }
  return { keys, hasEnv: !!envPath };
}
