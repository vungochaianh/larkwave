import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, cpSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { contractFieldsFrom, findOverlap, LEARNED_SKILL_GUARD, sanitizeLearnedSkill, serializeContract, slugifySkillCommand, uniqueSkillCommand } from '@larkwave/core';
import type { SkillContractFields, SkillLearnInfo, SkillLearnSettings, SkillProposal } from '@larkwave/core';
import type { SkillInfo } from '@larkwave/core';
import type { BuiltinSkill } from './builtinSkills';

interface SkillEntry {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  /** Runner ids this skill applies to. All four = "shared". */
  scope: string[];
  /** Free-form user labels (organizational only — does not affect sync). */
  tags?: string[];
  /** Slash-command shortcut WITHOUT the leading "/" (e.g. "sieu-ba"): typing "/sieu-ba" in a
   *  chat composer forces this skill for that turn. Absent/empty = no shortcut. */
  command?: string;
  source?: string;
  /** Kỹ năng DỰNG SẴN của Larkwave: phiên bản đang cài (ensureBuiltins). */
  builtin?: number;
  /** Kỹ năng do AI TỰ HỌC — nguồn gốc (huy hiệu "AI tự học"). */
  learned?: SkillLearnInfo;
  /** Cụm từ gọi (VI/EN) — câu lệnh khớp thì kỹ năng được nạp đủ thân. */
  triggers?: string[];
}

/** Runner ids that consume the SKILL.md "Agent Skills" standard via ~/.<cli>/skills. */
const FOLDER_RUNNERS = ['claude', 'grok', 'gemini'] as const;
const ALL_RUNNERS = ['claude', 'grok', 'gemini', 'codex'] as const;
/** ~/.<cli>/skills home dir per folder-runner. */
const RUNNER_HOME: Record<string, string> = { claude: '.claude', grok: '.grok', gemini: '.gemini' };

// Codex has no skills folder — it reads AGENTS.md. We own only a sentinel-delimited block,
// identified by BOTH the sentinels AND our exact header (so we never strip a user's content
// that happens to contain the sentinel strings).
const CODEX_START = '<!-- larkwave:skills:start (managed — do not edit) -->';
const CODEX_END = '<!-- larkwave:skills:end -->';
const CODEX_HEADER = '# Skills (Larkwave)';
// Bản Larkwave trước 10/2026 viết khối với dấu mốc của Toolswave (+ tiêu đề Larkwave). Vẫn gỡ
// được khối cũ đó; khối của app Toolswave (tiêu đề "# Skills (Toolswave)") thì KHÔNG đụng tới.
const LEGACY_CODEX_START = '<!-- toolswave:skills:start (managed — do not edit) -->';
const LEGACY_CODEX_END = '<!-- toolswave:skills:end -->';

/**
 * Tên thư mục kỹ năng Larkwave đặt vào thư mục khám phá của CLI (`~/.claude/skills/…`, grok,
 * gemini). Có tiền tố riêng vì app Toolswave cùng máy quản lý `~/.claude/skills/<id>` với CÙNG
 * id (kỹ năng được nhập từ Toolswave): không tách tên thì tắt/xoá một kỹ năng ở Larkwave sẽ xoá
 * mất bản của Toolswave. Larkwave chỉ tạo/xoá thư mục có tiền tố này.
 */
export const LARKWAVE_SKILL_PREFIX = 'larkwave-';
export function runnerSkillFolder(id: string): string {
  return `${LARKWAVE_SKILL_PREFIX}${id}`;
}

/**
 * Manages user "skills" — SKILL.md folders, applied PER MODEL/CLI.
 *
 * Source of truth: `${userData}/skills/lib/<id>/` (the canonical skill folder) + a
 * `registry.json` tracking `{ enabled, scope }`. On every change we `sync()`: each skill
 * is copied into the discovery dir of every runner in its `scope` (when enabled) —
 * `~/.claude/skills`, `~/.grok/skills`, `~/.gemini/skills` — and Codex-scoped skills are
 * merged into a managed block of `~/.codex/AGENTS.md` (Codex has no skills folder). We only
 * ever touch ids WE manage, so hand-added skills in those dirs are left alone.
 */

/**
 * Dựng khối frontmatter, GIỮ NGUYÊN hợp đồng kỹ năng (needs/produces/checks/target).
 *
 * Vì sao phải có hàm này: `create()` và `update()` trước đây mỗi chỗ tự ghép chuỗi frontmatter từ
 * đúng ba trường name/description/command. Hệ quả là người dùng gõ tay `needs:`/`produces:` vào
 * SKILL.md, rồi chỉ cần ĐỔI TÊN kỹ năng là toàn bộ hợp đồng bị xoá sạch — không lỗi, không cảnh
 * báo, chỉ là lần chạy sau bộ kỹ năng thôi kiểm chéo nhau.
 *
 * Nay một chỗ duy nhất dựng frontmatter, và nó luôn mang hợp đồng theo.
 */
function buildFrontmatter(
  id: string,
  description: string,
  command: string | undefined,
  contract?: SkillContractFields,
  triggers?: string[],
): string {
  const lines = [`name: ${id}`, `description: ${description}`];
  if (command) lines.push(`command: ${command}`);
  // Cụm từ gọi — một dòng, ngăn bởi " | " (không phải YAML đầy đủ; bộ đọc ở parseSkillMd).
  if (triggers?.length) lines.push(`triggers: ${triggers.map((t) => t.replace(/[|\n]/g, ' ').trim()).filter(Boolean).join(' | ')}`);
  // Phần hợp đồng do CORE ghi, cạnh chính bộ đọc nó — xem `serializeContract`. Chép lại luật ghi
  // ở đây là mở đường cho hai nửa của một định dạng trôi lệch nhau trong im lặng.
  lines.push(...serializeContract(contract));
  return `---\n${lines.join('\n')}\n---`;
}


export class SkillHost {
  private readonly stateDir: string; // userData/skills — registry + lib
  private readonly libDir: string; // userData/skills/lib — canonical skill folders
  private readonly legacyDisabledDir: string; // userData/skills/disabled — pre-1.0.25 staging

  constructor(baseDir: string) {
    this.stateDir = join(baseDir, 'skills');
    this.libDir = join(this.stateDir, 'lib');
    this.legacyDisabledDir = join(this.stateDir, 'disabled');
    for (const d of [this.stateDir, this.libDir]) mkdirSync(d, { recursive: true });
    this.migrate();
  }

  private registryPath() {
    return join(this.stateDir, 'registry.json');
  }

  /** Đọc lại registry/lib từ đĩa (sau khi nhập kỹ năng từ Toolswave) và đặt bản sao có tiền tố
   *  `larkwave-` vào thư mục của từng CLI. */
  resync(): SkillInfo[] {
    this.migrate();
    this.sync();
    return this.list();
  }
  /**
   * BẢN LƯU: chụp lại SKILL.md trước MỌI thay đổi, để lùi lại được.
   *
   * Vì sao bắt buộc phải có trước khi cho AI sửa kỹ năng: một lượt agent viết lại cả bộ có thể hỏng
   * theo cách người dùng không phát hiện ra ngay — đổi tên khoá làm đứt dây nối, sửa ràng buộc
   * thành thứ luôn đúng. Không có chỗ lùi thì không ai dám bấm nút đó, và nút không ai dám bấm thì
   * làm ra để làm gì.
   *
   * Chụp CẢ NỘI DUNG chứ không chỉ ghi "đã đổi X": mục đích là khôi phục, mà muốn khôi phục thì
   * phải có thứ để khôi phục.
   */
  private snapshotPath(): string {
    return join(this.stateDir, 'snapshots.json');
  }

  private readSnapshots(): Record<string, { at: string; by: 'you' | 'ai'; what: string; md: string }[]> {
    try {
      const j = JSON.parse(readFileSync(this.snapshotPath(), 'utf8')) as Record<
        string,
        { at: string; by: 'you' | 'ai'; what: string; md: string }[]
      >;
      return j && typeof j === 'object' ? j : {};
    } catch {
      return {};
    }
  }

  /** Chụp trạng thái HIỆN TẠI của một kỹ năng. Gọi TRƯỚC khi ghi đè. Giữ 15 bản mỗi kỹ năng. */
  snapshot(id: string, by: 'you' | 'ai', what: string): void {
    try {
      const md = readFileSync(join(this.libPath(id), 'SKILL.md'), 'utf8');
      const all = this.readSnapshots();
      all[id] = [{ at: new Date().toISOString(), by, what, md }, ...(all[id] ?? [])].slice(0, 15);
      writeFileSync(this.snapshotPath(), JSON.stringify(all));
    } catch {
      // Kỹ năng mới chưa có tệp, hoặc đĩa lỗi. Bản lưu là lưới an toàn — hỏng nó KHÔNG được làm
      // hỏng chính thao tác người dùng đang làm.
    }
  }

  /** Các bản lưu của một kỹ năng, mới nhất ở đầu. Không trả `md` (nặng, giao diện không cần). */
  snapshots(id: string): { at: string; by: 'you' | 'ai'; what: string }[] {
    return (this.readSnapshots()[id] ?? []).map(({ at, by, what }) => ({ at, by, what }));
  }

  /** Khôi phục một bản lưu. Chụp lại bản HIỆN TẠI trước, để lùi nhầm vẫn tiến lại được. */
  restore(id: string, at: string): SkillInfo[] {
    const list = this.readSnapshots()[id] ?? [];
    const hit = list.find((x) => x.at === at);
    if (!hit) throw new Error('Không tìm thấy bản lưu này.');
    this.snapshot(id, 'you', 'Trước khi khôi phục');
    writeFileSync(join(this.libPath(id), 'SKILL.md'), hit.md);
    // Sổ đăng ký giữ description riêng — đồng bộ lại, nếu không thẻ ngoài danh sách nói một đằng
    // còn tệp nói một nẻo.
    const reg = this.readRegistry();
    const e = reg.find((x) => x.id === id);
    if (e) {
      const d = deriveDescription(skillInstructions(hit.md));
      if (d) e.description = d;
      const tr = parseSkillMd(hit.md).triggers;
      e.triggers = tr.length ? tr : undefined;
      this.writeRegistry(reg);
    }
    this.sync();
    return this.list();
  }

  /** Nội dung một bản lưu + bản hiện tại (màn "Lịch sử phiên bản" tự tính khác biệt). */
  versionText(id: string, at: string): { before: string; current: string } {
    const hit = (this.readSnapshots()[id] ?? []).find((x) => x.at === at);
    if (!hit) throw new Error('Không tìm thấy bản lưu này.');
    let current = '';
    try {
      current = readFileSync(join(this.libPath(id), 'SKILL.md'), 'utf8');
    } catch {
      current = '';
    }
    return { before: hit.md, current };
  }

  /**
   * Đổi THỨ TỰ các kỹ năng trong sổ đăng ký.
   *
   * Vì sao thứ tự trong sổ lại có ý nghĩa: khi nhiều kỹ năng cùng đủ điều kiện chạy, vòng lặp lấy
   * `ready[0]` — tức là cái đứng trước trong sổ. Nó KHÔNG đổi kết quả (hai kỹ năng cùng sẵn sàng
   * thì theo định nghĩa không dùng khoá của nhau), nhưng đổi thứ tự người dùng NHÌN THẤY khi chạy.
   *
   * `ids` là thứ tự mong muốn của một NHÓM kỹ năng; các kỹ năng khác giữ nguyên chỗ. Làm vậy để
   * sắp lại một bộ không xáo trộn phần còn lại của thư viện.
   */
  reorder(ids: string[]): SkillInfo[] {
    const reg = this.readRegistry();
    const want = ids.filter((id) => reg.some((e) => e.id === id));
    if (want.length < 2) return this.list();
    // Các vị trí mà nhóm này đang chiếm — đổ lại đúng những chỗ đó theo thứ tự mới.
    const slots = reg.map((e, i) => (want.includes(e.id) ? i : -1)).filter((i) => i >= 0);
    const byId = new Map(reg.map((e) => [e.id, e]));
    slots.forEach((slot, k) => {
      const e = byId.get(want[k]);
      if (e) reg[slot] = e;
    });
    this.writeRegistry(reg);
    this.sync();
    return this.list();
  }

  private libPath(id: string) {
    return join(this.libDir, id);
  }
  private runnerSkillPath(runner: string, id: string) {
    return join(homedir(), RUNNER_HOME[runner], 'skills', runnerSkillFolder(id));
  }
  private readRegistry(): SkillEntry[] {
    try {
      const a = JSON.parse(readFileSync(this.registryPath(), 'utf8'));
      return Array.isArray(a) ? a.map((e) => ({ ...e, scope: normScope(e.scope) })) : [];
    } catch {
      return [];
    }
  }
  private writeRegistry(e: SkillEntry[]): void {
    writeFileSync(this.registryPath(), JSON.stringify(e, null, 2));
  }
  private upsert(entry: SkillEntry): void {
    this.writeRegistry([...this.readRegistry().filter((e) => e.id !== entry.id), entry]);
  }

  /** A registry-unique id: `base`, else base-2, base-3… — so two skills whose names slug to
   *  the same id never clobber each other (silent data loss). */
  private uniqueId(base: string): string {
    const ids = new Set(this.readRegistry().map((e) => e.id));
    const taken = (x: string) => ids.has(x) || existsSync(this.libPath(x));
    if (!taken(base)) return base;
    for (let n = 2; n < 1000; n++) if (!taken(`${base}-${n}`)) return `${base}-${n}`;
    return `${base}-${Date.now().toString(36)}`;
  }

  /** Sanitize a requested slash-command into a registry-unique slug. `exceptId` = the skill being
   *  edited, whose OWN command must not count as taken (else every save would bump it to -2).
   *  Returns '' when the user wants no shortcut (or typed nothing usable). */
  private resolveCommand(raw: string | undefined, exceptId?: string): string {
    const want = slugifySkillCommand(raw || '');
    if (!want) return '';
    const taken = this.readRegistry()
      .filter((e) => e.id !== exceptId)
      .map((e) => e.command || '')
      .filter(Boolean);
    return uniqueSkillCommand(want, taken);
  }

  list(): SkillInfo[] {
    return this.readRegistry().map((e) => ({
      id: e.id,
      name: e.name,
      description: e.description,
      enabled: e.enabled,
      scope: e.scope,
      tags: normTags(e.tags),
      command: e.command || undefined,
      source: e.source,
      ...(e.builtin ? { builtin: e.builtin } : {}),
      ...(e.builtin && this.builtinState().pending[e.id] ? { builtinUpdate: this.builtinState().pending[e.id] } : {}),
      ...(e.learned ? { learned: e.learned } : {}),
      ...(e.triggers?.length ? { triggers: e.triggers } : {}),
      // Hợp đồng nằm trong SKILL.md chứ không trong sổ đăng ký — đọc ở đây để danh sách hiện được
      // huy hiệu "có hợp đồng" và cảnh báo trùng khoá TRƯỚC khi người dùng bấm Chạy. Một lần đọc
      // file mỗi kỹ năng; danh sách chỉ vài chục mục nên không đáng để dựng thêm lớp đệm.
      ...(this.contractOf(e.id) ? { contract: this.contractOf(e.id) } : {}),
    }));
  }

  /** Hợp đồng của một kỹ năng, hoặc `undefined` nếu SKILL.md không khai / không đọc được. */
  private contractOf(id: string): SkillContractFields | undefined {
    try {
      return contractFieldsFrom(readFileSync(join(this.libPath(id), 'SKILL.md'), 'utf8'));
    } catch {
      return undefined;
    }
  }

  /** Import a skill FOLDER (must contain SKILL.md). Copies it into the library, enabled. */
  import(srcDir: string, scope?: string[], tags?: string[]): SkillInfo[] {
    if (!existsSync(srcDir) || !statSync(srcDir).isDirectory())
      throw new Error('Hãy chọn một THƯ MỤC skill (chứa file SKILL.md).');
    const md = join(srcDir, 'SKILL.md');
    if (!existsSync(md)) throw new Error('Thư mục không có SKILL.md — đây không phải skill hợp lệ.');
    const meta = parseSkillMd(readFileSync(md, 'utf8'));
    const id = this.uniqueId(slug(meta.name) || slug(basename(srcDir)) || `skill-${Date.now().toString(36)}`);
    rmSync(this.libPath(id), { recursive: true, force: true });
    cpSync(srcDir, this.libPath(id), { recursive: true });
    // The folder's own shortcut may be re-slugged or de-duplicated on the way in — write the value
    // we actually registered back into the copied SKILL.md, so the file and the registry agree
    // (the copy is what gets fanned out to every runner's skills dir, and re-exported later).
    const importedCommand = this.resolveCommand(meta.command);
    if (importedCommand !== (meta.command || '')) {
      try {
        const copied = join(this.libPath(id), 'SKILL.md');
        const text = readFileSync(copied, 'utf8');
        writeFileSync(copied, setFrontmatterCommand(text, importedCommand));
      } catch {
        /* best-effort — the registry is the source of truth either way */
      }
    }
    this.upsert({
      id,
      name: meta.name || id,
      description: meta.description,
      enabled: true,
      scope: scope?.length ? normScope(scope) : [...ALL_RUNNERS],
      tags: normTags(tags),
      // A folder exported from another machine carries its shortcut in the frontmatter — keep it
      // (re-slugged + de-duplicated against what this registry already hands out).
      command: importedCommand || undefined,
      source: srcDir,
      ...(meta.triggers.length ? { triggers: meta.triggers } : {}),
    });
    this.sync();
    return this.list();
  }

  /** Author a skill from a name + instructions (the "train"/create flow) → a SKILL.md folder.
   *  `command` = the optional "/slash" shortcut; empty/undefined means the skill has none. */
  create(
    name: string,
    instructions: string,
    scope?: string[],
    tags?: string[],
    command?: string,
    contract?: SkillContractFields,
  ): SkillInfo[] {
    const clean = (name || '').trim();
    if (!clean) throw new Error('Cần tên skill.');
    if (!(instructions || '').trim()) throw new Error('Cần nội dung hướng dẫn cho skill.');
    const id = this.uniqueId(slug(clean) || `skill-${Date.now().toString(36)}`);
    const description = instructions.trim().split('\n')[0].replace(/\s+/g, ' ').slice(0, 120) || clean;
    const cmd = this.resolveCommand(command);
    const front = `${buildFrontmatter(id, description, cmd || undefined, contract)}\n\n# ${clean}\n\n${instructions.trim()}\n`;
    rmSync(this.libPath(id), { recursive: true, force: true }); // unique → no-op, but avoids any stale files
    mkdirSync(this.libPath(id), { recursive: true });
    writeFileSync(join(this.libPath(id), 'SKILL.md'), front);
    this.upsert({
      id,
      name: clean,
      description,
      enabled: true,
      scope: scope?.length ? normScope(scope) : [...ALL_RUNNERS],
      tags: normTags(tags),
      command: cmd || undefined,
    });
    this.sync();
    return this.list();
  }

  // ── Kỹ năng DỰNG SẴN (bộ "Larkwave · Tệp & dữ liệu") ─────────────────────────────────────────

  private builtinStatePath(): string {
    return join(this.stateDir, 'builtins.json');
  }
  /** installed: phiên bản + băm SKILL.md lúc cài; removed: người dùng đã xoá (không cài lại); pending: có bản mới nhưng người dùng đã sửa. */
  private builtinState(): { installed: Record<string, { version: number; hash: string }>; removed: string[]; pending: Record<string, number> } {
    try {
      const j = JSON.parse(readFileSync(this.builtinStatePath(), 'utf8'));
      return { installed: j?.installed ?? {}, removed: Array.isArray(j?.removed) ? j.removed : [], pending: j?.pending ?? {} };
    } catch {
      return { installed: {}, removed: [], pending: {} };
    }
  }
  private writeBuiltinState(st: { installed: Record<string, { version: number; hash: string }>; removed: string[]; pending: Record<string, number> }): void {
    writeFileSync(this.builtinStatePath(), JSON.stringify(st, null, 2));
  }

  /**
   * Cài / cập nhật kỹ năng dựng sẵn. Idempotent; CHỈ đụng id trong danh sách dựng sẵn:
   *  - chưa có → cài (bật, dùng chung mọi model, nhãn "Larkwave · Tệp & dữ liệu");
   *  - người dùng đã xoá → không cài lại;
   *  - có bản mới mà bản đang dùng CHƯA bị sửa (băm khớp lúc cài) → chụp bản lưu rồi lên bản mới;
   *  - đã bị sửa → giữ nguyên bản của người dùng, chỉ ghi "có bản mới" (pending);
   *  - trùng id với một kỹ năng KHÔNG phải dựng sẵn (vd nhập từ Toolswave) → không đụng.
   */
  ensureBuiltins(defs: readonly BuiltinSkill[]): { installed: string[]; updated: string[]; kept: string[] } {
    const st = this.builtinState();
    const reg = this.readRegistry();
    const out = { installed: [] as string[], updated: [] as string[], kept: [] as string[] };
    let changed = false;
    for (const d of defs) {
      if (st.removed.includes(d.id)) continue;
      const e = reg.find((x) => x.id === d.id);
      if (e && !e.builtin) {
        out.kept.push(d.id);
        continue;
      }
      const md = (cmd: string | undefined) => `${buildFrontmatter(d.id, d.description, cmd, d.contract, d.triggers)}\n\n# ${d.name}\n\n${d.body.trim()}\n`;
      if (!e) {
        const cmd = this.resolveCommand(d.command) || undefined;
        const text = md(cmd);
        mkdirSync(this.libPath(d.id), { recursive: true });
        writeFileSync(join(this.libPath(d.id), 'SKILL.md'), text);
        reg.push({ id: d.id, name: d.name, description: d.description, enabled: true, scope: [...ALL_RUNNERS], tags: [...BUILTIN_TAG_LIST], command: cmd, source: 'larkwave-builtin', builtin: d.version, triggers: normTriggers(d.triggers) });
        st.installed[d.id] = { version: d.version, hash: sha(text) };
        out.installed.push(d.id);
        changed = true;
        continue;
      }
      const cur = st.installed[d.id];
      if (cur && cur.version >= d.version) continue;
      let now = '';
      try {
        now = readFileSync(join(this.libPath(d.id), 'SKILL.md'), 'utf8');
      } catch {
        now = '';
      }
      if (cur && now && sha(now) !== cur.hash) {
        // Người dùng đã sửa bản đang dùng — không ghi đè; báo có bản mới.
        if (st.pending[d.id] !== d.version) {
          st.pending[d.id] = d.version;
          changed = true;
        }
        out.kept.push(d.id);
        continue;
      }
      this.snapshot(d.id, 'ai', `Cập nhật kỹ năng dựng sẵn lên phiên bản ${d.version}`);
      const text = md(e.command);
      mkdirSync(this.libPath(d.id), { recursive: true });
      writeFileSync(join(this.libPath(d.id), 'SKILL.md'), text);
      e.name = d.name;
      e.description = d.description;
      e.builtin = d.version;
      e.triggers = normTriggers(d.triggers);
      st.installed[d.id] = { version: d.version, hash: sha(text) };
      delete st.pending[d.id];
      out.updated.push(d.id);
      changed = true;
    }
    if (changed) {
      this.writeRegistry(reg);
      this.writeBuiltinState(st);
      this.sync();
    }
    return out;
  }

  /** Cài lại các kỹ năng dựng sẵn người dùng đã xoá. */
  restoreBuiltins(defs: readonly BuiltinSkill[]): SkillInfo[] {
    const st = this.builtinState();
    st.removed = [];
    this.writeBuiltinState(st);
    this.ensureBuiltins(defs);
    return this.list();
  }

  // ── TỰ HỌC kỹ năng ─────────────────────────────────────────────────────────────────────────────

  private learnPath(): string {
    return join(this.stateDir, 'learned.json');
  }
  private learnSettingsPath(): string {
    return join(this.stateDir, 'learn-settings.json');
  }
  /** Cài đặt "Tự học kỹ năng" (mặc định: bật; KHÔNG hỏi trước với lời dạy trực tiếp). */
  getLearnSettings(): SkillLearnSettings {
    try {
      const j = JSON.parse(readFileSync(this.learnSettingsPath(), 'utf8'));
      return { enabled: j?.enabled !== false, askFirst: j?.askFirst === true };
    } catch {
      return { enabled: true, askFirst: false };
    }
  }
  setLearnSettings(patch: Partial<SkillLearnSettings>): SkillLearnSettings {
    const next = { ...this.getLearnSettings(), ...(typeof patch?.enabled === 'boolean' ? { enabled: patch.enabled } : {}), ...(typeof patch?.askFirst === 'boolean' ? { askFirst: patch.askFirst } : {}) };
    writeFileSync(this.learnSettingsPath(), JSON.stringify(next, null, 2));
    return next;
  }
  /** Nhật ký học: mỗi lần AI tạo/cập nhật một kỹ năng (để "Hoàn tác" đúng lần đó) + thùng rác của lần tạo bị hoàn tác. */
  private readLearnLog(): { log: { id: string; at: string; action: 'create' | 'update'; origin: string; reason?: string; prevAt?: string; undone?: boolean }[]; trash: Record<string, { entry: SkillEntry; md: string; at: string }> } {
    try {
      const j = JSON.parse(readFileSync(this.learnPath(), 'utf8'));
      return { log: Array.isArray(j?.log) ? j.log : [], trash: j?.trash && typeof j.trash === 'object' ? j.trash : {} };
    } catch {
      return { log: [], trash: {} };
    }
  }
  private writeLearnLog(d: ReturnType<SkillHost['readLearnLog']>): void {
    d.log = d.log.slice(-200);
    const keys = Object.keys(d.trash);
    if (keys.length > 50) for (const k of keys.sort((a, b) => d.trash[a].at.localeCompare(d.trash[b].at)).slice(0, keys.length - 50)) delete d.trash[k];
    writeFileSync(this.learnPath(), JSON.stringify(d, null, 2));
  }

  /**
   * Lưu một kỹ năng TỰ HỌC. Kỹ năng chỉ là chữ hướng dẫn: gỡ bí mật + câu cấp quyền (sanitizeLearnedSkill),
   * thêm dòng nhắc "không cấp quyền gì". Trùng ý với kỹ năng đã có (hoặc chỉ định `updateId`) → CẬP NHẬT
   * (mặc định nối thêm mục "Bổ sung"; `mode:'replace'` thay thân) thay vì đẻ bản sao. Kỹ năng DỰNG SẴN
   * không bao giờ bị sửa — tạo kỹ năng bổ sung riêng. Mọi thay đổi có bản lưu → "Hoàn tác" được.
   */
  saveLearned(input: {
    name: string;
    instructions: string;
    triggers?: string[];
    origin: SkillLearnInfo['origin'];
    reason?: string;
    updateId?: string;
    mode?: 'merge' | 'replace';
  }): { action: 'create' | 'update'; id: string; name: string; removedSecrets: string[]; removedGrants: string[]; supplementOf?: string } {
    const clean = sanitizeLearnedSkill(input);
    if (!clean.ok) throw new Error(clean.error || 'Kỹ năng không hợp lệ.');
    const now = new Date().toISOString();
    const reason = String(input.reason || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    const why = `AI tự học (${input.origin === 'explicit' ? 'bạn dạy' : input.origin === 'correction' ? 'bạn sửa' : input.origin === 'experience' ? 'từ việc đã làm' : 'học từ Base'})${reason ? `: ${reason}` : ''}`;
    const all = this.list();
    const desc0 = clean.instructions.split('\n').find((l) => l.trim()) || '';
    let target = input.updateId ? all.find((x) => x.id === input.updateId) : undefined;
    if (!target) target = findOverlap({ name: clean.name, triggers: clean.triggers, description: desc0 }, all, 0.5)?.skill;
    const log = this.readLearnLog();
    let supplementOf: string | undefined;
    let body = clean.instructions;
    if (target?.builtin) {
      // Không sửa kỹ năng dựng sẵn: tạo kỹ năng BỔ SUNG, nói rõ áp dụng cùng.
      supplementOf = target.name;
      body = `Áp dụng CÙNG với kỹ năng dựng sẵn «${target.name}» (id ${target.id}) — phần dưới đây là quy tắc riêng của người dùng, ưu tiên hơn khi khác:\n\n${body}`;
      target = undefined;
    }
    if (!body.includes(LEARNED_SKILL_GUARD)) body = `${body}\n\n${LEARNED_SKILL_GUARD}`;
    if (target) {
      const cur = this.read(target.id);
      const merged =
        input.mode === 'replace'
          ? body
          : `${cur.instructions.replace(`\n\n${LEARNED_SKILL_GUARD}`, '').trim()}\n\n## Bổ sung (${now.slice(0, 10)} — ${why})\n${body.replace(`\n\n${LEARNED_SKILL_GUARD}`, '').trim()}\n\n${LEARNED_SKILL_GUARD}`;
      const triggers = [...new Set([...(target.triggers ?? []), ...clean.triggers])];
      this.update(target.id, { instructions: merged, triggers, by: 'ai', why });
      const prevAt = this.snapshots(target.id)[0]?.at;
      log.log.push({ id: target.id, at: now, action: 'update', origin: input.origin, ...(reason ? { reason } : {}), ...(prevAt ? { prevAt } : {}) });
      this.writeLearnLog(log);
      return { action: 'update', id: target.id, name: target.name, removedSecrets: clean.removedSecrets, removedGrants: clean.removedGrants };
    }
    const before = new Set(all.map((x) => x.id));
    const after = this.create(clean.name, body, undefined, ['AI tự học'], undefined, undefined);
    const made = after.find((x) => !before.has(x.id));
    if (!made) throw new Error('Không tạo được kỹ năng.');
    const reg = this.readRegistry();
    const e = reg.find((x) => x.id === made.id);
    if (e) {
      e.learned = { origin: input.origin, at: now, ...(reason ? { reason } : {}) };
      e.triggers = normTriggers(clean.triggers);
      this.writeRegistry(reg);
      // Ghi lại SKILL.md để frontmatter có `triggers:` (CLI đọc mô tả + từ khoá).
      const instr = skillInstructions(readFileSync(join(this.libPath(made.id), 'SKILL.md'), 'utf8'));
      writeFileSync(join(this.libPath(made.id), 'SKILL.md'), `${buildFrontmatter(made.id, e.description, e.command, undefined, e.triggers)}\n\n# ${e.name}\n\n${instr}\n`);
      this.sync();
    }
    log.log.push({ id: made.id, at: now, action: 'create', origin: input.origin, ...(reason ? { reason } : {}) });
    this.writeLearnLog(log);
    return { action: 'create', id: made.id, name: made.name, removedSecrets: clean.removedSecrets, removedGrants: clean.removedGrants, ...(supplementOf ? { supplementOf } : {}) };
  }

  /**
   * Quyết định của `skill_save`: lời dạy trực tiếp / lời sửa → LƯU NGAY (trừ khi bật "Hỏi trước khi lưu");
   * rút từ kinh nghiệm / học từ Base → luôn là ĐỀ XUẤT (thẻ "Lưu kỹ năng"). Tắt "Tự học" → không lưu.
   */
  learnOrPropose(input: {
    name: string;
    instructions: string;
    triggers?: string[];
    origin: SkillLearnInfo['origin'];
    reason?: string;
    updateId?: string;
    mode?: 'merge' | 'replace';
  }):
    | { mode: 'saved'; id: string; name: string; action: 'create' | 'update'; supplementOf?: string; removedSecrets: string[]; removedGrants: string[] }
    | { mode: 'proposal'; proposal: SkillProposal; removedSecrets: string[]; removedGrants: string[] }
    | { mode: 'disabled' } {
    const st = this.getLearnSettings();
    if (!st.enabled) return { mode: 'disabled' };
    const proposalOnly = input.origin === 'experience' || input.origin === 'base' || st.askFirst;
    if (!proposalOnly) return { mode: 'saved', ...this.saveLearned(input) };
    const clean = sanitizeLearnedSkill(input);
    if (!clean.ok) throw new Error(clean.error || 'Kỹ năng không hợp lệ.');
    const all = this.list();
    const desc = clean.instructions.split('\n').find((l) => l.trim()) || '';
    const hit = input.updateId ? all.find((x) => x.id === input.updateId) : findOverlap({ name: clean.name, triggers: clean.triggers, description: desc }, all, 0.5)?.skill;
    const upd = hit && !hit.builtin ? hit : undefined;
    return {
      mode: 'proposal',
      proposal: {
        id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
        name: clean.name,
        triggers: clean.triggers,
        instructions: clean.instructions,
        origin: input.origin,
        ...(input.reason ? { reason: String(input.reason).slice(0, 200) } : {}),
        ...(upd ? { updateId: upd.id, updateName: upd.name } : {}),
      },
      removedSecrets: clean.removedSecrets,
      removedGrants: clean.removedGrants,
    };
  }

  /**
   * "Hoàn tác" lần học GẦN NHẤT của một kỹ năng: lần TẠO → gỡ kỹ năng (cất vào thùng rác, khôi phục được);
   * lần CẬP NHẬT → về đúng bản trước lần học đó.
   */
  undoLearn(id: string): { undone: 'create' | 'update'; id: string } {
    const d = this.readLearnLog();
    const last = [...d.log].reverse().find((x) => x.id === id && !x.undone);
    if (!last) throw new Error('Không có lần tự học nào để hoàn tác cho kỹ năng này.');
    if (last.action === 'create') {
      const entry = this.readRegistry().find((x) => x.id === id);
      let md = '';
      try {
        md = readFileSync(join(this.libPath(id), 'SKILL.md'), 'utf8');
      } catch {
        md = '';
      }
      if (entry) d.trash[id] = { entry, md, at: new Date().toISOString() };
      this.delete(id);
    } else {
      if (!last.prevAt) throw new Error('Thiếu bản lưu trước lần học — không hoàn tác được.');
      this.restore(id, last.prevAt);
    }
    last.undone = true;
    this.writeLearnLog(d);
    return { undone: last.action, id };
  }

  /** Lấy lại một kỹ năng tự học đã bị "Hoàn tác" lần tạo. */
  restoreLearned(id: string): SkillInfo[] {
    const d = this.readLearnLog();
    const t = d.trash[id];
    if (!t) throw new Error('Không còn bản của kỹ năng này trong thùng rác.');
    if (this.readRegistry().some((x) => x.id === id)) throw new Error('Đã có kỹ năng cùng id.');
    mkdirSync(this.libPath(id), { recursive: true });
    writeFileSync(join(this.libPath(id), 'SKILL.md'), t.md);
    this.writeRegistry([...this.readRegistry(), t.entry]);
    delete d.trash[id];
    this.writeLearnLog(d);
    this.sync();
    return this.list();
  }

  setEnabled(id: string, enabled: boolean): SkillInfo[] {
    const reg = this.readRegistry();
    const e = reg.find((x) => x.id === id);
    if (!e) return this.list();
    e.enabled = enabled;
    this.writeRegistry(reg);
    this.sync();
    return this.list();
  }

  /** Change which runners a skill applies to, then re-sync every runner's skill dir. */
  setScope(id: string, scope: string[]): SkillInfo[] {
    const reg = this.readRegistry();
    const e = reg.find((x) => x.id === id);
    if (!e) return this.list();
    // A skill must target ≥1 model; an empty selection falls back to "all" (use the
    // enable toggle to turn it off). This keeps scope deterministic across restarts.
    const ns = normScope(scope);
    e.scope = ns.length ? ns : [...ALL_RUNNERS];
    this.writeRegistry(reg);
    this.sync();
    return this.list();
  }

  /** Set a skill's free-form labels (tags). Organizational only — no re-sync needed. */
  setTags(id: string, tags: string[]): SkillInfo[] {
    const reg = this.readRegistry();
    const e = reg.find((x) => x.id === id);
    if (!e) return this.list();
    e.tags = normTags(tags);
    this.writeRegistry(reg);
    return this.list();
  }

  /** Read a skill's EDITABLE instruction body (the SKILL.md markdown after the frontmatter),
   *  so the UI can show + edit the actual content — not just its one-line description. */
  read(id: string): {
    id: string;
    name: string;
    instructions: string;
    command?: string;
    contract?: SkillContractFields;
  } {
    const e = this.readRegistry().find((x) => x.id === id);
    if (!e) throw new Error('Không tìm thấy skill.');
    let instructions = '';
    try {
      // Strip the frontmatter AND the auto-generated "# <title>" heading so the editor shows the
      // PURE instructions (the title is edited via the separate name field). update() re-adds the
      // heading, so this round-trips without ever duplicating it.
      instructions = skillInstructions(readFileSync(join(this.libPath(id), 'SKILL.md'), 'utf8'));
    } catch {
      instructions = '';
    }
    return {
      id,
      name: e.name,
      instructions,
      command: e.command || undefined,
      ...(this.contractOf(id) ? { contract: this.contractOf(id) } : {}),
    };
  }

  /** Update a skill IN PLACE — name / instruction body / scope / tags / command — then re-sync.
   *  Rewrites the canonical SKILL.md (keeping the id-based frontmatter that create() uses) so edits
   *  reach every runner's synced copy. Only the provided fields change; `command: ''` CLEARS the
   *  shortcut (an absent `command` leaves it alone). */
  update(
    id: string,
    patch: {
      name?: string;
      instructions?: string;
      scope?: string[];
      tags?: string[];
      command?: string;
      contract?: SkillContractFields;
      /** Ai sửa — chỉ dùng để ghi vào bản lưu, giúp người dùng biết lùi về đâu. */
      by?: 'you' | 'ai';
      /** Cụm từ gọi mới (thay toàn bộ). */
      triggers?: string[];
      /** Ghi chú cho bản lưu (vì sao đổi) — thay câu "Đổi …" mặc định. */
      why?: string;
    },
  ): SkillInfo[] {
    const reg = this.readRegistry();
    const e = reg.find((x) => x.id === id);
    if (!e) return this.list();
    if (patch.name !== undefined) {
      const n = patch.name.trim();
      if (n) e.name = n;
    }
    if (patch.scope !== undefined) {
      const ns = normScope(patch.scope);
      e.scope = ns.length ? ns : [...ALL_RUNNERS];
    }
    if (patch.tags !== undefined) e.tags = normTags(patch.tags);
    if (patch.command !== undefined) e.command = this.resolveCommand(patch.command, id) || undefined;
    const triggersChanged = patch.triggers !== undefined;
    if (triggersChanged) e.triggers = normTriggers(patch.triggers);

    // Rewrite SKILL.md when the body changed, OR when only the name/command changed (keep the
    // # title + frontmatter in sync — the frontmatter is what an exported folder carries to
    // another machine). `instr` is ALWAYS the pure body WITHOUT the auto heading — we add
    // exactly one "# <name>" back, so headings never accumulate across edits.
    const nameChanged = patch.name !== undefined;
    if (patch.instructions !== undefined || nameChanged || patch.command !== undefined || patch.contract !== undefined || triggersChanged) {
      // Chụp TRƯỚC khi ghi đè — sau khi ghi thì không còn gì để chụp.
      const changed = [
        patch.name !== undefined ? 'tên' : '',
        patch.instructions !== undefined ? 'nội dung' : '',
        patch.command !== undefined ? 'lệnh gọi' : '',
        patch.contract !== undefined ? 'hợp đồng' : '',
        triggersChanged ? 'từ khoá gọi' : '',
      ].filter(Boolean);
      this.snapshot(id, patch.by ?? 'you', patch.why || `Đổi ${changed.join(', ')}`);
      let instr: string;
      if (patch.instructions !== undefined) {
        instr = patch.instructions.trim();
        if (!instr) throw new Error('Nội dung hướng dẫn không được rỗng.');
      } else {
        // name/command-only change → re-read the CURRENT pure instructions (heading stripped) so
        // the rewrite only refreshes the frontmatter + title.
        try {
          instr = skillInstructions(readFileSync(join(this.libPath(id), 'SKILL.md'), 'utf8'));
        } catch {
          instr = e.description;
        }
      }
      e.description = deriveDescription(instr) || e.name;
      // Hợp đồng: lấy cái người dùng vừa sửa, nếu không thì ĐỌC LẠI từ file cũ. Không làm bước
      // đọc lại này thì mỗi lần đổi tên là mất sạch needs/produces/checks — im lặng.
      let keep = patch.contract;
      if (keep === undefined) {
        try {
          keep = contractFieldsFrom(readFileSync(join(this.libPath(id), 'SKILL.md'), 'utf8'));
        } catch {
          keep = undefined;
        }
      }
      const front = `${buildFrontmatter(id, e.description, e.command, keep, e.triggers)}\n\n# ${e.name}\n\n${instr}\n`;
      mkdirSync(this.libPath(id), { recursive: true });
      writeFileSync(join(this.libPath(id), 'SKILL.md'), front);
    }
    this.writeRegistry(reg);
    this.sync();
    return this.list();
  }

  delete(id: string): SkillInfo[] {
    // Kỹ năng dựng sẵn bị xoá → nhớ lại để KHÔNG tự cài lại lần khởi động sau (người dùng đã chọn bỏ).
    const was = this.readRegistry().find((x) => x.id === id);
    if (was?.builtin) {
      const st = this.builtinState();
      if (!st.removed.includes(id)) st.removed.push(id);
      delete st.installed[id];
      delete st.pending[id];
      this.writeBuiltinState(st);
    }
    // Remove our copies from every runner dir + the library, then forget it.
    for (const r of FOLDER_RUNNERS) rmSync(this.runnerSkillPath(r, id), { recursive: true, force: true });
    rmSync(this.libPath(id), { recursive: true, force: true });
    this.writeRegistry(this.readRegistry().filter((e) => e.id !== id));
    this.rebuildCodex(this.readRegistry()); // drop it from the AGENTS.md block too
    return this.list();
  }

  /**
   * Reconcile EVERY managed skill into each runner's discovery location: present iff
   * (enabled && runner ∈ scope). Only touches ids in our registry. Idempotent.
   */
  private sync(): void {
    const reg = this.readRegistry();
    for (const runner of FOLDER_RUNNERS) {
      const dir = join(homedir(), RUNNER_HOME[runner], 'skills');
      for (const e of reg) {
        const dest = this.runnerSkillPath(runner, e.id);
        const want = e.enabled && e.scope.includes(runner) && existsSync(this.libPath(e.id));
        try {
          if (want) {
            mkdirSync(dir, { recursive: true });
            rmSync(dest, { recursive: true, force: true });
            cpSync(this.libPath(e.id), dest, { recursive: true });
          } else {
            rmSync(dest, { recursive: true, force: true });
          }
        } catch {
          /* best-effort per skill */
        }
      }
    }
    this.rebuildCodex(reg);
  }

  /** Rewrite ONLY our sentinel block in ~/.codex/AGENTS.md from enabled codex-scoped skills. */
  private rebuildCodex(reg: SkillEntry[]): void {
    const codexDir = join(homedir(), '.codex');
    const agents = join(codexDir, 'AGENTS.md');
    let existing = '';
    try {
      if (existsSync(agents)) existing = readFileSync(agents, 'utf8');
    } catch {
      /* treat as empty */
    }
    // Strip any prior managed block — matched by sentinels AND our header, so user content
    // that merely contains the sentinel strings is never destroyed.
    const stripped = existing
      .replace(
        new RegExp(`\\n*${escapeRe(CODEX_START)}\\n${escapeRe(CODEX_HEADER)}[\\s\\S]*?${escapeRe(CODEX_END)}\\n*`, 'g'),
        '\n',
      )
      .replace(
        new RegExp(`\\n*${escapeRe(LEGACY_CODEX_START)}\\n${escapeRe(CODEX_HEADER)}[\\s\\S]*?${escapeRe(LEGACY_CODEX_END)}\\n*`, 'g'),
        '\n',
      )
      .trimEnd();

    const items = reg.filter((e) => e.enabled && e.scope.includes('codex'));
    if (!items.length) {
      // Nothing of ours — only write if we actually removed a block (avoid creating empty files).
      if (existing && stripped !== existing.trimEnd()) {
        try {
          writeFileSync(agents, stripped ? stripped + '\n' : '');
        } catch {
          /* read-only AGENTS.md — non-fatal */
        }
      }
      return;
    }
    const body = items
      .map((e) => {
        let md = '';
        try {
          md = skillBody(readFileSync(join(this.libPath(e.id), 'SKILL.md'), 'utf8'));
        } catch {
          md = e.description;
        }
        return `## ${e.name}\n\n${md}`.trim();
      })
      .join('\n\n');
    const block = `${CODEX_START}\n${CODEX_HEADER}\n\n${body}\n${CODEX_END}`;
    const next = (stripped ? stripped + '\n\n' : '') + block + '\n';
    try {
      mkdirSync(codexDir, { recursive: true });
      writeFileSync(agents, next);
    } catch {
      /* codex not present / not writable — non-fatal */
    }
  }

  /** One-time move from the pre-1.0.25 layout (active in ~/.claude/skills, staged in disabled/)
   *  into the canonical library; default every legacy skill to "shared" (all runners). */
  private migrate(): void {
    const reg = this.readRegistry();
    if (!reg.length) return; // fresh install — nothing to migrate or reconcile
    let changed = false;
    for (const e of reg) {
      if (!Array.isArray(e.scope) || !e.scope.length) {
        e.scope = [...ALL_RUNNERS];
        changed = true;
      }
      if (!existsSync(this.libPath(e.id))) {
        const oldActive = join(homedir(), '.claude', 'skills', e.id);
        const oldStaged = join(this.legacyDisabledDir, e.id);
        const src = existsSync(oldActive) ? oldActive : existsSync(oldStaged) ? oldStaged : null;
        if (src) {
          try {
            cpSync(src, this.libPath(e.id), { recursive: true });
            changed = true;
          } catch {
            /* skip a broken legacy entry */
          }
        }
      }
    }
    if (changed) {
      this.writeRegistry(reg);
      this.sync(); // reconcile runner dirs only when migration actually changed something
    }
  }
}

/** Normalize a scope array to valid runner ids (dedup; order = ALL_RUNNERS). */
function normScope(scope: unknown): string[] {
  const set = new Set(Array.isArray(scope) ? scope : []);
  return ALL_RUNNERS.filter((r) => set.has(r));
}

/** Normalize free-form tags: trim, drop empties, dedupe (case-insensitive, first spelling
 *  wins), cap length + count so the registry stays tidy. */
function normTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const v = String(t ?? '').trim().slice(0, 24);
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= 12) break;
  }
  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Strip a SKILL.md's leading YAML frontmatter, returning the markdown body. */
function skillBody(text: string): string {
  return text.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '').trim();
}

/** The EDITABLE instructions: the body with the auto-generated leading "# <title>" heading
 *  removed (create()/update() add exactly one, so stripping it here prevents duplication on
 *  edit). Falls back to the full body if there's no leading heading (e.g. imported skills). */
function skillInstructions(text: string): string {
  const body = skillBody(text);
  const stripped = body.replace(/^#\s+.*(?:\r?\n)+/, '').trim();
  return stripped || body;
}

/** One-line description = first non-empty, non-heading line (mirrors create()). */
function deriveDescription(instr: string): string {
  const first = (instr.split('\n').find((l) => l.trim()) || '').replace(/^#+\s*/, '').replace(/\s+/g, ' ').trim();
  return first.slice(0, 120);
}

/** Parse a SKILL.md's YAML frontmatter for name + description + slash-command. */
function parseSkillMd(text: string): { name: string; description: string; command: string; triggers: string[] } {
  let name = '';
  let description = '';
  let command = '';
  let triggers: string[] = [];
  const m = text.match(/^---\s*\n([\s\S]*?)\n---/);
  if (m) {
    const tr = m[1].match(/^triggers:\s*(.+)$/m);
    if (tr) triggers = normTriggers(tr[1].split('|'));
    const n = m[1].match(/^name:\s*(.+)$/m);
    if (n) name = n[1].trim().replace(/^["']|["']$/g, '');
    const d = m[1].match(/^description:\s*(.+)$/m);
    if (d) description = d[1].trim().replace(/^["']|["']$/g, '');
    const c = m[1].match(/^command:\s*(.+)$/m);
    if (c) command = c[1].trim().replace(/^["']|["']$/g, '');
  }
  if (!name) {
    const h = text.match(/^#\s+(.+)$/m);
    if (h) name = h[1].trim();
  }
  return { name, description, command, triggers };
}

/** Set (or remove, when `command` is '') the frontmatter `command:` of a SKILL.md, leaving the
 *  rest of the file untouched. Used when an imported folder's shortcut had to be changed. */
function setFrontmatterCommand(text: string, command: string): string {
  const m = text.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return text;
  const body = m[1].replace(/^command:\s*.*$\n?/m, '');
  const next = command ? `${body.replace(/\n*$/, '')}\ncommand: ${command}` : body.replace(/\n*$/, '');
  return text.replace(m[0], `---\n${next}\n---`);
}

/** A filesystem-safe, CLI-friendly id from a skill name. */
/**
 * Tên hiển thị → id thư mục.
 *
 * PHẢI bỏ dấu TRƯỚC khi lọc ký tự. Trước đây hàm này xoá thẳng mọi thứ ngoài `[a-z0-9]`, nên mọi
 * chữ có dấu biến thành gạch nối: "KC - Đối chiếu số liệu Chiến dịch" ra
 * `kc-i-chi-u-s-li-u-chi-n-d-ch` — vừa không đọc được, vừa dễ đụng id với một tên khác hẳn.
 *
 * `slugifySkillCommand` trong core đã làm đúng việc này từ lâu, nhưng nó kẹp độ dài theo trần của
 * "/lệnh" (ngắn hơn id thư mục) nên không dùng thẳng được. Giữ cùng một luật, khác mỗi chỗ cắt.
 */
function slug(s: string): string {
  return (s || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // dấu thanh tiếng Việt (ký tự tổ hợp)
    .replace(/[đĐ]/g, 'd') // đ không phân tách được bằng NFD
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, ''); // chỗ cắt có thể để lại gạch nối cuối
}

/** Nhãn của kỹ năng dựng sẵn (trùng BUILTIN_TAGS ở builtinSkills — chép để SkillHost không cần import giá trị). */
const BUILTIN_TAG_LIST = ['Larkwave', 'Tệp & dữ liệu'];

function sha(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** Cụm từ gọi: cắt khoảng trắng, bỏ rỗng/trùng (không phân biệt hoa thường), tối đa 16 cụm × 60 ký tự. */
function normTriggers(t: unknown): string[] {
  if (!Array.isArray(t)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of t) {
    const v = String(x ?? '').replace(/[|\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
    if (out.length >= 16) break;
  }
  return out;
}
