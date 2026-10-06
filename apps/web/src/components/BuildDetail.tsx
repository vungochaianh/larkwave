"use client";

import { Alert, Skeleton, Space, Typography } from "antd";
import { useEffect } from "react";
import type { Track } from "@larkwave/shared";
import { useI18n } from "@larkwave/ui";
import { useBuildStream } from "@/lib/useBuildStream";
import { BuildStatusTag } from "./StatusTags";
import LogConsole from "./LogConsole";
import PipelineRail from "./PipelineRail";
import ResultCard from "./ResultCard";

const { Text } = Typography;

/**
 * Loads a build by id (detail = stages + logs + result). If the build is still
 * running it attaches the live stream automatically.
 */
export default function BuildDetail({
  buildId,
  track,
}: {
  buildId: string;
  track?: Track | null;
}) {
  const { t } = useI18n();
  const { state, loadDetail } = useBuildStream();

  useEffect(() => {
    void loadDetail(buildId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildId]);

  if (state.buildId !== buildId || (!state.status && !state.error)) {
    return <Skeleton active paragraph={{ rows: 6 }} />;
  }

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Space>
        <Text type="secondary">{t("wcomp.bdStatus", "Trạng thái:")}</Text>
        {state.status && <BuildStatusTag status={state.status} />}
      </Space>

      <PipelineRail stages={state.stages} />

      <div>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {t("wcomp.bdLog", "Nhật ký")}
        </Text>
        <div style={{ marginTop: 8 }}>
          <LogConsole logs={state.logs} />
        </div>
      </div>

      {state.error && (
        <Alert type="error" showIcon message={t("wcomp.bdBuildError", "Lỗi build")} description={state.error} />
      )}

      {state.result && <ResultCard result={state.result} track={track} />}
    </Space>
  );
}
