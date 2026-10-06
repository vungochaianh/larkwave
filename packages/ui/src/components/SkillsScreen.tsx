'use client';
import { useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties, type Dispatch, type SetStateAction } from 'react';
import { Alert, App as AntApp, Button, Card, Input, Modal, Segmented, Select, Switch, Tag, Tooltip, Typography } from 'antd';
import { SkillContractEditor, isEmptyContract } from './SkillContractEditor';
import { NodeIndexOutlined } from '@ant-design/icons';
import { setLarkPrompt } from './lark/larkHandoff';
import type { SkillContractFields } from '@larkwave/core';
import { ExperimentOutlined, BulbOutlined, DeleteOutlined, FolderOpenOutlined, PlusOutlined, QuestionCircleOutlined, CheckCircleFilled, TagsOutlined, ArrowRightOutlined, ReloadOutlined, CloudDownloadOutlined, FileOutlined, ThunderboltOutlined } from '@ant-design/icons';
import type { SkillInfo, SkillAttachment } from '@larkwave/core';
import { SKILL_COMMAND_MAX, isReservedSkillCommand, slugifySkillCommand, uniqueSkillCommand } from '@larkwave/core';
import { useRuntime } from '../RuntimeProvider';
import { useI18n } from '../i18n';
import { BRAND, CARD_SHADOW, OK, WARN, V } from '../theme';
import { SkillSetsCard } from './SkillSetsCard';
import { IconTile, EmptyState } from '../kit';
import type { View } from './HomeScreen';

const { Text, Paragraph, Title } = Typography;

/** The CLI runners a skill can apply to. Mirrors @larkwave/shared RUNNER_CATALOG ids/labels —
 *  kept local because the UI package must not import @larkwave/shared (React-isolation). */
const RUNNERS: { id: string; label: string }[] = [
  { id: 'claude', label: 'Claude' },
  { id: 'grok', label: 'Grok' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'codex', label: 'Codex' },
];
const ALL_IDS = RUNNERS.map((r) => r.id);
const labelOf = (id: string) => RUNNERS.find((r) => r.id === id)?.label ?? id;
/** Effective scope: legacy (undefined) or empty falls back to all — used uniformly by the
 *  filter, the chips, and the Select so they never disagree. */
const effScope = (s: SkillInfo) => (s.scope?.length ? s.scope : ALL_IDS);

/** Shared chip styling — theme-swapping violet tint (V.chipBg/V.chipText), not antd preset colors. */
const CHIP: CSSProperties = { background: V.chipBg, color: V.chipText, fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999, lineHeight: 1.7 };
/** "Tất cả model" chip — a solid brand tint so "shared" reads distinct from individual runners. */
const BRAND_CHIP: CSSProperties = { background: `${BRAND}1f`, color: BRAND, fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999, lineHeight: 1.7 };
/** Monospace stack for things the user TYPES verbatim (the instruction body, a "/lệnh"). */
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
/** "/lệnh" badge — the neutral CHIP tint in mono so a slash command reads as something you type. */
const CMD_CHIP: CSSProperties = { ...CHIP, fontFamily: MONO };

/** Starter labels for the "loại" picker — free-form, so these are just one-tap suggestions.
 *  Covers the common buckets (Lark, data, reports…) + extras. */
const TAG_SUGGESTIONS = ['Lark', 'Bitable', 'Báo cáo', 'Dữ liệu', 'Email', 'Bảo mật'];


/** Enabled/disabled badge: OK-tinted pill when on, muted V.textFaint chip when off. */
function EnabledPill({ on }: { on: boolean }) {
  const { t } = useI18n();
  return on ? (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: `${OK}1f`, color: OK, fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: OK }} /> {t('skills.on', 'Đang bật')}
    </span>
  ) : (
    <span style={{ background: V.surfaceMuted, color: V.textFaint, fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999 }}>{t('skills.off', 'Tắt')}</span>
  );
}

/**
 * Skills manager — SKILL.md "Agent Skills", scoped PER MODEL/CLI and organized with free-form
 * LABELS (tags) the user picks when saving/training. A skill applies to the runners you pick
 * (default all = "dùng chung"); enabling it syncs the skill into each chosen CLI
 * (Claude/Grok/Gemini auto-discover ~/.<cli>/skills; Codex gets a managed AGENTS.md block), so
 * it's used in the builder, remote runs and Lark with no per-run wiring. Tags are purely
 * organizational (filter/group) and never change where a skill is synced.
 */

export function SkillsScreen({
  onNav,
  mode = 'plain',
}: {
  onNav?: (v: View) => void;
  /**
   * 'plain' = kỹ năng rời (AI tự áp khi yêu cầu khớp mô tả).
   * 'cross' = kỹ năng có hợp đồng, chạy theo bộ và kiểm chéo nhau.
   *
   * Cùng MỘT màn hình vì hai bên dùng chung toàn bộ đường tạo/sửa/bật-tắt; chỉ khác thứ được LỌC
   * ra và phần giải thích. Tách thành hai component là chép đôi những đường đó, rồi chúng trôi lệch.
   */
  mode?: 'plain' | 'cross';
}) {
  const runtime = useRuntime();
  const { t } = useI18n();
  const { message, modal } = AntApp.useApp();
  const [skills, setSkills] = useState<SkillInfo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [filter, setFilter] = useState<string>('all'); // model filter
  const [tagFilter, setTagFilter] = useState<string>('all'); // label filter
  const [createOpen, setCreateOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [cName, setCName] = useState('');
  const [cDesc, setCDesc] = useState('');
  const [cInstr, setCInstr] = useState('');
  const [cScope, setCScope] = useState<string[]>(ALL_IDS);
  const [cTags, setCTags] = useState<string[]>([]);
  const [cAttachments, setCAttachments] = useState<SkillAttachment[]>([]);
  // Slash-command shortcut, stored without the leading "/". `cCmdTouched` freezes the
  // auto-suggest-from-name as soon as the user types their own command.
  const [cCommand, setCCommand] = useState('');
  const [cCmdTouched, setCCmdTouched] = useState(false);
  const [cIdea, setCIdea] = useState(''); // "Create with Claude" — a short idea to draft from
  const [drafting, setDrafting] = useState(false);
  // Edit modal (opened by clicking a card) — moves the cramped inline Selects here.
  const [editing, setEditing] = useState<SkillInfo | null>(null);
  const [eScope, setEScope] = useState<string[]>(ALL_IDS);
  const [eTags, setETags] = useState<string[]>([]);
  const [eName, setEName] = useState('');
  const [eDesc, setEDesc] = useState('');
  const [eInstr, setEInstr] = useState('');
  const [eAttachments, setEAttachments] = useState<SkillAttachment[]>([]);
  const [eCommand, setECommand] = useState('');
  const [eCmdTouched, setECmdTouched] = useState(false);
  const [bodyLoading, setBodyLoading] = useState(false);
  // Hợp đồng kỹ năng (needs/produces/checks/target) cho cả hộp tạo và hộp sửa.
  const [cContract, setCContract] = useState<SkillContractFields>({});
  const [eContract, setEContract] = useState<SkillContractFields>({});
  const [suggesting, setSuggesting] = useState(false);
  const [suggestNote, setSuggestNote] = useState<string | undefined>();
  /**
   * Hộp NỐI HAI KỸ NĂNG, đặt ngay trên thanh công cụ của mục "Kỹ năng chéo".
   *
   * Trước đây thao tác này nằm sâu bên trong: phải có một BỘ đã, rồi mở ngăn Skills, rồi bật chế độ
   * sửa. Nhưng lúc mới bắt đầu thì CHƯA CÓ BỘ NÀO — mà đó đúng là lúc người dùng cần nối nhất.
   * Cái vòng đó tự khoá chính nó: muốn có bộ thì phải nối, muốn nối thì phải có bộ.
   */
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkFrom, setLinkFrom] = useState<string | undefined>();
  const [linkKeys, setLinkKeys] = useState<string[]>([]);
  const [linkTo, setLinkTo] = useState<string | undefined>();
  const [linking, setLinking] = useState(false);
  /**
   * Ô mô tả BẰNG LỜI để trợ lý tự dựng cả bộ.
   *
   * Đây mới là đường chính, còn form khai tay là đường dự phòng. Người dùng biết các BƯỚC họ muốn
   * làm; bắt họ dịch các bước đó thành needs/produces là bắt họ làm việc của máy — mà trợ lý đã có
   * sẵn `list_skills`/`create_skill`/`update_skill` để tự làm.
   *
   * CHUYỂN sang hội thoại chứ không chạy ngầm tại đây: dựng cả bộ là nhiều thao tác GHI, cần hỏi
   * lại và cần chỗ xác nhận từng cái — hội thoại đã có đủ, màn hình này thì không.
   */
  const [planText, setPlanText] = useState('');

  /** Kỹ năng có khai `produces` — chỉ những cái này mới cho ra khoá để nối. */
  const producers = (skills ?? []).filter((x) => (x.contract?.produces ?? []).length);

  const doLinkSkills = async () => {
    const from = producers.find((x) => x.id === linkFrom);
    const to = (skills ?? []).find((x) => x.id === linkTo);
    if (!from || !to || !linkKeys.length) return;
    setLinking(true);
    try {
      const cur = to.contract ?? {};
      // GIỮ NGUYÊN produces/checks/target của kỹ năng đích: `contract` là thay thế TOÀN BỘ, gửi
      // thiếu một trường là xoá mất nó.
      setSkills(
        await runtime.updateSkill!(to.id, {
          contract: { ...cur, needs: [...new Set([...(cur.needs ?? []), ...linkKeys])] },
        }),
      );
      message.success(`Đã nối: "${to.name}" giờ chờ ${linkKeys.join(', ')} từ "${from.name}".`);
      setLinkOpen(false);
      setLinkFrom(undefined);
      setLinkKeys([]);
      setLinkTo(undefined);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLinking(false);
    }
  };

  const skillsAvailable = !!runtime.listSkills;
  // Full in-place edit (name + instruction body) needs the newer main process; feature-detect
  // so an older installed .dmg degrades gracefully (scope/tags only + a "cập nhật app" note).
  const canEditBody = !!runtime.readSkill && !!runtime.updateSkill;
  // Import-from-FOLDER needs a native picker (desktop only). On web the runtime has no
  // importSkill → hide the button entirely (the author flow "Tạo skill" is used instead).
  const canImport = !!runtime.importSkill;
  // Bundle reference FILES into a skill (attach files + a note in the create/edit flow) — server
  // skills support it (web); desktop local skills don't yet, so the section is hidden there.
  const supportsAttach = !!runtime.supportsSkillAttachments;
  // Store a "/lệnh" shortcut on a skill (typing "/" in a chat composer lists them) — server
  // skills support it; an older desktop core doesn't, so the field is hidden there instead of
  // being silently dropped on save.
  const supportsCommands = !!runtime.supportsSkillCommands;
  // Hợp đồng đi ghép vào payload create/update sẵn có nên không có phương thức mới để dò — một main
  // cũ sẽ NUỐT MẤT hợp đồng mà không báo gì, nên thà ẩn hẳn phần này còn hơn để người dùng gõ xong
  // rồi mất. `canEditBody` cũng là điều kiện: không sửa được thân thì cũng không ghi lại được file.
  /**
   * Phần hợp đồng CHỈ hiện ở mục "Kỹ năng chéo".
   *
   * Hợp đồng chính là thứ làm một kỹ năng thành "chéo" — nên hiện nó ở mục "Kỹ năng" là mời người
   * dùng khai một thứ khiến kỹ năng vừa tạo LẬP TỨC BIẾN MẤT sang mục kia (danh sách lọc theo đúng
   * dấu hiệu đó). Họ không làm gì sai mà thấy kỹ năng mất tích.
   */
  const supportsContracts = !!runtime.supportsSkillContracts && canEditBody && mode === 'cross';
  // Shared hidden input the modals click to attach a file (only one modal is open at a time).
  const fileRef = useRef<HTMLInputElement>(null);
  // Truly empty (loaded, zero skills) → show a single big centered empty state and hide the
  // toolbar actions + filters so the buttons aren't duplicated / the page isn't cluttered.
  const isEmpty = !!skills && skills.length === 0;

  const load = () => {
    // Call as a METHOD on runtime — detaching it (const fn = runtime.listSkills; fn())
    // loses `this`, so the ipcAdapter's `this.bridge` becomes undefined and throws.
    if (!runtime.listSkills) return;
    setReloading(true);
    runtime.listSkills()
      .then(setSkills)
      .catch(() => setSkills([]))
      .finally(() => setReloading(false));
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime]);

  // Every distinct label in use, for the filter row + create/edit suggestions.
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const s of skills ?? []) for (const t of s.tags ?? []) set.add(t);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [skills]);
  const tagOptions = useMemo(
    () => Array.from(new Set([...allTags, ...TAG_SUGGESTIONS])).map((t) => ({ label: t, value: t })),
    [allTags],
  );

  /** Kỹ năng có khai hợp đồng hay không — đây là ranh giới giữa hai mục. */
  const hasContract = (s: SkillInfo) =>
    !!(s.contract?.needs?.length || s.contract?.produces?.length || s.contract?.checks?.length || s.contract?.target?.table);

  const shown = useMemo(
    () =>
      (skills ?? []).filter(
        (s) =>
          (mode === 'cross' ? hasContract(s) : !hasContract(s)) &&
          (filter === 'all' || effScope(s).includes(filter)) &&
          (tagFilter === 'all' || (s.tags ?? []).includes(tagFilter)),
      ),
    [skills, filter, tagFilter, mode],
  );

  const doImport = async () => {
    setBusy(true);
    try {
      setSkills(await runtime.importSkill!(ALL_IDS));
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  // Attach a reference file to the CURRENTLY-OPEN modal (create or edit). Reads it as text and
  // appends { name, description, content } — the "upload file" is now part of authoring a skill.
  const doAttachFile = async (file: File) => {
    try {
      const content = await file.text();
      if (!content.trim()) {
        message.warning(t('skills.msg.fileEmpty', 'File rỗng.'));
        return;
      }
      const att: SkillAttachment = { name: file.name.slice(0, 200), description: '', content: content.slice(0, 50000) };
      if (editing) setEAttachments((prev) => [...prev, att]);
      else setCAttachments((prev) => [...prev, att]);
    } catch (e) {
      message.error((e as Error).message);
    }
  };
  // Keep a half-typed trailing dash ("sieu-" on the way to "sieu-ba"): slugify trims it, which
  // would make the dash impossible to type. Saving slugifies again, so nothing dangles.
  const typeCommand = (raw: string) => {
    const slug = slugifySkillCommand(raw);
    return /[-\s]$/.test(raw) && slug && slug.length < SKILL_COMMAND_MAX ? `${slug}-` : slug;
  };
  // The name feeds the shortcut until the user edits the command field themselves.
  const setCreateName = (name: string) => {
    setCName(name);
    if (!cCmdTouched) setCCommand(slugifySkillCommand(name));
  };
  const setEditName = (name: string) => {
    setEName(name);
    if (!eCmdTouched) setECommand(slugifySkillCommand(name));
  };
  const openCreate = () => {
    setCName('');
    setCDesc('');
    setCInstr('');
    setCScope(ALL_IDS);
    setCTags([]);
    setCAttachments([]);
    setCCommand('');
    setCCmdTouched(false);
    setCIdea('');
    setCreateOpen(true);
  };
  // "Create with Claude": turn a one-line idea into a drafted skill (name + description + body).
  const doDraft = async () => {
    if (!runtime.draftSkill || !cIdea.trim()) return;
    setDrafting(true);
    try {
      const d = await runtime.draftSkill(cIdea.trim());
      if (d.name) setCreateName(d.name);
      if (d.description) setCDesc(d.description);
      if (d.instructions) setCInstr(d.instructions);
      message.success(t('skills.msg.drafted', 'Đã soạn nháp bằng AI — xem lại rồi bấm Tạo.'));
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setDrafting(false);
    }
  };
  const doCreate = async () => {
    if (!cName.trim() || !cInstr.trim()) {
      message.warning(t('skills.msg.needNameBody', 'Cần tên + nội dung skill.'));
      return;
    }
    setBusy(true);
    try {
      setSkills(
        await runtime.createSkill!(
          cName.trim(),
          cInstr,
          cScope.length ? cScope : ALL_IDS,
          cTags,
          supportsAttach ? cAttachments : undefined,
          supportsAttach ? cDesc.trim() : undefined,
          supportsCommands ? slugifySkillCommand(cCommand) : undefined,
          supportsContracts && !isEmptyContract(cContract) ? cContract : undefined,
        ),
      );
      setCreateOpen(false);
      message.success(t('skills.msg.created', 'Đã tạo skill.'));
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (sk: SkillInfo, enabled: boolean) => {
    try {
      const next = await runtime.setSkillEnabled!(sk.id, enabled);
      setSkills(next);
      // keep the edit modal in sync if it's showing the toggled skill
      setEditing((cur) => (cur && cur.id === sk.id ? next.find((s) => s.id === sk.id) ?? cur : cur));
    } catch (e) {
      message.error((e as Error).message);
    }
  };
  /**
   * Khoá mọi kỹ năng KHÁC đã khai → tên kỹ năng sinh ra nó.
   *
   * Hai việc cùng lúc: gợi ý trong ô chọn (dùng lại tên có sẵn là điều kiện để hai kỹ năng nối
   * được với nhau), và cảnh báo khi hai kỹ năng cùng sinh một khoá.
   */
  const keyOwnersFor = (exceptId?: string): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const s of skills ?? []) {
      if (s.id === exceptId) continue;
      for (const k of s.contract?.produces ?? []) out[k] = s.name;
      // `needs` cũng đưa vào gợi ý nhưng KHÔNG ghi đè chủ sở hữu: cảnh báo trùng chỉ đúng khi nó
      // nói về khoá có người SINH RA, còn hai kỹ năng cùng cần một khoá là chuyện hoàn toàn bình thường.
      for (const k of s.contract?.needs ?? []) if (!(k in out)) out[k] = s.name;
    }
    return out;
  };

  /** Bấm "AI đề xuất" — điền sẵn hợp đồng từ phần nội dung người dùng vừa viết. */
  const doSuggest = async (which: 'create' | 'edit') => {
    const name = which === 'create' ? cName : eName;
    const instr = which === 'create' ? cInstr : eInstr;
    if (!instr.trim()) {
      message.warning(t('skills.contract.needBody', 'Hãy viết nội dung kỹ năng trước, rồi mới đề xuất được.'));
      return;
    }
    setSuggesting(true);
    try {
      const keys = Object.keys(keyOwnersFor(which === 'edit' ? editing?.id : undefined));
      const r = await runtime.suggestSkillContract!(name.trim() || 'Kỹ năng', instr, keys);
      const next = { needs: r.needs ?? [], produces: r.produces ?? [], checks: r.checks ?? [] };
      // GIỮ `target` đang có: đề xuất không bao giờ đoán bảng đích, nên ghi đè nó bằng undefined là
      // xoá mất thứ người dùng đã khai bằng tay.
      if (which === 'create') setCContract((c) => ({ ...next, target: c.target }));
      else setEContract((c) => ({ ...next, target: c.target }));
      setSuggestNote(r.note);
      if (!next.needs.length && !next.produces.length) {
        message.info(t('skills.contract.noSuggest', 'Chưa rút ra được khoá nào — hãy mô tả rõ hơn kỹ năng này đọc gì và tính ra gì.'));
      }
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSuggesting(false);
    }
  };

  const openEdit = (sk: SkillInfo) => {
    setEditing(sk);
    setEScope(effScope(sk));
    setETags(sk.tags ?? []);
    setEName(sk.name);
    setEDesc(sk.description ?? '');
    setEInstr('');
    setEAttachments([]);
    // A shortcut the skill already has is never re-derived from the name; an empty one still
    // auto-suggests while the user renames.
    setECommand(sk.command ?? '');
    setECmdTouched(!!sk.command);
    // Nạp từ danh sách trước để form không nháy rỗng; `readSkill` ở dưới đọc lại từ chính SKILL.md
    // và ghi đè — đó mới là nguồn sự thật, danh sách chỉ là bản đọc sẵn.
    setEContract(sk.contract ?? {});
    setSuggestNote(undefined);
    // Load the actual instruction body (+ description + attachments) so it can be edited.
    // Wrap in Promise.resolve so even a synchronous throw (old bridge) still clears loading.
    if (runtime.readSkill) {
      setBodyLoading(true);
      Promise.resolve()
        .then(() => runtime.readSkill!(sk.id))
        .then((r) => {
          setEInstr(r.instructions || '');
          if (r.description !== undefined) setEDesc(r.description || '');
          if (r.attachments) setEAttachments(r.attachments);
          setEContract(r.contract ?? {});
          if (r.command !== undefined) {
            setECommand(r.command || '');
            setECmdTouched(!!r.command);
          }
        })
        .catch(() => setEInstr(''))
        .finally(() => setBodyLoading(false));
    }
  };
  const saveEdit = async () => {
    if (!editing) return;
    const sk = editing;
    if (canEditBody && !eInstr.trim()) {
      message.warning(t('skills.msg.instrEmpty', 'Nội dung hướng dẫn không được rỗng.'));
      return;
    }
    setBusy(true);
    try {
      if (runtime.updateSkill) {
        // One in-place edit: name + (optionally) description/body/attachments + scope + tags.
        const next = await runtime.updateSkill(sk.id, {
          name: eName.trim() || sk.name,
          ...(canEditBody ? { instructions: eInstr } : {}),
          ...(supportsAttach ? { description: eDesc.trim(), attachments: eAttachments } : {}),
          ...(supportsCommands ? { command: slugifySkillCommand(eCommand) } : {}),
          // Gửi KỂ CẢ khi rỗng: form đã nạp hợp đồng hiện có lúc mở, nên rỗng ở đây nghĩa là
          // người dùng đã xoá nó — chứ không phải "không đụng tới". Bỏ qua lúc rỗng là biến việc
          // xoá thành một thao tác không làm gì cả.
          ...(supportsContracts ? { contract: eContract } : {}),
          scope: eScope.length ? eScope : ALL_IDS,
          tags: eTags,
        });
        setSkills(next);
      } else {
        // Older main process: scope + tags only (body can't be edited).
        let next: SkillInfo[] | null = null;
        const nextScope = eScope.length ? eScope : ALL_IDS;
        const curScope = effScope(sk);
        const scopeChanged = curScope.length !== nextScope.length || curScope.some((s) => !nextScope.includes(s));
        if (scopeChanged) next = await runtime.setSkillScope!(sk.id, nextScope);
        const curTags = sk.tags ?? [];
        const tagsChanged = !!runtime.setSkillTags && (curTags.length !== eTags.length || curTags.some((t) => !eTags.includes(t)));
        if (tagsChanged) next = await runtime.setSkillTags!(sk.id, eTags);
        if (next) setSkills(next);
      }
      setEditing(null);
      message.success(t('skills.msg.saved', 'Đã lưu thay đổi.'));
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const del = (sk: SkillInfo) =>
    modal.confirm({
      title: t('skills.del.confirm', 'Xoá skill "{name}"?', { name: sk.name }),
      okText: t('skills.del.ok', 'Xoá'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel', 'Huỷ'),
      onOk: async () => {
        try {
          setSkills(await runtime.deleteSkill!(sk.id));
          setEditing((cur) => (cur && cur.id === sk.id ? null : cur));
        } catch (e) {
          message.error((e as Error).message);
        }
      },
    });

  // Header interlink cluster — deep-links to sibling pillars (each guarded).
  const interlinks: { label: string; show: boolean; onClick: () => void }[] = [
    { label: t('skills.link.lark', 'Lark × Agents'), show: !!onNav, onClick: () => onNav?.('lark') },
    { label: t('skills.link.settings', 'Cài đặt · Trình AI (CLI)'), show: !!onNav, onClick: () => onNav?.('settings') },
    { label: t('skills.link.overview', 'Tổng quan'), show: !!onNav, onClick: () => onNav?.('home') },
  ];
  const shownLinks = interlinks.filter((l) => l.show);

  // "Lệnh gọi nhanh" section shared by the create + edit modals — the slug is shown after its
  // leading "/", sanitized while typing, and the two collisions the runtime silently fixes on
  // save (a reserved word, another skill's command) are called out inline.
  const renderCommandField = (
    value: string,
    setValue: Dispatch<SetStateAction<string>>,
    setTouched: Dispatch<SetStateAction<boolean>>,
    selfId?: string,
  ) => {
    const cmd = slugifySkillCommand(value);
    const taken = (skills ?? []).filter((s) => s.id !== selfId).map((s) => (s.command || '').toLowerCase()).filter(Boolean);
    const reserved = !!cmd && isReservedSkillCommand(cmd);
    const dup = !!cmd && taken.includes(cmd);
    return (
      <>
        <Text type="secondary" style={{ fontSize: 12.5, display: 'block', margin: '0 0 6px' }}>
          {t('skills.field.command', 'Lệnh gọi nhanh (tuỳ chọn):')}
        </Text>
        <Input
          value={value}
          onChange={(e) => {
            setTouched(true);
            setValue(typeCommand(e.target.value));
          }}
          prefix={<span style={{ color: V.textFaint, fontFamily: MONO }}>/</span>}
          placeholder={t('skills.field.commandPlaceholder', 'sieu-ba')}
          maxLength={SKILL_COMMAND_MAX}
          status={reserved || dup ? 'warning' : undefined}
          style={{ fontFamily: MONO, fontSize: 13 }}
        />
        {/* Nothing blocks saving: the runtime resolves both collisions the same way (append -2),
            so the copy says what WILL happen rather than pretending the save is refused. */}
        <Text style={{ fontSize: 12, display: 'block', margin: '6px 0 14px', color: reserved || dup ? WARN : V.textFaint }}>
          {reserved
            ? t('skills.field.commandReserved', 'Lệnh này hệ thống đang dùng — lưu lại sẽ tự đổi thành /{next}.', { next: uniqueSkillCommand(cmd, taken) })
            : dup
              ? t('skills.field.commandDup', 'Đã có skill dùng lệnh này — lưu lại sẽ tự đổi thành /{next}.', { next: uniqueSkillCommand(cmd, taken) })
              : t('skills.field.commandHint', 'Gõ “/” trong khung chat để gọi nhanh skill này.')}
        </Text>
      </>
    );
  };

  // Attach-files section shared by the create + edit modals (clicks the shared hidden input;
  // each file gets an optional per-file description, like Claude Skills bundle files).
  const renderAttach = (
    list: SkillAttachment[],
    setList: Dispatch<SetStateAction<SkillAttachment[]>>,
  ) => (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text type="secondary" style={{ fontSize: 12.5 }}>
          {t('skills.attach.label', 'File đính kèm (tài liệu tham khảo — AI đọc kèm khi skill bật):')}
        </Text>
        <Button size="small" icon={<PlusOutlined />} onClick={() => fileRef.current?.click()}>
          {t('skills.attach.add', 'Thêm file')}
        </Button>
      </div>
      {list.length === 0 ? (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {t('skills.attach.empty', 'Chưa có file. Bấm “Thêm file” để đính kèm .md/.txt/.json…')}
        </Text>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {list.map((f, i) => (
            <div key={i} style={{ border: `1px solid ${V.border}`, borderRadius: 10, padding: '8px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileOutlined style={{ color: V.textFaint }} />
                <span style={{ fontWeight: 600, fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.name}
                </span>
                <span style={{ fontSize: 11, color: V.textFaint }}>{t('skills.charCount', '{n} ký tự', { n: f.content.length })}</span>
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => setList((prev) => prev.filter((_, j) => j !== i))}
                />
              </div>
              <Input
                size="small"
                placeholder={t('skills.attach.descPlaceholder', 'Mô tả file này (khi nào / dùng để làm gì)…')}
                value={f.description || ''}
                onChange={(e) => setList((prev) => prev.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
                style={{ marginTop: 6 }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <IconTile icon={<ExperimentOutlined />} color={WARN} size={40} radius={11} fontSize={20} />
        <Title level={3} style={{ margin: 0 }}>
          {t('skills.title', 'Kỹ năng (Skills)')}
        </Title>
        {skills && skills.length > 0 && (
          <span style={{ background: `${OK}1f`, color: OK, fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999 }}>
            {t('skills.enabledCount', '{n}/{m} đang bật', { n: skills.filter((s) => s.enabled).length, m: skills.length })}
          </span>
        )}
        <Tooltip title={t('skills.guideTooltip', 'Hướng dẫn sử dụng Kỹ năng')}>
          <Button type="text" shape="circle" icon={<QuestionCircleOutlined />} onClick={() => setGuideOpen(true)} aria-label={t('skills.guideAria', 'Hướng dẫn')} />
        </Tooltip>
        <div style={{ flex: 1 }} />
        <Tooltip title={t('skills.reload', 'Tải lại')}>
          <Button type="text" shape="circle" icon={<ReloadOutlined spin={reloading} />} onClick={() => load()} aria-label={t('skills.reload', 'Tải lại')} />
        </Tooltip>
        {/* Shared hidden input the create/edit modals click to attach a reference file. */}
        {supportsAttach && (
          <input
            ref={fileRef}
            type="file"
            accept=".md,.markdown,.txt,.json,.csv,.yaml,.yml,.js,.ts,.py,.html,.css,.sql,text/*,application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void doAttachFile(f);
              e.target.value = '';
            }}
          />
        )}
        {/* Toolbar actions live in the header only when there ARE skills — when empty the big
            centered empty state is the single place for the CTAs (no duplicate buttons). */}
        {!isEmpty && (
          <>
            {canImport && (
              <Button icon={<FolderOpenOutlined />} loading={busy} onClick={() => void doImport()}>
                {t('skills.import', 'Nhập từ thư mục')}
              </Button>
            )}
            {mode === 'cross' && producers.length >= 1 && (
              <Button icon={<NodeIndexOutlined />} onClick={() => setLinkOpen(true)}>
                {t('skills.linkTwo', 'Nối hai kỹ năng')}
              </Button>
            )}
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              {t('skills.create', 'Tạo skill')}
            </Button>
          </>
        )}
      </div>

      {shownLinks.length > 0 && !isEmpty && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', marginBottom: 8 }}>
          {shownLinks.map((l) => (
            <Button key={l.label} type="link" size="small" style={{ padding: '0 8px' }} onClick={l.onClick}>
              {l.label} <ArrowRightOutlined style={{ fontSize: 11 }} />
            </Button>
          ))}
        </div>
      )}

      {!isEmpty && (
        <Text type="secondary" style={{ fontSize: 13.5, display: 'block', marginBottom: 14, maxWidth: 760 }}>
          {mode === 'cross' ? (
            <>
              {t('skills.desc.crossP1', '“Kỹ năng chéo” là nhiều kỹ năng nối nhau bằng ')}<b>{t('skills.desc.crossKeys', 'khoá')}</b>
              {t('skills.desc.crossP2', ' — thứ tự chạy TỰ SUY RA từ dữ liệu, không phải đánh số 1,2,3. Sau mỗi bước máy kiểm lại mọi ràng buộc, nên mâu thuẫn lộ ngay tại bước gây ra nó. ')}
              <b>{t('skills.desc.crossP3', 'Kỹ năng làm việc một mình thì nằm ở mục “Kỹ năng”.')}</b>{' '}
              {onNav ? (
                <Button type="link" size="small" style={{ padding: 0, height: 'auto' }} onClick={() => onNav('skills')}>
                  {t('skills.desc.goPlain', 'Sang Kỹ năng')}
                </Button>
              ) : null}{' '}
            </>
          ) : (
            <>
              {t('skills.desc.p1', '“Kỹ năng” dạy AI cách làm một việc theo quy trình/quy tắc của bạn — ')}<b>{t('skills.desc.p2', 'bật lên là AI TỰ áp dụng khi yêu cầu KHỚP MÔ TẢ skill')}</b>{' '}
              {t('skills.desc.p3', '(không cần gõ tên/lệnh), trong Lark × Agents, Trợ lý AI và khi chạy từ xa.')}{' '}
              <b>{t('skills.desc.p4', 'Muốn kỹ năng nối vào nhau thành dây chuyền thì tạo ở mục “Kỹ năng chéo”.')}</b>{' '}
              {onNav ? (
                <Button type="link" size="small" style={{ padding: 0, height: 'auto' }} onClick={() => onNav('skills-cross')}>
                  {t('skills.desc.goCross', 'Sang Kỹ năng chéo')}
                </Button>
              ) : null}{' '}
            </>
          )}
          <Button type="link" size="small" style={{ padding: 0, height: 'auto' }} onClick={() => setGuideOpen(true)}>
            {t('skills.desc.seeGuide', 'Xem hướng dẫn')}
          </Button>
        </Text>
      )}

      {mode === 'cross' && onNav ? (
        <div
          style={{
            border: `1px solid ${V.border}`,
            borderRadius: 12,
            padding: 14,
            background: V.layer,
            marginBottom: 16,
          }}
        >
          <Text strong style={{ fontSize: 13.5 }}>
            {t('skills.plan.title', 'Mô tả bằng lời — trợ lý tự dựng cả bộ')}
          </Text>
          <Text type="secondary" style={{ fontSize: 12.5, display: 'block', margin: '4px 0 8px' }}>
            {t(
              'skills.plan.hint',
              'Cứ viết các bước bạn muốn làm, bằng tiếng Việt thường. Không cần nghĩ tên khoá, không cần biết bước nào chạy trước — trợ lý tự đặt tên, tự nối, và hỏi lại nếu thiếu gì.',
            )}
          </Text>
          <Input.TextArea
            value={planText}
            onChange={(e) => setPlanText(e.target.value)}
            autoSize={{ minRows: 3, maxRows: 8 }}
            placeholder={t(
              'skills.plan.ph',
              'vd:\n- Kiểm khách hàng trùng số điện thoại hoặc email\n- Kiểm đơn hàng thiếu liên kết khách hàng\n- Tổng hợp hai kết quả trên thành một báo cáo, ghi vào bảng Kiểm chéo',
            )}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            <Button
              type="primary"
              icon={<BulbOutlined />}
              disabled={!planText.trim()}
              onClick={() => {
                setLarkPrompt(
                  [
                    'Dựng giúp tôi một BỘ KỸ NĂNG CHÉO từ mô tả dưới đây.',
                    '',
                    planText.trim(),
                    '',
                    'Cách làm:',
                    '1. Gọi list_skills trước để biết khoá nào đã có — DÙNG LẠI tên có sẵn, đừng đặt tên đồng nghĩa.',
                    '2. Mỗi bước là một kỹ năng: create_skill, khai produces là kết quả bước đó làm ra.',
                    '3. Bước nào THẬT SỰ cần kết quả của bước trước thì khai needs; không cần thì để trống,',
                    '   các kỹ năng sẽ chạy lần lượt.',
                    '4. Thêm checks nếu có phép tính chắc chắn đúng (vd tổng == các thành phần cộng lại).',
                    '',
                    'Nói cho tôi biết bạn định tạo những kỹ năng nào và nối ra sao TRƯỚC khi tạo.',
                  ].join('\n'),
                );
                setPlanText('');
                onNav('lark');
              }}
            >
              {t('skills.plan.go', 'Để trợ lý dựng')}
            </Button>
            <Text type="secondary" style={{ fontSize: 11.5 }}>
              {t('skills.plan.note', 'Mở hội thoại kèm yêu cầu điền sẵn — bạn đọc lại rồi mới gửi.')}
            </Text>
          </div>
        </div>
      ) : null}

      {/* Filters: by model (which CLI) + by free-form label. Hidden when there are no skills. */}
      {!isEmpty && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {/* Scroll the filter itself on a narrow phone instead of pushing the page into side-scroll. */}
        <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
          <Segmented
            value={filter}
            onChange={(v) => setFilter(v as string)}
            options={[{ label: t('skills.filter.allModels', 'Tất cả model'), value: 'all' }, ...RUNNERS.map((r) => ({ label: r.label, value: r.id }))]}
          />
        </div>
        {allTags.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <TagsOutlined style={{ color: V.textFaint }} />
            <Tag.CheckableTag checked={tagFilter === 'all'} onChange={() => setTagFilter('all')}>
              {t('skills.filter.allTags', 'Tất cả nhãn')}
            </Tag.CheckableTag>
            {allTags.map((t) => (
              <Tag.CheckableTag key={t} checked={tagFilter === t} onChange={() => setTagFilter(tagFilter === t ? 'all' : t)}>
                {t}
              </Tag.CheckableTag>
            ))}
          </div>
        )}
      </div>
      )}

      {!skillsAvailable ? (
        <EmptyState
          icon={<ExperimentOutlined />}
          title={t('skills.unavailable.title', 'Kỹ năng chưa khả dụng trên bản này')}
          description={t('skills.unavailable.desc', 'Hãy cập nhật ứng dụng lên bản mới để dùng Kỹ năng (Skills).')}
        />
      ) : !skills ? null : shown.length === 0 ? (
        skills.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              padding: '72px 20px 56px',
              gap: 16,
            }}
          >
            <IconTile icon={<ExperimentOutlined />} color={WARN} size={88} radius={22} fontSize={44} />
            <div style={{ fontSize: 24, fontWeight: 700, color: V.text }}>{t('skills.empty.title', 'Chưa có kỹ năng nào')}</div>
            <Text type="secondary" style={{ fontSize: 14.5, maxWidth: 560, lineHeight: 1.6 }}>
              {t('skills.empty.desc', 'Kỹ năng là hướng dẫn ngắn dạy AI làm theo cách của bạn — ví dụ “Luôn dùng Tailwind + Ant Design”, “Viết commit theo Conventional Commits”. Bật lên là AI tự áp dụng mọi lúc.')}
            </Text>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 6 }}>
              <Button type="primary" size="large" icon={<PlusOutlined />} onClick={openCreate}>
                {t('skills.create', 'Tạo skill')}
              </Button>
              {canImport && (
                <Button size="large" icon={<FolderOpenOutlined />} loading={busy} onClick={() => void doImport()}>
                  {t('skills.import', 'Nhập từ thư mục')}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <EmptyState
            icon={<TagsOutlined />}
            title={t('skills.noMatch.title', 'Không có skill khớp bộ lọc')}
            description={
              tagFilter !== 'all'
                ? filter !== 'all'
                  ? t('skills.noMatch.tagAndModel', 'Chưa có skill nào gắn nhãn “{tag}” cho {model}.', { tag: tagFilter, model: labelOf(filter) })
                  : t('skills.noMatch.tag', 'Chưa có skill nào gắn nhãn “{tag}”.', { tag: tagFilter })
                : t('skills.noMatch.model', 'Chưa có skill nào áp dụng cho {model}.', { model: labelOf(filter) })
            }
            secondaryLabel={t('skills.noMatch.clear', 'Xoá bộ lọc')}
            onSecondary={() => {
              setFilter('all');
              setTagFilter('all');
            }}
          />
        )
      ) : (
        <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: 12 }}>
          {shown.map((sk) => {
            const scope = effScope(sk);
            const isAll = ALL_IDS.every((id) => scope.includes(id));
            const tags = sk.tags ?? [];
            return (
              <Card
                key={sk.id}
                hoverable
                className="tw-stat-card"
                onClick={() => openEdit(sk)}
                styles={{ body: { padding: 16 } }}
                style={{ height: '100%', boxShadow: CARD_SHADOW, cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <IconTile icon={<ExperimentOutlined />} color={WARN} size={40} radius={11} fontSize={20} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: 15, color: V.text }}>{sk.name}</span>
                      <EnabledPill on={sk.enabled} />
                      {sk.command && <span style={CMD_CHIP}>/{sk.command}</span>}
                    </div>
                    {sk.description && (
                      <Paragraph type="secondary" style={{ margin: '4px 0 0', fontSize: 12.5 }} ellipsis={{ rows: 2 }}>
                        {sk.description}
                      </Paragraph>
                    )}
                    {/* Labels row (read-only; edit via the card's modal) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                      <TagsOutlined style={{ color: V.textFaint }} />
                      {tags.length ? (
                        tags.map((t) => (
                          <span key={t} style={CHIP}>
                            {t}
                          </span>
                        ))
                      ) : (
                        <Text type="secondary" style={{ fontSize: 12 }}>{t('skills.card.noTags', 'chưa gắn nhãn')}</Text>
                      )}
                    </div>
                    {/* Model scope row (read-only; edit via the card's modal) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>{t('skills.card.applies', 'Áp dụng:')}</Text>
                      {isAll ? (
                        <span style={BRAND_CHIP}>{t('skills.allModels', 'Tất cả model')}</span>
                      ) : (
                        scope.map((id) => (
                          <span key={id} style={CHIP}>
                            {labelOf(id)}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                  {/* quick controls — stop the card's edit-on-click */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                    <Switch checked={sk.enabled} onChange={(v) => void toggle(sk, v)} />
                    <Button type="text" danger icon={<DeleteOutlined />} title={t('skills.card.deleteTitle', 'Xoá skill')} onClick={() => del(sk)} />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
        {/* Bộ kỹ năng nằm DƯỚI danh sách: đại đa số kỹ năng không khai hợp đồng, nên đặt nó lên
            đầu là đẩy thứ người dùng vào đây để tìm xuống dưới màn hình. */}
        {/* Thẻ bộ kỹ năng CHỈ ở mục "Kỹ năng chéo" — ở mục kia nó luôn rỗng vì không kỹ năng nào
            khai khoá, và một thẻ luôn rỗng chỉ làm người dùng tưởng mình đang thiếu thứ gì.

            `onSkillsChanged` nối ngược lên đây: bật/tắt kỹ năng từ thẻ bộ phải làm LƯỚI Ở TRÊN nạp
            lại, nếu không thẻ nói "đang tắt" mà lưới vẫn nói "Đang bật" — người dùng không biết tin
            cái nào, và cũng không biết thao tác vừa rồi có ăn không. */}
        {mode === 'cross' ? (
        <SkillSetsCard
          runtime={runtime}
          onSkillsChanged={load}
          // Chuyển sang Trợ lý Lark kèm câu hỏi điền sẵn. Chỉ ĐIỀN, không tự gửi — câu do máy dựng
          // nên người dùng phải đọc lại; tự gửi là thay họ quyết định một lượt có thể ghi dữ liệu.
          onAskAI={
            onNav
              ? (prompt) => {
                  setLarkPrompt(prompt);
                  onNav('lark');
                }
              : undefined
          }
        />
        ) : null}
        </>
      )}

      {/* Edit skill modal — scope + labels + enable (instruction body isn't exposed by the runtime). */}
      <Modal
        open={!!editing}
        title={
          editing ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <IconTile icon={<ExperimentOutlined />} color={WARN} /> {editing.name}
            </span>
          ) : (
            ''
          )
        }
        onCancel={() => setEditing(null)}
        footer={
          editing ? (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <Button danger icon={<DeleteOutlined />} onClick={() => del(editing)}>
                {t('skills.del.ok', 'Xoá')}
              </Button>
              <div style={{ flex: 1 }} />
              <Button onClick={() => setEditing(null)} style={{ marginRight: 8 }}>
                {t('common.close', 'Đóng')}
              </Button>
              <Button type="primary" loading={busy} onClick={() => void saveEdit()}>
                {t('common.save', 'Lưu')}
              </Button>
            </div>
          ) : null
        }
      >
        {editing && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <Switch checked={editing.enabled} onChange={(v) => void toggle(editing, v)} />
              <Text style={{ fontSize: 13 }}>
                {editing.enabled ? t('skills.edit.onHint', 'Đang bật — đã đồng bộ vào các CLI đã chọn.') : t('skills.edit.offHint', 'Đang tắt — bật để đồng bộ vào các CLI.')}
              </Text>
            </div>
            {canEditBody && (
              <>
                <Text type="secondary" style={{ fontSize: 12.5, display: 'block', margin: '0 0 6px' }}>{t('skills.field.name', 'Tên skill:')}</Text>
                <Input value={eName} onChange={(e) => setEditName(e.target.value)} placeholder={t('skills.field.namePlaceholder', 'Tên skill')} maxLength={120} style={{ marginBottom: 14 }} />
                {supportsCommands && renderCommandField(eCommand, setECommand, setECmdTouched, editing.id)}
                {supportsAttach && (
                  <>
                    <Text type="secondary" style={{ fontSize: 12.5, display: 'block', margin: '0 0 6px' }}>
                      {t('skills.field.descWhen', 'Mô tả — KHI NÀO dùng:')}
                    </Text>
                    <Input.TextArea
                      value={eDesc}
                      onChange={(e) => setEDesc(e.target.value)}
                      autoSize={{ minRows: 2, maxRows: 4 }}
                      maxLength={500}
                      placeholder={t('skills.field.descPlaceholder', 'vd: Dùng khi được hỏi cập nhật / tóm tắt tiến độ.')}
                      style={{ marginBottom: 14 }}
                    />
                  </>
                )}
                <Text type="secondary" style={{ fontSize: 12.5, display: 'block', margin: '0 0 6px' }}>{t('skills.field.instrEdit', 'Nội dung hướng dẫn (sửa trực tiếp):')}</Text>
                <Input.TextArea
                  value={eInstr}
                  onChange={(e) => setEInstr(e.target.value)}
                  autoSize={{ minRows: 6, maxRows: 16 }}
                  placeholder={bodyLoading ? t('skills.field.instrLoading', 'Đang tải nội dung…') : t('skills.field.instrPlaceholder', 'Các bước / quy tắc AI cần làm khi skill áp dụng.')}
                  disabled={bodyLoading}
                  style={{ marginBottom: supportsAttach ? 0 : 14 }}
                />
                {supportsAttach && renderAttach(eAttachments, setEAttachments)}
              </>
            )}
            {!canEditBody && editing.description && (
              <Text type="secondary" style={{ fontSize: 12.5, display: 'block', marginBottom: 14 }}>
                {editing.description}
              </Text>
            )}
            <Text type="secondary" style={{ fontSize: 12.5, display: 'block', margin: '0 0 6px' }}>
              {t('skills.field.applyModels', 'Áp dụng cho model nào (mặc định tất cả):')}
            </Text>
            <Select
              mode="multiple"
              value={eScope}
              onChange={setEScope}
              options={RUNNERS.map((r) => ({ label: r.label, value: r.id }))}
              style={{ width: '100%' }}
              placeholder={t('skills.field.applyPlaceholder', 'Chọn model áp dụng')}
            />
            <Text type="secondary" style={{ fontSize: 12.5, display: 'block', margin: '14px 0 6px' }}>
              {t('skills.field.tagsLabel', 'Nhãn (tự đặt — để lọc & nhóm; vd “Lark”, “Báo cáo”):')}
            </Text>
            <Select
              mode="tags"
              value={eTags}
              onChange={setETags}
              options={tagOptions}
              style={{ width: '100%' }}
              placeholder={t('skills.field.tagsPlaceholder', 'Gõ nhãn rồi Enter, hoặc chọn gợi ý')}
              tokenSeparators={[',']}
              disabled={!runtime.setSkillTags}
            />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {TAG_SUGGESTIONS.map((t) => (
                <Tag.CheckableTag
                  key={t}
                  checked={eTags.includes(t)}
                  onChange={(on) => setETags((prev) => (on ? [...prev, t] : prev.filter((x) => x !== t)))}
                >
                  {t}
                </Tag.CheckableTag>
              ))}
            </div>
            {supportsContracts && (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${V.border}` }}>
                <SkillContractEditor
                  runtime={runtime}
                  value={eContract}
                  onChange={setEContract}
                  keyOwners={keyOwnersFor(editing?.id)}
                  onSuggest={runtime.suggestSkillContract ? () => void doSuggest('edit') : undefined}
                  suggesting={suggesting}
                  note={suggestNote}
                />
              </div>
            )}
            {!canEditBody && (
              <div style={{ marginTop: 14, padding: '10px 12px', background: `${WARN}14`, border: `1px solid ${WARN}44`, borderRadius: 10 }}>
                <Text style={{ fontSize: 12.5, color: V.textSub, display: 'block', marginBottom: 8, lineHeight: 1.55 }}>
                  {t('skills.edit.needCore.p1', 'Sửa nội dung skill cần bản ')}<b>{t('skills.edit.needCore.core', 'LÕI')}</b>{t('skills.edit.needCore.p2', ' mới. Lưu ý: số phiên bản hiển thị là bản ')}<b>{t('skills.edit.needCore.ui', 'GIAO DIỆN')}</b>{t('skills.edit.needCore.p3', ' (tự cập nhật khi mở app) — phần ')}<b>{t('skills.edit.needCore.core', 'LÕI')}</b>{t('skills.edit.needCore.p4', ' nằm trong file cài đặt, phải ')}<b>{t('skills.edit.needCore.reinstall', 'TẢI & CÀI LẠI .dmg')}</b>{t('skills.edit.needCore.p5', ' thì mới sửa được nội dung tại đây.')}
                </Text>
                <Button
                  size="small"
                  type="primary"
                  icon={<CloudDownloadOutlined />}
                  onClick={() => runtime.openExternal?.('https://toolswave.net/download')}
                >
                  {t('skills.edit.downloadDmg', 'Tải bản mới (.dmg)')}
                </Button>
              </div>
            )}
          </>
        )}
      </Modal>

      <Modal
        open={createOpen}
        title={t('skills.create', 'Tạo skill')}
        okText={t('skills.create.ok', 'Tạo')}
        cancelText={t('common.cancel', 'Huỷ')}
        confirmLoading={busy}
        onOk={() => void doCreate()}
        onCancel={() => setCreateOpen(false)}
        // Rộng hơn hẳn: form này có ô nhập khoá, bộ dựng ràng buộc và bảng mô tả cách chạy — ở
        // 520px chúng chồng lên nhau và mỗi dòng gãy làm ba.
        width={supportsContracts ? 860 : supportsAttach ? 620 : 520}
      >
        {supportsAttach ? (
          <>
            {runtime.draftSkill && (
              <div style={{ marginBottom: 16, padding: '10px 12px', border: `1px dashed ${BRAND}66`, borderRadius: 12, background: `${BRAND}0d` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <ThunderboltOutlined style={{ color: BRAND }} />
                  <Text style={{ fontSize: 13, fontWeight: 600 }}>{t('skills.create.aiTitle', 'Tạo bằng AI (Claude)')}</Text>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Input
                    placeholder={t('skills.create.ideaPlaceholder', 'Mô tả ý tưởng skill… vd: soạn báo cáo tuần từ công việc gần đây')}
                    value={cIdea}
                    onChange={(e) => setCIdea(e.target.value)}
                    onPressEnter={() => void doDraft()}
                    disabled={drafting}
                  />
                  <Button type="primary" ghost loading={drafting} disabled={!cIdea.trim()} onClick={() => void doDraft()}>
                    {t('skills.create.draft', 'Soạn')}
                  </Button>
                </div>
              </div>
            )}
            <Text type="secondary" style={{ fontSize: 12.5, display: 'block', margin: '0 0 6px' }}>{t('skills.field.name', 'Tên skill:')}</Text>
            <Input
              placeholder={t('skills.create.namePlaceholderSlug', 'vd: weekly-status-report')}
              value={cName}
              onChange={(e) => setCreateName(e.target.value)}
              maxLength={120}
              style={{ marginBottom: 12 }}
            />
            {supportsCommands && renderCommandField(cCommand, setCCommand, setCCmdTouched)}
            <Text type="secondary" style={{ fontSize: 12.5, display: 'block', margin: '0 0 6px' }}>
              {t('skills.create.descA', 'Mô tả — ')}<b>{t('skills.create.when', 'KHI NÀO')}</b>{t('skills.create.descB', ' dùng (để AI tự nhận biết khi yêu cầu khớp):')}
            </Text>
            <Input.TextArea
              placeholder={t('skills.create.descPlaceholder', 'vd: Soạn báo cáo tiến độ tuần. Dùng khi được hỏi cập nhật / tóm tắt tiến độ.')}
              value={cDesc}
              onChange={(e) => setCDesc(e.target.value)}
              autoSize={{ minRows: 2, maxRows: 4 }}
              maxLength={500}
              style={{ marginBottom: 12 }}
            />
            <Text type="secondary" style={{ fontSize: 12.5, display: 'block', margin: '0 0 6px' }}>
              {t('skills.create.instrA', 'Hướng dẫn — ')}<b>{t('skills.create.what', 'LÀM GÌ')}</b>{t('skills.create.instrB', ' khi skill được áp dụng:')}
            </Text>
            <Input.TextArea
              placeholder={t('skills.create.instrPlaceholder', 'vd: Tóm tắt công việc gần đây theo 3 mục: thành quả, vướng mắc, việc tiếp theo. Giọng chuyên nghiệp nhưng không cứng nhắc…')}
              value={cInstr}
              onChange={(e) => setCInstr(e.target.value)}
              autoSize={{ minRows: 6, maxRows: 16 }}
              style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13 }}
            />
            {renderAttach(cAttachments, setCAttachments)}
            <Text type="secondary" style={{ fontSize: 12.5, display: 'block', margin: '14px 0 6px' }}>
              {t('skills.create.tagsOptional', 'Nhãn (tuỳ chọn — để lọc & nhóm):')}
            </Text>
            <Select
              mode="tags"
              value={cTags}
              onChange={setCTags}
              options={tagOptions}
              style={{ width: '100%' }}
              placeholder={t('skills.create.tagsPlaceholderSimple', 'Gõ nhãn rồi Enter')}
              tokenSeparators={[',']}
            />
          </>
        ) : (
          <>
            <Text type="secondary" style={{ fontSize: 12.5, display: 'block' }}>
              <b>{t('skills.simple.howTitle', 'Cách hoạt động:')}</b> <b>{t('skills.simple.firstLine', 'DÒNG ĐẦU')}</b>{t('skills.simple.how1', ' của hướng dẫn = câu ')}<b>{t('skills.simple.trigger', 'KÍCH HOẠT')}</b>{t('skills.simple.how2', ' (trở thành “mô tả” của skill). AI ')}<b>{t('skills.simple.autoApply', 'tự đọc + áp dụng')}</b>{t('skills.simple.how3', ' khi việc bạn giao ')}<b>{t('skills.simple.matchFirst', 'khớp dòng đầu')}</b>{t('skills.simple.how4', ' này — ')}<b>{t('skills.simple.noName', 'bạn KHÔNG gõ tên skill')}</b>{t('skills.simple.how5', '. Thử ở màn ')}{' '}
              <b>{t('skills.link.lark', 'Lark × Agents')}</b>{t('skills.simple.how6', ' hoặc Trợ lý AI.')}
            </Text>
            <Input
              placeholder={t('skills.simple.namePlaceholder', 'Tên skill (vd: Viết commit chuẩn)')}
              value={cName}
              onChange={(e) => setCreateName(e.target.value)}
              style={{ marginBottom: 8 }}
            />
            {supportsCommands && renderCommandField(cCommand, setCCommand, setCCmdTouched)}
            <Input.TextArea
              placeholder={t('skills.simple.instrPlaceholder', 'Dòng 1 = KHI NÀO dùng (câu kích hoạt) — vd: “Dùng skill này mỗi khi dựng web app.”\nCác dòng sau = LÀM GÌ, theo quy tắc/quy trình nào (gạch đầu dòng).')}
              value={cInstr}
              onChange={(e) => setCInstr(e.target.value)}
              autoSize={{ minRows: 6, maxRows: 14 }}
            />
            <Text type="secondary" style={{ fontSize: 12.5, display: 'block', margin: '12px 0 6px' }}>
              {t('skills.simple.tagsLabel', 'Loại / nhãn (tự đặt — để lọc & nhóm; vd “Lark”, “Báo cáo”):')}
            </Text>
            <Select
              mode="tags"
              value={cTags}
              onChange={setCTags}
              options={tagOptions}
              style={{ width: '100%' }}
              placeholder={t('skills.field.tagsPlaceholder', 'Gõ nhãn rồi Enter, hoặc chọn gợi ý')}
              tokenSeparators={[',']}
            />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {TAG_SUGGESTIONS.map((t) => (
                <Tag.CheckableTag
                  key={t}
                  checked={cTags.includes(t)}
                  onChange={(on) => setCTags((prev) => (on ? [...prev, t] : prev.filter((x) => x !== t)))}
                >
                  {t}
                </Tag.CheckableTag>
              ))}
            </div>
            {supportsContracts && (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${V.border}` }}>
                <SkillContractEditor
                  runtime={runtime}
                  value={cContract}
                  onChange={setCContract}
                  keyOwners={keyOwnersFor(undefined)}
                  onSuggest={runtime.suggestSkillContract ? () => void doSuggest('create') : undefined}
                  suggesting={suggesting}
                  note={suggestNote}
                />
              </div>
            )}
            <Text type="secondary" style={{ fontSize: 12.5, display: 'block', margin: '14px 0 6px' }}>
              {t('skills.field.applyModels', 'Áp dụng cho model nào (mặc định tất cả):')}
            </Text>
            <Select
              mode="multiple"
              value={cScope}
              onChange={setCScope}
              options={RUNNERS.map((r) => ({ label: r.label, value: r.id }))}
              style={{ width: '100%' }}
              placeholder={t('skills.field.applyPlaceholder', 'Chọn model áp dụng')}
            />
          </>
        )}
      </Modal>

      <Modal
        open={linkOpen}
        onCancel={() => setLinkOpen(false)}
        onOk={() => void doLinkSkills()}
        okText={t('skills.link.ok', 'Nối')}
        cancelText={t('common.cancel', 'Thôi')}
        okButtonProps={{ disabled: !linkFrom || !linkKeys.length || !linkTo, loading: linking }}
        width={620}
        title={t('skills.linkTwo', 'Nối hai kỹ năng')}
      >
        <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 14 }}>
          {t(
            'skills.link.intro',
            'Mặc định các kỹ năng chạy LẦN LƯỢT theo thứ tự trong danh sách — không cần nối gì cả. Nối chỉ dùng khi kỹ năng sau THẬT SỰ cần kết quả của kỹ năng trước; lúc đó máy đảm bảo nó không chạy sớm. Kỹ năng hỏng giữa chừng thì bộ vẫn chạy tiếp rồi QUAY LẠI thử nó lần nữa khi dữ liệu đã đầy hơn.',
          )}
        </Text>

        <Text strong style={{ fontSize: 12.5, display: 'block', marginBottom: 4 }}>
          {t('skills.link.from', 'Kỹ năng chạy TRƯỚC (làm ra kết quả)')}
        </Text>
        <Select
          style={{ width: '100%' }}
          value={linkFrom}
          onChange={(v) => {
            setLinkFrom(v);
            setLinkKeys([]);
          }}
          placeholder={t('skills.link.fromPh', 'Chọn kỹ năng đã có kết quả')}
          showSearch
          optionFilterProp="label"
          options={producers.map((x) => ({ value: x.id, label: x.name }))}
        />

        {linkFrom ? (
          <>
            <Text strong style={{ fontSize: 12.5, display: 'block', margin: '12px 0 4px' }}>
              {t('skills.link.keys', 'Kết quả nào được chuyền sang')}
            </Text>
            <Select
              mode="multiple"
              style={{ width: '100%' }}
              value={linkKeys}
              onChange={setLinkKeys}
              placeholder={t('skills.link.keysPh', 'Chọn một hoặc vài kết quả')}
              options={(producers.find((x) => x.id === linkFrom)?.contract?.produces ?? []).map((k) => ({
                value: k,
                label: k,
              }))}
            />
          </>
        ) : null}

        {linkKeys.length ? (
          <>
            <Text strong style={{ fontSize: 12.5, display: 'block', margin: '12px 0 4px' }}>
              {t('skills.link.to', 'Kỹ năng chạy SAU (dùng kết quả đó)')}
            </Text>
            <Select
              style={{ width: '100%' }}
              value={linkTo}
              onChange={setLinkTo}
              placeholder={t('skills.link.toPh', 'Chọn kỹ năng sẽ chờ')}
              showSearch
              optionFilterProp="label"
              // Bỏ chính kỹ năng nguồn: một kỹ năng cần khoá do CHÍNH NÓ sinh ra thì tự chờ mình
              // mãi mãi, và người dùng chỉ thấy báo "bế tắc" mà không hiểu vì sao.
              options={(skills ?? []).filter((x) => x.id !== linkFrom).map((x) => ({ value: x.id, label: x.name }))}
            />
          </>
        ) : null}

        {linkTo ? (
          <Alert
            style={{ marginTop: 14 }}
            type="success"
            showIcon
            message={t('skills.link.result', 'Sau khi nối')}
            description={
              <div style={{ fontSize: 12.5 }}>
                <b>{(skills ?? []).find((x) => x.id === linkTo)?.name}</b> sẽ luôn chạy <b>sau</b>{' '}
                <b>{producers.find((x) => x.id === linkFrom)?.name}</b>, vì nó cần{' '}
                <Text code>{linkKeys.join(', ')}</Text>.
                <div style={{ marginTop: 6, color: V.textFaint }}>
                  Nhớ sửa nội dung kỹ năng sau để nó thật sự <b>dùng</b> các kết quả này — nối xong mà không
                  dùng thì nó nhận rồi bỏ qua.
                </div>
              </div>
            }
          />
        ) : null}
      </Modal>

      <Modal
        open={guideOpen}
        title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><QuestionCircleOutlined style={{ color: BRAND }} />{t('skills.guide.title', 'Hướng dẫn dùng Kỹ năng (Skills)')}</span>}
        onCancel={() => setGuideOpen(false)}
        width={supportsContracts ? 860 : 620}
        footer={[
          <Button key="create" icon={<PlusOutlined />} onClick={() => { setGuideOpen(false); setCreateOpen(true); }}>
            {t('skills.create', 'Tạo skill')}
          </Button>,
          <Button key="ok" type="primary" onClick={() => setGuideOpen(false)}>{t('skills.guide.gotIt', 'Đã hiểu')}</Button>,
        ]}
      >
        <div style={{ maxHeight: '62vh', overflow: 'auto', paddingRight: 4 }}>
          <GuideSection title={t('skills.guide.s1.title', 'Kỹ năng là gì?')}>
            {t('skills.guide.s1.a', 'Một ')}<b>{t('skills.guide.s1.skillWord', '“kỹ năng”')}</b>{t('skills.guide.s1.b', ' là hướng dẫn ngắn (một thư mục chứa file ')}<Text code>SKILL.md</Text>{t('skills.guide.s1.c', ') dạy AI cách làm một việc theo ')}<b>{t('skills.guide.s1.yourRules', 'quy trình/quy tắc của bạn')}</b>{t('skills.guide.s1.d', '. Khi bật, AI ')}<b>{t('skills.guide.s1.autoApply', 'tự đọc + áp dụng khi việc bạn giao KHỚP MÔ TẢ của skill')}</b>{t('skills.guide.s1.e', ' — trong Lark × Agents, Trợ lý AI và khi chạy từ xa (điện thoại). Với ')}<b>Claude</b>{t('skills.guide.s1.f', ' đây ')}<b>{t('skills.guide.s1.native', 'đúng là cơ chế skills native')}</b>{t('skills.guide.s1.g', ' (chép vào ')}{' '}
            <Text code>~/.claude/skills</Text>{t('skills.guide.s1.h', ', có “progressive disclosure”: AI đọc tên+mô tả trước, chỉ nạp đầy đủ khi cần).')}
          </GuideSection>
          <GuideSection title={t('skills.guide.s2.title', 'Thêm kỹ năng — 2 cách')}>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18, lineHeight: 1.7 }}>
              <li><b>{t('skills.create', 'Tạo skill')}</b>{t('skills.guide.s2.create', ': đặt tên + viết hướng dẫn (AI nên làm gì, theo quy tắc nào). Nhanh gọn cho quy tắc riêng của bạn.')}</li>
              <li><b>{t('skills.import', 'Nhập từ thư mục')}</b>{t('skills.guide.s2.importA', ': chọn một thư mục có sẵn file ')}<Text code>SKILL.md</Text>{t('skills.guide.s2.importB', ' (skill dạng chuẩn Anthropic). Larkwave sẽ nạp vào.')}</li>
            </ul>
          </GuideSection>
          <GuideSection title={t('skills.guide.s3.title', 'Nhãn (loại) — sắp xếp theo cách của bạn')}>
            {t('skills.guide.s3.a', 'Khi tạo/nhập, bạn tự ')}<b>{t('skills.guide.s3.setTag', 'đặt nhãn')}</b>{t('skills.guide.s3.b', ' cho skill (vd ')}<i>{t('skills.guide.s3.ex1', '“Báo cáo”')}</i>, <i>{t('skills.guide.s3.ex2', '“Lark”')}</i>, <i>{t('skills.guide.s3.ex3', '“Bảo mật”')}</i>{t('skills.guide.s3.c', ') — ')}<b>{t('skills.guide.s3.freeType', 'tự do gõ')}</b>{t('skills.guide.s3.d', ', không giới hạn danh sách. Nhãn chỉ để ')}<b>{t('skills.guide.s3.filterGroup', 'lọc & nhóm')}</b>{t('skills.guide.s3.e', ' cho dễ tìm; ')}<b>{t('skills.guide.s3.no', 'không')}</b>{t('skills.guide.s3.f', ' ảnh hưởng skill chạy ở đâu (cái đó do “áp dụng model” quyết định). Dùng hàng nhãn phía trên để lọc nhanh.')}
          </GuideSection>
          <GuideSection title={t('skills.guide.s4.title', 'Áp dụng cho model nào')}>
            {t('skills.guide.s4.a', 'Mỗi skill chọn được áp cho ')}<b>Claude / Grok / Gemini / Codex</b>{t('skills.guide.s4.b', ' — hoặc ')}<b>{t('skills.guide.s4.shared', '“tất cả model” (dùng chung)')}</b>{t('skills.guide.s4.c', '. Claude, Grok, Gemini cùng chuẩn (tự nạp từ ')}<Text code>~/.&lt;cli&gt;/skills</Text>{t('skills.guide.s4.d', '); Codex nhận qua khối ')}<Text code>AGENTS.md</Text>{t('skills.guide.s4.e', ' do Larkwave quản lý. ')}<b>{t('skills.guide.s4.clickCard', 'Bấm vào thẻ skill')}</b>{t('skills.guide.s4.f', ' để mở cửa sổ chỉnh — đổi model áp dụng & nhãn ở đó.')}
          </GuideSection>
          <GuideSection title={t('skills.guide.s5.title', 'Bật / tắt')}>
            {t('skills.guide.s5.a', 'Gạt ')}<b>{t('skills.guide.s5.toggle', 'công tắc')}</b>{t('skills.guide.s5.b', ' để bật skill → Larkwave đồng bộ vào các CLI đã chọn (không cần thao tác gì thêm). Tắt để ngừng dùng (skill vẫn còn trong danh sách).')}
          </GuideSection>
          <GuideSection title={t('skills.guide.s6.title', 'Cách dùng skill (QUAN TRỌNG)')}>
            <b>{t('skills.guide.s6.noRun', 'Không có nút “chạy”, KHÔNG gõ tên skill.')}</b>{t('skills.guide.s6.just', ' Chỉ cần:')}
            <ul style={{ margin: '4px 0 0', paddingLeft: 18, lineHeight: 1.7 }}>
              <li>{t('skills.guide.s6.li1a', 'Bật skill + chọn ')}<b>{t('skills.guide.s6.li1b', 'model có Claude')}</b>.</li>
              <li>{t('skills.guide.s6.li2a', 'Vào ')}<b>{t('skills.guide.s6.li2b', 'Lark × Agents hoặc Trợ lý AI')}</b>{t('skills.guide.s6.li2c', ' và gõ yêu cầu ')}<b>{t('skills.guide.s6.li2d', 'khớp mô tả skill')}</b>{t('skills.guide.s6.li2e', ' → AI tự gọi skill.')}</li>
              <li>{t('skills.guide.s6.li3a', 'Vd skill “chào các agent” → gõ ')}<i>{t('skills.guide.s6.li3b', '“chào các agent giúp tôi”')}</i>{t('skills.guide.s6.li3c', ' (đừng gõ chữ “test” hay tên skill).')}</li>
            </ul>
          </GuideSection>
          <GuideSection title={t('skills.guide.s7.title', 'Viết hướng dẫn tốt')}>
            <ul style={{ margin: '4px 0 0', paddingLeft: 18, lineHeight: 1.7 }}>
              <li>
                <b>{t('skills.guide.s7.li1a', 'DÒNG ĐẦU = câu KÍCH HOẠT')}</b>{t('skills.guide.s7.li1b', ' (nó trở thành “mô tả” của skill mà AI dựa vào để tự gọi). Hãy nói rõ ')}{' '}
                <b>{t('skills.guide.s7.li1c', 'KHI NÀO dùng')}</b>{t('skills.guide.s7.li1d', '. Vd dòng đầu: ')}<i>{t('skills.guide.s7.li1e', '“Dùng skill này mỗi khi người dùng muốn chào/giới thiệu các agent.”')}</i>{' '}
                {t('skills.guide.s7.li1f', 'Dòng đầu mờ nhạt = skill không bao giờ được kích hoạt.')}
              </li>
              <li>{t('skills.guide.s7.li2a', 'Nói rõ ')}<b>{t('skills.guide.s7.when', 'KHI NÀO')}</b>{t('skills.guide.s7.li2b', ' dùng và ')}<b>{t('skills.guide.s7.what', 'LÀM GÌ')}</b>{t('skills.guide.s7.li2c', ' (càng cụ thể càng chuẩn).')}</li>
              <li>{t('skills.guide.s7.li3', 'Ngắn gọn, dạng gạch đầu dòng hoặc quy trình từng bước.')}</li>
              <li>{t('skills.guide.s7.li4a', 'Ví dụ: ')}<i>{t('skills.guide.s7.li4b', '“Mọi báo cáo tuần: lấy số liệu từ Bitable Bán hàng, so với tuần trước, trình bày bảng + 3 nhận xét.”')}</i></li>
              <li>{t('skills.guide.s7.li5a', 'Ví dụ: ')}<i>{t('skills.guide.s7.li5b', '“Trước khi ghi vào Base: liệt kê thay đổi dự kiến và hỏi xác nhận.”')}</i></li>
            </ul>
          </GuideSection>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, color: OK, fontSize: 12.5 }}>
            <CheckCircleFilled /> {t('skills.guide.tip', 'Mẹo: bật vài skill “dùng chung” là mọi câu trả lời của AI sẽ tự theo chuẩn của bạn.')}
          </div>
        </div>
      </Modal>
    </div>
  );
}

function GuideSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 4 }}>{title}</div>
      <Text type="secondary" style={{ fontSize: 13, lineHeight: 1.65 }}>
        {children}
      </Text>
    </div>
  );
}
