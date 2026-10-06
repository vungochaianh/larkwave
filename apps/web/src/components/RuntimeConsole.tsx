"use client";

import {
  ApiOutlined,
  ClearOutlined,
  CodeOutlined,
  ExportOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { Badge, Button, Empty, Input, Segmented, Space, Tag, Tooltip } from "antd";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@larkwave/ui";

type ConsoleLevel = "log" | "info" | "warn" | "error" | "debug";

interface ConsoleEntry {
  kind: "console";
  seq: number;
  t: number;
  level: ConsoleLevel;
  text: string;
}
interface NetEntry {
  kind: "net";
  seq: number;
  t: number;
  method: string;
  url: string;
  status: number;
  ok: boolean;
  ms: number;
  error?: string;
}

/** Raw entry shape posted by the injected probe (scaffold.ts → TW_LOGS_JS). */
interface RawEntry {
  type?: "console" | "net";
  seq?: number;
  t?: number;
  level?: ConsoleLevel;
  text?: string;
  method?: string;
  url?: string;
  status?: number;
  ok?: boolean;
  ms?: number;
  error?: string;
}

const CONSOLE_CAP = 1000;
const NET_CAP = 500;

const LEVEL_COLOR: Record<ConsoleLevel, string> = {
  log: "#D6D9E0",
  info: "#7DD3FC",
  debug: "#A5B4FC",
  warn: "#FBBF24",
  error: "#F87171",
};

/** Pick a status-pill colour from an HTTP status (0 = network failure). */
function statusColor(status: number): string {
  if (status === 0 || status >= 500) return "error";
  if (status >= 400) return "warning";
  if (status >= 300) return "blue";
  if (status >= 200) return "success";
  return "default";
}

/**
 * Devtools-lite for a deployed app: runs the app in an iframe and shows its live
 * Console + Network "ngay tại màn". Reads entries from the in-app probe injected
 * at build time (scaffold.ts), over the same cross-origin postMessage bridge the
 * inspector uses (child posts `source:'tw-logs'`, parent posts `source:'tw-parent'`).
 */
export default function RuntimeConsole({ url }: { url: string | null }) {
  const { t } = useI18n();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const seenRef = useRef<Set<number>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);

  const [panel, setPanel] = useState<"console" | "network">("console");
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);
  const [netEntries, setNetEntries] = useState<NetEntry[]>([]);
  const [level, setLevel] = useState<"all" | "warn" | "error">("all");
  const [query, setQuery] = useState("");
  const [ready, setReady] = useState(false);
  const [reload, setReload] = useState(0);

  const resetCapture = useCallback(() => {
    seenRef.current = new Set();
    setConsoleEntries([]);
    setNetEntries([]);
    setReady(false);
  }, []);

  const ingest = useCallback((raw: RawEntry[]) => {
    const fresh = raw.filter((e) => typeof e.seq === "number" && !seenRef.current.has(e.seq));
    if (fresh.length === 0) return;
    for (const e of fresh) seenRef.current.add(e.seq as number);
    const cons: ConsoleEntry[] = [];
    const nets: NetEntry[] = [];
    for (const e of fresh) {
      if (e.type === "console") {
        cons.push({
          kind: "console",
          seq: e.seq as number,
          t: e.t ?? Date.now(),
          level: (e.level as ConsoleLevel) ?? "log",
          text: e.text ?? "",
        });
      } else if (e.type === "net") {
        nets.push({
          kind: "net",
          seq: e.seq as number,
          t: e.t ?? Date.now(),
          method: e.method ?? "GET",
          url: e.url ?? "",
          status: e.status ?? 0,
          ok: !!e.ok,
          ms: e.ms ?? 0,
          error: e.error,
        });
      }
    }
    if (cons.length) setConsoleEntries((prev) => [...prev, ...cons].slice(-CONSOLE_CAP));
    if (nets.length) setNetEntries((prev) => [...prev, ...nets].slice(-NET_CAP));
  }, []);

  const flush = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { source: "tw-parent", type: "tw-logs-flush" },
      "*",
    );
  }, []);

  // Listen for the probe's handshake + entries (cross-origin postMessage).
  useEffect(() => {
    let expectedOrigin: string | null = null;
    try {
      expectedOrigin = url ? new URL(url).origin : null;
    } catch {
      expectedOrigin = null;
    }
    const onMessage = (e: MessageEvent) => {
      // Only trust messages from the running app's own origin.
      if (expectedOrigin && e.origin !== expectedOrigin) return;
      const d = e.data as
        | { source?: string; kind?: string; entry?: RawEntry; entries?: RawEntry[] }
        | null;
      if (!d || d.source !== "tw-logs") return;
      if (d.kind === "ready") {
        setReady(true);
        flush();
      } else if (d.kind === "entry" && d.entry) {
        ingest([d.entry]);
      } else if (d.kind === "backlog" && Array.isArray(d.entries)) {
        ingest(d.entries);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [ingest, flush, url]);

  // New url / manual reload → fresh capture session.
  useEffect(() => {
    resetCapture();
  }, [url, reload, resetCapture]);

  // Older apps (built before this feature) never send a handshake — hint to rebuild.
  const [showLegacyHint, setShowLegacyHint] = useState(false);
  useEffect(() => {
    setShowLegacyHint(false);
    if (!url) return;
    const t = setTimeout(() => setShowLegacyHint(!ready), 3000);
    return () => clearTimeout(t);
  }, [url, reload, ready]);

  // Keep the console pinned to the newest line.
  useEffect(() => {
    if (panel === "console") {
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [consoleEntries, panel]);

  const filteredConsole = useMemo(() => {
    const q = query.trim().toLowerCase();
    return consoleEntries.filter((e) => {
      if (level === "error" && e.level !== "error") return false;
      if (level === "warn" && e.level !== "warn" && e.level !== "error") return false;
      if (q && !e.text.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [consoleEntries, level, query]);

  const filteredNet = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return netEntries;
    return netEntries.filter(
      (e) => e.url.toLowerCase().includes(q) || e.method.toLowerCase().includes(q),
    );
  }, [netEntries, query]);

  const errorCount = useMemo(
    () => consoleEntries.filter((e) => e.level === "error").length,
    [consoleEntries],
  );

  const clear = () => {
    seenRef.current = new Set();
    setConsoleEntries([]);
    setNetEntries([]);
    iframeRef.current?.contentWindow?.postMessage(
      { source: "tw-parent", type: "tw-logs-clear" },
      "*",
    );
  };

  if (!url) {
    return (
      <div
        style={{
          minHeight: "60vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid #ECEDF3",
          borderRadius: 12,
          background: "#FFFFFF",
        }}
      >
        <Empty description={t("wcomp.rcNoDeploy", "Chưa có bản deploy — tạo / sửa app để xem console & network")} />
      </div>
    );
  }

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 10,
          justifyContent: "space-between",
        }}
      >
        <Segmented
          value={panel}
          onChange={(v) => setPanel(v as "console" | "network")}
          options={[
            {
              label: (
                <Badge count={errorCount} size="small" offset={[8, -2]}>
                  <span>
                    <CodeOutlined /> Console
                  </span>
                </Badge>
              ),
              value: "console",
            },
            {
              label: (
                <Badge count={netEntries.length} size="small" overflowCount={99} offset={[8, -2]}>
                  <span>
                    <ApiOutlined /> Network
                  </span>
                </Badge>
              ),
              value: "network",
            },
          ]}
        />
        <Space wrap size={8}>
          {panel === "console" && (
            <Segmented
              size="small"
              value={level}
              onChange={(v) => setLevel(v as "all" | "warn" | "error")}
              options={[
                { label: t("wcomp.rcAll", "Tất cả"), value: "all" },
                { label: t("wcomp.rcWarn", "Cảnh báo"), value: "warn" },
                { label: t("wcomp.rcError", "Lỗi"), value: "error" },
              ]}
            />
          )}
          <Input.Search
            allowClear
            size="small"
            placeholder={panel === "console" ? t("wcomp.rcFilterLog", "Lọc log…") : t("wcomp.rcFilterNet", "Lọc theo URL / method…")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: 200 }}
          />
          <Tooltip title={t("wcomp.rcClearLog", "Xoá log đang hiển thị")}>
            <Button size="small" icon={<ClearOutlined />} onClick={clear} />
          </Tooltip>
          <Tooltip title={t("wcomp.rcReloadApp", "Tải lại app (bắt log từ đầu)")}>
            <Button size="small" icon={<ReloadOutlined />} onClick={() => setReload((n) => n + 1)} />
          </Tooltip>
          <Tooltip title={t("wcomp.rcOpenNewTab", "Mở app trong tab mới")}>
            <Button size="small" icon={<ExportOutlined />} href={url} target="_blank" rel="noreferrer" />
          </Tooltip>
        </Space>
      </div>

      {showLegacyHint && (
        <div
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid rgba(245,158,11,0.30)",
            background: "rgba(245,158,11,0.08)",
            color: "#92660B",
            fontSize: 12.5,
          }}
        >
          {t(
            "wcomp.rcLegacyHint",
            "App này được tạo trước khi có tính năng Logs — hãy sửa / cập nhật app một lần để bật ghi log console & network.",
          )}
        </div>
      )}

      {/* Running app (interact here to generate logs) */}
      <div
        style={{
          border: "1px solid #E5E7F0",
          borderRadius: 12,
          overflow: "hidden",
          background: "#fff",
        }}
      >
        <iframe
          ref={iframeRef}
          key={`${url}#${reload}`}
          src={url}
          title={t("wcomp.rcRunningApp", "App đang chạy")}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
          onLoad={() => setTimeout(flush, 200)}
          style={{ width: "100%", height: "34vh", minHeight: 240, border: "none", display: "block" }}
        />
      </div>

      {/* Console / Network panel */}
      {panel === "console" ? (
        <div className="tw-log-console" ref={listRef} style={{ height: "36vh", minHeight: 240 }}>
          {filteredConsole.length === 0 ? (
            <EmptyDark
              text={
                consoleEntries.length === 0
                  ? t("wcomp.rcNoLogs", "Chưa có log nào — thao tác trong app phía trên để xem console.")
                  : t("wcomp.rcNoLogMatch", "Không có log khớp bộ lọc.")
              }
            />
          ) : (
            filteredConsole.map((e) => (
              <div className="tw-log-line" key={e.seq}>
                <span className="tw-log-ts">{dayjs(e.t).format("HH:mm:ss.SSS")}</span>
                <span
                  style={{
                    color: LEVEL_COLOR[e.level],
                    fontWeight: e.level === "error" || e.level === "warn" ? 600 : 400,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {e.level !== "log" ? `[${e.level}] ` : ""}
                  {e.text}
                </span>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="tw-log-console" style={{ height: "36vh", minHeight: 240 }}>
          {filteredNet.length === 0 ? (
            <EmptyDark
              text={
                netEntries.length === 0
                  ? t("wcomp.rcNoRequests", "Chưa có request nào — thao tác trong app phía trên để xem network.")
                  : t("wcomp.rcNoReqMatch", "Không có request khớp bộ lọc.")
              }
            />
          ) : (
            filteredNet.map((e) => (
              <div
                key={e.seq}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "3px 4px",
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                  fontSize: 12.5,
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <span className="tw-log-ts" style={{ minWidth: 92 }}>
                  {dayjs(e.t).format("HH:mm:ss.SSS")}
                </span>
                <Tag
                  bordered={false}
                  style={{ margin: 0, minWidth: 52, textAlign: "center" }}
                >
                  {e.method}
                </Tag>
                <Tag color={statusColor(e.status)} bordered={false} style={{ margin: 0, minWidth: 42, textAlign: "center" }}>
                  {e.status || "ERR"}
                </Tag>
                <span style={{ color: "#9AA3B5", minWidth: 56, textAlign: "right" }}>
                  {e.ms}ms
                </span>
                <span
                  title={e.error ? `${e.url} — ${e.error}` : e.url}
                  style={{
                    color: e.ok ? "#D6D9E0" : "#F87171",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                  }}
                >
                  {e.url}
                  {e.error ? ` — ${e.error}` : ""}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </Space>
  );
}

function EmptyDark({ text }: { text: string }) {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={<span style={{ color: "rgba(255,255,255,0.4)" }}>{text}</span>}
      />
    </div>
  );
}
