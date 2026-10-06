import { Tabs } from "antd";

export default function DocumentsTabs({ documents }: { documents: Record<string, string> }) {
  return (
    <Tabs
      items={Object.entries(documents).map(([key, value]) => ({
        key,
        label: key,
        children: (
          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
            {value}
          </div>
        ),
      }))}
    />
  );
}
