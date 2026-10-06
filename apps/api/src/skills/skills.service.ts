import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MaicService } from '../maic/maic.service';
import {
  parseSkillCommands,
  slugifySkillCommand,
  stripSkillCommands,
  uniqueSkillCommand,
} from './skill-command.util';
import {
  RUNNER_IDS,
  type SkillInfoDto,
  type CreateSkillDto,
  type UpdateSkillDto,
  type SkillAttachmentDto,
} from './skills.dto';

type Attachment = { name: string; description?: string; content: string };

type RawSkill = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  enabled: boolean;
  scope: string[];
  tags: string[];
  command: string;
  attachments: unknown;
};

/** First non-empty line of the body — a fallback card description when none was given. */
function firstLine(text: string): string {
  const line = (text || '')
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean);
  return (line ?? '').slice(0, 200);
}

/** Coerce/clamp an attachment array coming from the DB (Json) or a DTO. */
function coerceAttachments(v: unknown): Attachment[] {
  if (!Array.isArray(v)) return [];
  const out: Attachment[] = [];
  for (const a of v) {
    if (!a || typeof a !== 'object') continue;
    const rec = a as Record<string, unknown>;
    if (typeof rec.content !== 'string') continue;
    const name = String(rec.name ?? 'file').trim().slice(0, 200) || 'file';
    const description = rec.description != null ? String(rec.description).slice(0, 500) : undefined;
    out.push({ name, ...(description ? { description } : {}), content: rec.content.slice(0, 50000) });
    if (out.length >= 20) break;
  }
  return out;
}

function toSkillInfo(s: RawSkill): SkillInfoDto {
  return {
    id: s.id,
    name: s.name,
    description: s.description?.trim() || firstLine(s.instructions),
    enabled: s.enabled,
    scope: s.scope?.length ? s.scope : [...RUNNER_IDS],
    tags: s.tags ?? [],
    command: s.command ?? '',
    attachmentCount: coerceAttachments(s.attachments).length,
  };
}

function sanitizeScope(scope?: string[]): string[] {
  if (!Array.isArray(scope)) return [];
  const set = new Set(scope.filter((s) => (RUNNER_IDS as readonly string[]).includes(s)));
  return [...set];
}

function sanitizeTags(tags?: string[]): string[] {
  if (!Array.isArray(tags)) return [];
  const cleaned = tags.map((t) => String(t).trim().slice(0, 40)).filter(Boolean);
  return [...new Set(cleaned)].slice(0, 12);
}

function sanitizeAttachments(attachments?: SkillAttachmentDto[]): Attachment[] {
  return coerceAttachments(attachments);
}

/** Parse the delimited draft the model returns (robust for multi-line instructions, unlike JSON):
 *    NAME: <one line>
 *    DESCRIPTION: <one line>
 *    INSTRUCTIONS:
 *    <everything after, markdown, many lines>
 */
function parseDraft(text: string): { name: string; description: string; instructions: string } {
  const raw = (text || '').trim();
  const nameM = raw.match(/^\s*NAME\s*:\s*(.+?)\s*$/im);
  const descM = raw.match(/^\s*DESCRIPTION\s*:\s*(.+?)\s*$/im);
  const idx = raw.search(/^\s*INSTRUCTIONS\s*:/im);
  let instructions = '';
  if (idx >= 0) {
    instructions = raw.slice(idx).replace(/^\s*INSTRUCTIONS\s*:[ \t]*\n?/i, '').trim();
  } else {
    // Model ignored the format — treat everything after the header lines as the body.
    instructions = raw.replace(/^\s*NAME\s*:.*$/im, '').replace(/^\s*DESCRIPTION\s*:.*$/im, '').trim();
  }
  return {
    name: (nameM?.[1] ?? '').trim(),
    description: (descM?.[1] ?? '').trim(),
    instructions,
  };
}

@Injectable()
export class SkillsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly maic: MaicService,
  ) {}

  private raw(userId: string): Promise<RawSkill[]> {
    return this.prisma.skill.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        instructions: true,
        enabled: true,
        scope: true,
        tags: true,
        command: true,
        attachments: true,
      },
    });
  }

  async list(userId: string): Promise<SkillInfoDto[]> {
    return (await this.raw(userId)).map(toSkillInfo);
  }

  async read(
    userId: string,
    id: string,
  ): Promise<{
    id: string;
    name: string;
    description: string;
    instructions: string;
    command: string;
    attachments: Attachment[];
  }> {
    const s = await this.prisma.skill.findFirst({
      where: { id, userId },
      select: { id: true, name: true, description: true, instructions: true, command: true, attachments: true },
    });
    if (!s) throw new NotFoundException('Skill không tồn tại');
    return {
      id: s.id,
      name: s.name,
      description: s.description ?? '',
      instructions: s.instructions,
      command: s.command ?? '',
      attachments: coerceAttachments(s.attachments),
    };
  }

  async create(userId: string, dto: CreateSkillDto): Promise<SkillInfoDto[]> {
    await this.prisma.skill.create({
      data: {
        userId,
        name: dto.name.trim() || 'Skill',
        description: (dto.description ?? '').trim().slice(0, 500),
        instructions: dto.instructions ?? '',
        scope: sanitizeScope(dto.scope),
        tags: sanitizeTags(dto.tags),
        command: await this.resolveCommand(userId, dto.command),
        attachments: sanitizeAttachments(dto.attachments),
        enabled: true,
      },
    });
    return this.list(userId);
  }

  /**
   * Turn a requested command into the one we actually store: slugified, never a reserved word,
   * and never colliding with this user's other skills (a collision would silently shadow one of
   * them). '' / undefined-after-slugging = no shortcut. `selfId` is excluded from the taken set
   * so re-saving a skill keeps its own command.
   */
  private async resolveCommand(userId: string, requested?: string, selfId?: string): Promise<string> {
    const slug = slugifySkillCommand(requested ?? '');
    if (!slug) return '';
    const others = await this.prisma.skill.findMany({
      where: { userId, ...(selfId ? { NOT: { id: selfId } } : {}) },
      select: { command: true },
    });
    return uniqueSkillCommand(
      slug,
      others.map((o) => o.command || '').filter(Boolean),
    );
  }

  /** Ownership-checked partial update. */
  async update(userId: string, id: string, patch: UpdateSkillDto): Promise<SkillInfoDto[]> {
    const owned = await this.prisma.skill.findFirst({ where: { id, userId }, select: { id: true } });
    if (!owned) throw new NotFoundException('Skill không tồn tại');
    await this.prisma.skill.update({
      where: { id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name.trim() || 'Skill' } : {}),
        ...(patch.description !== undefined ? { description: patch.description.trim().slice(0, 500) } : {}),
        ...(patch.instructions !== undefined ? { instructions: patch.instructions } : {}),
        ...(patch.scope !== undefined ? { scope: sanitizeScope(patch.scope) } : {}),
        ...(patch.tags !== undefined ? { tags: sanitizeTags(patch.tags) } : {}),
        ...(patch.command !== undefined ? { command: await this.resolveCommand(userId, patch.command, id) } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(patch.attachments !== undefined ? { attachments: sanitizeAttachments(patch.attachments) } : {}),
      },
    });
    return this.list(userId);
  }

  async remove(userId: string, id: string): Promise<SkillInfoDto[]> {
    await this.prisma.skill.deleteMany({ where: { id, userId } });
    return this.list(userId);
  }

  /** "Create with Claude" — draft a skill (name + description + instructions) from a short idea,
   *  using the SAME hosted assistant (MAIC) the user chats with. */
  async draft(idea: string): Promise<{ name: string; description: string; instructions: string }> {
    if (!this.maic.enabled) {
      throw new ServiceUnavailableException('Trợ lý AI (hosted) chưa được cấu hình.');
    }
    const system = [
      'Bạn giúp người dùng soạn một "Skill" (kỹ năng) cho trợ lý AI dựa trên ý tưởng của họ.',
      'Trả lời theo ĐÚNG định dạng sau, KHÔNG thêm gì khác, KHÔNG bọc trong ```:',
      'NAME: <tên ngắn kiểu kebab-case, không dấu, không khoảng trắng, vd weekly-status-report>',
      'DESCRIPTION: <MỘT câu, một dòng — mô tả KHI NÀO nên dùng skill để AI tự nhận biết>',
      'INSTRUCTIONS:',
      '<hướng dẫn chi tiết AI phải làm gì khi skill áp dụng — markdown, nhiều dòng tuỳ ý>',
      '',
      'Viết bằng tiếng Việt, trừ khi ý tưởng người dùng bằng ngôn ngữ khác.',
    ].join('\n');
    const res = await this.maic.ask({ prompt: idea, systemPrompt: system, timeoutSec: 120 });
    const parsed = parseDraft(res.answer);
    const kebab = (v: string) =>
      v
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '') // strip Vietnamese diacritics
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 120);
    return {
      name: kebab(parsed.name) || 'skill-moi',
      description: parsed.description.slice(0, 500),
      instructions: (parsed.instructions || res.answer || '').trim().slice(0, 20000),
    };
  }

  /**
   * Resolve the `/command` shortcuts a user typed into their message.
   *
   * Returns the prompt to actually run plus a directive block naming the skills the user
   * explicitly invoked. Unlike `enabledPromptBlock`, this applies a skill even when it is
   * DISABLED — typing `/sieu-ba` is an explicit instruction, and silently ignoring it would look
   * like the feature is broken. At most `MAX_INVOKED` skills per turn so one message can't blow
   * up the context.
   *
   * When no command matched, `prompt` comes back untouched and `block` is '' — the caller can use
   * the result unconditionally.
   */
  /**
   * Tệp đính kèm của các skill đã được gọi, để nơi khác GHI RA THÀNH TỆP THẬT.
   *
   * Vì sao cần: expandCommands nhét nội dung tệp vào prompt dưới dạng chữ ("[File đính kèm: X]"),
   * nhưng chỉ dẫn của skill lại nói với model như thể X là một TỆP. Trong một agentic run có Bash,
   * model đi tìm nó trên ổ đĩa — đo thật: nó chạy `find / -name 'template_CI-PL.xlsx'` và lệnh đó
   * rò ra chat dưới dạng chữ, thành "câu trả lời" mà người dùng nhận được.
   */
  async attachmentsFor(ownerId: string, skillIds: string[]): Promise<Attachment[]> {
    if (!skillIds?.length) return [];
    const rows = await this.prisma.skill
      .findMany({ where: { id: { in: skillIds.slice(0, 8) }, userId: ownerId }, select: { attachments: true } })
      .catch(() => []);
    return rows.flatMap((r) => coerceAttachments(r.attachments)).slice(0, 12);
  }

  async expandCommands(
    userId: string,
    prompt: string,
  ): Promise<{ prompt: string; block: string; applied: { id: string; name: string; command: string }[] }> {
    const MAX_INVOKED = 3;
    /** Char budget for the inlined bodies — one message must not be able to prepend megabytes. */
    const BUDGET = 40000;
    const empty = { prompt, block: '', applied: [] as { id: string; name: string; command: string }[] };
    if (!prompt || !prompt.includes('/')) return empty;

    // Two queries on purpose: most messages that merely contain a "/" match nothing, and the first
    // one is tiny — only the matched skills' bodies + attachments (up to ~1 MB each) are fetched.
    const slugs = await this.prisma.skill
      .findMany({ where: { userId, NOT: { command: '' } }, select: { command: true } })
      .catch(() => []);
    if (!slugs.length) return empty;

    const { commands } = parseSkillCommands(
      prompt,
      slugs.map((r) => r.command),
    );
    if (!commands.length) return empty;

    const rows = await this.prisma.skill
      .findMany({
        where: { userId, command: { in: commands.slice(0, MAX_INVOKED) } },
        select: { id: true, name: true, description: true, instructions: true, command: true, attachments: true },
      })
      .catch(() => []);
    if (!rows.length) return empty;

    const byCommand = new Map(rows.map((r) => [r.command.toLowerCase(), r] as const));
    const blocks: string[] = [];
    const applied: { id: string; name: string; command: string }[] = [];
    let total = 0;
    for (const c of commands.slice(0, MAX_INVOKED)) {
      const sk = byCommand.get(c);
      if (!sk) continue;
      const parts = [`[LỆNH SKILL: /${sk.command} — “${sk.name}”] Áp dụng skill sau cho yêu cầu này (BẮT BUỘC):`];
      if (sk.description?.trim()) parts.push(`Khi nào dùng: ${sk.description.trim()}`);
      if (sk.instructions?.trim()) parts.push(sk.instructions.trim());
      const atts = coerceAttachments(sk.attachments);
      if (atts.length) {
        // Nói DỨT KHOÁT rằng nội dung nằm ngay đây. Không có câu này, model đọc "file đính kèm"
        // rồi đi tìm trên ổ đĩa — đo thật trên hội thoại người dùng: nó chạy `find /`,
        // `ls ~/.claude/skills`, `ls /data/ask-cwd` suốt hai lượt liền và không dựng nổi hợp đồng.
        parts.push(
          `\n[${atts.length} TỆP CỦA SKILL — TOÀN BỘ NỘI DUNG NẰM NGAY DƯỚI ĐÂY]\n` +
            `Đây là bản duy nhất. KHÔNG có bản nào trên ổ đĩa: TUYỆT ĐỐI KHÔNG dùng find/ls/Read để ` +
            `đi tìm chúng, không có thư mục skill, không có ~/.claude/skills. Nếu chỉ dẫn nhắc tới ` +
            `một script hay biểu mẫu, hãy TỰ VIẾT lại từ nội dung dưới đây.`,
        );
      }
      for (const f of atts) {
        parts.push(`\n[File đính kèm: ${f.name}${f.description ? ` — ${f.description}` : ''}]\n${f.content.trim()}`);
      }
      const block = parts.join('\n');
      // Always keep the FIRST block: a typed command must never be a silent no-op, even when that
      // one skill is bigger than the whole budget on its own.
      if (blocks.length && total + block.length > BUDGET) break;
      blocks.push(block);
      applied.push({ id: sk.id, name: sk.name, command: sk.command });
      total += block.length;
    }
    if (!applied.length) return empty;

    const block = [...blocks, '---'].join('\n');
    // Strip ONLY what we actually applied — a command dropped by the cap or the budget stays in
    // the message rather than vanishing. When that leaves nothing, the command WAS the request.
    const rest =
      stripSkillCommands(prompt, applied.map((a) => a.command)) ||
      `Thực hiện skill “${applied[0].name}”.`;
    return { prompt: `${block}\n${rest}`, block, applied };
  }

  /** Every command this user has defined — the "/" menu in a chat composer. */
  async commands(userId: string): Promise<{ id: string; name: string; description: string; command: string; enabled: boolean }[]> {
    const rows = await this.prisma.skill.findMany({
      where: { userId, NOT: { command: '' } },
      orderBy: { command: 'asc' },
      select: { id: true, name: true, description: true, instructions: true, command: true, enabled: true },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description?.trim() || firstLine(r.instructions),
      command: r.command,
      enabled: r.enabled,
    }));
  }

  /**
   * System-prompt block for the hosted "Trợ lý AI": every ENABLED skill's description (WHEN) +
   * instructions (WHAT) + attached reference files. '' when there are none. `skipIds` drops the
   * skills a `/command` already inlined into the user prompt for this turn.
   */
  async enabledPromptBlock(userId: string, skipIds?: readonly string[]): Promise<string> {
    const skills = (await this.raw(userId)).filter(
      (s) =>
        s.enabled &&
        (s.instructions.trim() || s.description.trim()) &&
        // Skills already inlined by their "/" command this turn would otherwise be sent twice.
        !skipIds?.includes(s.id),
    );
    if (!skills.length) return '';
    const blocks = skills.map((s) => {
      const parts = [`### ${s.name}`];
      if (s.description?.trim()) parts.push(`Khi nào dùng: ${s.description.trim()}`);
      if (s.instructions.trim()) parts.push(s.instructions.trim());
      for (const f of coerceAttachments(s.attachments)) {
        parts.push(`\n[File đính kèm: ${f.name}${f.description ? ` — ${f.description}` : ''}]\n${f.content.trim()}`);
      }
      return parts.join('\n');
    });
    return [
      '',
      '---',
      'KỸ NĂNG (SKILLS) NGƯỜI DÙNG ĐÃ BẬT — hãy ÁP DỤNG khi yêu cầu khớp phần "Khi nào dùng":',
      ...blocks,
    ].join('\n');
  }
}
