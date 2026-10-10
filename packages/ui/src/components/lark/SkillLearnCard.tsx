'use client';
/**
 * Thẻ TỰ HỌC trong hội thoại:
 *  - "Đã học: «tên» — Hoàn tác" khi AI vừa lưu một kỹ năng từ lời dạy/lời sửa của người dùng;
 *  - thẻ ĐỀ XUẤT (từ việc vừa làm / học từ Base / khi bật "Hỏi trước khi lưu"): tên, từ khoá gọi, các bước,
 *    nút "Lưu kỹ năng" / "Bỏ qua".
 * Trạng thái (đã lưu / bỏ qua / đã hoàn tác) lưu cùng hội thoại.
 */
import { useState } from 'react';
import { App, Button, Space, Tag, Typography } from 'antd';
import { BulbOutlined, RollbackOutlined } from '@ant-design/icons';
import type { RuntimeAdapter, SkillProposal } from '@larkwave/core';
import { V } from '../../theme';

const { Text } = Typography;

export interface SkillLearnItem {
  kind: 'skill';
  id: string;
  ts?: number;
  learned?: { id: string; name: string; action: 'create' | 'update'; origin: string; supplementOf?: string };
  proposal?: SkillProposal;
  state?: 'saved' | 'dismissed' | 'undone';
}

const ORIGIN_LABEL: Record<string, string> = {
  explicit: 'bạn dạy',
  correction: 'bạn sửa',
  experience: 'từ việc vừa làm',
  base: 'học từ Base',
};

export function SkillLearnCard({ item, runtime, onUpdate }: { item: SkillLearnItem; runtime: RuntimeAdapter; onUpdate: (patch: Partial<SkillLearnItem>) => void }) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  if (item.learned) {
    const l = item.learned;
    const undo = async () => {
      if (!runtime.skillUndoLearn) return;
      setBusy(true);
      try {
        await runtime.skillUndoLearn(l.id);
        onUpdate({ state: 'undone' });
        message.success(l.action === 'create' ? `Đã gỡ kỹ năng «${l.name}».` : `Đã đưa «${l.name}» về bản trước.`);
      } catch (e) {
        message.error((e as Error)?.message || 'Không hoàn tác được.');
      } finally {
        setBusy(false);
      }
    };
    const redo = async () => {
      if (!runtime.skillRestoreLearned) return;
      setBusy(true);
      try {
        await runtime.skillRestoreLearned(l.id);
        onUpdate({ state: undefined });
      } catch (e) {
        message.error((e as Error)?.message || 'Không lấy lại được.');
      } finally {
        setBusy(false);
      }
    };
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12.5, color: V.text, padding: '4px 10px', border: `1px dashed ${V.borderSub}`, borderRadius: 8, alignSelf: 'flex-start' }}>
        <BulbOutlined style={{ color: '#d4b106' }} />
        {item.state === 'undone' ? (
          <span style={{ color: V.textFaint }}>Đã hoàn tác kỹ năng «{l.name}»</span>
        ) : (
          <span>
            {l.action === 'create' ? 'Đã học' : 'Đã cập nhật kỹ năng'}: <b>«{l.name}»</b>
            {l.supplementOf ? <span style={{ color: V.textFaint }}> (bổ sung cho «{l.supplementOf}»)</span> : null}
          </span>
        )}
        <Tag style={{ margin: 0, fontSize: 10.5 }}>AI tự học · {ORIGIN_LABEL[l.origin] || l.origin}</Tag>
        {item.state === 'undone' ? (
          l.action === 'create' && runtime.skillRestoreLearned ? (
            <Button size="small" type="link" loading={busy} onClick={() => void redo()} style={{ padding: 0 }}>
              Lấy lại
            </Button>
          ) : null
        ) : runtime.skillUndoLearn ? (
          <Button size="small" type="link" icon={<RollbackOutlined />} loading={busy} onClick={() => void undo()} style={{ padding: 0 }}>
            Hoàn tác
          </Button>
        ) : null}
      </div>
    );
  }

  const p = item.proposal;
  if (!p) return null;
  const save = async () => {
    if (!runtime.skillSaveProposal) return;
    setBusy(true);
    try {
      await runtime.skillSaveProposal(p);
      onUpdate({ state: 'saved' });
      message.success(p.updateName ? `Đã cập nhật kỹ năng «${p.updateName}».` : `Đã lưu kỹ năng «${p.name}».`);
    } catch (e) {
      message.error((e as Error)?.message || 'Không lưu được kỹ năng.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ border: `1px solid ${V.borderSub}`, borderRadius: 10, padding: 10, maxWidth: 560, alignSelf: 'flex-start', background: V.surfaceAlt }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <BulbOutlined style={{ color: '#d4b106' }} />
        <Text strong style={{ fontSize: 13 }}>
          {p.updateName ? `Đề xuất cập nhật kỹ năng «${p.updateName}»` : `Đề xuất kỹ năng: «${p.name}»`}
        </Text>
        <Tag style={{ margin: 0, fontSize: 10.5 }}>AI tự học · {ORIGIN_LABEL[p.origin] || p.origin}</Tag>
      </div>
      {p.reason && <div style={{ fontSize: 11.5, color: V.textFaint, marginTop: 2 }}>{p.reason}</div>}
      {!!p.triggers.length && (
        <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {p.triggers.map((x) => (
            <Tag key={x} style={{ margin: 0, fontSize: 10.5 }}>
              {x}
            </Tag>
          ))}
        </div>
      )}
      <div style={{ marginTop: 6, fontSize: 12, whiteSpace: 'pre-wrap', color: V.text, maxHeight: open ? 360 : 72, overflow: open ? 'auto' : 'hidden' }}>{p.instructions}</div>
      <Button type="link" size="small" style={{ padding: 0, height: 18, fontSize: 11 }} onClick={() => setOpen((v) => !v)}>
        {open ? 'Thu gọn' : 'Xem đủ các bước'}
      </Button>
      <div style={{ marginTop: 6 }}>
        {item.state === 'saved' ? (
          <Text type="success" style={{ fontSize: 12 }}>✓ Đã lưu — áp dụng từ lượt sau (chat, lệnh "/", lịch tự động).</Text>
        ) : item.state === 'dismissed' ? (
          <Text type="secondary" style={{ fontSize: 12 }}>Đã bỏ qua.</Text>
        ) : (
          <Space size={8}>
            <Button size="small" type="primary" loading={busy} disabled={!runtime.skillSaveProposal} onClick={() => void save()}>
              Lưu kỹ năng
            </Button>
            <Button size="small" onClick={() => onUpdate({ state: 'dismissed' })}>
              Bỏ qua
            </Button>
          </Space>
        )}
      </div>
    </div>
  );
}
