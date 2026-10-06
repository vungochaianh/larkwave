"use client";

import { EditOutlined, FolderOutlined, ReloadOutlined, RobotOutlined } from "@ant-design/icons";
import { App, Button, Card, Empty, Form, Input, Modal, Space, Tag, Typography } from "antd";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { V, useI18n } from "@larkwave/ui";
import { api } from "@/lib/api";

const { Title, Text, Paragraph } = Typography;

type Project = { id: string; name: string; instructions: string; ord: number };

export default function ProjectsPage() {
  const { message } = App.useApp();
  const { t } = useI18n();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Project | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProjects(await api.listChatProjects());
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
  }, [load]);

  const openEdit = (p: Project) => {
    setEditing(p);
    form.resetFields();
    form.setFieldsValue({ name: p.name, instructions: p.instructions });
  };

  const submit = async () => {
    if (!editing) return;
    const v = await form.validateFields();
    setSaving(true);
    try {
      const next = await api.updateChatProject(editing.id, { name: v.name, instructions: v.instructions });
      setProjects((prev) => prev.map((x) => (x.id === next.id ? next : x)));
      message.success(t("web.feat.savedProject", "Đã lưu dự án"));
      setEditing(null);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const empty = !loading && projects.length === 0;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <Title level={3} style={{ margin: 0 }}>
            <FolderOutlined style={{ color: "#6C5CE7", marginRight: 8 }} />
            {t("web.feat.projectsTitle", "Dự án")}
          </Title>
          <Text type="secondary">
            {t("web.feat.projSubPre", "Đặt ")}<b>{t("web.feat.projSubBold", "chỉ dẫn riêng")}</b>{t("web.feat.projSubPost", " cho từng dự án — Trợ lý AI sẽ áp dụng cho mọi hội thoại trong dự án đó.")}
          </Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => load()} />
          <Link href="/assistant">
            <Button type="primary" icon={<RobotOutlined />}>
              {t("web.feat.openAssistant", "Mở Trợ lý AI")}
            </Button>
          </Link>
        </Space>
      </div>

      {empty ? (
        <div style={{ padding: "40px 0" }}>
          <Empty
            description={
              <span>
                {t("web.feat.projEmptyPre", "Chưa có dự án nào. Tạo dự án trong ")}<Link href="/assistant">Trợ lý AI</Link>{t("web.feat.projEmptyPost", " (gom các hội thoại), rồi quay lại đây thêm chỉ dẫn riêng.")}
              </span>
            }
          />
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))", gap: 12, marginTop: 16 }}>
          {projects.map((p) => (
            <Card key={p.id} styles={{ body: { padding: 16 } }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <FolderOutlined style={{ color: V.textFaint }} />
                <Text strong style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.name || t("web.feat.projectFallback", "Dự án")}
                </Text>
                {p.instructions.trim() ? <Tag color="success">{t("web.feat.hasInstructions", "Có chỉ dẫn")}</Tag> : <Tag>{t("web.feat.noInstructions", "Chưa có chỉ dẫn")}</Tag>}
              </div>
              <Paragraph type="secondary" ellipsis={{ rows: 3 }} style={{ margin: "0 0 12px", fontSize: 13, minHeight: 40 }}>
                {p.instructions.trim() || t("web.feat.noInstructionsYet", "Chưa có chỉ dẫn riêng cho dự án này.")}
              </Paragraph>
              <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(p)}>
                {t("web.feat.editInstructions", "Sửa chỉ dẫn")}
              </Button>
            </Card>
          ))}
        </div>
      )}

      <Modal
        title={t("web.feat.projectModalTitle", "Dự án — {name}", { name: editing?.name || "" })}
        open={!!editing}
        onOk={submit}
        confirmLoading={saving}
        onCancel={() => setEditing(null)}
        okText={t("web.feat.save", "Lưu")}
        cancelText={t("web.feat.cancel", "Huỷ")}
        destroyOnClose
      >
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item name="name" label={t("web.feat.projectName", "Tên dự án")}>
            <Input placeholder={t("web.feat.projectName", "Tên dự án")} maxLength={120} />
          </Form.Item>
          <Form.Item
            name="instructions"
            label={t("web.feat.instructionsLabel", "Chỉ dẫn riêng (Trợ lý AI áp dụng cho mọi hội thoại trong dự án)")}
          >
            <Input.TextArea
              placeholder={t("web.feat.instructionsPlaceholder", "vd: Luôn trả lời bằng tiếng Việt, giọng thân thiện. Bối cảnh: dự án app bán hàng của mình…")}
              autoSize={{ minRows: 5, maxRows: 14 }}
              maxLength={8000}
            />
          </Form.Item>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t("web.feat.instructionsNote", "Chỉ dẫn này được chèn vào ngữ cảnh Trợ lý AI khi bạn chat trong dự án — thử hỏi một câu trong dự án để kiểm.")}
          </Text>
        </Form>
      </Modal>
    </div>
  );
}
