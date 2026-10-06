'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Card, Input, Button, Segmented, Select, ColorPicker, Typography, Tag, message, Tooltip, Switch, Grid } from 'antd';
import { ThunderboltOutlined, AppstoreOutlined, GlobalOutlined, LayoutOutlined, DatabaseOutlined, ToolOutlined, SettingOutlined, PaperClipOutlined, CloseOutlined, FolderOpenOutlined, DownOutlined, RightOutlined } from '@ant-design/icons';
import type { AppMode, BuildEvent, AttachmentRef, BuildPreset, CreateBuildInput, RunnerStatusInfo, SiteSurface } from '@larkwave/core';
import { useRuntime } from '../RuntimeProvider';
import { ModeSelector } from './ModeSelector';
import { BuildProgress } from './BuildProgress';
import { AppWorkspace } from './AppWorkspace';
import { BRAND, BRAND_GRADIENT, CARD_SHADOW, V } from '../theme';
import { useAgentBusy } from '../useAgentBusy';
import { useI18n } from '../i18n';

const { TextArea } = Input;
const { Text } = Typography;

const TRACKS = [
  { label: 'Website', value: 'web' },
  { label: 'App mobile', value: 'mobile' },
  { label: 'App desktop', value: 'desktop' },
  { label: 'Game', value: 'game' },
  { label: 'Tiện ích', value: 'extension' },
  { label: 'Tự động', value: 'auto' },
] as const;
type Track = (typeof TRACKS)[number]['value'];

const TRACK_HINT: Record<Track, string> = {
  web: 'Website chạy trên trình duyệt — build + preview ngay (desktop: Claude CLI).',
  mobile: 'Dự án Expo (React Native). Tải về chạy “npx expo start”, quét QR bằng Expo Go.',
  desktop: 'App desktop (Electron) — chạy trên Windows/macOS/Linux. Tải về chạy “npm start”, đóng gói được thành app cài đặt.',
  game: 'Game HTML5 (canvas/Phaser) chạy trên trình duyệt — build + preview ngay như website.',
  extension: 'Tiện ích Chrome (Manifest V3). Tải về → Load unpacked trong chrome://extensions.',
  auto: 'AI tự chọn loại app phù hợp nhất với mô tả của bạn.',
};

/** Build-button label per app type. */
const TRACK_CTA: Record<Track, string> = {
  web: 'Tạo website', mobile: 'Tạo app', desktop: 'Tạo app desktop', game: 'Tạo game', extension: 'Tạo tiện ích', auto: 'Tạo app',
};
/** Prompt placeholder tailored to the app type — so the box asks for the right thing. */
const TRACK_PLACEHOLDER: Record<Track, string> = {
  web: 'Mô tả website bạn muốn tạo… (vd: landing quán cà phê có menu + form đặt bàn)',
  mobile: 'Mô tả app mobile bạn muốn tạo… (vd: app ghi chi tiêu cá nhân có biểu đồ)',
  desktop: 'Mô tả app desktop bạn muốn tạo… (vd: trình quản lý ghi chú lưu trên máy)',
  game: 'Mô tả game bạn muốn tạo… (thể loại, lối chơi, điều khiển — vd: game bắn gạch có điểm số)',
  extension: 'Mô tả tiện ích trình duyệt bạn muốn tạo… (vd: nút lưu nhanh trang vào danh sách đọc sau)',
  auto: 'Mô tả app bạn muốn tạo…',
};

/** How much analysis/design work runs BEFORE code (`BuildPreset`, @larkwave/core). The runtime
 *  owns which stages each preset skips; the composer only has to state the trade-off honestly. */
const PRESETS: { label: string; value: BuildPreset }[] = [
  { label: 'Làm ngay', value: 'turbo' },
  { label: 'Cân bằng', value: 'balanced' },
  { label: 'Kỹ (xem thiết kế trước)', value: 'thorough' },
];
/** What each preset COSTS you, not just how fast it is. */
const PRESET_HINT: Record<BuildPreset, string> = {
  turbo:
    'Bỏ qua bước phân tích + thiết kế, viết code ngay. Nhanh nhất, nhưng AI tự suy đoán cấu trúc — app dễ thiếu ý nếu mô tả còn sơ sài. Hợp khi mô tả đã rõ, hoặc khi sao chép một trang có sẵn.',
  balanced:
    'Mặc định: AI phân tích yêu cầu và lên thiết kế trước khi viết code, rồi tự duyệt để bạn không phải chờ. Lâu hơn “Làm ngay” vài phút, đổi lại cấu trúc app chắc hơn.',
  thorough:
    'AI DỪNG lại cho bạn xem và sửa bản thiết kế (các trang + dữ liệu) rồi mới sinh code. Kiểm soát cao nhất, nhưng lâu nhất — build nằm chờ tới khi bạn bấm duyệt.',
};
/**
 * Trên DESKTOP không có cổng duyệt: một lượt CLI vừa thiết kế vừa viết code, nên preset chỉ đổi
 * cách ra lệnh cho lượt đó. Nói đúng sự thật thay vì hứa một màn duyệt không tồn tại.
 */
const PRESET_HINT_DESKTOP: Partial<Record<BuildPreset, string>> = {
  thorough:
    'AI lập kế hoạch kỹ (các trang + dữ liệu) và giải thích trước khi viết code. Chắc tay nhất, nhưng lâu nhất. Trên máy không có bước dừng chờ bạn duyệt như trên web.',
};

const STYLES = ['auto', 'landing', 'dashboard', 'store', 'minimal', 'form'];
const LANGS = ['Tiếng Việt', 'English', '中文', '日本語', '한국어', 'Français', 'Español'];
// Common website pages offered as quick-add chips (the user can still add custom ones).
const PAGE_PRESETS = [
  'Trang chủ',
  'Về chúng tôi',
  'Bài viết / Blog',
  'Chi tiết bài viết',
  'Dịch vụ',
  'Sản phẩm',
  'Bảng giá',
  'Liên hệ',
  'Câu hỏi (FAQ)',
  'Tuyển dụng',
];
// Translation keys for the preset labels above (the raw VN name stays the stored value/prompt text).
const PAGE_PRESET_KEYS: Record<string, string> = {
  'Trang chủ': 'ui.composer.pageHome',
  'Về chúng tôi': 'ui.composer.pageAbout',
  'Bài viết / Blog': 'ui.composer.pageBlog',
  'Chi tiết bài viết': 'ui.composer.pagePostDetail',
  'Dịch vụ': 'ui.composer.pageServices',
  'Sản phẩm': 'ui.composer.pageProducts',
  'Bảng giá': 'ui.composer.pagePricing',
  'Liên hệ': 'ui.composer.pageContact',
  'Câu hỏi (FAQ)': 'ui.composer.pageFaq',
  'Tuyển dụng': 'ui.composer.pageCareers',
};

const FEATURE_GROUPS: { title: string; items: { key: string; label: string }[] }[] = [
  { title: 'Nội dung', items: [
    { key: 'blog', label: 'Blog / Tin tức' }, { key: 'faq', label: 'Câu hỏi thường gặp' },
    { key: 'testimonials', label: 'Đánh giá khách hàng' }, { key: 'gallery', label: 'Thư viện ảnh' } ] },
  { title: 'Bán hàng', items: [
    { key: 'payments', label: 'Thanh toán' }, { key: 'reviews', label: 'Đánh giá & bình luận' },
    { key: 'booking', label: 'Đặt lịch / đặt chỗ' }, { key: 'search', label: 'Tìm kiếm' } ] },
  { title: 'Tương tác khách', items: [
    { key: 'contactForm', label: 'Form liên hệ' }, { key: 'newsletter', label: 'Đăng ký nhận tin' },
    { key: 'chat', label: 'Chat hỗ trợ' }, { key: 'socialShare', label: 'Chia sẻ mạng xã hội' } ] },
  { title: 'Tài khoản & vận hành', items: [
    { key: 'auth', label: 'Đăng nhập người dùng' }, { key: 'analytics', label: 'Thống kê truy cập' },
    { key: 'notifications', label: 'Thông báo' }, { key: 'cookieConsent', label: 'Thông báo cookie' } ] },
];

/**
 * "Bộ site" — mỗi mặt được chọn là MỘT site riêng, có địa chỉ riêng và một lượt build riêng,
 * nối với nhau qua site API dùng chung. Mặc định KHÔNG chọn gì = một site duy nhất chứa tất cả
 * (đúng như từ trước tới nay); tách site là lựa chọn có chủ ý.
 */
const SURFACE_ORDER: SiteSurface[] = ['site', 'cms', 'portal', 'api'];
const SURFACE_CARDS: { key: SiteSurface; icon: ReactNode; title: string; desc: string }[] = [
  { key: 'site', icon: <GlobalOutlined />, title: 'Website công khai', desc: 'Mặt tiền cho khách vãng lai — xem được mà không cần đăng nhập.' },
  { key: 'cms', icon: <ToolOutlined />, title: 'Backoffice (CMS)', desc: 'Khu quản trị nội bộ — nhân viên đăng nhập để thêm/sửa/xoá dữ liệu.' },
  { key: 'portal', icon: <AppstoreOutlined />, title: 'Portal (Khách hàng)', desc: 'Khách hàng đăng nhập xem đơn hàng / hồ sơ của chính họ.' },
  { key: 'api', icon: <DatabaseOutlined />, title: 'API dùng chung', desc: 'Cơ sở dữ liệu + API cho cả bộ. Bắt buộc khi tách từ 2 site trở lên.' },
];

/**
 * Ô chọn nhiều đáp án cho "bộ site". Tách thành component riêng vì nó phải nằm NGOÀI bảng tuỳ
 * chọn gập lại — xem chỗ gọi để biết vì sao.
 */
function SuitePicker({
  value,
  onToggle,
  t,
}: {
  value: SiteSurface[];
  onToggle: (k: SiteSurface) => void;
  t: (key: string, fallback: string) => string;
}) {
  return (
    /* "Bộ site" — ô chọn nhiều đáp án, mỗi ô là một site riêng.
       Chiếm cả hàng vì đây là quyết định KIẾN TRÚC (mấy site sẽ được dựng, mỗi site một
       địa chỉ), không phải một tuỳ chọn trang trí như màu hay mẫu giao diện. */
    <div style={{ marginTop: 14 }}>
      <FieldLabel>
        {t('ui.composer.suiteLabel', 'Hệ thống gồm những site nào? (chọn nhiều)')}
      </FieldLabel>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
          gap: 10,
        }}
      >
        {SURFACE_CARDS.map((c) => {
          const on = value.includes(c.key);
          // API bị khoá khi bộ đã có từ 3 site: bấm vào không đổi gì, nên phải NÓI ra
          // thay vì im lặng nuốt cú bấm.
          const locked = c.key === 'api' && on && value.length > 2;
          return (
            <div
              key={c.key}
              role="checkbox"
              aria-checked={on}
              tabIndex={0}
              onClick={() => onToggle(c.key)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onToggle(c.key);
                }
              }}
              style={{
                display: 'flex',
                gap: 10,
                padding: '11px 13px',
                borderRadius: 12,
                cursor: locked ? 'not-allowed' : 'pointer',
                userSelect: 'none',
                background: on ? 'rgba(108,92,231,0.09)' : V.surfaceAlt,
                border: `1.5px solid ${on ? BRAND : V.border}`,
                opacity: locked ? 0.75 : 1,
              }}
            >
              <span
                aria-hidden
                style={{
                  flex: 'none',
                  width: 18,
                  height: 18,
                  marginTop: 1,
                  borderRadius: 5,
                  border: `1.5px solid ${on ? BRAND : V.border}`,
                  background: on ? BRAND : 'transparent',
                  color: '#fff',
                  fontSize: 12,
                  lineHeight: '15px',
                  textAlign: 'center',
                }}
              >
                {on ? '✓' : ''}
              </span>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: on ? V.chipText : V.text,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span style={{ display: 'inline-flex', fontSize: 14, color: BRAND }}>{c.icon}</span>
                  {t(`ui.composer.surface.${c.key}`, c.title)}
                </div>
                <div style={{ fontSize: 11.5, color: V.textFaint, marginTop: 3, lineHeight: 1.45 }}>
                  {t(`ui.composer.surfaceDesc.${c.key}`, c.desc)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11.5, color: V.textFaint, marginTop: 8, lineHeight: 1.5 }}>
        {value.length >= 2
          ? t(
              'ui.composer.suiteOn',
              `Sẽ dựng ${value.length} SITE RIÊNG, mỗi site một địa chỉ và một lượt build riêng. Các site dùng chung dữ liệu qua site API — sửa ở backoffice thì trang công khai đổi theo.`,
            )
          : t(
              'ui.composer.suiteOff',
              'Không chọn gì = một website duy nhất chứa tất cả (kèm sẵn cơ sở dữ liệu và khu quản trị). Chỉ chọn khi bạn thật sự muốn tách thành nhiều site độc lập.',
            )}
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <Text style={{ fontSize: 12.5, fontWeight: 600, color: V.textSub, display: 'block', marginBottom: 8 }}>
      {children}
    </Text>
  );
}

/**
 * The shared prompt-first composer — same component on web + desktop.
 * Web passes `onResult` (navigate into the project) + `onQuota`; desktop omits
 * them and the build streams + previews inline.
 */
export function Composer({
  onBuilt,
  onResult,
  onQuota,
  onOpenWorkspace,
  onBrowseTemplates,
  promptValue,
  onPromptChange,
  initialTrack,
  hideTrackSelector,
  allowedTracks,
}: {
  onBuilt?: () => void;
  onResult?: (appId: string, buildId?: string) => void;
  onQuota?: () => void;
  /** Preselect the app type ("Loại app") — e.g. when opened from a per-type sidebar item. */
  initialTrack?: Track;
  /** Hide the internal "Loại app" selector — for hosts that drive the type from
   *  page-level tabs (the web builder) so the control isn't shown twice. */
  hideTrackSelector?: boolean;
  /**
   * Giới hạn danh sách loại app. Bỏ trống = đủ cả (app desktop). Web truyền vào tập chạy được
   * trong trình duyệt, vì thứ nó dựng ra là deploy thẳng lên hạ tầng chứ không phải thư mục mã
   * nguồn để chạy trên máy.
   */
  allowedTracks?: readonly string[];
  /** Desktop: open the new app's workspace immediately + run the FIRST build inside it (instead
   *  of building inline). The parent renders <AppWorkspace appId initialBuild={build} />. */
  onOpenWorkspace?: (appId: string, build: CreateBuildInput) => void;
  /** Open the starter-template picker (templates live INSIDE the create flow, not as a separate
   *  page section). When provided, the composer shows a "Bắt đầu từ mẫu" affordance. */
  onBrowseTemplates?: () => void;
  /** Optional controlled prompt — lets a parent (e.g. a template click) fill it. */
  promptValue?: string;
  onPromptChange?: (value: string) => void;
}) {
  const runtime = useRuntime();
  const { t } = useI18n();
  const isWeb = runtime.kind === 'web';
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  // Train skill directly from chat description (hội thoại)
  const [savingSkill, setSavingSkill] = useState(false);
  const saveAsSkill = async () => {
    const p = (promptValue || internalPrompt || '').trim();
    if (!p || !runtime.createSkill) return;
    setSavingSkill(true);
    try {
      const name = p.slice(0, 50).replace(/\s+/g, ' ').trim() || t('ui.composer.skillFromChat', 'Skill từ hội thoại');
      await runtime.createSkill!(name, p + '\n\n' + t('ui.composer.skillNote', '# Skill được tạo trực tiếp từ mô tả trong hội thoại. Có thể chỉnh trong Kỹ năng.'));
      message.success(t('ui.composer.skillCreated', 'Đã tạo kỹ năng từ mô tả hội thoại. Vào "Kỹ năng" để quản lý.'));
    } catch (e: any) {
      message.error((e as Error)?.message || t('ui.composer.skillFailed', 'Không tạo được skill.'));
    } finally {
      setSavingSkill(false);
    }
  };

  // Controlled when the parent passes promptValue/onPromptChange (template fill),
  // otherwise the composer manages its own prompt state.
  const [internalPrompt, setInternalPrompt] = useState('');
  const prompt = promptValue !== undefined ? promptValue : internalPrompt;
  const setPrompt = (value: string) => {
    onPromptChange?.(value);
    if (promptValue === undefined) setInternalPrompt(value);
  };
  // Bảng tuỳ chọn: mở/đóng do NGƯỜI DÙNG bấm, không tự bung.
  //
  // Trước đây `expanded = touched || có chữ`, nên vừa đặt con trỏ vào ô mô tả là cả bảng dài bung
  // ra, đẩy nút tạo xuống dưới màn hình ngay lúc người ta mới định gõ một câu. Nay là một nút mũi
  // tên, và bảng trượt mở mượt thay vì nhảy.
  const [open, setOpen] = useState(false);
  const [sourceUrl, setSourceUrl] = useState('');
  const [track, setTrack] = useState<Track>(initialTrack ?? 'web');
  // Follow a change of the preset type (e.g. switching sidebar item Website → Game).
  useEffect(() => { if (initialTrack) setTrack(initialTrack); }, [initialTrack]);
  const [mode, setMode] = useState<AppMode>('build');
  // Workflow preset. A clone URL flips the DEFAULT to 'turbo' (see the effect below); once the
  // user picks one themselves (`presetTouched`) we stop steering it.
  const [preset, setPreset] = useState<BuildPreset>('balanced');
  const [presetTouched, setPresetTouched] = useState(false);
  // Cloning a URL: the design stage INVENTS a new layout, which fights an exact copy — so the
  // default becomes “Làm ngay”. Only a default: `presetTouched` keeps the user's own choice.
  const cloning = track !== 'extension' && sourceUrl.trim().length > 0;
  useEffect(() => {
    if (presetTouched) return;
    setPreset(cloning ? 'turbo' : 'balanced');
  }, [cloning, presetTouched]);
  const [model, setModel] = useState<'opus' | 'sonnet'>('opus');
  // Desktop only: which local CLI runner (provider) + model to drive. Loaded from
  // runtime.runners.list() (Claude/Grok/Gemini/Codex); the choice persists per-machine.
  const [runners, setRunners] = useState<RunnerStatusInfo[]>([]);
  const [runnerId, setRunnerId] = useState<string>(
    () => (typeof window !== 'undefined' && localStorage.getItem('tw_runner')) || 'claude',
  );
  const [runnerModel, setRunnerModel] = useState<string>(
    () => (typeof window !== 'undefined' && localStorage.getItem('tw_runner_model')) || '',
  );
  // Direct-API (no-CLI) mode — a SHARED setting with the Lark agent (configured once,
  // honoured by both surfaces). When on + the picked runner has a stored key, codegen
  // runs against the provider API instead of a local CLI.
  const [apiMode, setApiMode] = useState(false);

  useEffect(() => {
    if (isWeb || !runtime.runners) return;
    let alive = true;
    runtime.runners
      .list()
      .then((list) => {
        if (alive) setRunners(list);
      })
      .catch(() => {});
    runtime.larkStatus?.().then((s) => {
      if (alive) setApiMode(!!s.apiMode);
    }).catch(() => {});
    return () => {
      alive = false;
    };
  }, [isWeb, runtime]);

  const toggleApiMode = (on: boolean) => {
    setApiMode(on);
    runtime.larkSetAgentPrefs?.({ apiMode: on }).catch(() => setApiMode(!on));
  };

  const activeRunner = runners.find((r) => r.id === runnerId);
  const setRunner = (id: string) => {
    setRunnerId(id);
    if (typeof window !== 'undefined') localStorage.setItem('tw_runner', id);
    // Reset the model to the new provider's first when switching providers.
    const r = runners.find((x) => x.id === id);
    const first = r?.models[0]?.id ?? '';
    setRunnerModel(first);
    if (typeof window !== 'undefined') localStorage.setItem('tw_runner_model', first);
  };
  const setRunnerModelChoice = (m: string) => {
    setRunnerModel(m);
    if (typeof window !== 'undefined') localStorage.setItem('tw_runner_model', m);
  };
  const [color, setColor] = useState(BRAND);
  const [style, setStyle] = useState('auto');
  const [theme, setTheme] = useState<'both' | 'light' | 'dark'>('both');
  const [languages, setLanguages] = useState<string[]>(['Tiếng Việt']);
  const [feat, setFeat] = useState<Record<string, boolean>>({});
  const [featOpen, setFeatOpen] = useState(false);
  // Phase-B "workspace": a project name (tab = `<name>-workspace`) + which parts to build.
  const [projectName, setProjectName] = useState('');
  const [components, setComponents] = useState<{ home: boolean; api: boolean; cms: boolean }>({
    home: true,
    api: true,
    cms: false,
  });
  // Phase A: split the selected components into SEPARATE services (own folders + ports).
  const [multiService, setMultiService] = useState(false);
  // "Bộ site" (web): mỗi mặt được chọn thành MỘT site riêng. Mặc định rỗng = một site duy nhất
  // chứa tất cả, đúng như từ trước tới nay — tách site là lựa chọn có chủ ý, không phải mặc định.
  const [surfaces, setSurfaces] = useState<SiteSurface[]>([]);
  const toggleSurface = (k: SiteSurface) =>
    setSurfaces((prev) => {
      const has = prev.includes(k);
      // API bị KHOÁ khi đã tách từ 3 site trở lên: nó là kho dữ liệu chung, bỏ nó ra thì mỗi
      // site đẻ một cơ sở dữ liệu riêng — nhìn thì đủ mặt, nhưng sửa nội dung ở khu quản trị
      // xong ra trang công khai vẫn thấy dữ liệu cũ. Muốn bỏ thì bỏ bớt mặt khác trước.
      if (k === 'api' && has && prev.length > 2) return prev;
      const next = has ? prev.filter((x) => x !== k) : [...prev, k];
      if (next.length >= 2 && !next.includes('api')) next.push('api');
      return SURFACE_ORDER.filter((x) => next.includes(x));
    });
  // Pages: 'auto' = let Claude design the pages; 'custom' = the user lists pages + descriptions.
  const [pagesMode, setPagesMode] = useState<'auto' | 'custom'>('auto');
  const [pages, setPages] = useState<{ name: string; desc: string }[]>([]);
  // Tech stack: '' means "let AI pick the best" (default React + Ant Design + Tailwind).
  const [feFramework, setFeFramework] = useState('Tự động');
  const [uiLib, setUiLib] = useState('Tự động');
  const [techOther, setTechOther] = useState('');
  const addPage = (name = '') =>
    setPages((p) => (name && p.some((x) => x.name === name) ? p : [...p, { name, desc: '' }]));
  const updatePage = (i: number, patch: Partial<{ name: string; desc: string }>) =>
    setPages((p) => p.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const removePage = (i: number) => setPages((p) => p.filter((_, j) => j !== i));
  const [attachments, setAttachments] = useState<AttachmentRef[]>([]);
  // Save location (desktop): '' = the global default (shown as defaultDir); a picked dir overrides.
  const [saveDir, setSaveDir] = useState('');
  const [defaultDir, setDefaultDir] = useState('');
  useEffect(() => {
    runtime
      .appLocation?.()
      .then((l) => setDefaultDir(l.defaultDir))
      .catch(() => {});
  }, [runtime]);
  const [events, setEvents] = useState<BuildEvent[]>([]);
  const [running, setRunning] = useState(false);
  // Shared AI lock: a new build can't start while any other tab/turn is mid-answer.
  const agentOwner = useAgentBusy();
  const blockedByOther = !!agentOwner && !running;
  const [resultAppId, setResultAppId] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // `expanded` chỉ còn quyết định cỡ chữ/khoảng đệm của phần đầu — không còn dùng để bung bảng.
  const expanded = open || prompt.trim().length > 0;

  const addFiles = async (files: File[]) => {
    if (!runtime.uploadAttachment) return;
    for (const f of files.slice(0, 6)) {
      try {
        const ref = await runtime.uploadAttachment(f);
        setAttachments((prev) => [...prev, ref]);
      } catch (e) {
        message.error((e as Error).message);
      }
    }
  };

  const submit = async () => {
    const p = prompt.trim();
    const url = track !== 'extension' ? sourceUrl.trim() : '';
    if (url && !/^https?:\/\/.+/i.test(url)) return message.warning(t('ui.composer.urlMustStart', 'URL phải bắt đầu bằng http(s)://'));
    if (p.length < 4 && !url) return message.warning(t('ui.composer.describeOrUrl', 'Hãy mô tả app hoặc dán URL để sao chép.'));
    // Project name is REQUIRED for web so the workspace/folder is named consistently.
    if (track === 'web' && !projectName.trim()) {
      setOpen(true); // mở bảng ra để người dùng thấy chỗ cần sửa
      return message.warning(t('ui.composer.projectNameRequired', 'Hãy đặt "Tên dự án" (bắt buộc) để tạo workspace/thư mục cho chuẩn.'));
    }
    // Fold the chosen pages (+ descriptions) into the prompt. 'auto' adds nothing — Claude
    // designs the pages itself, which is already the default behaviour.
    const namedPages = pages.filter((pg) => pg.name.trim());
    const pageSpec =
      track === 'web' && pagesMode === 'custom' && namedPages.length
        ? `\n\nCác trang cần có (${namedPages.length} trang):\n` +
          namedPages
            .map((pg, i) => `${i + 1}. ${pg.name.trim()}${pg.desc.trim() ? ` — ${pg.desc.trim()}` : ''}`)
            .join('\n')
        : '';
    // Tech stack the user picked (empty = let Claude use the great default).
    const techParts: string[] = [];
    if (track === 'web') {
      if (feFramework !== 'Tự động') techParts.push(`Framework: ${feFramework}`);
      if (uiLib !== 'Tự động') techParts.push(`Thư viện giao diện: ${uiLib}`);
      if (techOther.trim()) techParts.push(`Công nghệ khác cần dùng: ${techOther.trim()}`);
    }
    const techSpec = techParts.length
      ? `\n\nCÔNG NGHỆ người dùng yêu cầu (BẮT BUỘC tôn trọng):\n- ${techParts.join('\n- ')}`
      : '';
    // Phase-B "thành phần" (real toggles) + project name — folded into the prompt so codegen
    // scaffolds exactly the chosen parts; the tab title uses `<name>-workspace`.
    // Khi người dùng tách "bộ site", khối THÀNH PHẦN này phải IM.
    // Nó nói "dựng luôn Cơ sở dữ liệu + API (backend)" cho MỌI site, trong khi chỉ thị bộ site
    // (apps/api/src/builds/suite.ts) nói ngược lại: chỉ site API mới có CSDL. Hai khối đánh nhau
    // trong CÙNG một prompt, và đo thật cho thấy khối này thắng — cms và portal đều tự đẻ
    // schema.sql + functions/, mỗi site một D1 riêng, đúng thứ việc tách site sinh ra để tránh.
    const suiteMode = track === 'web' && isWeb && surfaces.length >= 2;
    const compParts: string[] = [];
    if (track === 'web' && !suiteMode) {
      if (components.home) compParts.push('Giao diện người dùng (frontend)');
      if (components.api) compParts.push('Cơ sở dữ liệu + API (backend)');
      if (components.cms) compParts.push('Trang quản trị (admin/CMS) ở route /admin, bảo vệ bằng đăng nhập');
    }
    const compSpec = compParts.length
      ? `\n\nTHÀNH PHẦN cần dựng (chỉ dựng đúng các phần này):\n- ${compParts.join('\n- ')}${
          !components.api ? '\n(Không chọn CSDL/API → làm app tĩnh phía client, không cần backend.)' : ''
        }`
      : '';
    const pn = projectName.trim();
    const projectSpec = pn ? `\n\nTên dự án: ${pn} (workspace "${pn}-workspace").` : '';

    // `preset` is a real request field (the runtime decides which stages it skips), not prompt
    // prose like the pages/tech/components blocks above.
    const buildInput: CreateBuildInput = {
      prompt: (p || `Sao chép / dựng lại website: ${url}`) + pageSpec + techSpec + compSpec + projectSpec,
      mode,
      track,
      preset,
      ...(pn ? { projectName: pn } : {}),
      ...(track === 'web' && !suiteMode ? { components } : {}),
      ...(track === 'web' && multiService && Object.values(components).filter(Boolean).length >= 2 ? { multiService: true } : {}),
      ...(suiteMode ? { surfaces } : {}),
      // Web: opus/sonnet cost toggle. Desktop: the chosen CLI runner + its model id.
      ...(isWeb ? { model } : { runner: runnerId, ...(runnerModel ? { model: runnerModel } : {}) }),
      primaryColor: color.toLowerCase(),
      style,
      theme,
      languages,
      sourceUrl: url || undefined,
      features: feat,
      attachmentIds: attachments.map((a) => a.id),
      target: track === 'mobile' ? 'mobile' : 'desktop',
      ...(saveDir ? { saveDir } : {}),
    };

    // Desktop: jump STRAIGHT into the new app's workspace tab and run the build there — so the
    // user lands in the app (chat + preview) immediately, not building on the home screen first.
    if (onOpenWorkspace) {
      const appId = `app-${Date.now().toString(36)}`;
      onBuilt?.();
      onOpenWorkspace(appId, { ...buildInput, appId });
      return;
    }

    setEvents([]);
    setResultAppId('');
    setRunning(true);
    try {
      const stream = runtime.createBuild(buildInput);
      for await (const ev of stream) {
        setEvents((prev) => [...prev, ev]);
        if (ev.type === 'error') {
          if (ev.message.startsWith('402:') && onQuota) onQuota();
          else message.error(ev.message.replace(/^402:/, ''));
        }
        if (ev.type === 'result') {
          onBuilt?.();
          if (onResult) onResult(ev.appId, ev.buildId);
          else setResultAppId(ev.appId);
        }
      }
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <Card
        styles={{ body: { padding: expanded ? (isMobile ? '16px 14px' : '24px 26px') : '12px 14px' } }}
        style={{
          borderRadius: 20,
          width: '100%',
          boxShadow: expanded
            ? '0 20px 56px rgba(108,92,231,0.10), 0 2px 10px rgba(17,24,39,0.05)'
            : CARD_SHADOW,
          borderColor: expanded ? 'rgba(108,92,231,0.30)' : undefined,
          transition: 'border-color .18s ease, box-shadow .18s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <span
            style={{
              display: 'inline-flex', width: 40, height: 40, minWidth: 40, borderRadius: 12,
              alignItems: 'center', justifyContent: 'center', color: '#fff',
              background: BRAND_GRADIENT, marginTop: expanded ? 3 : 1,
            }}
          >
            <ThunderboltOutlined style={{ fontSize: 20 }} />
          </span>
          <TextArea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={t(`ui.composer.promptPlaceholder.${track}`, TRACK_PLACEHOLDER[track])}
            variant="borderless"
            autoSize={{ minRows: expanded ? 2 : 1, maxRows: 8 }}
            style={{ fontSize: 16, paddingTop: 9, resize: 'none', flex: 1, minWidth: 220 }}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData?.files || []);
              if (files.length && runtime.uploadAttachment) {
                setOpen(true);
                void addFiles(files);
              }
            }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void submit();
            }}
          />
          {onBrowseTemplates && (
            <Tooltip title={t('ui.composer.templateTip', 'Bắt đầu từ một mẫu có sẵn — điền sẵn mô tả để bạn chỉnh nhanh.')}>
              <Button size="small" icon={<AppstoreOutlined />} onClick={onBrowseTemplates}>
                {t('ui.composer.template', 'Mẫu')}
              </Button>
            </Tooltip>
          )}
          <Tooltip title={t('ui.composer.saveSkillTip', 'Lưu mô tả này thành Kỹ năng (Skill) để agent dùng lại sau. Train trực tiếp từ hội thoại.')}>
            <Button size="small" loading={savingSkill} disabled={!((promptValue || internalPrompt || '').trim())} onClick={saveAsSkill}>
              {t('ui.composer.createSkill', 'Tạo skill')}
            </Button>
          </Tooltip>
          <Tooltip title={open ? t('ui.composer.hideOptions', 'Ẩn tuỳ chọn') : t('ui.composer.showOptions', 'Tuỳ chọn nâng cao')}>
            <Button
              size="small"
              type={open ? 'default' : 'text'}
              aria-expanded={open}
              icon={<DownOutlined style={{ transition: 'transform .22s ease', transform: open ? 'rotate(180deg)' : 'none' }} />}
              onClick={() => setOpen((o) => !o)}
            >
              {t('ui.composer.options', 'Tuỳ chọn')}
            </Button>
          </Tooltip>
        </div>

        {/* Tên dự án + nút tạo nằm NGOÀI bảng tuỳ chọn: đây là hai thứ bắt buộc phải thấy để bấm
            được nút, mà trước đó chúng nằm trong bảng — người dùng phải bung cả bảng dài ra mới
            tạo được app. */}
        <div
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            flexWrap: 'wrap',
            marginTop: 12,
            paddingTop: 12,
            borderTop: `1px solid ${V.borderSub}`,
          }}
        >
          {track === 'web' && (
            <Input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder={t('ui.composer.projectNamePlaceholder', 'vd: toolswave  →  tạo workspace “toolswave-workspace”')}
              status={!projectName.trim() ? 'error' : undefined}
              maxLength={40}
              style={{ flex: '1 1 240px', minWidth: 0 }}
              aria-label={t('ui.composer.projectName', 'Tên dự án')}
            />
          )}
          {runtime.uploadAttachment && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,.pdf,.txt,.md,.json,.csv,.log"
                multiple
                aria-label={t('ui.composer.attach', 'Đính kèm ảnh / file')}
                style={{ display: 'none' }}
                onChange={(e) => { void addFiles(Array.from(e.target.files || [])); e.target.value = ''; }}
              />
              <Tooltip title={t('ui.composer.attach', 'Đính kèm ảnh / file')}>
                <Button icon={<PaperClipOutlined />} onClick={() => fileRef.current?.click()} aria-label={t('ui.composer.attach', 'Đính kèm ảnh / file')} />
              </Tooltip>
            </>
          )}
          <Tooltip title={blockedByOther ? `${t('ui.composer.waitingAiAt', 'Đang chờ AI trả lời ở')} "${agentOwner?.label || t('ui.composer.otherTab', 'tab khác')}" ${t('ui.composer.waitThenCreate', '— chờ xong rồi tạo tiếp')}` : ''}>
            <Button type="primary" size="large" icon={<ThunderboltOutlined />} loading={running} disabled={blockedByOther} onClick={submit}>
              {running ? t('ui.composer.building', 'Đang dựng…') : blockedByOther ? t('ui.composer.waitingOtherTab', 'Đang chờ tab khác…') : t(`ui.action.createApp.${track}`, TRACK_CTA[track])}
            </Button>
          </Tooltip>
        </div>

        {/* attachment chips */}
        {attachments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {attachments.map((a) => (
              <Tag key={a.id} closable onClose={() => setAttachments((p) => p.filter((x) => x.id !== a.id))}>
                <PaperClipOutlined /> {a.name.length > 22 ? a.name.slice(0, 22) + '…' : a.name}
              </Tag>
            ))}
          </div>
        )}

        {/* "Bộ site" đứng NGOÀI bảng tuỳ chọn gập lại.
            Bảng đó mặc định đóng, mà đây là quyết định KIẾN TRÚC (hệ thống này sẽ gồm mấy site,
            mỗi site một địa chỉ) chứ không phải một tuỳ chọn trang trí như màu hay mẫu giao diện.
            Chôn nó sau một nút bung thì gần như không ai thấy — tức là tính năng có mà không tồn
            tại. (Composer này chỉ dùng để TẠO MỚI — sửa app có sẵn đi qua PromptComposer.) */}
        {track === 'web' && isWeb && <SuitePicker value={surfaces} onToggle={toggleSurface} t={t} />}

        {/* Trượt mở/đóng thay vì hiện/ẩn đột ngột. Dùng kỹ thuật grid-template-rows 0fr→1fr nên
            không phải đoán chiều cao trước — bảng này dài ngắn tuỳ loại app. */}
        <div className={`tw-collapsible${open ? ' tw-open' : ''}`} aria-hidden={!open}>
          <div>
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${V.borderSub}`, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: isMobile ? 14 : '16px 24px', alignItems: 'start' }}>
            {runtime.chooseAppLocation && (
              <div style={{ gridColumn: '1 / -1' }}>
                <FieldLabel>{t('ui.composer.saveLocation', 'Vị trí lưu dự án')}</FieldLabel>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Input
                    readOnly
                    value={saveDir || defaultDir || t('ui.composer.defaultFolder', 'Thư mục mặc định của Larkwave')}
                    prefix={<FolderOpenOutlined style={{ color: BRAND }} />}
                    style={{ flex: 1, minWidth: 260, fontSize: 12.5 }}
                  />
                  <Button
                    onClick={async () => {
                      const d = await runtime.chooseAppLocation?.();
                      if (d) setSaveDir(d);
                    }}
                  >
                    {t('ui.composer.change', 'Đổi…')}
                  </Button>
                  {saveDir && (
                    <Button type="text" onClick={() => setSaveDir('')}>
                      {t('ui.composer.default', 'Mặc định')}
                    </Button>
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: V.textFaint, marginTop: 6 }}>
                  {t('ui.composer.saveLocationHint', 'Dự án mới sẽ lưu trong thư mục này (mỗi dự án một thư mục con). Để trống = thư mục mặc định — đổi mặc định cho MỌI dự án ở Cài đặt.')}
                </div>
              </div>
            )}
            {!hideTrackSelector && (
              <div>
                <FieldLabel>{t('ui.composer.appType', 'Loại app')}</FieldLabel>
                <div style={{ overflowX: 'auto' }}>
                  <Segmented size="small" value={track} onChange={(v) => setTrack(v as Track)} options={TRACKS.filter((tk) => !allowedTracks || allowedTracks.includes(tk.value)).map((tk) => ({ value: tk.value, label: t(`ui.track.${tk.value}`, tk.label) }))} />
                </div>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>{t(`ui.trackHint.${track}`, TRACK_HINT[track])}</Text>
              </div>
            )}

            {/* Web: model (cost) · Desktop: AI runner + model + Claude permission mode */}
            {isWeb ? (
              <div>
                <FieldLabel>{t('ui.composer.model', 'Model')}</FieldLabel>
                <Segmented size="small" value={model} onChange={(v) => setModel(v as 'opus' | 'sonnet')}
                  options={[{ label: t('ui.composer.opusStrong', 'Opus (mạnh)'), value: 'opus' }, { label: t('ui.composer.sonnetCheap', 'Sonnet (tiết kiệm)'), value: 'sonnet' }]} />
              </div>
            ) : (
              <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {runners.length > 0 && (
                  <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 200 }}>
                      <FieldLabel>{t('ui.composer.aiCli', 'AI / CLI')}</FieldLabel>
                      <Select
                        size="small"
                        style={{ minWidth: 190 }}
                        value={runnerId}
                        onChange={setRunner}
                        options={runners.map((r) => ({
                          value: r.id,
                          label: apiMode
                            ? r.apiKey
                              ? `${r.label} · API ✓`
                              : `${r.label} ${t('ui.composer.runnerNoApiKey', '(chưa có API key)')}`
                            : r.ready
                              ? `${r.label} ✓`
                              : r.installed
                                ? `${r.label} ${t('ui.composer.runnerMissingKey', '(thiếu key/đăng nhập)')}`
                                : `${r.label} ${t('ui.composer.runnerNotInstalled', '(chưa cài)')}`,
                        }))}
                      />
                    </div>
                    {activeRunner && activeRunner.models.length > 0 && (
                      <div style={{ minWidth: 200 }}>
                        <FieldLabel>{t('ui.composer.model', 'Model')}</FieldLabel>
                        <Select
                          size="small"
                          style={{ minWidth: 190 }}
                          value={runnerModel || activeRunner.models[0]?.id}
                          onChange={setRunnerModelChoice}
                          options={activeRunner.models.map((m) => ({ value: m.id, label: m.label }))}
                        />
                      </div>
                    )}
                  </div>
                )}
                {/* Direct-API toggle — shared with the Lark agent; runs codegen via the
                    provider API (no local CLI needed). */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <Switch size="small" checked={apiMode} onChange={toggleApiMode} />
                  <Text style={{ fontSize: 12.5, fontWeight: 600 }}>{t('ui.composer.directApi', 'API trực tiếp (không cần CLI)')}</Text>
                  <Tooltip title={t('ui.composer.directApiTip', 'Chạy AI bằng API key của nhà cung cấp (Claude / GPT / Grok / Gemini) thay vì CLI cài trên máy. Tốn phí theo token. Dán key ở Cài đặt → Trình AI / CLI.')}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {apiMode
                        ? activeRunner?.apiKey
                          ? t('ui.composer.usingSavedApiKey', '· đang dùng API key đã lưu')
                          : t('ui.composer.noApiKeyForAgent', '· chưa có API key cho agent này — dán ở Cài đặt → Trình AI / CLI')
                        : t('ui.composer.usingLocalCli', '· đang dùng CLI cài trên máy')}
                    </Text>
                  </Tooltip>
                </div>
                {/* CLI-install warnings only matter when NOT running via API. */}
                {!apiMode && activeRunner && !activeRunner.installed && (
                  <Text type="warning" style={{ fontSize: 12, display: 'block' }}>
                    {t('ui.composer.cliNotInstalledPre', 'Chưa cài')} {activeRunner.label} {t('ui.composer.cliNotInstalledMid', 'trên máy. Cài bằng:')} <Text code>{activeRunner.installHint}</Text> {t('ui.composer.cliNotInstalledPost', '— rồi bấm "Làm mới" trong Cài đặt → Trình AI / CLI. (Hoặc bật "API trực tiếp" ở trên.)')}
                  </Text>
                )}
                {!apiMode && activeRunner?.installed && !activeRunner.ready && (
                  <Text type="warning" style={{ fontSize: 12, display: 'block' }}>
                    {activeRunner.label} {t('ui.composer.cliInstalled', 'đã cài')}{activeRunner.binPath ? <> {t('ui.composer.cliInstalledAt', 'tại')} <Text code>{activeRunner.binPath}</Text></> : ''} {t('ui.composer.cliInstalledNeedsKey', 'nhưng chưa có key/đăng nhập — mở Cài đặt → Trình AI / CLI.')}
                  </Text>
                )}
                {apiMode && activeRunner && !activeRunner.apiKey && (
                  <Text type="warning" style={{ fontSize: 12, display: 'block' }}>
                    {activeRunner.label} {t('ui.composer.apiNoKeyWarn', 'chưa có API key — dán key ở Cài đặt → Trình AI / CLI, hoặc tắt "API trực tiếp" để dùng CLI.')}
                  </Text>
                )}
                <div>
                  <FieldLabel>{t('ui.composer.aiWorkMode', 'Chế độ làm việc của AI')}</FieldLabel>
                  <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
                    <ModeSelector value={mode} onChange={setMode} />
                  </div>
                </div>
              </div>
            )}

            {/* Colour + style — two grid cells (one 2-column row). Mẫu's Segmented is wide,
                so wrap it in an overflow-x guard to scroll rather than break a narrow cell. */}
            <div>
              <FieldLabel>{t('ui.composer.brandColor', 'Màu thương hiệu')}</FieldLabel>
              <ColorPicker value={color} onChange={(c) => setColor(c.toHexString())} showText />
            </div>
            <div>
              <FieldLabel>{t('ui.composer.uiStyle', 'Mẫu giao diện')}</FieldLabel>
              <div style={{ overflowX: 'auto' }}>
                <Segmented size="small" value={style} onChange={(v) => setStyle(v as string)} options={STYLES} />
              </div>
            </div>

            {track === 'web' && !isWeb && (
              /* Hàng ngắn: để nó nằm MỘT cột, không chiếm hết bề ngang — ô soạn nay rộng cả màn
                 hình nên mấy con chip trải ngang chỉ để lại một khoảng trống dài bên phải. */
              <div>
                <div>
                  <FieldLabel>{t('ui.composer.components', 'Thành phần')}</FieldLabel>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    {([
                      { key: 'home', icon: <LayoutOutlined />, label: t('ui.composer.compFrontend', 'Giao diện người dùng') },
                      { key: 'api', icon: <DatabaseOutlined />, label: t('ui.composer.compBackend', 'Cơ sở dữ liệu & API') },
                      { key: 'cms', icon: <ToolOutlined />, label: t('ui.composer.compAdmin', 'Trang quản trị') },
                    ] as const).map((s) => {
                      const on = components[s.key];
                      return (
                        <span
                          key={s.key}
                          onClick={() => setComponents((c) => ({ ...c, [s.key]: !c[s.key] }))}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 7,
                            padding: '7px 13px',
                            borderRadius: 999,
                            cursor: 'pointer',
                            userSelect: 'none',
                            background: on ? 'rgba(108,92,231,0.12)' : V.surfaceAlt,
                            border: `1.5px solid ${on ? BRAND : V.border}`,
                            color: on ? V.chipText : V.textSub,
                            fontSize: 12.5,
                            fontWeight: 500,
                          }}
                        >
                          <span style={{ display: 'inline-flex', fontSize: 14 }}>{s.icon}</span> {s.label}
                        </span>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <Switch
                      size="small"
                      checked={multiService}
                      onChange={setMultiService}
                      disabled={Object.values(components).filter(Boolean).length < 2}
                    />
                    <span style={{ fontSize: 12.5, color: V.textSub }}>{t('ui.composer.splitServices', 'Tách thành dịch vụ riêng (mỗi phần 1 thư mục + 1 cổng, chạy song song)')}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: V.textFaint, marginTop: 6 }}>
                    {multiService
                      ? t('ui.composer.multiServiceOn', 'Workspace nhiều dịch vụ: home / api / cms mỗi cái chạy trên cổng riêng, tự tiêm URL API cho frontend.')
                      : t('ui.composer.multiServiceOff', 'Tắt = tất cả trong MỘT app (1 cổng). Bật để tách dịch vụ (cần chọn ≥ 2 thành phần).')}
                  </div>
                </div>
              </div>
            )}

            {track === 'web' && (
              <div style={{ gridColumn: '1 / -1' }}>
                <FieldLabel>{t('ui.composer.pagesLabel', 'Số trang & nội dung')}</FieldLabel>
                <Segmented
                  size="small"
                  value={pagesMode}
                  onChange={(v) => setPagesMode(v as 'auto' | 'custom')}
                  options={[
                    { label: t('ui.composer.pagesAuto', 'Tự động (AI thiết kế)'), value: 'auto' },
                    { label: t('ui.composer.pagesCustom', 'Tự chọn trang'), value: 'custom' },
                  ]}
                />
                {pagesMode === 'auto' ? (
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
                    {t('ui.composer.pagesAutoHint', 'AI tự quyết định số trang + các trang phù hợp với mô tả của bạn.')}
                  </Text>
                ) : (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {PAGE_PRESETS.map((name) => {
                        const added = pages.some((p) => p.name === name);
                        return (
                          <button
                            key={name}
                            type="button"
                            disabled={added}
                            onClick={() => addPage(name)}
                            style={{ padding: '6px 13px', borderRadius: 999, cursor: added ? 'default' : 'pointer', border: `1px solid ${V.border}`, background: added ? 'rgba(108,92,231,0.10)' : V.surface, color: added ? V.chipText : V.text, fontSize: 12.5, fontWeight: 500, opacity: added ? 0.75 : 1 }}
                          >
                            {added ? '✓ ' : '+ '}
                            {t(PAGE_PRESET_KEYS[name] || 'ui.composer.pagePreset', name)}
                          </button>
                        );
                      })}
                    </div>
                    {pages.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {pages.map((pg, i) => (
                          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <Input
                              size="small"
                              placeholder={t('ui.composer.pageName', 'Tên trang')}
                              value={pg.name}
                              onChange={(e) => updatePage(i, { name: e.target.value })}
                              style={{ maxWidth: isMobile ? 128 : 190, minWidth: 0 }}
                            />
                            <Input
                              size="small"
                              placeholder={t('ui.composer.pageDesc', 'Mô tả ngắn (tuỳ chọn) — vd: liệt kê dịch vụ, có form đăng ký…')}
                              value={pg.desc}
                              onChange={(e) => updatePage(i, { desc: e.target.value })}
                              style={{ flex: 1 }}
                            />
                            <Button size="small" type="text" icon={<CloseOutlined />} onClick={() => removePage(i)} />
                          </div>
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => addPage('')}
                      style={{ alignSelf: 'flex-start', border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: BRAND, fontWeight: 600, fontSize: 12.5 }}
                    >
                      {t('ui.composer.addAnotherPage', '+ Thêm trang khác')}
                    </button>
                  </div>
                )}
              </div>
            )}

            {track === 'web' && (
              <div style={{ gridColumn: '1 / -1' }}>
                <FieldLabel>{t('ui.composer.tech', 'Công nghệ')}</FieldLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, maxWidth: '100%' }}>
                    <Text style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{t('ui.composer.framework', 'Framework')}</Text>
                    <div style={{ overflowX: 'auto', minWidth: 0 }}>
                      <Segmented
                        size="small"
                        value={feFramework}
                        onChange={(v) => setFeFramework(v as string)}
                        options={[{ label: t('ui.composer.autoOption', 'Tự động'), value: 'Tự động' }, 'React', 'Next.js', 'Vue']}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, maxWidth: '100%' }}>
                    <Text style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{t('ui.composer.ui', 'Giao diện')}</Text>
                    <div style={{ overflowX: 'auto', minWidth: 0 }}>
                      <Segmented
                        size="small"
                        value={uiLib}
                        onChange={(v) => setUiLib(v as string)}
                        options={[{ label: t('ui.composer.autoOption', 'Tự động'), value: 'Tự động' }, 'Ant Design', 'Tailwind', 'shadcn/ui', 'MUI']}
                      />
                    </div>
                  </div>
                  <Input
                    size="small"
                    placeholder={t('ui.composer.techOther', 'Công nghệ khác (vd PHP, Express, Prisma, Postgres…)')}
                    value={techOther}
                    onChange={(e) => setTechOther(e.target.value)}
                    style={{ maxWidth: 300 }}
                  />
                </div>
                {/* Make the default stack visible — the "chi tiết công nghệ sử dụng" the user wants. */}
                {feFramework === 'Tự động' && uiLib === 'Tự động' && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                    {['React', 'TypeScript', 'Ant Design', 'Tailwind', 'framer-motion', 'Node + SQLite'].map((t) => (
                      <Tag key={t} style={{ margin: 0, borderRadius: 999, fontSize: 11.5 }}>{t}</Tag>
                    ))}
                  </div>
                )}
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
                  {t('ui.composer.techHint', 'Để "Tự động" = ngăn xếp đẹp nhất, full-stack: React + TypeScript + Ant Design + Tailwind (frontend) · Node + SQLite (backend/CSDL). Preview cục bộ chạy tốt nhất với React / Vue / Next.js; chọn PHP/Python thì cần "Chạy trên Server" để xem.')}
                </Text>
              </div>
            )}

            {track !== 'extension' && (
              <div style={{ gridColumn: '1 / -1' }}>
                <FieldLabel>{t('ui.composer.cloneWebsite', 'Sao chép từ website (tuỳ chọn)')}</FieldLabel>
                <Input size="large" allowClear prefix={<GlobalOutlined style={{ color: BRAND }} />}
                  placeholder={t('ui.composer.cloneWebsitePlaceholder', 'Dán URL trang muốn sao chép, vd: https://luyenphongvan.online')}
                  value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} onPressEnter={() => void submit()}
                  status={sourceUrl.trim() && !/^https?:\/\/.+/i.test(sourceUrl.trim()) ? 'error' : undefined} />
                <div style={{ fontSize: 11.5, color: V.textFaint, marginTop: 6 }}>
                  {t('ui.composer.cloneWebsiteHint', 'Hệ thống tự mở trang và chụp lại màn hình để AI nhìn thấy bố cục, màu và font thật — bạn không cần đính kèm ảnh. Nếu trang chặn hoặc chụp lỗi thì vẫn dựng theo phần chữ đọc được.')}
                </div>
              </div>
            )}

            <div>
              <FieldLabel>{t('ui.composer.preset', 'Quy trình tạo app')}</FieldLabel>
              <div style={{ overflowX: 'auto' }}>
                <Segmented
                  size="small"
                  value={preset}
                  onChange={(v) => { setPreset(v as BuildPreset); setPresetTouched(true); }}
                  options={PRESETS.map((ps) => ({ value: ps.value, label: t(`ui.preset.${ps.value}`, ps.label) }))}
                />
              </div>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
                {isWeb
                  ? t(`ui.presetHint.${preset}`, PRESET_HINT[preset])
                  : t(`ui.presetHintDesktop.${preset}`, PRESET_HINT_DESKTOP[preset] ?? PRESET_HINT[preset])}
              </Text>
              {cloning && (
                <Text style={{ fontSize: 12, display: 'block', marginTop: 6, color: BRAND }}>
                  {preset === 'turbo'
                    ? t('ui.composer.presetCloneAuto', 'Bạn đang sao chép từ URL nên hệ thống chọn sẵn “Làm ngay”: bước thiết kế sẽ tự nghĩ ra giao diện mới, ngược với việc chép cho giống trang gốc. Muốn đổi thì cứ chọn lại.')
                    : t('ui.composer.presetCloneWarn', 'Đang sao chép từ URL: bước thiết kế sẽ tự nghĩ ra giao diện mới nên bản sao dễ lệch khỏi trang gốc. Chọn “Làm ngay” để bám sát trang gốc hơn.')}
                </Text>
              )}
            </div>

            {track === 'web' && (
              <div style={{ gridColumn: '1 / -1' }}>
                <button type="button" onClick={() => setFeatOpen((v) => !v)}
                  style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: BRAND, fontWeight: 600, fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <SettingOutlined /> {t('ui.composer.featuresToggle', 'Tính năng & tuỳ chỉnh')} {featOpen ? <DownOutlined /> : <RightOutlined />}
                </button>
                {featOpen && (
                  <div style={{ marginTop: 12, padding: 14, border: `1px solid ${V.border}`, borderRadius: 12, background: V.surfaceAlt, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Text style={{ fontSize: 12.5 }}>{t('ui.composer.lightDark', 'Giao diện sáng/tối')}</Text>
                        <Segmented size="small" value={theme} onChange={(v) => setTheme(v as 'both' | 'light' | 'dark')}
                          options={[{ label: t('ui.composer.themeBoth', 'Cả hai'), value: 'both' }, { label: t('ui.composer.themeLight', 'Sáng'), value: 'light' }, { label: t('ui.composer.themeDark', 'Tối'), value: 'dark' }]} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 220 }}>
                        <Text style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{t('ui.composer.language', 'Ngôn ngữ')}</Text>
                        <Select mode="multiple" size="small" value={languages} style={{ flex: 1, minWidth: 180 }}
                          onChange={(v) => setLanguages(v.length ? v : ['Tiếng Việt'])}
                          options={LANGS.map((l) => ({ label: l, value: l }))} />
                      </div>
                    </div>
                    {FEATURE_GROUPS.map((g, gi) => (
                      <div key={g.title}>
                        <Text type="secondary" style={{ fontSize: 11.5, fontWeight: 600, display: 'block', marginBottom: 6 }}>{t(`ui.featGroup.${gi}`, g.title)}</Text>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {g.items.map((f) => {
                            const active = !!feat[f.key];
                            return (
                              <button key={f.key} type="button" onClick={() => setFeat((s) => ({ ...s, [f.key]: !s[f.key] }))}
                                style={{ padding: '6px 13px', borderRadius: 999, cursor: 'pointer', border: active ? `1.5px solid ${BRAND}` : `1px solid ${V.border}`, background: active ? 'rgba(108,92,231,0.10)' : V.surface, color: active ? V.chipText : V.text, fontSize: 12.5, fontWeight: 500 }}>
                                {active ? '✓ ' : '+ '}{t(`ui.feat.${f.key}`, f.label)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
              {/* Nút tạo và ô tên dự án nay ở NGOÀI bảng — dưới này chỉ còn lối đóng bảng lại. */}
              <Button type="text" size="small" onClick={() => setOpen(false)}>
                {t('ui.composer.hideOptions', 'Ẩn tuỳ chọn')}
              </Button>
            </div>
          </div>
          </div>
        </div>

        {/* Live build log — until the app is ready, then the workspace takes over. */}
        {events.length > 0 && !onResult && !resultAppId && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${V.borderSub}` }}>
            <BuildProgress events={events} />
          </div>
        )}
      </Card>
      {/* After a build: the per-app conversation (iterate) + live preview. */}
      {resultAppId && (
        <AppWorkspace
          appId={resultAppId}
          onBack={() => {
            setResultAppId('');
            setEvents([]);
          }}
          onDeleted={() => {
            setResultAppId('');
            setEvents([]);
          }}
        />
      )}
    </>
  );
}
