'use client'

import type { CurlJob } from '@/lib/types'
import CurlBuilder, { builderFromCurl, type BuilderValue } from './CurlBuilder'
import { Button, Form, Input, InputNumber, Modal, Switch, Typography } from 'antd'
import { useEffect, useState } from 'react'

const { Text } = Typography

export default function JobForm({
  open,
  title,
  initial,
  onClose,
  onSubmit,
}: {
  open: boolean
  title: string
  initial?: CurlJob
  onClose: () => void
  onSubmit: (payload: {
    name: string
    description: string
    intervalMinutes: number
    enabled: boolean
    curlCommand: string
  }) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm()
  const [builder, setBuilder] = useState<BuilderValue>(
    builderFromCurl(initial?.curlCommand),
  )

  useEffect(() => {
    form.setFieldsValue({
      name: initial?.name ?? '',
      description: initial?.description ?? '',
      intervalMinutes: initial?.intervalMinutes ?? 5,
      enabled: initial?.enabled ?? true,
    })
    // When editing an existing job, stay in raw mode so the curl command is
    // preserved exactly as saved — avoids builder re-serialising and mutating it.
    setBuilder(
      initial?.curlCommand
        ? { ...builderFromCurl(initial.curlCommand), mode: 'raw', rawCurl: initial.curlCommand }
        : builderFromCurl(undefined),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, open])

  async function handleOk() {
    const v = await form.validateFields()

    /**
     * BUG FIX: previously both branches returned builder.rawCurl.
     * - In 'raw' mode  → rawCurl is what the user typed in the textarea (correct).
     * - In 'builder' mode → rawCurl is kept in sync by CurlBuilder via useEffect,
     *   so it is also correct to read rawCurl here.  But we add a safety fallback.
     */
    const curlCommand = builder.rawCurl?.trim() || ''

    if (!curlCommand) {
      form.setFields([{ name: 'curlCommand', errors: ['curl command is required'] }])
      return
    }

    const payload = {
      name: v.name,
      description: v.description || '',
      intervalMinutes: v.intervalMinutes,
      enabled: v.enabled ?? true,
      curlCommand,
    }

    setSaving(true)
    try {
      await onSubmit(payload)
    } finally {
      setSaving(false)
    }
  }

  const curlPreviewEmpty = !builder.rawCurl?.trim()

  return (
    <Modal
      open={open}
      title={title}
      onCancel={onClose}
      onOk={handleOk}
      okText={initial ? 'Update' : 'Create'}
      confirmLoading={saving}
      width={1020}
      destroyOnClose
      styles={{ body: { maxHeight: '80vh', overflowY: 'auto' } }}
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: job metadata */}
        <div className="lg:col-span-1 flex flex-col gap-2">
          <Form layout="vertical" form={form}>
            <Form.Item
              name="name"
              label="Job name"
              rules={[{ required: true, message: 'Name is required' }]}
            >
              <Input placeholder="e.g. Sync Lark Table" />
            </Form.Item>

            <Form.Item name="description" label="Description">
              <Input.TextArea rows={3} placeholder="Notes..." />
            </Form.Item>

            <Form.Item
              name="intervalMinutes"
              label="Interval (minutes)"
              rules={[{
                validator: (_, value) => {
                  if (value === null || value === undefined || value === '') {
                    return Promise.reject(new Error('Interval is required'))
                  }
                  if (value < 1) return Promise.reject(new Error('Interval must be at least 1 minute'))
                  if (value > 1440) return Promise.reject(new Error('Interval must be at most 1440 minutes (24h)'))
                  return Promise.resolve()
                },
              }]}
            >
              <InputNumber min={1} max={1440} className="w-full" />
            </Form.Item>

            <Form.Item name="enabled" label="Enabled" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Form>

          {curlPreviewEmpty && (
            <Text type="warning" className="text-xs">
              Please fill in the curl builder or paste a raw curl command.
            </Text>
          )}

          <Text type="secondary" className="text-xs">
            Scheduler runs on the backend. UI only enables/disables and triggers
            manual runs.
          </Text>

          <div className="flex gap-2 pt-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button type="primary" onClick={handleOk} loading={saving}>
              {initial ? 'Update job' : 'Create job'}
            </Button>
          </div>
        </div>

        {/* Right: curl builder */}
        <div className="lg:col-span-2">
          <CurlBuilder value={builder} onChange={setBuilder} />
        </div>
      </div>
    </Modal>
  )
}
