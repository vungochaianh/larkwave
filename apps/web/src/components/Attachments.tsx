"use client";

import {
  CloseOutlined,
  DownloadOutlined,
  FileExcelOutlined,
  FilePdfOutlined,
  FilePptOutlined,
  FileTextOutlined,
  FileWordOutlined,
  PictureOutlined,
} from "@ant-design/icons";
import { Button, Modal, Spin, Typography } from "antd";
import { useEffect, useState } from "react";
import type { UploadContent, UploadRef } from "@larkwave/shared";
import { useI18n } from "@larkwave/ui";
import { api } from "@/lib/api";

const { Text } = Typography;

/** Pick a chip icon by upload kind, falling back to the filename extension. */
export function fileIcon(f: Pick<UploadRef, "kind" | "name">) {
  if (f.kind === "image") return <PictureOutlined />;
  if (f.kind === "pdf") return <FilePdfOutlined />;
  const n = f.name.toLowerCase();
  if (n.endsWith(".docx") || n.endsWith(".doc")) return <FileWordOutlined />;
  if (n.endsWith(".pptx") || n.endsWith(".ppt")) return <FilePptOutlined />;
  if (n.endsWith(".xlsx") || n.endsWith(".xls") || n.endsWith(".csv"))
    return <FileExcelOutlined />;
  return <FileTextOutlined />;
}

function fmtSize(n: number): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Read-only/editable row of attachment chips. Clicking a chip opens a preview
 * (image render, PDF embed, or the extracted/raw text). When `onRemove` is given
 * each chip also shows an × — that's the composer's editing mode; omit it in the
 * conversation thread, where attachments are a permanent record of the request.
 */
export default function AttachmentChips({
  items,
  size = "small",
  align = "start",
  onRemove,
}: {
  items: UploadRef[];
  size?: "small" | "middle";
  /** Horizontal alignment — "end" matches the right-aligned user bubble. */
  align?: "start" | "end";
  onRemove?: (id: string) => void;
}) {
  const { t } = useI18n();
  const [preview, setPreview] = useState<UploadRef | null>(null);
  if (!items.length) return null;

  const pad = size === "middle" ? "5px 10px" : "3px 8px";
  return (
    <>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          alignItems: "center",
          justifyContent: align === "end" ? "flex-end" : "flex-start",
        }}
      >
        {items.map((f) => (
          <span
            key={f.id}
            role="button"
            tabIndex={0}
            title={`${f.name} — ${t("wcomp.atClickToPreview", "bấm để xem trước")}`}
            onClick={() => setPreview(f)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setPreview(f);
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              maxWidth: 220,
              padding: pad,
              borderRadius: 999,
              background: "rgba(108,92,231,0.08)",
              border: "1px solid rgba(108,92,231,0.20)",
              fontSize: 12.5,
              color: "#5B4FC2",
              cursor: "pointer",
            }}
          >
            {fileIcon(f)}
            <span
              style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {f.name}
            </span>
            {f.size ? (
              <span style={{ color: "#9AA3B5", flexShrink: 0 }}>{fmtSize(f.size)}</span>
            ) : null}
            {onRemove && (
              <CloseOutlined
                style={{ fontSize: 10, cursor: "pointer", flexShrink: 0 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(f.id);
                }}
              />
            )}
          </span>
        ))}
      </div>
      <AttachmentPreview item={preview} onClose={() => setPreview(null)} />
    </>
  );
}

/** Lazy-loads + renders one attachment's content in a modal. */
function AttachmentPreview({
  item,
  onClose,
}: {
  item: UploadRef | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [content, setContent] = useState<UploadContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!item) {
      setContent(null);
      setFailed(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setFailed(false);
    api
      .getUpload(item.id)
      .then((c) => alive && setContent(c))
      .catch(() => alive && setFailed(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [item]);

  const dataUrl = content
    ? content.kind === "text"
      ? `data:${content.mime || "text/plain"};charset=utf-8,${encodeURIComponent(content.data)}`
      : `data:${content.mime};base64,${content.data}`
    : "";

  return (
    <Modal
      open={!!item}
      onCancel={onClose}
      footer={
        content ? (
          <Button icon={<DownloadOutlined />} href={dataUrl} download={content.name}>
            {t("wcomp.atDownload", "Tải xuống")}
          </Button>
        ) : null
      }
      width={content?.kind === "text" ? 760 : 900}
      title={
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          {item ? fileIcon(item) : null}
          <span
            style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {item?.name}
          </span>
        </span>
      }
      destroyOnClose
    >
      {loading ? (
        <div style={{ textAlign: "center", padding: "48px 0" }}>
          <Spin />
        </div>
      ) : failed || !content ? (
        <Text type="secondary">{t("wcomp.atLoadFailed", "Không tải được nội dung tệp.")}</Text>
      ) : content.kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={dataUrl}
          alt={content.name}
          style={{ maxWidth: "100%", maxHeight: "72vh", display: "block", margin: "0 auto" }}
        />
      ) : content.kind === "pdf" ? (
        <iframe
          src={dataUrl}
          title={content.name}
          style={{ width: "100%", height: "72vh", border: "none" }}
        />
      ) : (
        <pre
          style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            maxHeight: "72vh",
            overflow: "auto",
            margin: 0,
            padding: 14,
            borderRadius: 10,
            background: "#FBFBFE",
            border: "1px solid #ECEDF3",
            fontSize: 13,
            lineHeight: 1.55,
          }}
        >
          {content.data}
        </pre>
      )}
    </Modal>
  );
}
