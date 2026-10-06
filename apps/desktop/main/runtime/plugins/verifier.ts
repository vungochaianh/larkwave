import { verify, createPublicKey } from 'node:crypto';
import { canonicalJson, type PluginManifest } from './manifest';

/**
 * Verify a manifest's Ed25519 signature against a set of trusted publisher keys.
 * The signature covers the canonical JSON of the manifest WITHOUT its `signature`
 * field. Provenance only — the security boundary (no code execution) holds even
 * for an unsigned plugin; `signed` just tells the user the manifest is from a
 * trusted publisher and untampered.
 *
 * Trusted keys are base64-encoded SPKI DER Ed25519 public keys.
 */
export function verifyManifestSignature(manifest: PluginManifest, trustedKeysB64: string[]): boolean {
  if (!manifest.signature || trustedKeysB64.length === 0) return false;
  const { signature, ...rest } = manifest;
  const data = Buffer.from(canonicalJson(rest), 'utf8');
  const sig = Buffer.from(signature, 'base64');
  for (const keyB64 of trustedKeysB64) {
    try {
      const pub = createPublicKey({ key: Buffer.from(keyB64, 'base64'), format: 'der', type: 'spki' });
      // Ed25519: algorithm is null.
      if (verify(null, data, pub, sig)) return true;
    } catch {
      /* try next key */
    }
  }
  return false;
}
