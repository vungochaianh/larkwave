const { execSync } = require('node:child_process');
const path = require('node:path');

/**
 * Ad-hoc code-sign the packed macOS .app.
 *
 * We have no paid Apple Developer cert, so electron-builder runs with
 * CSC_IDENTITY_AUTO_DISCOVERY=false → "signing is skipped" → the arm64 app ships UNSIGNED.
 * An unsigned arm64 binary won't launch at all and Gatekeeper reports it as
 * "Larkwave is damaged and can't be opened" (not the milder "unidentified developer").
 *
 * Ad-hoc signing (`codesign --sign -`) gives the bundle a valid (if anonymous) signature,
 * so after the user clears quarantine / right-click → Open, it launches. This is the best
 * we can do without an Apple Developer ID + notarization.
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  // Universal builds pack each arch into a `*-arm64-temp` / `*-x64-temp` dir, then MERGE them
  // (@electron/universal). Re-signing those per-arch temps makes their Electron Framework
  // signatures diverge → the merge aborts ("non-binary files must have identical SHAs"). So skip
  // the temps and sign ONLY the final merged app (afterPack fires again for it, appOutDir without -temp).
  if (context.appOutDir.includes('-temp')) {
    console.log(`[afterPack] bỏ qua ký per-arch temp (universal merge): ${context.appOutDir}`);
    return;
  }
  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);
  console.log(`[afterPack] ad-hoc signing ${appPath}`);
  // --deep signs the nested Electron frameworks/helpers; --force re-signs anything present.
  execSync(`codesign --force --deep --sign - ${JSON.stringify(appPath)}`, { stdio: 'inherit' });
  // Sanity-check the signature so a silent failure doesn't ship another "damaged" build.
  execSync(`codesign --verify --deep --strict ${JSON.stringify(appPath)}`, { stdio: 'inherit' });
  console.log('[afterPack] ad-hoc signature verified');
};
