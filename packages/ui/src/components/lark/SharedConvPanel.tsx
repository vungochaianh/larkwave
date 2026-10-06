'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { App as AntApp, Alert, Button, Card, Empty, Input, Select, Space, Tag, Tooltip, Typography } from 'antd';
import { SendOutlined, TeamOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { accountApi, type LarkConvItem, type LarkGrant, type LarkSharedConv } from '../../account/api';
import { V } from '../../theme';

const { Text, Paragraph } = Typography;

/**
 * Hội thoại DÙNG CHUNG của Lark Agents — chủ và người được chia sẻ cùng một luồng.
 *
 * Trước đây chia sẻ chỉ là "hỏi một câu → máy của chủ chạy → trả kết quả": đủ để nhờ vả, không đủ
 * để làm chung. Hai người không thấy nhau nói gì, và không ai biết bên kia có đang chạy hay không.
 *
 * Hai điều về cách panel này cư xử, đều cố ý:
 *   • Nhắn tin KHÔNG bị khoá lượt chặn. Chặn cả lời nhắn trong lúc agent chạy là hỏng đúng việc
 *     hai người cần nhất — nói với nhau về cái đang chạy.
 *   • Người được chia sẻ bấm "Chạy" thì lượt đi qua đúng đường uỷ quyền cũ, nên vẫn chịu hạn mức
 *     và quyền ghi theo từng Base của grant. Panel này không có lối tắt nào.
 */
export function SharedConvPanel({ grants }: { grants: LarkGrant[] }) {
  const { message } = AntApp.useApp();
  const [convs, setConvs] = useState<LarkSharedConv[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [items, setItems] = useState<LarkConvItem[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [newIn, setNewIn] = useState<string | undefined>();
  const [unavailable, setUnavailable] = useState(false);
  const seqRef = useRef(0);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const loadConvs = useCallback(async () => {
    try {
      setConvs(await accountApi.larkConvs());
    } catch {
      // Máy chủ chưa có endpoint này (bản cài mới hơn máy chủ) hoặc chưa đăng nhập ⇒ ẨN HẲN thẻ.
      // Hiện một khung rỗng mời người ta dùng một thứ chưa tồn tại thì tệ hơn là không hiện gì.
      setConvs(null);
      setUnavailable(true);
    }
  }, []);

  useEffect(() => {
    void loadConvs();
  }, [loadConvs]);

  /** Chỉ kéo phần SAU con trỏ — tải lại cả luồng mỗi vài giây thì hội thoại dài sẽ nháy liên tục
   *  và tốn băng thông vô ích. */
  const pull = useCallback(async (id: string, reset = false) => {
    if (reset) {
      seqRef.current = 0;
      setItems([]);
    }
    try {
      const fresh = await accountApi.larkConvItems(id, reset ? 0 : seqRef.current);
      if (!fresh.length) return;
      seqRef.current = Math.max(seqRef.current, fresh[fresh.length - 1].seq);
      // Gộp theo `seq`, KHÔNG nối đuôi thẳng. Con trỏ chỉ được dời SAU khi `await` xong, nên lượt
      // kéo định kỳ và lượt kéo ngay-sau-khi-gửi có thể cùng đọc một con trỏ cũ và cùng mang về
      // một dãy — nối đuôi thì tin nhắn hiện hai lần.
      setItems((prev) => {
        const by = new Map(prev.map((i) => [i.seq, i]));
        for (const f of fresh) by.set(f.seq, f);
        return [...by.values()].sort((a, b) => a.seq - b.seq);
      });
    } catch {
      /* im lặng: một lượt kéo hỏng không đáng làm phiền, lượt sau sẽ bù */
    }
  }, []);

  useEffect(() => {
    if (!openId) return;
    void pull(openId, true);
    // 4 giây: đủ nhanh để thấy người kia gõ xong, đủ thưa để không đập vào máy chủ. Máy chủ cũng
    // bắn sự kiện, nhưng vòng lặp này là cái bảo đảm luồng vẫn về khi sự kiện rơi.
    const t = setInterval(() => void pull(openId), 4000);
    const t2 = setInterval(() => void loadConvs(), 10000);
    return () => {
      clearInterval(t);
      clearInterval(t2);
    };
  }, [openId, pull, loadConvs]);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: 'smooth' });
  }, [items]);

  const open = convs?.find((c) => c.id === openId) ?? null;
  const activeGrants = grants.filter((g) => g.status === 'active');

  const send = async (run: boolean) => {
    if (!openId || !draft.trim()) return;
    setBusy(true);
    try {
      const r = await accountApi.larkConvPost(openId, draft.trim(), run);
      setDraft('');
      await pull(openId);
      if (r.turnId) {
        // Máy THỰC THI luôn là máy của chủ. Nói ra, vì nếu máy đó đang tắt thì lượt nằm hàng đợi
        // và người gửi cần biết vì sao chưa thấy trả lời — chứ không phải ngồi đoán.
        message.info('Đã gửi cho trợ lý. Lượt chạy trên máy của chủ kết nối; kết quả sẽ tự lên luồng.');
      }
    } catch (e) {
      message.error((e as Error)?.message || 'Không gửi được.');
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!newIn) return;
    setBusy(true);
    try {
      const c = await accountApi.larkConvCreate(newIn, 'Hội thoại chung');
      await loadConvs();
      setOpenId(c.id);
    } catch (e) {
      message.error((e as Error)?.message || 'Không tạo được.');
    } finally {
      setBusy(false);
    }
  };

  if (unavailable || !convs) return null;

  return (
    <Card
      size="small"
      style={{ marginBottom: 12 }}
      title={
        <Space>
          <TeamOutlined />
          <span>Hội thoại dùng chung</span>
          {convs.length ? <Tag color="blue">{convs.length}</Tag> : null}
        </Space>
      }
      extra={
        activeGrants.length ? (
          <Space.Compact>
            <Select
              size="small"
              style={{ minWidth: 160 }}
              placeholder="Chọn quyền chia sẻ"
              value={newIn}
              onChange={setNewIn}
              options={activeGrants.map((g) => ({ value: g.id, label: g.label || g.id.slice(0, 8) }))}
            />
            <Button size="small" onClick={create} disabled={!newIn || busy}>
              Tạo
            </Button>
          </Space.Compact>
        ) : null
      }
    >
      <Paragraph type="secondary" style={{ marginBottom: 10 }}>
        Cả hai bên cùng đọc, cùng viết, cùng thấy kết quả của trợ lý. Mỗi hội thoại chỉ chạy{' '}
        <b>một lượt tại một thời điểm</b> — nhưng nhắn tin cho nhau thì lúc nào cũng được.
      </Paragraph>

      {!activeGrants.length && !convs.length ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={<span style={{ color: V.textSub }}>Chưa có quyền chia sẻ nào đang hoạt động — tạo ở phần Chia sẻ kết nối Lark trước.</span>}
        />
      ) : null}

      {convs.length ? (
        <Space wrap style={{ marginBottom: 10 }}>
          {convs.map((c) => (
            <Button
              key={c.id}
              size="small"
              type={openId === c.id ? 'primary' : 'default'}
              onClick={() => setOpenId(c.id)}
            >
              {c.title || 'Hội thoại'}{' '}
              <Text type={openId === c.id ? undefined : 'secondary'} style={{ fontSize: 11 }}>
                ({c.grantLabel || 'chia sẻ'}{c.isOwner ? ' · tôi là chủ' : ''})
              </Text>
              {c.running ? <Tag color="processing" style={{ marginLeft: 6 }}>đang chạy</Tag> : null}
            </Button>
          ))}
        </Space>
      ) : null}

      {open ? (
        <>
          {open.running ? (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 8 }}
              message="Đang có một lượt chạy trong hội thoại này — chờ xong mới gửi lượt mới được. Nhắn tin thì vẫn gửi được bình thường."
            />
          ) : null}
          <div
            ref={boxRef}
            style={{
              maxHeight: 320,
              overflowY: 'auto',
              border: `1px solid ${V.borderSub}`,
              borderRadius: 10,
              padding: 10,
              background: V.surfaceAlt,
              marginBottom: 8,
            }}
          >
            {items.length ? (
              items.map((it) => <Bubble key={it.id} item={it} />)
            ) : (
              <Text type="secondary">Chưa có gì. Gửi dòng đầu tiên đi.</Text>
            )}
          </div>
          <Space.Compact style={{ width: '100%' }}>
            <Input.TextArea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoSize={{ minRows: 1, maxRows: 4 }}
              placeholder="Nhắn cho người kia, hoặc bấm Chạy để nhờ trợ lý làm"
              onPressEnter={(e) => {
                if (!e.shiftKey) {
                  e.preventDefault();
                  void send(false);
                }
              }}
            />
            <Tooltip title="Chỉ nhắn tin, không chạy trợ lý">
              <Button icon={<SendOutlined />} onClick={() => void send(false)} loading={busy} />
            </Tooltip>
            <Tooltip title="Nhờ trợ lý chạy — vẫn theo đúng quyền đã chia sẻ">
              <Button
                type="primary"
                icon={<ThunderboltOutlined />}
                onClick={() => void send(true)}
                loading={busy}
                disabled={!!open.running}
              >
                Chạy
              </Button>
            </Tooltip>
          </Space.Compact>
        </>
      ) : null}
    </Card>
  );
}

function Bubble({ item }: { item: LarkConvItem }) {
  const isAgent = item.role === 'agent';
  const isSystem = item.role === 'system';
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <Text strong style={{ fontSize: 12.5 }}>
          {isAgent ? 'Trợ lý' : isSystem ? 'Hệ thống' : item.authorName || item.authorId.slice(0, 8)}
        </Text>
        <Text type="secondary" style={{ fontSize: 11 }}>
          {new Date(item.createdAt).toLocaleString('vi-VN')}
        </Text>
        {item.turnId && !isAgent ? <Tag style={{ fontSize: 10 }}>đã nhờ trợ lý</Tag> : null}
      </div>
      <div
        style={{
          whiteSpace: 'pre-wrap',
          fontSize: 13.5,
          lineHeight: 1.6,
          background: isSystem ? undefined : V.surface,
          border: `1px solid ${isSystem ? 'transparent' : V.borderSub}`,
          borderRadius: 8,
          padding: isSystem ? 0 : '7px 10px',
          color: isSystem ? V.textSub : undefined,
        }}
      >
        {item.text}
      </div>
    </div>
  );
}
