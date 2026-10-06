"use client";

import { BugOutlined, InboxOutlined } from "@ant-design/icons";
import { App, Button, Input, Modal, Typography, Upload } from "antd";
import type { UploadFile, UploadProps } from "antd";
import Link from "next/link";
import { useEffect, useState, type ClipboardEvent } from "react";
import type { UploadRef } from "@larkwave/shared";
import { useI18n } from "@larkwave/ui";
import { api } from "@/lib/api";
import { getRecentLogs, installErrorCapture } from "@/lib/errorLog";

const { Paragraph, Text } = Typography;

/** Floating "report a bug / error" button, present on every signed-in page. */
export default function FeedbackButton({ variant = "fab" }: { variant?: "fab" | "header" } = {}) {
  const { t } = useI18n();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [pageUrl, setPageUrl] = useState("");

  useEffect(() => {
    installErrorCapture();
  }, []);

  // Upload each picked file straight to /uploads; keep the returned ref as the
  // file's `response` so we can collect attachment ids on submit.
  const customRequest: UploadProps["customRequest"] = async ({ file, onSuccess, onError }) => {
    try {
      const ref = await api.uploadFile(file as File, "feedback");
      onSuccess?.(ref);
    } catch (e) {
      message.error((e as Error).message);
      onError?.(e as Error);
    }
  };

  // Upload one File (used by paste) + reflect its state in the file list.
  const uploadOne = async (file: File) => {
    const uid = `paste-${file.size}-${Math.random().toString(36).slice(2)}`;
    setFileList((prev) => [...prev, { uid, name: file.name, status: "uploading" } as UploadFile]);
    try {
      const ref = await api.uploadFile(file, "feedback");
      setFileList((prev) =>
        prev.map((f) => (f.uid === uid ? { ...f, status: "done", response: ref } : f)),
      );
    } catch (e) {
      setFileList((prev) => prev.map((f) => (f.uid === uid ? { ...f, status: "error" } : f)));
      message.error((e as Error).message);
    }
  };

  // Paste a screenshot (Ctrl/Cmd+V) straight into the report.
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.type.startsWith("image/")) {
        const blob = it.getAsFile();
        if (!blob) continue;
        e.preventDefault();
        const named = new File([blob], blob.name || "screenshot.png", {
          type: blob.type || "image/png",
        });
        void uploadOne(named);
        message.success(t("wcomp.fbPastedScreenshot", "Đã dán ảnh chụp màn hình."));
      }
    }
  };

  const openModal = () => {
    setPageUrl(typeof window !== "undefined" ? window.location.href : "");
    setOpen(true);
  };

  const reset = () => {
    setText("");
    setFileList([]);
  };

  const submit = async () => {
    if (!text.trim()) {
      message.warning(t("wcomp.fbDescribePlease", "Mô tả lỗi giúp mình nhé."));
      return;
    }
    if (fileList.some((f) => f.status === "uploading")) {
      message.warning(t("wcomp.fbWaitUpload", "Đợi tệp tải lên xong nhé."));
      return;
    }
    const attachmentIds = fileList
      .map((f) => (f.response as UploadRef | undefined)?.id)
      .filter((x): x is string => !!x);
    setSending(true);
    try {
      await api.submitFeedback({
        message: text.trim(),
        url: typeof window !== "undefined" ? window.location.href : undefined,
        context: {
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
          logs: getRecentLogs(),
        },
        ...(attachmentIds.length ? { attachmentIds } : {}),
      });
      message.success(t("wcomp.fbSentThanks", "Đã gửi báo lỗi. Cảm ơn bạn!"));
      reset();
      setOpen(false);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {variant === "header" ? (
        // Inline header button (next to "Trò chuyện mới") — used on the remote-chat pages where a floating
        // FAB would cover the composer's Send button. The modal is centered, so no positioning issues.
        <Button
          shape="circle"
          icon={<BugOutlined style={{ color: "#fff", fontSize: 16 }} />}
          onClick={openModal}
          aria-label={t("wcomp.fbReportBug", "Báo lỗi")}
          title={t("wcomp.fbReportBugFull", "Báo lỗi / góp ý")}
          style={{ flex: "0 0 auto", width: 36, height: 36, minWidth: 36, background: "#F5365C", borderColor: "#F5365C" }}
        />
      ) : (
        <Button
          shape="circle"
          icon={<BugOutlined style={{ color: "#fff", fontSize: 18 }} />}
          onClick={openModal}
          aria-label={t("wcomp.fbReportBug", "Báo lỗi")}
          title={t("wcomp.fbReportBugFull", "Báo lỗi / góp ý")}
          style={{
            position: "fixed",
            right: 20,
            bottom: "calc(20px + env(safe-area-inset-bottom))",
            zIndex: 900,
            width: 44,
            height: 44,
            boxShadow: "0 6px 20px rgba(245,54,92,0.4)",
            background: "#F5365C",
            borderColor: "#F5365C",
          }}
        />
      )}
      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => void submit()}
        confirmLoading={sending}
        title={t("wcomp.fbReportBugFull", "Báo lỗi / góp ý")}
        okText={t("wcomp.fbSend", "Gửi")}
        cancelText={t("wcomp.fbClose", "Đóng")}
      >
        <Paragraph type="secondary" style={{ fontSize: 13 }}>
          {t(
            "wcomp.fbIntro",
            "Mô tả lỗi bạn gặp. Hệ thống tự đính kèm trang hiện tại + log gần đây để admin dễ kiểm tra và sửa. Báo lỗi hợp lệ được",
          )}{" "}
          <Text strong>{t("wcomp.fbScoredRewarded", "tính điểm & thưởng")}</Text>{" "}
          {t("wcomp.fbSeeAt", "— xem ở")}{" "}
          <Link href="/reports" onClick={() => setOpen(false)}>
            {t("wcomp.fbMyReports", "Báo lỗi của tôi")}
          </Link>
          .
        </Paragraph>
        {pageUrl && (
          <div
            style={{
              fontSize: 12,
              color: "#6B7280",
              background: "#F4F5FB",
              border: "1px solid #ECEDF3",
              borderRadius: 8,
              padding: "6px 10px",
              marginBottom: 10,
              wordBreak: "break-all",
            }}
          >
            📍 {t("wcomp.fbReportingOnPage", "Đang báo lỗi ở trang:")} <b>{pageUrl}</b>
          </div>
        )}
        <Input.TextArea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={onPaste}
          autoSize={{ minRows: 4, maxRows: 8 }}
          maxLength={2000}
          placeholder={t(
            "wcomp.fbPlaceholder",
            "Mình gặp lỗi khi… (mẹo: chụp màn hình rồi Ctrl/Cmd+V dán ảnh vào đây)",
          )}
        />
        <Upload.Dragger
          multiple
          fileList={fileList}
          customRequest={customRequest}
          onChange={({ fileList: fl }) => setFileList(fl)}
          listType="picture"
          accept="image/*,.pdf,.txt,.md,.json,.csv,.log,.docx,.xlsx,.pptx"
          style={{ marginTop: 12 }}
        >
          <p style={{ margin: 0 }}>
            <InboxOutlined style={{ fontSize: 22, color: "#6C5CE7" }} />
          </p>
          <p style={{ margin: "6px 0 0", fontSize: 13 }}>
            {t("wcomp.fbDropHint", "Kéo-thả hoặc bấm để đính kèm ảnh chụp màn hình / tệp")}
          </p>
          <p style={{ margin: 0, fontSize: 12, color: "#9AA3B5" }}>
            {t("wcomp.fbFileTypes", "Ảnh, PDF, văn bản, log… (tối đa 8 tệp)")}
          </p>
        </Upload.Dragger>
      </Modal>
    </>
  );
}
