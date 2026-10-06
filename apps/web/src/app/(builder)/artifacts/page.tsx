"use client";

import {
  CodeOutlined,
  DeleteOutlined,
  EditOutlined,
  LinkOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { App, Button, Card, Empty, Form, Input, Modal, Select, Space, Switch, Tag, Typography } from "antd";
import { useCallback, useEffect, useState } from "react";
import { V, useI18n } from "@larkwave/ui";
import { api, type Artifact, APP_BASE_URL } from "@/lib/api";
import { ArtifactView } from "@/components/ArtifactView";

const { Title, Text, Paragraph } = Typography;

type TFn = (key: string, fallback?: string, vars?: Record<string, string | number>) => string;

const KIND_OPTS = [
  { value: "html", labelKey: "kindHtml", label: "HTML (chạy được)" },
  { value: "svg", labelKey: "kindSvg", label: "SVG" },
  { value: "markdown", labelKey: "kindMarkdown", label: "Markdown / văn bản" },
  { value: "code", labelKey: "kindCode", label: "Mã nguồn" },
];
const kindOptions = (t: TFn) => KIND_OPTS.map((o) => ({ value: o.value, label: t(`web.feat.${o.labelKey}`, o.label) }));
const kindLabel = (k: string, t: TFn) => {
  const o = KIND_OPTS.find((x) => x.value === k);
  return o ? t(`web.feat.${o.labelKey}`, o.label) : k;
};

function publicUrl(slug: string) {
  return `${APP_BASE_URL}/a/${slug}`;
}

export default function ArtifactsPage() {
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const [items, setItems] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Artifact | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState<Artifact | null>(null);
  const [form] = Form.useForm();
  const kindWatch = Form.useWatch("kind", form);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.listArtifacts());
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setCreating(true);
    form.resetFields();
    form.setFieldsValue({ title: "", kind: "html", language: "", content: "", isPublic: false });
  };
  const openEdit = (a: Artifact) => {
    setEditing(a);
    setCreating(true);
    form.resetFields();
    form.setFieldsValue({
      title: a.title,
      kind: a.kind,
      language: a.language,
      content: a.content,
      isPublic: a.visibility === "public",
    });
  };

  const submit = async () => {
    const v = await form.validateFields();
    const body = {
      title: v.title,
      kind: v.kind,
      language: v.language ?? "",
      content: v.content ?? "",
      visibility: v.isPublic ? "public" : "private",
    };
    setSaving(true);
    try {
      if (editing) {
        const next = await api.updateArtifact(editing.id, body);
        setItems((prev) => prev.map((x) => (x.id === next.id ? next : x)));
        message.success(t("web.feat.saved", "Đã lưu"));
      } else {
        await api.createArtifact(body);
        message.success(t("web.feat.createdArtifact", "Đã tạo artifact"));
      }
      setCreating(false);
      void load();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const togglePublic = async (a: Artifact, isPublic: boolean) => {
    try {
      const next = await api.updateArtifact(a.id, { visibility: isPublic ? "public" : "private" });
      setItems((prev) => prev.map((x) => (x.id === next.id ? next : x)));
      if (viewing?.id === a.id) setViewing(next);
      if (isPublic) {
        await navigator.clipboard?.writeText(publicUrl(next.slug)).catch(() => undefined);
        message.success(t("web.feat.sharedCopied", "Đã bật chia sẻ — link đã copy"));
      }
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const copyLink = async (a: Artifact) => {
    try {
      await navigator.clipboard.writeText(publicUrl(a.slug));
      message.success(t("web.feat.copiedLink", "Đã copy link"));
    } catch {
      message.info(publicUrl(a.slug));
    }
  };

  const remove = (a: Artifact) => {
    modal.confirm({
      title: t("web.feat.deleteArtifactTitle", "Xoá artifact?"),
      content: t("web.feat.deleteArtifactContent", "“{name}” sẽ bị xoá vĩnh viễn.", { name: a.title }),
      okText: t("web.feat.delete", "Xoá"),
      okButtonProps: { danger: true },
      cancelText: t("web.feat.cancel", "Huỷ"),
      onOk: async () => {
        try {
          await api.deleteArtifact(a.id);
          setItems((prev) => prev.filter((x) => x.id !== a.id));
          message.success(t("web.feat.deleted", "Đã xoá"));
        } catch (e) {
          message.error((e as Error).message);
        }
      },
    });
  };

  const empty = !loading && items.length === 0;

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <Title level={3} style={{ margin: 0 }}>
            <CodeOutlined style={{ color: "#6C5CE7", marginRight: 8 }} />
            Artifacts
          </Title>
          <Text type="secondary">{t("web.feat.artifactsSubtitle", "Lưu lại các sản phẩm (HTML/mã/tài liệu) và chia sẻ bằng link công khai.")}</Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => load()} />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            {t("web.feat.newArtifact", "Artifact mới")}
          </Button>
        </Space>
      </div>

      {empty ? (
        <div style={{ padding: "40px 0" }}>
          <Empty description={t("web.feat.artifactsEmpty", "Chưa có artifact nào. Bấm “Artifact mới” để tạo.")} />
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14, marginTop: 16 }}>
          {items.map((a) => (
            <Card
              key={a.id}
              hoverable
              styles={{ body: { padding: 0 } }}
              style={{ overflow: "hidden" }}
              onClick={() => setViewing(a)}
            >
              <div style={{ height: 150, overflow: "hidden", borderBottom: `1px solid ${V.border}`, background: V.surfaceMuted, pointerEvents: "none" }}>
                <ArtifactView kind={a.kind} content={a.content} height={150} />
              </div>
              <div style={{ padding: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Text strong style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.title}
                  </Text>
                  {a.visibility === "public" ? <Tag color="green">{t("web.feat.public", "Công khai")}</Tag> : <Tag>{t("web.feat.private", "Riêng tư")}</Tag>}
                </div>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {kindLabel(a.kind, t)}
                </Text>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create / edit modal */}
      <Modal
        title={editing ? t("web.feat.editArtifact", "Sửa artifact") : t("web.feat.newArtifact", "Artifact mới")}
        open={creating}
        onOk={submit}
        confirmLoading={saving}
        onCancel={() => setCreating(false)}
        okText={editing ? t("web.feat.save", "Lưu") : t("web.feat.create", "Tạo")}
        cancelText={t("web.feat.cancel", "Huỷ")}
        width={640}
        destroyOnClose
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item name="title" label={t("web.feat.titleFieldLabel", "Tiêu đề")} rules={[{ required: true, message: t("web.feat.enterTitle", "Nhập tiêu đề") }]}>
            <Input placeholder={t("web.feat.titlePlaceholder", "vd: Sơ đồ kiến trúc")} maxLength={160} />
          </Form.Item>
          <Space wrap>
            <Form.Item name="kind" label={t("web.feat.kindFieldLabel", "Loại")}>
              <Select style={{ width: 200 }} options={kindOptions(t)} />
            </Form.Item>
            {kindWatch === "code" && (
              <Form.Item name="language" label={t("web.feat.languageLabel", "Ngôn ngữ")}>
                <Input style={{ width: 160 }} placeholder={t("web.feat.langPlaceholder", "vd: python")} />
              </Form.Item>
            )}
          </Space>
          <Form.Item name="content" label={t("web.feat.contentLabel", "Nội dung")} rules={[{ required: true, message: t("web.feat.enterContent", "Nhập nội dung") }]}>
            <Input.TextArea
              placeholder={kindWatch === "html" ? t("web.feat.htmlPlaceholder", "Dán HTML tự chứa (chạy trong khung cách ly)…") : t("web.feat.contentPlaceholder", "Nội dung…")}
              autoSize={{ minRows: 8, maxRows: 20 }}
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13 }}
            />
          </Form.Item>
          <Form.Item name="isPublic" label={t("web.feat.shareLabel", "Chia sẻ công khai (ai có link đều xem được)")} valuePropName="checked" style={{ marginBottom: 0 }}>
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      {/* View modal */}
      <Modal
        title={viewing?.title}
        open={!!viewing}
        onCancel={() => setViewing(null)}
        width={860}
        footer={
          viewing ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", rowGap: 8 }}>
              <Space>
                <Text type="secondary" style={{ fontSize: 12.5 }}>
                  {t("web.feat.public", "Công khai")}
                </Text>
                <Switch checked={viewing.visibility === "public"} onChange={(v) => void togglePublic(viewing, v)} />
                {viewing.visibility === "public" && (
                  <Button size="small" icon={<LinkOutlined />} onClick={() => void copyLink(viewing)}>
                    {t("web.feat.copyLink", "Copy link")}
                  </Button>
                )}
              </Space>
              <div style={{ flex: 1 }} />
              <Button icon={<EditOutlined />} onClick={() => { const a = viewing; setViewing(null); if (a) openEdit(a); }}>
                {t("web.feat.edit", "Sửa")}
              </Button>
              <Button danger icon={<DeleteOutlined />} onClick={() => { const a = viewing; setViewing(null); if (a) remove(a); }}>
                {t("web.feat.delete", "Xoá")}
              </Button>
            </div>
          ) : null
        }
      >
        {viewing && <ArtifactView kind={viewing.kind} content={viewing.content} height="60vh" />}
      </Modal>
    </div>
  );
}
