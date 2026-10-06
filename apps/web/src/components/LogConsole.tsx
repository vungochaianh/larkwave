"use client";

import { Empty } from "antd";
import { useEffect, useRef } from "react";
import type { LogLine } from "@larkwave/shared";
import dayjs from "dayjs";
import { useI18n } from "@larkwave/ui";

export default function LogConsole({ logs }: { logs: LogLine[] }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  return (
    <div className="tw-log-console" ref={ref}>
      {logs.length === 0 ? (
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
            description={
              <span style={{ color: "rgba(255,255,255,0.4)" }}>
                {t("wcomp.lcEmpty", "Nhật ký sẽ hiển thị ở đây khi build chạy.")}
              </span>
            }
          />
        </div>
      ) : (
        logs.map((line, idx) => (
          <div className="tw-log-line" key={`${line.ts}-${idx}`}>
            <span className="tw-log-ts">
              {dayjs(line.ts).format("HH:mm:ss")}
            </span>
            <span className={`tw-log-level-${line.level}`}>
              {line.stage ? `[${line.stage}] ` : ""}
              {line.msg}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
