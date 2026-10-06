"use client";

/**
 * Renders a saved Artifact by kind. HTML/SVG run in a sandboxed iframe (scripts allowed, but NO
 * same-origin — isolated), mirroring how the assistant renders artifacts. Markdown/code show as
 * preformatted text.
 */
export function ArtifactView({
  kind,
  content,
  height = 480,
}: {
  kind: string;
  content: string;
  height?: number | string;
}) {
  if (kind === "html" || kind === "svg") {
    return (
      <iframe
        title="artifact"
        srcDoc={content}
        sandbox="allow-scripts allow-forms allow-popups allow-modals"
        style={{ width: "100%", height, border: "1px solid rgba(0,0,0,.08)", borderRadius: 10, background: "#fff" }}
      />
    );
  }
  return (
    <pre
      style={{
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        margin: 0,
        fontSize: 13,
        lineHeight: 1.55,
        fontFamily: kind === "code" ? "ui-monospace, SFMono-Regular, Menlo, monospace" : "inherit",
        maxHeight: typeof height === "number" ? height : undefined,
        overflow: "auto",
      }}
    >
      {content}
    </pre>
  );
}
