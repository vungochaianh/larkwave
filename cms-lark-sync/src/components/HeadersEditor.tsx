'use client'

import { Button, Input, Select, Tooltip } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import type { HeaderKV } from '@/lib/curl'

// Common header key suggestions for the autocomplete
const COMMON_HEADERS = [
  'Content-Type',
  'Authorization',
  'Accept',
  'Accept-Language',
  'Cache-Control',
  'X-Request-ID',
  'X-API-Key',
  'X-Access-Token',
  'User-Agent',
  'Referer',
  'Origin',
]

export default function HeadersEditor({
  value,
  onChange,
}: {
  value: HeaderKV[]
  onChange: (v: HeaderKV[]) => void
}) {
  const rows = value?.length ? value : [{ key: '', value: '' }]

  function setRow(i: number, patch: Partial<HeaderKV>) {
    const next = [...rows]
    next[i] = { ...next[i], ...patch }
    onChange(next)
  }

  function add() {
    onChange([...rows, { key: '', value: '' }])
  }

  function remove(i: number) {
    const next = rows.filter((_, idx) => idx !== i)
    onChange(next.length ? next : [{ key: '', value: '' }])
  }

  return (
    <div className="space-y-1">
      {/* Column labels */}
      <div className="grid grid-cols-[1fr_1fr_32px] gap-1 px-1">
        <span className="text-xs text-neutral-400">Key</span>
        <span className="text-xs text-neutral-400">Value</span>
        <span />
      </div>

      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_32px] gap-1 items-center">
          {/* Key — autocomplete */}
          <Select
            showSearch
            allowClear
            mode={undefined}
            placeholder="e.g. Content-Type"
            value={r.key || undefined}
            onChange={(v) => setRow(i, { key: v ?? '' })}
            onSearch={(v) => setRow(i, { key: v })}
            filterOption={(input, option) =>
              String(option?.value ?? '')
                .toLowerCase()
                .includes(input.toLowerCase())
            }
            options={COMMON_HEADERS.map((h) => ({ value: h, label: h }))}
            className="w-full font-mono text-xs"
            size="small"
          />

          {/* Value */}
          <Input
            placeholder="e.g. application/json"
            value={r.value}
            onChange={(e) => setRow(i, { value: e.target.value })}
            className="font-mono text-xs"
            size="small"
          />

          {/* Remove */}
          <Tooltip title="Remove header">
            <Button
              danger
              size="small"
              icon={<DeleteOutlined />}
              onClick={() => remove(i)}
              disabled={rows.length === 1 && !r.key && !r.value}
            />
          </Tooltip>
        </div>
      ))}

      <Button size="small" icon={<PlusOutlined />} onClick={add} className="mt-1">
        Add header
      </Button>
    </div>
  )
}
