"use client";

import { FilePdfOutlined, FileTextOutlined } from "@ant-design/icons";
import { App, Button, Image, Modal, Space, Spin } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedbackAttachment, UploadContent } from "@larkwave/shared";
import { V } from "@larkwave/ui";

/**
 * Renders a report's attachments. Images auto-load as thumbnails (with preview);
 * PDFs open in a new tab; text files open in a modal. `fetcher` resolves the
 * stored content (user endpoint for own reports, admin endpoint in the CMS).
 */
export default function FeedbackAttachments({
  attachments,
  fetcher,
}: {
  attachments: FeedbackAttachment[];
  fetcher: (uploadId: string) => Promise<UploadContent>;
}) {
  const { message } = App.useApp();
  const [cache, setCache] = useState<Record<string, UploadContent>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [textView, setTextView] = useState<UploadContent | null>(null);
  const requested = useRef<Set<string>>(new Set());

  const load = useCallback(
    async (id: string): Promise<UploadContent | null> => {
      if (cache[id]) return cache[id];
      setBusyId(id);
      try {
        const c = await fetcher(id);
        setCache((m) => ({ ...m, [id]: c }));
        return c;
      } catch (e) {
        message.error((e as Error).message);
        return null;
      } finally {
        setBusyId(null);
      }
    },
    [cache, fetcher, message],
  );

  // Auto-load images so they show as thumbnails (capped small server-side).
  useEffect(() => {
    attachments
      .filter((a) => a.kind === "image" && !requested.current.has(a.id))
      .forEach((a) => {
        requested.current.add(a.id);
        void load(a.id);
      });
  }, [attachments, load]);

  if (!attachments?.length) return null;

  const openNonImage = async (a: FeedbackAttachment) => {
    const c = await load(a.id);
    if (!c) return;
    if (c.kind === "pdf") {
      const w = window.open();
      if (w) w.document.write(
        `<iframe src="data:application/pdf;base64,${c.data}" style="border:0;width:100%;height:100%"></iframe>`,
      );
    } else {
      setTextView(c);
    }
  };

  return (
    <Space wrap size={10} style={{ width: "100%" }}>
      <Image.PreviewGroup>
        {attachments.map((a) => {
          if (a.kind === "image") {
            const c = cache[a.id];
            return c ? (
              <Image
                key={a.id}
                src={`data:${c.mime};base64,${c.data}`}
                alt={a.name}
                width={84}
                height={84}
                style={{ objectFit: "cover", borderRadius: 8, border: "1px solid #ECEDF3" }}
              />
            ) : (
              <span
                key={a.id}
                style={{
                  width: 84,
                  height: 84,
                  borderRadius: 8,
                  border: "1px solid #ECEDF3",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Spin size="small" />
              </span>
            );
          }
          return (
            <Button
              key={a.id}
              size="small"
              loading={busyId === a.id}
              icon={a.kind === "pdf" ? <FilePdfOutlined /> : <FileTextOutlined />}
              onClick={() => void openNonImage(a)}
            >
              {a.name.length > 24 ? a.name.slice(0, 24) + "…" : a.name}
            </Button>
          );
        })}
      </Image.PreviewGroup>
      <Modal
        open={!!textView}
        onCancel={() => setTextView(null)}
        footer={null}
        title={textView?.name}
        width={720}
      >
        <pre
          style={{
            background: V.codeBg,
            color: V.codeText,
            border: `1px solid ${V.codeBorder}`,
            borderRadius: 8,
            padding: 12,
            fontSize: 12,
            maxHeight: "60vh",
            overflow: "auto",
            whiteSpace: "pre-wrap",
          }}
        >
          {textView?.data}
        </pre>
      </Modal>
    </Space>
  );
}
