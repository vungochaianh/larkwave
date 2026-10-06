'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { App, Button, Card, Input, InputNumber, Modal, Select, Space, Switch, Typography } from 'antd';
import { AppstoreOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { V } from '../../theme';
import type { PluginPanelField, PluginPanelInfo, RuntimeAdapter } from '@larkwave/core';
import { useI18n } from '../../i18n';

const { Text, Paragraph } = Typography;

/**
 * Renders the no-code form panels declared by enabled plugins. A panel's fields
 * are generated from its tool's input schema; submitting runs the tool directly
 * against Lark (the click is the confirmation for a gated/write panel).
 */
export function PluginPanelsCard({ runtime }: { runtime: RuntimeAdapter }) {
  const { t } = useI18n();
  const { message } = App.useApp();
  const [panels, setPanels] = useState<PluginPanelInfo[]>([]);
  const [active, setActive] = useState<PluginPanelInfo | null>(null);
  const [values, setValues] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');

  useEffect(() => {
    runtime.larkPluginPanels?.().then(setPanels).catch(() => setPanels([]));
  }, [runtime]);

  const open = (p: PluginPanelInfo) => {
    setActive(p);
    setValues({});
    setResult('');
  };

  const submit = async () => {
    if (!active) return;
    const input: Record<string, unknown> = {};
    for (const f of active.fields) {
      let v = values[f.name];
      if (v === undefined || v === '') {
        if (f.required) {
          message.warning(`${t('chat.missingField', 'Thiếu trường')}: ${f.name}`);
          return;
        }
        continue;
      }
      if (f.type === 'object' && typeof v === 'string') {
        try {
          v = JSON.parse(v);
        } catch {
          message.error(`${f.name} ${t('chat.mustBeJson', 'phải là JSON hợp lệ.')}`);
          return;
        }
      }
      input[f.name] = v;
    }
    setBusy(true);
    setResult('');
    try {
      const r = await runtime.larkRunTool!(active.toolName, input);
      if (r.ok) {
        setResult(JSON.stringify(r.data ?? { ok: true }, null, 2));
        message.success(t('chat.runDone', 'Chạy xong.'));
      } else {
        message.error(r.error || t('chat.runFailed', 'Chạy thất bại.'));
      }
    } catch (e) {
      message.error((e as Error)?.message || t('chat.runFailed', 'Chạy thất bại.'));
    } finally {
      setBusy(false);
    }
  };

  if (panels.length === 0) return null; // nothing declared → hide the card

  return (
    <Card
      size="small"
      title={
        <span>
          <AppstoreOutlined /> {t('chat.pluginPanelsTitle', 'Bảng điều khiển plugin')}
        </span>
      }
    >
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        {panels.map((p) => (
          <div
            key={`${p.pluginId}.${p.panelId}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 8px',
              border: `1px solid ${V.border}`,
              borderRadius: 10,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 13 }}>{p.title}</Text>
              <div>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {p.pluginName}
                  {p.gated ? ` · ${t('chat.writeUnit', 'ghi')}` : ''}
                </Text>
              </div>
            </div>
            <Button
              size="small"
              type={p.gated ? 'default' : 'primary'}
              danger={p.gated}
              icon={<ThunderboltOutlined />}
              onClick={() => open(p)}
            >
              {t('chat.open', 'Mở')}
            </Button>
          </div>
        ))}
      </Space>

      <Modal
        open={!!active}
        title={active?.title}
        onCancel={() => setActive(null)}
        okText={active?.submitLabel || t('chat.run', 'Chạy')}
        okButtonProps={{ danger: active?.gated, loading: busy }}
        onOk={submit}
      >
        {active && (
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            {active.description && (
              <Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12 }}>
                {active.description}
              </Paragraph>
            )}
            {active.fields.map((f) => (
              <FieldInput
                key={f.name}
                field={f}
                value={values[f.name]}
                onChange={(v) => setValues((s) => ({ ...s, [f.name]: v }))}
              />
            ))}
            {result && (
              <pre
                style={{
                  margin: 0,
                  padding: 8,
                  background: V.surfaceAlt,
                  border: `1px solid ${V.border}`,
                  borderRadius: 8,
                  maxHeight: 220,
                  overflow: 'auto',
                  fontSize: 11.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {result}
              </pre>
            )}
          </Space>
        )}
      </Modal>
    </Card>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: PluginPanelField;
  value: any;
  onChange: (v: any) => void;
}) {
  let control: ReactNode;
  if (field.enum) {
    control = (
      <Select
        style={{ width: '100%' }}
        value={value}
        onChange={onChange}
        options={field.enum.map((e) => ({ label: e, value: e }))}
      />
    );
  } else if (field.type === 'boolean') {
    control = <Switch checked={!!value} onChange={onChange} />;
  } else if (field.type === 'number' || field.type === 'integer') {
    control = <InputNumber style={{ width: '100%' }} value={value} onChange={onChange} />;
  } else if (field.type === 'object') {
    control = (
      <Input.TextArea
        autoSize={{ minRows: 2, maxRows: 6 }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="JSON"
      />
    );
  } else {
    control = <Input value={value} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <div>
      <Text style={{ fontSize: 12 }}>
        {field.name}
        {field.required ? ' *' : ''}
        {field.description ? ` — ${field.description}` : ''}
      </Text>
      <div style={{ marginTop: 4 }}>{control}</div>
    </div>
  );
}
