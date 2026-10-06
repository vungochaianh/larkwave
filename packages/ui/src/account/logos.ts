/**
 * Brand / platform logos via the Simple Icons CDN — a brand-coloured SVG per
 * slug, no API key, served with permissive headers (loads fine in the Electron
 * renderer). Used for integration cards, AI-provider rows, etc.
 *   brandLogo('stripe')  → https://cdn.simpleicons.org/stripe
 *   brandLogo('openai', '10a37f') → fixed colour
 */
export function brandLogo(slug: string, color?: string): string {
  return `https://cdn.simpleicons.org/${slug}${color ? `/${color}` : ''}`;
}
