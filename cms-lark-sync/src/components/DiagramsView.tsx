import { Collapse, Button } from "antd";

export default function DiagramsView({ diagrams }: { diagrams: any }) {
  return (
    <Collapse
      items={Object.entries(diagrams).map(([type, list]: any) => ({
        key: type,
        label: type.toUpperCase(),
        children: Array.isArray(list)
          ? list.map((d: any) => (
              <div key={d.name} style={{ marginBottom: 16 }}>
                <b>{d.name}</b>
                <pre>{d.puml}</pre>
                <Button onClick={() => navigator.clipboard.writeText(d.puml)}>
                  Copy PUML
                </Button>
              </div>
            ))
          : (
            <pre>{list}</pre>
          )
      }))}
    />
  );
}
