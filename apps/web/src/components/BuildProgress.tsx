"use client";

import { useEffect, useState } from "react";
import { Alert, App, Button, Card, Space, Spin, Typography } from "antd";
import type { Track } from "@larkwave/shared";
import { useI18n, clockTime, humanDuration } from "@larkwave/ui";
import { api } from "@/lib/api";
import type { BuildStreamState } from "@/lib/useBuildStream";
import { BuildStatusTag } from "./StatusTags";
import LogConsole from "./LogConsole";
import PipelineRail from "./PipelineRail";
import ResultCard from "./ResultCard";

const { Text } = Typography;

/** Re-render once a second ONLY while a build is in flight, so "đã chạy 2 phút" actually moves. */
function useNowTick(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export default function BuildProgress({
  state,
  track,
  onReset,
}: {
  state: BuildStreamState;
  track?: Track | null;
  onReset?: () => void;
}) {
  const { t } = useI18n();
  const nowTick = useNowTick(!!state.startedAt && !state.finishedAt);
  const { message } = App.useApp();
  const { buildId, status, stages, logs, result, error, retryable, streaming } = state;

  if (!buildId) return null;

  const cancel = async () => {
    if (!buildId) return;
    try {
      await api.cancelBuild(buildId);
      message.success(t("wcomp.bpCancelRequested", "Đã yêu cầu huỷ build"));
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const isTerminal =
    status === "succeeded" || status === "failed" || status === "canceled";

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Card
        title={
          <Space>
            {streaming && <Spin size="small" />}
            <span>{t("wcomp.bpTitle", "Tiến trình build")}</span>
            {status && <BuildStatusTag status={status} />}
          </Space>
        }
        extra={
          <Space>
            {/* Máy chủ nhận lệnh huỷ cho queued / running / awaiting_approval — nhưng nút này
                trước đây chỉ hiện lúc "queued", tức biến mất đúng lúc build bắt đầu chạy và
                người dùng mất luôn đường thoát khỏi một build sai. */}
            {!!status && !isTerminal && (
              <Button size="small" danger onClick={cancel}>
                {t("wcomp.bpCancel", "Huỷ")}
              </Button>
            )}
            {isTerminal && onReset && (
              <Button size="small" onClick={onReset}>
                {t("wcomp.bpNewApp", "Tạo app mới")}
              </Button>
            )}
          </Space>
        }
      >
        <Space direction="vertical" size="large" style={{ width: "100%" }}>
          {/* Mất kết nối KHÔNG phải build hỏng: máy chủ vẫn dựng tiếp. Nói ra để người dùng
              không ngồi nhìn một màn hình đứng im mà tưởng treo. */}
          {state.reconnecting && (
            <Alert
              type="info"
              showIcon
              message={t(
                "wcomp.bpReconnecting",
                "Mất kết nối tới máy chủ — đang tự nối lại. Build vẫn đang chạy, bạn không cần làm gì.",
              )}
            />
          )}
          {/* Bắt đầu lúc nào và mất bao lâu — trong lúc chạy thì đếm tiếp, xong thì đứng lại. */}
          {!!state.startedAt && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t("wcomp.bpStartedAt", "Bắt đầu")} {clockTime(state.startedAt)}
              {" · "}
              {state.finishedAt
                ? t("wcomp.bpTook", "mất {d}", { d: humanDuration(state.finishedAt - state.startedAt) })
                : t("wcomp.bpRunningFor", "đã chạy {d}", { d: humanDuration(nowTick - state.startedAt) })}
            </Text>
          )}
          <PipelineRail stages={stages} />
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t("wcomp.bpLiveLog", "Nhật ký trực tiếp")}
            </Text>
            <div style={{ marginTop: 8 }}>
              <LogConsole logs={logs} />
            </div>
          </div>
        </Space>
      </Card>

      {error && (
        <Alert
          type={retryable ? "warning" : "error"}
          showIcon
          message={
            retryable
              ? t("wcomp.bpInterrupted", "Build bị gián đoạn (lỗi tạm thời)")
              : t("wcomp.bpFailed", "Build thất bại")
          }
          description={
            <Space direction="vertical" size={8} style={{ width: "100%" }}>
              <span>{error}</span>
              {retryable && (
                <span style={{ fontSize: 12.5, opacity: 0.85 }}>
                  {t(
                    "wcomp.bpRetryHint",
                    "Đây là lỗi tạm thời (mạng/AI quá tải). Hãy gửi lại yêu cầu chỉnh sửa để thử lại.",
                  )}
                </span>
              )}
            </Space>
          }
        />
      )}

      {result && (status === "succeeded" || isTerminal) && (
        <ResultCard result={result} track={track} />
      )}
    </Space>
  );
}
