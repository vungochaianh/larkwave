'use client'

import {
  Alert, Avatar, Badge, Button, Card, Col, Empty, Input,
  Popconfirm, Row, Select, Skeleton, Space, Tag, Tooltip, Typography, message,
} from 'antd'
import {
  CheckOutlined, CloseOutlined, LoginOutlined, ReloadOutlined,
  RollbackOutlined, RobotOutlined, SaveOutlined, SearchOutlined, TableOutlined,
} from '@ant-design/icons'
import { useEffect, useRef, useState } from 'react'
import { getLarkFields, getLarkTables, batchUpdateLarkFields, setLarkToken } from '@/lib/api'
import { getLarkRedirectUri } from '@/lib/larkOAuth'
import { useCommon } from './_lib/useCommon'
import { TYPE_COLOR } from './_lib/constants'
import type { LarkBase, LarkField } from './_lib/types'
import TourGuide from '@/components/TourGuide'
import { tourSteps } from '@/lib/tourSteps'

const { Title, Text } = Typography
const { TextArea } = Input

const API_BASE   = process.env.NEXT_PUBLIC_API_BASE || 'https://apihoanam.toolswave.net/api'
const API_ORIGIN = API_BASE.replace(/\/api$/, '')

export default function DesignPage() {
  const {
    userToken, userName, userAvatar, appId, setAppId, sessionExpired, setSessionExpired,
    larkAccounts, selectedAccountId, setSelectedAccountId,
    aiConfigs, selectedAiConfigId, setSelectedAiConfigId, getAIParams,
    bases, loadingBases, basesError, setBasesError, loadBases, basesLoadedAt,
    handleLogin, handleLogout, isAuthError,
  } = useCommon()

  const [tables,        setTables]        = useState<{ tableId: string; name: string }[]>([])
  const [tableCounts,   setTableCounts]   = useState<Record<string, number>>({})
  const [fields,        setFields]        = useState<LarkField[]>([])
  const [selectedBase,  setSelectedBase]  = useState<LarkBase | null>(null)
  const [selectedTable, setSelectedTable] = useState<{ tableId: string; name: string } | null>(null)
  const [tablesError,   setTablesError]   = useState<string | null>(null)
  const [fieldsError,   setFieldsError]   = useState<string | null>(null)
  const [saveError,     setSaveError]     = useState<string | null>(null)
  const [loadingTables, setLoadingTables] = useState(false)
  const [loadingFields, setLoadingFields] = useState(false)
  const [saving,        setSaving]        = useState(false)
  const [aiPrompt,      setAiPrompt]      = useState('')
  const [aiResult,      setAiResult]      = useState<any>(null)
  const [aiLoading,     setAiLoading]     = useState(false)
  const [aiError,       setAiError]       = useState<string | null>(null)
  const [baseSearch,    setBaseSearch]    = useState('')
  const [tableSearch,   setTableSearch]   = useState('')
  const [fieldsLoadedAt, setFieldsLoadedAt] = useState<Date | null>(null)

  const saveBarRef = useRef<HTMLDivElement>(null)

  const dirtyCount   = fields.filter(f => f.dirty).length
  const filteredBases  = bases.filter(b => b.name.toLowerCase().includes(baseSearch.toLowerCase()))
  const filteredTables = tables.filter(t => t.name.toLowerCase().includes(tableSearch.toLowerCase()))

  // ── Ctrl+S to save ────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && dirtyCount > 0 && !saving) {
        e.preventDefault(); saveToLark()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dirtyCount, saving, fields, selectedBase, selectedTable])

  async function selectBase(base: LarkBase) {
    if (selectedBase?.appToken === base.appToken) return
    setSelectedBase(base); setSelectedTable(null); setFields([])
    setAiResult(null); setTablesError(null); setFieldsError(null)
    setTableSearch(''); setFieldsLoadedAt(null)
    setLoadingTables(true)
    try {
      const res = await getLarkTables(base.appToken)
      setTables(res.data)
    } catch (e: any) {
      const msg = e.message || 'Failed to load tables'
      setTablesError(msg); if (isAuthError(msg)) setSessionExpired(true)
    } finally { setLoadingTables(false) }
  }

  async function selectTable(table: { tableId: string; name: string }) {
    setSelectedTable(table); setFields([]); setAiResult(null)
    setFieldsError(null); setSaveError(null); setFieldsLoadedAt(null)
    setLoadingFields(true)
    try {
      const res = await getLarkFields(selectedBase!.appToken, table.tableId)
      const mapped = res.data.map((f: any) => ({ ...f, editName: f.name, editDescription: f.description ?? '', dirty: false }))
      setFields(mapped)
      setTableCounts(prev => ({ ...prev, [table.tableId]: mapped.length }))
      setFieldsLoadedAt(new Date())
    } catch (e: any) {
      const msg = e.message || 'Failed to load fields'
      setFieldsError(msg); if (isAuthError(msg)) setSessionExpired(true)
    } finally { setLoadingFields(false) }
  }

  function revertField(idx: number) {
    setFields(p => p.map((f, i) => i !== idx ? f : { ...f, editName: f.name, editDescription: f.description, dirty: false }))
  }

  function revertAll() {
    setFields(p => p.map(f => ({ ...f, editName: f.name, editDescription: f.description, dirty: false })))
  }

  async function askClaude() {
    if (!fields.length) { message.warning('Load a table first'); return }
    if (!selectedAiConfigId) { message.error('Chưa chọn AI config'); return }
    setAiLoading(true); setAiResult(null); setAiError(null)
    try {
      const res = await fetch(`${API_ORIGIN}/api/ai/design`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schema: {
            tableName: selectedTable?.name, baseName: selectedBase?.name,
            fields: fields.map(f => ({ fieldId: f.fieldId, name: f.name, type: f.typeName, isPrimary: f.isPrimary, description: f.description })),
          },
          prompt: aiPrompt,
          ...getAIParams(),
        }),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'AI design failed')
      setAiResult(data.data)
      if (data.data.fields?.length) {
        setFields(prev => prev.map(f => {
          const s = data.data.fields.find((x: any) => x.fieldId === f.fieldId)
          if (!s) return f
          return { ...f, editName: s.name || f.editName, editDescription: s.description ?? f.editDescription, dirty: s.name !== f.name || (s.description ?? f.description) !== f.description }
        }))
      }
    } catch (e: any) { setAiError(e.message || 'AI request failed') }
    finally { setAiLoading(false) }
  }

  async function saveToLark() {
    const dirty = fields.filter(f => f.dirty)
    if (!dirty.length) { message.info('No changes to save'); return }
    setSaving(true); setSaveError(null)
    try {
      const isSystemField = (f: LarkField) => f.type >= 1001
      const updates = dirty
        .filter(f => !isSystemField(f))
        .map(f => ({
          fieldId:     f.fieldId,
          name:        (!f.isPrimary && f.editName !== f.name) ? f.editName : undefined,
          description: f.editDescription !== f.description ? f.editDescription : undefined,
        }))
        .filter(u => u.name !== undefined || u.description !== undefined)
      const res    = await batchUpdateLarkFields(selectedBase!.appToken, selectedTable!.tableId, updates)
      const failed = res.results.filter((r: any) => !r.success)
      if (failed.length) {
        setSaveError(`${failed.length} field(s) thất bại — ${failed.map((r: any) => `${r.fieldId}: ${r.error}`).join('; ')}`)
        message.warning(`${res.results.length - failed.length} saved, ${failed.length} failed`)
      } else {
        message.success(`Đã lưu ${res.results.length} field(s) ✓`)
        setFields(prev => prev.map(f => ({ ...f, dirty: false, name: f.editName ?? f.name, description: f.editDescription ?? f.description })))
        setFieldsLoadedAt(new Date())
      }
    } catch (e: any) {
      const msg = e.message || 'Save failed'
      setSaveError(msg); if (isAuthError(msg)) setSessionExpired(true)
    } finally { setSaving(false) }
  }

  // ── Login screen ─────────────────────────────────────────────────────────
  if (!userToken && !sessionExpired) {
    return (
      <div className="p-6 max-w-md mx-auto pt-16">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <LoginOutlined className="text-2xl text-blue-500" />
          </div>
          <Title level={4} className="!mb-1">Kết nối tài khoản Lark</Title>
          <Text className="text-neutral-500 text-sm">Đăng nhập để chỉnh sửa schema của Lark Base</Text>
        </div>
        <Card className="shadow-sm">
          <Space direction="vertical" className="w-full" size="middle">
            {larkAccounts.length > 0 ? (
              <>
                <div>
                  <Text className="text-xs text-neutral-500 block mb-1.5">Chọn Lark App</Text>
                  <Select className="w-full" placeholder="Chọn Lark App…"
                    value={selectedAccountId || undefined}
                    onChange={id => {
                      setSelectedAccountId(id)
                      const acc = larkAccounts.find(a => a._id === id)
                      if (acc) { setAppId(acc.appId); localStorage.setItem('lark_app_id', acc.appId) }
                    }}
                    options={larkAccounts.map(a => ({
                      value: a._id,
                      label: <span>{a.isDefault ? '⭐ ' : ''}{a.name} <span className="text-neutral-400 text-xs">({a.appId})</span></span>,
                    }))}
                  />
                  <a href="/lark/accounts" className="text-xs text-blue-500 mt-1 block">+ Quản lý Lark Accounts</a>
                </div>
              </>
            ) : (
              <div>
                <Text className="text-xs text-neutral-500 block mb-1.5">App ID</Text>
                <Input placeholder="cli_…" value={appId} onChange={e => setAppId(e.target.value)} />
              </div>
            )}
            <Button type="primary" block size="large" icon={<LoginOutlined />} onClick={handleLogin}>
              Login với Lark OAuth
            </Button>
            <Text className="text-xs text-neutral-400 text-center block">
              Redirect URI: <code className="break-all">{getLarkRedirectUri()}</code>
            </Text>
          </Space>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-4">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <Title level={4} className="!mb-0">Design Existing Base</Title>
          <Text className="text-neutral-500 text-sm">Chỉnh sửa field names & descriptions · AI hỗ trợ · Ctrl+S để lưu</Text>
        </div>
        <Space wrap size="small">
          <Select size="small" placeholder="AI config" value={selectedAiConfigId || undefined}
            onChange={setSelectedAiConfigId} style={{ minWidth: 160 }}
            options={aiConfigs.map(c => ({ label: `${c.name} (${c.provider})`, value: c._id }))}
            notFoundContent={<span className="text-xs">Chưa có — <a href="/settings/ai">Cài đặt → AI</a></span>}
          />
          {userToken && (
            <Space size="small">
              {userAvatar && <Avatar src={userAvatar} size="small" />}
              <Text className="text-sm hidden sm:inline">{userName || 'Lark User'}</Text>
              <Button size="small" danger onClick={handleLogout}>Logout</Button>
            </Space>
          )}
        </Space>
      </div>

      {sessionExpired && (
        <Alert type="warning" showIcon className="mb-4" message="Session hết hạn — đăng nhập lại"
          action={<Button size="small" type="primary" icon={<LoginOutlined />} onClick={handleLogin}>Re-login</Button>}
          closable onClose={() => setSessionExpired(false)} />
      )}

      {basesError && (
        <Alert type="error" showIcon closable className="mb-4" message={basesError}
          action={<Button size="small" onClick={loadBases}>Thử lại</Button>}
          onClose={() => setBasesError(null)} />
      )}

      {/* ── Sticky save bar ─────────────────────────────────────────────── */}
      {dirtyCount > 0 && (
        <div className="sticky top-0 z-20 mb-3 -mx-4 px-4 py-2 bg-[var(--warning-bg)] border-b border-[var(--note-border)] flex items-center justify-between flex-wrap gap-2 shadow-sm">
          <Space size="small">
            <Badge count={dirtyCount} color="orange" />
            <Text className="text-sm font-medium text-orange-800">{dirtyCount} field chưa lưu</Text>
            <Text className="text-xs text-orange-500 hidden sm:inline">· Ctrl+S để lưu nhanh</Text>
          </Space>
          <Space size="small">
            <Button size="small" icon={<RollbackOutlined />} onClick={revertAll}>Hoàn tác tất cả</Button>
            <Popconfirm title={`Lưu ${dirtyCount} thay đổi?`} onConfirm={saveToLark} okText="Lưu" cancelText="Hủy">
              <Button type="primary" size="small" icon={<SaveOutlined />} loading={saving}
                className="bg-orange-500 hover:!bg-orange-600 border-orange-500">
                Lưu ({dirtyCount})
              </Button>
            </Popconfirm>
          </Space>
        </div>
      )}

      <Row gutter={[16, 16]}>
        {/* ── Left: Bases + Tables ──────────────────────────────────────── */}
        <Col xs={24} lg={7}>
          {/* Bases card */}
          <Card size="small" className="mb-3"
            title={
              <Space size="small">
                <TableOutlined className="text-blue-500" />
                <span>Bases</span>
                {bases.length > 0 && <Tag className="text-xs">{bases.length}</Tag>}
              </Space>
            }
            extra={
              <Tooltip title={basesLoadedAt ? `Cập nhật lúc ${basesLoadedAt.toLocaleTimeString()}` : ''}>
                <Button size="small" icon={<ReloadOutlined />} onClick={loadBases} loading={loadingBases} type="text" />
              </Tooltip>
            }
          >
            {/* Search */}
            {bases.length > 4 && (
              <Input size="small" prefix={<SearchOutlined className="text-neutral-400" />}
                placeholder="Tìm base…" value={baseSearch} onChange={e => setBaseSearch(e.target.value)}
                className="mb-2" allowClear />
            )}

            {loadingBases && (
              <div className="space-y-1.5 py-1">
                {[1,2,3,4].map(i => <Skeleton.Input key={i} active size="small" className="!w-full !h-6" />)}
              </div>
            )}

            {!loadingBases && bases.length === 0 && (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Đang tải bases…" className="py-4 my-0" />
            )}

            <div className="flex flex-col gap-0.5 max-h-60 overflow-y-auto">
              {filteredBases.map(b => (
                <div key={b.appToken} onClick={() => selectBase(b)}
                  className={`cursor-pointer px-2.5 py-1.5 rounded text-sm transition-all flex items-center gap-2 group
                    ${selectedBase?.appToken === b.appToken
                      ? 'bg-blue-600 text-white font-medium'
                      : 'hover:bg-[var(--info-bg)] text-neutral-700'}`}>
                  <span className="flex-1 truncate">{b.name}</span>
                  {selectedBase?.appToken === b.appToken && loadingTables && (
                    <ReloadOutlined className="animate-spin text-xs text-blue-200" />
                  )}
                </div>
              ))}
              {filteredBases.length === 0 && baseSearch && (
                <div className="text-xs text-neutral-400 text-center py-2">Không tìm thấy "{baseSearch}"</div>
              )}
            </div>
          </Card>

          {/* Tables card */}
          {selectedBase && (
            <Card size="small"
              title={
                <Space size="small">
                  <TableOutlined className="text-green-600" />
                  <span className="truncate max-w-[120px]">{selectedBase.name}</span>
                  {tables.length > 0 && <Tag color="green" className="text-xs">{tables.length}</Tag>}
                </Space>
              }
              extra={
                <Button size="small" icon={<ReloadOutlined />} type="text"
                  onClick={() => selectBase(selectedBase)} loading={loadingTables} />
              }
            >
              {tables.length > 4 && (
                <Input size="small" prefix={<SearchOutlined className="text-neutral-400" />}
                  placeholder="Tìm table…" value={tableSearch} onChange={e => setTableSearch(e.target.value)}
                  className="mb-2" allowClear />
              )}

              {tablesError && (
                <Alert type="error" showIcon className="mb-2 text-xs" message={tablesError} closable
                  onClose={() => setTablesError(null)} action={<Button size="small" onClick={() => selectBase(selectedBase)}>Retry</Button>} />
              )}

              {loadingTables && (
                <div className="space-y-1.5">
                  {[1,2,3].map(i => <Skeleton.Input key={i} active size="small" className="!w-full !h-6" />)}
                </div>
              )}

              {!loadingTables && tables.length === 0 && !tablesError && (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có bảng" className="py-3 my-0" />
              )}

              <div className="flex flex-col gap-0.5 max-h-72 overflow-y-auto">
                {filteredTables.map(t => (
                  <div key={t.tableId} onClick={() => selectTable(t)}
                    className={`cursor-pointer px-2.5 py-1.5 rounded text-sm transition-all flex items-center gap-2
                      ${selectedTable?.tableId === t.tableId
                        ? 'bg-green-600 text-white font-medium'
                        : 'hover:bg-[var(--success-bg)] text-neutral-700'}`}>
                    <span className="flex-1 truncate">{t.name}</span>
                    {tableCounts[t.tableId] !== undefined && (
                      <span className={`text-xs flex-shrink-0 ${selectedTable?.tableId === t.tableId ? 'text-green-100' : 'text-neutral-400'}`}>
                        {tableCounts[t.tableId]}f
                      </span>
                    )}
                  </div>
                ))}
                {filteredTables.length === 0 && tableSearch && (
                  <div className="text-xs text-neutral-400 text-center py-2">Không tìm thấy "{tableSearch}"</div>
                )}
              </div>
            </Card>
          )}
        </Col>

        {/* ── Right: Field editor + AI ──────────────────────────────────── */}
        <Col xs={24} lg={17}>
          {!selectedTable && (
            <div className="flex items-center justify-center h-64 rounded-xl border-2 border-dashed border-neutral-200 text-neutral-400">
              <div className="text-center">
                <TableOutlined className="text-4xl block mb-2 opacity-30" />
                <div className="text-sm">Chọn Base → Chọn Table để xem schema</div>
              </div>
            </div>
          )}

          {selectedTable && (
            <>
              {/* Field list card */}
              <Card size="small" className="mb-3"
                title={
                  <Space size="small">
                    <TableOutlined />
                    <span className="font-semibold">{selectedTable.name}</span>
                    <Tag color={dirtyCount > 0 ? 'orange' : 'default'} className="text-xs">
                      {fields.length} fields{dirtyCount > 0 ? ` · ${dirtyCount} unsaved` : ''}
                    </Tag>
                  </Space>
                }
                extra={
                  <Space size="small">
                    {fieldsLoadedAt && (
                      <Text className="text-xs text-neutral-400 hidden sm:inline">
                        {fieldsLoadedAt.toLocaleTimeString()}
                      </Text>
                    )}
                    <Tooltip title="Reload fields">
                      <Button size="small" icon={<ReloadOutlined />} type="text"
                        onClick={() => selectTable(selectedTable)} loading={loadingFields} />
                    </Tooltip>
                    {dirtyCount > 0 && (
                      <Tooltip title="Hoàn tác tất cả">
                        <Button size="small" icon={<RollbackOutlined />} type="text"
                          onClick={revertAll} />
                      </Tooltip>
                    )}
                    <Popconfirm title={`Lưu ${dirtyCount} thay đổi?`} onConfirm={saveToLark}
                      disabled={!dirtyCount} okText="Lưu" cancelText="Hủy">
                      <Button type="primary" size="small" icon={<SaveOutlined />}
                        disabled={!dirtyCount} loading={saving}>
                        Save {dirtyCount > 0 ? `(${dirtyCount})` : ''}
                      </Button>
                    </Popconfirm>
                  </Space>
                }
              >
                {fieldsError && <Alert type="error" showIcon closable className="mb-3" message={fieldsError} onClose={() => setFieldsError(null)} />}
                {saveError   && <Alert type="warning" showIcon closable className="mb-3" message="Lưu một phần thất bại" description={saveError} onClose={() => setSaveError(null)} />}

                {loadingFields ? (
                  <div className="space-y-2">
                    {[1,2,3,4,5].map(i => (
                      <div key={i} className="border border-neutral-200 rounded p-2 flex gap-2">
                        <Skeleton.Button active size="small" className="!w-16 !h-5" />
                        <div className="flex-1 space-y-1">
                          <Skeleton.Input active size="small" className="!w-full !h-6" />
                          <Skeleton.Input active size="small" className="!w-3/4 !h-5" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : fields.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có fields" />
                ) : (
                  <div className="flex flex-col gap-1.5 max-h-[540px] overflow-y-auto pr-1">
                    {fields.map((f, idx) => {
                      const isSystem  = f.type >= 1001
                      const isLocked  = f.isPrimary || isSystem
                      return (
                        <div key={f.fieldId}
                          className={`border rounded-lg p-2.5 transition-all ${
                            f.dirty
                              ? 'border-orange-300 bg-[var(--warning-bg)] shadow-sm'
                              : 'border-neutral-200 hover:border-neutral-300'
                          }`}>
                          <div className="flex items-start gap-2">
                            {/* Type badge */}
                            <div className="flex-shrink-0 mt-0.5">
                              <Tag color={TYPE_COLOR[f.type] ?? 'default'} className="text-xs m-0 leading-tight">
                                {f.typeName}
                              </Tag>
                            </div>

                            {/* Inputs */}
                            <div className="flex-1 min-w-0 space-y-1">
                              <Input size="small"
                                className={`font-medium ${isLocked ? 'bg-neutral-50' : ''}`}
                                placeholder="Field name"
                                value={f.editName ?? f.name}
                                disabled={isLocked}
                                suffix={isLocked ? <Tooltip title={isSystem ? 'System field — không thể đổi tên' : 'Primary key — không thể đổi tên'}><CloseOutlined className="text-neutral-300 text-xs" /></Tooltip> : undefined}
                                onChange={e => {
                                  const v = e.target.value
                                  setFields(p => p.map((x, i) => i !== idx ? x : {
                                    ...x, editName: v,
                                    dirty: v !== x.name || (x.editDescription ?? x.description) !== x.description,
                                  }))
                                }}
                              />
                              <Input size="small"
                                className="text-neutral-500"
                                placeholder="Mô tả field (tuỳ chọn)…"
                                value={f.editDescription ?? f.description}
                                onChange={e => {
                                  const v = e.target.value
                                  setFields(p => p.map((x, i) => i !== idx ? x : {
                                    ...x, editDescription: v,
                                    dirty: (x.editName ?? x.name) !== x.name || v !== x.description,
                                  }))
                                }}
                              />
                            </div>

                            {/* Right badges + revert */}
                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                              {f.isPrimary  && <Tag color="gold"    className="m-0 text-xs">PK</Tag>}
                              {isSystem     && <Tag color="default" className="m-0 text-xs">SYS</Tag>}
                              {f.dirty && (
                                <Tooltip title="Hoàn tác field này">
                                  <Button type="text" size="small" icon={<RollbackOutlined />}
                                    className="text-neutral-400 hover:text-orange-500 !p-0 !h-5 !w-5"
                                    onClick={() => revertField(idx)} />
                                </Tooltip>
                              )}
                              {!f.dirty && f.editName === f.name && f.editDescription === f.description && (
                                <CheckOutlined className="text-green-400 text-xs" />
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>

              {/* AI panel */}
              {fields.length > 0 && (
                <Card size="small"
                  title={<Space size="small"><RobotOutlined className="text-purple-500" /><span>AI Table Designer</span></Space>}
                  extra={
                    <Select size="small" placeholder="AI config" value={selectedAiConfigId || undefined}
                      onChange={setSelectedAiConfigId} style={{ minWidth: 140 }}
                      options={aiConfigs.map(c => ({ label: `${c.name} (${c.provider})`, value: c._id }))}
                      notFoundContent={<a href="/settings/ai" className="text-xs">+ Thêm AI config</a>}
                    />
                  }
                >
                  <TextArea rows={3} value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
                    className="mb-2" placeholder="Mô tả những gì bạn muốn AI cải thiện — tên field tiếng Việt rõ nghĩa, thêm mô tả, chuẩn hóa naming convention…" />
                  <div className="flex gap-2 mb-3 flex-wrap">
                    {['Đặt tên field tiếng Việt rõ nghĩa', 'Thêm mô tả cho tất cả field', 'Chuẩn hóa theo convention'].map(q => (
                      <Button key={q} size="small" type="dashed" className="text-xs"
                        onClick={() => setAiPrompt(q)}>
                        {q}
                      </Button>
                    ))}
                  </div>
                  <Button type="primary" icon={<RobotOutlined />} onClick={askClaude} loading={aiLoading} block
                    disabled={!selectedAiConfigId}
                    className="bg-purple-600 hover:!bg-purple-700 border-purple-600 mb-3">
                    {aiLoading ? 'Đang phân tích…' : 'Hỏi AI Design'}
                  </Button>
                  {!selectedAiConfigId && (
                    <Alert type="warning" showIcon className="mb-2 text-xs"
                      message={<span>Chọn AI config để dùng tính năng này — <a href="/settings/ai">Cài đặt → AI</a></span>} />
                  )}
                  {aiError  && <Alert type="error"   showIcon closable className="mb-2" message={aiError} onClose={() => setAiError(null)} />}
                  {aiResult && (
                    <div className="space-y-2">
                      <Alert type="info"    showIcon message={<b>Phân tích</b>} description={aiResult.summary} />
                      {aiResult.suggestions && <Alert type="success" showIcon message={<b>Gợi ý đã áp dụng</b>} description={aiResult.suggestions} />}
                      {dirtyCount > 0 && <Alert type="warning" message={`${dirtyCount} field đã cập nhật — kiểm tra rồi nhấn Save hoặc Ctrl+S`} />}
                    </div>
                  )}
                </Card>
              )}
            </>
          )}
        </Col>
      </Row>
      <TourGuide pageKey="base-designer" steps={tourSteps['base-designer']} />
    </div>
  )
}
