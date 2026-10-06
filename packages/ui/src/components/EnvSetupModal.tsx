'use client';
import { useEffect, useState } from 'react';
import { App, Button, Form, Input, Modal, Space, Typography } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import type { EnvVarSpec } from '@larkwave/core';
import { useRuntime } from '../RuntimeProvider';

const { Text, Paragraph } = Typography;

/**
 * "Cấu hình .env" — fill the env vars a cloned/local app expects (parsed from its
 * `.env.example`) and write a real `.env` to the app root so it can run locally.
 * Values are written via the existing path-guarded writeAppFile(appId, '.env', …).
 */
export function EnvSetupModal({
  open,
  appId,
  keys,
  onClose,
  onSaved,
}: {
  open: boolean;
  appId: string;
  keys: EnvVarSpec[];
  onClose: () => void;
  onSaved?: () => void;
}) {
  const runtime = useRuntime();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  // The modal is reused across apps; `initialValue` only applies on first mount, so
  // (re)populate the fields from the current keys each time it opens.
  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue(Object.fromEntries(keys.map((k) => [k.name, k.defaultValue ?? ''])));
    }
  }, [open, keys, form]);

  const save = async () => {
    if (!runtime.writeAppFile) return;
    const vals = await form.validateFields().catch(() => null);
    if (!vals) return;
    // Build KEY=value lines for every expected var (empty stays empty — user can edit raw later).
    const body =
      keys
        .map((k) => `${k.name}=${(vals[k.name] ?? '').toString()}`)
        .join('\n') + '\n';
    setSaving(true);
    try {
      await runtime.writeAppFile(appId, '.env', body);
      message.success('Đã lưu .env — chạy lại preview để áp dụng.');
      onSaved?.();
      onClose();
    } catch (e) {
      message.error((e as Error).message || 'Không lưu được .env.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={560}
      title={
        <Space>
          <SettingOutlined style={{ color: '#6C5CE7' }} />
          <span>Cấu hình .env</span>
        </Space>
      }
      footer={[
        <Button key="c" onClick={onClose}>
          Đóng
        </Button>,
        <Button key="s" type="primary" loading={saving} disabled={!keys.length} onClick={save}>
          Lưu .env
        </Button>,
      ]}
    >
      <Paragraph type="secondary" style={{ marginTop: 0 }}>
        Dự án này cần một số biến môi trường (lấy từ <code>.env.example</code>). Điền giá trị rồi Lưu — file{' '}
        <code>.env</code> sẽ được tạo trong app để chạy local.
      </Paragraph>
      {keys.length === 0 ? (
        <Text type="secondary">Không tìm thấy biến nào trong .env.example.</Text>
      ) : (
        <Form form={form} layout="vertical" requiredMark={false}>
          {keys.map((k) => (
            <Form.Item
              key={k.name}
              name={k.name}
              label={<Text code>{k.name}</Text>}
              help={k.comment}
              initialValue={k.defaultValue ?? ''}
            >
              <Input placeholder={k.defaultValue || k.comment || 'giá trị…'} />
            </Form.Item>
          ))}
        </Form>
      )}
    </Modal>
  );
}
