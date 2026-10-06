'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Empty, Input, Spin, Table, Tag, Tooltip, Typography } from 'antd';
import { DatabaseOutlined, DeleteOutlined, PlusOutlined, ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons';
import type { AppDbOverview, AppDbResult } from '@larkwave/core';
import { useRuntime } from '../RuntimeProvider';
import { BRAND, V } from '../theme';

const PAGE = 50;
const qid = (s: string) => `"${s.replace(/"/g, '""')}"`; // safe SQL identifier

/**
 * Local SQLite browser/editor for a generated app — the desktop counterpart of the website's
 * data console. Lists tables, pages rows, edits cells inline (parameterized UPDATE by rowid),
 * adds/deletes rows, and runs ad-hoc SQL. All via runtime.appDb* (sql.js in the main process).
 */
export function DatabaseView({ appId, refreshKey }: { appId: string; refreshKey?: number }) {
  const runtime = useRuntime();
  const { message, modal } = App.useApp();
  const [overview, setOverview] = useState<AppDbOverview | null>(null);
  const [table, setTable] = useState('');
  const [data, setData] = useState<AppDbResult | null>(null);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<{ rowid: unknown; col: string } | null>(null);
  const [editVal, setEditVal] = useState('');
  const [sql, setSql] = useState('');
  const [sqlOut, setSqlOut] = useState<AppDbResult | null>(null);
  const [showSql, setShowSql] = useState(false);

  const loadOverview = useCallback(async () => {
    const o = await runtime.appDb?.(appId).catch(() => null);
    setOverview(o ?? { available: false, tables: [] });
    setTable((cur) => (o?.tables.some((t) => t.name === cur) ? cur : o?.tables[0]?.name || ''));
  }, [runtime, appId]);

  useEffect(() => {
    setOverview(null);
    void loadOverview();
  }, [loadOverview, refreshKey]);

  const loadRows = useCallback(
    async (t: string, p: number) => {
      if (!t) return;
      setBusy(true);
      const r = await runtime.appDbRows?.(appId, t, PAGE, p * PAGE).catch(() => null);
      setData(r ?? { columns: [], rows: [], error: 'Lỗi đọc dữ liệu' });
      setBusy(false);
    },
    [runtime, appId],
  );

  useEffect(() => {
    setPage(0);
    if (table) void loadRows(table, 0);
  }, [table, loadRows]);

  const dataCols = useMemo(() => (data?.columns ?? []).filter((c) => c !== '__rowid'), [data]);
  const records = useMemo(
    () =>
      (data?.rows ?? []).map((row) => {
        const o: Record<string, unknown> = {};
        (data?.columns ?? []).forEach((c, i) => (o[c] = row[i]));
        return o;
      }),
    [data],
  );

  const commitEdit = async () => {
    if (!edit) return;
    const e = edit;
    setEdit(null);
    setBusy(true);
    const res = await runtime.appDbExec?.(
      appId,
      `UPDATE ${qid(table)} SET ${qid(e.col)} = ? WHERE rowid = ?`,
      [editVal, e.rowid],
    );
    setBusy(false);
    if (res?.error) return message.error(res.error);
    void loadRows(table, page);
    void loadOverview();
  };

  const addRow = async () => {
    setBusy(true);
    const res = await runtime.appDbExec?.(appId, `INSERT INTO ${qid(table)} DEFAULT VALUES`);
    setBusy(false);
    if (res?.error) return message.error(`Không thêm được dòng: ${res.error}`);
    await loadOverview();
    void loadRows(table, page);
  };

  const delRow = (rowid: unknown) =>
    modal.confirm({
      title: 'Xoá dòng này?',
      okText: 'Xoá',
      okButtonProps: { danger: true },
      cancelText: 'Huỷ',
      onOk: async () => {
        const res = await runtime.appDbExec?.(appId, `DELETE FROM ${qid(table)} WHERE rowid = ?`, [rowid]);
        if (res?.error) return message.error(res.error);
        await loadOverview();
        void loadRows(table, page);
      },
    });

  const runSql = async () => {
    if (!sql.trim()) return;
    setBusy(true);
    const res = await runtime.appDbExec?.(appId, sql);
    setBusy(false);
    setSqlOut(res ?? null);
    if (res && !res.error) {
      message.success(res.rowsModified !== undefined ? `Đã chạy — ${res.rowsModified} dòng thay đổi` : 'Đã chạy');
      await loadOverview();
      if (table) void loadRows(table, page);
    }
  };

  const cell = (col: string) => (val: unknown, rec: Record<string, unknown>) => {
    const rowid = rec['__rowid'];
    if (edit && edit.rowid === rowid && edit.col === col) {
      return (
        <Input
          size="small"
          autoFocus
          value={editVal}
          onChange={(e) => setEditVal(e.target.value)}
          onPressEnter={commitEdit}
          onBlur={commitEdit}
          style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}
        />
      );
    }
    const display = val === null || val === undefined ? <span style={{ color: V.textFaint }}>NULL</span> : String(val);
    return (
      <div
        onDoubleClick={() => {
          setEdit({ rowid, col });
          setEditVal(val === null || val === undefined ? '' : String(val));
        }}
        title="Bấm đúp để sửa"
        style={{ minHeight: 20, cursor: 'text', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {display}
      </div>
    );
  };

  const columns = [
    ...dataCols.map((c) => ({ title: c, dataIndex: c, key: c, ellipsis: true, render: cell(c) })),
    {
      title: '',
      key: '__act',
      width: 44,
      render: (_: unknown, rec: Record<string, unknown>) => (
        <Tooltip title="Xoá dòng">
          <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => delRow(rec['__rowid'])} />
        </Tooltip>
      ),
    },
  ];

  if (overview === null) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin /> <div style={{ marginTop: 8, color: V.textSub }}>Đang mở cơ sở dữ liệu…</div>
      </div>
    );
  }

  if (!overview.available) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Empty
          image={<DatabaseOutlined style={{ fontSize: 40, color: V.textFaint }} />}
          description={
            <span style={{ color: V.textSub }}>
              {overview.error
                ? `Không mở được CSDL: ${overview.error}`
                : 'App này chưa có cơ sở dữ liệu SQLite cục bộ.'}
            </span>
          }
        >
          <Button
            type="primary"
            icon={<DatabaseOutlined />}
            onClick={async () => {
              const o = await runtime.appDbCreate?.(appId).catch(() => null);
              if (o?.available) {
                setOverview(o);
                setTable(o.tables[0]?.name || '');
                message.success('Đã tạo data.db');
              } else message.error('Không tạo được CSDL.');
            }}
          >
            Tạo cơ sở dữ liệu (data.db)
          </Button>
        </Empty>
      </div>
    );
  }

  const total = data?.total ?? 0;

  return (
    <div style={{ border: `1px solid ${V.border}`, borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderBottom: `1px solid ${V.border}`, background: V.surfaceAlt }}>
        <DatabaseOutlined style={{ color: '#6C5CE7' }} />
        <Typography.Text style={{ fontSize: 12.5, color: V.text }}>{overview.path?.split('/').pop()}</Typography.Text>
        <span style={{ flex: 1 }} />
        <Button size="small" icon={<ThunderboltOutlined />} type={showSql ? 'primary' : 'default'} onClick={() => setShowSql((s) => !s)}>
          Chạy SQL
        </Button>
        <Button size="small" icon={<ReloadOutlined />} onClick={() => { void loadOverview(); if (table) void loadRows(table, page); }} />
      </div>

      {showSql && (
        <div style={{ padding: 10, borderBottom: `1px solid ${V.border}`, background: V.surfaceAlt }}>
          <Input.TextArea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            placeholder='SELECT * FROM ... ;  hoặc  UPDATE/INSERT/DELETE/CREATE ...'
            autoSize={{ minRows: 2, maxRows: 6 }}
            style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5 }}
          />
          <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button type="primary" size="small" loading={busy} onClick={runSql}>Chạy</Button>
            {sqlOut?.error && <Typography.Text type="danger" style={{ fontSize: 12 }}>{sqlOut.error}</Typography.Text>}
            {sqlOut && !sqlOut.error && sqlOut.rowsModified !== undefined && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>{sqlOut.rowsModified} dòng thay đổi</Typography.Text>
            )}
          </div>
          {sqlOut && !sqlOut.error && sqlOut.columns.length > 0 && (
            <div style={{ marginTop: 8, maxHeight: 200, overflow: 'auto' }}>
              <Table
                size="small"
                pagination={false}
                rowKey={(_, i) => String(i)}
                columns={sqlOut.columns.map((c) => ({ title: c, dataIndex: c, key: c, ellipsis: true }))}
                dataSource={sqlOut.rows.map((row) => {
                  const o: Record<string, unknown> = {};
                  sqlOut.columns.forEach((c, i) => (o[c] = row[i] === null ? 'NULL' : String(row[i])));
                  return o;
                })}
              />
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', minHeight: 380 }}>
        <div style={{ borderRight: `1px solid ${V.border}`, overflowY: 'auto', background: V.surfaceAlt, padding: '6px 0' }}>
          <Typography.Text style={{ fontSize: 11, fontWeight: 700, color: V.textFaint, padding: '4px 12px', display: 'block' }}>
            {overview.tables.length} BẢNG
          </Typography.Text>
          {overview.tables.map((t) => (
            <button
              key={t.name}
              type="button"
              onClick={() => setTable(t.name)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', padding: '7px 12px',
                border: 'none', borderLeft: t.name === table ? `3px solid ${BRAND}` : '3px solid transparent',
                background: t.name === table ? V.surface : 'transparent', cursor: 'pointer', fontSize: 12.5, color: V.text,
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{t.name}</span>
              <Tag style={{ fontSize: 10, lineHeight: '16px', margin: 0 }}>{t.rows}</Tag>
            </button>
          ))}
        </div>

        <div style={{ overflow: 'auto', padding: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Typography.Text style={{ fontWeight: 600 }}>{table}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{total} dòng</Typography.Text>
            <span style={{ flex: 1 }} />
            <Button size="small" icon={<PlusOutlined />} onClick={addRow}>Thêm dòng</Button>
          </div>
          <Table
            size="small"
            loading={busy}
            columns={columns}
            dataSource={records}
            rowKey={(r) => String((r as Record<string, unknown>)['__rowid'])}
            scroll={{ x: true }}
            pagination={{
              current: page + 1,
              pageSize: PAGE,
              total,
              showSizeChanger: false,
              onChange: (p) => { setPage(p - 1); void loadRows(table, p - 1); },
            }}
          />
        </div>
      </div>
    </div>
  );
}
