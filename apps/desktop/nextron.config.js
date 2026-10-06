const fs = require('node:fs');
const path = require('node:path');

/**
 * Copy sql.js's WASM next to the bundled MAIN (app/background.js) so the database browser
 * (main/runtime/appDb.ts) can load it via `readFileSync(join(__dirname, 'sql-wasm.wasm'))`
 * at runtime — in dev AND in the packaged app (electron-builder ships the whole `app/` dir).
 * webpack only bundles JS; the .wasm binary must be emitted as a sibling asset.
 */
class CopySqlWasmPlugin {
  apply(compiler) {
    compiler.hooks.afterEmit.tap('CopySqlWasm', (compilation) => {
      try {
        const src = path.join(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
        const outDir = compiler.options.output.path; // app/ for the main bundle
        if (!outDir || !fs.existsSync(src)) return;
        fs.copyFileSync(src, path.join(outDir, 'sql-wasm.wasm'));
      } catch (e) {
        // Non-fatal: the DB browser will just report the engine isn't available.
        console.warn('[nextron] copy sql-wasm.wasm failed:', e && e.message);
      }
    });
  }
}

module.exports = {
  // nextron calls this for the MAIN-process webpack build.
  webpack: (config) => {
    config.plugins = config.plugins || [];
    config.plugins.push(new CopySqlWasmPlugin());
    return config;
  },
};
