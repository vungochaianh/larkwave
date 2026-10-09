import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, cpSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { contractFieldsFrom, serializeContract, slugifySkillCommand, uniqueSkillCommand } from '@larkwave/core';
import type { SkillContractFields } from '@larkwave/core';
import type { SkillInfo } from '@larkwave/core';

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
): string {
  const lines = [`name: ${id}`, `description: ${description}`];
  if (command) lines.push(`command: ${command}`);
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
      this.writeRegistry(reg);
    }
    this.sync();
    return this.list();
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

    // Rewrite SKILL.md when the body changed, OR when only the name/command changed (keep the
    // # title + frontmatter in sync — the frontmatter is what an exported folder carries to
    // another machine). `instr` is ALWAYS the pure body WITHOUT the auto heading — we add
    // exactly one "# <name>" back, so headings never accumulate across edits.
    const nameChanged = patch.name !== undefined;
    if (patch.instructions !== undefined || nameChanged || patch.command !== undefined || patch.contract !== undefined) {
      // Chụp TRƯỚC khi ghi đè — sau khi ghi thì không còn gì để chụp.
      const changed = [
        patch.name !== undefined ? 'tên' : '',
        patch.instructions !== undefined ? 'nội dung' : '',
        patch.command !== undefined ? 'lệnh gọi' : '',
        patch.contract !== undefined ? 'hợp đồng' : '',
      ].filter(Boolean);
      this.snapshot(id, patch.by ?? 'you', `Đổi ${changed.join(', ')}`);
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
      const front = `${buildFrontmatter(id, e.description, e.command, keep)}\n\n# ${e.name}\n\n${instr}\n`;
      mkdirSync(this.libPath(id), { recursive: true });
      writeFileSync(join(this.libPath(id), 'SKILL.md'), front);
    }
    this.writeRegistry(reg);
    this.sync();
    return this.list();
  }

  delete(id: string): SkillInfo[] {
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
function parseSkillMd(text: string): { name: string; description: string; command: string } {
  let name = '';
  let description = '';
  let command = '';
  const m = text.match(/^---\s*\n([\s\S]*?)\n---/);
  if (m) {
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
  return { name, description, command };
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
