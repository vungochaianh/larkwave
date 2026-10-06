# @larkwave/desktop

Nextron (Electron + Next.js) shell for Larkwave. Same UI as the web app
(`@larkwave/ui`), but the AI runs through the user's **local CLI runners** (Claude/Codex/Gemini/Grok) — see
[../../docs/desktop-architecture.md](../../docs/desktop-architecture.md).

## Layout

```
main/                       # Electron main process (Node privileges)
  background.ts             # window + IPC wiring
  preload.ts               # contextBridge → window.toolswave
  runtime/
    localAdapter.ts        # RuntimeAdapter impl (generate + preview locally)
    claudeRunner.ts        # spawn `claude` headless → BuildEvent stream  ← the cost win
    preview.ts             # local vite dev server per app
renderer/                   # Next.js (static export) — the UI
  pages/_app.tsx           # RuntimeProvider(IpcRuntimeAdapter)
  pages/home.tsx           # <Composer/> from @larkwave/ui
  runtime/ipcAdapter.ts    # renderer-side RuntimeAdapter → IPC → main
```

## Run

```bash
# from repo root
pnpm install
# requires a logged-in `claude` CLI on PATH:
claude --version
pnpm --filter @larkwave/desktop dev
```

## Build installers (Mac & Windows)

App icon = the Larkwave website logo (gradient + bolt) at `resources/icon.png`;
electron-builder auto-generates `.icns`/`.ico`. Output goes to `apps/desktop/dist/`.

```bash
# from repo root — build shared deps first, then package
pnpm --filter @larkwave/core build

# macOS → apps/desktop/dist/Larkwave-<ver>.dmg  (run ON a Mac)
pnpm --filter @larkwave/desktop dist:mac

# Windows → apps/desktop/dist/Larkwave Setup <ver>.exe  (run ON Windows)
pnpm --filter @larkwave/desktop dist:win

# current OS
pnpm --filter @larkwave/desktop dist
```

**Cross-OS note:** build each installer on its own OS. A Windows `.exe` can be
produced on macOS only with Wine+Mono installed (`brew install --cask wine-stable`),
otherwise run `dist:win` on a Windows machine or in CI (GitHub Actions
`windows-latest` / `macos-latest` matrix). The `.dmg`/`.exe` are **unsigned** — for
public distribution add Apple notarization (`CSC_LINK`/`CSC_KEY_PASSWORD`) and a
Windows code-signing cert; for personal use, on macOS right-click → Open to bypass
Gatekeeper.

**Each user still needs the Claude CLI** installed + logged in (`claude auth login`)
— the app drives their local Claude; it doesn't bundle it.

> Scaffold status: the architecture + the Claude-CLI integration are wired and
> typed end-to-end. Before shipping, harden `claudeRunner` (stream-json mapping)
> and sandbox the generated-app build — see the architecture doc's TODO list.

## Troubleshooting (resolved during first run)

- **`ERR_REQUIRE_ESM` electron-serve** — nextron bundles the main process as
  CommonJS; use `electron-serve@^1.3.0` (CJS), not v2 (ESM-only).
- **`Cannot find module '@babel/runtime-corejs3/helpers/...'`** — nextron's main
  babel transform references the corejs3 runtime; it's a `dependencies` entry.
- **`electron.app` is undefined / `electron --version` prints a Node version** —
  `ELECTRON_RUN_AS_NODE=1` is set (happens when launching from inside an
  Electron-based dev tool, e.g. a VS Code / Claude Code terminal). The `dev`
  script unsets it (`ELECTRON_RUN_AS_NODE= nextron`); a normal terminal is unaffected.
- **`electron-builder install-app-deps` postinstall fails on pnpm** (`@poppinss/colors`
  ENOENT) — harmless for `dev` (only needed to rebuild native modules for packaging;
  this app has none). Fix before `dist` if you add native deps.
