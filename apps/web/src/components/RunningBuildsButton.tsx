"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Empty, Popover, Progress, Tooltip } from "antd";
import { LoadingOutlined, ThunderboltOutlined } from "@ant-design/icons";
import Link from "next/link";
import { V, useI18n } from "@larkwave/ui";
import { api } from "@/lib/api";

interface Running {
  buildId: string;
  appId: string;
  appName: string;
  kind: "clone" | "codegen" | "edit" | "other";
  elapsedSec: number;
  etaSec: number;
  overdue: boolean;
  stage: string | null;
}

/** "8 phút nữa" / "1 giờ 5 phút nữa" — đủ để căn làm việc khác, không cần tới giây. */
function human(sec: number): string {
  if (sec < 60) return "dưới 1 phút";
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} phút`;
  return `${Math.floor(m / 60)} giờ ${m % 60} phút`;
}

const KIND_LABEL: Record<Running["kind"], string> = {
  clone: "Sao chép website",
  codegen: "Tạo website",
  edit: "Sửa app",
  other: "Đang xử lý",
};

/**
 * Nút "đang chạy" trên header.
 *
 * Vì sao cần: một lượt dựng mất 9–15 phút (bản sao có thể tới một giờ), mà khi rời khỏi trang
 * build thì KHÔNG còn chỗ nào cho biết nó còn chạy hay đã xong. Người dùng hoặc ngồi chờ trước
 * màn hình, hoặc quên mất. Nút này trả lời hai câu đó ở mọi trang.
 *
 * Không có việc nào đang chạy thì KHÔNG hiện — một nút luôn đứng đó với số 0 chỉ là nhiễu.
 */
export default function RunningBuildsButton() {
  const { t } = useI18n();
  const [items, setItems] = useState<Running[]>([]);

  const load = useCallback(async () => {
    try {
      setItems(await api.runningBuilds());
    } catch {
      /* im lặng: đây là thông tin phụ trên thanh điều hướng */
    }
  }, []);

  useEffect(() => {
    void load();
    // 20 giây: đủ để con số nhúc nhích mà không nện vào máy chủ. Thời gian còn lại được tính lại
    // ở máy chủ mỗi lần hỏi, nên không cần đếm ngược ở đây.
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [load]);

  if (!items.length) return null;

  const content = (
    <div style={{ width: 320, maxHeight: 360, overflowY: "auto" }}>
      {items.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có việc nào đang chạy" />
      ) : (
        items.map((b) => {
          const total = b.elapsedSec + Math.max(b.etaSec, 1);
          const pct = Math.min(99, Math.round((b.elapsedSec / total) * 100));
          return (
            <Link
              key={b.buildId}
              href={`/apps/${b.appId}?build=${b.buildId}`}
              style={{ display: "block", padding: "9px 4px", color: "inherit" }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {b.appName || KIND_LABEL[b.kind]}
                </span>
                <span style={{ fontSize: 11.5, color: V.textFaint, whiteSpace: "nowrap" }}>
                  {KIND_LABEL[b.kind]}
                </span>
              </div>
              <Progress percent={pct} showInfo={false} size="small" style={{ margin: "4px 0 2px" }} />
              <div style={{ fontSize: 11.5, color: V.textSub }}>
                {/* Quá mốc dự đoán thì NÓI THẲNG là không đoán được nữa, thay vì đứng ở "0 phút". */}
                {b.overdue
                  ? `Đã chạy ${human(b.elapsedSec)} — lâu hơn thường lệ, vẫn đang chạy`
                  : `Đã chạy ${human(b.elapsedSec)} · còn khoảng ${human(b.etaSec)}`}
              </div>
            </Link>
          );
        })
      )}
      <div style={{ fontSize: 11, color: V.textFaint, borderTop: `1px solid ${V.borderSub}`, paddingTop: 8, marginTop: 4 }}>
        Dự đoán tính từ các lần dựng trước của bạn — cứ đóng trang và làm việc khác, xong sẽ có thông báo.
      </div>
    </div>
  );

  return (
    <Popover content={content} trigger="click" placement="bottomRight" title="Đang chạy">
      <Tooltip title={t("nav.runningBuilds", "Tiến trình đang chạy")}>
        <Badge count={items.length} size="small" offset={[-2, 4]}>
          <Button type="text" icon={items.length ? <LoadingOutlined /> : <ThunderboltOutlined />} />
        </Badge>
      </Tooltip>
    </Popover>
  );
}
