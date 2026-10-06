"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { App, Button, Modal, Progress, Tag, Tooltip } from "antd";
import { CrownOutlined, ReloadOutlined } from "@ant-design/icons";
import Link from "next/link";
import type { MeSubscription, PlanCatalogEntry, PlanId, CreatePaymentResponse } from "@larkwave/shared";
import { V, useI18n, formatBytes, STORAGE_COLORS, STORAGE_COLOR_FALLBACK } from "@larkwave/ui";
import { api } from "@/lib/api";
import { FANPAGE_URL, PLAN_ACCENT, POPULAR_PLAN, formatVnd, tenGoi } from "@/lib/billing";
import { formatTokens, refPercent } from "@/lib/formatTokens";
import { onMoBangGoi, type LyDoMoGoi } from "@/lib/planModal";
import { emitGoiChanged } from "@/lib/appEvents";
import CheckoutModal from "@/components/CheckoutModal";

/** Cùng ngưỡng màu với SidebarQuotas và UsageWidget — ba chỗ không được nói khác nhau. */
function mauThanh(percent: number): string {
  if (percent >= 100) return "#EF4444";
  if (percent >= 80) return "#F59E0B";
  return "#6C5CE7";
}

/** `api.storageUsage()` trả về một kiểu VÔ DANH, không có tên trong @larkwave/shared — lấy ngay
 *  từ chữ ký của nó để hai bên không bao giờ lệch. */
type DungLuong = Awaited<ReturnType<typeof api.storageUsage>>;

const BAC: Record<string, number> = { free: 0, starter: 1, pro: 2, enterprise: 3 };
const bacCua = (p?: string | null): number => BAC[String(p ?? "free")] ?? 0;


/** Một dòng hạn mức trong phần trên của bảng. */
function DongHanMuc({
  nhan,
  chiTiet,
  percent,
  unlimited,
  refPct,
  mix,
}: {
  nhan: string;
  chiTiet: string;
  percent: number;
  unlimited?: boolean;
  refPct?: number;
  mix?: { key: string; color: string; pct: number }[];
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <span style={{ fontSize: 13, color: V.text }}>{nhan}</span>
        <span
          style={{
            fontSize: 13,
            fontVariantNumeric: "tabular-nums",
            color: !unlimited && percent >= 80 ? mauThanh(percent) : V.textSub,
          }}
        >
          {chiTiet}
        </span>
      </div>
      <div style={{ marginTop: 6 }}>
        {unlimited ? (
          mix?.length ? (
            <div className="tw-bar-mix">
              {mix.map((m) => (
                <i key={m.key} style={{ width: `${m.pct}%`, background: m.color }} />
              ))}
            </div>
          ) : (
            <div className="tw-bar-unl">
              <i style={{ width: `${Math.min(100, Math.max(4, refPct ?? 0))}%` }} />
            </div>
          )
        ) : (
          <Progress
            percent={Math.min(100, percent)}
            showInfo={false}
            size="small"
            strokeColor={mauThanh(percent)}
            style={{ margin: 0 }}
          />
        )}
      </div>
    </div>
  );
}

/** Một thẻ gói trong lưới chọn gói. Gọn hơn thẻ ở /pricing vì đây là bảng trong app. */
function TheGoi({
  goi,
  dangDung,
  giaPhaiTra,
  giaGoc,
  dangCho,
  nhanNut,
  onChon,
  t,
}: {
  goi: PlanCatalogEntry;
  dangDung: boolean;
  /** Số tiền thực sự phải trả bây giờ (đã trừ khuyến mại / đã chia theo chu kỳ còn lại). */
  giaPhaiTra: number;
  /** Giá tháng đầy đủ, chỉ để gạch ngang khi số phải trả thấp hơn. */
  giaGoc: number;
  dangCho: boolean;
  nhanNut: string;
  onChon: () => void;
  t: (k: string, d: string) => string;
}) {
  const accent = PLAN_ACCENT[goi.id] ?? "#6C5CE7";
  const phoBien = goi.id === POPULAR_PLAN && !dangDung;
  return (
    <div
      style={{
        position: "relative",
        border: `1px solid ${dangDung ? accent : V.border}`,
        background: dangDung ? `color-mix(in srgb, ${accent} 7%, transparent)` : V.surface,
        borderRadius: 12,
        padding: "12px 12px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minWidth: 0,
      }}
    >
      {phoBien ? (
        <Tag
          color={accent}
          style={{ position: "absolute", top: -9, right: 8, margin: 0, fontSize: 10, lineHeight: "16px" }}
        >
          {t("money.popular", "Phổ biến")}
        </Tag>
      ) : null}
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        <i style={{ width: 8, height: 8, borderRadius: 999, background: accent, flex: "0 0 auto" }} />
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: V.text,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {tenGoi(t, goi.id, goi.label)}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 17, fontWeight: 700, color: V.text, fontVariantNumeric: "tabular-nums" }}>
          {giaPhaiTra > 0 ? formatVnd(giaPhaiTra) : t("wcomp.planFree", "Miễn phí")}
        </span>
        {giaGoc > giaPhaiTra && giaPhaiTra > 0 ? (
          <span style={{ fontSize: 11.5, color: V.textFaint, textDecoration: "line-through" }}>
            {formatVnd(giaGoc)}
          </span>
        ) : null}
        {goi.priceVnd > 0 ? (
          <span style={{ fontSize: 11, color: V.textFaint }}>{t("money.perMonth", "/tháng")}</span>
        ) : null}
      </div>
      {dangDung ? (
        <Button size="small" block disabled>
          {t("money.currentPlan", "Gói hiện tại")}
        </Button>
      ) : (
        <Button
          size="small"
          block
          type={phoBien ? "primary" : "default"}
          loading={dangCho}
          onClick={onChon}
        >
          {nhanNut}
        </Button>
      )}
    </div>
  );
}

/**
 * Bảng "Gói & mức dùng" — mở được từ bất kỳ đâu qua `moBangGoi()`.
 *
 * VÌ SAO LÀ MỘT BẢNG TRONG APP, KHÔNG PHẢI MỘT TRANG
 *
 * Trang /pricing cố ý là trang TIẾP THỊ nền tối, không mặc vỏ dashboard (quyết định 24/09/2026),
 * và mục "Gói & Thanh toán" cũng đã được bỏ khỏi thanh bên. Nhưng người đang dùng app cần hai
 * việc rất khác việc đọc bảng giá: xem mình còn bao nhiêu, và nâng gói mà KHÔNG rời việc đang
 * làm. Trước đây cả hai đều dẫn tới `router.push('/pricing')` ở bảy chỗ trong mã — kể cả lúc họ
 * vừa bấm dựng app và gặp lỗi 402, tức bị ném ra khỏi bảng điều khiển đúng lúc đang làm việc.
 *
 * Thanh bên vẫn giữ hai thanh mỏng như cũ — chúng trả lời "còn bao nhiêu" trong một cái liếc.
 * Bảng này là phần còn lại: tên gói, ngày làm mới, dung lượng theo nhóm, số site đang chạy, và
 * lưới chọn gói với đúng số tiền phải trả.
 *
 * BỐN ĐIỀU KHÔNG ĐƯỢC PHÁ
 *
 *  1. KHÔNG hiện số token thô cho người dùng thường. Quy ước ghi trong `plans.ts` và
 *     `packages/shared`: người dùng chỉ thấy PHẦN TRĂM. Ngoại lệ duy nhất là tài khoản không
 *     giới hạn (admin) — phần trăm vô nghĩa với họ nên hiện số đã dùng.
 *  2. KHÔNG vẽ thanh tiến trình cho "site đang chạy". `getPlanMaxLiveApps` ở billing.service
 *     KHÔNG có một chỗ gọi nào, tức trần đó chưa được thực thi ở đâu cả — vẽ thành thanh là hiển
 *     thị một giới hạn không tồn tại. Đo 24/09/2026: một tài khoản gói miễn phí (trần ghi là 1)
 *     đang có 2 site live. Nên chỗ này là một con số kèm chú thích, không phải một hàng rào.
 *  3. KHÔNG nói "hết hạn ngày X" hay "tự động gia hạn". Không có gì trong hệ thống hạ gói khi
 *     hết chu kỳ, và `resetAt` là mốc làm mới HẠN MỨC, không phải ngày hết hạn gói.
 *  4. Nâng gói PHẢI đi qua `POST /payments/create`. `POST /me/plan` ném 403 cho mọi lần nâng gói
 *     trả phí — nó chỉ dùng để HẠ gói.
 */
export default function PlanModal() {
  const { t } = useI18n();
  const { message, modal } = App.useApp();
  const [open, setOpen] = useState(false);
  const [lyDo, setLyDo] = useState<LyDoMoGoi>("tu-nguoi-dung");
  const [sub, setSub] = useState<MeSubscription | null>(null);
  const [kho, setKho] = useState<DungLuong | null>(null);
  const [dangTai, setDangTai] = useState(false);
  const [loiTai, setLoiTai] = useState(false);
  const [dangCho, setDangCho] = useState<PlanId | null>(null);
  const [thanhToan, setThanhToan] = useState<CreatePaymentResponse | null>(null);
  const [thanhToanMo, setThanhToanMo] = useState(false);
  const [nhanThanhToan, setNhanThanhToan] = useState("");
  const [lienHeMo, setLienHeMo] = useState(false);
  const daTai = useRef(false);

  /**
   * Tải khi MỞ, không tải lúc gắn.
   *
   * Ba chỗ khác đã tự gọi `api.subscription()` mỗi lần mở một trang (SidebarQuotas, UsageWidget,
   * HomeDashboard). Gắn thêm một lần gọi thường trực nữa là lần thứ tư cho một con số mà người
   * dùng chưa hỏi. Và KHÔNG ghi null lên dữ liệu tốt cuối cùng: API có thể chết 30-60s giữa lúc
   * deploy, lúc đó thà hiện số cũ còn hơn hiện khung rỗng.
   */
  const tai = useCallback(async () => {
    setDangTai(true);
    setLoiTai(false);
    const [s, k] = await Promise.all([
      api.subscription().catch(() => null),
      api.storageUsage().catch(() => null),
    ]);
    if (s) setSub(s);
    if (k) setKho(k);
    if (!s) setLoiTai(true);
    setDangTai(false);
    daTai.current = true;
  }, []);

  useEffect(
    () =>
      onMoBangGoi((ld) => {
        setLyDo(ld);
        setOpen(true);
        void tai();
      }),
    [tai],
  );

  const catalog = sub?.catalog ?? [];
  const goiMienPhiBat = sub?.freePlanEnabled !== false;

  /**
   * Chọn một gói. Ba nhánh, đúng như luồng ở /pricing — và phải đúng, vì máy chủ ràng buộc chặt:
   * hạ gói đi `POST /me/plan`, nâng gói đi `POST /payments/create`, còn gói miễn phí thì không có
   * gì để thanh toán nên dẫn sang liên hệ.
   */
  const chon = async (planId: PlanId) => {
    if (bacCua(planId) < bacCua(sub?.plan)) {
      if (planId === "free" && !goiMienPhiBat) {
        message.info(t("money.freePaused", "Gói miễn phí đang tạm ngưng. Vui lòng chọn một gói trả phí."));
        return;
      }
      const nhan = tenGoi(t, planId, catalog.find((c) => c.id === planId)?.label ?? planId);
      modal.confirm({
        title: t("money.downgrade", "Hạ gói"),
        content: `${t("money.downgradeConfirm1", "Chuyển xuống gói")} ${nhan}? ${t(
          "money.downgradeConfirm2",
          "Bạn sẽ áp dụng quyền lợi gói mới (không hoàn tiền chu kỳ hiện tại).",
        )}`,
        okText: t("money.downgrade", "Hạ gói"),
        cancelText: t("money.cancel", "Huỷ"),
        onOk: async () => {
          setDangCho(planId);
          try {
            const res = await api.setPlan(planId);
            setSub(res);
            emitGoiChanged();
            message.success(`${t("money.switchedTo", "Đã chuyển sang gói")} ${nhan}.`);
          } catch (e) {
            message.error((e as Error).message);
          } finally {
            setDangCho(null);
          }
        },
      });
      return;
    }
    if (planId === "free") {
      if (!goiMienPhiBat) {
        message.info(t("money.freePaused", "Gói miễn phí đang tạm ngưng. Vui lòng chọn một gói trả phí."));
        return;
      }
      setLienHeMo(true);
      return;
    }
    // Mở modal thanh toán NGAY ở trạng thái chờ và xoá đơn cũ trước khi gọi máy chủ: đổi gói hai
    // lần liên tiếp mà không xoá thì người dùng thấy mã QR của gói TRƯỚC.
    setNhanThanhToan(tenGoi(t, planId, catalog.find((c) => c.id === planId)?.label ?? ""));
    setThanhToan(null);
    setThanhToanMo(true);
    setDangCho(planId);
    try {
      const res = await api.createPayment(planId);
      // Máy chủ chưa cấu hình ngân hàng → một mã QR vô dụng còn tệ hơn là không có. Rơi về liên hệ.
      if (!res.bank?.account || !res.qrUrl) {
        setThanhToanMo(false);
        setLienHeMo(true);
        return;
      }
      setThanhToan(res);
    } catch (e) {
      setThanhToanMo(false);
      message.error((e as Error).message);
    } finally {
      setDangCho(null);
    }
  };

  const tieuDe = (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <CrownOutlined style={{ color: PLAN_ACCENT[sub?.plan ?? "free"] ?? "#6C5CE7" }} />
      <span>{t("money.planPanelTitle", "Gói & mức dùng")}</span>
    </div>
  );

  const ngayLamMoi = sub?.resetAt ? new Date(sub.resetAt).toLocaleDateString("vi-VN") : null;

  return (
    <>
      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        title={tieuDe}
        width={620}
        footer={null}
        destroyOnHidden
        styles={{ body: { paddingTop: 4 } }}
      >
        {/* Vì sao bảng được mở: mở do hết hạn mức thì câu đầu tiên phải trả lời đúng việc đó,
            chứ không bắt người dùng tự suy từ một thanh màu đỏ. */}
        {lyDo !== "tu-nguoi-dung" ? (
          <div
            style={{
              margin: "8px 0 14px",
              padding: "8px 11px",
              borderRadius: 10,
              border: `1px solid ${V.border}`,
              background: V.surfaceAlt,
              fontSize: 12.5,
              color: V.text,
            }}
          >
            {lyDo === "tat-goi-mien-phi"
              ? t("money.freePausedLong", "Gói miễn phí hiện đang tạm ngưng — vui lòng chọn một gói trả phí ở trên.")
              : t("money.panelWhyQuota", "Bạn đã dùng hết hạn mức tháng này. Nâng gói để tiếp tục làm việc ngay.")}
          </div>
        ) : null}

        {loiTai && !sub ? (
          <div style={{ padding: "18px 0", textAlign: "center" }}>
            <div style={{ fontSize: 13, color: V.textSub, marginBottom: 10 }}>
              {t("money.pricingLoadFailed", "Không tải được bảng giá — thử lại")}
            </div>
            <Button icon={<ReloadOutlined />} loading={dangTai} onClick={() => void tai()}>
              {t("money.retry", "Thử lại")}
            </Button>
          </div>
        ) : null}

        {sub ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              <Tag color={PLAN_ACCENT[sub.plan] ?? "#6C5CE7"} style={{ margin: 0 }}>
                {tenGoi(t, sub.plan, sub.planLabel)}
              </Tag>
              {sub.unlimited ? (
                <span style={{ fontSize: 12, color: V.textSub }}>
                  {t("money.unlimitedAccount", "Tài khoản không giới hạn")}
                </span>
              ) : ngayLamMoi ? (
                <span style={{ fontSize: 12, color: V.textSub }}>
                  {t("money.renewsOn", "Làm mới vào")} {ngayLamMoi}
                </span>
              ) : (
                <span style={{ fontSize: 12, color: V.textFaint }}>
                  {t("money.noCycleYet", "Chu kỳ bắt đầu từ lần dựng đầu tiên")}
                </span>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <DongHanMuc
                nhan={sub.unlimited ? t("nav.usageAi", "Mức dùng AI") : t("nav.quotaAi", "Hạn mức AI")}
                chiTiet={sub.unlimited ? `${formatTokens(sub.tokensUsed)} token` : `${sub.percentUsed}%`}
                percent={sub.percentUsed}
                unlimited={sub.unlimited}
                refPct={refPercent(sub.tokensUsed, sub.tokensLimit)}
              />
              {kho ? (
                <DongHanMuc
                  nhan={t("nav.quotaStorage", "Dung lượng")}
                  chiTiet={
                    kho.unlimited
                      ? formatBytes(kho.totalBytes)
                      : `${formatBytes(kho.totalBytes)} / ${formatBytes(kho.quotaBytes)}`
                  }
                  percent={kho.percentUsed}
                  unlimited={kho.unlimited}
                  mix={
                    kho.unlimited && kho.totalBytes > 0
                      ? kho.buckets
                          .filter((b) => b.bytes > 0)
                          .map((b) => ({
                            key: b.category,
                            color: STORAGE_COLORS[b.category] ?? STORAGE_COLOR_FALLBACK,
                            pct: (b.bytes / kho.totalBytes) * 100,
                          }))
                      : undefined
                  }
                />
              ) : null}
              {/* Số site đang chạy: một CON SỐ, không phải thanh. Trần này chưa được thực thi ở
                  đâu trong máy chủ (xem chú thích đầu tệp), nên vẽ thành hàng rào là nói sai. */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
                <span style={{ fontSize: 13, color: V.text }}>
                  {t("money.liveSites", "Website đang chạy")}
                </span>
                <Tooltip title={t("money.liveSitesTip", "Số website của bạn đang ở trạng thái chạy thật.")}>
                  <span style={{ fontSize: 13, color: V.textSub, fontVariantNumeric: "tabular-nums" }}>
                    {sub.liveApps}
                  </span>
                </Tooltip>
              </div>
            </div>

            <div
              style={{
                margin: "16px 0 10px",
                paddingTop: 12,
                borderTop: `1px solid ${V.borderSub}`,
                fontSize: 12.5,
                color: V.textSub,
              }}
            >
              {t("money.pickPlan", "Chọn gói")}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(128px, 1fr))",
                gap: 10,
              }}
            >
              {catalog.map((g) => {
                const bao = sub.upgrade?.[g.id];
                const giaThang = g.discountedVnd ?? g.priceVnd;
                // Nâng gói giữa chu kỳ: chỉ trả phần chênh nhân thời gian còn lại. Con số này do
                // MÁY CHỦ tính (`upgrade[planId]`) — không tự tính lại ở client, vì SePay khớp
                // đúng số tiền để tự duyệt.
                const phaiTra = bao ? bao.amountVnd : giaThang;
                return (
                  <TheGoi
                    key={g.id}
                    goi={g}
                    t={t}
                    dangDung={g.id === sub.plan}
                    giaPhaiTra={phaiTra}
                    giaGoc={bao ? bao.fullVnd : g.priceVnd}
                    dangCho={dangCho === g.id}
                    nhanNut={
                      bacCua(g.id) < bacCua(sub.plan)
                        ? t("money.downgrade", "Hạ gói")
                        : t("money.upgrade", "Nâng cấp")
                    }
                    onChon={() => void chon(g.id)}
                  />
                );
              })}
            </div>

            <div
              style={{
                marginTop: 14,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                fontSize: 12.5,
              }}
            >
              <Link href="/pricing" onClick={() => setOpen(false)} style={{ color: "#6C5CE7" }}>
                {t("money.seeFullCompare", "Xem bảng so sánh đầy đủ →")}
              </Link>
              <Link href="/storage" onClick={() => setOpen(false)} style={{ color: V.textSub }}>
                {t("money.manageStorage", "Quản lý dung lượng")}
              </Link>
            </div>
          </>
        ) : null}
      </Modal>

      <CheckoutModal
        open={thanhToanMo}
        payment={thanhToan}
        planLabel={nhanThanhToan}
        onClose={() => setThanhToanMo(false)}
        onActivated={() => {
          void tai();
          emitGoiChanged();
        }}
      />

      <Modal
        open={lienHeMo}
        onCancel={() => setLienHeMo(false)}
        title={t("money.activatePlan", "Kích hoạt gói")}
        footer={[
          <Button key="dong" onClick={() => setLienHeMo(false)}>
            {t("money.close", "Đóng")}
          </Button>,
          <Button key="fanpage" type="primary" href={FANPAGE_URL} target="_blank" rel="noopener noreferrer">
            {t("money.messageFanpage", "Nhắn fanpage")}
          </Button>,
        ]}
        destroyOnHidden
      >
        <div style={{ fontSize: 13, color: V.text }}>
          {t(
            "money.activateHelp",
            "Nhắn cho fanpage Larkwave để được kích hoạt gói giúp bạn. Bên mình trả lời trong giờ làm việc.",
          )}
        </div>
      </Modal>
    </>
  );
}
