"use client";

import { useEffect, useState } from "react";
import { Button, Form, Input, Select, Tag, Tooltip } from "antd";
import { RobotOutlined } from "@ant-design/icons";

const _base    = process.env.NEXT_PUBLIC_API_BASE || 'https://apihoanam.toolswave.net/api'
const CONFIGS_API = `${_base}/ai-configs`

type AIConfigOption = {
  _id: string
  name: string
  provider: string
  model: string
  isDefault: boolean
  status: string
}

const PROVIDER_COLORS: Record<string, string> = {
  openai: 'green', anthropic: 'purple', google: 'blue',
  groq: 'orange', mistral: 'cyan', nvidia: 'lime', ollama: 'magenta',
  custom: 'default',
}

export default function PromptForm({ onSubmit }: { onSubmit: (v: any) => void }) {
  const [configs, setConfigs] = useState<AIConfigOption[]>([])

  useEffect(() => {
    fetch(`${CONFIGS_API}?status=active`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (d.success) setConfigs(d.data ?? []) })
      .catch(() => {})
  }, [])

  const configOptions = configs.map(c => ({
    value: c._id,
    label: (
      <span>
        <Tag color={PROVIDER_COLORS[c.provider]} style={{ marginRight: 4 }}>{c.provider}</Tag>
        {c.name}
        {c.isDefault && <Tag color="gold" style={{ marginLeft: 4, fontSize: 10 }}>default</Tag>}
      </span>
    ),
  }))

  const defaultConfigId = configs.find(c => c.isDefault)?._id

  return (
    <Form
      layout="vertical"
      onFinish={onSubmit}
      initialValues={{
        language: "vi",
        detailLevel: "high",
        includeAutomations: true,
        includeSampleData: true,
        configId: defaultConfigId,
      }}
    >
      <Form.Item name="message" label="Yêu cầu hệ thống (VD: Thiết kế phần mềm quản lý vận chuyển trung quốc - việt nam)" rules={[{ required: true }]} >
        <Input.TextArea rows={4} />
      </Form.Item>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <Form.Item name="language" label="Ngôn ngữ">
          <Select options={[{ value: "vi", label: "Tiếng Việt" }, { value: "en", label: "English" }]} />
        </Form.Item>

        <Form.Item name="detailLevel" label="Mức độ chi tiết">
          <Select options={[
            { value: "standard", label: "Standard" },
            { value: "high",     label: "High" },
          ]} />
        </Form.Item>

        <Form.Item
          name="configId"
          label={
            <Tooltip title="Chọn AI provider để sinh spec. Mặc định dùng config đã đặt làm default.">
              <span><RobotOutlined className="mr-1" />AI Provider</span>
            </Tooltip>
          }
        >
          <Select
            allowClear
            placeholder="Dùng config mặc định"
            options={configOptions}
            notFoundContent={configs.length === 0 ? "Chưa có AI config" : undefined}
          />
        </Form.Item>
      </div>

      <Button type="primary" htmlType="submit">
        Generate Spec
      </Button>
    </Form>
  );
}
