'use client';
import type { CSSProperties } from 'react';
import type { SlashCommandItem } from '../SlashCommandMenu';

/**
 * Nội dung tin nhắn NGƯỜI DÙNG, với hai thứ vẫn bấm được sau khi đã gửi:
 *  - chip "/lệnh" ở đầu tin → mở nội dung skill để đọc;
 *  - từng TÊN TỆP trong dòng "📎 a.xlsx, b.png" → mở xem trước.
 *
 * Tách khỏi AgentChat để LarkChat dùng chung: trước đó chỉ Trợ lý AI mới có hai hành vi này, còn
 * Lark × Agents thì gửi xong là tệp và lệnh trở lại thành chữ chết.
 */
export function renderUserText(
  text: string,
  commands: SlashCommandItem[],
  onOpen: (item: SlashCommandItem) => void,
  onOpenFile: (name: string) => void,
): React.ReactNode {
  const m = /^\s*\/([\w-]+)/.exec(text || '');
  const hit = m && commands.find((c) => c.command.toLowerCase() === m[1].toLowerCase());
  const rest = m && hit ? text.slice(m[0].length) : text;

  // The "📎 a.xlsx, b.png" line the composer appends: make each NAME clickable so a file can still
  // be inspected after sending — until now it went back to being flat text the moment you hit send.
  const chipStyle: CSSProperties = {
    cursor: 'pointer',
    textDecoration: 'underline dotted',
    textUnderlineOffset: 3,
  };
  const body = rest.split(/(\n?📎 [^\n]+)/).map((part, i) => {
    const pm = /^(\n?📎 )(.+)$/.exec(part);
    if (!pm) return <span key={i}>{part}</span>;
    const names = pm[2].split(',').map((n) => n.trim()).filter(Boolean);
    return (
      <span key={i}>
        {pm[1]}
        {names.map((n, j) => (
          <span key={j}>
            {j > 0 && ', '}
            <span role="button" title={n} style={chipStyle} onClick={() => onOpenFile(n)}>
              {n}
            </span>
          </span>
        ))}
      </span>
    );
  });

  if (!m || !hit) return <>{body}</>;
  return (
    <>
      <span
        role="button"
        title={hit.name}
        onClick={() => onOpen(hit)}
        style={{
          cursor: 'pointer',
          background: 'rgba(255,255,255,0.22)',
          borderRadius: 7,
          padding: '1px 7px',
          fontWeight: 600,
          textDecoration: 'underline dotted',
          textUnderlineOffset: 3,
        }}
      >
        /{hit.command}
      </span>
      {body}
    </>
  );
}
