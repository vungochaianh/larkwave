import { Table } from "antd";

export default function AutomationsView({ automations }: { automations: any[] }) {
  return (
    <Table
      dataSource={automations}
      rowKey="name"
      columns={[
        { title: "Name", dataIndex: "name" },
        { title: "Trigger", dataIndex: "trigger" },
        { title: "Actions", dataIndex: "actions", render: (v) => v?.join(", ") },
      ]}
    />
  );
}
