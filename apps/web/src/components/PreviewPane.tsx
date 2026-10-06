"use client";

import {
  AimOutlined,
  DesktopOutlined,
  ExportOutlined,
  LockOutlined,
  MobileOutlined,
  ReloadOutlined,
  TabletOutlined,
} from "@ant-design/icons";
import { App, Button, Empty, Segmented, Space, Tooltip } from "antd";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@larkwave/ui";

type Device = "desktop" | "tablet" | "mobile";

const DEVICE_WIDTH: Record<Device, string> = {
  desktop: "100%",
  tablet: "820px",
  mobile: "390px",
};

/** One element the user clicked in the preview (reported by the injected inspector). */
export interface PickedElement {
  tag: string;
  text: string;
  id: string;
  selector: string;
  label: string;
}

export default function PreviewPane({
  url,
  /** Bumping this from the parent (e.g. after an iterate) forces a fresh reload. */
  reloadSignal = 0,
  /** Called when the user clicks an element in "select element" mode. */
  onPickElement,
}: {
  url: string | null;
  reloadSignal?: number;
  onPickElement?: (el: PickedElement) => void;
}) {
  const { t } = useI18n();
  const { message } = App.useApp();
  const [device, setDevice] = useState<Device>("desktop");
  const [localReload, setLocalReload] = useState(0);
  // Element picker: talks to the inspector script injected into generated apps.
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [picking, setPicking] = useState(false);
  const [inspectorReady, setInspectorReady] = useState(false);

  const sendInspect = (enabled: boolean) => {
    iframeRef.current?.contentWindow?.postMessage(
      { source: "tw-parent", type: "tw-inspect", enabled },
      "*",
    );
  };

  // Listen for the inspector's handshake + element picks (cross-origin postMessage).
  useEffect(() => {
    let expectedOrigin: string | null = null;
    try {
      expectedOrigin = url ? new URL(url).origin : null;
    } catch {
      expectedOrigin = null;
    }
    const onMessage = (e: MessageEvent) => {
      // Only trust messages from the previewed app's own origin.
      if (expectedOrigin && e.origin !== expectedOrigin) return;
      const d = e.data as
        | { source?: string; type?: string; enabled?: boolean; payload?: PickedElement }
        | null;
      if (!d || d.source !== "tw-inspector") return;
      if (d.type === "tw-ready") {
        setInspectorReady(true);
      } else if (d.type === "tw-mode") {
        setPicking(!!d.enabled);
      } else if (d.type === "tw-selected" && d.payload) {
        setPicking(false);
        onPickElement?.(d.payload);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onPickElement, url]);

  // Reset handshake whenever the iframe remounts (new url / reload).
  useEffect(() => {
    setInspectorReady(false);
    setPicking(false);
  }, [url, reloadSignal, localReload]);

  const togglePicking = () => {
    if (!picking && !inspectorReady) {
      message.info(
        t(
          "wcomp.ppPickerHint",
          "Tính năng “chọn phần tử” sẽ bật sau khi bạn sửa/cập nhật app một lần (app hiện tại được tạo trước khi có tính năng này).",
        ),
      );
      return;
    }
    const next = !picking;
    setPicking(next);
    sendInspect(next);
  };

  if (!url) {
    return (
      <div
        style={{
          minHeight: "62vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid #ECEDF3",
          borderRadius: 12,
          background: "#FFFFFF",
        }}
      >
        <Empty description={t("wcomp.ppNoDeploy", "Chưa có bản deploy — hãy tạo / sửa app để có preview")} />
      </div>
    );
  }

  const iframeKey = `${url}#${reloadSignal}#${localReload}`;
  const width = DEVICE_WIDTH[device];
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  })();

  return (
    <Space direction="vertical" size={14} style={{ width: "100%" }}>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 12,
          justifyContent: "space-between",
        }}
      >
        <Segmented<Device>
          value={device}
          onChange={(v) => setDevice(v)}
          options={[
            { label: "Desktop", value: "desktop", icon: <DesktopOutlined /> },
            { label: "Tablet", value: "tablet", icon: <TabletOutlined /> },
            { label: "Mobile", value: "mobile", icon: <MobileOutlined /> },
          ]}
        />
        <Space>
          {onPickElement && (
            <Tooltip title={t("wcomp.ppPickTip", "Bấm rồi click vào đúng phần tử trên trang (nút, ảnh, đoạn chữ…) để mô tả lỗi/thay đổi cho phần đó")}>
              <Button
                type={picking ? "primary" : "default"}
                icon={<AimOutlined />}
                onClick={togglePicking}
              >
                {picking ? t("wcomp.ppPicking", "Đang chọn… bấm để huỷ") : t("wcomp.ppPickElement", "Chọn phần tử")}
              </Button>
            </Tooltip>
          )}
          <Tooltip title={t("wcomp.ppReload", "Tải lại preview")}>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => setLocalReload((n) => n + 1)}
            />
          </Tooltip>
          <Tooltip title={t("wcomp.ppOpenNewTab", "Mở trong tab mới")}>
            <Button
              icon={<ExportOutlined />}
              href={url}
              target="_blank"
              rel="noreferrer"
            >
              {t("wcomp.ppNewTab", "Mở tab mới")}
            </Button>
          </Tooltip>
        </Space>
      </div>

      {/* Device mockup with browser chrome */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          background:
            "radial-gradient(900px 420px at 50% -10%, rgba(108,92,231,0.06), transparent 60%), #EEF0F7",
          border: "1px solid #ECEDF3",
          borderRadius: 16,
          padding: device === "desktop" ? 20 : 24,
          minHeight: "64vh",
          overflow: "auto",
        }}
      >
        <div
          style={{
            width,
            maxWidth: "100%",
            background: "#fff",
            borderRadius: 14,
            border: "1px solid #E5E7F0",
            boxShadow: "0 18px 50px rgba(17,24,39,0.14)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            alignSelf: "flex-start",
          }}
        >
          {/* Chrome bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "9px 14px",
              background: "#F7F8FC",
              borderBottom: "1px solid #ECEDF3",
            }}
          >
            <span className="tw-dots">
              <i style={{ background: "#FF5F57" }} />
              <i style={{ background: "#FEBC2E" }} />
              <i style={{ background: "#28C840" }} />
            </span>
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                gap: 7,
                background: "#fff",
                border: "1px solid #ECEDF3",
                borderRadius: 999,
                padding: "4px 12px",
                maxWidth: 460,
                margin: "0 auto",
                color: "#6B7280",
                fontSize: 12.5,
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
              }}
            >
              <LockOutlined style={{ fontSize: 11, color: "#16B98D" }} />
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {host}
              </span>
            </div>
            <Tooltip title={t("wcomp.ppOpenNewTab", "Mở trong tab mới")}>
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                aria-label={t("wcomp.ppOpenNewTab", "Mở trong tab mới")}
                style={{ color: "#9AA3B5" }}
              >
                <ExportOutlined />
              </a>
            </Tooltip>
          </div>

          {/* Iframe */}
          <iframe
            ref={iframeRef}
            key={iframeKey}
            src={url}
            title="Live preview"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            style={{
              width: "100%",
              height: device === "desktop" ? "62vh" : "70vh",
              minHeight: 420,
              border: "none",
              background: "#ffffff",
              display: "block",
              outline: picking ? "2px solid #6C5CE7" : "none",
              outlineOffset: -2,
            }}
          />
        </div>
      </div>
    </Space>
  );
}
