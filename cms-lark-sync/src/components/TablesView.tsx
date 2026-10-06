import { Collapse, Table } from "antd";

export default function TablesView({ tables }: { tables: any[] }) {
  return (
    <Collapse
      items={tables.map((t) => ({
        key: t.code,
        label: `${t.name} (${t.code})`,
        children: (
          <Table
            size="small"
            dataSource={t.fields}
            rowKey="name"
            columns={[
              { title: "Field", dataIndex: "name" },
              { title: "Type", dataIndex: "type" },
              { title: "Description", dataIndex: "description" },
              { title: "Required", dataIndex: "required" },
              { title: "Unique", dataIndex: "unique" },
            ]}
            pagination={false}
          />
        ),
      }))}
    />
  );
}
