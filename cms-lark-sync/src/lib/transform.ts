// src/lib/transform.ts
export function buildTable(items: any[]) {
  const columnsSet = new Set<string>();

  items.forEach((r) => {
    Object.keys(r.fields || {}).forEach((k) => columnsSet.add(k));
  });

  const columns = Array.from(columnsSet).map((k) => ({
    title: k,
    dataIndex: k,
    key: k,
  }));

  const dataSource = items.map((r) => ({
    key: r.record_id,
    ...r.fields,
  }));

  return { columns, dataSource };
}
