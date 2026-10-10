'use client';
/**
 * TỰ HỌC kỹ năng ở màn Kỹ năng:
 *  - `SkillLearnToolbar`: công tắc "Tự học kỹ năng" (mặc định bật) + "Hỏi trước khi lưu kỹ năng tự học"
 *    (mặc định tắt — đề xuất từ kinh nghiệm/Base luôn hỏi), và nút "Học từ Base" (quét một Base → đề xuất
 *    kỹ năng nghiệp vụ, người dùng chọn lưu cái nào).
 *  - `SkillVersionHistory`: lịch sử phiên bản của một kỹ năng (ai/khi nào/vì sao: bạn hay "AI tự học"),
 *    xem khác biệt với bản hiện tại, khôi phục một bản, hoàn tác lần tự học gần nhất.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, App, Button, Modal, Select, Space, Spin, Switch, Tag, Tooltip, Typography } from 'antd';
import { BulbOutlined, HistoryOutlined, RollbackOutlined } from '@ant-design/icons';
import { lineDiff } from '@larkwave/core';
import type { RuntimeAdapter, SkillInfo, SkillLearnSettings, SkillProposal, SkillVersion } from '@larkwave/core';
import { V } from '../theme';

const { Text } = Typography;

const ORIGIN_LABEL: Record<string, string> = { explicit: 'bạn dạy', correction: 'bạn sửa', experience: 'từ việc đã làm', base: 'học từ Base' };

/** Huy hiệu "AI tự học" trên thẻ kỹ năng. */
export function LearnedBadge({ s }: { s: SkillInfo }) {
  if (!s.learned) return null;
  return (
    <Tooltip title={`AI tự học (${ORIGIN_LABEL[s.learned.origin] || s.learned.origin}) · ${new Date(s.learned.at).toLocaleString('vi-VN')}${s.learned.reason ? ` — ${s.learned.reason}` : ''}`}>
      <span style={{ background: '#fffbe6', color: '#ad8b00', fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999, lineHeight: 1.7 }}>
        <BulbOutlined /> AI tự học
      </span>
    </Tooltip>
  );
}

export function SkillLearnToolbar({ runtime, onChanged }: { runtime: RuntimeAdapter; onChanged: () => void }) {
  const { message } = App.useApp();
  const [st, setSt] = useState<SkillLearnSettings | null>(null);
  const [open, setOpen] = useState(false);
  const [bases, setBases] = useState<{ token: string; name: string }[]>([]);
  const [pick, setPick] = useState<string | undefined>();
  const [running, setRunning] = useState(false);
  const [props, setProps] = useState<(SkillProposal & { state?: 'saved' | 'dismissed' })[] | null>(null);

  useEffect(() => {
    runtime.skillLearnSettings?.().then(setSt).catch(() => setSt(null));
  }, [runtime]);
  if (!runtime.skillLearnSettings) return null;

  const set = async (patch: Partial<SkillLearnSettings>) => {
    try {
      setSt(await runtime.setSkillLearnSettings!(patch));
    } catch (e) {
      message.error((e as Error)?.message || 'Không lưu được cài đặt.');
    }
  };

  const openLearn = async () => {
    setOpen(true);
    setProps(null);
    const out: { token: string; name: string }[] = [];
    try {
      for (const b of (await runtime.larkListBases?.()) ?? []) out.push({ token: b.appToken, name: b.name });
    } catch {
      /* không có custom app */
    }
    try {
      for (const b of (await runtime.larkWebListBases?.()) ?? []) if (!b.isWiki && !out.some((x) => x.token === b.token)) out.push({ token: b.token, name: b.name });
    } catch {
      /* chưa đăng nhập Lark web */
    }
    setBases(out);
    if (!pick && out[0]) setPick(out[0].token);
  };

  const learn = async () => {
    if (!pick || !runtime.larkLearnFromBase) return;
    setRunning(true);
    try {
      const r = await runtime.larkLearnFromBase(pick, bases.find((b) => b.token === pick)?.name);
      setProps(r);
      if (!r.length) message.info('Chưa có đề xuất nào — thử lại hoặc chọn Base khác.');
    } catch (e) {
      message.error((e as Error)?.message || 'Không học được từ Base này.');
    } finally {
      setRunning(false);
    }
  };

  const save = async (p: SkillProposal) => {
    try {
      await runtime.skillSaveProposal!(p);
      setProps((cur) => (cur ?? []).map((x) => (x.id === p.id ? { ...x, state: 'saved' } : x)));
      onChanged();
    } catch (e) {
      message.error((e as Error)?.message || 'Không lưu được kỹ năng.');
    }
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', margin: '0 0 10px', fontSize: 12.5 }}>
        <span>
          <Switch size="small" checked={!!st?.enabled} onChange={(v) => void set({ enabled: v })} /> <Text style={{ fontSize: 12.5 }}>Tự học kỹ năng</Text>
        </span>
        <Tooltip title="Bật: kỹ năng học từ lời bạn dạy ('từ giờ…', 'lần sau…') cũng thành thẻ đề xuất để bạn bấm lưu. Đề xuất từ việc đã làm / học từ Base luôn hỏi.">
          <span>
            <Switch size="small" disabled={!st?.enabled} checked={!!st?.askFirst} onChange={(v) => void set({ askFirst: v })} /> <Text style={{ fontSize: 12.5 }}>Hỏi trước khi lưu kỹ năng tự học</Text>
          </span>
        </Tooltip>
        {runtime.larkLearnFromBase && (
          <Button size="small" icon={<BulbOutlined />} disabled={!st?.enabled} onClick={() => void openLearn()}>
            Học từ Base
          </Button>
        )}
      </div>
      <Modal open={open} onCancel={() => setOpen(false)} footer={null} title="Học từ Base" width={640} styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}>
        <Text type="secondary" style={{ fontSize: 12.5 }}>
          AI quét cấu trúc Base, các automation/workflow đang có và vài bản ghi mẫu, rồi ĐỀ XUẤT kỹ năng nghiệp vụ (ý nghĩa bảng, quy ước cột, ai phụ trách gì, giai đoạn quy trình). Chỉ đọc — không ghi gì vào Base. Bạn chọn lưu đề xuất nào.
        </Text>
        <Space style={{ marginTop: 10, width: '100%' }} styles={{ item: { flex: 1 } }}>
          <Select style={{ width: '100%' }} placeholder="Chọn Base" value={pick} onChange={setPick} showSearch optionFilterProp="label" options={bases.map((b) => ({ value: b.token, label: b.name }))} notFoundContent="Chưa thấy Base — đăng nhập Lark web hoặc thêm Base" />
          <Button type="primary" loading={running} disabled={!pick} onClick={() => void learn()}>
            Học
          </Button>
        </Space>
        {running && (
          <div style={{ marginTop: 12 }}>
            <Spin size="small" /> <Text type="secondary">Đang quét Base và soạn đề xuất (có thể mất vài phút)…</Text>
          </div>
        )}
        {!!props?.length && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {props.map((p) => (
              <div key={p.id} style={{ border: `1px solid ${V.borderSub}`, borderRadius: 8, padding: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text strong>{p.updateName ? `Cập nhật «${p.updateName}»` : p.name}</Text>
                  {p.triggers.slice(0, 6).map((x) => (
                    <Tag key={x} style={{ margin: 0, fontSize: 10.5 }}>
                      {x}
                    </Tag>
                  ))}
                </div>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: 12, marginTop: 6, maxHeight: 160, overflow: 'auto', color: V.text }}>{p.instructions}</div>
                <div style={{ marginTop: 6 }}>
                  {p.state === 'saved' ? (
                    <Text type="success">✓ Đã lưu</Text>
                  ) : p.state === 'dismissed' ? (
                    <Text type="secondary">Đã bỏ qua</Text>
                  ) : (
                    <Space>
                      <Button size="small" type="primary" onClick={() => void save(p)}>
                        Lưu kỹ năng
                      </Button>
                      <Button size="small" onClick={() => setProps((cur) => (cur ?? []).map((x) => (x.id === p.id ? { ...x, state: 'dismissed' } : x)))}>
                        Bỏ qua
                      </Button>
                    </Space>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}

/** Lịch sử phiên bản của một kỹ năng (trong hộp sửa). */
export function SkillVersionHistory({ runtime, skill, onChanged }: { runtime: RuntimeAdapter; skill: SkillInfo; onChanged: () => void }) {
  const { message } = App.useApp();
  const [list, setList] = useState<SkillVersion[] | null>(null);
  const [diff, setDiff] = useState<{ at: string; rows: { op: ' ' | '-' | '+'; line: string }[] } | null>(null);
  const load = useCallback(() => {
    runtime.skillSnapshots?.(skill.id).then(setList).catch(() => setList([]));
  }, [runtime, skill.id]);
  useEffect(load, [load]);
  if (!runtime.skillSnapshots) return null;

  const showDiff = async (at: string) => {
    try {
      const r = await runtime.skillVersionText!(skill.id, at);
      setDiff({ at, rows: lineDiff(r.before, r.current) });
    } catch (e) {
      message.error((e as Error)?.message || 'Không đọc được phiên bản.');
    }
  };
  const restore = async (at: string) => {
    try {
      await runtime.restoreSkill!(skill.id, at);
      message.success('Đã khôi phục phiên bản.');
      load();
      onChanged();
    } catch (e) {
      message.error((e as Error)?.message || 'Không khôi phục được.');
    }
  };
  const undoLearn = async () => {
    try {
      await runtime.skillUndoLearn!(skill.id);
      message.success('Đã hoàn tác lần tự học gần nhất.');
      load();
      onChanged();
    } catch (e) {
      message.error((e as Error)?.message || 'Không hoàn tác được.');
    }
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <HistoryOutlined />
        <Text strong style={{ fontSize: 13 }}>Lịch sử phiên bản</Text>
        {runtime.skillUndoLearn && (skill.learned || list?.some((x) => x.by === 'ai')) && (
          <Button size="small" icon={<RollbackOutlined />} onClick={() => void undoLearn()}>
            Hoàn tác lần tự học gần nhất
          </Button>
        )}
      </div>
      {skill.learned && (
        <div style={{ fontSize: 12, color: V.textFaint, marginTop: 4 }}>
          Tạo bởi AI tự học ({ORIGIN_LABEL[skill.learned.origin] || skill.learned.origin}) · {new Date(skill.learned.at).toLocaleString('vi-VN')}
          {skill.learned.reason ? ` — ${skill.learned.reason}` : ''}
        </div>
      )}
      {!list ? (
        <Spin size="small" />
      ) : !list.length ? (
        <Text type="secondary" style={{ fontSize: 12 }}>Chưa có phiên bản cũ (mỗi lần sửa — bởi bạn hay AI — sẽ lưu một bản để lùi lại).</Text>
      ) : (
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {list.map((v) => (
            <div key={v.at} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, flexWrap: 'wrap' }}>
              <span style={{ color: V.textFaint, minWidth: 130 }}>{new Date(v.at).toLocaleString('vi-VN')}</span>
              <Tag color={v.by === 'ai' ? 'gold' : 'blue'} style={{ margin: 0, fontSize: 10.5 }}>
                {v.by === 'ai' ? 'AI tự học' : 'Bạn'}
              </Tag>
              <span style={{ flex: 1, minWidth: 120 }}>{v.what}</span>
              {runtime.skillVersionText && (
                <Button size="small" type="link" style={{ padding: 0 }} onClick={() => void showDiff(v.at)}>
                  Khác biệt
                </Button>
              )}
              {runtime.restoreSkill && (
                <Button size="small" type="link" style={{ padding: 0 }} onClick={() => void restore(v.at)}>
                  Khôi phục
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      <Modal open={!!diff} onCancel={() => setDiff(null)} footer={null} title="Khác biệt: phiên bản đã chọn → bản hiện tại" width={720}>
        {diff && (
          <>
            <Alert type="info" showIcon style={{ marginBottom: 8 }} message="Dòng đỏ (−) chỉ có ở phiên bản cũ, dòng xanh (+) là của bản hiện tại." />
            <pre style={{ fontSize: 12, maxHeight: '60vh', overflow: 'auto', background: V.surfaceAlt, padding: 8, borderRadius: 6, whiteSpace: 'pre-wrap' }}>
              {diff.rows.map((r, i) => (
                <div key={i} style={{ color: r.op === '-' ? '#cf1322' : r.op === '+' ? '#389e0d' : V.text, background: r.op === ' ' ? undefined : r.op === '-' ? '#fff1f0' : '#f6ffed' }}>
                  {r.op} {r.line}
                </div>
              ))}
            </pre>
          </>
        )}
      </Modal>
    </div>
  );
}
