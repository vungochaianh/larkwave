'use client';
import { memo, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { CopyOutlined, CheckOutlined, CodeOutlined, EyeOutlined, ExpandOutlined, DownloadOutlined } from '@ant-design/icons';
import { App, Modal } from 'antd';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { BRAND, CODE_BG_LIGHT, OK, V } from '../theme';
import { useThemeMode } from '../ThemeProvider';
import { ensureContrast, toRgb } from '../contrast';
import { useI18n } from '../i18n';

/** Trigger a browser download of in-memory text (client-side, same-origin blob — always works). */
function downloadText(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Map a fenced-code language to a sensible file extension. */
function extForLang(lang?: string): string {
  const l = (lang || '').toLowerCase();
  const map: Record<string, string> = {
    javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts', jsx: 'jsx', tsx: 'tsx',
    python: 'py', py: 'py', html: 'html', css: 'css', json: 'json', markdown: 'md', md: 'md',
    bash: 'sh', sh: 'sh', shell: 'sh', sql: 'sql', yaml: 'yml', yml: 'yml', svg: 'svg', xml: 'xml',
    java: 'java', go: 'go', rust: 'rs', c: 'c', cpp: 'cpp', php: 'php', ruby: 'rb', rb: 'rb',
  };
  return map[l] || 'txt';
}

/** Small copy-to-clipboard hook shared by the code + artifact blocks. */
function useCopy(text: string): [boolean, () => void] {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    try {
      void navigator.clipboard?.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked */
    }
  };
  return [copied, copy];
}

/**
 * Bộ màu tô sáng cú pháp theo đúng chế độ ĐANG ÁP DỤNG CHO CHÍNH KHỐI MÃ NÀY.
 *
 * Prism nhận màu bằng object JS, không đọc được biến CSS, nên không thể để `data-theme` tự đổi
 * như phần còn lại của app. Nếu chỉ dựa vào state React của ThemeProvider thì nền (do biến CSS
 * điều khiển) và màu chữ (do object điều khiển) chạy theo hai nguồn khác nhau — đo trên bản
 * deploy: nền đã đổi sang tối trong khi chữ vẫn là bảng sáng, tương phản rơi xuống 1.4:1, coi
 * như không đọc được. Chuyện đó xảy ra thật ở hai chỗ: trong lúc hydrate (thuộc tính data-theme
 * đã có trước khi state kịp cập nhật) và trong nhánh bị ép sáng bằng data-theme="light".
 *
 * Nên nguồn sự thật là chính biến CSS: đọc `--tw-code-dark` ngay tại phần tử. Nó phản ánh đúng
 * data-theme của TỔ TIÊN GẦN NHẤT, tức cùng một nguồn đã tô nền — hai thứ không thể lệch nhau.
 * `mode` vẫn được giữ trong deps để lần lật chế độ nào cũng kích hoạt đọc lại.
 */
function useCodeTheme(): [Record<string, React.CSSProperties>, (el: HTMLDivElement | null) => void] {
  const { mode } = useThemeMode();
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [dark, setDark] = useState(mode === 'dark');

  useEffect(() => {
    if (!el) {
      setDark(mode === 'dark');
      return;
    }
    const v = getComputedStyle(el).getPropertyValue('--tw-code-dark').trim();
    setDark(v === '1' || (v === '' && mode === 'dark'));
  }, [el, mode]);

  const theme = useMemo(() => {
    const base = dark ? vscDarkPlus : oneLight;
    const bg = toRgb(CODE_BG_LIGHT) ?? [255, 255, 255];
    const out: Record<string, React.CSSProperties> = {};
    for (const [k, style] of Object.entries(base)) {
      const st = style as React.CSSProperties;
      out[k] = dark || typeof st.color !== 'string' ? st : { ...st, color: ensureContrast(st.color, bg) };
    }
    // Nền để trong suốt: chỉ MÀU CHỮ đến từ object này, còn nền vẫn do token điều khiển nên
    // luôn khớp với phần còn lại của giao diện.
    out['pre[class*="language-"]'] = { ...out['pre[class*="language-"]'], background: 'transparent' };
    out['code[class*="language-"]'] = { ...out['code[class*="language-"]'], background: 'transparent' };
    return out;
  }, [dark]);

  return [theme, setEl];
}

/** A fenced code block with a language label + copy button + syntax highlighting (Claude-style). */
function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const { t } = useI18n();
  const [copied, copy] = useCopy(code);
  const [codeTheme, codeRef] = useCodeTheme();
  const label = lang ? lang.charAt(0).toUpperCase() + lang.slice(1) : 'Code';
  return (
    <div ref={codeRef} style={{ margin: '12px 0', borderRadius: 10, overflow: 'hidden', border: `1px solid ${V.codeBorder}`, background: V.codeBg }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 10px 5px 12px', background: V.codeHeaderBg, borderBottom: `1px solid ${V.codeBorder}` }}>
        <span style={{ fontSize: 11, color: V.textSub, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <CodeOutlined /> {label}
        </span>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => downloadText(code, `code-${Date.now()}.${extForLang(lang)}`, 'text/plain;charset=utf-8')}
            title={t('md.downloadFile', 'Tải file')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: V.textSub, fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 4px' }}
          >
            <DownloadOutlined /> {t('md.download', 'Tải')}
          </button>
          <button
            onClick={copy}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? OK : V.textSub, fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 4px' }}
          >
            {copied ? <><CheckOutlined /> {t('md.copied', 'Đã chép')}</> : <><CopyOutlined /> {t('md.copy', 'Sao chép')}</>}
          </button>
        </div>
      </div>
      <SyntaxHighlighter
        language={(lang || 'text').toLowerCase()}
        style={codeTheme}
        customStyle={{ margin: 0, padding: '10px 12px', fontSize: 12.5, lineHeight: 1.55, background: 'transparent', borderRadius: 0 }}
        codeTagProps={{ style: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' } }}
        PreTag="div"
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

/**
 * A live "artifact" — renders model-generated HTML or SVG in a SANDBOXED iframe (no same-origin, so
 * it can't touch the parent/cookies/storage), like Claude's artifacts. Preview / Code toggle, copy,
 * and an expand-to-fullscreen. This is what makes answers "vẽ đẹp" (charts, diagrams, canvas, etc.).
 */
function ArtifactBlock({ code, kind }: { code: string; kind: 'html' | 'svg' }) {
  const { t } = useI18n();
  const { message } = App.useApp();
  const [tab, setTab] = useState<'preview' | 'code'>('preview');
  const [expanded, setExpanded] = useState(false);
  const [copied, copy] = useCopy(code);
  const [codeTheme, codeRef] = useCodeTheme();
  const label = kind === 'svg' ? 'SVG' : 'HTML';
  // SVG is wrapped in a minimal, centered page; HTML is rendered as authored.
  const srcDoc =
    kind === 'svg'
      ? `<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;height:100%}body{display:flex;align-items:center;justify-content:center;background:#fff;padding:12px}svg{max-width:100%;height:auto}</style>${code}`
      : code;
  const iframe = (height: number | string) => (
    <iframe
      title={`${label} artifact`}
      srcDoc={srcDoc}
      sandbox="allow-scripts allow-popups allow-forms allow-modals"
      referrerPolicy="no-referrer"
      style={{ width: '100%', height, border: 'none', background: '#fff', display: 'block' }}
    />
  );
  const seg = (val: 'preview' | 'code', icon: ReactNode, text: string) => (
    <button
      onClick={() => setTab(val)}
      style={{
        background: tab === val ? V.surface : 'transparent',
        color: tab === val ? BRAND : V.textSub,
        border: `1px solid ${tab === val ? V.border : 'transparent'}`,
        borderRadius: 7, cursor: 'pointer', fontSize: 11.5, fontWeight: 600,
        padding: '3px 9px', display: 'inline-flex', alignItems: 'center', gap: 5,
      }}
    >
      {icon} {text}
    </button>
  );
  const toolBtn = (onClick: () => void, title: string, node: ReactNode) => (
    <button onClick={onClick} title={title} style={{ background: 'none', border: 'none', cursor: 'pointer', color: V.textFaint, fontSize: 13, padding: '3px 5px', display: 'inline-flex', alignItems: 'center' }}>
      {node}
    </button>
  );
  // Download the artifact SOURCE (client, instant) — the .html/.svg file itself.
  const downloadSource = () =>
    downloadText(kind === 'svg' ? code : srcDoc, `artifact-${Date.now()}.${kind === 'svg' ? 'svg' : 'html'}`, kind === 'svg' ? 'image/svg+xml' : 'text/html;charset=utf-8');
  return (
    <div ref={codeRef} style={{ margin: '14px 0', borderRadius: 12, overflow: 'hidden', border: `1px solid ${V.border}`, background: V.surface }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 8px', background: V.surfaceAlt, borderBottom: `1px solid ${V.borderSub}` }}>
        <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: V.textFaint, letterSpacing: 0.4, marginRight: 4 }}>{label}</span>
          {seg('preview', <EyeOutlined />, t('md.view', 'Xem'))}
          {seg('code', <CodeOutlined />, t('md.code', 'Mã'))}
        </div>
        <div style={{ display: 'inline-flex', gap: 2 }}>
          {toolBtn(downloadSource, t('md.downloadSource', 'Tải file mã'), <DownloadOutlined />)}
          {toolBtn(copy, t('md.copy', 'Sao chép'), copied ? <CheckOutlined style={{ color: OK }} /> : <CopyOutlined />)}
          {toolBtn(() => setExpanded(true), t('md.expand', 'Mở rộng'), <ExpandOutlined />)}
        </div>
      </div>
      {tab === 'preview' ? (
        iframe(420)
      ) : (
        <SyntaxHighlighter language={kind === 'svg' ? 'markup' : 'markup'} style={codeTheme} customStyle={{ margin: 0, padding: '10px 12px', fontSize: 12.5, lineHeight: 1.55, maxHeight: 420, background: V.codeBg, borderRadius: 0 }} PreTag="div">
          {code}
        </SyntaxHighlighter>
      )}
      <Modal open={expanded} onCancel={() => setExpanded(false)} footer={null} width="90vw" style={{ top: 24 }} styles={{ body: { padding: 0, height: '82vh' } }} title={t('md.fullscreen', '{label} — xem toàn màn hình', { label })} destroyOnClose>
        {iframe('82vh')}
      </Modal>
    </div>
  );
}

/** Renders a ```mermaid diagram. Mermaid is lazy-loaded (heavy) and only client-side; on any
 *  parse error it falls back to showing the raw code so nothing is lost. */
function MermaidBlock({ code }: { code: string }) {
  const { t } = useI18n();
  const [svg, setSvg] = useState<string>('');
  const [failed, setFailed] = useState(false);
  const { mode } = useThemeMode();
  const rawId = useId();
  const idRef = useRef('mmd' + rawId.replace(/[^a-zA-Z0-9]/g, ''));
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        // Mermaid nướng màu thẳng vào SVG lúc render, không đọc biến CSS — nên phải chọn theme
        // ngay đây và VẼ LẠI khi người dùng đổi chế độ (vì thế `mode` nằm trong deps).
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: mode === 'dark' ? 'dark' : 'default', fontFamily: 'inherit' });
        const { svg } = await mermaid.render(idRef.current, code.trim());
        if (alive) setSvg(svg);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [code, mode]);
  if (failed) return <CodeBlock code={code} lang="mermaid" />;
  if (!svg) return <div style={{ margin: '14px 0', padding: 16, textAlign: 'center', color: V.textFaint, fontSize: 12, border: `1px solid ${V.border}`, borderRadius: 12, background: V.surface }}>{t('md.drawing', 'Đang vẽ sơ đồ…')}</div>;
  return (
    <div
      style={{ margin: '14px 0', padding: 16, overflowX: 'auto', textAlign: 'center', border: `1px solid ${V.border}`, borderRadius: 12, background: V.surface }}
      // mermaid renders with securityLevel:'strict' (its own sanitizer) → safe to inject.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
// Single source of truth for the WF definition patterns + plainText — the collapsed-answer
// digest parses the same messages, so the two must never drift apart.
import { plainText, WF_HEADING, WF_TABLE_ROW, WF_BOLD, WF_COLON } from '../messageDigest';

/**
 * Compact, dependency-free Markdown renderer for chat bubbles — bold/italic,
 * `inline code`, ``` code blocks, - / 1. lists, #/## headings, [links](url),
 * blockquotes, GFM tables. Renders to React nodes (no dangerouslySetInnerHTML) so
 * model output can't inject markup.
 *
 * PLUS a workflow "prettifier" (works retroactively on already-stored text): the
 * Lark workflow reader emits a text tree — `• <emoji> …` step lines, `┗ ✔/✗ …`
 * branch labels, `↳ …` guards, real table/field/option names in «…», status
 * `đang bật/đang tắt`. We render «…» as chips, the status as pills, the tree as a
 * nested colour-coded card, and turn "WF1"/"WF 2" mentions into in-message jump links.
 */

// ── Workflow tree vocabulary ─────────────────────────────────────────────────
const STEP_EMOJIS = ['⚡', '🔍', '➕', '✏️', '🗑️', '🧩', '✉️', '🔗', '🔁', '🔀'];
type Cat = 'trigger' | 'action' | 'loop' | 'branch' | 'neutral';
const CAT: Record<Cat, { fg: string; bg: string }> = {
  trigger: { fg: BRAND, bg: 'rgba(108,92,231,0.12)' },
  action: { fg: '#3B82F6', bg: 'rgba(59,130,246,0.14)' },
  loop: { fg: '#14B8A6', bg: 'rgba(20,184,166,0.14)' },
  branch: { fg: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
  neutral: { fg: V.textSub, bg: V.surfaceAlt },
};
function catOf(emoji?: string): Cat {
  if (emoji === '⚡') return 'trigger';
  if (emoji === '🔁') return 'loop';
  if (emoji === '🔀') return 'branch';
  if (emoji && ['🔍', '➕', '✏️', '🗑️', '🧩', '✉️', '🔗'].includes(emoji)) return 'action';
  return 'neutral';
}
function branchStyle(rest: string): { fg: string; bg: string } {
  if (rest.startsWith('✔')) return { fg: '#16B98D', bg: 'rgba(22,185,141,0.12)' };
  if (rest.startsWith('✗')) return { fg: '#EF4444', bg: 'rgba(239,68,68,0.10)' };
  return { fg: '#B45309', bg: 'rgba(245,158,11,0.15)' }; // Nhánh / Mặc định / other
}
const isTreeLine = (l: string) => /^\s*[•┗↳]/.test(l) && l.trim() !== '';

interface InlineCtx {
  uid: string;
  wfDefs: Set<string>; // WF numbers that have a definition/anchor in this message
  wfPreview: Record<string, string>; // WF number → short "title\n⚡ trigger" preview for the hover tooltip
}

/** A "WF<n>" mention: click to jump to its definition, hover to preview it (title + trigger). */
function WfRef({ uid, n, label, preview }: { uid: string; n: string; label: string; preview?: string }) {
  // The tooltip uses position:fixed (anchored to the hovered link's viewport rect) so it can
  // NEVER be clipped by the message bubble or a table's horizontal-scroll wrapper. Coordinates
  // are captured on hover and pre-clamped to the viewport, flipping below when near the top.
  const [pos, setPos] = useState<{ x: number; y: number; above: boolean } | null>(null);
  const TIP_W = 300; // maxWidth used for edge clamping
  const open = (el: HTMLElement | null) => {
    if (!el || typeof window === 'undefined') return;
    const r = el.getBoundingClientRect();
    const above = r.top > 96; // enough room above? else drop below the link
    const x = Math.max(8, Math.min(r.left, window.innerWidth - TIP_W - 8));
    setPos({ x, y: above ? r.top - 6 : r.bottom + 6, above });
  };
  const firstLine = preview ? preview.split('\n')[0] : '';
  const restLines = preview ? preview.split('\n').slice(1).join('\n') : '';
  return (
    <span
      style={{ display: 'inline-block' }}
      onMouseEnter={(e) => open(e.currentTarget)}
      onMouseLeave={() => setPos(null)}
    >
      <a
        href={`#${uid}-wf-${n}`}
        onClick={(e) => {
          e.preventDefault();
          scrollToWf(uid, n);
        }}
        style={{ color: BRAND, fontWeight: 700, textDecoration: 'none', cursor: 'pointer', borderBottom: `1px dashed ${BRAND}` }}
      >
        {label}
      </a>
      {pos && preview && (
        <span
          style={{
            position: 'fixed',
            left: pos.x,
            top: pos.y,
            transform: pos.above ? 'translateY(-100%)' : undefined,
            zIndex: 2147483000,
            background: '#1E2230',
            color: '#F3F4F8',
            padding: '7px 10px',
            borderRadius: 8,
            fontSize: 12,
            lineHeight: 1.45,
            whiteSpace: 'pre-wrap',
            width: 'max-content',
            maxWidth: TIP_W,
            boxShadow: '0 6px 20px rgba(0,0,0,0.28)',
            pointerEvents: 'none',
            fontWeight: 400,
          }}
        >
          <span style={{ fontWeight: 700 }}>{firstLine}</span>
          {restLines && <span style={{ display: 'block', marginTop: 2, opacity: 0.72 }}>{restLines}</span>}
        </span>
      )}
    </span>
  );
}

/** Smooth-scroll to a WF definition anchor within this message + briefly highlight it. */
function scrollToWf(uid: string, n: string) {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(`${uid}-wf-${n}`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const orig = el.style.background;
  el.style.transition = 'background 0.35s';
  el.style.background = 'rgba(108,92,231,0.14)';
  setTimeout(() => {
    el.style.background = orig;
  }, 950);
}

function renderInline(text: string, ctx?: InlineCtx): ReactNode[] {
  const nodes: ReactNode[] = [];
  const key = () => `i${nodes.length}`;
  const pattern = /(`[^`]+`)|(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(__[^_]+__)|(«[^»]+»)|(\bWF[-\s]?\d+\b)|(đang bật|đang tắt)/;
  let rest = text;
  while (rest.length > 0) {
    const m = rest.match(pattern);
    if (!m || m.index === undefined) {
      nodes.push(rest);
      break;
    }
    if (m.index > 0) nodes.push(rest.slice(0, m.index));
    const tok = m[0];
    if (tok.startsWith('`')) {
      nodes.push(
        <code
          key={key()}
          style={{
            background: 'rgba(108,92,231,0.10)',
            color: V.chipText,
            padding: '1px 5px',
            borderRadius: 5,
            fontSize: '0.9em',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          }}
        >
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (tok.startsWith('[')) {
      const label = tok.slice(1, tok.indexOf(']'));
      const url = tok.slice(tok.indexOf('(') + 1, -1);
      nodes.push(
        <a key={key()} href={url} target="_blank" rel="noopener noreferrer" style={{ color: BRAND, textDecoration: 'underline' }}>
          {label}
        </a>,
      );
    } else if (tok.startsWith('**') || tok.startsWith('__')) {
      nodes.push(<strong key={key()}>{renderInline(tok.slice(2, -2), ctx)}</strong>);
    } else if (tok.startsWith('«')) {
      // Field / table / option name → chip.
      nodes.push(
        <span
          key={key()}
          style={{
            background: V.chipBg,
            color: V.chipText,
            border: `1px solid ${V.border}`,
            borderRadius: 5,
            padding: '0 5px',
            fontSize: '0.92em',
            fontWeight: 600,
          }}
        >
          {tok.slice(1, -1)}
        </span>,
      );
    } else if (/^WF[-\s]?\d+$/.test(tok)) {
      const n = tok.replace(/\D/g, '');
      if (ctx && ctx.wfDefs.has(n)) {
        nodes.push(<WfRef key={key()} uid={ctx.uid} n={n} label={tok} preview={ctx.wfPreview[n]} />);
      } else {
        nodes.push(tok);
      }
    } else if (tok === 'đang bật' || tok === 'đang tắt') {
      const on = tok === 'đang bật';
      nodes.push(
        <span
          key={key()}
          style={{
            background: on ? 'rgba(22,185,141,0.12)' : V.surfaceAlt,
            color: on ? '#16B98D' : V.textSub,
            borderRadius: 999,
            padding: '0 8px',
            fontSize: '0.85em',
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          {tok}
        </span>,
      );
    } else if (tok.startsWith('*')) {
      nodes.push(<em key={key()}>{renderInline(tok.slice(1, -1), ctx)}</em>);
    }
    rest = rest.slice(m.index + tok.length);
  }
  return nodes;
}

/** Render a contiguous run of workflow-tree lines as a nested, colour-coded card. */
function renderTree(run: string[], ctx: InlineCtx, k: string): ReactNode {
  const rows = run.map((line, idx) => {
    const trimmed = line.trimStart();
    const depth = Math.min(Math.floor((line.length - trimmed.length) / 2), 8);
    const padLeft = depth * 16;
    const marker = trimmed[0];
    let rest = trimmed.slice(1).replace(/^\s+/, '');

    if (marker === '•') {
      const emoji = STEP_EMOJIS.find((e) => rest.startsWith(e));
      if (emoji) rest = rest.slice(emoji.length).replace(/^\s+/, '');
      const c = CAT[catOf(emoji)];
      return (
        <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, paddingLeft: padLeft }}>
          <span
            style={{
              flex: '0 0 auto',
              width: 22,
              height: 22,
              borderRadius: 6,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: c.bg,
              fontSize: 13,
              lineHeight: 1,
            }}
          >
            {emoji || <span style={{ color: c.fg }}>•</span>}
          </span>
          <span style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>{renderInline(rest, ctx)}</span>
        </div>
      );
    }
    if (marker === '┗') {
      const bs = branchStyle(rest);
      return (
        <div key={idx} style={{ display: 'flex', paddingLeft: padLeft + 6 }}>
          <span style={{ color: V.textFaint, marginRight: 4, fontSize: 12 }}>┗</span>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              background: bs.bg,
              color: bs.fg,
              borderRadius: 999,
              padding: '1px 9px',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {renderInline(rest, ctx)}
          </span>
        </div>
      );
    }
    // '↳' edge guard
    return (
      <div key={idx} style={{ display: 'flex', paddingLeft: padLeft + 6 }}>
        <span style={{ color: '#B45309', background: 'rgba(245,158,11,0.10)', borderRadius: 6, padding: '1px 8px', fontSize: 12 }}>
          ↳ {renderInline(rest, ctx)}
        </span>
      </div>
    );
  });
  return (
    <div
      key={k}
      style={{
        margin: '8px 0',
        border: `1px solid ${V.border}`,
        borderRadius: 10,
        background: V.surfaceAlt,
        padding: '8px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      {rows}
    </div>
  );
}

const H: Record<number, CSSProperties> = {
  1: { fontSize: 16.5, fontWeight: 800, margin: '18px 0 7px' },
  2: { fontSize: 15, fontWeight: 700, margin: '16px 0 6px' },
  3: { fontSize: 14, fontWeight: 700, margin: '13px 0 5px' },
  4: { fontSize: 13.5, fontWeight: 700, margin: '12px 0 4px' },
};

/** Column alignments from a GFM separator row (`:---`, `:--:`, `--:`). */
function parseAlign(sep: string): (CSSProperties['textAlign'])[] {
  return sep
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => {
      const t = c.trim();
      const l = t.startsWith(':');
      const r = t.endsWith(':');
      return r && l ? 'center' : r ? 'right' : 'left';
    });
}

/**
 * Memo hoá vì đây là nơi TỐN NHẤT trong khung chat, và nó phụ thuộc đúng MỘT chuỗi.
 *
 * Người dùng báo "gõ chữ thì đơ một lúc mới hiện". Nguyên nhân: state ô nhập nằm ở component chứa
 * cả danh sách tin nhắn, nên MỖI PHÍM gõ vẽ lại toàn bộ hội thoại — mà mỗi lần vẽ lại, hàm này
 * tách dòng, quét lại toàn văn để tìm tham chiếu, dựng lại cây phần tử, và chạy lại Prism tô màu
 * cho TỪNG khối mã. Hội thoại càng dài thì gõ càng dính.
 *
 * `content` là chuỗi nên so sánh nông của memo là đủ và đúng; mọi nơi gọi đều chỉ truyền prop này.
 */
export const ChatMarkdown = memo(function ChatMarkdown({ content }: { content: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const lines = (content ?? '').replace(/\r\n/g, '\n').split('\n');

  // Pre-scan for WF definitions across the formats the model actually uses — headings
  // (`## WF-13 — "name"`), summary-table rows (`| WF13 | name | status |`), bold, and `WF13:` — so
  // any "WF-13"/"WF13" mention becomes a jump link + hover preview showing its NAME (+ status).
  const wfDefs = new Set<string>();
  const wfPreview: Record<string, string> = {};
  const cleanName = (s: string) =>
    s
      .replace(/\*\*/g, '')
      .replace(/`/g, '')
      .replace(/^["“'']+|["”'']+$/g, '')
      .replace(/\s*[—–-]\s*$/, '')
      .trim();
  const firstTrigger = (from: number) => {
    for (let k = from + 1; k < Math.min(from + 8, lines.length); k += 1) {
      const t = lines[k].trim();
      if (t.startsWith('•')) return plainText(t);
      if (/^#{1,6}\s/.test(lines[k])) break;
    }
    return '';
  };
  const addDef = (n: string, name: string, extra?: string) => {
    wfDefs.add(n);
    if (wfPreview[n]) return;
    const nm = cleanName(name) || `WF${n}`;
    wfPreview[n] = extra ? `${nm}\n${extra}` : nm;
  };
  for (let li = 0; li < lines.length; li += 1) {
    const L = lines[li];
    let m: RegExpMatchArray | null;
    if ((m = L.match(WF_HEADING))) {
      addDef(m[1], m[2], firstTrigger(li)); // ## WF-13 — "name"
    } else if ((m = L.match(WF_TABLE_ROW))) {
      const rest = m[3].split('|').map((c) => c.trim()).filter(Boolean).slice(0, 2).join(' · ');
      addDef(m[1], m[2], rest || undefined); // | WF13 | name | status | summary |
    } else if ((m = L.match(WF_BOLD))) {
      addDef(m[1], m[2], firstTrigger(li)); // **WF-14 — name**
    } else if ((m = L.match(WF_COLON))) {
      addDef(m[1], m[2], firstTrigger(li)); // WF13: name
    }
  }
  const ctx: InlineCtx = { uid, wfDefs, wfPreview };
  const pending = new Set(wfDefs); // assign each anchor id to the FIRST block that defines it
  const anchorFor = (raw: string): string | undefined => {
    for (const l of raw.split('\n')) {
      const m = l.match(/^\s*(?:#{1,6}\s*|\|\s*|\*\*\s*)?WF[-\s]?(\d+)\b\s*(?:[—–\-:：]|\|)/);
      if (m && pending.has(m[1])) {
        pending.delete(m[1]);
        return `${uid}-wf-${m[1]}`;
      }
    }
    return undefined;
  };

  const blocks: ReactNode[] = [];
  const key = () => `b${blocks.length}`;
  // GFM table detection — hoisted so the paragraph fallback can STOP at a table start
  // (a header line whose next line is a |---|---| separator). Without this, a title line
  // directly above a table with no blank line between them swallowed the whole table into a <p>.
  const isSep = (l: string) => l.includes('|') && l.includes('-') && /^[\s|:-]+$/.test(l);
  const isTableStart = (idx: number) =>
    idx < lines.length && lines[idx].includes('|') && idx + 1 < lines.length && isSep(lines[idx + 1]);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim();
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1;
      const fenceCode = buf.join('\n');
      const fenceLang = lang.toLowerCase();
      if (fenceLang === 'html' || fenceLang === 'svg') {
        blocks.push(<ArtifactBlock key={key()} code={fenceCode} kind={fenceLang} />);
      } else if (fenceLang === 'mermaid') {
        blocks.push(<MermaidBlock key={key()} code={fenceCode} />);
      } else {
        blocks.push(<CodeBlock key={key()} code={fenceCode} lang={lang} />);
      }
      continue;
    }

    if (line.trim() === '') {
      i += 1;
      continue;
    }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const lvl = h[1].length;
      const Tag = `h${lvl}` as unknown as keyof React.JSX.IntrinsicElements;
      blocks.push(
        <Tag key={key()} id={anchorFor(h[2])} style={H[lvl]}>
          {renderInline(h[2], ctx)}
        </Tag>,
      );
      i += 1;
      continue;
    }

    // Horizontal rule: --- / *** / ___ on its own line.
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push(<hr key={key()} style={{ border: 0, borderTop: `1px solid ${V.border}`, margin: '10px 0' }} />);
      i += 1;
      continue;
    }

    // GFM table: a header row with pipes, then a |---|---| separator, then body rows.
    if (isTableStart(i)) {
      const parseRow = (l: string) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      const header = parseRow(line);
      const align = parseAlign(lines[i + 1]);
      i += 2; // skip header + separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(parseRow(lines[i]));
        i += 1;
      }
      const cell: CSSProperties = { border: `1px solid ${V.border}`, padding: '5px 9px', verticalAlign: 'top' };
      blocks.push(
        <div key={key()} style={{ overflowX: 'auto', margin: '8px 0' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12.5, lineHeight: 1.45 }}>
            <thead>
              <tr>
                {header.map((c, idx) => (
                  <th
                    key={idx}
                    style={{ ...cell, textAlign: align[idx] || 'left', background: V.surfaceMuted, fontWeight: 700, color: V.textSub, whiteSpace: 'nowrap' }}
                  >
                    {renderInline(c, ctx)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => {
                // If a row's first cell is "WF13"/"WF-13", make it the jump anchor for that workflow.
                const wfm = (r[0] || '').replace(/\s/g, '').match(/^WF-?(\d+)$/i);
                let rowId: string | undefined;
                if (wfm && pending.has(wfm[1])) {
                  pending.delete(wfm[1]);
                  rowId = `${uid}-wf-${wfm[1]}`;
                }
                return (
                  <tr key={ri} id={rowId} style={{ background: ri % 2 ? V.surfaceAlt : V.surface }}>
                    {header.map((_, ci) => (
                      <td key={ci} style={{ ...cell, textAlign: align[ci] || 'left', color: V.text }}>
                        {renderInline(r[ci] ?? '', ctx)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (line.trim().startsWith('>')) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      blocks.push(
        <blockquote key={key()} style={{ borderLeft: `3px solid ${BRAND}`, margin: '8px 0', padding: '4px 12px', color: V.textSub }}>
          {renderInline(buf.join(' '), ctx)}
        </blockquote>,
      );
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ul key={key()} style={{ margin: '6px 0', paddingLeft: 20, lineHeight: 1.6 }}>
          {items.map((it, idx) => (
            <li key={idx} style={{ marginBottom: 2 }}>
              {renderInline(it, ctx)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ol key={key()} style={{ margin: '6px 0', paddingLeft: 20, lineHeight: 1.6 }}>
          {items.map((it, idx) => (
            <li key={idx} style={{ marginBottom: 2 }}>
              {renderInline(it, ctx)}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    // Workflow tree: consecutive •/┗/↳ lines that carry the workflow signature.
    if (isTreeLine(line)) {
      let j = i;
      while (j < lines.length && isTreeLine(lines[j])) j += 1;
      const run = lines.slice(i, j);
      const signature = run.some((l) => {
        const t = l.trimStart();
        return (
          t[0] === '┗' ||
          t[0] === '↳' ||
          (t[0] === '•' && STEP_EMOJIS.some((e) => t.slice(1).replace(/^\s+/, '').startsWith(e)))
        );
      });
      if (signature) {
        blocks.push(renderTree(run, ctx, key()));
      } else {
        // Not a workflow tree → keep as plain prose (preserves «…» chips etc.).
        blocks.push(
          <p key={key()} style={{ margin: '0 0 12px', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
            {renderInline(run.join('\n'), ctx)}
          </p>,
        );
      }
      i = j;
      continue;
    }

    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('```') &&
      !/^#{1,4}\s/.test(lines[i]) &&
      !lines[i].trim().startsWith('>') &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !isTreeLine(lines[i]) &&
      !isTableStart(i) // stop so a title line directly above a table doesn't swallow it
    ) {
      buf.push(lines[i]);
      i += 1;
    }
    const raw = buf.join('\n');
    blocks.push(
      <p key={key()} id={anchorFor(raw)} style={{ margin: '0 0 12px', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
        {renderInline(raw, ctx)}
      </p>,
    );
  }
  return <div style={{ overflowWrap: 'anywhere' }}>{blocks}</div>;
});
