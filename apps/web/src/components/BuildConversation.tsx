"use client";

import {
  CheckCircleFilled,
  CloseCircleOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  DeploymentUnitOutlined,
  EyeOutlined,
  LinkOutlined,
  LoadingOutlined,
  PauseCircleOutlined,
  RedoOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App,
  Avatar,
  Button,
  Popconfirm,
  Space,
  Spin,
  Tooltip,
  Typography,
} from "antd";
import { useEffect, useState } from "react";
import type { Track, UploadRef } from "@larkwave/shared";
import { useI18n } from "@larkwave/ui";
import { api } from "@/lib/api";
import { BRAND_GRADIENT, CARD_SHADOW } from "@/lib/theme";
import type { BuildStreamState } from "@/lib/useBuildStream";
import AttachmentChips from "./Attachments";
import BlueprintReview from "./BlueprintReview";
import { BuildStatusTag } from "./StatusTags";
import LogConsole from "./LogConsole";
import PipelineRail from "./PipelineRail";
import ResultCard from "./ResultCard";

const { Text, Paragraph } = Typography;

/**
 * Base44/Lovable-style live build view rendered as a conversation:
 *   • the user's prompt as a chat bubble
 *   • the assistant "building" with a live 6-stage pipeline + streaming logs
 *   • a terminal result (live URL + open/preview) or an error with retry.
 */
export default function BuildConversation({
  prompt,
  attachments,
  state,
  track,
  appId,
  onOpenPreview,
  onRetry,
  onNewIteration,
  onRerun,
  onRedeploy,
  onServerDeploy,
  imported,
  onDeleted,
}: {
  /** The prompt that kicked off this build (shown as the user message). */
  prompt?: string | null;
  /** Files attached to this build's prompt (shown as previewable chips). */
  attachments?: UploadRef[] | null;
  state: BuildStreamState;
  track?: Track | null;
  /** The app/project this build belongs to (needed for re-run + delete). */
  appId?: string | null;
  /** True for a git-imported app: re-running rebuilds its OWN code for FREE (no AI). */
  imported?: boolean;
  /** Open the "Chạy trên Server (Docker)" view (for imports that need SSR/a server). */
  onServerDeploy?: () => void;
  /** Switch the workspace to the Preview view. */
  onOpenPreview?: () => void;
  /** Open the "Sửa app" iterate affordance (used on failure). */
  onRetry?: () => void;
  /** Start another iteration in this same build section. */
  onNewIteration?: () => void;
  /**
   * Re-run the SAME prompt as a fresh build, streamed in this same view.
   * The host wires this to createBuild({ appId, prompt }) + start + ?build=.
   */
  /** `buildId` để máy chủ tự đọc yêu cầu gốc — prompt đã lưu có thể vượt trần 4000 ký tự. */
  onRerun?: (prompt: string, buildId?: string) => void | Promise<void>;
  /**
   * Re-deploy this build's already-generated source (free, no AI codegen). Shown
   * when the build built OK but failed only at the deploy step.
   */
  onRedeploy?: (buildId: string) => void | Promise<void>;
  /** Called after the project/app has been deleted (host navigates away). */
  onDeleted?: () => void;
}) {
  const { t } = useI18n();
  const { message } = App.useApp();
  const { buildId, status, stages, logs, result, blueprint, error, retryable, streaming } = state;

  const [canceling, setCanceling] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const [redeploying, setRedeploying] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isTerminal =
    status === "succeeded" || status === "failed" || status === "canceled";
  const succeeded = status === "succeeded";
  const failed = status === "failed";
  const canceled = status === "canceled";
  // Paused at the design-approval gate — show the Blueprint review instead of logs.
  const awaitingApproval = status === "awaiting_approval";
  // In-flight = still queued/running on the live stream (not the approval pause).
  const inFlight =
    status === "queued" || status === "running" || (streaming && !awaitingApproval);
  // Terminal but not a success → offer a re-run. HIDDEN for imported apps: a re-run
  // re-creates from the prompt (e.g. "Import gitlab repo …") = a paid AI build that
  // would DISCARD the imported code. Imports re-run via the free redeploy below.
  const canRerun = (failed || canceled) && !!onRerun && !imported;
  // Built OK but failed only at deploy → FREE re-deploy of the existing source (no AI
  // codegen, no credit). For imported apps, offer it on ANY failure (rebuild their
  // own code, reusing the saved .toolswave config). Web only: mobile/extension mark
  // the build stage done but have no Pages deploy to retry.
  const builtOk = stages.some((s) => s.name === "build" && s.status === "done");
  const canRedeploy =
    failed && (builtOk || !!imported) && track === "web" && !!onRedeploy && !!buildId;
  // Imported app that can't static-export (e.g. Next.js with dynamic routes) → route
  // to the Docker server instead of a futile static rebuild.
  const ssrFail =
    !!error &&
    /xuất.{0,6}trang tĩnh|Static worker|Export encountered|cần SSR|cần.{0,4}máy chủ|Chạy trên Server/i.test(
      error,
    );
  const showServerDeploy = !!imported && ssrFail && !!onServerDeploy;
  // Import-only success: the build succeeded but produced NO deployed URL (e.g. an
  // imported Next.js SSR app — stored, not static-deployable). It isn't "live" yet;
  // the next step is "Chạy trên Server", so say that and surface the button here.
  const needsServer = succeeded && !!imported && !result?.url && !!onServerDeploy;

  const cancel = async () => {
    if (!buildId || canceling) return;
    setCanceling(true);
    try {
      await api.cancelBuild(buildId);
      message.loading({ content: t("wcomp.bcStopping", "Đang dừng…"), key: "cancel-build" });
      // The SSE stream will emit 'canceled' + 'done'; the pill/spinner update
      // reactively from useBuildStream. We only reflect the request here.
    } catch (e) {
      message.error((e as Error).message);
      setCanceling(false);
    }
  };

  // Once the stream confirms a terminal state, clear the "đang dừng…" loading.
  useEffect(() => {
    if (canceling && isTerminal) {
      setCanceling(false);
      message.destroy("cancel-build");
    }
  }, [canceling, isTerminal, message]);

  const redeploy = async () => {
    if (!onRedeploy || !buildId || redeploying) return;
    setRedeploying(true);
    try {
      await onRedeploy(buildId);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setRedeploying(false);
    }
  };

  const rerun = async () => {
    if (!onRerun || rerunning) return;
    const p = (prompt ?? "").trim();
    if (!p) {
      message.error(t("wcomp.bcNoOriginalPrompt", "Không tìm thấy yêu cầu gốc để chạy lại"));
      return;
    }
    setRerunning(true);
    try {
      await onRerun(p, buildId ?? undefined);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setRerunning(false);
    }
  };

  const deleteProject = async () => {
    if (!appId || deleting) return;
    setDeleting(true);
    try {
      // If the build is still running, abort the pipeline before deleting.
      if (inFlight && buildId) {
        await api.cancelBuild(buildId).catch(() => {});
      }
      await api.deleteApp(appId);
      message.success(t("wcomp.bcProjectDeleted", "Đã xoá dự án"));
      onDeleted?.();
    } catch (e) {
      message.error((e as Error).message);
      setDeleting(false);
    }
  };

  /** Danger "Xoá dự án" button wrapped in a confirm — reused across states. */
  const deleteButton = (
    <Popconfirm
      title={t("wcomp.bcDeleteConfirmTitle", "Xoá vĩnh viễn dự án này?")}
      description={t("wcomp.bcDeleteConfirmDesc", "Hành động này không thể hoàn tác.")}
      okText={t("wcomp.bcDeleteProject", "Xoá dự án")}
      okButtonProps={{ danger: true, loading: deleting }}
      cancelText={t("wcomp.appCancel", "Huỷ")}
      onConfirm={() => deleteProject()}
      disabled={!appId}
    >
      <Button
        danger
        type="text"
        icon={<DeleteOutlined />}
        loading={deleting}
        disabled={!appId}
      >
        {t("wcomp.bcDeleteProject", "Xoá dự án")}
      </Button>
    </Popconfirm>
  );

  if (!buildId) {
    return (
      <div style={{ padding: "48px 0", textAlign: "center" }}>
        <Text type="secondary">{t("wcomp.bcNoBuildRunning", "Chưa có build nào đang chạy.")}</Text>
      </div>
    );
  }

  return (
    <Space direction="vertical" size={18} style={{ width: "100%" }}>
      {/* User message bubble */}
      {prompt ? <UserBubble text={prompt} attachments={attachments} /> : null}

      {/* Assistant "building" bubble */}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <Avatar
          size={36}
          icon={<ThunderboltOutlined />}
          style={{ background: BRAND_GRADIENT, color: "#fff", flexShrink: 0 }}
        />
        <div
          style={{
            flex: 1,
            minWidth: 0,
            background: "#FFFFFF",
            border: "1px solid #ECEDF3",
            borderRadius: "4px 16px 16px 16px",
            boxShadow: CARD_SHADOW,
            padding: 18,
          }}
        >
          {/* Status line */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              marginBottom: 14,
            }}
          >
            {awaitingApproval ? (
              <EyeOutlined style={{ color: "#6C5CE7", fontSize: 16 }} />
            ) : streaming ? (
              <LoadingOutlined style={{ color: "#6C5CE7", fontSize: 16 }} spin />
            ) : succeeded ? (
              <CheckCircleFilled style={{ color: "#16B98D", fontSize: 16 }} />
            ) : failed ? (
              <CloseCircleOutlined style={{ color: "#EF4444", fontSize: 16 }} />
            ) : (
              <Spin size="small" />
            )}
            <Text strong style={{ fontSize: 14.5 }}>
              {awaitingApproval
                ? t("wcomp.bcReviewBeforeGen", "Xem lại thiết kế trước khi sinh app")
                : succeeded
                  ? needsServer
                    ? t("wcomp.bcImportedRunServer", "Đã nhập xong — bấm “Chạy trên Server” để chạy app")
                    : t("wcomp.bcDoneReady", "Đã hoàn tất — app của bạn đã sẵn sàng")
                  : failed
                    ? t("wcomp.btBuildError", "Build gặp lỗi")
                    : t("wcomp.bcBuilding", "Larkwave đang dựng app của bạn…")}
            </Text>
            {status && <BuildStatusTag status={status} />}
          </div>

          {/* Live pipeline */}
          <PipelineRail stages={stages} />

          {/* Import-only success → explain it's stored but needs the server to run. */}
          {needsServer && (
            <Alert
              type="info"
              showIcon
              style={{ marginTop: 14 }}
              message={t("wcomp.bcNeedServerMsg", "App đã nhập đầy đủ, nhưng đây là app cần máy chủ (SSR) — không deploy tĩnh được.")}
              description={t("wcomp.bcNeedServerDesc", 'Bấm "Chạy trên Server" bên dưới để chạy thật (Docker, next start) và nhận đường dẫn website.')}
            />
          )}

          {/* Design-approval gate: review/edit the Blueprint, then approve. */}
          {awaitingApproval && blueprint && buildId && (
            <div style={{ marginTop: 16 }}>
              <BlueprintReview key={buildId} buildId={buildId} blueprint={blueprint} />
            </div>
          )}

          {/* Streaming console (hidden while waiting at the gate) */}
          {!awaitingApproval && (
            <div style={{ marginTop: 16 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t("wcomp.bpLiveLog", "Nhật ký trực tiếp")}
              </Text>
              <div style={{ marginTop: 8 }}>
                <LogConsole logs={logs} />
              </div>
            </div>
          )}

          {/* Status-dependent action bar */}
          {(inFlight || canRerun || appId) && (
            <div
              style={{
                marginTop: 16,
                paddingTop: 14,
                borderTop: "1px solid #F1F2F7",
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              {/* While queued/running: Dừng (cancel) */}
              {inFlight && (
                <Button
                  danger
                  ghost
                  icon={<PauseCircleOutlined />}
                  loading={canceling}
                  onClick={cancel}
                >
                  {canceling ? t("wcomp.bcStopping", "Đang dừng…") : t("wcomp.bcStop", "Dừng")}
                </Button>
              )}

              {/* Terminal & not success: Chạy lại (re-run same prompt) */}
              {canRerun && (
                <Button
                  type="primary"
                  icon={<ReloadOutlined />}
                  loading={rerunning}
                  onClick={rerun}
                >
                  {t("wcomp.bcRerun", "Chạy lại")}
                </Button>
              )}

              {/* Import-only success (e.g. Next.js SSR): the app is stored but not live
                  yet — running it happens on the Docker server. Make that the CTA. */}
              {needsServer && (
                <Button
                  type="primary"
                  icon={<DeploymentUnitOutlined />}
                  onClick={onServerDeploy}
                >
                  {t("wcomp.btRunOnServer", "Chạy trên Server")}
                </Button>
              )}

              {/* Always available: Xoá dự án */}
              {appId && deleteButton}
            </div>
          )}
        </div>
      </div>

      {/* Error → retry / fix affordance */}
      {error && (
        <Alert
          type={retryable ? "warning" : "error"}
          showIcon
          message={retryable ? t("wcomp.bpInterrupted", "Build bị gián đoạn (lỗi tạm thời)") : t("wcomp.bpFailed", "Build thất bại")}
          description={
            <Space direction="vertical" size={10} style={{ width: "100%" }}>
              <Paragraph style={{ margin: 0 }}>{error}</Paragraph>
              <Space wrap size={8}>
                {/* Imported app that needs SSR/a server (can't static-export) → Docker. */}
                {showServerDeploy && (
                  <Tooltip title={t("wcomp.btServerTip", "App này cần SSR/máy chủ (vd Next.js dùng dữ liệu động) nên không deploy tĩnh được. Chạy trên Server (Docker) để chạy backend/SSR thật.")}>
                    <Button
                      type="primary"
                      size="small"
                      icon={<DeploymentUnitOutlined />}
                      onClick={onServerDeploy}
                    >
                      {t("wcomp.btRunOnServer", "Chạy trên Server")}
                    </Button>
                  </Tooltip>
                )}
                {/* Imported / already-built source — rebuild + deploy the EXACT code for
                    FREE (no AI codegen / credit). Best first option. */}
                {canRedeploy && (
                  <Tooltip
                    title={
                      imported
                        ? t("wcomp.btRedeployUserTip", "Build + deploy lại đúng mã nguồn này — MIỄN PHÍ, không tốn credit (không sinh code mới bằng AI).")
                        : t("wcomp.btRedeployAiTip", "Dùng lại mã nguồn đã tạo, chỉ build + deploy lại — MIỄN PHÍ, không tốn credit. Hợp khi code đã đúng mà chỉ bước deploy bị lỗi.")
                    }
                  >
                    <Button
                      type={showServerDeploy ? "default" : "primary"}
                      size="small"
                      icon={<CloudUploadOutlined />}
                      loading={redeploying}
                      onClick={redeploy}
                    >
                      {imported ? t("wcomp.btRebuildFree", "Build lại (miễn phí)") : t("wcomp.btRedeploy", "Triển khai lại")}
                    </Button>
                  </Tooltip>
                )}
                {/* Transient (network / AI overload) → 1-click retry of the same
                    prompt. Reuses the rerun path (a fresh build, consumes credits). */}
                {retryable && canRerun && (
                  <Tooltip title={t("wcomp.bcRetryTip", "Chạy lại đúng yêu cầu này (tốn credit như một build mới)")}>
                    <Button
                      type="primary"
                      size="small"
                      icon={<ReloadOutlined />}
                      loading={rerunning}
                      onClick={rerun}
                    >
                      {t("wcomp.bcRetryNow", "Thử lại ngay")}
                    </Button>
                  </Tooltip>
                )}
                {onRetry && (
                  <Button
                    size="small"
                    danger={!retryable}
                    icon={<RedoOutlined />}
                    onClick={onRetry}
                  >
                    {t("wcomp.bcFixRetry", "Sửa app & thử lại")}
                  </Button>
                )}
              </Space>
            </Space>
          }
        />
      )}

      {/* Success → result + go-to-preview */}
      {result && succeeded && (
        <Space direction="vertical" size={14} style={{ width: "100%" }}>
          <ResultCard result={result} track={track} />
          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            {onOpenPreview && (
              <Button
                type="primary"
                icon={<EyeOutlined />}
                onClick={onOpenPreview}
              >
                {t("wcomp.bcViewPreview", "Xem Preview")}
              </Button>
            )}
            {(result.url || result.previewUrl) && (
              <Button
                icon={<LinkOutlined />}
                href={result.url || result.previewUrl}
                target="_blank"
                rel="noreferrer"
              >
                {t("wcomp.rsOpenApp", "Mở app")}
              </Button>
            )}
            {onNewIteration && (
              <Button icon={<RedoOutlined />} onClick={onNewIteration}>
                {t("wcomp.bcEditMore", "Sửa thêm")}
              </Button>
            )}
            {appId && deleteButton}
          </div>
        </Space>
      )}
    </Space>
  );
}

function UserBubble({
  text,
  attachments,
}: {
  text: string;
  attachments?: UploadRef[] | null;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        alignItems: "flex-start",
        flexDirection: "row-reverse",
      }}
    >
      <Avatar
        size={36}
        icon={<UserOutlined />}
        style={{ background: "#EEF0FB", color: "#6C5CE7", flexShrink: 0 }}
      />
      <div style={{ maxWidth: "82%" }}>
        <div
          style={{
            background:
              "linear-gradient(135deg, rgba(108,92,231,0.12), rgba(166,107,255,0.10))",
            border: "1px solid rgba(108,92,231,0.20)",
            borderRadius: "16px 4px 16px 16px",
            padding: "12px 16px",
            color: "#1E2230",
            fontSize: 14.5,
            lineHeight: 1.55,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {text}
        </div>
        {attachments?.length ? (
          <div style={{ marginTop: 8 }}>
            <AttachmentChips items={attachments} align="end" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
