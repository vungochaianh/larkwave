'use client';
import { useEffect, useState } from 'react';
import { App as AntApp, Button, Card, Dropdown, Empty, Input, Tag, Typography } from 'antd';
import { AppstoreOutlined, DeleteOutlined, EditOutlined, FolderAddOutlined, FolderOutlined, MoreOutlined } from '@ant-design/icons';
import type { AppSummary } from '@larkwave/core';
import { useRuntime } from '../RuntimeProvider';
import { BRAND, CARD_SHADOW, V } from '../theme';
import { UNCAT, loadCats, saveCats, onCatsChange, newCategoryId, type CatStore } from '../convCategories';
import { onAppsChange, mergeOptimistic } from '../appEvents';
import { AppThumb } from './AppThumb';
import { useI18n } from '../i18n';

/** A short "x phút/giờ/ngày trước" for an ISO timestamp. */
function relTime(iso?: string): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d} ngày trước`;
  if (h > 0) return `${h} giờ trước`;
  if (m > 0) return `${m} phút trước`;
  return 'vừa xong';
}

/** A colored dot + Vietnamese label for an app's status. */
function statusMeta(s?: string): { color: string; label: string } {
  const k = (s || '').toLowerCase();
  if (k === 'live') return { color: '#16B98D', label: 'Live' };
  if (k === 'ready') return { color: '#16B98D', label: 'Sẵn sàng' };
  if (k === 'building' || k === 'deploying') return { color: '#F59E0B', label: 'Đang chạy' };
  if (k === 'error' || k === 'failed') return { color: '#EF4444', label: 'Lỗi' };
  if (k === 'draft' || !k) return { color: '#9AA3B5', label: 'Nháp' };
  return { color: '#9AA3B5', label: s as string };
}

/** App-type tag (web/mobile/extension) shown on the card. */
function trackMeta(t?: string): { color: string; label: string } | null {
  if (t === 'mobile') return { color: 'geekblue', label: 'Mobile' };
  if (t === 'extension') return { color: 'purple', label: 'Extension' };
  if (t === 'web') return { color: 'gold', label: 'Website' };
  return null;
}

const HOVER_SHADOW = '0 6px 16px rgba(17,24,39,0.10), 0 12px 32px rgba(108,92,231,0.10)';

/** Small type badge beside the name — the cover above it now carries the app's identity. */
const ICON_STYLE = {
  display: 'inline-flex',
  width: 26,
  height: 26,
  minWidth: 26,
  borderRadius: 8,
  alignItems: 'center',
  justifyContent: 'center',
  background: 'linear-gradient(135deg, rgba(108,92,231,0.16), rgba(166,107,255,0.13))',
  color: '#6C5CE7',
  fontSize: 13,
} as const;

/** How many cover screenshots to ask for at once — a 40-app list must not fire 40 IPC
 *  round-trips in one frame (each reads a PNG off disk and base64s it into the message). */
const SHOT_BATCH = 8;

/** The host shown in the cover's faux address bar ('' when there's no URL yet). */
function hostOf(url?: string): string {
  if (!url) return '';
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

export function AppsGrid({
  refreshKey,
  embedded,
  organizable,
  compact,
  onOpen,
  trackFilter,
}: {
  refreshKey?: number;
  embedded?: boolean;
  /** When set, only show apps of this type (website/mobile/desktop/game/extension). */
  trackFilter?: string;
  /** Show the category folders + drag-to-organize + rename (the "App của tôi" manager view). */
  organizable?: boolean;
  /** Short covers for a narrow column (the Trang chủ rail) instead of the full 16:10. */
  compact?: boolean;
  /** Click an app card to open it (e.g. its iterate conversation/workspace). */
  onOpen?: (app: AppSummary) => void;
}) {
  const runtime = useRuntime();
  const { t } = useI18n();
  const { message, modal } = AntApp.useApp();
  const [apps, setApps] = useState<AppSummary[] | null>(null);
  const [store, setStore] = useState<CatStore>(loadCats);
  // Stay in sync when the sidebar organizer changes categories (same localStorage layer).
  useEffect(() => onCatsChange(() => setStore(loadCats())), []);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCat, setOverCat] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null); // app being renamed
  const [editVal, setEditVal] = useState('');
  const [editCatId, setEditCatId] = useState<string | null>(null); // category being renamed
  const [editCatVal, setEditCatVal] = useState('');
  const [newCat, setNewCat] = useState('');
  const [addingCat, setAddingCat] = useState(false);
  // Cover screenshots as `data:` URLs, keyed by app id. Empty on web (no appScreenshot there)
  // and for apps never captured — AppThumb falls back to the brand mark on its own.
  const [shots, setShots] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    /** Fetch covers lazily, SHOT_BATCH at a time, AFTER the list is already on screen. */
    const loadShots = async (list: AppSummary[]) => {
      if (!runtime.appScreenshot) return;
      for (let i = 0; i < list.length && alive; i += SHOT_BATCH) {
        const batch = list.slice(i, i + SHOT_BATCH);
        const res = await Promise.allSettled(batch.map((a) => runtime.appScreenshot?.(a.id)));
        if (!alive) return;
        const next: Record<string, string> = {};
        res.forEach((r, k) => {
          if (r.status === 'fulfilled' && r.value?.dataUrl) next[batch[k].id] = r.value.dataUrl;
        });
        if (Object.keys(next).length) setShots((prev) => ({ ...prev, ...next }));
      }
    };
    const load = () =>
      runtime
        .listApps()
        .then((a) => {
          if (!alive) return;
          const merged = mergeOptimistic(a);
          const list = trackFilter ? merged.filter((x) => (x.track ?? 'web') === trackFilter) : merged;
          setApps(list);
          void loadShots(list);
        })
        .catch(() => alive && setApps([]));
    void load();
    // Re-load whenever ANY tab changes the app set — the cross-tab realtime sync. A finished
    // capture fires the same bus, so a fresh screenshot lands here too.
    const off = onAppsChange(load);
    return () => {
      alive = false;
      off();
    };
  }, [runtime, refreshKey, trackFilter]);

  const update = (mut: (s: CatStore) => CatStore) =>
    setStore((s) => {
      const next = mut(s);
      saveCats(next);
      return next;
    });

  const moveTo = (catId: string) => {
    if (!dragId) return;
    update((s) => {
      const appCat = { ...s.appCat };
      if (catId === UNCAT) delete appCat[dragId];
      else appCat[dragId] = catId;
      return { ...s, appCat };
    });
    setDragId(null);
    setOverCat(null);
  };

  const addCategory = () => {
    const n = newCat.trim().slice(0, 40);
    setAddingCat(false);
    setNewCat('');
    if (!n) return;
    update((s) => ({ ...s, categories: [...s.categories, { id: newCategoryId(), name: n }] }));
  };
  const saveCatRename = () => {
    const id = editCatId;
    const name = editCatVal.trim().slice(0, 40);
    setEditCatId(null);
    if (!id || !name) return;
    update((s) => ({ ...s, categories: s.categories.map((c) => (c.id === id ? { ...c, name } : c)) }));
  };
  const deleteCategory = (id: string, name: string) =>
    modal.confirm({
      title: `${t('ui.appsGrid.deleteCat', 'Xoá danh mục')} "${name}"?`,
      content: t('ui.appsGrid.deleteCatContent', 'Các app trong danh mục này sẽ trở về "Chưa phân loại" (app KHÔNG bị xoá).'),
      okText: t('ui.action.delete', 'Xoá'),
      okButtonProps: { danger: true },
      cancelText: t('ui.action.cancel', 'Huỷ'),
      onOk: () =>
        update((s) => {
          const appCat = { ...s.appCat };
          for (const k of Object.keys(appCat)) if (appCat[k] === id) delete appCat[k];
          return { categories: s.categories.filter((c) => c.id !== id), appCat };
        }),
    });

  const saveRename = async (a: AppSummary) => {
    const name = editVal.trim().slice(0, 80);
    setEditId(null);
    if (!name || name === a.name || !runtime.renameApp) return;
    try {
      await runtime.renameApp(a.id, name);
      setApps((prev) => prev?.map((x) => (x.id === a.id ? { ...x, name } : x)) ?? prev);
    } catch (e) {
      message.error((e as Error).message);
    }
  };

  const card = (a: AppSummary) => {
    const st = statusMeta(a.status);
    const tk = trackMeta(a.track);
    return (
    // A plain draggable WRAPPER (not the antd Card) so HTML5 drag fires reliably.
    <div
      key={a.id}
      draggable={organizable && editId !== a.id}
      onDragStart={
        organizable
          ? (e) => {
              setDragId(a.id);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', a.id);
            }
          : undefined
      }
      onDragEnd={
        organizable
          ? () => {
              setDragId(null);
              setOverCat(null);
            }
          : undefined
      }
      style={{ opacity: dragId === a.id ? 0.5 : 1, cursor: organizable && editId !== a.id ? 'grab' : undefined, height: '100%' }}
    >
    <Card
      size="small"
      onClick={onOpen && editId !== a.id ? () => onOpen(a) : undefined}
      style={{
        borderRadius: 14,
        border: `1px solid ${V.border}`,
        boxShadow: CARD_SHADOW,
        cursor: onOpen ? 'pointer' : undefined,
        overflow: 'hidden', // clip the cover to the card's rounded corners
        transition: 'transform .14s ease, box-shadow .14s ease, border-color .14s ease',
        height: '100%', // fill the grid cell so every card in a row is equal-height (borders align)
      }}
      styles={{ body: { padding: 0 } }}
      onMouseEnter={(e) => {
        if (!onOpen) return;
        const el = e.currentTarget as HTMLElement;
        el.style.transform = 'translateY(-2px)';
        el.style.boxShadow = HOVER_SHADOW;
        el.style.borderColor = 'rgba(108,92,231,0.35)';
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.transform = '';
        el.style.boxShadow = CARD_SHADOW;
        el.style.borderColor = V.border;
      }}
    >
      {/* Latest screenshot of the app's own views; brand cover until it has one. */}
      <AppThumb src={shots[a.id]} name={a.name} seed={a.id} host={hostOf(a.url)} compact={compact} />
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 16 }}>
        <span style={ICON_STYLE}>
          <AppstoreOutlined />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          {editId === a.id ? (
            <Input
              size="small"
              autoFocus
              value={editVal}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setEditVal(e.target.value)}
              onPressEnter={() => void saveRename(a)}
              onBlur={() => void saveRename(a)}
              style={{ marginBottom: 6 }}
            />
          ) : (
            <div
              title={a.name}
              style={{
                fontWeight: 600,
                fontSize: 14.5,
                marginBottom: 6,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {a.name}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {tk && (
              <Tag color={tk.color} style={{ margin: 0, fontSize: 10, lineHeight: '16px', padding: '0 6px' }}>
                {tk.label}
              </Tag>
            )}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 500, color: st.color }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: st.color, display: 'inline-block' }} />
              {st.label}
            </span>
            {a.updatedAt && (
              <Typography.Text type="secondary" style={{ fontSize: 11.5 }}>
                · {relTime(a.updatedAt)}
              </Typography.Text>
            )}
          </div>
        </div>
        {organizable && runtime.renameApp && editId !== a.id && (
          <button
            type="button"
            title={t('ui.action.rename', 'Đổi tên')}
            onClick={(e) => {
              e.stopPropagation();
              setEditId(a.id);
              setEditVal(a.name);
            }}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: V.textFaint, padding: 2 }}
          >
            <EditOutlined />
          </button>
        )}
      </div>
    </Card>
    </div>
    );
  };

  const flatGrid =
    apps && apps.length ? (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%, 240px),1fr))', gap: 16 }}>
        {apps.map(card)}
      </div>
    ) : (
      <div
        style={{
          textAlign: 'center',
          padding: '40px 16px',
          border: `1px dashed ${V.border}`,
          borderRadius: 16,
          background: V.surfaceAlt,
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            width: 52,
            height: 52,
            borderRadius: 14,
            alignItems: 'center',
            justifyContent: 'center',
            color: BRAND,
            background: 'rgba(108,92,231,0.12)',
          }}
        >
          <AppstoreOutlined style={{ fontSize: 26 }} />
        </span>
        <div style={{ fontWeight: 600, marginTop: 12 }}>{t('ui.appsGrid.empty', 'Chưa có app nào ở máy này')}</div>
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          {t('ui.appsGrid.emptyHint', 'Bấm “Tạo app” để dựng app mới, hoặc “Nhập từ Git” để clone repo về.')}
        </Typography.Text>
      </div>
    );

  // ── Organizer view: categories (folders) + drag-to-move + rename. ──
  if (organizable) {
    if (!apps) return null;
    const groups: { id: string; name: string; isCat: boolean }[] = [
      ...store.categories.map((c) => ({ id: c.id, name: c.name, isCat: true })),
      { id: UNCAT, name: t('ui.appsGrid.uncategorized', 'Chưa phân loại'), isCat: false },
    ];
    const appsIn = (catId: string) => apps.filter((a) => (store.appCat[a.id] || UNCAT) === catId);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {addingCat ? (
            <span style={{ display: 'inline-flex', gap: 6 }}>
              <Input
                size="small"
                autoFocus
                placeholder={t('ui.appsGrid.catName', 'Tên danh mục')}
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                onPressEnter={addCategory}
                onBlur={addCategory}
                style={{ width: 180 }}
              />
            </span>
          ) : (
            <Button size="small" icon={<FolderAddOutlined />} onClick={() => setAddingCat(true)}>
              {t('ui.appsGrid.newCat', 'Danh mục mới')}
            </Button>
          )}
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {t('ui.appsGrid.organizeHint', 'Kéo-thả app vào danh mục để sắp xếp · bấm nút bút chì để đổi tên.')}
          </Typography.Text>
        </div>
        {groups.map((g) => {
          const list = appsIn(g.id);
          if (g.id === UNCAT && list.length === 0 && store.categories.length > 0) return null; // hide empty uncat
          return (
            <div
              key={g.id}
              onDragOver={(e) => {
                if (dragId) {
                  e.preventDefault();
                  setOverCat(g.id);
                }
              }}
              onDragLeave={() => setOverCat((c) => (c === g.id ? null : c))}
              onDrop={() => moveTo(g.id)}
              style={{
                border: overCat === g.id ? `2px solid ${BRAND}` : '2px dashed transparent',
                background: overCat === g.id ? 'rgba(108,92,231,0.06)' : 'transparent',
                boxShadow: overCat === g.id ? CARD_SHADOW : 'none',
                borderRadius: 14,
                padding: overCat === g.id ? 12 : 2,
                transition: 'border-color .12s, padding .12s, background .12s, box-shadow .12s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
                <FolderOutlined style={{ color: g.isCat ? BRAND : V.textFaint }} />
                {editCatId === g.id ? (
                  <Input
                    size="small"
                    autoFocus
                    value={editCatVal}
                    onChange={(e) => setEditCatVal(e.target.value)}
                    onPressEnter={saveCatRename}
                    onBlur={saveCatRename}
                    style={{ width: 180 }}
                  />
                ) : (
                  <Typography.Text strong style={{ fontSize: 14 }}>
                    {g.name}
                  </Typography.Text>
                )}
                <Tag style={{ marginInlineStart: 2 }}>{list.length}</Tag>
                {g.isCat && editCatId !== g.id && (
                  <Dropdown
                    trigger={['click']}
                    menu={{
                      items: [
                        {
                          key: 'rename',
                          icon: <EditOutlined />,
                          label: t('ui.appsGrid.renameCat', 'Đổi tên danh mục'),
                          onClick: () => {
                            setEditCatId(g.id);
                            setEditCatVal(g.name);
                          },
                        },
                        {
                          key: 'del',
                          icon: <DeleteOutlined />,
                          danger: true,
                          label: t('ui.appsGrid.deleteCatMenu', 'Xoá danh mục'),
                          onClick: () => deleteCategory(g.id, g.name),
                        },
                      ],
                    }}
                  >
                    <button
                      type="button"
                      title={t('ui.appsGrid.catOptions', 'Tuỳ chọn danh mục')}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: V.textFaint }}
                    >
                      <MoreOutlined />
                    </button>
                  </Dropdown>
                )}
              </div>
              {list.length ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%, 240px),1fr))', gap: 16 }}>
                  {list.map(card)}
                </div>
              ) : (
                <Typography.Text type="secondary" style={{ fontSize: 12.5, fontStyle: 'italic' }}>
                  {t('ui.appsGrid.dropHere', 'Kéo app vào đây…')}
                </Typography.Text>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  if (embedded) return flatGrid;
  if (!apps || !apps.length) return null;
  return (
    <div style={{ maxWidth: 760, margin: '28px auto 0' }}>
      <Typography.Title level={5} style={{ marginBottom: 12, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <AppstoreOutlined /> {t('ui.appsGrid.recent', 'App gần đây')}
      </Typography.Title>
      {flatGrid}
    </div>
  );
}
