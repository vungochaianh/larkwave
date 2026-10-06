'use client'

/**
 * LarkMsgBuilder — Visual builder for Lark Bot message templates.
 *
 * Supported formats:
 *   card  — Interactive card (header + div/hr/action elements, uses lark_md)
 *   post  — Rich text post (title + rows of inline text/link segments)
 *   text  — Plain text with {{field}} placeholders
 *
 * Templates for card/post are stored as JSON in the parent's `larkTemplate` field.
 * The backend (webhookDispatch.js) detects and parses this JSON at dispatch time.
 */

import React, { useState, useMemo } from 'react'

// Sanitize HTML to prevent XSS when using dangerouslySetInnerHTML
function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}
import {
  Button, Input, Select, Space, Tag, Tooltip, Typography,
} from 'antd'
import {
  ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined,
} from '@ant-design/icons'

const { Text } = Typography

// ── Types ──────────────────────────────────────────────────────────────────────

export type PostSegment =
  | { tag: 'text'; text: string; bold?: boolean }
  | { tag: 'a';    text: string; href: string }

export type CardElement =
  | { tag: 'div';    content: string }
  | { tag: 'hr' }
  | { tag: 'action'; buttons: { text: string; url: string }[] }

export type LarkPostConfig = {
  type:  'post'
  title: string
  rows:  PostSegment[][]
}

export type LarkCardConfig = {
  type:        'card'
  headerColor: string
  title:       string
  elements:    CardElement[]
}

export type LarkMsgConfig = LarkPostConfig | LarkCardConfig

// ── Serialization ──────────────────────────────────────────────────────────────

export function parseLarkConfig(raw: string): LarkMsgConfig | null {
  if (!raw?.trim().startsWith('{')) return null
  try {
    const p = JSON.parse(raw)
    if (p?.type === 'post' || p?.type === 'card') return p as LarkMsgConfig
    return null
  } catch { return null }
}

export function serializeLarkConfig(cfg: LarkMsgConfig): string {
  return JSON.stringify(cfg, null, 2)
}

// ── Defaults ───────────────────────────────────────────────────────────────────

const DEFAULT_POST: LarkPostConfig = {
  type:  'post',
  title: '{{table}} — {{event}}',
  rows: [
    [{ tag: 'text', text: '🕐 {{timestamp}}' }],
    [{ tag: 'text', text: 'Khách: ', bold: true }, { tag: 'text', text: '{{customer}}' }],
  ],
}

const DEFAULT_CARD: LarkCardConfig = {
  type:        'card',
  headerColor: 'blue',
  title:       '{{table}} — {{event}}',
  elements: [
    { tag: 'div', content: '🕐 {{timestamp}}' },
    { tag: 'hr' },
    { tag: 'div', content: '**Trường 1**: {{field1}}' },
  ],
}

// ── Preview helpers ────────────────────────────────────────────────────────────

const HEADER_COLORS: Record<string, string> = {
  blue:      'bg-blue-500',
  green:     'bg-green-500',
  orange:    'bg-orange-500',
  red:       'bg-red-500',
  purple:    'bg-purple-600',
  turquoise: 'bg-teal-500',
  yellow:    'bg-yellow-400',
}

function applyPh(text: string, data: Record<string, unknown>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) =>
    data[k] != null ? String(data[k]) : `{{${k}}}`
  )
}

// ── LarkCardPreview ────────────────────────────────────────────────────────────

function LarkCardPreview({ cfg, data }: { cfg: LarkCardConfig; data: Record<string, unknown> }) {
  const title  = applyPh(cfg.title, data)
  const hClass = HEADER_COLORS[cfg.headerColor] ?? 'bg-blue-500'

  return (
    <div className="border border-neutral-200 rounded-lg overflow-hidden text-xs shadow max-w-sm">
      <div className={`${hClass} px-3 py-2 text-white font-semibold leading-snug`}>
        {title || <em className="opacity-60">tiêu đề</em>}
      </div>
      <div className="bg-white">
        {(cfg.elements ?? []).map((el, i) => {
          if (el.tag === 'hr') {
            return <div key={i} className="border-t border-neutral-100 mx-3 my-0.5" />
          }
          if (el.tag === 'action') {
            return (
              <div key={i} className="px-3 py-2 flex flex-wrap gap-1.5">
                {el.buttons.map((b, j) => (
                  <span key={j}
                    className="px-2.5 py-1 border border-neutral-300 rounded text-neutral-700 bg-neutral-50 cursor-default hover:bg-neutral-100"
                  >
                    {applyPh(b.text, data) || 'Button'}
                  </span>
                ))}
              </div>
            )
          }
          // div — simplified lark_md render
          const html = escapeHtml(applyPh(el.content ?? '', data))
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br/>')
          return (
            <div key={i} className="px-3 py-2 text-neutral-800 leading-relaxed"
              dangerouslySetInnerHTML={{
                __html: html || '<span style="color:#ccc">(trống)</span>',
              }}
            />
          )
        })}
        {(cfg.elements ?? []).length === 0 && (
          <div className="px-3 py-3 text-neutral-300 italic">Chưa có element</div>
        )}
      </div>
    </div>
  )
}

// ── LarkPostPreview ────────────────────────────────────────────────────────────

function LarkPostPreview({ cfg, data }: { cfg: LarkPostConfig; data: Record<string, unknown> }) {
  const title = applyPh(cfg.title, data)
  return (
    <div className="border border-neutral-200 rounded-lg overflow-hidden text-xs shadow max-w-sm">
      <div className="bg-neutral-50 border-b border-neutral-200 px-3 py-2 font-semibold text-neutral-800">
        {title || <em className="text-neutral-400">tiêu đề</em>}
      </div>
      <div className="bg-white px-3 py-2 space-y-0.5">
        {(cfg.rows ?? []).map((row, i) => (
          <div key={i} className="flex flex-wrap gap-0.5 leading-relaxed">
            {row.map((seg, j) => {
              const t = applyPh(seg.text, data)
              if (seg.tag === 'a') {
                return <span key={j} className="text-blue-600 underline cursor-pointer">{t || seg.href || 'link'}</span>
              }
              return (
                <span key={j} className={seg.bold ? 'font-bold text-neutral-900' : 'text-neutral-700'}>{t}</span>
              )
            })}
            {row.length === 0 && <span className="text-neutral-300 italic">row trống</span>}
          </div>
        ))}
        {(cfg.rows ?? []).length === 0 && (
          <div className="text-neutral-300 italic py-2">Chưa có row</div>
        )}
      </div>
    </div>
  )
}

// ── PostBuilder ────────────────────────────────────────────────────────────────

function PostBuilder({
  cfg, sampleFields, onChange,
}: {
  cfg:          LarkPostConfig
  sampleFields: string[]
  onChange:     (c: LarkPostConfig) => void
}) {
  const fieldOpts = sampleFields.map(f => ({ label: `{{${f}}}`, value: `{{${f}}}` }))

  function setRows(rows: PostSegment[][]) { onChange({ ...cfg, rows }) }

  function addRow() { setRows([...cfg.rows, [{ tag: 'text', text: '' }]]) }
  function removeRow(ri: number) { setRows(cfg.rows.filter((_, i) => i !== ri)) }
  function moveRow(ri: number, dir: -1 | 1) {
    const rows = [...cfg.rows]
    const j = ri + dir
    if (j < 0 || j >= rows.length) return
    ;[rows[ri], rows[j]] = [rows[j], rows[ri]]
    setRows(rows)
  }

  function addSeg(ri: number, type: 'text' | 'a') {
    const seg: PostSegment = type === 'a'
      ? { tag: 'a', text: '', href: '' }
      : { tag: 'text', text: '' }
    setRows(cfg.rows.map((r, i) => i === ri ? [...r, seg] : r))
  }
  function removeSeg(ri: number, si: number) {
    setRows(cfg.rows.map((r, i) => i === ri ? r.filter((_, j) => j !== si) : r))
  }
  function patchSeg(ri: number, si: number, patch: Partial<PostSegment>) {
    setRows(cfg.rows.map((r, i) =>
      i === ri ? r.map((s, j) => j === si ? { ...s, ...patch } as PostSegment : s) : r
    ))
  }

  return (
    <div className="space-y-3 min-w-0">
      <div>
        <Text className="text-xs font-medium text-neutral-600 block mb-1">Tiêu đề</Text>
        <Input size="small" value={cfg.title}
          onChange={e => onChange({ ...cfg, title: e.target.value })}
          placeholder="{{table}} — {{event}}"
        />
      </div>

      <div>
        <Text className="text-xs font-medium text-neutral-600 block mb-1.5">Rows</Text>
        <div className="space-y-2">
          {cfg.rows.map((row, ri) => (
            <div key={ri} className="border border-neutral-200 rounded-md p-2 bg-neutral-50">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-neutral-400 font-mono">row {ri + 1}</span>
                <Space size={2}>
                  <Button size="small" type="text" icon={<ArrowUpOutlined />}
                    disabled={ri === 0} onClick={() => moveRow(ri, -1)} />
                  <Button size="small" type="text" icon={<ArrowDownOutlined />}
                    disabled={ri === cfg.rows.length - 1} onClick={() => moveRow(ri, 1)} />
                  <Button size="small" type="text" danger icon={<DeleteOutlined />}
                    onClick={() => removeRow(ri)} />
                </Space>
              </div>

              <div className="space-y-1.5">
                {row.map((seg, si) => (
                  <div key={si} className="flex gap-1 items-center flex-wrap">
                    <Select size="small" style={{ width: 68 }}
                      value={seg.tag}
                      onChange={v => patchSeg(ri, si, v === 'a'
                        ? { tag: 'a', text: seg.text, href: '' }
                        : { tag: 'text', text: seg.text }
                      )}
                      options={[{ value: 'text', label: 'Text' }, { value: 'a', label: 'Link' }]}
                    />
                    {seg.tag === 'text' && (
                      <>
                        <Input size="small" style={{ flex: 1, minWidth: 80 }}
                          value={seg.text}
                          onChange={e => patchSeg(ri, si, { text: e.target.value })}
                          placeholder="nội dung hoặc {{field}}"
                        />
                        <Tooltip title="In đậm">
                          <Button size="small"
                            type={seg.bold ? 'primary' : 'default'}
                            style={{ fontWeight: 700, minWidth: 28, padding: '0 6px' }}
                            onClick={() => patchSeg(ri, si, { bold: !seg.bold })}
                          >B</Button>
                        </Tooltip>
                        {sampleFields.length > 0 && (
                          <Select size="small" style={{ width: 96 }}
                            placeholder="field…"
                            options={fieldOpts}
                            value={null}
                            onChange={v => patchSeg(ri, si, { text: seg.text + v })}
                          />
                        )}
                      </>
                    )}
                    {seg.tag === 'a' && (
                      <>
                        <Input size="small" style={{ flex: 1, minWidth: 60 }}
                          value={seg.text}
                          onChange={e => patchSeg(ri, si, { text: e.target.value })}
                          placeholder="label"
                        />
                        <Input size="small" style={{ flex: 2, minWidth: 80 }}
                          value={seg.href}
                          onChange={e => patchSeg(ri, si, { href: e.target.value })}
                          placeholder="https://…"
                        />
                      </>
                    )}
                    <Button size="small" type="text" danger onClick={() => removeSeg(ri, si)}>✕</Button>
                  </div>
                ))}
              </div>

              <div className="flex gap-1 mt-2">
                <Button size="small" type="dashed" onClick={() => addSeg(ri, 'text')}>+ Text</Button>
                <Button size="small" type="dashed" onClick={() => addSeg(ri, 'a')}>+ Link</Button>
              </div>
            </div>
          ))}
        </div>
        <Button size="small" type="dashed" icon={<PlusOutlined />} block className="mt-2"
          onClick={addRow}
        >Thêm row</Button>
      </div>
    </div>
  )
}

// ── CardBuilder ────────────────────────────────────────────────────────────────

const CARD_COLOR_OPTS = [
  { value: 'blue',      label: '🔵 Blue'      },
  { value: 'green',     label: '🟢 Green'     },
  { value: 'orange',    label: '🟠 Orange'    },
  { value: 'red',       label: '🔴 Red'       },
  { value: 'purple',    label: '🟣 Purple'    },
  { value: 'turquoise', label: '🩵 Turquoise' },
  { value: 'yellow',    label: '🟡 Yellow'    },
]

function CardBuilder({
  cfg, sampleFields, onChange,
}: {
  cfg:          LarkCardConfig
  sampleFields: string[]
  onChange:     (c: LarkCardConfig) => void
}) {
  const fieldOpts = sampleFields.map(f => ({ label: `{{${f}}}`, value: `{{${f}}}` }))

  function setEls(elements: CardElement[]) { onChange({ ...cfg, elements }) }

  function addEl(el: CardElement) { setEls([...cfg.elements, el]) }
  function removeEl(i: number)  { setEls(cfg.elements.filter((_, j) => j !== i)) }
  function moveEl(i: number, dir: -1 | 1) {
    const els = [...cfg.elements]
    const j = i + dir
    if (j < 0 || j >= els.length) return
    ;[els[i], els[j]] = [els[j], els[i]]
    setEls(els)
  }
  function patchEl(i: number, patch: Partial<CardElement>) {
    setEls(cfg.elements.map((el, j) => j === i ? { ...el, ...patch } as CardElement : el))
  }

  return (
    <div className="space-y-3 min-w-0">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Text className="text-xs font-medium text-neutral-600 block mb-1">Tiêu đề</Text>
          <Input size="small" value={cfg.title}
            onChange={e => onChange({ ...cfg, title: e.target.value })}
            placeholder="{{table}} — {{event}}"
          />
        </div>
        <div>
          <Text className="text-xs font-medium text-neutral-600 block mb-1">Màu header</Text>
          <Select size="small" className="w-full" value={cfg.headerColor}
            onChange={v => onChange({ ...cfg, headerColor: v })}
            options={CARD_COLOR_OPTS}
          />
        </div>
      </div>

      <div>
        <Text className="text-xs font-medium text-neutral-600 block mb-1.5">Elements</Text>
        <div className="space-y-2">
          {cfg.elements.map((el, i) => (
            <div key={i} className="border border-neutral-200 rounded-md p-2 bg-neutral-50">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Tag
                  color={el.tag === 'hr' ? 'default' : el.tag === 'action' ? 'orange' : 'blue'}
                  className="text-xs m-0"
                >{el.tag}</Tag>
                <div className="flex-1" />
                <Space size={2}>
                  <Button size="small" type="text" icon={<ArrowUpOutlined />}
                    disabled={i === 0} onClick={() => moveEl(i, -1)} />
                  <Button size="small" type="text" icon={<ArrowDownOutlined />}
                    disabled={i === cfg.elements.length - 1} onClick={() => moveEl(i, 1)} />
                  <Button size="small" type="text" danger icon={<DeleteOutlined />}
                    onClick={() => removeEl(i)} />
                </Space>
              </div>

              {el.tag === 'div' && (
                <div>
                  <Input.TextArea size="small" rows={2}
                    value={el.content}
                    onChange={e => patchEl(i, { content: e.target.value })}
                    placeholder="**Label**: {{field}}&#10;Hỗ trợ lark_md markdown"
                  />
                  {sampleFields.length > 0 && (
                    <Select size="small" className="mt-1" style={{ width: 120 }}
                      placeholder="chèn field…"
                      options={fieldOpts}
                      value={null}
                      onChange={v => patchEl(i, { content: (el.content ?? '') + v })}
                    />
                  )}
                </div>
              )}

              {el.tag === 'action' && (
                <div className="space-y-1.5">
                  {el.buttons.map((btn, bi) => (
                    <div key={bi} className="flex gap-1 items-center">
                      <Input size="small" style={{ flex: 1 }}
                        value={btn.text}
                        onChange={e => {
                          const buttons = el.buttons.map((b, j) => j === bi ? { ...b, text: e.target.value } : b)
                          patchEl(i, { buttons } as Partial<Extract<CardElement, { tag: 'action' }>>)
                        }}
                        placeholder="Label button"
                      />
                      <Input size="small" style={{ flex: 2 }}
                        value={btn.url}
                        onChange={e => {
                          const buttons = el.buttons.map((b, j) => j === bi ? { ...b, url: e.target.value } : b)
                          patchEl(i, { buttons } as Partial<Extract<CardElement, { tag: 'action' }>>)
                        }}
                        placeholder="https://..."
                      />
                      <Button size="small" type="text" danger
                        onClick={() => {
                          const buttons = el.buttons.filter((_, j) => j !== bi)
                          patchEl(i, { buttons } as Partial<Extract<CardElement, { tag: 'action' }>>)
                        }}
                      >✕</Button>
                    </div>
                  ))}
                  <Button size="small" type="dashed" icon={<PlusOutlined />}
                    onClick={() => {
                      const buttons = [...el.buttons, { text: '', url: '' }]
                      patchEl(i, { buttons } as Partial<Extract<CardElement, { tag: 'action' }>>)
                    }}
                  >Thêm button</Button>
                </div>
              )}
            </div>
          ))}
          {cfg.elements.length === 0 && (
            <div className="text-xs text-neutral-400 italic text-center py-2">Chưa có element nào</div>
          )}
        </div>

        <div className="flex gap-1.5 mt-2">
          <Button size="small" type="dashed"
            onClick={() => addEl({ tag: 'div', content: '' })}
          >+ Div</Button>
          <Button size="small" type="dashed"
            onClick={() => addEl({ tag: 'hr' })}
          >+ HR</Button>
          <Button size="small" type="dashed"
            onClick={() => addEl({ tag: 'action', buttons: [{ text: 'View', url: '' }] })}
          >+ Action</Button>
        </div>
      </div>
    </div>
  )
}

// ── LarkMsgBuilder (main export) ───────────────────────────────────────────────

type Props = {
  value:        string
  onChange:     (v: string) => void
  format:       'card' | 'post' | 'text'
  sampleFields: string[]
  sampleData:   Record<string, unknown>
}

export function LarkMsgBuilder({ value, onChange, format, sampleFields, sampleData }: Props) {
  const [tab, setTab] = useState<'visual' | 'json'>('visual')

  const parsed  = parseLarkConfig(value)
  const isBuilt = parsed?.type === format   // structured JSON for current format

  function initTemplate() {
    const def = format === 'post' ? DEFAULT_POST : DEFAULT_CARD
    onChange(serializeLarkConfig(def))
  }
  function clearTemplate() {
    onChange('')
    setTab('visual')
  }

  // ── Text format: simple textarea + inline preview ──────────────────────────
  if (format === 'text') {
    const preview = value.replace(/\{\{(\w+)\}\}/g, (_, k) =>
      sampleData[k] != null ? String(sampleData[k]) : `{{${k}}}`
    )
    return (
      <div className="space-y-2">
        <Input.TextArea rows={3} value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={'{{table}} — {{event}}\nKhách: {{customer}}\nTổng: {{amount}}'}
        />
        {value.trim() && (
          <div className="bg-neutral-50 border border-neutral-200 rounded p-2 text-xs font-mono whitespace-pre-wrap text-neutral-700">
            {preview}
          </div>
        )}
      </div>
    )
  }

  // ── Card / Post: visual builder ────────────────────────────────────────────
  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-2">
        {isBuilt ? (
          <>
            <div className="flex border border-neutral-200 rounded overflow-hidden text-xs select-none">
              {(['visual', 'json'] as const).map(t => (
                <button key={t}
                  className={`px-2.5 py-0.5 transition-colors ${tab === t ? 'bg-blue-500 text-white' : 'bg-white text-neutral-600 hover:bg-neutral-50'}`}
                  onClick={() => setTab(t)}
                >{t === 'visual' ? 'Visual' : 'JSON'}</button>
              ))}
            </div>
            <Button size="small" danger type="text" onClick={clearTemplate}>Xoá template</Button>
          </>
        ) : (
          <div className="flex items-center gap-2 w-full">
            <Text className="text-xs text-neutral-400 flex-1">
              Để trống = tự động format toàn bộ field. Nhấn để thiết kế template tuỳ chỉnh.
            </Text>
            <Button size="small" type="primary" onClick={initTemplate}>
              Tạo template {format}
            </Button>
          </div>
        )}
      </div>

      {/* JSON editor */}
      {isBuilt && tab === 'json' && (
        <Input.TextArea rows={10} value={value}
          onChange={e => onChange(e.target.value)}
          className="font-mono text-xs"
        />
      )}

      {/* Visual builder + preview side by side */}
      {isBuilt && tab === 'visual' && (
        <div className="grid grid-cols-2 gap-4 items-start">
          <div className="min-w-0">
            {format === 'post' ? (
              <PostBuilder
                cfg={parsed as LarkPostConfig}
                sampleFields={sampleFields}
                onChange={c => onChange(serializeLarkConfig(c))}
              />
            ) : (
              <CardBuilder
                cfg={parsed as LarkCardConfig}
                sampleFields={sampleFields}
                onChange={c => onChange(serializeLarkConfig(c))}
              />
            )}
          </div>
          <div className="min-w-0">
            <Text className="text-xs font-medium text-neutral-500 block mb-2">Preview</Text>
            {format === 'post' ? (
              <LarkPostPreview cfg={parsed as LarkPostConfig} data={sampleData} />
            ) : (
              <LarkCardPreview cfg={parsed as LarkCardConfig} data={sampleData} />
            )}
            {Object.keys(sampleData).length === 0 && (
              <Text className="text-xs text-neutral-400 block mt-2">
                Dán JSON mẫu ở trên để xem preview với dữ liệu thật.
              </Text>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
