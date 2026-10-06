import type { CSSProperties, ReactNode } from "react";
import { V } from "../theme";

/**
 * Small, dependency-free Markdown renderer for blog post bodies. Supports the
 * common subset: # headings, paragraphs, **bold**, *italic*, `inline code`,
 * [links](url), ![images](alt), - / 1. lists, > blockquotes, ``` code blocks,
 * --- rules. Renders to React nodes (no dangerouslySetInnerHTML) so author
 * content can't inject markup. Safe to use in server components.
 */

const BRAND = "#6C5CE7";

/** Render inline spans: code, images, links, bold, italic. Keys are positional
 * (unique among siblings) so rendering stays pure — no shared mutable counter. */
function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const nextKey = () => `i${nodes.length}`;
  // Tokenise by the first matching inline pattern, left to right.
  const pattern =
    /(`[^`]+`)|(!\[[^\]]*\]\([^)]+\))|(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*)|(\*[^*]+\*)/;
  let rest = text;
  while (rest.length > 0) {
    const m = rest.match(pattern);
    if (!m || m.index === undefined) {
      nodes.push(rest);
      break;
    }
    if (m.index > 0) nodes.push(rest.slice(0, m.index));
    const tok = m[0];
    if (tok.startsWith("`")) {
      nodes.push(
        <code
          key={nextKey()}
          style={{
            background: V.chipBg,
            color: V.chipText,
            padding: "1px 6px",
            borderRadius: 6,
            fontSize: "0.92em",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          }}
        >
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (tok.startsWith("![")) {
      const alt = tok.slice(2, tok.indexOf("]"));
      const url = tok.slice(tok.indexOf("(") + 1, -1);
      nodes.push(
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={nextKey()}
          src={url}
          alt={alt}
          style={{ maxWidth: "100%", borderRadius: 12, margin: "8px 0" }}
        />,
      );
    } else if (tok.startsWith("[")) {
      const label = tok.slice(1, tok.indexOf("]"));
      const url = tok.slice(tok.indexOf("(") + 1, -1);
      const external = /^https?:\/\//.test(url);
      nodes.push(
        <a
          key={nextKey()}
          href={url}
          style={{ color: BRAND, textDecoration: "underline" }}
          {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          {label}
        </a>,
      );
    } else if (tok.startsWith("**")) {
      nodes.push(<strong key={nextKey()}>{renderInline(tok.slice(2, -2))}</strong>);
    } else if (tok.startsWith("*")) {
      nodes.push(<em key={nextKey()}>{renderInline(tok.slice(1, -1))}</em>);
    }
    rest = rest.slice(m.index + tok.length);
  }
  return nodes;
}

const H_STYLES: Record<number, CSSProperties> = {
  1: { fontSize: "clamp(26px,4vw,34px)", fontWeight: 800, margin: "28px 0 12px", lineHeight: 1.2 },
  2: { fontSize: "clamp(22px,3vw,27px)", fontWeight: 800, margin: "26px 0 10px", lineHeight: 1.25 },
  3: { fontSize: "clamp(18px,2.4vw,21px)", fontWeight: 700, margin: "22px 0 8px" },
  4: { fontSize: 17, fontWeight: 700, margin: "18px 0 6px" },
  5: { fontSize: 15.5, fontWeight: 700, margin: "16px 0 6px", letterSpacing: 0.1 },
  6: { fontSize: 14, fontWeight: 700, margin: "14px 0 6px", textTransform: "uppercase", letterSpacing: 0.4, opacity: 0.85 },
};

export default function BlogMarkdown({ content }: { content: string }) {
  const lines = (content ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  // Positional key — unique among block siblings, evaluated before each push.
  const nextKey = () => `b${blocks.length}`;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block ```
    if (line.trim().startsWith("```")) {
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1; // skip closing fence
      blocks.push(
        <pre
          key={nextKey()}
          style={{
            background: V.codeBg,
            color: V.codeText,
            border: `1px solid ${V.codeBorder}`,
            padding: "14px 16px",
            borderRadius: 12,
            overflowX: "auto",
            fontSize: 13.5,
            lineHeight: 1.6,
            margin: "14px 0",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          }}
        >
          <code>{buf.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // Blank line → skip
    if (line.trim() === "") {
      i += 1;
      continue;
    }

    // Heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const Tag = (`h${level}` as unknown) as keyof React.JSX.IntrinsicElements;
      blocks.push(
        <Tag key={nextKey()} style={H_STYLES[level]}>
          {renderInline(h[2])}
        </Tag>,
      );
      i += 1;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      blocks.push(<hr key={nextKey()} style={{ border: "none", borderTop: "1px solid #ECEDF3", margin: "24px 0" }} />);
      i += 1;
      continue;
    }

    // Blockquote (consecutive > lines)
    if (line.trim().startsWith(">")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        buf.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      blocks.push(
        <blockquote
          key={nextKey()}
          style={{
            borderLeft: `4px solid ${BRAND}`,
            background: "#FAFAFE",
            margin: "16px 0",
            padding: "10px 18px",
            color: V.textSub,
            borderRadius: "0 10px 10px 0",
          }}
        >
          {renderInline(buf.join(" "))}
        </blockquote>,
      );
      continue;
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i += 1;
      }
      blocks.push(
        <ul key={nextKey()} style={{ margin: "12px 0", paddingLeft: 24, lineHeight: 1.7 }}>
          {items.map((it, idx) => (
            <li key={idx} style={{ marginBottom: 4 }}>
              {renderInline(it)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push(
        <ol key={nextKey()} style={{ margin: "12px 0", paddingLeft: 24, lineHeight: 1.7 }}>
          {items.map((it, idx) => (
            <li key={idx} style={{ marginBottom: 4 }}>
              {renderInline(it)}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    // Paragraph: gather consecutive non-blank, non-special lines.
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].trim().startsWith("```") &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !lines[i].trim().startsWith(">") &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim())
    ) {
      buf.push(lines[i]);
      i += 1;
    }
    blocks.push(
      <p key={nextKey()} style={{ margin: "0 0 16px", lineHeight: 1.75, fontSize: 16.5, color: V.text }}>
        {renderInline(buf.join(" "))}
      </p>,
    );
  }

  return <div>{blocks}</div>;
}
