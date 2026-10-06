"use client";

import { LoginOutlined } from "@ant-design/icons";
import { App, Button, Modal, Spin, Typography } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@larkwave/ui";
import { api, streamLarkQr } from "@/lib/api";

const { Text } = Typography;

/**
 * Phone → desktop Lark re-login. Triggers the signed-in desktop to open its Lark
 * login window; the QR + outcome stream back over the message SSE. Scanning the QR
 * with the Lark app logs the desktop in and refreshes its CMS sync sessions.
 * Self-contained: the trigger button + the QR modal + all the wiring.
 */
export default function LarkRelogin({
  label,
  block = false,
}: {
  label?: string;
  block?: boolean;
}) {
  const { t } = useI18n();
  const { message } = App.useApp();
  const shownLabel = label ?? t("wcomp.larkReloginBtn", "Đăng nhập lại Lark (CMS) trên máy");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const reqRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gotRef = useRef(false); // got a QR image or a terminal event → stop the no-response watchdog
  const [qr, setQr] = useState<{ status: string; image?: string; message?: string } | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    const stop = streamLarkQr((ev) => {
      if (reqRef.current && ev.requestId !== reqRef.current) return;
      setQr({ status: ev.status, image: ev.image, message: ev.message });
      if (ev.status !== "qr") {
        setBusy(false);
        gotRef.current = true;
        clearTimer();
      } else if (ev.image) {
        // QR is on screen — the user now scans at their own pace, so stop the watchdog.
        gotRef.current = true;
        clearTimer();
      }
    });
    return () => {
      stop();
      clearTimer();
    };
  }, []);

  const start = useCallback(async () => {
    setBusy(true);
    setQr({ status: "qr" });
    setOpen(true);
    gotRef.current = false;
    clearTimer();
    // No-response watchdog: if the desktop never sends a QR (offline / not signed in /
    // remote-control off), don't spin the "Đang lấy QR…" spinner forever — fail clearly.
    timerRef.current = setTimeout(() => {
      if (!gotRef.current) {
        setBusy(false);
        setQr({
          status: "timeout",
          message: t(
            "wcomp.larkNoResponse",
            'Máy tính không phản hồi — kiểm tra máy đã bật, đã đăng nhập và bật "Điều khiển từ xa", rồi thử lại.',
          ),
        });
      }
    }, 30000);
    try {
      const { requestId } = await api.startLarkLogin();
      reqRef.current = requestId;
    } catch (e) {
      clearTimer();
      setBusy(false);
      setQr({ status: "failed", message: (e as Error).message });
      message.error((e as Error).message);
    }
  }, [message, t]);

  return (
    <>
      <Button icon={<LoginOutlined />} onClick={() => void start()} loading={busy} block={block}>
        {shownLabel}
      </Button>
      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        title={t("wcomp.larkModalTitle", "Đăng nhập lại Lark trên máy tính")}
        width={380}
      >
        <div style={{ textAlign: "center" }}>
          {qr?.status === "success" ? (
            <div style={{ padding: 20 }}>
              <div style={{ fontSize: 40 }}>✅</div>
              <Text strong>{t("wcomp.larkLoggedIn", "Đã đăng nhập — phiên đồng bộ được làm mới.")}</Text>
            </div>
          ) : qr?.status === "failed" || qr?.status === "timeout" ? (
            <div style={{ padding: 20 }}>
              <div style={{ fontSize: 40 }}>⚠️</div>
              <Text>{qr?.message || t("wcomp.larkLoginFailed", "Không đăng nhập được. Thử lại.")}</Text>
            </div>
          ) : (
            <>
              <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 10 }}>
                {t("wcomp.larkQrHintPre", "Máy tính đang mở màn đăng nhập Lark. Dùng")}{" "}
                <b>{t("wcomp.larkAppName", "app Lark")}</b>{" "}
                {t(
                  "wcomp.larkQrHintPost",
                  "quét QR bên dưới (hoặc mở trên một thiết bị khác). Xong là máy tự nhận + đồng bộ lại.",
                )}
              </Text>
              {qr?.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qr.image}
                  alt="Lark login QR"
                  style={{ width: "100%", maxWidth: 320, border: "1px solid #eee", borderRadius: 8 }}
                />
              ) : (
                <div style={{ padding: 40 }}>
                  <Spin />
                  <div style={{ marginTop: 8, fontSize: 12, color: "#888" }}>{t("wcomp.larkFetchingQr", "Đang lấy QR từ máy tính…")}</div>
                </div>
              )}
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
