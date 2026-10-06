'use client';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import type { SkillInfo } from '@larkwave/core';
import { useI18n } from '../i18n';
import { V, BRAND, CARD_SHADOW } from '../theme';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

/**
 * The "/" token being typed: a slash opening a LINE (indentation allowed), followed by the word
 * under the caret. Start-of-line is exactly where `parseSkillCommands` recognises a command, so
 * the menu never offers something the expander would ignore — and `cd /build`, `https://x/run` or
 * a date like `3/4` never open it.
 */
const TOKEN_RE = /(?:^|\n)[ \t]*\/([^\s/]*)$/;

/**
 * One row of the "/" menu. Three kinds, because the menu is useful before the user has authored
 * anything:
 *  - `skill`  — one of the user's own skills. Accepting inserts `/<command> `; the SERVER (or the
 *               desktop main process) then expands it into that skill's instructions.
 *  - `prompt` — a built-in phrasing. Accepting replaces the token with ready-made text, so it needs
 *               no backend at all and works on any installed build.
 *  - `action` — a UI action (today: "create a command"). Accepting removes the token and runs it.
 */
export type SlashCommandKind = 'skill' | 'prompt' | 'action';

export interface SlashCommandItem {
  id: string;
  /** Slug WITHOUT the leading "/" (e.g. `sieu-ba`). */
  command: string;
  name: string;
  description?: string;
  /** false = the skill is off. The command still applies it (explicit intent wins) — we just say so. */
  enabled?: boolean;
  /** Defaults to 'skill' so an existing caller's items keep working unchanged. */
  kind?: SlashCommandKind;
  /** `prompt` kind: the text that replaces the token. */
  prompt?: string;
  /** `action` kind: what to run. */
  run?: () => void;
  /** Section heading this row sits under. */
  group?: string;
  /** Kept in the list whatever the query — the "create a command" row is always reachable. */
  pinned?: boolean;
}

/**
 * Built-in commands, always available — this is what "/" offers before the user has created a
 * single skill. They are pure composer-side text, so they need NO server and NO new desktop main
 * process: an install that predates skill commands still gets a useful "/" menu.
 *
 * ⚠️ Every slug here is also in `RESERVED_SKILL_COMMANDS` (packages/core/src/skillCommand.ts), so a
 * user skill can never shadow one. `scripts/check-skill-commands.mjs` fails if the two drift.
 */
export const BUILTIN_SLASH_COMMANDS: readonly {
  command: string;
  /** i18n key suffix → `chat.slashBuiltin_<key>` / `chat.slashBuiltinHint_<key>`. */
  key: string;
  name: string;
  description: string;
  prompt: string;
}[] = [
  {
    command: 'tom-tat',
    key: 'tomTat',
    name: 'Tóm tắt',
    description: 'Tóm tắt nội dung thành các ý chính',
    prompt: 'Tóm tắt nội dung sau thành các ý chính, ngắn gọn và dễ nắm:\n',
  },
  {
    command: 'giai-thich',
    key: 'giaiThich',
    name: 'Giải thích',
    description: 'Giải thích cặn kẽ, có ví dụ',
    prompt: 'Giải thích cặn kẽ, dễ hiểu, kèm ví dụ cụ thể:\n',
  },
  {
    command: 'viet-lai',
    key: 'vietLai',
    name: 'Viết lại',
    description: 'Viết lại cho rõ ràng, tự nhiên hơn',
    prompt: 'Viết lại đoạn sau cho rõ ràng, tự nhiên hơn nhưng GIỮ NGUYÊN ý:\n',
  },
  {
    command: 'dich',
    key: 'dich',
    name: 'Dịch',
    description: 'Dịch sang ngôn ngữ khác, giữ thuật ngữ',
    prompt: 'Dịch đoạn sau sang tiếng Anh (đổi ngôn ngữ đích nếu cần), giữ nguyên thuật ngữ chuyên ngành:\n',
  },
  {
    command: 'kiem-tra',
    key: 'kiemTra',
    name: 'Kiểm tra',
    description: 'Soát lỗi và đề xuất cách sửa',
    prompt: 'Soát lỗi giúp tôi và chỉ ra cách sửa từng lỗi:\n',
  },
  {
    command: 'y-tuong',
    key: 'yTuong',
    name: 'Ý tưởng',
    description: 'Gợi ý nhiều phương án để chọn',
    prompt: 'Đề xuất 5 ý tưởng khác nhau, mỗi ý kèm một câu vì sao nên chọn:\n',
  },
];

/** `SkillInfo[]` → menu rows, dropping every skill that has no shortcut. */
export function skillsToCommandItems(skills: SkillInfo[]): SlashCommandItem[] {
  const items: SlashCommandItem[] = [];
  for (const s of skills || []) {
    const command = (s.command || '').trim().toLowerCase();
    if (!command) continue;
    items.push({ id: s.id, command, name: s.name, description: s.description, enabled: s.enabled, kind: 'skill' });
  }
  return items;
}

/**
 * Case-insensitive match on the command AND the skill name; exact-prefix hits float to the top
 * (`/bao` puts `/bao-cao` above a skill merely named "Chốt báo giá").
 */
function matchCommands(commands: SlashCommandItem[], query: string): SlashCommandItem[] {
  const q = query.trim().toLowerCase();
  const scored: { item: SlashCommandItem; rank: number }[] = [];
  for (const c of commands || []) {
    if (!c?.command) continue;
    // A pinned row ("create a command") shows while the user is only browsing ("/" with nothing
    // typed yet), or when they type its OWN slug. It must never ride along on a token that matched
    // nothing else — it would then be the only row, selected, and Enter (meant to SEND "/help")
    // would delete the line and navigate to Skills instead. Deliberately no name-substring match
    // here: "/m" must not reach it via "Tạo lệnh mới".
    if (c.pinned) {
      if (!q || c.command.toLowerCase().startsWith(q)) scored.push({ item: c, rank: 9 });
      continue;
    }
    const cmd = c.command.toLowerCase();
    const name = (c.name || '').toLowerCase();
    if (!q || cmd.startsWith(q)) scored.push({ item: c, rank: 0 });
    else if (name.startsWith(q)) scored.push({ item: c, rank: 1 });
    else if (cmd.includes(q) || name.includes(q)) scored.push({ item: c, rank: 2 });
  }
  // Sort by SECTION first, then by match quality. Ranking purely by quality would interleave the
  // two sections and repeat their headings ("Có sẵn", "Lệnh của bạn", "Có sẵn"), which reads as a
  // rendering bug. Within a section, keep the caller's order for equal-quality matches.
  const order = new Map(commands.map((c, i) => [c, i] as const));
  const section = (it: SlashCommandItem) => (it.pinned ? 2 : it.kind === 'skill' || !it.kind ? 0 : 1);
  scored.sort(
    (a, b) =>
      section(a.item) - section(b.item) ||
      a.rank - b.rank ||
      (order.get(a.item) ?? 0) - (order.get(b.item) ?? 0),
  );
  return scored.map((s) => s.item);
}

export interface SlashCommandMenuProps {
  items: SlashCommandItem[];
  activeIndex: number;
  /** Keep the keyboard cursor under the mouse so hovering and the arrow keys agree. */
  onHover: (index: number) => void;
  onPick: (item: SlashCommandItem) => void;
}

/**
 * The popup itself — presentational, so the two composers (a raw <textarea> in AgentChat, an antd
 * Input.TextArea in LarkChat) can share it. It opens UPWARD and spans the composer width, so the
 * element it is rendered inside MUST have `position: 'relative'`.
 */
export function SlashCommandMenu({ items, activeIndex, onHover, onPick }: SlashCommandMenuProps) {
  const { t: tr } = useI18n();
  const rows = useRef<(HTMLDivElement | null)[]>([]);

  // Keep the keyboard-selected row visible when the list scrolls.
  useEffect(() => {
    rows.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, items.length]);

  return (
    <div
      style={{
        position: 'absolute', left: 0, right: 0, bottom: '100%', marginBottom: 8,
        background: V.surface, border: `1px solid ${V.border}`, borderRadius: 14,
        boxShadow: CARD_SHADOW, overflow: 'hidden', zIndex: 20,
      }}
    >
      <div role="listbox" style={{ maxHeight: 280, overflowY: 'auto', padding: 6 }}>
        {items.map((it, i) => {
          const active = i === activeIndex;
          const action = it.kind === 'action';
          // One heading per group, drawn when the group changes — the list is already ordered.
          const heading = it.group && it.group !== items[i - 1]?.group ? it.group : null;
          return (
            <div key={it.id}>
              {heading && (
                <div
                  style={{
                    fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase',
                    color: V.textFaint, padding: i ? '8px 9px 3px' : '2px 9px 3px',
                  }}
                >
                  {heading}
                </div>
              )}
              <div
                ref={(el) => { rows.current[i] = el; }}
                role="option"
                aria-selected={active}
                // Clicking must not blur the composer first — that would close the popup mid-click.
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => onHover(i)}
                onClick={() => onPick(it)}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 1, padding: '6px 9px',
                  borderRadius: 10, cursor: 'pointer', background: active ? `${BRAND}14` : 'transparent',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span
                    style={{
                      fontFamily: MONO, fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
                      color: active || action ? BRAND : V.text,
                    }}
                  >
                    {action ? '+' : `/${it.command}`}
                  </span>
                  <span
                    style={{
                      flex: 1, minWidth: 0, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap', color: active || action ? BRAND : V.textSub,
                      fontWeight: action ? 600 : 400,
                    }}
                  >
                    {it.name}
                  </span>
                  {it.enabled === false && (
                    <span style={{ background: V.surfaceMuted, color: V.textFaint, fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                      {tr('chat.slashSkillOff', 'đang tắt')}
                    </span>
                  )}
                </div>
                {!!it.description && (
                  <div style={{ fontSize: 11.5, color: V.textFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {it.description}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ borderTop: `1px solid ${V.border}`, padding: '5px 10px', fontSize: 11, color: V.textFaint }}>
        {tr('chat.slashHint', '↑↓ chọn · Enter dùng · Esc đóng')}
      </div>
    </div>
  );
}

export interface UseSlashCommandsOptions {
  /** Current composer text. */
  value: string;
  /** Set the composer text (accepting an item rewrites the "/query" token). */
  onChange: (next: string) => void;
  commands: SlashCommandItem[];
  /** Suppress the menu entirely (composer disabled / busy / blocked). */
  disabled?: boolean;
  /** Caret offset in `value`; falls back to the end of the text. */
  getCaret?: () => number | null;
  /** The composer element. The menu only lives while it holds focus, and `accept()` puts the caret
   *  back into IT rather than whatever `document.activeElement` happens to be. */
  getEl?: () => HTMLTextAreaElement | null;
  /** Open the Skills screen so the user can author a shortcut. When absent the "Tạo lệnh mới" row
   *  is hidden (nowhere to send them) — every other row still works. */
  onCreateCommand?: () => void;
  /** Drop the built-in presets and offer ONLY the user's own commands. Off by default: the whole
   *  point is that "/" is useful before anything has been authored. */
  builtins?: false;
}

export interface SlashCommandsApi {
  open: boolean;
  /** `commands` filtered by the token being typed. */
  items: SlashCommandItem[];
  activeIndex: number;
  /** Call FIRST from the composer key handler. Returns true when the menu consumed the key. */
  handleKeyDown: (e: ReactKeyboardEvent) => boolean;
  accept: (item?: SlashCommandItem) => void;
  close: () => void;
  /** The popup, or null when closed — render it inside a `position: 'relative'` wrapper. */
  menu: ReactNode;
}

/**
 * Slash-command menu for a chat composer: typing "/" lists the user's skill commands, picking one
 * inserts `/<command> ` into the message.
 *
 * Headless on purpose — the two composers differ (AgentChat owns a raw <textarea>; LarkChat uses
 * antd Input.TextArea, whose `onPressEnter` fires BEFORE `onKeyDown`), so the composer keeps its
 * own key wiring and only has to call `handleKeyDown(e)` first and bail out when it returns true.
 *
 * State is DERIVED from `value` + the caret on every render — no input events of its own.
 *
 * ⚠️ `menu` is absolutely positioned and opens upward: the element you render it in must have
 * `position: 'relative'`, otherwise it anchors to some ancestor far up the tree.
 */
export function useSlashCommands({
  value,
  onChange,
  commands,
  disabled,
  getCaret,
  getEl,
  onCreateCommand,
  builtins,
}: UseSlashCommandsOptions): SlashCommandsApi {
  const { t: tr } = useI18n();
  const [activeIndex, setActiveIndex] = useState(0);
  /** The exact token closed with Escape — keeps it closed while the user keeps typing THAT token,
   *  but a different token at the same offset (retyped after a delete) opens the menu again. */
  const [dismissed, setDismissed] = useState<{ start: number; query: string } | null>(null);
  /** The caret `accept()` just installed, pinned to the text it wrote: the DOM still reports the
   *  PRE-accept caret on the render accept() triggers, which would re-derive the old token and
   *  leave the menu open (swallowing the next Enter). */
  const pending = useRef<{ value: string; caret: number } | null>(null);
  /** The menu belongs to a FOCUSED composer — otherwise a click elsewhere leaves it floating over
   *  the transcript, still eating keys. */
  const [focused, setFocused] = useState(false);
  /**
   * Bumped on every caret move. The menu is derived from `value` + the caret during render, but
   * moving the caret (ArrowLeft, Home, a mouse click) changes NO React state — without this the
   * menu would stay open after the caret left the token, and Enter would rewrite a line the user
   * is no longer editing.
   */
  const [selTick, setSelTick] = useState(0);
  /**
   * Người gọi truyền `getEl`/`getCaret` dạng arrow inline nên chúng là hàm MỚI mỗi render. Để trong
   * deps thì effect gỡ + gắn lại 5 listener sau MỖI lần render — tức hai lần cho mỗi phím gõ. Giữ
   * qua ref để effect chỉ chạy một lần.
   */
  const getElRef = useRef(getEl);
  getElRef.current = getEl;

  useEffect(() => {
    const el = getElRef.current?.();
    if (!el) return;
    const on = () => setFocused(true);
    const off = () => setFocused(false);
    /**
     * Chỉ bơm khi caret dịch mà CHỮ KHÔNG ĐỔI.
     *
     * Gõ một ký tự bắn ba sự kiện riêng biệt (keydown → input → keyup) nên React không gộp được:
     * `input` đã re-render qua `setInput`, rồi `keyup` lại `setSelTick` → HAI lần render toàn bộ
     * khung chat cho MỘT phím. Mà lần thứ hai vô ích: chữ đổi thì lần render đầu đã dẫn xuất lại
     * caret rồi. So sánh với giá trị lần trước (đọc thẳng từ DOM, không phụ thuộc thời điểm React
     * vẽ lại) nên đúng cả khi render bị hoãn.
     */
    let lastVal = el.value;
    const moved = () => {
      if (el.value !== lastVal) {
        lastVal = el.value; // vừa gõ chữ — bỏ qua, render của `value` lo phần còn lại
        return;
      }
      setSelTick((n) => n + 1);
    };
    setFocused(typeof document !== 'undefined' && document.activeElement === el);
    el.addEventListener('focus', on);
    el.addEventListener('blur', off);
    // `select` covers programmatic + drag selection; keyup/click cover caret-only moves.
    el.addEventListener('select', moved);
    el.addEventListener('keyup', moved);
    el.addEventListener('click', moved);
    return () => {
      el.removeEventListener('focus', on);
      el.removeEventListener('blur', off);
      el.removeEventListener('select', moved);
      el.removeEventListener('keyup', moved);
      el.removeEventListener('click', moved);
    };
    // Cố ý chạy MỘT LẦN: phần tử được lấy qua ref, xem getElRef ở trên.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  void selTick; // re-derives the caret below; the value itself is never read
  const rawCaret = pending.current && pending.current.value === value ? pending.current.caret : getCaret?.();
  const caret = Math.max(0, Math.min(rawCaret == null ? value.length : rawCaret, value.length));
  const token = disabled ? null : TOKEN_RE.exec(value.slice(0, caret));
  const query = token ? token[1] : ''; // TOKEN_RE has one capture group: the word after the "/"
  /** Offset of the "/" itself, or -1 when no token is being typed. */
  const start = token ? caret - query.length - 1 : -1;

  // The user's own commands first, then the always-available presets, then the create row. Built
  // from `commands` on every render — the list is tiny and memoising it would only add a dep array.
  const allCommands: SlashCommandItem[] = [];
  for (const c of commands || []) allCommands.push({ ...c, group: tr('chat.slashGroupYours', 'Lệnh của bạn') });
  if (builtins !== false) {
    for (const b of BUILTIN_SLASH_COMMANDS) {
      allCommands.push({
        id: `builtin:${b.command}`,
        command: b.command,
        name: tr(`chat.slashBuiltin_${b.key}`, b.name),
        description: tr(`chat.slashBuiltinHint_${b.key}`, b.description),
        kind: 'prompt',
        prompt: tr(`chat.slashBuiltinText_${b.key}`, b.prompt),
        group: tr('chat.slashGroupBuiltin', 'Có sẵn'),
      });
    }
  }
  if (onCreateCommand) {
    allCommands.push({
      id: 'action:create',
      command: 'tao-lenh',
      name: tr('chat.slashCreate', 'Tạo lệnh mới…'),
      description: tr('chat.slashCreateHint', 'Đặt một lệnh riêng cho skill của bạn'),
      kind: 'action',
      run: onCreateCommand,
      group: tr('chat.slashGroupBuiltin', 'Có sẵn'),
      pinned: true,
    });
  }

  const items = matchCommands(allCommands, query);
  const open =
    start >= 0 &&
    !disabled &&
    (!getEl || focused) &&
    items.length > 0 &&
    // Escape keeps the menu shut while the user types the token FORWARD; deleting back into it
    // (or starting a different one at the same offset) means they're re-editing → offer it again.
    !(dismissed && dismissed.start === start && query.startsWith(dismissed.query));
  const activeIdx = items.length ? Math.min(activeIndex, items.length - 1) : 0;

  // A new token, a new keystroke inside it, OR a changed list all re-select the best match. The
  // list matters because `commands` arrives asynchronously: without this, skills loading while the
  // menu is open would shift the rows under a highlight that stayed on index 0.
  const tokenKey = start >= 0 ? `${start}:${query}:${items.map((i) => i.id).join('|')}` : '';
  useEffect(() => { setActiveIndex(0); }, [tokenKey]);

  // Once the token is gone (space typed, message sent, …) an earlier Escape no longer applies.
  useEffect(() => { if (start < 0 && dismissed !== null) setDismissed(null); }, [start, dismissed]);

  const close = useCallback(() => { setDismissed(start >= 0 ? { start, query } : null); }, [start, query]);

  const accept = useCallback((item?: SlashCommandItem) => {
    const target = item || items[activeIdx];
    if (!target || start < 0) return;
    // The word may run past the caret (the user clicked back into it) — replace all of it.
    let end = caret;
    while (end < value.length && !/\s/.test(value.charAt(end))) end++;
    // We always append one space; drop the old one so "/ba rồi" → "/bao-cao rồi", not two spaces.
    const rest = value.slice(end).replace(/^[ \t]+/, '');
    // What the token becomes, per kind: a skill leaves its `/command` in the message (the server /
    // main process expands it), a preset drops ready-made text in its place, and an action leaves
    // nothing behind at all.
    const insert =
      target.kind === 'prompt' ? target.prompt || '' : target.kind === 'action' ? '' : `/${target.command} `;
    const next = `${value.slice(0, start)}${insert}${rest}`;
    const pos = start + insert.length;
    if (target.kind === 'action') {
      // Remove the token first so the composer isn't left holding a half-typed "/tao" while the
      // user is looking at another screen, THEN navigate.
      pending.current = { value: next, caret: pos };
      onChange(next);
      setDismissed(null);
      setActiveIndex(0);
      target.run?.();
      return;
    }
    // Pin the caret to the text we are writing, so the very next render derives the token from
    // AFTER the accepted command instead of the stale DOM caret.
    pending.current = { value: next, caret: pos };
    onChange(next);
    setDismissed(null);
    setActiveIndex(0);
    // Focus never left the composer (rows preventDefault on mousedown), so put the caret back just
    // after the command — a controlled re-render otherwise drops it at the end of the text.
    const el = getEl?.() ?? (typeof document !== 'undefined' ? (document.activeElement as HTMLTextAreaElement | null) : null);
    if (el && typeof el.setSelectionRange === 'function') {
      setTimeout(() => {
        try {
          el.focus();
          el.setSelectionRange(pos, pos);
        } catch { /* ignore */ }
      }, 0);
    }
  }, [items, activeIdx, start, caret, value, onChange, getEl]);

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent): boolean => {
      // IME first: a Vietnamese/CJK candidate is committed with Enter — never steal that key.
      if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return false;
      if (!open) return false;
      const n = items.length;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (Math.min(i, n - 1) + 1) % n);
        return true;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (Math.min(i, n - 1) + n - 1) % n);
        return true;
      }
      // Shift+Enter is the composer's newline — let it through (the newline also ends the token,
      // so the menu closes on the next render by itself).
      if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
        e.preventDefault();
        accept();
        return true;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return true;
      }
      return false;
    },
    [open, items.length, accept, close],
  );

  const menu: ReactNode = open ? (
    <SlashCommandMenu items={items} activeIndex={activeIdx} onHover={setActiveIndex} onPick={(it) => accept(it)} />
  ) : null;

  return { open, items, activeIndex: activeIdx, handleKeyDown, accept, close, menu };
}
