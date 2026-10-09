'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Drawer, Empty, Input, Tooltip } from 'antd';
import { DeleteOutlined, EditOutlined, HistoryOutlined, PlusOutlined } from '@ant-design/icons';
import type { RuntimeAdapter } from '@larkwave/core';
import { BRAND_GRADIENT, V } from '../../theme';
import { WorkspaceTabStrip, type TabItem } from '../WorkspaceTabStrip';
import { LarkChat } from './LarkChat';

/**
 * Nhiều hội thoại Lark mở cùng lúc, kiểu tab trình duyệt.
 *
 * Bất biến quan trọng nhất: MỌI tab đã mở đều GIỮ NGUYÊN TRẠNG THÁI GẮN KẾT, chỉ ẩn/hiện bằng CSS.
 * Nếu tháo tab ẩn ra khỏi cây React thì lượt đang chạy của nó mất luồng chữ, mất cuộn, và các
 * `await` đang treo (xác nhận công cụ, câu hỏi ask_user) bị bỏ rơi — đúng lý do thanh tab dự án
 * cũng làm y hệt (xem WorkspaceTabStrip).
 *
 * Chạy song song thật sự là việc của tiến trình chính (agentLock khoá theo từng hội thoại, có
 * trần). Ở đây chỉ cần đừng cản: mỗi tab gửi kèm sessionId của chính nó.
 */
/** Chào theo buổi. Mốc giờ chọn theo nếp Việt: sáng tới 11h, trưa 11–13h, chiều 13–18h, còn lại tối. */
function greeting(now = new Date()): { text: string; icon: string } {
  const h = now.getHours();
  if (h < 11) return { text: 'Chào buổi sáng', icon: '☀️' };
  if (h < 13) return { text: 'Chào buổi trưa', icon: '🌤️' };
  if (h < 18) return { text: 'Chào buổi chiều', icon: '🌇' };
  return { text: 'Chào buổi tối', icon: '🌙' };
}

export function LarkChatShell({
  runtime,
  basesRev = 0,
  onOpenSkills,
  blocked,
  userName,
}: {
  runtime: RuntimeAdapter;
  /** Tên người dùng để chào. Bỏ trống thì chỉ chào theo buổi, không bịa tên. */
  userName?: string;
  basesRev?: number;
  onOpenSkills?: () => void;
  blocked?: string | null;
}) {
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [running, setRunning] = useState<Set<string>>(new Set());
  const [closed, setClosed] = useState<string[]>([]);
  /** Tab được ghim — menu chuột phải của thanh tab có mục này, để nó rỗng là một nút chết. */
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  /** Toàn bộ hội thoại đã có (không chỉ tab đang mở) — nguồn cho ngăn "Hội thoại cũ". */
  const [allSessions, setAllSessions] = useState<
    { id: string; title?: string; bases?: { appToken: string; name?: string }[]; updatedAt?: string }[]
  >([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [q, setQ] = useState('');
  const booted = useRef(false);
  const { message, modal } = App.useApp();
  // Tính MỘT LẦN mỗi lần gắn: lời chào không cần đổi giữa chừng, mà tính lại mỗi lần vẽ thì
  // `new Date()` biến thành một nguồn thay đổi vô nghĩa.
  const hello = useMemo(() => greeting(), []);

  /** Danh sách hội thoại (để đặt tên tab) — làm mới khi mở tab và sau mỗi lượt. */
  const refreshTitles = useCallback(async () => {
    const all = await runtime.larkSessions?.().catch(() => []);
    if (!Array.isArray(all)) return;
    // Hội thoại "Tạo workflow" có danh sách riêng ở màn đó — không trộn vào đây.
    const list = all.filter((s) => s?.kind !== 'workflow');
    const next: Record<string, string> = {};
    for (const s of list as { id: string; title?: string }[]) {
      if (s?.id) next[s.id] = (s.title || '').trim() || 'Cuộc trò chuyện';
    }
    setTitles(next);
    setAllSessions(list as { id: string; title?: string; bases?: { appToken: string; name?: string }[] }[]);
    return list as { id: string; title?: string; active?: boolean }[];
  }, [runtime]);

  // Mở tab đầu tiên = hội thoại đang active (hoặc mới nhất). Chỉ chạy MỘT lần.
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    void (async () => {
      const list = await refreshTitles();
      const first = list?.find((s) => s.active) || list?.[0];
      if (first?.id) {
        setOpenIds([first.id]);
        setActiveId(first.id);
      }
    })();
  }, [refreshTitles]);

  // Tab nào đang chạy lượt AI — chấm dấu lên thanh tab. Đọc từ danh sách khoá của tiến trình chính.
  useEffect(() => {
    let alive = true;
    const pull = async () => {
      const owners = await runtime.agentBusyList?.().catch(() => []);
      if (!alive || !Array.isArray(owners)) return;
      setRunning(new Set(owners.map((o) => o?.sessionId).filter((x): x is string => !!x)));
    };
    void pull();
    const off = runtime.onAgentBusyList?.((owners) =>
      setRunning(new Set((owners || []).map((o) => o?.sessionId).filter((x): x is string => !!x))),
    );
    const t = setInterval(pull, 4000); // dự phòng khi kênh đẩy không có (bản lõi cũ)
    return () => {
      alive = false;
      clearInterval(t);
      clearInterval(t);
      off?.();
    };
  }, [runtime]);

  const openTab = (id: string) => {
    setOpenIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setActiveId(id);
    void refreshTitles();
  };

  const newTab = async () => {
    const r = await runtime.larkNewSession?.([]).catch(() => undefined);
    if (r?.id) openTab(r.id);
  };

  /** Xoá hẳn một hội thoại (có hỏi lại). Xoá luôn tab của nó nếu đang mở. */
  const removeSession = (id: string, title?: string) =>
    modal.confirm({
      // antd mặc định KHÔNG đóng khi bấm ra ngoài. Với hộp thoại chỉ hỏi lại một câu thì đó là
      // cái bẫy: người ta bấm ra ngoài để huỷ, thấy không đóng, tưởng app treo.
      maskClosable: true,
      title: 'Xoá hội thoại này?',
      content: `“${title?.trim() || 'Cuộc trò chuyện'}” sẽ bị xoá khỏi máy. Không thể hoàn tác.`,
      okText: 'Xoá',
      okButtonProps: { danger: true },
      cancelText: 'Huỷ',
      onOk: async () => {
        try {
          await runtime.larkDeleteSession?.(id);
        } catch {
          message.error('Chưa xoá được hội thoại.');
          return;
        }
        setOpenIds((prev) => prev.filter((x) => x !== id));
        setActiveId((cur) => (cur === id ? null : cur));
        setAllSessions((prev) => prev.filter((s) => s.id !== id));
      },
    });

  /** Đổi tên hội thoại. Để trống = trả về tên tự suy từ tin nhắn đầu. */
  const renameSession = (id: string, current?: string) => {
    let draft = current?.trim() || '';
    modal.confirm({
      maskClosable: true,
      title: 'Đổi tên hội thoại',
      icon: null,
      content: (
        <Input
          defaultValue={draft}
          maxLength={80}
          placeholder="Để trống = tự đặt theo tin nhắn đầu"
          onChange={(e) => (draft = e.target.value)}
        />
      ),
      okText: 'Lưu',
      cancelText: 'Huỷ',
      onOk: async () => {
        try {
          await runtime.larkRenameSession?.(id, draft);
        } catch {
          message.error('Chưa đổi được tên.');
          return;
        }
        await refreshTitles();
      },
    });
  };

  const closeTab = (id: string) => {
    setOpenIds((prev) => {
      const next = prev.filter((x) => x !== id);
      // Đóng tab đang xem → chuyển sang tab bên cạnh, không để màn hình trống.
      if (activeId === id) setActiveId(next[Math.max(0, prev.indexOf(id) - 1)] ?? next[0] ?? null);
      return next;
    });
    setClosed((c) => [...c, id]);
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return allSessions;
    return allSessions.filter((s) => (s.title || '').toLowerCase().includes(needle));
  }, [allSessions, q]);

  /**
   * Gom hội thoại theo BASE đang áp dụng — đó là cách người dùng thực sự nhớ chúng ("mấy cuộc về
   * bảng Đơn hàng"), chứ không phải theo thứ tự thời gian. Hội thoại chưa gắn Base nào rơi vào
   * nhóm "Chưa gắn Base" ở cuối.
   */
  const grouped = useMemo(() => {
    const g = new Map<string, { name: string; items: typeof filtered }>();
    for (const s of filtered) {
      const b = s.bases?.[0];
      const key = b?.appToken || '_none';
      const name = b?.name || (key === '_none' ? 'Chưa gắn Base' : 'Base');
      if (!g.has(key)) g.set(key, { name, items: [] });
      g.get(key)!.items.push(s);
    }
    // "Chưa gắn Base" xuống cuối — nhóm có tên cụ thể mới là thứ người ta tìm.
    return [...g.entries()].sort((a, b) => (a[0] === '_none' ? 1 : b[0] === '_none' ? -1 : 0));
  }, [filtered]);

  const tabs: TabItem[] = openIds.map((id) => ({
    id,
    name: titles[id] || 'Cuộc trò chuyện',
    status: running.has(id) ? 'running' : 'idle',
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Lối vào HỘI THOẠI CŨ.
          Thanh tab chỉ liệt kê tab ĐANG MỞ, nên nếu không có nút này thì mọi cuộc trò chuyện cũ
          trở nên không thể với tới — đúng lỗi bản 1.0.292 đã gây ra: dữ liệu còn nguyên trên đĩa
          nhưng người dùng thấy như bị mất sạch. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Tooltip title="Hội thoại cũ">
          <Button
            type="text"
            icon={<HistoryOutlined />}
            onClick={() => {
              void refreshTitles();
              setHistoryOpen(true);
            }}
            style={{ flex: '0 0 auto', color: V.textSub }}
          />
        </Tooltip>
        <div style={{ flex: 1, minWidth: 0 }}>
      <WorkspaceTabStrip
        apps={tabs}
        activeId={activeId}
        pinned={pinned}
        runningIds={running}
        onActivate={setActiveId}
        onClose={closeTab}
        // Về màn hình chào. Bản trước viết `activeId && setActiveId(activeId)` — một phép gán
        // chính nó, tức KHÔNG LÀM GÌ; bấm "Trang chủ" trông như hỏng.
        onHome={() => setActiveId(null)}
        onNew={() => void newTab()}
        onReorder={(from, to) =>
          setOpenIds((prev) => {
            const next = [...prev];
            const [m] = next.splice(from, 1);
            if (m) next.splice(to, 0, m);
            return next;
          })
        }
        onTogglePin={(id) =>
          setPinned((prev) => {
            const next = new Set(prev);
            if (!next.delete(id)) next.add(id);
            return next;
          })
        }
        // Ghim là để KHỎI bị đóng nhầm — nên hai lệnh đóng hàng loạt phải chừa tab đã ghim ra,
        // nếu không thì cái ghim chẳng có tác dụng gì.
        onCloseOthers={(id) => setOpenIds((prev) => prev.filter((x) => x === id || pinned.has(x)))}
        onCloseAll={() => {
          setOpenIds((prev) => prev.filter((x) => pinned.has(x)));
          setActiveId(null);
        }}
        onReopen={() => {
          const last = closed[closed.length - 1];
          if (!last) return;
          setClosed((c) => c.slice(0, -1));
          openTab(last);
        }}
        canReopen={closed.length > 0}
      />
        </div>
      </div>

      <Drawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        placement="left"
        width={340}
        title="Hội thoại cũ"
        styles={{ body: { padding: 12 } }}
      >
        <Input.Search
          placeholder="Tìm theo tên…"
          allowClear
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ marginBottom: 10 }}
        />
        {!filtered.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có hội thoại nào" />}
        {grouped.map(([key, g]) => (
          <div key={key} style={{ marginBottom: 12 }}>
            <div
              style={{
                fontSize: 11.5,
                fontWeight: 700,
                letterSpacing: 0.4,
                textTransform: 'uppercase',
                color: V.textFaint,
                padding: '4px 6px',
              }}
            >
              {g.name} · {g.items.length}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {g.items.map((s) => {
                const isOpen = openIds.includes(s.id);
                return (
                  <div
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      openTab(s.id);
                      setHistoryOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 10px',
                      borderRadius: 8,
                      cursor: 'pointer',
                      fontSize: 13.5,
                      background: isOpen ? V.chipBg : 'transparent',
                      color: isOpen ? V.chipText : V.text,
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {s.title?.trim() || 'Cuộc trò chuyện'}
                    </span>
                    {isOpen && <span style={{ fontSize: 11, color: V.textFaint }}>đang mở</span>}
                    <Tooltip title="Đổi tên">
                      <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={(e) => {
                          e.stopPropagation();
                          renameSession(s.id, s.title);
                        }}
                        style={{ color: V.textFaint }}
                      />
                    </Tooltip>
                    <Tooltip title="Xoá hội thoại">
                      <Button
                        type="text"
                        size="small"
                        icon={<DeleteOutlined />}
                        onClick={(e) => {
                          e.stopPropagation(); // đừng mở tab khi người ta bấm nút xoá
                          void removeSession(s.id, s.title);
                        }}
                        style={{ color: V.textFaint }}
                      />
                    </Tooltip>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </Drawer>

      {/* MỌI tab giữ nguyên gắn kết — chỉ ẩn/hiện. Tháo ra là mất luồng đang chảy. */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {openIds.map((id) => (
          <div
            key={id}
            style={{
              position: 'absolute',
              inset: 0,
              display: id === activeId ? 'flex' : 'none',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
            <LarkChat
              runtime={runtime}
              basesRev={basesRev}
              onOpenSkills={onOpenSkills}
              blocked={blocked}
              pinnedSessionId={id}
              hideSessionList
            />
          </div>
        ))}
        {!activeId && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              height: '100%',
              padding: 24,
              textAlign: 'center',
            }}
          >
            {/* Biểu tượng chào: vòng sáng thở phía sau, đủ để màn hình trống có nhịp sống mà
                không kéo mắt khỏi hai nút bên dưới. */}
            <div className="tw-rise" style={{ position: 'relative', width: 84, height: 84, marginBottom: 6 }}>
              <span
                className="tw-breathe"
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '50%',
                  background: BRAND_GRADIENT,
                  filter: 'blur(16px)',
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  inset: 8,
                  borderRadius: '50%',
                  background: V.surface,
                  border: `1px solid ${V.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 30,
                }}
              >
                {hello.icon}
              </span>
            </div>

            <div className="tw-rise tw-rise-1" style={{ fontSize: 22, fontWeight: 700, color: V.text }}>
              {hello.text}
              {userName ? `, ${userName}` : ''}
            </div>
            <div
              className="tw-rise tw-rise-2"
              style={{ fontSize: 13.5, color: V.textSub, maxWidth: 460, lineHeight: 1.6 }}
            >
              Hỏi bất cứ điều gì về dữ liệu Lark của bạn — bảng Base, tin nhắn, tài liệu, danh bạ.
              Mở nhiều cuộc trò chuyện cùng lúc và hỏi song song.
            </div>

            <div className="tw-rise tw-rise-3" style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
              <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => void newTab()}>
                Cuộc trò chuyện mới
              </Button>
              {allSessions.length > 0 && (
                <Button size="large" icon={<HistoryOutlined />} onClick={() => setHistoryOpen(true)}>
                  Hội thoại cũ ({allSessions.length})
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
