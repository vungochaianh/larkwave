"use client";

import {
  ApiOutlined,
  AppstoreOutlined,
  CheckCircleOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  FileTextOutlined,
  LockOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import {
  App,
  Button,
  Card,
  Divider,
  Input,
  Segmented,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
} from "antd";
import { useState } from "react";
import type {
  BackendKind,
  Blueprint,
  BpEntity,
  BpField,
  BpFieldType,
  BpPage,
  BpPageKind,
} from "@larkwave/shared";
import { useI18n } from "@larkwave/ui";
import { api } from "@/lib/api";
import { CARD_SHADOW } from "@/lib/theme";

const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;

const PAGE_KINDS: BpPageKind[] = ["list", "detail", "form", "dashboard", "landing", "auth"];
const FIELD_TYPES: BpFieldType[] = [
  "string",
  "text",
  "int",
  "float",
  "bool",
  "datetime",
  "json",
  "enum",
  "ref",
];

/**
 * The design-intake gate: shows the AI-proposed Blueprint (pages + data model +
 * auth) for the user to review, edit and approve BEFORE codegen runs. Approving
 * saves any edits, then resumes the paused pipeline.
 */
export default function BlueprintReview({
  buildId,
  blueprint,
  onApproved,
}: {
  buildId: string;
  blueprint: Blueprint;
  /** Called after the user approves (host reflects the resumed/running build). */
  onApproved?: () => void;
}) {
  const { t } = useI18n();
  const { message } = App.useApp();
  // Captured once at mount. The parent only renders this component after the
  // Blueprint has arrived and keys it by the (stable) build, so capturing the
  // initial prop is sufficient; local edits are preserved until saved/approved.
  const [bp, setBp] = useState<Blueprint>(blueprint);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const patch = (next: Partial<Blueprint>) => {
    setBp((b) => ({ ...b, ...next }));
    setDirty(true);
  };

  const save = async (): Promise<boolean> => {
    setSaving(true);
    try {
      await api.updateBlueprint(buildId, bp);
      setDirty(false);
      message.success(t("wcomp.brDesignSaved", "Đã lưu thiết kế"));
      return true;
    } catch (e) {
      message.error((e as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const approve = async () => {
    setApproving(true);
    try {
      if (dirty) {
        const ok = await save();
        if (!ok) return;
      }
      await api.approveBuild(buildId);
      message.success(t("wcomp.brApproved", "Đã duyệt — đang sinh app…"));
      onApproved?.();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setApproving(false);
    }
  };

  // ── pages ────────────────────────────────────────────────────────────────
  const setPage = (i: number, next: Partial<BpPage>) =>
    patch({ pages: bp.pages.map((p, idx) => (idx === i ? { ...p, ...next } : p)) });
  const addPage = () =>
    patch({ pages: [...bp.pages, { path: "/trang-moi", title: t("wcomp.brNewPage", "Trang mới"), kind: "list" }] });
  const removePage = (i: number) => patch({ pages: bp.pages.filter((_, idx) => idx !== i) });

  // ── entities ─────────────────────────────────────────────────────────────
  const setEntity = (i: number, next: Partial<BpEntity>) =>
    patch({ entities: bp.entities.map((e, idx) => (idx === i ? { ...e, ...next } : e)) });
  const addEntity = () =>
    patch({
      entities: [
        ...bp.entities,
        {
          name: "MoiEntity",
          label: t("wcomp.brNewTable", "Bảng mới"),
          ownership: "public",
          ops: ["list", "read", "create", "update", "delete"],
          fields: [{ name: "title", type: "string", required: true }],
        },
      ],
    });
  const removeEntity = (i: number) =>
    patch({ entities: bp.entities.filter((_, idx) => idx !== i) });

  const setField = (ei: number, fi: number, next: Partial<BpField>) =>
    setEntity(ei, {
      fields: bp.entities[ei].fields.map((f, idx) => (idx === fi ? { ...f, ...next } : f)),
    });
  const addField = (ei: number) =>
    setEntity(ei, { fields: [...bp.entities[ei].fields, { name: "field", type: "string" }] });
  const removeField = (ei: number, fi: number) =>
    setEntity(ei, { fields: bp.entities[ei].fields.filter((_, idx) => idx !== fi) });

  const fullstack = bp.backend === "fullstack";

  return (
    <Card style={{ boxShadow: CARD_SHADOW, borderColor: "rgba(108,92,231,0.35)" }}>
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        {/* Header */}
        <div>
          <Space align="center" size={10} wrap>
            <Title level={5} style={{ margin: 0 }}>
              <AppstoreOutlined style={{ color: "#6C5CE7" }} /> {t("wcomp.brReviewDesign", "Xem lại thiết kế")}
            </Title>
            <Tag color={fullstack ? "purple" : "default"}>
              {fullstack ? t("wcomp.brFullstack", "Full-stack (có cơ sở dữ liệu)") : t("wcomp.brStatic", "Tĩnh")}
            </Tag>
            {dirty && <Tag color="orange">{t("wcomp.brUnsaved", "Có chỉnh sửa chưa lưu")}</Tag>}
          </Space>
          <Paragraph type="secondary" style={{ margin: "6px 0 0", fontSize: 13 }}>
            {t("wcomp.brIntro1", "AI đề xuất các trang và mô hình dữ liệu bên dưới. Bạn có thể chỉnh rồi bấm")}
            <b> {t("wcomp.brApproveGenerate", "Duyệt & sinh app")}</b> {t("wcomp.brIntro2", "để tiếp tục.")}
          </Paragraph>
        </div>

        {/* App identity */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <div style={{ flex: "1 1 220px", minWidth: 200 }}>
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              {t("wcomp.brAppName", "Tên app")}
            </Text>
            <Input
              value={bp.appName}
              onChange={(e) => patch({ appName: e.target.value })}
              maxLength={60}
            />
          </div>
          <div style={{ flex: "0 0 auto" }}>
            <Text type="secondary" style={{ fontSize: 12.5, display: "block" }}>
              {t("wcomp.brAppType", "Loại app")}
            </Text>
            <Segmented<BackendKind>
              value={bp.backend}
              onChange={(v) => patch({ backend: v })}
              options={[
                { label: t("wcomp.brStatic", "Tĩnh"), value: "static" },
                { label: t("wcomp.brFullstackShort", "Full-stack"), value: "fullstack" },
              ]}
            />
          </div>
        </div>
        <div>
          <Text type="secondary" style={{ fontSize: 12.5 }}>
            {t("wcomp.brSummary", "Tóm tắt")}
          </Text>
          <TextArea
            value={bp.summary}
            onChange={(e) => patch({ summary: e.target.value })}
            autoSize={{ minRows: 2, maxRows: 4 }}
          />
        </div>

        {/* Pages */}
        <div>
          <Divider orientation="left" style={{ margin: "4px 0 12px" }}>
            <FileTextOutlined /> {t("wcomp.brPages", "Trang")} ({bp.pages.length})
          </Divider>
          <Space direction="vertical" size={8} style={{ width: "100%" }}>
            {bp.pages.map((p, i) => (
              <div
                key={i}
                style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
              >
                <Input
                  value={p.title}
                  onChange={(e) => setPage(i, { title: e.target.value })}
                  placeholder={t("wcomp.brTitle", "Tiêu đề")}
                  style={{ flex: "1 1 160px", minWidth: 130 }}
                />
                <Input
                  value={p.path}
                  onChange={(e) => setPage(i, { path: e.target.value })}
                  placeholder="/duong-dan"
                  style={{ width: 150 }}
                />
                <Select<BpPageKind>
                  value={p.kind}
                  onChange={(v) => setPage(i, { kind: v })}
                  options={PAGE_KINDS.map((k) => ({ label: k, value: k }))}
                  style={{ width: 120 }}
                />
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => removePage(i)}
                />
              </div>
            ))}
            <Button type="dashed" icon={<PlusOutlined />} onClick={addPage} size="small">
              {t("wcomp.brAddPage", "Thêm trang")}
            </Button>
          </Space>
        </div>

        {/* Data model */}
        <div>
          <Divider orientation="left" style={{ margin: "4px 0 12px" }}>
            <DatabaseOutlined /> {t("wcomp.brDataModel", "Mô hình dữ liệu")} ({bp.entities.length})
          </Divider>
          {bp.entities.length === 0 && (
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              {t("wcomp.brNoTables", "Chưa có bảng dữ liệu — app sẽ là tĩnh. Thêm bảng để app lưu dữ liệu (full-stack).")}
            </Text>
          )}
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            {bp.entities.map((e, ei) => (
              <div
                key={ei}
                style={{
                  border: "1px solid #F1F2F7",
                  borderRadius: 10,
                  padding: 12,
                  background: "#FBFBFE",
                }}
              >
                <div
                  style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
                >
                  <Input
                    value={e.name}
                    onChange={(v) => setEntity(ei, { name: v.target.value })}
                    placeholder={t("wcomp.brTableName", "Tên bảng (vd: Todo)")}
                    style={{ width: 160 }}
                    prefix={<DatabaseOutlined style={{ color: "#9AA3B5" }} />}
                  />
                  <Select<BpEntity["ownership"]>
                    value={e.ownership}
                    onChange={(v) => setEntity(ei, { ownership: v })}
                    style={{ width: 150 }}
                    options={[
                      { label: t("wcomp.brOwnPublic", "Công khai"), value: "public" },
                      { label: t("wcomp.brOwnPerUser", "Theo người dùng"), value: "per-user" },
                      { label: t("wcomp.brOwnShared", "Dùng chung"), value: "shared" },
                    ]}
                  />
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => removeEntity(ei)}
                    style={{ marginLeft: "auto" }}
                  />
                </div>
                <div style={{ marginTop: 10 }}>
                  <Space direction="vertical" size={6} style={{ width: "100%" }}>
                    {e.fields.map((f, fi) => (
                      <div
                        key={fi}
                        style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
                      >
                        <Input
                          size="small"
                          value={f.name}
                          onChange={(v) => setField(ei, fi, { name: v.target.value })}
                          placeholder={t("wcomp.brFieldName", "tên trường")}
                          style={{ width: 150 }}
                        />
                        <Select<BpFieldType>
                          size="small"
                          value={f.type}
                          onChange={(v) => setField(ei, fi, { type: v })}
                          options={FIELD_TYPES.map((t) => ({ label: t, value: t }))}
                          style={{ width: 110 }}
                        />
                        <Switch
                          size="small"
                          checked={!!f.required}
                          onChange={(c) => setField(ei, fi, { required: c })}
                          checkedChildren={t("wcomp.brRequired", "bắt buộc")}
                          unCheckedChildren={t("wcomp.brOptional", "tuỳ chọn")}
                        />
                        <Button
                          size="small"
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => removeField(ei, fi)}
                        />
                      </div>
                    ))}
                    <Button
                      size="small"
                      type="dashed"
                      icon={<PlusOutlined />}
                      onClick={() => addField(ei)}
                    >
                      {t("wcomp.brAddField", "Thêm trường")}
                    </Button>
                  </Space>
                </div>
              </div>
            ))}
            <Button type="dashed" icon={<PlusOutlined />} onClick={addEntity} size="small">
              {t("wcomp.brAddTable", "Thêm bảng dữ liệu")}
            </Button>
          </Space>
        </div>

        {/* Auth */}
        <div>
          <Divider orientation="left" style={{ margin: "4px 0 12px" }}>
            <LockOutlined /> {t("wcomp.brAuth", "Đăng nhập")}
          </Divider>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <Switch
              checked={bp.auth.enabled}
              onChange={(c) =>
                patch({
                  auth: {
                    ...bp.auth,
                    enabled: c,
                    providers: c && bp.auth.providers.length === 0 ? ["email"] : bp.auth.providers,
                  },
                })
              }
              checkedChildren={t("wcomp.brYes", "Có")}
              unCheckedChildren={t("wcomp.brNo", "Không")}
            />
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              {t("wcomp.brAuthQuestion", "App yêu cầu người dùng cuối đăng nhập?")}
            </Text>
            {bp.auth.enabled && (
              <Select
                mode="multiple"
                value={bp.auth.providers}
                onChange={(v) =>
                  patch({ auth: { ...bp.auth, providers: v as ("email" | "google")[] } })
                }
                options={[
                  { label: t("wcomp.brAuthEmail", "Email + mật khẩu"), value: "email" },
                  { label: "Google", value: "google" },
                ]}
                style={{ minWidth: 220 }}
                placeholder={t("wcomp.brAuthMethod", "Phương thức đăng nhập")}
              />
            )}
          </div>
        </div>

        {/* Actions */}
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "flex-end",
            borderTop: "1px solid #F1F2F7",
            paddingTop: 14,
          }}
        >
          {bp.integrations.length > 0 && (
            <Text type="secondary" style={{ fontSize: 12, marginRight: "auto" }}>
              <ApiOutlined /> {t("wcomp.brIntegrations", "Tích hợp:")} {bp.integrations.map((i) => i.kind).join(", ")}
            </Text>
          )}
          <Button onClick={() => void save()} loading={saving} disabled={!dirty || approving}>
            {t("wcomp.brSaveEdits", "Lưu chỉnh sửa")}
          </Button>
          <Button
            type="primary"
            icon={<CheckCircleOutlined />}
            loading={approving}
            onClick={() => void approve()}
          >
            {t("wcomp.brApproveGenerate", "Duyệt & sinh app")}
          </Button>
        </div>
      </Space>
    </Card>
  );
}
