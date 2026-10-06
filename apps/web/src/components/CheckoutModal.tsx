"use client";

import {
  BankOutlined,
  CheckCircleFilled,
  CopyOutlined,
  FacebookFilled,
  LoadingOutlined,
} from "@ant-design/icons";
import {
  App,
  Button,
  Divider,
  Modal,
  Spin,
  Tag,
  Typography,
} from "antd";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { CreatePaymentResponse } from "@larkwave/shared";
import { useI18n } from "@larkwave/ui";
import { api } from "@/lib/api";
import { FANPAGE_URL, formatVnd } from "@/lib/billing";
import { BRAND } from "@/lib/theme";

const { Text, Paragraph } = Typography;

/** Poll interval for the payment-status check (ms). */
const POLL_MS = 4000;

/** A copyable value row: a label, the value (monospace), and a copy button. */
function CopyRow({
  label,
  value,
  display,
  highlight,
  big,
}: {
  label: string;
  value: string;
  display?: string;
  highlight?: boolean;
  big?: boolean;
}) {
  const { t } = useI18n();
  const { message } = App.useApp();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      message.success(`${t("wcomp.coCopied", "Đã sao chép")} ${label.toLowerCase()}`);
    } catch {
      message.error(t("wcomp.coCopyFailed", "Không sao chép được"));
    }
  };
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 14px",
        borderRadius: 12,
        border: highlight
          ? `1.5px solid ${BRAND}`
          : "1px solid #ECEDF3",
        background: highlight ? "rgba(108,92,231,0.06)" : "#FAFAFE",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "#6B7280" }}>{label}</div>
        <div
          style={{
            fontWeight: 700,
            fontSize: big ? 22 : 15,
            color: highlight ? BRAND : "#1E2230",
            fontFamily: highlight
              ? "ui-monospace, SFMono-Regular, Menlo, monospace"
              : undefined,
            letterSpacing: highlight ? 1 : undefined,
            wordBreak: "break-all",
          }}
        >
          {display ?? value}
        </div>
      </div>
      <Button
        icon={<CopyOutlined />}
        onClick={copy}
        type={highlight ? "primary" : "default"}
        size="small"
        style={{ flexShrink: 0 }}
      >
        {t("wcomp.coCopy", "Sao chép")}
      </Button>
    </div>
  );
}

/**
 * SePay bank-transfer checkout modal.
 *
 * Shows the VietQR image + bank/account/amount/memo, then polls
 * `GET /payments/:id` every 4s until the SePay webhook flips the payment to
 * `paid`. On success it refreshes the subscription (via `onActivated`) and
 * offers a "Về trang chủ" button.
 *
 * Poll is cleared on close / unmount.
 */
export default function CheckoutModal({
  open,
  payment,
  planLabel,
  onClose,
  onActivated,
}: {
  open: boolean;
  payment: CreatePaymentResponse | null;
  /** Plan label shown instantly while the payment intent is still being created. */
  planLabel?: string;
  onClose: () => void;
  /** Called once after the payment is confirmed paid (refresh subscription). */
  onActivated?: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [paid, setPaid] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activatedRef = useRef(false);

  const paymentId = payment?.paymentId ?? null;

  useEffect(() => {
    // Reset paid + image state whenever a fresh payment intent opens.
    if (open && paymentId) {
      setPaid(false);
      setImgLoaded(false);
      activatedRef.current = false;
    }
  }, [open, paymentId]);

  useEffect(() => {
    if (!open || !paymentId || paid) return;

    let cancelled = false;
    const check = async () => {
      try {
        const res = await api.paymentStatus(paymentId);
        if (cancelled) return;
        if (res.status === "paid") {
          setPaid(true);
          if (!activatedRef.current) {
            activatedRef.current = true;
            onActivated?.();
          }
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
        }
      } catch {
        // Transient errors are ignored — keep polling.
      }
    };

    timerRef.current = setInterval(check, POLL_MS);
    void check(); // immediate first check

    return () => {
      cancelled = true;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [open, paymentId, paid, onActivated]);

  const close = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onCancel={close}
      footer={null}
      width={480}
      maskClosable={false}
      title={
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <BankOutlined style={{ color: BRAND }} />
          {t("wcomp.coPayForPlan", "Thanh toán gói")} {payment?.planLabel ?? planLabel ?? ""}
        </span>
      }
    >
      {!payment ? (
        <div style={{ padding: "40px 0", textAlign: "center" }}>
          <Spin
            indicator={<LoadingOutlined style={{ fontSize: 30, color: BRAND }} spin />}
          />
          <div style={{ marginTop: 14, color: "#6B7280" }}>
            {t("wcomp.coCreatingOrder", "Đang tạo đơn thanh toán…")}
          </div>
        </div>
      ) : paid ? (
        <PaidView
          planLabel={payment.planLabel}
          onHome={() => {
            close();
            router.push("/");
          }}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* VietQR image — the trust anchor */}
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                display: "inline-block",
                padding: 10,
                borderRadius: 16,
                background: "#fff",
                border: "1px solid #ECEDF3",
                boxShadow: "0 4px 16px rgba(17,24,39,0.06)",
              }}
            >
              {/* Third-party VietQR render — plain img (host not configured
                  for next/image). The compact2 template is PORTRAIT (~540×680),
                  so fix the width and let height scale to avoid squishing. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <div
                style={{
                  position: "relative",
                  minWidth: 230,
                  minHeight: imgLoaded ? undefined : 300,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {!imgLoaded && (
                  <Spin
                    indicator={
                      <LoadingOutlined style={{ fontSize: 26, color: BRAND }} spin />
                    }
                  />
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={payment.qrUrl}
                  alt={t("wcomp.coQrAlt", "VietQR thanh toán")}
                  loading="eager"
                  onLoad={() => setImgLoaded(true)}
                  style={{
                    display: imgLoaded ? "block" : "none",
                    width: 230,
                    height: "auto",
                    maxWidth: "100%",
                    borderRadius: 8,
                  }}
                />
              </div>
            </div>
            <div style={{ marginTop: 6 }}>
              <Text type="secondary" style={{ fontSize: 12.5 }}>
                {t("wcomp.coScanHint", "Quét mã bằng app ngân hàng để chuyển nhanh")}
              </Text>
            </div>
          </div>

          {/* Bank + account + holder */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "8px 14px",
                borderRadius: 12,
                background: "#FAFAFE",
                border: "1px solid #ECEDF3",
              }}
            >
              <div>
                <div style={{ fontSize: 12, color: "#6B7280" }}>{t("wcomp.coBank", "Ngân hàng")}</div>
                <div style={{ fontWeight: 600, color: "#1E2230" }}>
                  {payment.bank.name}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, color: "#6B7280" }}>{t("wcomp.coAccountHolder", "Chủ tài khoản")}</div>
                <div style={{ fontWeight: 600, color: "#1E2230" }}>
                  {payment.bank.holder}
                </div>
              </div>
            </div>

            <CopyRow
              label={t("wcomp.coAccountNumber", "Số tài khoản")}
              value={payment.bank.account}
            />
            <CopyRow
              label={t("wcomp.coAmount", "Số tiền")}
              value={String(payment.amountVnd)}
              display={formatVnd(payment.amountVnd)}
              big
            />
            <CopyRow
              label={t("wcomp.coTransferContent", "Nội dung chuyển khoản")}
              value={payment.transferContent}
              highlight
            />
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              fontSize: 12.5,
              color: "#B45309",
              background: "rgba(245,158,11,0.10)",
              border: "1px solid rgba(245,158,11,0.30)",
              borderRadius: 10,
              padding: "8px 12px",
            }}
          >
            <span>⚠️</span>
            <span>
              {t("wcomp.coPleaseWrite", "Vui lòng ghi")}{" "}
              <Text strong>{t("wcomp.coExactContent", "ĐÚNG nội dung")}</Text>{" "}
              <Text strong style={{ color: BRAND }}>
                {payment.transferContent}
              </Text>{" "}
              {t("wcomp.coForAutoActivate", "để hệ thống kích hoạt tự động.")}
            </span>
          </div>

          {/* Waiting status line */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              padding: "10px 0 2px",
            }}
          >
            <Spin indicator={<LoadingOutlined spin style={{ fontSize: 18 }} />} />
            <Text style={{ color: "#1E2230", fontWeight: 500 }}>
              {t("wcomp.coWaitingPayment", "Đang chờ thanh toán…")}
            </Text>
          </div>
          <Text
            type="secondary"
            style={{ fontSize: 12, textAlign: "center", display: "block" }}
          >
            {t("wcomp.coAutoUpdate", "Trang sẽ tự cập nhật ngay khi nhận được chuyển khoản.")}
          </Text>

          <Divider style={{ margin: "6px 0 0" }} />
          <div style={{ textAlign: "center" }}>
            <a
              href={FANPAGE_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 12.5,
                color: "#6B7280",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <FacebookFilled style={{ color: "#1877F2" }} />
              {t("wcomp.coContactFanpage", "Hoặc liên hệ fanpage nếu cần hỗ trợ")}
            </a>
          </div>
        </div>
      )}
    </Modal>
  );
}

function PaidView({
  planLabel,
  onHome,
}: {
  planLabel: string;
  onHome: () => void;
}) {
  const { t } = useI18n();
  return (
    <div style={{ textAlign: "center", padding: "16px 4px 8px" }}>
      <CheckCircleFilled style={{ fontSize: 56, color: "#16B98D" }} />
      <Paragraph
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: "#1E2230",
          margin: "16px 0 4px",
        }}
      >
        {t("wcomp.coActivateSuccess", "Kích hoạt gói thành công!")}
      </Paragraph>
      <Paragraph type="secondary" style={{ marginBottom: 16 }}>
        {t("wcomp.coUpgradedTo", "Bạn đã được nâng cấp lên")}{" "}
        <Tag color="success" style={{ margin: 0 }}>
          {planLabel}
        </Tag>
        . {t("wcomp.coThanks", "Cảm ơn bạn đã tin dùng Larkwave.")}
      </Paragraph>
      <Button type="primary" size="large" onClick={onHome}>
        {t("wcomp.coBackHome", "Về trang chủ")}
      </Button>
    </div>
  );
}
