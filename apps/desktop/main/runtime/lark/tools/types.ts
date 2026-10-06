import { randomUUID } from 'node:crypto';
import type { LarkClient } from '../larkClient';

/**
 * One tool Claude may call against the connected Lark workspace. `gated: true`
 * marks a destructive write (create/update/delete/send) that the MCP bridge pauses
 * for user confirmation before executing. The same registry powers both the chat
 * agent loop and (later) the curated-plugin tools.
 */
export interface LarkToolDef {
  name: string;
  /** Prescriptive "call this when…" description — recent Opus under-reaches without it. */
  description: string;
  /** JSON Schema for the tool input (advertised over MCP). */
  inputSchema: Record<string, unknown>;
  /** Destructive write → confirmation required. */
  gated: boolean;
  exec(input: Record<string, any>, client: LarkClient): Promise<unknown>;
}

export const enc = encodeURIComponent;
export const uuid = () => randomUUID();

/** Small helper for a described string schema property. */
export const str = (description: string) => ({ type: 'string', description });
