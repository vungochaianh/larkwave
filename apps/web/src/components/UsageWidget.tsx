"use client";

import { CrownOutlined, RiseOutlined, SafetyOutlined } from "@ant-design/icons";
import { tenGoi } from "@/lib/billing";
import { Card, Progress, Skeleton, Tag, Typography } from "antd";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { MeSubscription } from "@larkwave/shared";
import { useI18n } from "@larkwave/ui";
import { formatTokens, refPercent } from "@/lib/formatTokens";
import { api } from "@/lib/api";
import { BRAND, CARD_SHADOW } from "@/lib/theme";

const { Text } = Typography;

/** Pick a progress colour from the percent of the monthly plan used (0–100). */
function quotaColor(percent: number): string {
  if (percent >= 100) return "#EF4444"; // at/over the limit → red
  if (percent >= 80) return "#F59E0B"; // near the limit → amber
  return BRAND;
}

function ResetHint({ resetAt }: { resetAt: string | null }) {
  const { t } = useI18n();
  if (!resetAt) return null;
  const d = new Date(resetAt);
  if (Number.isNaN(d.getTime())) return null;
  const label = d.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return (
    <Text type="secondary" style={{ fontSize: 12 }}>
      {t("wcomp.usageResetOn", "Làm mới vào")} {label}
    </Text>
  );
}

/**
 * Shared subscription/quota usage indicator.
 *
 * - `variant="card"` — full card (used near the top of /profile).
 * - `variant="inline"` — compact one-liner (used on the dashboard home).
 *
 * Admins (unlimited) see "Không giới hạn (Admin)". When near/over the limit
 * the progress bar turns amber/red.
 */
export default function UsageWidget({
  variant = "card",
  sub: subProp,
}: {
  variant?: "card" | "inline";
  /** Pass a preloaded subscription to skip the internal fetch. */
  sub?: MeSubscription | null;
}) {
  const { t } = useI18n();
  const [sub, setSub] = useState<MeSubscription | null>(subProp ?? null);
  const [loading, setLoading] = useState(subProp === undefined);

  useEffect(() => {
    if (subProp !== undefined) {
      setSub(subProp);
      setLoading(false);
      return;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const delays = [1500, 3000, 6000, 10000]; // backoff while the API is down (deploy)
    let attempt = 0;

    const load = () => {
      api
        .subscription()
        .then((res) => {
          if (!active) return;
          setSub(res);
          setLoading(false);
        })
        .catch(() => {
          if (!active) return;
          // Transient failure (API restarting mid-deploy): DON'T overwrite the
          // last-known-good subscription with null — keep showing it and retry
          // with backoff so the indicator self-heals once the API returns.
          if (attempt < delays.length) {
            timer = setTimeout(load, delays[attempt]);
            attempt += 1;
          } else {
            setLoading(false);
          }
        });
    };
    load();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [subProp]);

  // ── Inline (dashboard) ────────────────────────────────────────────────────
  if (variant === "inline") {
    if (loading) {
      return <Skeleton.Button active size="small" style={{ width: 220 }} />;
    }
    if (!sub) return null;

    if (sub.unlimited) {
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span className="tw-bar-unl" style={{ width: 88, flex: "0 0 auto" }}>
            <i style={{ width: `${Math.min(100, Math.max(6, refPercent(sub.tokensUsed, sub.tokensLimit)))}%` }} />
          </span>
          <Tag icon={<SafetyOutlined />} color="purple" style={{ margin: 0 }}>
            {t("wcomp.usageUnlimitedAdmin", "Không giới hạn (Admin)")}
          </Tag>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {t("wcomp.usagePlanPrefix", "Gói")} {tenGoi(t, sub.plan, sub.planLabel)} ·{" "}
            {t("wcomp.usageUsedPrefix", "đã dùng")} {formatTokens(sub.tokensUsed)} token
          </Text>
        </div>
      );
    }

    const color = quotaColor(sub.percentUsed);

    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Tag color="purple" style={{ margin: 0 }}>
          {tenGoi(t, sub.plan, sub.planLabel)}
        </Tag>
        <Text style={{ fontSize: 13, color: "#1E2230" }}>
          {t("wcomp.usageUsed", "Đã dùng")}{" "}
          <Text strong style={{ color }}>
            {sub.percentUsed}%
          </Text>{" "}
          {t("wcomp.usageOfMonthlyPlan", "gói tháng này")}
        </Text>
        <Progress
          percent={sub.percentUsed}
          showInfo={false}
          strokeColor={color}
          size="small"
          style={{ width: 120, margin: 0 }}
        />
        <Link href="/pricing" style={{ fontWeight: 600, fontSize: 13 }}>
          {t("wcomp.usageUpgrade", "Nâng gói")} <RiseOutlined style={{ fontSize: 11 }} />
        </Link>
      </div>
    );
  }

  // ── Card (profile) ────────────────────────────────────────────────────────
  return (
    <Card styles={{ body: { padding: 20 } }} style={{ boxShadow: CARD_SHADOW }}>
      {loading ? (
        <Skeleton active paragraph={{ rows: 2 }} />
      ) : !sub ? (
        <Text type="secondary">{t("wcomp.usageLoadFailed", "Không tải được thông tin gói.")}</Text>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span
                style={{
                  display: "inline-flex",
                  width: 44,
                  height: 44,
                  minWidth: 44,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 20,
                  background: "rgba(108,92,231,0.12)",
                  color: BRAND,
                }}
              >
                <CrownOutlined />
              </span>
              <div>
                <Text type="secondary" style={{ fontSize: 12.5 }}>
                  {t("wcomp.usageCurrentPlan", "Gói hiện tại")}
                </Text>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#1E2230" }}>
                  {tenGoi(t, sub.plan, sub.planLabel)}
                </div>
              </div>
            </div>
            <Link href="/pricing">
              <span style={{ color: BRAND, fontWeight: 600, fontSize: 13.5 }}>
                {t("wcomp.usageUpgrade", "Nâng gói")} <RiseOutlined style={{ fontSize: 11 }} />
              </span>
            </Link>
          </div>

          {sub.unlimited ? (
            /* Không bị chặn KHÔNG có nghĩa là không cần biết mình dùng bao nhiêu. */
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <Tag
                icon={<SafetyOutlined />}
                color="purple"
                style={{ margin: 0, padding: "4px 12px" }}
              >
                {t("wcomp.usageUnlimitedAdmin", "Không giới hạn (Admin)")}
              </Tag>
              <Text style={{ fontSize: 13.5, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                {formatTokens(sub.tokensUsed)} token
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t("wcomp.usageThisCycle", "chu kỳ này")}
              </Text>
              {/* Thanh vẫn có mặt cho thẻ trông trọn vẹn, nhưng mép nhoè để không ai đọc thành
                  "đã hết hạn mức" — tài khoản này không có trần nào để hết. */}
              <div className="tw-bar-unl" style={{ width: "100%", marginTop: 2 }}>
                <i style={{ width: `${Math.min(100, Math.max(6, refPercent(sub.tokensUsed, sub.tokensLimit)))}%` }} />
              </div>
            </div>
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <Text style={{ fontSize: 13.5, color: "#1E2230" }}>
                  {t("wcomp.usageUsed", "Đã dùng")}{" "}
                  <Text strong style={{ color: quotaColor(sub.percentUsed) }}>
                    {sub.percentUsed}%
                  </Text>{" "}
                  {t("wcomp.usageOfMonthlyPlan", "gói tháng này")}
                </Text>
                <ResetHint resetAt={sub.resetAt} />
              </div>
              <Progress
                percent={sub.percentUsed}
                showInfo={false}
                strokeColor={quotaColor(sub.percentUsed)}
              />
            </>
          )}
        </div>
      )}
    </Card>
  );
}
