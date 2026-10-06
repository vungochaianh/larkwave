import { Collapse, Table } from "antd";

export default function SampleDataView({ sampleData }: { sampleData: Record<string, any[]> }) {
  return (
    <Collapse
      items={Object.entries(sampleData).map(([table, rows]) => ({
        key: table,
        label: table,
        children: (
          <Table
            size="small"
            dataSource={rows}
            rowKey={(r) => r.id}
            columns={Object.keys(rows[0] || {}).map((k) => ({
              title: k,
              dataIndex: k,
            }))}
            pagination={false}
          />
        ),
      }))}
    />
  );
}
