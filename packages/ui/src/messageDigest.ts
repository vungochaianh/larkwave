/**
 * Structural digest of an assistant message — the label shown when an answer is
 * COLLAPSED in the Lark chat. Pure and dependency-free (no React, no theme): the
 * public web share page renders ChatMarkdown without a ThemeProvider, and this
 * module is imported from there too.
 *
 * The digest is derived, never stored: it is recomputed (memoised) at render for
 * whichever messages are currently folded, so improving this file retroactively
 * improves every already-folded answer.
 */

/** Strip light markdown / tree markers so a line reads cleanly as a label. */
export function plainText(s: string): string {
  return s
    .replace(/^\s*[•┗↳]\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/\s*→\s*$/, '')
    .trim();
}

// The four ways the model writes a workflow definition. Shared with ChatMarkdown's
// WF cross-reference pre-scan so the two can never drift apart — first match wins,
// in this order. None carry /g, so sharing the objects is safe (no lastIndex state).
export const WF_HEADING = /^#{1,6}\s*WF[-\s]?(\d+)\b\s*[—–\-:：]\s*(.+)$/;
export const WF_TABLE_ROW = /^\s*\|\s*WF[-\s]?(\d+)\s*\|\s*([^|]+?)\s*\|(.*)$/;
export const WF_BOLD = /\*\*\s*WF[-\s]?(\d+)\b\s*[—–\-:：]\s*([^*]+?)\s*\*\*/;
export const WF_COLON = /\bWF[-\s]?(\d+)\b\s*[:：]\s*(.+)$/;

export interface MsgDigest {
  /** One-line label, <= 96 chars. */
  title: string;
  /** Count chips, already ordered and capped; the line count is always last. */
  chips: string[];
  /** Up to 6 workflow labels, e.g. ['WF1','WF3','WF7']; '…' appended when truncated. */
  wf: string[];
}

/** Openers that carry no information — skipped so the label is the actual answer. */
const BOILER = /^(được|vâng|ok|chắc chắn|đây là|dưới đây|tôi (đã|sẽ|vừa)|mình (đã|sẽ|vừa))\b/i;

const strip = (s: string) => {
  let t = s.replace(/\*\*/g, '').replace(/`/g, '').trim();
  // Only unwrap quotes that enclose the WHOLE label. Stripping a bare trailing quote
  // mangles a title that merely ends in a quoted phrase — e.g.
  // `Phân tích lỗi "thi thoảng chạy thiếu"` would lose just its closing quote.
  const wrapped = /^["“']([\s\S]*)["”']$/.exec(t);
  if (wrapped) t = wrapped[1].trim();
  return t.replace(/\s*[—–-]\s*$/, '').trim();
};

const cut = (t: string) => (t.length > 96 ? `${t.slice(0, 96).trimEnd()}…` : t);

// Memo keyed on the text itself — messageDigest never receives an id. Bounded FIFO.
const cache = new Map<string, MsgDigest>();

export function messageDigest(text: string): MsgDigest {
  const hit = cache.get(text);
  if (hit) return hit;

  const src = text.replace(/\r\n/g, '\n').replace(/\n*📎[^\n]*$/, '');
  const lines = src.split('\n');

  const headings: string[] = [];
  const boldLead: string[] = [];
  const prose: string[] = [];
  const wfNums = new Set<string>();
  let tableRows = 0;
  let tableSeps = 0;
  let checkboxes = 0;
  let bullets = 0;
  let fencePairs = 0;
  let statusOn = 0;
  let statusOff = 0;
  let inFence = false;

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      if (inFence) fencePairs += 1;
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading) headings.push(heading[1]);
    const bold = line.match(/^\s*\*\*([^*]{3,})\*\*\s*:?\s*$/);
    if (bold) boldLead.push(bold[1]);

    const isSep = /^\s*\|[\s:|-]+\|\s*$/.test(line);
    const isRow = /^\s*\|.*\|\s*$/.test(line);
    if (isSep) tableSeps += 1;
    if (isRow) tableRows += 1;

    const isCheckbox = /^\s*[-*]?\s*\[[ xX]\]\s+.+$/.test(line);
    if (isCheckbox) checkboxes += 1;
    const isBullet = !isCheckbox && /^\s{0,1}[-*+•]\s+/.test(line);
    if (isBullet) bullets += 1;

    if (line.includes('đang bật')) statusOn += 1;
    if (line.includes('đang tắt')) statusOff += 1;

    let m: RegExpMatchArray | null;
    if ((m = line.match(WF_HEADING))) wfNums.add(m[1]);
    else if ((m = line.match(WF_TABLE_ROW))) wfNums.add(m[1]);
    else if ((m = line.match(WF_BOLD))) wfNums.add(m[1]);
    else if ((m = line.match(WF_COLON))) wfNums.add(m[1]);

    const isQuote = /^\s*>/.test(line);
    if (line.trim() && !heading && !isRow && !isBullet && !isCheckbox && !isQuote) prose.push(line);
  }

  // ── title ────────────────────────────────────────────────────────────────
  let title = '';
  if (headings.length) {
    title = strip(plainText(headings[0]));
  } else if (boldLead.length) {
    title = strip(plainText(boldLead[0]));
  } else if (prose.length) {
    let i = 0;
    let skips = 0;
    while (skips < 2 && i < prose.length - 1 && BOILER.test(prose[i].trim())) {
      i += 1;
      skips += 1;
    }
    title = strip(plainText(prose[i])).split(/(?<=[.!?…])\s/)[0];
  }
  if (!title) title = 'Câu trả lời';
  title = cut(title);

  // ── chips ────────────────────────────────────────────────────────────────
  const tableBodyRows = Math.max(0, tableRows - tableSeps - (tableSeps ? 1 : 0));
  const counted: string[] = [];
  if (wfNums.size) counted.push(`${wfNums.size} workflow`);
  if (tableBodyRows) counted.push(`bảng ${tableBodyRows} dòng`);
  if (checkboxes) counted.push(`${checkboxes} việc`);
  if (bullets) counted.push(`${bullets} mục`);
  if (fencePairs) counted.push(`${fencePairs} khối mã`);
  if (statusOn + statusOff > 0) counted.push(`${statusOn} bật / ${statusOff} tắt`);
  const chips = [...counted.slice(0, 4), `${lines.length} dòng`];

  // ── workflow list ────────────────────────────────────────────────────────
  const sorted = [...wfNums].sort((a, b) => Number(a) - Number(b));
  const wf = sorted.slice(0, 6).map((n) => `WF${n}`);
  if (sorted.length > 6) wf.push('…');

  const digest: MsgDigest = { title, chips, wf };
  cache.set(text, digest);
  if (cache.size > 300) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return digest;
}
