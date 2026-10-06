"use client";

import {
  CheckCircleFilled,
  CloseCircleFilled,
  LoadingOutlined,
  MinusCircleFilled,
} from "@ant-design/icons";
import { STAGE_LABELS, STAGE_ORDER, type StageState } from "@larkwave/shared";
import { stageStatusColor } from "@/lib/format";

function StageIcon({ status }: { status: StageState["status"] }) {
  const color = stageStatusColor[status];
  switch (status) {
    case "done":
      return <CheckCircleFilled style={{ color, fontSize: 20 }} />;
    case "running":
      return <LoadingOutlined style={{ color, fontSize: 20 }} spin />;
    case "error":
      return <CloseCircleFilled style={{ color, fontSize: 20 }} />;
    case "skipped":
      return <MinusCircleFilled style={{ color, fontSize: 20 }} />;
    default:
      return (
        <span
          style={{
            display: "inline-block",
            width: 14,
            height: 14,
            borderRadius: "50%",
            border: `2px solid ${color}`,
          }}
        />
      );
  }
}

export default function PipelineRail({ stages }: { stages: StageState[] }) {
  const byName = new Map(stages.map((s) => [s.name, s]));

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "stretch",
      }}
    >
      {STAGE_ORDER.map((name, i) => {
        const stage =
          byName.get(name) ?? ({ name, status: "pending" } as StageState);
        const active = stage.status === "running";
        const done = stage.status === "done";
        const error = stage.status === "error";
        const borderColor = error
          ? "rgba(239,68,68,0.45)"
          : active
            ? "rgba(108,92,231,0.45)"
            : done
              ? "rgba(22,185,141,0.35)"
              : "#ECEDF3";
        const bg = error
          ? "rgba(239,68,68,0.06)"
          : active
            ? "rgba(108,92,231,0.07)"
            : done
              ? "rgba(22,185,141,0.05)"
              : "#FFFFFF";
        return (
          <div
            key={name}
            className={active ? "tw-stage-active" : undefined}
            style={{
              flex: "1 1 140px",
              minWidth: 130,
              display: "flex",
              flexDirection: "column",
              gap: 6,
              padding: "12px 14px",
              borderRadius: 12,
              background: bg,
              border: `1px solid ${borderColor}`,
              boxShadow: "0 1px 2px rgba(17,24,39,0.04)",
              transition: "all .2s ease",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  color: "#9AA3B5",
                  fontWeight: 600,
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <StageIcon status={stage.status} />
            </div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              {STAGE_LABELS[name]}
            </div>
            {stage.summary ? (
              <div
                style={{
                  fontSize: 11.5,
                  color: "#6B7280",
                  lineHeight: 1.4,
                }}
              >
                {stage.summary}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
