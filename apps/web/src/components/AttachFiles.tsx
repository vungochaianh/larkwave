"use client";

import { PaperClipOutlined } from "@ant-design/icons";
import { App, Button, Tooltip } from "antd";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import type { UploadRef } from "@larkwave/shared";
import { useI18n } from "@larkwave/ui";
import { api } from "@/lib/api";
import AttachmentChips from "@/components/Attachments";

const MAX_FILES = 8;
const ACCEPT =
  "image/png,image/jpeg,image/webp,image/gif," +
  "application/pdf,.pdf," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx," +
  "application/vnd.openxmlformats-officedocument.presentationml.presentation,.pptx," +
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx," +
  ".txt,.md,.markdown,.csv,.json,.yaml,.yml,.toml,.html,.htm,.css,.scss,.less," +
  ".js,.jsx,.ts,.tsx,.vue,.svelte,.py,.rb,.go,.rs,.java,.kt,.php,.c,.cpp,.h,.cs,.sql,.sh,.env,.ini,.xml,.prisma";

/** Imperative handle so a host (e.g. a prompt box) can push files in on paste. */
export interface AttachFilesHandle {
  addFiles: (files: File[] | FileList) => void | Promise<void>;
}

/**
 * Attach files (image mockups, PDFs, Word/PowerPoint/Excel, text/code) to a build
 * conversation. Uploads each picked file immediately and exposes the resulting
 * refs via `value`/`onChange`; the parent sends `value.map(v => v.id)` as
 * `attachmentIds` on createBuild. Hosts can also call `ref.addFiles(...)` to push
 * pasted files/large text in (see the prompt composers). Chips are previewable.
 */
const AttachFiles = forwardRef<
  AttachFilesHandle,
  {
    value: UploadRef[];
    onChange: (refs: UploadRef[]) => void;
    disabled?: boolean;
    size?: "small" | "middle";
  }
>(function AttachFiles({ value, onChange, disabled, size = "small" }, ref) {
  const { t } = useI18n();
  const { message } = App.useApp();
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = async (filesIn: File[] | FileList | null) => {
    const files = filesIn ? Array.from(filesIn) : [];
    if (!files.length) return;
    const room = MAX_FILES - value.length;
    if (room <= 0) {
      message.warning(`${t("wcomp.afMaxPre", "Tối đa")} ${MAX_FILES} ${t("wcomp.afFilesWord", "tệp")}.`);
      return;
    }
    const list = files.slice(0, room);
    setUploading(true);
    try {
      const uploaded: UploadRef[] = [];
      for (const f of list) {
        try {
          uploaded.push(await api.uploadFile(f, "build"));
        } catch (e) {
          message.error(`${f.name}: ${(e as Error).message}`);
        }
      }
      if (uploaded.length) onChange([...value, ...uploaded]);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  useImperativeHandle(ref, () => ({ addFiles }), [value, onChange]);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        aria-label={t("wcomp.afAttachFile", "Đính kèm tệp")}
        style={{ display: "none" }}
        onChange={(e) => void addFiles(e.target.files)}
      />
      <Tooltip title={t("wcomp.afAttachTip", "Đính kèm ảnh mockup, PDF, Word/PowerPoint/Excel, file code/spec… để AI dùng làm tham khảo")}>
        <Button
          size={size}
          icon={<PaperClipOutlined />}
          loading={uploading}
          disabled={disabled || value.length >= MAX_FILES}
          onClick={() => inputRef.current?.click()}
        >
          {t("wcomp.afAttach", "Đính kèm")}
        </Button>
      </Tooltip>
      <AttachmentChips
        items={value}
        size={size}
        onRemove={(id) => onChange(value.filter((v) => v.id !== id))}
      />
    </div>
  );
});

export default AttachFiles;
