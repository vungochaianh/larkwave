"use client";

import {
  ApiOutlined,
  CodeOutlined,
  ConsoleSqlOutlined,
  LinkOutlined,
} from "@ant-design/icons";
import { App, Button, Empty, Skeleton, Space, Tag, Tooltip, Typography } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { GeneratedFile } from "@larkwave/shared";
import { useI18n } from "@larkwave/ui";
import { api } from "@/lib/api";
import { CARD_SHADOW } from "@/lib/theme";
import { V } from "@larkwave/ui";

const { Text } = Typography;

const METHOD_COLOR: Record<string, string> = {
  GET: "green",
  POST: "blue",
  PUT: "orange",
  DELETE: "red",
  PATCH: "purple",
  ALL: "default",
};

/** HTTP methods a Pages Function file handles (from its onRequest* exports). */
function methodsOf(content: string): string[] {
  const set = new Set<string>();
  const re = /onRequest(Get|Post|Put|Delete|Patch)?\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) set.add((m[1] || "ALL").toUpperCase());
  return [...set];
}

/** functions/api/foo/[id].js → /api/foo/:id  (dynamic [x] → :x). */
function apiPath(path: string): string {
  return (
    "/" +
    path
      .replace(/^\.?\//, "")
      .replace(/^functions\//, "")
      .replace(/\.js$/, "")
      .replace(/\[([^\]]+)\]/g, ":$1")
  );
}

/**
 * "API" tab: the app's backend surface — every Cloudflare Pages Function endpoint
 * (method + path + source) plus the D1 schema, read straight from the generated
 * source. Lets the owner see exactly what API the app exposes and open it live.
 */
export default function ApiBrowser({ appId, appUrl }: { appId: string; appUrl: string | null }) {
  const { t } = useI18n();
  const { message } = App.useApp();
  const [files, setFiles] = useState<GeneratedFile[] | null>(null);
  const [active, setActive] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const builds = await api.appBuilds(appId, { page: 1, pageSize: 20 });
      const succeeded = builds.items.find((b) => b.status === "succeeded");
      if (!succeeded) {
        setFiles([]);
        return;
      }
      const detail = await api.getBuild(succeeded.id);
      const backend = (detail.files ?? []).filter((f) => {
        const p = f.path.replace(/^\.?\//, "");
        return p.startsWith("functions/") || p === "schema.sql";
      });
      setFiles(backend);
      setActive((cur) => cur ?? backend.find((f) => f.path.includes("functions/"))?.path ?? backend[0]?.path ?? null);
    } catch (e) {
      setFiles([]);
      message.error((e as Error).message);
    }
  }, [appId, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const endpoints = useMemo(
    () => (files ?? []).filter((f) => f.path.replace(/^\.?\//, "").startsWith("functions/")),
    [files],
  );
  const schema = useMemo(
    () => (files ?? []).find((f) => f.path.replace(/^\.?\//, "") === "schema.sql"),
    [files],
  );
  const activeFile = (files ?? []).find((f) => f.path === active);

  if (files === null) return <Skeleton active style={{ padding: 20 }} paragraph={{ rows: 6 }} />;
  if (endpoints.length === 0 && !schema) {
    return (
      <Empty
        style={{ padding: "56px 0" }}
        description={t("wcomp.abNoBackend", "App này chưa có API backend (functions/api/*). Chỉ app full-stack mới có.")}
      />
    );
  }

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
      {/* Endpoint list */}
      <div
        style={{
          width: 250,
          minWidth: 250,
          borderRight: "1px solid #F1F2F7",
          background: "#FBFBFE",
          overflowY: "auto",
          padding: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 6px 8px", color: "#6B7280" }}>
          <ApiOutlined style={{ color: "#6C5CE7" }} />
          <Text strong style={{ fontSize: 12.5 }}>
            {t("wcomp.abEndpoints", "Endpoint API")}
          </Text>
        </div>
        {endpoints.map((f) => {
          const on = f.path === active;
          const path = apiPath(f.path);
          return (
            <button
              key={f.path}
              type="button"
              onClick={() => setActive(f.path)}
              style={{
                width: "100%",
                textAlign: "left",
                cursor: "pointer",
                border: "none",
                background: on ? "rgba(108,92,231,0.10)" : "transparent",
                borderRadius: 9,
                padding: "8px 9px",
                marginBottom: 2,
              }}
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 3 }}>
                {methodsOf(f.content).map((mth) => (
                  <Tag key={mth} bordered={false} color={METHOD_COLOR[mth] ?? "default"} style={{ margin: 0, fontSize: 10, lineHeight: "16px" }}>
                    {mth}
                  </Tag>
                ))}
              </div>
              <Text
                style={{
                  fontSize: 12.5,
                  fontFamily: "ui-monospace, Menlo, monospace",
                  color: on ? "#5B4FC2" : "#3A4256",
                  fontWeight: on ? 600 : 500,
                }}
              >
                {path}
              </Text>
            </button>
          );
        })}
        {schema && (
          <>
            <div style={{ borderTop: "1px solid #ECEDF3", margin: "8px 4px" }} />
            <button
              type="button"
              onClick={() => setActive(schema.path)}
              style={{
                width: "100%",
                textAlign: "left",
                cursor: "pointer",
                border: "none",
                background: active === schema.path ? "rgba(108,92,231,0.10)" : "transparent",
                borderRadius: 9,
                padding: "8px 9px",
                display: "flex",
                alignItems: "center",
                gap: 7,
              }}
            >
              <ConsoleSqlOutlined style={{ color: "#16B98D" }} />
              <Text style={{ fontSize: 12.5, fontFamily: "ui-monospace, Menlo, monospace", fontWeight: active === schema.path ? 600 : 500 }}>
                schema.sql
              </Text>
            </button>
          </>
        )}
      </div>

      {/* Source + actions */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "10px 14px",
            borderBottom: "1px solid #F1F2F7",
          }}
        >
          <Space>
            <CodeOutlined style={{ color: "#9AA3B5" }} />
            <Text strong style={{ fontSize: 13, fontFamily: "ui-monospace, Menlo, monospace" }}>
              {activeFile?.path}
            </Text>
          </Space>
          {activeFile && activeFile.path !== schema?.path && appUrl && !apiPath(activeFile.path).includes(":") && (
            <Tooltip title={t("wcomp.abOpenEndpoint", "Mở endpoint thật trên app")}>
              <Button
                size="small"
                icon={<LinkOutlined />}
                href={`${appUrl.replace(/\/$/, "")}${apiPath(activeFile.path)}`}
                target="_blank"
              >
                {t("wcomp.abTryGet", "Gọi thử (GET)")}
              </Button>
            </Tooltip>
          )}
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 14 }}>
          <pre
            style={{
              margin: 0,
              padding: 14,
              borderRadius: 10,
              background: V.codeBg,
              color: V.codeText,
              border: `1px solid ${V.codeBorder}`,
              fontSize: 12.5,
              lineHeight: 1.6,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              whiteSpace: "pre",
              overflow: "auto",
              boxShadow: CARD_SHADOW,
            }}
          >
            {activeFile?.content ?? ""}
          </pre>
        </div>
      </div>
    </div>
  );
}
