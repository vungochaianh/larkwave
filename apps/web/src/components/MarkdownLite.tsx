import type { ReactNode } from "react";

// Minimal markdown for the help assistant: **bold**, `inline code`, and "- "/"* "
// bullet lines + line breaks. Deliberately tiny — avoids a full markdown dependency
// while making streamed replies look clean (bold headings, step bullets, emoji).

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) {
      out.push(<strong key={key++}>{tok.slice(2, -2)}</strong>);
    } else {
      out.push(
        <code
          key={key++}
          style={{
            background: "rgba(108,92,231,0.12)",
            padding: "0 4px",
            borderRadius: 4,
            fontSize: "0.92em",
            fontFamily: "ui-monospace, Menlo, monospace",
          }}
        >
          {tok.slice(1, -1)}
        </code>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function MarkdownLite({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, i) => {
        const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
        if (bullet) {
          return (
            <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
              <span style={{ opacity: 0.6, lineHeight: 1.5 }}>•</span>
              <span style={{ flex: 1 }}>{inline(bullet[1])}</span>
            </div>
          );
        }
        return <div key={i}>{line ? inline(line) : <span>&nbsp;</span>}</div>;
      })}
    </>
  );
}
