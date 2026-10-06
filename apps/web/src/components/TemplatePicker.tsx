"use client";

import {
  BorderOutlined,
  BulbOutlined,
  DashboardOutlined,
  FormOutlined,
  RocketOutlined,
  ShoppingOutlined,
} from "@ant-design/icons";
import { Typography } from "antd";
import type { ReactNode } from "react";
import { useI18n } from "@larkwave/ui";
import TemplateThumb, { type Layout } from "@/components/TemplateThumb";

const { Text } = Typography;

/** A layout/template preset. `value` matches the codegen `style` hint 1:1. */
export interface TemplateOption {
  value: string;
  label: string;
  desc: string;
  icon: ReactNode;
}

/** Visible template presets. `auto` (AI decides) is the default. */
export const TEMPLATES: TemplateOption[] = [
  { value: "auto", label: "Tự động", desc: "AI tự chọn theo mô tả", icon: <BulbOutlined /> },
  { value: "landing", label: "Landing", desc: "Trang giới thiệu / sản phẩm", icon: <RocketOutlined /> },
  { value: "dashboard", label: "Dashboard", desc: "Bảng điều khiển, thống kê", icon: <DashboardOutlined /> },
  { value: "form", label: "Biểu mẫu", desc: "Form nhập / khảo sát", icon: <FormOutlined /> },
  { value: "store", label: "Cửa hàng", desc: "Bán hàng, danh mục", icon: <ShoppingOutlined /> },
  { value: "minimal", label: "Tối giản", desc: "Gọn nhẹ, một mục đích", icon: <BorderOutlined /> },
];

/** Template → wireframe layout used for the live preview. */
const LAYOUT_BY_TEMPLATE: Record<string, Layout> = {
  landing: "cards",
  dashboard: "dashboard",
  form: "form",
  store: "store",
  minimal: "minimal",
};

/**
 * Prominent template/layout picker: compact selectable cards + a LIVE preview
 * ("giao diện của bạn sẽ kiểu như thế này") of the chosen template, rendered in
 * the user's accent colour. Replaces the old hidden dropdown. Bound to `style`.
 */
export default function TemplatePicker({
  value,
  onChange,
  accent = "#6C5CE7",
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Brand colour — the preview is tinted with it so it feels like "your app". */
  accent?: string;
  label?: string;
}) {
  const { t: tr } = useI18n();
  const current = value || "auto";
  const previewLayout = LAYOUT_BY_TEMPLATE[current];
  const shownLabel = label ?? tr("wcomp.tmplPickerLabel", "Mẫu giao diện");

  return (
    <div>
      <Text type="secondary" style={{ fontSize: 12.5, fontWeight: 600, display: "block", marginBottom: 8 }}>
        {shownLabel}
      </Text>
      <div
        style={{
          display: "grid",
          // auto-FIT (not auto-fill): the cards stretch to fill the row evenly instead
          // of leaving empty column tracks on wide screens (the "khoảng trống" gap).
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 10,
        }}
      >
        {TEMPLATES.map((t) => {
          const active = current === t.value;
          return (
            <button
              key={t.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(t.value)}
              className="tw-lift"
              style={{
                textAlign: "left",
                cursor: "pointer",
                padding: "12px 14px",
                minHeight: 92,
                borderRadius: 12,
                border: active ? "1.5px solid #6C5CE7" : "1px solid #ECEDF3",
                background: active ? "rgba(108,92,231,0.08)" : "#FFFFFF",
                boxShadow: active ? "0 2px 10px rgba(108,92,231,0.12)" : "none",
                transition: "border-color .12s ease, background .12s ease, box-shadow .12s ease",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <span
                style={{ fontSize: 19, lineHeight: 1, color: active ? "#6C5CE7" : "#9AA3B5" }}
              >
                {t.icon}
              </span>
              <span
                style={{ fontWeight: 600, fontSize: 13, color: active ? "#5B4FC2" : "#1E2230" }}
              >
                {tr(`wcomp.tmpl.${t.value}.label`, t.label)}
              </span>
              <span style={{ fontSize: 11.5, color: "#8A93A6", lineHeight: 1.35 }}>
                {tr(`wcomp.tmpl.${t.value}.desc`, t.desc)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Live preview of the chosen template, tinted with the user's colour. */}
      {previewLayout ? (
        <div style={{ marginTop: 12 }}>
          <Text type="secondary" style={{ fontSize: 11.5, display: "block", marginBottom: 6 }}>
            {tr("wcomp.tmplPreviewHint", "Giao diện của bạn sẽ kiểu như thế này (xem trước):")}
          </Text>
          <div
            style={{
              borderRadius: 16,
              overflow: "hidden",
              border: "1px solid #ECEDF3",
              width: "100%",
            }}
          >
            <TemplateThumb
              accent={accent}
              category=""
              track="web"
              layout={previewLayout}
              height={210}
              windowMaxWidth={680}
            />
          </div>
        </div>
      ) : (
        <div
          style={{
            marginTop: 12,
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px dashed #E4E2F7",
            background: "rgba(108,92,231,0.04)",
            fontSize: 12.5,
            color: "#6B7280",
          }}
        >
          ✨ {tr(
            "wcomp.tmplAutoHint",
            "AI sẽ tự chọn mẫu giao diện phù hợp nhất theo mô tả của bạn. Chọn một mẫu cụ thể bên trên nếu muốn xem trước & cố định bố cục.",
          )}
        </div>
      )}
    </div>
  );
}
