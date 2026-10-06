"use client";

import { ThunderboltOutlined } from "@ant-design/icons";
import { Button } from "antd";
import Link from "next/link";
import { useI18n } from "@larkwave/ui";
import { BRAND_GRADIENT } from "@/lib/theme";

/** Lightweight header for PUBLIC (unauthenticated) share pages. */
export default function PublicTopbar() {
  const { t } = useI18n();
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 20px",
        background: "rgba(255,255,255,0.86)",
        backdropFilter: "saturate(180%) blur(10px)",
        borderBottom: "1px solid #ECEDF3",
      }}
    >
      <Link
        href="/"
        style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "#1E2230" }}
      >
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: 9,
            background: BRAND_GRADIENT,
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
          }}
        >
          <ThunderboltOutlined />
        </span>
        <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: -0.3 }}>
          Larkwave
        </span>
      </Link>
      <Link href="/register">
        <Button type="primary" icon={<ThunderboltOutlined />}>
          {t("wcomp.ptTryLarkwave.lw", "Dùng thử Larkwave")}
        </Button>
      </Link>
    </div>
  );
}
