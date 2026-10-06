import type { BuildConfig, DetectedService, GeneratedFile, Track } from '@larkwave/shared';

export type ImportKind = 'web-single' | 'monorepo' | 'backend' | 'static' | 'extension' | 'unknown';

/**
 * Nền tảng đích của repo — KHÁC với `kind` (kind nói về hình dạng repo: đơn/đa gói/backend…).
 *
 * Website chỉ chạy được thứ chạy trong trình duyệt. Repo nhắm tới điện thoại, máy tính hay tiện
 * ích trình duyệt thì cần cài phụ thuộc gốc và đóng gói trên máy — nhập vào đây chỉ tạo ra một
 * app không bao giờ chạy được, nên phải chặn ngay từ đầu thay vì nhập rồi để đó.
 */
export type ImportPlatform = 'web' | 'mobile' | 'desktop' | 'extension';

export interface PlatformVerdict {
  platform: ImportPlatform;
  /** Dấu hiệu cụ thể đã thấy — nói cho người dùng biết vì sao bị từ chối. */
  evidence: string;
}

/**
 * Nhận diện nền tảng từ danh sách file.
 *
 * Chỉ kết luận khi có dấu hiệu RÕ. Đoán sai theo hướng "không phải web" thì chặn oan một repo
 * hợp lệ — tệ hơn nhiều so với việc nhập một repo lạ rồi không build được, nên mọi thứ không
 * chắc đều rơi về 'web'.
 */
export function detectPlatform(files: GeneratedFile[]): PlatformVerdict {
  const paths = files.map((f) => f.path.replace(/^\.?\//, ''));
  const pathSet = new Set(paths);
  const has = (p: string) => pathSet.has(p);
  const hasAny = (re: RegExp) => paths.some((p) => re.test(p));

  const rootPkgFile = files.find((f) => f.path.replace(/^\.?\//, '') === 'package.json');
  let deps: Record<string, string> = {};
  let pkg: Record<string, unknown> | null = null;
  if (rootPkgFile) {
    try {
      pkg = JSON.parse(rootPkgFile.content) as Record<string, unknown>;
      deps = {
        ...((pkg.dependencies as Record<string, string>) ?? {}),
        ...((pkg.devDependencies as Record<string, string>) ?? {}),
      };
    } catch {
      /* package.json hỏng — cứ coi như không có */
    }
  }
  const dep = (name: string) => Object.prototype.hasOwnProperty.call(deps, name);
  const depLike = (re: RegExp) => Object.keys(deps).some((d) => re.test(d));

  // ── Điện thoại ────────────────────────────────────────────────────────────
  if (dep('react-native') || depLike(/^react-native(-|$)/)) {
    return { platform: 'mobile', evidence: 'react-native trong package.json' };
  }
  if (dep('expo') || depLike(/^expo(-|$)/) || depLike(/^@expo\//)) {
    return { platform: 'mobile', evidence: 'expo trong package.json' };
  }
  if (has('pubspec.yaml')) {
    return { platform: 'mobile', evidence: 'pubspec.yaml (Flutter)' };
  }
  if (depLike(/^@capacitor\//) || hasAny(/^capacitor\.config\.(json|ts|js)$/)) {
    return { platform: 'mobile', evidence: 'Capacitor' };
  }
  if (has('ionic.config.json')) {
    return { platform: 'mobile', evidence: 'ionic.config.json' };
  }
  // Dự án Android/iOS gốc: cần CẢ hai dấu hiệu build thật, không chỉ mỗi tên thư mục — nhiều web
  // app có thư mục "android/" do Capacitor sinh ra mà vẫn là web.
  if (hasAny(/^android\/.*build\.gradle/) || hasAny(/\.xcodeproj\//) || hasAny(/^ios\/Podfile$/)) {
    return { platform: 'mobile', evidence: 'dự án Android/iOS gốc' };
  }

  // ── Máy tính ──────────────────────────────────────────────────────────────
  if (dep('electron') || depLike(/^electron(-|$)/) || depLike(/^@electron\//) || dep('nextron')) {
    return { platform: 'desktop', evidence: 'electron trong package.json' };
  }
  if (has('tauri.conf.json') || hasAny(/^src-tauri\//) || depLike(/^@tauri-apps\//)) {
    return { platform: 'desktop', evidence: 'Tauri' };
  }
  if (hasAny(/\.csproj$/) || hasAny(/\.sln$/)) {
    return { platform: 'desktop', evidence: 'dự án .NET (.csproj/.sln)' };
  }

  // ── Tiện ích trình duyệt ──────────────────────────────────────────────────
  // manifest.json thôi thì chưa đủ (web app cũng có manifest PWA) — phải có khoá chỉ tiện ích
  // mới dùng.
  const manifest = files.find((f) => /(^|\/)manifest\.json$/.test(f.path.replace(/^\.?\//, '')));
  if (manifest) {
    try {
      const m = JSON.parse(manifest.content) as Record<string, unknown>;
      if (
        m.manifest_version !== undefined &&
        (m.background !== undefined ||
          m.content_scripts !== undefined ||
          m.permissions !== undefined ||
          m.action !== undefined ||
          m.browser_action !== undefined)
      ) {
        return { platform: 'extension', evidence: 'manifest.json của tiện ích trình duyệt' };
      }
    } catch {
      /* manifest hỏng — không kết luận */
    }
  }

  return { platform: 'web', evidence: '' };
}

export interface ImportClassification {
  kind: ImportKind;
  /** App track to record. */
  track: Track;
  /** Whether the repo is a single, self-contained web app our Vite pipeline can
   *  build + deploy. Conservative: only true when we're confident — otherwise we
   *  import faithfully WITHOUT running the (destructive) codegen build pipeline. */
  buildable: boolean;
  /** Short Vietnamese reason, shown to the user. */
  reason: string;
}

const WEB_FRAMEWORKS = [
  'react',
  'react-dom',
  'vue',
  'next',
  'svelte',
  '@sveltejs/kit',
  'solid-js',
  'vite',
  '@vitejs/plugin-react',
  'preact',
];

/**
 * Classify an imported repo from its file list. The key decision is whether it's
 * a SINGLE deployable web app (safe to auto-build via the Vite pipeline) or a
 * complex / multi-package / non-web project (import faithfully, do NOT auto-build
 * — otherwise the build fix-loop rewrites the whole project into a tiny app).
 *
 * Bias: when in doubt, `buildable: false`. A wrong "buildable" destroys source;
 * a wrong "import-only" just means the user builds it manually.
 */
export function classifyImport(files: GeneratedFile[]): ImportClassification {
  const paths = files.map((f) => f.path.replace(/^\.?\//, ''));
  const pathSet = new Set(paths);
  const has = (p: string) => pathSet.has(p);
  const hasAny = (re: RegExp) => paths.some((p) => re.test(p));

  // Root package.json (if any).
  const rootPkgFile = files.find((f) => f.path.replace(/^\.?\//, '') === 'package.json');
  let rootPkg: Record<string, unknown> | null = null;
  if (rootPkgFile) {
    try {
      rootPkg = JSON.parse(rootPkgFile.content) as Record<string, unknown>;
    } catch {
      rootPkg = null;
    }
  }

  // All package.json locations → which top-level dirs are their own package.
  const pkgPaths = paths.filter((p) => /(^|\/)package\.json$/.test(p));
  const subPkgTopDirs = new Set(
    pkgPaths.filter((p) => p !== 'package.json').map((p) => p.split('/')[0]),
  );

  // ── Monorepo / multi-service (most important to catch) ──────────────────────
  const isMonorepo =
    has('pnpm-workspace.yaml') ||
    has('lerna.json') ||
    has('turbo.json') ||
    has('nx.json') ||
    Boolean(rootPkg && (rootPkg as { workspaces?: unknown }).workspaces) ||
    has('docker-compose.yml') ||
    has('docker-compose.yaml') ||
    subPkgTopDirs.size >= 2;
  if (isMonorepo) {
    return {
      kind: 'monorepo',
      track: 'web',
      buildable: false,
      reason:
        'Dự án đa-gói / monorepo (nhiều package.json, workspaces hoặc docker-compose). Đã nhập đầy đủ — không tự build thành một web app đơn.',
    };
  }

  const deps = {
    ...((rootPkg?.dependencies as Record<string, string>) ?? {}),
    ...((rootPkg?.devDependencies as Record<string, string>) ?? {}),
  };
  const depNames = Object.keys(deps);
  const hasWebFw = depNames.some((d) => WEB_FRAMEWORKS.includes(d));
  const hasIndexHtml = has('index.html') || hasAny(/(^|\/)index\.html$/);

  // Non-web backend markers.
  const backendMarker =
    has('go.mod') ||
    has('requirements.txt') ||
    has('manage.py') ||
    has('Cargo.toml') ||
    has('pom.xml') ||
    has('composer.json') ||
    has('nest-cli.json') ||
    depNames.some((d) => ['@nestjs/core', 'express', 'fastify', 'koa', '@nestjs/common'].includes(d));

  // ── Chrome/Edge extension (manifest v3) ─────────────────────────────────────
  if (has('manifest.json') && !hasWebFw) {
    return {
      kind: 'extension',
      track: 'extension',
      buildable: false,
      reason: 'Có manifest.json (extension?). Đã nhập đầy đủ — không tự build/deploy.',
    };
  }

  // ── Single front-end web app at the root → safe to auto-build ───────────────
  if (rootPkg && hasWebFw && !backendMarker && subPkgTopDirs.size === 0) {
    return {
      kind: 'web-single',
      track: 'web',
      buildable: true,
      reason: 'Web app đơn (React/Vite/Next…) ở thư mục gốc — tự build & deploy.',
    };
  }

  if (backendMarker || (rootPkg && !hasWebFw)) {
    return {
      kind: 'backend',
      track: 'web',
      buildable: false,
      reason: 'Dự án backend / không phải web app đơn. Đã nhập đầy đủ — không tự build.',
    };
  }

  if (hasIndexHtml && !rootPkg) {
    return {
      kind: 'static',
      track: 'web',
      buildable: false,
      reason: 'Site tĩnh (HTML/CSS/JS). Đã nhập đầy đủ — không tự build qua pipeline Vite.',
    };
  }

  return {
    kind: 'unknown',
    track: 'web',
    buildable: false,
    reason: 'Chưa nhận diện chắc chắn loại dự án. Đã nhập đầy đủ — không tự build để tránh làm hỏng mã nguồn.',
  };
}

const norm = (p: string) => p.replace(/^\.?\//, '');
const dirOf = (p: string) => {
  const i = p.lastIndexOf('/');
  return i === -1 ? '' : p.slice(0, i);
};

const BACKEND_MARKERS = [
  'go.mod',
  'requirements.txt',
  'manage.py',
  'Cargo.toml',
  'pom.xml',
  'composer.json',
  'nest-cli.json',
  'Dockerfile',
];

const BACKEND_DEPS = ['@nestjs/core', '@nestjs/common', 'express', 'fastify', 'koa', '@hapi/hapi'];

/**
 * Detect the sub-projects ("services") inside a (mono)repo so each part can be
 * built/deployed on its own. A service root is any directory that directly
 * contains a package.json or a backend marker file (go.mod, requirements.txt,
 * Dockerfile…). Frontend/static services are buildable on our Vite pipeline;
 * backends are surfaced but not auto-deployable (we host Cloudflare Pages, not
 * long-running servers).
 */
export function detectServices(files: GeneratedFile[]): DetectedService[] {
  const paths = files.map((f) => norm(f.path));
  const pathSet = new Set(paths);

  // Candidate service-root directories.
  const roots = new Set<string>();
  for (const p of paths) {
    const base = p.split('/').pop() ?? '';
    if (base === 'package.json' || BACKEND_MARKERS.includes(base)) {
      roots.add(dirOf(p));
    }
  }
  if (roots.size === 0) return [];

  const services: DetectedService[] = [];
  for (const root of roots) {
    const prefix = root === '' ? '' : `${root}/`;
    const within = paths.filter((p) => (prefix === '' ? true : p.startsWith(prefix)));

    // Read this service's own package.json (if any).
    const pkgPath = prefix + 'package.json';
    let pkg: Record<string, unknown> | null = null;
    if (pathSet.has(pkgPath)) {
      const f = files.find((x) => norm(x.path) === pkgPath);
      if (f) {
        try {
          pkg = JSON.parse(f.content) as Record<string, unknown>;
        } catch {
          pkg = null;
        }
      }
    }
    const deps = {
      ...((pkg?.dependencies as Record<string, string>) ?? {}),
      ...((pkg?.devDependencies as Record<string, string>) ?? {}),
    };
    const depNames = Object.keys(deps);
    const hasMarker = (m: string) => pathSet.has(prefix + m);

    let type: DetectedService['type'] = 'other';
    let framework: string | null = null;
    let buildable = false;

    const frontendFw = depNames.find((d) => WEB_FRAMEWORKS.includes(d));
    if (frontendFw) {
      type = 'frontend';
      framework = depNames.includes('next')
        ? 'next'
        : depNames.includes('react')
          ? 'react'
          : depNames.includes('vue')
            ? 'vue'
            : 'vite';
      buildable = true;
    } else if (
      depNames.some((d) => BACKEND_DEPS.includes(d)) ||
      hasMarker('nest-cli.json')
    ) {
      type = 'backend';
      framework = depNames.some((d) => d.startsWith('@nestjs')) ? 'nestjs' : 'node';
    } else if (hasMarker('go.mod')) {
      type = 'backend';
      framework = 'go';
    } else if (hasMarker('requirements.txt') || hasMarker('manage.py')) {
      type = 'backend';
      framework = 'python';
    } else if (hasMarker('Cargo.toml')) {
      type = 'backend';
      framework = 'rust';
    } else if (hasMarker('composer.json') || hasMarker('pom.xml')) {
      type = 'backend';
      framework = hasMarker('pom.xml') ? 'java' : 'php';
    } else if (within.some((p) => p === prefix + 'index.html')) {
      type = 'static';
      framework = 'html';
      buildable = true;
    } else if (pkg) {
      type = 'other';
      framework = 'node';
    }

    services.push({
      path: root,
      name: root === '' ? 'root' : (root.split('/').pop() ?? root),
      type,
      framework,
      buildable,
      fileCount: within.length,
    });
  }

  // Frontend first, then by name.
  const order: Record<DetectedService['type'], number> = { frontend: 0, static: 1, backend: 2, other: 3 };
  return services.sort((a, b) => order[a.type] - order[b.type] || a.name.localeCompare(b.name));
}

// ── .toolswave build/deploy config derivation (no-LLM import path) ────────────

/** npm install incl. devDeps (build tooling) — same flags as BuildRunnerService.install. */
const NPM_INSTALL = 'npm install --include=dev --no-audit --no-fund --no-progress --loglevel=warn';

/** framework → { build command, output dir } for the no-LLM config build path. */
const BUILD_PRESETS: Record<string, { build: string | null; outputDir: string }> = {
  react: { build: 'npm run build', outputDir: 'dist' },
  vite: { build: 'npm run build', outputDir: 'dist' },
  vue: { build: 'npm run build', outputDir: 'dist' },
  preact: { build: 'npm run build', outputDir: 'dist' },
  solid: { build: 'npm run build', outputDir: 'dist' },
  svelte: { build: 'npm run build', outputDir: 'build' },
  astro: { build: 'npm run build', outputDir: 'dist' },
  angular: { build: 'npm run build', outputDir: 'dist' },
  next: { build: 'npm run build', outputDir: 'out' }, // assumes static export (output:'export')
  nuxt: { build: 'npm run build', outputDir: 'dist' },
  html: { build: null, outputDir: '.' },
};

function detectWebFramework(depNames: string[]): string {
  if (depNames.includes('next')) return 'next';
  if (depNames.some((d) => d === 'nuxt' || d === 'nuxt3')) return 'nuxt';
  if (depNames.includes('@angular/core')) return 'angular';
  if (depNames.includes('astro')) return 'astro';
  if (depNames.includes('@sveltejs/kit') || depNames.includes('svelte')) return 'svelte';
  if (depNames.includes('vue')) return 'vue';
  if (depNames.includes('solid-js')) return 'solid';
  if (depNames.includes('preact')) return 'preact';
  if (depNames.includes('react') || depNames.includes('react-dom')) return 'react';
  return 'vite';
}

/** True when the repo ships a D1 schema + Pages Functions (full-stack deploy). */
function hasFullStack(paths: string[]): boolean {
  const set = new Set(paths);
  const hasSchema = set.has('schema.sql') || paths.some((p) => /(^|\/)schema\.sql$/.test(p));
  const hasFunctions = paths.some((p) => p.startsWith('functions/'));
  return hasSchema && hasFunctions;
}

/** Shallowest index.html's directory (deploy a static site as-is). '.' = repo root. */
function staticOutputDir(paths: string[]): string {
  const indexes = paths.filter((p) => p === 'index.html' || /(^|\/)index\.html$/.test(p));
  if (indexes.length === 0) return '.';
  indexes.sort((a, b) => a.split('/').length - b.split('/').length);
  const d = dirOf(indexes[0]);
  return d === '' ? '.' : d;
}

/**
 * Derive (or read) the .toolswave build/deploy config for an imported repo so it can
 * be built + deployed WITHOUT the LLM (zero tokens), and reused on every re-run.
 * Honors a repo-provided `.toolswave/config.json` / `toolswave.json` override; else
 * derives from the framework in package.json; else (plain static) deploys as-is.
 * Returns null when the repo is not a directly-deployable web app (→ import-only).
 */
export function buildConfigFor(
  files: GeneratedFile[],
  classification: ImportClassification,
): BuildConfig | null {
  const paths = files.map((f) => norm(f.path));
  const deployTarget: BuildConfig['deployTarget'] = hasFullStack(paths) ? 'fullstack' : 'static';

  // 1) Repo-provided config wins (inspectable + overridable by power users).
  const cfgFile = files.find((f) => {
    const p = norm(f.path);
    return p === '.toolswave/config.json' || p === 'toolswave.json' || p === '.toolswave.json';
  });
  if (cfgFile) {
    try {
      const raw = JSON.parse(cfgFile.content) as Partial<BuildConfig>;
      return {
        framework: raw.framework ?? 'custom',
        installCommand: raw.installCommand === undefined ? NPM_INSTALL : raw.installCommand,
        buildCommand: raw.buildCommand ?? null,
        outputDir: raw.outputDir ?? 'dist',
        deployTarget: raw.deployTarget ?? deployTarget,
        env: raw.env,
        source: 'toolswave-file',
      };
    } catch {
      /* malformed config → fall through to auto-derivation */
    }
  }

  // 2) Plain static site (index.html, no package.json) → deploy as-is, no build.
  if (classification.kind === 'static') {
    return {
      framework: 'html',
      installCommand: null,
      buildCommand: null,
      outputDir: staticOutputDir(paths),
      deployTarget,
      source: 'auto',
    };
  }

  // 3) Single buildable web app → derive from the detected framework.
  if (classification.buildable) {
    const rootPkgFile = files.find((f) => norm(f.path) === 'package.json');
    let depNames: string[] = [];
    if (rootPkgFile) {
      try {
        const pkg = JSON.parse(rootPkgFile.content) as Record<string, unknown>;
        depNames = Object.keys({
          ...((pkg.dependencies as Record<string, string>) ?? {}),
          ...((pkg.devDependencies as Record<string, string>) ?? {}),
        });
      } catch {
        /* ignore unparseable package.json — fall back to the vite preset */
      }
    }
    const framework = detectWebFramework(depNames);
    // A Next.js app WITHOUT `output: 'export'` produces a SERVER build (.next), not a
    // static `out/` — it CANNOT deploy to static Cloudflare Pages. Don't derive a
    // static build config (which would run a doomed `next build` + static export that
    // fails on any dynamic page / the /404 prerender). Return null → import-only, and
    // the user runs it via "Chạy trên Server" (Docker, `next build && next start`).
    if (framework === 'next') {
      const nextCfg =
        files.find((f) => /(^|\/)next\.config\.(js|mjs|ts|cjs)$/.test(norm(f.path)))?.content ?? '';
      if (!/output\s*:\s*['"]export['"]/.test(nextCfg)) {
        return null;
      }
    }
    const preset = BUILD_PRESETS[framework] ?? { build: 'npm run build', outputDir: 'dist' };
    return {
      framework,
      installCommand: NPM_INSTALL,
      buildCommand: preset.build,
      outputDir: preset.outputDir,
      deployTarget,
      source: 'auto',
    };
  }

  return null;
}

/** Extract a sub-project's files, rebased to the project root (prefix stripped). */
export function extractService(files: GeneratedFile[], servicePath: string): GeneratedFile[] {
  const prefix = servicePath === '' ? '' : `${servicePath.replace(/\/+$/, '')}/`;
  const out: GeneratedFile[] = [];
  for (const f of files) {
    const p = norm(f.path);
    if (prefix && !p.startsWith(prefix)) continue;
    const rel = prefix ? p.slice(prefix.length) : p;
    if (rel) out.push({ path: rel, content: f.content });
  }
  return out;
}
