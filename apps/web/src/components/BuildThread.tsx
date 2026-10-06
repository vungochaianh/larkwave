"use client";

import {
  CheckCircleFilled,
  CloseCircleOutlined,
  CloudUploadOutlined,
  DeploymentUnitOutlined,
  LinkOutlined,
  ReloadOutlined,
  StopOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Avatar, Button, Tag, Tooltip, Typography } from "antd";
import { useState } from "react";
import type { Build, Track } from "@larkwave/shared";
import { useI18n } from "@larkwave/ui";
import { BRAND_GRADIENT, CARD_SHADOW } from "@/lib/theme";
import AttachmentChips from "@/components/Attachments";
import { MODEL_META } from "@/components/ModelSelector";
import { STYLE_OPTIONS } from "@/components/PromptComposer";

const { Text } = Typography;

const STYLE_LABEL = (value: string | null): string | null => {
  if (!value || value === "auto") return null;
  return STYLE_OPTIONS.find((o) => o.value === value)?.label ?? value;
};

/**
 * A single completed/terminal build rendered as a chat turn:
 *   • a user bubble (the prompt + chips for model / màu / kiểu)
 *   • an assistant bubble (status + "✔ đã cập nhật" with live URL, or error).
 *
 * The currently-active / streaming build is rendered separately by the host via
 * <BuildConversation>; this is for the static history above it.
 */
export default function BuildTurn({
  build,
  appTrack,
  onOpenUrl,
  onRebuild,
  onRedeploy,
  onServerDeploy,
}: {
  build: Build;
  /** The app's track — fallback when this build's track is null (iterate builds). */
  appTrack?: Track | null;
  onOpenUrl?: (url: string) => void;
  /** Re-run THIS request as a fresh build (reusing its prompt + attachments). */
  onRebuild?: (build: Build) => void | Promise<void>;
  /** Re-deploy this build's already-generated source (free, no codegen). */
  onRedeploy?: (buildId: string) => void | Promise<void>;
  /** Open the "Chạy trên Server (Docker)" view (for imports that need SSR/a server). */
  onServerDeploy?: () => void;
}) {
  const { t } = useI18n();
  const url = build.result?.url || build.result?.previewUrl || null;
  const [rebuilding, setRebuilding] = useState(false);
  const [redeploying, setRedeploying] = useState(false);
  const failed = build.status === "failed" || build.status === "canceled";
  const nAttach = build.attachments?.length ?? 0;
  const isWeb = (build.track ?? appTrack ?? "web") === "web";
  const builtOk = build.stages?.some((s) => s.name === "build" && s.status === "done") ?? false;
  // 'edit'/'import' builds carry the user's OWN code (imported repo / edited files).
  // Re-running just rebuilds + deploys those files (reusing the saved .toolswave
  // config) — FREE, no AI. AI "Tạo lại" is meaningless here (the "prompt" is e.g.
  // "Import gitlab repo …"), so it's hidden — regenerating would discard their code.
  const userCode = build.mode === "edit" || build.mode === "import";
  // Free rebuild/redeploy: for user code, on ANY failure; for AI code, only when the
  // source already built (deploy-stage-only failure) — a broken AI build needs regen.
  const showFreeRedeploy =
    build.status === "failed" && isWeb && !!onRedeploy && (builtOk || userCode);
  // An imported app that can't static-export (e.g. Next.js with dynamic routes) →
  // point to the Docker server instead of a futile static rebuild.
  const ssrFail =
    !!build.error &&
    /xuất.{0,6}trang tĩnh|Static worker|Export encountered|cần SSR|cần.{0,4}máy chủ|Chạy trên Server/i.test(
      build.error,
    );
  // Import-only SUCCESS (e.g. a Next.js SSR app: stored, no static deploy / URL) — it
  // isn't live yet; running it happens on the Docker server. Surface that here too, so
  // the CTA persists in history (not just on the live turn).
  const importedNoDeploy =
    build.status === "succeeded" && userCode && isWeb && !url && !!onServerDeploy;
  const showServerDeploy = !!onServerDeploy && ((userCode && ssrFail) || importedNoDeploy);
  const showRegenerate = !!onRebuild && !userCode;

  const rebuild = async () => {
    if (!onRebuild || rebuilding) return;
    setRebuilding(true);
    try {
      await onRebuild(build);
    } finally {
      setRebuilding(false);
    }
  };

  const redeploy = async () => {
    if (!onRedeploy || redeploying) return;
    setRedeploying(true);
    try {
      await onRedeploy(build.id);
    } finally {
      setRedeploying(false);
    }
  };

  return (
    <div className="tw-msg" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <UserBubble build={build} />
      <AssistantBubble build={build} url={url} onOpenUrl={onOpenUrl} />
      {(showRegenerate || showFreeRedeploy || showServerDeploy) && (
        // Aligned under the assistant bubble (past the 30px avatar + 10px gap).
        <div style={{ paddingLeft: 40, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {/* Imported app that needs SSR/a server (can't static-export) → run on Docker. */}
          {showServerDeploy && (
            <Tooltip title={t("wcomp.btServerTip", "App này cần SSR/máy chủ (vd Next.js dùng dữ liệu động) nên không deploy tĩnh được. Chạy trên Server (Docker) để chạy backend/SSR thật.")}>
              <Button
                size="small"
                type="primary"
                icon={<DeploymentUnitOutlined />}
                onClick={onServerDeploy}
              >
                {t("wcomp.btRunOnServer", "Chạy trên Server")}
              </Button>
            </Tooltip>
          )}
          {showFreeRedeploy && (
            <Tooltip
              title={
                userCode
                  ? t("wcomp.btRedeployUserTip", "Build + deploy lại đúng mã nguồn này — MIỄN PHÍ, không tốn credit (không sinh code mới bằng AI).")
                  : t("wcomp.btRedeployAiTip", "Dùng lại mã nguồn đã tạo, chỉ build + deploy lại — MIỄN PHÍ, không tốn credit. Hợp khi code đã đúng mà chỉ bước deploy bị lỗi.")
              }
            >
              <Button
                size="small"
                type={showServerDeploy ? "default" : "primary"}
                icon={<CloudUploadOutlined />}
                loading={redeploying}
                onClick={redeploy}
              >
                {userCode ? t("wcomp.btRebuildFree", "Build lại (miễn phí)") : t("wcomp.btRedeploy", "Triển khai lại")}
              </Button>
            </Tooltip>
          )}
          {showRegenerate && (
            <Tooltip
              title={
                nAttach > 0
                  ? t("wcomp.btRegenAttachTip", "Tạo lại đúng yêu cầu này (sinh code MỚI từ đầu) — tự dùng lại các tệp đã đính kèm, không cần tải lên lại. Tốn credit như một build mới.")
                  : t("wcomp.btRegenTip", "Tạo lại đúng yêu cầu này — sinh code mới từ đầu (tốn credit như một build mới)")
              }
            >
              <Button
                size="small"
                type={failed && !showFreeRedeploy ? "primary" : "text"}
                icon={<ReloadOutlined />}
                loading={rebuilding}
                onClick={rebuild}
                style={failed && !showFreeRedeploy ? undefined : { color: "#6C5CE7" }}
              >
                {t("wcomp.btRegenerate", "Tạo lại")}
                {nAttach > 0 ? ` (${t("wcomp.btWith", "kèm")} ${nAttach} ${t("wcomp.btFilesWord", "tệp")})` : ""}
              </Button>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  );
}

function UserBubble({ build }: { build: Build }) {
  const { t } = useI18n();
  const styleLabel = STYLE_LABEL(build.style);
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        flexDirection: "row-reverse",
      }}
    >
      <Avatar
        size={30}
        icon={<UserOutlined />}
        style={{ background: "#EEF0FB", color: "#6C5CE7", flexShrink: 0 }}
      />
      <div style={{ maxWidth: "88%" }}>
        <div
          style={{
            background:
              "linear-gradient(135deg, rgba(108,92,231,0.12), rgba(166,107,255,0.10))",
            border: "1px solid rgba(108,92,231,0.20)",
            borderRadius: "14px 4px 14px 14px",
            padding: "10px 14px",
            color: "#1E2230",
            fontSize: 14,
            lineHeight: 1.55,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {build.prompt}
        </div>
        {/* Attached files for this request (image/PDF/doc/text) — previewable. */}
        {build.attachments?.length ? (
          <div style={{ marginTop: 6 }}>
            <AttachmentChips items={build.attachments} align="end" />
          </div>
        ) : null}
        {/* Chips: model / màu / kiểu (only when present). */}
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            justifyContent: "flex-end",
            marginTop: 6,
          }}
        >
          {build.model && MODEL_META[build.model] && (
            <Tag
              bordered={false}
              style={{ margin: 0, background: "#F1F2F7", color: "#6B7280" }}
            >
              {MODEL_META[build.model].emoji} {t(`wcomp.model.${build.model}`, MODEL_META[build.model].name)}
            </Tag>
          )}
          {build.primaryColor && (
            <Tag
              bordered={false}
              style={{
                margin: 0,
                background: "#F1F2F7",
                color: "#6B7280",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  borderRadius: 3,
                  background: build.primaryColor,
                  border: "1px solid rgba(0,0,0,0.10)",
                }}
              />
              {build.primaryColor}
            </Tag>
          )}
          {styleLabel && (
            <Tag
              bordered={false}
              style={{ margin: 0, background: "#F1F2F7", color: "#6B7280" }}
            >
              {t(`wcomp.style.${build.style}`, styleLabel)}
            </Tag>
          )}
        </div>
      </div>
    </div>
  );
}

function AssistantBubble({
  build,
  url,
  onOpenUrl,
}: {
  build: Build;
  url: string | null;
  onOpenUrl?: (url: string) => void;
}) {
  const { t } = useI18n();
  const succeeded = build.status === "succeeded";
  const failed = build.status === "failed";
  const canceled = build.status === "canceled";

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <Avatar
        size={30}
        icon={<ThunderboltOutlined />}
        style={{ background: BRAND_GRADIENT, color: "#fff", flexShrink: 0 }}
      />
      <div
        style={{
          maxWidth: "88%",
          background: "#FFFFFF",
          border: "1px solid #ECEDF3",
          borderRadius: "4px 14px 14px 14px",
          boxShadow: CARD_SHADOW,
          padding: "10px 14px",
          fontSize: 14,
          lineHeight: 1.55,
        }}
      >
        {succeeded ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <CheckCircleFilled style={{ color: "#16B98D" }} />
              <Text strong style={{ fontSize: 14 }}>
                {t("wcomp.btUpdated", "✔ Đã cập nhật")}
              </Text>
            </span>
            {url ? (
              <button
                type="button"
                onClick={() => onOpenUrl?.(url)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  color: "#6C5CE7",
                  fontSize: 13,
                  textAlign: "left",
                  wordBreak: "break-all",
                }}
              >
                <LinkOutlined /> {url}
              </button>
            ) : (
              <Text type="secondary" style={{ fontSize: 13 }}>
                {t("wcomp.btBuildDone", "Build hoàn tất.")}
              </Text>
            )}
          </div>
        ) : failed ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <CloseCircleOutlined style={{ color: "#EF4444" }} />
              <Text strong style={{ fontSize: 14, color: "#EF4444" }}>
                {t("wcomp.btBuildError", "Build gặp lỗi")}
              </Text>
            </span>
            {build.error && (
              <Text type="secondary" style={{ fontSize: 12.5 }}>
                {build.error}
              </Text>
            )}
          </div>
        ) : canceled ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <StopOutlined style={{ color: "#9AA3B5" }} />
            <Text type="secondary">{t("wcomp.btCanceled", "Đã huỷ build này")}</Text>
          </span>
        ) : (
          <Text type="secondary">{t("wcomp.btPending", "Đang chờ xử lý…")}</Text>
        )}
      </div>
    </div>
  );
}
