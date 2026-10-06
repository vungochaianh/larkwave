import { Image, Tag, Avatar } from 'antd';
import React from 'react';

export function renderBitableValue(value: any) {
  if (value === null || value === undefined) {
    return <span style={{ color: '#999' }}>—</span>;
  }

  // 1️⃣ Array: text / option / attachment
  if (Array.isArray(value)) {
    // Text array
    if (value[0]?.text) {
      return (
        <>
          {value.map((v: any, i: number) => (
            <div key={i}>{v.text}</div>
          ))}
        </>
      );
    }

    // Attachment (image / file)
    if (value[0]?.file_token) {
      return (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {value.map((f: any) => (
            <Image
              key={f.file_token}
              src={f.url}
              alt={f.name}
              width={56}
              height={56}
              style={{ objectFit: 'cover', borderRadius: 4 }}
              preview
            />
          ))}
        </div>
      );
    }

    // Option / multi-select
    return value.map((v: any, i: number) => (
      <Tag key={i}>{String(v)}</Tag>
    ));
  }

  // 2️⃣ User field
  if (value?.users) {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {value.users.map((u: any) => (
          <Tag key={u.id}>
            <Avatar size="small" src={u.avatarUrl} />
            <span style={{ marginLeft: 6 }}>{u.name}</span>
          </Tag>
        ))}
      </div>
    );
  }

  // 3️⃣ Timestamp (ms)
  if (typeof value === 'number' && value > 1e12) {
    return new Date(value).toLocaleDateString('vi-VN');
  }

  // 4️⃣ URL
  if (typeof value === 'string' && value.startsWith('http')) {
    return (
      <a href={value} target="_blank" rel="noreferrer">
        {value}
      </a>
    );
  }

  // 5️⃣ String / Number
  if (typeof value === 'string' || typeof value === 'number') {
    return <span>{String(value)}</span>;
  }

  // 6️⃣ Fallback
  return (
    <pre style={{ maxWidth: 300, whiteSpace: 'pre-wrap' }}>
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
