"use client";

import {
  ApiOutlined,
  BarChartOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  KeyOutlined,
  PlusOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
  WarningOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  Drawer,
  Empty,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Progress,
  Select,
  Skeleton,
  Space,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { MeSubscription } from "@larkwave/shared";
import { refPercent } from "@/lib/formatTokens";
import {
  api,
  API_BASE,
  type ApiKeyPatch,
  type ApiKeyRow,
  type ApiKeyScope,
  type ApiKeyUsage,
} from "@/lib/api";
import { CARD_SHADOW } from "@/lib/theme";
import { formatDate } from "@/lib/format";
import { BLUE, BRAND, ERR, OK, V, WARN, tint } from "@larkwave/ui";

const { Title, Text, Paragraph } = Typography;

/** Public API base (external callers). API_BASE already ends in /v1. */
const PUB = `${API_BASE}`;
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

function CodeBox({ children }: { children: string }) {
  const { message } = App.useApp();
  return (
    <div style={{ position: "relative", background: V.codeBg, color: V.codeText, border: `1px solid ${V.codeBorder}`, borderRadius: 10, padding: "12px 14px", overflowX: "auto" }}>
      <Tooltip title="Sao chép">
        <Button
          size="small"
          type="text"
          icon={<CopyOutlined />}
          onClick={() => {
            try {
              void navigator.clipboard?.writeText(children);
              message.success("Đã sao chép");
            } catch {
              /* ignore */
            }
          }}
          style={{ position: "absolute", top: 6, right: 6, color: V.textFaint }}
        />
      </Tooltip>
      {/* Chữ theo V.codeText chứ không ép màu sáng: bản cũ ép `#D6DBE7` nên ở chế độ sáng
          (nền khối mã gần trắng) chữ gần như tàng hình. */}
      <pre style={{ margin: 0, color: "inherit", fontSize: 12.5, lineHeight: 1.6, fontFamily: MONO, whiteSpace: "pre" }}>
        {children}
      </pre>
    </div>
  );
}

/**
 * Màu của một mã trạng thái HTTP. Mọi mã >= 400 đều ĐỎ chứ không phân cam/đỏ theo 4xx/5xx: yêu cầu
 * là "lỗi phải nhìn thấy ngay", và người xem báo cáo cần quét ra dòng đỏ trước rồi mới đọc số.
 */
function statusColor(s: number): string {
  if (s >= 400) return ERR;
  if (s >= 300) return BLUE;
  return OK;
}

function StatusTag({ status }: { status: number }) {
  const c = statusColor(status);
  return (
    <span style={{ display: "inline-block", minWidth: 40, textAlign: "center", padding: "1px 8px", borderRadius: 6, fontFamily: MONO, fontSize: 12, fontWeight: 700, color: c, background: tint(c), border: `1px solid ${tint(c, "55")}` }}>
      {status}
    </span>
  );
}

/** Dạng JSON đẹp nếu là JSON, không thì trả nguyên văn. */
function pretty(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/** Lấy câu `message` của máy chủ (NestJS trả `{ statusCode, message }`) để đưa lên trên cùng. */
function serverMessage(text: string): string | null {
  try {
    const o = JSON.parse(text) as { message?: string | string[] };
    if (Array.isArray(o.message)) return o.message.join(", ");
    if (typeof o.message === "string") return o.message;
  } catch {
    /* không phải JSON */
  }
  return null;
}

/** Nhãn của một quyền — lấy từ danh sách máy chủ; không có thì hiện id thô. */
function scopeLabel(scopes: ApiKeyScope[] | null, id: string): string {
  return scopes?.find((s) => s.id === id)?.label ?? id;
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Hộp thoại tạo / sửa key                                                     */
/* ────────────────────────────────────────────────────────────────────────── */

type KeyFormValues = { name: string; scopes: string[]; monthlyLimit: number | null };

/**
 * Một hộp thoại cho CẢ tạo lẫn sửa. Hai việc có cùng ba trường (tên, phạm vi, hạn mức); tách thành
 * hai hộp thoại thì sớm muộn cũng lệch nhau — ví dụ sửa lời cảnh báo ở một chỗ mà quên chỗ kia.
 */
function KeyFormModal({
  open,
  mode,
  initial,
  scopes,
  scopesError,
  onReloadScopes,
  onSubmit,
  onCancel,
}: {
  open: boolean;
  mode: "create" | "edit";
  initial: KeyFormValues;
  scopes: ApiKeyScope[] | null;
  scopesError: string | null;
  onReloadScopes: () => void;
  onSubmit: (v: KeyFormValues) => Promise<void>;
  onCancel: () => void;
}) {
  // Giá trị ban đầu chỉ đọc MỘT lần: nơi gọi đổi `key` của component mỗi lần mở, nên mở hộp "sửa"
  // key B là một lần mount mới, không còn phạm vi của key A vừa mở trước đó. (Reset bằng effect thì
  // dễ, nhưng là setState đồng bộ trong effect — vẽ hai lần và bị lint chặn.)
  const [name, setName] = useState(initial.name);
  const [picked, setPicked] = useState<string[]>(initial.scopes);
  const [limit, setLimit] = useState<number | null>(initial.monthlyLimit);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await onSubmit({ name: name.trim(), scopes: picked, monthlyLimit: limit && limit > 0 ? Math.floor(limit) : null });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      title={mode === "create" ? "Tạo API key" : "Sửa API key"}
      okText={mode === "create" ? "Tạo key" : "Lưu"}
      cancelText="Huỷ"
      confirmLoading={busy}
      onOk={() => void submit()}
      destroyOnHidden
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 8 }}>
        <div>
          <Text strong style={{ fontSize: 12.5 }}>Tên key</Text>
          <Input
            placeholder="vd: server sản xuất, script nội bộ…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            style={{ marginTop: 4 }}
            autoFocus
          />
        </div>

        <div>
          <Text strong style={{ fontSize: 12.5 }}>Quyền được gọi</Text>
          {scopes === null ? (
            scopesError ? (
              <Alert
                type="error"
                showIcon
                style={{ marginTop: 6 }}
                message="Không tải được danh sách quyền"
                description={scopesError}
                action={<Button size="small" icon={<ReloadOutlined />} onClick={onReloadScopes}>Tải lại</Button>}
              />
            ) : (
              <Skeleton active paragraph={{ rows: 3 }} title={false} style={{ marginTop: 6 }} />
            )
          ) : (
            <Checkbox.Group
              value={picked}
              onChange={(v) => setPicked(v as string[])}
              style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}
            >
              {scopes.map((s) => (
                <Checkbox key={s.id} value={s.id}>
                  <span>{s.label}</span>{" "}
                  <Text type="secondary" style={{ fontFamily: MONO, fontSize: 11.5 }}>{s.id}</Text>
                </Checkbox>
              ))}
            </Checkbox.Group>
          )}
          {/* Luật của máy chủ: phạm vi RỖNG = TOÀN QUYỀN (giữ tương thích key cũ). Nếu không nói rõ,
              người dùng bỏ tích hết với ý "khoá key này" và nhận về kết quả ngược lại. */}
          {scopes !== null && picked.length === 0 && (
            <Alert
              type="warning"
              showIcon
              icon={<WarningOutlined />}
              style={{ marginTop: 8 }}
              message="Không tích quyền nào = key có TOÀN QUYỀN"
              description="Muốn key không làm được gì nữa thì thu hồi nó. Muốn giới hạn thì tích đúng những quyền cần."
            />
          )}
        </div>

        <div>
          <Text strong style={{ fontSize: 12.5 }}>Hạn mức lượt gọi mỗi tháng</Text>
          <InputNumber
            min={1}
            step={100}
            precision={0}
            value={limit}
            onChange={(v) => setLimit(typeof v === "number" ? v : null)}
            placeholder="Để trống = không giới hạn"
            style={{ width: "100%", marginTop: 4 }}
            controls
          />
          <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 4 }}>
            Tính theo tháng dương lịch, đếm cả lượt lỗi. Vượt hạn mức thì máy chủ trả 403 cho tới đầu tháng sau.
          </Text>
        </div>
      </div>
    </Modal>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Báo cáo theo từng key                                                        */
/* ────────────────────────────────────────────────────────────────────────── */

function KeyReportDrawer({ keyId, scopes, onClose }: { keyId: string | null; scopes: ApiKeyScope[] | null; onClose: () => void }) {
  const [days, setDays] = useState(30);
  const [seq, setSeq] = useState(0);
  // Kết quả đi kèm (id, days, seq) đã hỏi. "Đang tải" = kết quả đang giữ không khớp yêu cầu hiện
  // tại — không cần xoá state trong effect, và một phản hồi cũ về muộn không đè được phản hồi mới.
  const [got, setGot] = useState<{ id: string; days: number; seq: number; data?: ApiKeyUsage; err?: string } | null>(null);

  useEffect(() => {
    if (!keyId) return;
    let alive = true;
    api
      .apiKeyUsage(keyId, days)
      .then((d) => alive && setGot({ id: keyId, days, seq, data: d }))
      .catch((e: Error) => alive && setGot({ id: keyId, days, seq, err: e.message }));
    return () => {
      alive = false;
    };
  }, [keyId, days, seq]);

  const cur = got && got.id === keyId && got.days === days && got.seq === seq ? got : null;
  const data = cur?.data ?? null;
  const err = cur?.err ?? null;
  const load = () => setSeq((n) => n + 1);

  const limit = data?.monthlyLimit ?? null;
  const pct = data && limit ? Math.min(100, Math.round((data.monthUsed / limit) * 100)) : 0;
  const bar = pct >= 100 ? ERR : pct >= 80 ? WARN : BRAND;
  const failPct = data && data.total > 0 ? Math.round((data.failed / data.total) * 100) : 0;

  return (
    <Drawer
      open={!!keyId}
      onClose={onClose}
      // Chuỗi CSS chứ không phải số: ở 380px một Drawer 560px sẽ tràn màn hình.
      width="min(600px, 100vw)"
      title={
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <BarChartOutlined /> {data ? data.name : "Báo cáo key"}
          {data && <Text type="secondary" style={{ fontFamily: MONO, fontSize: 12, fontWeight: 400 }}>{data.prefix}…</Text>}
        </span>
      }
      extra={<Button size="small" icon={<ReloadOutlined />} onClick={load}>Tải lại</Button>}
    >
      {err ? (
        <Alert type="error" showIcon message="Không tải được báo cáo" description={err} />
      ) : !data ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Tháng này so với hạn mức */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <Text strong>Tháng này</Text>
              <Text style={{ fontVariantNumeric: "tabular-nums" }}>
                <b>{data.monthUsed.toLocaleString("vi-VN")}</b>
                {limit ? ` / ${limit.toLocaleString("vi-VN")} lượt` : " lượt · không giới hạn"}
              </Text>
            </div>
            {limit ? (
              <Progress percent={pct} strokeColor={bar} status={pct >= 100 ? "exception" : undefined} />
            ) : (
              <div className="tw-bar-unl" style={{ height: 8, marginTop: 8 }}>
                <i style={{ width: `${Math.min(100, Math.max(6, refPercent(data.monthUsed, 1000)))}%` }} />
              </div>
            )}
            {pct >= 100 && (
              <Alert type="error" showIcon style={{ marginTop: 8 }} message="Key đã hết hạn mức tháng — mọi lượt gọi đang bị từ chối (403). Nâng hạn mức bằng nút Sửa." />
            )}
          </div>

          {/* Số lỗi: ĐỎ khi > 0 — đây là con số người ta mở báo cáo để xem. */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 140px), 1fr))", gap: 10 }}>
            <Stat label={`Lượt gọi ${data.windowDays} ngày`} value={data.total.toLocaleString("vi-VN")} sub="mọi mã trạng thái" color={V.text} />
            <Stat
              label="Lượt lỗi (≥ 400)"
              value={data.failed.toLocaleString("vi-VN")}
              sub={data.total > 0 ? `${failPct}% số lượt` : "chưa có lượt nào"}
              color={data.failed > 0 ? ERR : OK}
            />
            <Stat label="Quyền" value={data.scopes.length === 0 ? "Toàn quyền" : String(data.scopes.length)} sub={data.scopes.length === 0 ? "phạm vi rỗng" : data.scopes.map((s) => scopeLabel(scopes, s)).join(" · ")} color={V.text} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Text type="secondary" style={{ fontSize: 12.5 }}>Cửa sổ:</Text>
            <Select
              size="small"
              value={days}
              onChange={setDays}
              options={[7, 30, 90].map((d) => ({ value: d, label: `${d} ngày` }))}
              style={{ width: 100 }}
            />
          </div>

          {/* Tuyến đường gọi nhiều nhất */}
          <div>
            <Text strong style={{ display: "block", marginBottom: 6 }}>Tuyến đường gọi nhiều nhất</Text>
            {data.routes.length === 0 ? (
              <Text type="secondary" style={{ fontSize: 12.5 }}>Chưa có lượt gọi nào trong cửa sổ này.</Text>
            ) : (
              <div style={{ border: `1px solid ${V.border}`, borderRadius: 10, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "0 12px", padding: "6px 12px", background: V.surfaceAlt, fontSize: 11.5, color: V.textSub }}>
                  <span>Tuyến</span><span style={{ textAlign: "right" }}>Lượt</span><span style={{ textAlign: "right" }}>TB (ms)</span>
                </div>
                {data.routes.map((r) => (
                  <div key={r.route} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "0 12px", padding: "7px 12px", borderTop: `1px solid ${V.borderSub}`, fontSize: 12.5, alignItems: "center" }}>
                    <span style={{ fontFamily: MONO, overflowWrap: "anywhere" }}>{r.route}</span>
                    <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{r.count.toLocaleString("vi-VN")}</span>
                    <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: V.textSub }}>{r.avgMs.toLocaleString("vi-VN")}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Lượt gọi gần nhất — mã trạng thái là thẻ màu, không phải số trần. */}
          <div>
            <Text strong style={{ display: "block", marginBottom: 6 }}>Lượt gọi gần nhất</Text>
            {data.recent.length === 0 ? (
              <Text type="secondary" style={{ fontSize: 12.5 }}>Key này chưa được dùng.</Text>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {data.recent.map((r, i) => (
                  <div
                    key={`${r.at}-${i}`}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderRadius: 8, fontSize: 12.5, flexWrap: "wrap",
                      // Dòng lỗi có nền hồng nhạt: quét mắt là thấy, không cần đọc từng thẻ.
                      background: r.status >= 400 ? tint(ERR, "14") : V.surfaceAlt,
                    }}
                  >
                    <StatusTag status={r.status} />
                    <span style={{ fontFamily: MONO, flex: 1, minWidth: 120, overflowWrap: "anywhere" }}>{r.route}</span>
                    <span style={{ color: V.textSub, fontVariantNumeric: "tabular-nums" }}>{r.ms} ms</span>
                    <span style={{ color: V.textFaint, fontSize: 12 }}>{formatDate(r.at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Quản lý key                                                                 */
/* ────────────────────────────────────────────────────────────────────────── */

const EMPTY_FORM: KeyFormValues = { name: "", scopes: [], monthlyLimit: null };

function KeysCard() {
  const { message } = App.useApp();
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [scopes, setScopes] = useState<ApiKeyScope[] | null>(null);
  const [scopesError, setScopesError] = useState<string | null>(null);
  const [form, setForm] = useState<{ mode: "create" } | { mode: "edit"; key: ApiKeyRow } | null>(null);
  const [created, setCreated] = useState<{ name: string; key: string } | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);

  const load = useCallback(() => {
    api.listApiKeys().then(setKeys).catch(() => setKeys([]));
  }, []);
  // Danh sách quyền lấy từ máy chủ, không chép cứng: thêm quyền mới ở backend là ô chọn tự có.
  const fetchScopes = useCallback(() => {
    api.apiKeyScopes().then(setScopes).catch((e: Error) => setScopesError(e.message));
  }, []);
  // Nút "Tải lại" trong hộp thoại: xoá lỗi cũ rồi hỏi lại (xoá lỗi nằm ở handler, không ở effect).
  const loadScopes = useCallback(() => {
    setScopesError(null);
    fetchScopes();
  }, [fetchScopes]);
  useEffect(() => {
    load();
    fetchScopes();
  }, [load, fetchScopes]);

  const initial = useMemo<KeyFormValues>(
    () => (form?.mode === "edit" ? { name: form.key.name, scopes: form.key.scopes, monthlyLimit: form.key.monthlyLimit } : EMPTY_FORM),
    [form],
  );

  const submit = async (v: KeyFormValues) => {
    try {
      if (form?.mode === "edit") {
        const patch: ApiKeyPatch = { name: v.name || "API key", scopes: v.scopes, monthlyLimit: v.monthlyLimit };
        await api.updateApiKey(form.key.id, patch);
        message.success("Đã lưu — có hiệu lực ngay với lượt gọi kế tiếp.");
      } else {
        const r = await api.createApiKey({ name: v.name || "API key", scopes: v.scopes, monthlyLimit: v.monthlyLimit });
        // Key thô chỉ có ở đây, một lần. Đặt vào state hiện hộp thoại TRƯỚC khi đóng form để không
        // có khoảng trống nào làm người dùng tưởng đã xong.
        setCreated({ name: r.name, key: r.key });
      }
      setForm(null);
      load();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const revoke = async (id: string) => {
    try {
      await api.revokeApiKey(id);
      message.success("Đã thu hồi");
      load();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  return (
    <Card style={{ boxShadow: CARD_SHADOW, borderRadius: 14 }} styles={{ body: { padding: 20 } }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <Title level={5} style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: 8 }}>
          <KeyOutlined /> API keys
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setForm({ mode: "create" })}>
          Tạo key
        </Button>
      </div>

      {keys === null ? (
        <Skeleton active paragraph={{ rows: 2 }} />
      ) : keys.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có API key — tạo key đầu tiên để gọi API." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {keys.map((k) => {
            const pct = k.monthlyLimit ? Math.min(100, Math.round((k.monthUsed / k.monthlyLimit) * 100)) : null;
            const barColor = pct === null ? BRAND : pct >= 100 ? ERR : pct >= 80 ? WARN : BRAND;
            return (
              <div
                key={k.id}
                role="button"
                tabIndex={0}
                onClick={() => setReportId(k.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setReportId(k.id);
                  }
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, flexWrap: "wrap", cursor: "pointer",
                  border: `1px solid ${V.border}`, background: k.revokedAt ? V.surfaceAlt : V.surface, opacity: k.revokedAt ? 0.7 : 1,
                }}
              >
                <div style={{ minWidth: 0, flex: "1 1 200px" }}>
                  <Text strong style={{ display: "block" }}>{k.name}</Text>
                  <Text type="secondary" style={{ fontSize: 12.5, fontFamily: MONO }}>{k.prefix}••••••••••••</Text>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                    {k.scopes.length === 0 ? (
                      <Tag color="gold" style={{ margin: 0 }}>Toàn quyền</Tag>
                    ) : (
                      k.scopes.map((s) => (
                        <Tag key={s} style={{ margin: 0, fontSize: 11.5 }}>{scopeLabel(scopes, s)}</Tag>
                      ))
                    )}
                  </div>
                </div>

                <div style={{ flex: "1 1 160px", minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: V.textSub, fontVariantNumeric: "tabular-nums", display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span>Tháng này</span>
                    <span style={{ color: pct !== null && pct >= 100 ? ERR : V.text, fontWeight: 600 }}>
                      {k.monthUsed.toLocaleString("vi-VN")}{k.monthlyLimit ? ` / ${k.monthlyLimit.toLocaleString("vi-VN")}` : " · ∞"}
                    </span>
                  </div>
                  {pct !== null && <Progress percent={pct} size="small" showInfo={false} strokeColor={barColor} style={{ margin: 0 }} />}
                  <Text type="secondary" style={{ fontSize: 11.5, display: "block" }}>
                    Tạo {formatDate(k.createdAt)}{k.lastUsedAt ? ` · Dùng ${formatDate(k.lastUsedAt)}` : " · Chưa dùng"}
                  </Text>
                </div>

                {/* stopPropagation: các nút này nằm trong hàng bấm-mở-báo-cáo. */}
                <div style={{ display: "flex", gap: 4, alignItems: "center" }} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                  <Tooltip title="Báo cáo">
                    <Button size="small" type="text" icon={<BarChartOutlined />} onClick={() => setReportId(k.id)} />
                  </Tooltip>
                  {k.revokedAt ? (
                    <Tag color="default" style={{ margin: 0 }}>Đã thu hồi</Tag>
                  ) : (
                    <>
                      <Tooltip title="Sửa quyền / hạn mức">
                        <Button size="small" type="text" icon={<EditOutlined />} onClick={() => setForm({ mode: "edit", key: k })} />
                      </Tooltip>
                      <Popconfirm title="Thu hồi key này?" description="Mọi request dùng key này sẽ bị từ chối ngay." okText="Thu hồi" cancelText="Huỷ" onConfirm={() => void revoke(k.id)}>
                        <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <KeyFormModal
        key={form ? (form.mode === "edit" ? `form-edit-${form.key.id}` : "form-create") : "form-closed"}
        open={!!form}
        mode={form?.mode ?? "create"}
        initial={initial}
        scopes={scopes}
        scopesError={scopesError}
        onReloadScopes={loadScopes}
        onSubmit={submit}
        onCancel={() => setForm(null)}
      />

      {/* `key` theo id: mỗi lần mở là một mount mới, nên vừa sửa hạn mức xong mở lại không thấy
          số cũ lóe lên trong lúc chờ tải. */}
      <KeyReportDrawer key={reportId ? `report-${reportId}` : "report-closed"} keyId={reportId} scopes={scopes} onClose={() => setReportId(null)} />

      {/* Show the raw key ONCE */}
      <Modal open={!!created} onCancel={() => setCreated(null)} footer={<Button type="primary" onClick={() => setCreated(null)}>Đã lưu, đóng</Button>} title="API key mới — lưu lại ngay">
        <Paragraph type="warning" style={{ marginTop: 4 }}>
          Chỉ hiện <b>một lần duy nhất</b>. Sao chép và lưu vào nơi an toàn — không thể xem lại.
        </Paragraph>
        {created && <CodeBox>{created.key}</CodeBox>}
      </Modal>
    </Card>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Tài liệu + playground theo từng endpoint                                    */
/* ────────────────────────────────────────────────────────────────────────── */

type ParamDef = {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  kind: "text" | "textarea" | "select";
  options?: { value: string; label: string }[];
  default?: string;
};

type Endpoint = {
  method: "GET" | "POST";
  path: string;
  desc: string;
  /** Quyền cần có — hiện cạnh endpoint để người dùng hiểu ngay vì sao bị 403. */
  scope: string;
  params: ParamDef[];
  /** Dựng URL + body thật từ tham số đã nhập. */
  build: (v: Record<string, string>) => { url: string; body?: unknown };
  /** Endpoint TỐN HẠN MỨC THẬT ⇒ bắt buộc xác nhận trước khi gọi. */
  costly?: boolean;
};

const ENDPOINTS: Endpoint[] = [
  {
    method: "POST",
    path: "/pub/apps",
    desc: "Tạo app từ mô tả → { appId, buildId }. Body: { prompt, track?, model? }",
    scope: "apps:write",
    costly: true,
    params: [
      { name: "prompt", label: "prompt", placeholder: "Landing quán cà phê có menu và form đặt bàn", required: true, kind: "textarea" },
      {
        name: "track", label: "track", kind: "select", default: "web",
        options: ["web", "mobile", "desktop", "game", "extension"].map((t) => ({ value: t, label: t })),
      },
    ],
    build: (v) => ({ url: `${PUB}/pub/apps`, body: { prompt: v.prompt, track: v.track || "web" } }),
  },
  {
    method: "GET",
    path: "/pub/builds/:id",
    desc: "Trạng thái build (stage/status/URL khi live)",
    scope: "builds:read",
    params: [{ name: "id", label: "id", placeholder: "buildId nhận được từ POST /pub/apps", required: true, kind: "text" }],
    build: (v) => ({ url: `${PUB}/pub/builds/${encodeURIComponent(v.id.trim())}` }),
  },
  {
    method: "GET",
    path: "/pub/apps",
    desc: "Liệt kê app của bạn",
    scope: "apps:read",
    params: [],
    build: () => ({ url: `${PUB}/pub/apps` }),
  },
  {
    method: "GET",
    path: "/pub/me",
    desc: "Gói + % hạn mức đã dùng",
    scope: "account:read",
    params: [],
    build: () => ({ url: `${PUB}/pub/me` }),
  },
];

type CallResult =
  | { kind: "ok"; status: number; ms: number; body: string; message: string | null }
  | { kind: "network"; ms: number; error: string };

function EndpointRow({ ep, apiKey, onNeedKey }: { ep: Endpoint; apiKey: string; onNeedKey: () => void }) {
  const { modal } = App.useApp();
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(ep.params.map((p) => [p.name, p.default ?? ""])),
  );
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<CallResult | null>(null);

  const missing = ep.params.filter((p) => p.required && !vals[p.name]?.trim());

  const run = async () => {
    const { url, body } = ep.build(vals);
    setBusy(true);
    setRes(null);
    const t0 = performance.now();
    try {
      const r = await fetch(url, {
        method: ep.method,
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache: "no-store",
      });
      const text = await r.text();
      // Giữ nguyên thân phản hồi của máy chủ, kể cả khi lỗi: câu 401/403 tiếng Việt nằm trong đó.
      setRes({ kind: "ok", status: r.status, ms: Math.round(performance.now() - t0), body: pretty(text), message: serverMessage(text) });
    } catch (e) {
      setRes({ kind: "network", ms: Math.round(performance.now() - t0), error: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const onTry = () => {
    if (!apiKey.trim()) {
      onNeedKey();
      return;
    }
    if (missing.length) return;
    if (ep.costly) {
      // Không có đường tắt: lượt gọi này dựng app thật và trừ vào hạn mức % của gói.
      modal.confirm({
        title: "Lượt gọi này TỐN HẠN MỨC THẬT",
        icon: <WarningOutlined style={{ color: WARN }} />,
        content: (
          <div>
            <p style={{ margin: "0 0 8px" }}>
              <Text code>POST /pub/apps</Text> tạo một app thật và chạy một lượt dựng thật — trừ vào hạn mức % của gói y như bấm “Tạo app” trong ứng dụng, không phải môi trường thử.
            </p>
            <p style={{ margin: 0 }}>App tạo ra sẽ xuất hiện trong danh sách app của bạn. Vẫn gọi?</p>
          </div>
        ),
        okText: "Gọi thật, tôi hiểu",
        okButtonProps: { danger: true },
        cancelText: "Huỷ",
        // Đóng hộp xác nhận ngay; kết quả (mã trạng thái, thân, thời gian) hiện trong ô thử phía dưới.
        onOk: () => {
          void run();
        },
      });
      return;
    }
    void run();
  };

  return (
    <div style={{ border: `1px solid ${V.border}`, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", fontSize: 13 }}>
        <Tag color={ep.method === "POST" ? "purple" : "blue"} style={{ margin: 0, minWidth: 46, textAlign: "center" }}>{ep.method}</Tag>
        <Text code style={{ margin: 0 }}>{ep.path}</Text>
        <Text type="secondary" style={{ fontSize: 12.5, flex: "1 1 200px", minWidth: 0 }}>{ep.desc}</Text>
        <Tooltip title="Quyền key cần có để gọi endpoint này">
          <Tag style={{ margin: 0, fontFamily: MONO, fontSize: 11 }}>{ep.scope}</Tag>
        </Tooltip>
        <Button
          size="small"
          type={open ? "default" : "primary"}
          ghost={!open}
          icon={<ThunderboltOutlined />}
          onClick={() => setOpen((o) => !o)}
          style={ep.costly ? { borderColor: WARN, color: WARN } : undefined}
        >
          {open ? "Đóng" : "Thử ngay"}
        </Button>
      </div>

      {open && (
        <div style={{ borderTop: `1px solid ${V.borderSub}`, background: V.surfaceAlt, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {ep.costly && (
            <Alert
              type="warning"
              showIcon
              message="Endpoint này dựng app thật và tốn hạn mức % của gói. Sẽ hỏi xác nhận trước khi gọi."
              style={{ fontSize: 12.5 }}
            />
          )}
          {ep.params.map((p) => (
            <div key={p.name}>
              <Text style={{ fontSize: 12.5, fontFamily: MONO }}>
                {p.label}{p.required && <span style={{ color: ERR }}> *</span>}
              </Text>
              {p.kind === "textarea" ? (
                <Input.TextArea
                  value={vals[p.name]}
                  onChange={(e) => setVals((v) => ({ ...v, [p.name]: e.target.value }))}
                  placeholder={p.placeholder}
                  autoSize={{ minRows: 2, maxRows: 6 }}
                  style={{ marginTop: 4 }}
                  maxLength={4000}
                />
              ) : p.kind === "select" ? (
                <Select
                  value={vals[p.name]}
                  onChange={(val) => setVals((v) => ({ ...v, [p.name]: val }))}
                  options={p.options}
                  style={{ width: "100%", marginTop: 4 }}
                />
              ) : (
                <Input
                  value={vals[p.name]}
                  onChange={(e) => setVals((v) => ({ ...v, [p.name]: e.target.value }))}
                  placeholder={p.placeholder}
                  style={{ marginTop: 4, fontFamily: MONO }}
                  onPressEnter={onTry}
                />
              )}
            </div>
          ))}

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <Button type="primary" danger={!!ep.costly} icon={<ThunderboltOutlined />} loading={busy} disabled={missing.length > 0} onClick={onTry}>
              {ep.costly ? "Gọi thật (tốn hạn mức)" : "Gọi"}
            </Button>
            {missing.length > 0 && (
              <Text type="secondary" style={{ fontSize: 12 }}>Cần nhập: {missing.map((m) => m.label).join(", ")}</Text>
            )}
            {!apiKey.trim() && <Text type="warning" style={{ fontSize: 12 }}>Chưa có key để thử — dán key ở ô phía trên.</Text>}
          </div>

          {res && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {res.kind === "network" ? (
                <Alert
                  type="error"
                  showIcon
                  message="Không kết nối được máy chủ"
                  description={`${res.error} (sau ${res.ms} ms). Thường là mất mạng hoặc trình duyệt chặn (CORS).`}
                />
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <StatusTag status={res.status} />
                    <Text style={{ fontSize: 12.5, color: V.textSub, fontVariantNumeric: "tabular-nums" }}>{res.ms} ms</Text>
                    <Text style={{ fontSize: 12.5, color: V.textFaint, fontFamily: MONO }}>{ep.method} {ep.path}</Text>
                  </div>
                  {/* Câu giải thích của máy chủ (401/403/400) đưa lên trên thân JSON, để không phải
                      lần trong dấu ngoặc mới biết vì sao hỏng. */}
                  {res.status >= 400 && res.message && (
                    <Alert type="error" showIcon message={`HTTP ${res.status}`} description={res.message} />
                  )}
                  <CodeBox>{res.body || "(phản hồi rỗng)"}</CodeBox>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Docs + playground per endpoint. */
function DocsCard() {
  const { message } = App.useApp();
  // Key thô chỉ tồn tại trong bộ nhớ trang này — không ghi localStorage, vì máy chủ cũng không giữ
  // key thô và một tab bị lộ không nên biến thành key bị lộ vĩnh viễn.
  const [key, setKey] = useState("");

  return (
    <Card style={{ boxShadow: CARD_SHADOW, borderRadius: 14 }} styles={{ body: { padding: 20 } }}>
      <Title level={5} style={{ margin: "0 0 6px", display: "inline-flex", alignItems: "center", gap: 8 }}>
        <ApiOutlined /> Tài liệu & endpoint
      </Title>
      <Paragraph type="secondary" style={{ fontSize: 13 }}>
        Base URL: <Text code>{PUB}</Text> · Xác thực: header <Text code>Authorization: Bearer tw_...</Text> · Mọi lệnh đều tính vào hạn mức % theo gói của bạn.
      </Paragraph>

      <div style={{ marginBottom: 12 }}>
        <Text strong style={{ fontSize: 12.5, display: "block", marginBottom: 4 }}>Key dùng để thử</Text>
        <Input.Password
          placeholder="Dán API key thô (tw_live_…) — chỉ giữ trong trang này, không lưu lại"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          style={{ fontFamily: MONO }}
        />
        <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 4 }}>
          Máy chủ không giữ key thô, nên không chọn được từ danh sách trên — dán key bạn đã lưu lúc tạo. Mọi lượt thử đều được ghi vào báo cáo của key đó.
        </Text>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "8px 0 14px" }}>
        {ENDPOINTS.map((ep) => (
          <EndpointRow key={`${ep.method} ${ep.path}`} ep={ep} apiKey={key} onNeedKey={() => message.warning("Dán API key vào ô “Key dùng để thử” trước.")} />
        ))}
      </div>

      <Text strong style={{ fontSize: 12.5 }}>Ví dụ — tạo app bằng curl:</Text>
      <div style={{ marginTop: 6 }}>
        <CodeBox>{`curl -X POST ${PUB}/pub/apps \\
  -H "Authorization: Bearer tw_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"prompt":"Landing quán cà phê có menu và form đặt bàn","track":"web"}'`}</CodeBox>
      </div>
    </Card>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Báo cáo gói (giữ nguyên, chỉ bỏ màu cứng)                                   */
/* ────────────────────────────────────────────────────────────────────────── */

const vnd = (n: number) => `${Math.round(n).toLocaleString("vi-VN")}đ`;

/** Usage report: % of the monthly budget used, converted to MONEY vs the plan price so the user
 *  sees how much value they've consumed / have left (nudge to use the plan fully). */
function UsageReport() {
  const [sub, setSub] = useState<MeSubscription | null>(null);
  useEffect(() => {
    api.subscription().then(setSub).catch(() => undefined);
  }, []);

  const price = sub?.catalog?.find((c) => c.id === sub.plan)?.priceVnd ?? 0;
  const pct = sub ? Math.round(sub.percentUsed) : 0;
  const bar = pct >= 100 ? ERR : pct >= 80 ? WARN : BRAND;

  return (
    <Card style={{ boxShadow: CARD_SHADOW, borderRadius: 14 }} styles={{ body: { padding: 20 } }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <Title level={5} style={{ margin: 0 }}>Báo cáo sử dụng</Title>
        {sub && <Tag color="purple" style={{ margin: 0 }}>Gói {sub.planLabel}{price > 0 ? ` · ${vnd(price)}/tháng` : ""}</Tag>}
      </div>

      {!sub ? (
        <Skeleton active paragraph={{ rows: 2 }} />
      ) : sub.unlimited ? (
        <>
          <div className="tw-bar-unl" style={{ height: 8, marginBottom: 10 }}>
            <i style={{ width: `${Math.min(100, Math.max(6, refPercent(sub.tokensUsed, sub.tokensLimit)))}%` }} />
          </div>
          <Text type="secondary">
            Tài khoản không giới hạn (∞) — không tính hạn mức. Đã dùng{" "}
            <b style={{ fontVariantNumeric: "tabular-nums" }}>{sub.tokensUsed.toLocaleString("vi-VN")}</b> token
            trong chu kỳ này.
          </Text>
        </>
      ) : (
        <>
          <Progress percent={pct} strokeColor={bar} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 12, marginTop: 10 }}>
            <Stat label="Đã dùng" value={`${pct}%`} sub={price > 0 ? `≈ ${vnd((price * pct) / 100)}` : `${sub.tokensUsed.toLocaleString("vi-VN")} token`} color={bar} />
            <Stat label="Còn lại" value={`${Math.max(0, 100 - pct)}%`} sub={price > 0 ? `≈ ${vnd((price * (100 - pct)) / 100)}` : `${Math.max(0, sub.tokensLimit - sub.tokensUsed).toLocaleString("vi-VN")} token`} color={OK} />
            <Stat label="Giá trị gói" value={price > 0 ? vnd(price) : "Miễn phí"} sub="mỗi chu kỳ" color={BLUE} />
          </div>
          <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 10 }}>
            Mọi lệnh qua API tính vào cùng hạn mức % này.{sub.resetAt ? ` Làm mới ${formatDate(sub.resetAt)}.` : ""}
            {price > 0 ? " Số tiền là quy đổi giá trị đã dùng theo gói — không phải phí phát sinh." : ""}
          </Text>
        </>
      )}
    </Card>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div style={{ border: `1px solid ${V.border}`, borderRadius: 10, padding: "10px 14px", minWidth: 0 }}>
      <div style={{ fontSize: 12, color: V.textSub }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5, color, lineHeight: 1.2, overflowWrap: "anywhere" }}>{value}</div>
      <div style={{ fontSize: 12, color: V.textFaint, overflowWrap: "anywhere" }}>{sub}</div>
    </div>
  );
}

export default function ApiConsolePage() {
  return (
    <Space direction="vertical" size={20} style={{ width: "100%" }}>
      <div>
        <Title level={3} style={{ margin: 0 }}>
          <ApiOutlined style={{ marginRight: 10 }} /> API cho lập trình viên
        </Title>
        <Text type="secondary" style={{ display: "block", marginTop: 4 }}>
          Tạo API key để gọi Larkwave từ bên ngoài — tạo app, kiểm tra build, đọc dữ liệu. Tính vào hạn mức % như trong app.
        </Text>
      </div>
      <UsageReport />
      <KeysCard />
      <DocsCard />
    </Space>
  );
}
