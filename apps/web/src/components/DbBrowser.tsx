"use client";

import {
  DatabaseOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
  TableOutlined,
} from "@ant-design/icons";
import {
  App,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Skeleton,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@larkwave/ui";
import type { DbColumn, DbRows, DbTable } from "@/lib/api";
import { api } from "@/lib/api";
import { CARD_SHADOW } from "@/lib/theme";

const { Text } = Typography;
const { TextArea } = Input;

type Row = Record<string, unknown>;

/** Stringify a cell value for display (objects/JSON shown compactly). */
function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/**
 * In-workspace database admin: browse the full-stack app's D1 tables and
 * add / edit / delete rows — all live against the app's real database.
 */
export default function DbBrowser({ appId }: { appId: string }) {
  const { t: tr } = useI18n();
  const { message } = App.useApp();
  const [tables, setTables] = useState<DbTable[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [data, setData] = useState<DbRows | null>(null);
  const [loadingRows, setLoadingRows] = useState(false);
  const [page, setPage] = useState(1);

  // Add/edit modal
  const [editing, setEditing] = useState<Row | null>(null); // null = closed; {} = new row
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const loadTables = useCallback(async () => {
    try {
      const res = await api.appDb(appId);
      setTables(res.tables);
      setActive((cur) => cur ?? res.tables[0]?.name ?? null);
    } catch (e) {
      setTables([]);
      message.error((e as Error).message);
    }
  }, [appId, message]);

  const loadRows = useCallback(
    async (table: string, p: number) => {
      setLoadingRows(true);
      try {
        setData(await api.appDbRows(appId, table, p, 50));
        setPage(p);
      } catch (e) {
        message.error((e as Error).message);
      } finally {
        setLoadingRows(false);
      }
    },
    [appId, message],
  );

  useEffect(() => {
    void loadTables();
  }, [loadTables]);

  useEffect(() => {
    if (active) void loadRows(active, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Columns to EDIT (everything the server returns except the internal _rowid).
  const editCols: DbColumn[] = useMemo(
    () => (data?.columns ?? []).filter((c) => c.name !== "_rowid"),
    [data],
  );

  const openAdd = () => {
    form.resetFields();
    setEditing({});
  };
  const openEdit = (row: Row) => {
    const init: Row = {};
    for (const c of editCols) init[c.name] = cell(row[c.name]);
    form.setFieldsValue(init);
    setEditing(row);
  };

  const save = async () => {
    const values = (await form.validateFields()) as Record<string, string>;
    if (!active) return;
    setSaving(true);
    try {
      const rowid = editing && "_rowid" in editing ? Number(editing._rowid) : null;
      if (rowid != null) await api.appDbUpdate(appId, active, rowid, values);
      else await api.appDbInsert(appId, active, values);
      message.success(rowid != null ? tr("wcomp.dbSaved", "Đã lưu thay đổi") : tr("wcomp.dbRowAdded", "Đã thêm dòng"));
      setEditing(null);
      await loadRows(active, page);
      void loadTables(); // refresh row counts
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: Row) => {
    if (!active) return;
    try {
      await api.appDbDelete(appId, active, Number(row._rowid));
      message.success(tr("wcomp.dbRowDeleted", "Đã xoá dòng"));
      await loadRows(active, page);
      void loadTables();
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const columns: ColumnsType<Row> = useMemo(() => {
    const base: ColumnsType<Row> = (data?.columns ?? [])
      .filter((c) => c.name !== "_rowid")
      .map((c) => ({
        title: (
          <span>
            {c.name}
            {c.pk && (
              <Tag bordered={false} color="purple" style={{ marginInlineStart: 6, fontSize: 10 }}>
                PK
              </Tag>
            )}
          </span>
        ),
        dataIndex: c.name,
        key: c.name,
        ellipsis: true,
        render: (v: unknown) => {
          const s = cell(v);
          return (
            <Tooltip title={s.length > 60 ? s : undefined} placement="topLeft">
              <span style={{ fontFamily: c.name === "data" ? "ui-monospace, Menlo, monospace" : undefined, fontSize: 12.5 }}>
                {s.length > 90 ? s.slice(0, 90) + "…" : s || <Text type="secondary">∅</Text>}
              </span>
            </Tooltip>
          );
        },
      }));
    base.push({
      title: "",
      key: "_act",
      width: 88,
      fixed: "right",
      render: (_: unknown, row: Row) => (
        <Space size={2}>
          <Tooltip title={tr("wcomp.dbEdit", "Sửa")}>
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(row)} />
          </Tooltip>
          <Popconfirm title={tr("wcomp.dbDeleteRowConfirm", "Xoá dòng này?")} okText={tr("wcomp.dbDeleteOk", "Xoá")} cancelText={tr("wcomp.dbCancel", "Huỷ")} onConfirm={() => void remove(row)}>
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    });
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, editCols, tr]);

  if (tables === null) {
    return <Skeleton active style={{ padding: 20 }} paragraph={{ rows: 6 }} />;
  }
  if (tables.length === 0) {
    return (
      <Empty
        style={{ padding: "56px 0" }}
        description={tr("wcomp.dbNoTables", "App này chưa có bảng dữ liệu nào trong cơ sở dữ liệu.")}
      />
    );
  }

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
      {/* Tables sidebar */}
      <div
        style={{
          width: 210,
          minWidth: 210,
          borderRight: "1px solid #F1F2F7",
          background: "#FBFBFE",
          overflowY: "auto",
          padding: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 6px 8px", color: "#6B7280" }}>
          <DatabaseOutlined style={{ color: "#6C5CE7" }} />
          <Text strong style={{ fontSize: 12.5 }}>
            {tr("wcomp.dbTablesTitle", "Bảng dữ liệu (D1)")}
          </Text>
        </div>
        {tables.map((t) => {
          const on = t.name === active;
          return (
            <button
              key={t.name}
              type="button"
              onClick={() => setActive(t.name)}
              style={{
                width: "100%",
                textAlign: "left",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 9px",
                borderRadius: 9,
                marginBottom: 2,
                border: "none",
                background: on ? "rgba(108,92,231,0.10)" : "transparent",
                color: on ? "#5B4FC2" : "#3A4256",
              }}
            >
              <TableOutlined style={{ fontSize: 13, color: on ? "#6C5CE7" : "#9AA3B5" }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: on ? 600 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t.name}
              </span>
              <Tag bordered={false} style={{ margin: 0, fontSize: 10.5, background: "#EEF0F6", color: "#6B7280" }}>
                {t.rowCount}
              </Tag>
            </button>
          );
        })}
      </div>

      {/* Rows */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "10px 14px",
            borderBottom: "1px solid #F1F2F7",
          }}
        >
          <Space>
            <Text strong style={{ fontSize: 14 }}>{active}</Text>
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              {data?.total ?? 0} {tr("wcomp.dbRows", "dòng")}
            </Text>
          </Space>
          <Space>
            <Button size="small" icon={<ReloadOutlined />} onClick={() => active && void loadRows(active, page)}>
              {tr("wcomp.dbReload", "Tải lại")}
            </Button>
            <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openAdd}>
              {tr("wcomp.dbAddRow", "Thêm dòng")}
            </Button>
          </Space>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 12 }}>
          <Table<Row>
            size="small"
            rowKey={(r) => String(r._rowid)}
            loading={loadingRows}
            columns={columns}
            dataSource={data?.rows ?? []}
            scroll={{ x: "max-content" }}
            style={{ boxShadow: CARD_SHADOW, borderRadius: 10, background: "#fff" }}
            pagination={{
              current: page,
              pageSize: data?.pageSize ?? 50,
              total: data?.total ?? 0,
              showSizeChanger: false,
              size: "small",
              onChange: (p) => active && void loadRows(active, p),
            }}
          />
        </div>
      </div>

      <Modal
        title={editing && "_rowid" in editing ? `${tr("wcomp.dbEditRow", "Sửa dòng")} · ${active}` : `${tr("wcomp.dbAddRow", "Thêm dòng")} · ${active}`}
        open={editing !== null}
        onCancel={() => setEditing(null)}
        onOk={() => void save()}
        okText={tr("wcomp.dbSave", "Lưu")}
        cancelText={tr("wcomp.dbCancel", "Huỷ")}
        confirmLoading={saving}
        destroyOnClose
        width={620}
      >
        <Form form={form} layout="vertical" requiredMark={false} style={{ marginTop: 8 }}>
          {editCols.map((c) => {
            const long = c.name === "data" || c.type.toUpperCase().includes("TEXT");
            return (
              <Form.Item
                key={c.name}
                name={c.name}
                label={
                  <span>
                    {c.name}{" "}
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {c.type || "?"}
                      {c.pk ? " · PK" : ""}
                    </Text>
                  </span>
                }
              >
                {long ? (
                  <TextArea autoSize={{ minRows: 2, maxRows: 10 }} style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12.5 }} />
                ) : (
                  <Input />
                )}
              </Form.Item>
            );
          })}
        </Form>
      </Modal>
    </div>
  );
}
