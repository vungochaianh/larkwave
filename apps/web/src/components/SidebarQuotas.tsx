"use client";

import { useCallback, useEffect, useState } from "react";
import { Progress, Tooltip } from "antd";
import { V, useI18n, formatBytes, STORAGE_COLORS, STORAGE_COLOR_FALLBACK } from "@larkwave/ui";
import { formatTokens, refPercent } from "@/lib/formatTokens";
import { api } from "@/lib/api";
import { moBangGoi } from "@/lib/planModal";
import { onGoiChanged } from "@/lib/appEvents";

/** Đỏ khi chạm trần, hổ phách khi gần trần — cùng ngưỡng với UsageWidget để hai chỗ không nói khác nhau. */
function barColor(percent: number): string {
  if (percent >= 100) return "#EF4444";
  if (percent >= 80) return "#F59E0B";
  return "#6C5CE7";
}

interface Row {
  /** Khoá để React phân biệt hai dòng. Trước đây đây là `href` — xem chú thích của component. */
  key: string;
  label: string;
  percent: number;
  detail: string;
  tip: string;
  /** Không giới hạn: hiện SỐ ĐÃ DÙNG, và thanh vẽ theo lối riêng (xem hai trường dưới). */
  unlimited?: boolean;
  /** Tỉ lệ so với MỐC gói — chỉ tham chiếu, không phải trần. Dùng cho thanh mép nhoè. */
  refPercent?: number;
  /** Thanh thành phần, dùng khi không có mẫu số nào cả (dung lượng). */
  mix?: { key: string; color: string; pct: number }[];
}

/**
 * Thanh của MỘT dòng hạn mức. Ba lối vẽ, tuỳ dữ liệu thật có mẫu số hay không:
 *
 * - có trần   → thanh phần trăm bình thường, đổi màu khi gần/chạm trần.
 * - không trần, có mốc tham chiếu (token) → thanh mép nhoè `.tw-bar-unl`: vẫn đúng tỉ lệ so với
 *   mức gói, nhưng không kết thúc bằng vạch cứng nên không đọc thành "đã hết".
 * - không trần, không mốc nào (dung lượng) → thanh THÀNH PHẦN `.tw-bar-mix`: tỉ trọng giữa các
 *   nhóm dữ liệu. Luôn đầy khung, nên không thể bị hiểu là sắp hết.
 */
function Bar({ row, xs }: { row: Row; xs?: boolean }) {
  const thin = xs ? " tw-bar-xs" : "";
  if (!row.unlimited) {
    if (xs) {
      return (
        <div style={{ height: 4, borderRadius: 2, background: V.borderSub, overflow: "hidden" }}>
          <div
            style={{
              width: `${Math.min(100, row.percent)}%`,
              height: "100%",
              background: barColor(row.percent),
            }}
          />
        </div>
      );
    }
    return (
      <Progress
        percent={Math.min(100, row.percent)}
        showInfo={false}
        size="small"
        strokeColor={barColor(row.percent)}
        style={{ margin: 0 }}
      />
    );
  }
  if (row.mix?.length) {
    return (
      <div className={`tw-bar-mix${thin}`}>
        {row.mix.map((m) => (
          <i key={m.key} style={{ width: `${m.pct}%`, background: m.color }} />
        ))}
      </div>
    );
  }
  return (
    <div className={`tw-bar-unl${thin}`}>
      <i style={{ width: `${Math.min(100, Math.max(4, row.refPercent ?? 0))}%` }} />
    </div>
  );
}

/**
 * Hai thanh hạn mức ở chân thanh bên: mức dùng AI trong tháng, và dung lượng lưu trữ.
 *
 * Vì sao đặt ở đây: trước đó trang dung lượng chỉ tồn tại ở địa chỉ /storage mà KHÔNG có lối nào
 * bấm tới trong giao diện web — tính năng có mà không ai tìm thấy. Và hai con số này cùng trả lời
 * một câu hỏi ("tôi còn bao nhiêu?") nên đứng cạnh nhau thì đọc được trong một cái liếc.
 *
 * Hỏng thì IM LẶNG (trả null), không hiện khung lỗi: đây là thông tin phụ ở chân thanh điều
 * hướng, một dòng "không tải được" ở đó chỉ gây nhiễu chứ không giúp được gì.
 *
 * BẤM VÀO THÌ MỞ BẢNG, KHÔNG ĐIỀU HƯỚNG NỮA.
 *
 * Trước đây dòng AI là một <Link href="/pricing"> và dòng dung lượng là <Link href="/storage">.
 * Cả hai đều ném người dùng ra khỏi việc đang làm, và /pricing thì là trang tiếp thị nền tối
 * không mặc vỏ dashboard, nên cú bấm đó cảm giác như rơi ra khỏi sản phẩm. Hai thanh này vẫn là
 * PHẦN NHỎ — trả lời "còn bao nhiêu" trong một cái liếc; phần còn lại (tên gói, ngày làm mới,
 * dung lượng theo nhóm, lưới chọn gói) nằm trong bảng mở ra tại chỗ.
 */
export default function SidebarQuotas({ collapsed }: { collapsed: boolean }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);

  const tai = useCallback(async () => {
    const next: Row[] = [];
    try {
      const sub = await api.subscription();
      // Tài khoản không giới hạn (admin): KHÔNG ẩn dòng này. Thanh phần trăm thì vô nghĩa, nhưng
      // trạng thái "không giới hạn" vẫn đáng hiện — ẩn đi thì admin mở thanh bên ra và tưởng
      // tính năng hỏng.
      next.push({
        key: "ai",
        // Không giới hạn thì chữ "hạn mức" sai nghĩa — đổi nhãn, và hiện SỐ ĐÃ DÙNG thay cho
        // phần trăm (không có mẫu số thì phần trăm vô nghĩa, nhưng số thì vẫn thật).
        label: sub.unlimited ? t("nav.usageAi", "Mức dùng AI") : t("nav.quotaAi", "Hạn mức AI"),
        percent: sub.unlimited ? 0 : sub.percentUsed,
        detail: sub.unlimited ? `${formatTokens(sub.tokensUsed)} token` : `${sub.percentUsed}%`,
        refPercent: refPercent(sub.tokensUsed, sub.tokensLimit),
        tip: sub.unlimited
          ? t("nav.usageAiTip", "Tài khoản không giới hạn. Đây là lượng token đã dùng trong chu kỳ.")
          : t("nav.quotaAiTip", "Phần trăm hạn mức tháng đã dùng. Bấm để xem gói."),
        unlimited: sub.unlimited,
      });
    } catch {
      /* im lặng */
    }
    try {
      const s = await api.storageUsage();
      next.push({
        key: "storage",
        label: t("nav.quotaStorage", "Dung lượng"),
        percent: s.percentUsed,
        // Không giới hạn thì chỉ nói ĐANG DÙNG bao nhiêu — đó vẫn là con số admin cần.
        detail: s.unlimited
          ? formatBytes(s.totalBytes)
          : `${formatBytes(s.totalBytes)} / ${formatBytes(s.quotaBytes)}`,
        tip: t("nav.quotaStorageTip", "Dữ liệu bạn đang lưu. Bấm để xem chi tiết và dọn bớt."),
        unlimited: s.unlimited,
        mix:
          s.unlimited && s.totalBytes > 0
            ? s.buckets
                .filter((b) => b.bytes > 0)
                .map((b) => ({
                  key: b.category,
                  color: STORAGE_COLORS[b.category] ?? STORAGE_COLOR_FALLBACK,
                  pct: (b.bytes / s.totalBytes) * 100,
                }))
            : undefined,
      });
    } catch {
      /* im lặng */
    }
    return next;
  }, [t]);

  useEffect(() => {
    let dead = false;
    const chay = () => {
      void tai().then((next) => {
        if (!dead) setRows(next);
      });
    };
    chay();
    // Gói vừa đổi (thanh toán xong / hạ gói) thì đọc lại ngay. Không có dòng này thì người vừa
    // trả tiền vẫn thấy phần trăm và tên gói cũ cho tới khi họ tự tải lại trang.
    const thoi = onGoiChanged(chay);
    return () => {
      dead = true;
      thoi();
    };
  }, [tai]);

  if (!rows.length) return null;

  // Thu gọn thanh bên: chỉ còn hai vạch mỏng, vẫn bấm được và vẫn có tooltip đủ nghĩa.
  if (collapsed) {
    return (
      <div style={{ padding: "8px 14px 6px", display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((r) => (
          <Tooltip key={r.key} placement="right" title={`${r.label}: ${r.detail}`}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => moBangGoi()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") moBangGoi();
              }}
              style={{ display: "block", cursor: "pointer" }}
            >
              <Bar row={r} xs />
            </div>
          </Tooltip>
        ))}
      </div>
    );
  }

  return (
    <div style={{ padding: "10px 16px 4px", display: "flex", flexDirection: "column", gap: 10 }}>
      {rows.map((r) => (
        <Tooltip key={r.key} title={r.tip} placement="right">
          <div
            role="button"
            tabIndex={0}
            onClick={() => moBangGoi()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") moBangGoi();
            }}
            style={{ display: "block", color: "inherit", cursor: "pointer" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: V.textSub }}>
              <span>{r.label}</span>
              <span style={{ color: r.percent >= 80 ? barColor(r.percent) : V.textFaint }}>{r.detail}</span>
            </div>
            <div style={{ marginTop: 5 }}>
              <Bar row={r} />
            </div>
          </div>
        </Tooltip>
      ))}
    </div>
  );
}
