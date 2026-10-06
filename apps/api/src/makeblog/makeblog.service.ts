import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MaicService } from '../maic/maic.service';
import { MaicUsageService } from '../maic/maic-usage.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { AuthUser } from '../common/auth-user';
import { MarketingHistoryService } from '../media/marketing-history.service';
import { AttachmentService } from '../media/attachment.service';
import { MarketingDeliveryService } from '../delivery/marketing-delivery.service';
import { RenderService } from '../video/render.service';
import { BLOG_COVER, MAKEBLOG_TEMPLATES, getMakeBlogTemplate, type MakeBlogTemplate } from './templates';
import { PALETTE_OPTIONS, hashSeed, layoutVariant, paletteDirective, resolvePalette, type Palette } from '../media/palettes';
import { CHARACTER_OPTIONS, characterDirective, getCharacter, type Character } from '../media/characters';

interface CreateBlogInput {
  topic: string;
  template?: string;
  palette?: string;
  character?: string;
  count?: number;
  categoryId?: string;
  attachmentIds?: string[];
  title?: string;
}

@Injectable()
export class MakeBlogService {
  private readonly logger = new Logger(MakeBlogService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly maic: MaicService,
    private readonly maicUsage: MaicUsageService,
    private readonly render: RenderService,
    private readonly notifications: NotificationsService,
    private readonly history: MarketingHistoryService,
    private readonly delivery: MarketingDeliveryService,
    private readonly attachments: AttachmentService,
  ) {}

  templates() {
    return MAKEBLOG_TEMPLATES;
  }
  palettes() {
    return PALETTE_OPTIONS;
  }
  characters() {
    return CHARACTER_OPTIONS;
  }
  list(userId: string) {
    return this.prisma.blogProject.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100 });
  }
  async get(userId: string, id: string) {
    const p = await this.prisma.blogProject.findFirst({ where: { id, userId } });
    if (!p) throw new NotFoundException('Không tìm thấy bài viết.');
    return p;
  }
  async remove(userId: string, id: string) {
    await this.prisma.blogProject.deleteMany({ where: { id, userId } });
    await this.history.deleteForProject(id);
    return { ok: true };
  }

  async listHistory(userId: string, id: string) {
    const p = await this.prisma.blogProject.findFirst({ where: { id, userId }, select: { id: true } });
    if (!p) throw new NotFoundException('Không tìm thấy bài viết.');
    return this.history.list(userId, 'blog', id);
  }

  async restore(userId: string, id: string, editId: string) {
    const p = await this.prisma.blogProject.findFirst({ where: { id, userId }, select: { id: true } });
    if (!p) throw new NotFoundException('Không tìm thấy bài viết.');
    const e = await this.history.get(userId, editId);
    if (!e || e.projectId !== id) throw new NotFoundException('Không tìm thấy phiên bản.');
    await this.prisma.blogProject.update({
      where: { id },
      data: { status: 'done', stage: '', error: null, title: e.title, caption: e.caption, body: e.extra, coverUrl: e.mediaUrl },
    });
    return { ok: true };
  }

  private async insert(userId: string, dto: CreateBlogInput, user?: AuthUser) {
    const topic = (dto.topic || '').trim();
    if (!topic) throw new BadRequestException('Thiếu chủ đề bài viết.');
    if (!this.maic.enabled) throw new BadRequestException('Trợ lý AI (hosted) chưa được cấu hình.');
    const u = user ?? (await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, role: true } })) ?? undefined;
    if (u) await this.maicUsage.assertMaicAllowed(u as AuthUser);
    const template = getMakeBlogTemplate(dto.template || 'howto').id;
    const palette = dto.palette || 'auto';
    const character = getCharacter(dto.character).id;
    const count = Math.min(6, Math.max(0, Math.round(dto.count ?? 3)));
    return this.prisma.blogProject.create({
      data: { userId, title: (dto.title || topic).slice(0, 120), template, palette, character, count, categoryId: dto.categoryId || null, topic, status: 'draft' },
    });
  }

  async create(userId: string, dto: CreateBlogInput, user?: AuthUser) {
    const proj = await this.insert(userId, dto, user);
    void this.run(proj.id, '', { deliver: true, attachmentIds: dto.attachmentIds }).catch((e) => this.logger.error(`blog ${proj.id} failed: ${(e as Error).message}`));
    return proj;
  }

  async createAndAwait(userId: string, dto: CreateBlogInput) {
    const proj = await this.insert(userId, dto);
    await this.run(proj.id);
    const d = await this.prisma.blogProject.findUnique({ where: { id: proj.id } });
    return {
      id: proj.id,
      status: d?.status || 'error',
      title: d?.title || proj.title,
      error: d?.error ?? null,
      body: d?.body || '',
      caption: d?.caption || '',
      coverUrl: d?.coverUrl || '',
    };
  }

  async rerender(userId: string, id: string) {
    const p = await this.prisma.blogProject.findFirst({ where: { id, userId }, select: { id: true } });
    if (!p) throw new NotFoundException('Không tìm thấy bài viết.');
    void this.run(id).catch((e) => this.logger.error(`blog ${id} re-render failed: ${(e as Error).message}`));
    return { ok: true };
  }

  /** Refine: re-run EDITING the previous article per the user's instruction (empty = plain redo). */
  async refine(userId: string, id: string, instruction: string) {
    const p = await this.prisma.blogProject.findFirst({ where: { id, userId }, select: { id: true } });
    if (!p) throw new NotFoundException('Không tìm thấy bài viết.');
    void this.run(id, (instruction || '').trim()).catch((e) => this.logger.error(`blog ${id} refine failed: ${(e as Error).message}`));
    return { ok: true };
  }

  private async run(id: string, instruction = '', opts: { deliver?: boolean; attachmentIds?: string[] } = {}): Promise<void> {
    const p = await this.prisma.blogProject.findUnique({ where: { id } });
    if (!p) return;
    const set = (data: Record<string, unknown>) => this.prisma.blogProject.update({ where: { id }, data });
    try {
      const tpl = getMakeBlogTemplate(p.template);

      const att = await this.attachments.resolve(p.userId, opts.attachmentIds).catch(() => ({ sourceText: '', imageUrls: [] }));

      await set({ status: 'rendering', stage: 'write', error: null });
      const article = await this.genArticle(p.userId, p.topic, tpl, instruction ? { title: p.title, body: p.body } : null, instruction, att.sourceText);
      await set({ title: article.title.slice(0, 120), caption: article.excerpt, body: article.body, stage: 'cover' });

      const seed = hashSeed(p.id);
      const pal = resolvePalette(p.palette, seed);
      const variant = layoutVariant(seed);
      const character = getCharacter(p.character);
      const html = await this.genCover(p.userId, article.title, tpl, pal, variant, character).catch(() => '');
      let coverUrl = '';
      if (html) coverUrl = (await this.render.renderImage({ html, w: BLOG_COVER.w, h: BLOG_COVER.h }).catch(() => ({ url: '' }))).url;

      // Blog posts should have images in the body too — generate a few section illustrations and
      // splice them under the first headings (markdown ![](url)); web renders them, Telegram strips them.
      const imgCount = Math.min(6, Math.max(0, p.count ?? 3));
      let body = imgCount > 0
        ? await (async () => { await set({ stage: 'images' }); return this.addInlineImages(p.userId, article.body, pal, variant, character, imgCount).catch(() => article.body); })()
        : article.body;
      // Embed the user's own uploaded images near the top of the article.
      if (att.imageUrls.length) {
        const block = att.imageUrls.map((u) => `![](${u})`).join('\n\n');
        const parts = body.split('\n\n');
        if (parts.length > 1) parts.splice(1, 0, block);
        else parts.push(block);
        body = parts.join('\n\n');
      }

      await set({ status: 'done', stage: '', coverUrl, body });
      await this.history.record({
        projectId: id, userId: p.userId, kind: 'blog', instruction, title: article.title,
        caption: article.excerpt, mediaUrl: coverUrl, extra: body,
      });
      await this.notifications
        .notify(p.userId, 'system', `📝 ${article.title.slice(0, 80)}`, 'Bài viết đã tạo xong.', `/marketing/blog/library?id=${id}`)
        .catch(() => undefined);
      if (opts.deliver && p.categoryId) {
        await this.delivery
          .deliver(p.userId, p.categoryId, 'blog', { title: article.title, caption: article.excerpt, coverUrl, body })
          .catch(() => undefined);
      }
    } catch (e) {
      await set({ status: 'error', stage: '', error: (e as Error)?.message?.slice(0, 500) || 'Lỗi tạo bài viết.' }).catch(() => undefined);
    }
  }

  private async genArticle(userId: string, topic: string, tpl: MakeBlogTemplate, prev: { title: string; body: string } | null = null, instruction = '', sourceText = ''): Promise<{ title: string; excerpt: string; body: string }> {
    const editing = !!(prev && prev.body && instruction);
    const src = sourceText ? `\n\nTÀI LIỆU NGUỒN (viết bài BÁM SÁT nội dung/số liệu trong tài liệu này, không bịa thông tin trái với nó):\n"""\n${sourceText.slice(0, 12000)}\n"""\n` : '';
    const r = await this.maic.ask({
      endUser: { id: userId },
      systemPrompt: 'You output ONLY valid minified JSON. No markdown fences, no prose.',
      prompt: editing
        ? `Here is the CURRENT Vietnamese blog article.\nTITLE: ${prev!.title}\nBODY (Markdown):\n"""\n${prev!.body.slice(0, 16000)}\n"""\n\n` +
          `EDIT it per this instruction: "${instruction}". Keep the good parts, change only what's asked. Return ONLY JSON: {"title": string (<=120 chars), "excerpt": string (<=300 chars), "body": string (full revised Markdown article)}. No code fences.`
        : `Write a Vietnamese blog article about: "${topic}".${src}\nSTYLE: ${tpl.style}\n\n` +
          `FORMAT the body as clean Markdown with a real heading hierarchy: "##" for each main section, "###" for sub-points inside a section when useful; short paragraphs; use **bold** for key terms and "-"/"1." lists where it helps. Do NOT put the title inside the body (it is shown separately). Do NOT embed images (they are added automatically).\n\n` +
          `Return ONLY JSON: {"title": string (<=120 chars), "excerpt": string (1–2 sentence summary, <=300 chars), "body": string (the full article in Markdown, 500–900 words, with ## / ### headings)}. No code fences.`,
      timeoutSec: 200,
    });
    await this.maicUsage.meterMaic(userId, { runId: r.runId, kind: 'blog', costUsd: r.costUsd }).catch(() => undefined);
    let raw = r.answer.trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
    // Be lenient: extract the outermost JSON object.
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    if (first >= 0 && last > first) raw = raw.slice(first, last + 1);
    let parsed: { title?: string; excerpt?: string; body?: string };
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Fallback: treat the whole answer as the body.
      parsed = { title: topic, excerpt: '', body: r.answer.trim() };
    }
    const body = (parsed.body || '').trim();
    if (!body) throw new BadRequestException('Không viết được bài (AI trả về rỗng).');
    return {
      title: (parsed.title || topic).trim().slice(0, 120),
      excerpt: (parsed.excerpt || body.replace(/[#*_>`]/g, '').slice(0, 200)).trim().slice(0, 500),
      body: body.slice(0, 20000),
    };
  }

  /** Generate a few section illustrations and splice them under the first headings as markdown images. */
  private async addInlineImages(userId: string, body: string, pal: Palette, variant: number, character: Character, max = 3): Promise<string> {
    const heads = (body.match(/^##\s+.+$/gm) || []).slice(0, Math.max(0, max)).map((h) => h.replace(/^##\s+/, '').trim());
    if (!heads.length) return body;
    const urls: string[] = [];
    for (let k = 0; k < heads.length; k++) {
      urls.push(await this.genInlineImage(userId, heads[k], pal, variant + k + 1, character).catch(() => ''));
    }
    const lines = body.split('\n');
    const out: string[] = [];
    let idx = 0;
    for (const ln of lines) {
      out.push(ln);
      if (/^##\s+.+$/.test(ln) && idx < urls.length) {
        if (urls[idx]) out.push('', `![${heads[idx].replace(/[[\]]/g, '')}](${urls[idx]})`);
        idx++;
      }
    }
    return out.join('\n');
  }

  private async genInlineImage(userId: string, sectionTitle: string, pal: Palette, variant: number, character: Character): Promise<string> {
    try {
      const r = await this.maic.ask({
        endUser: { id: userId },
        systemPrompt: 'You output ONLY a single self-contained HTML file. No markdown fences, no prose.',
        prompt:
          `Design a clean editorial ILLUSTRATION image, EXACTLY 1200×700px (html,body{margin:0}, root element exactly that size). Screenshotted once.\n\n` +
          `Illustrate this blog section — DRAW only, absolutely NO text/words/letters/numbers in the image: "${sectionTitle}".` +
          `${paletteDirective(pal, variant)}${characterDirective(character, 'still')}\n\n` +
          `CSS + inline SVG only. Fill the whole canvas, pleasant composition. Return ONLY the HTML (start with <!doctype html>). No \`\`\` fences.`,
        // Sonnet chứ không phải Opus. Đây là ảnh TRANG TRÍ dưới một mục, không phải việc cần suy
        // luận. Mặc định của MAIC là `maic-max` = claude-opus-5, và makeblog trước đây không ghim
        // model ở đâu cả — nên mỗi bài đốt tới SÁU lượt Opus chỉ để vẽ hình minh hoạ.
        model: 'maic-pro',
        // Trước là 90s: trần ngắn nhất trong cả repo, và là giá trị DUY NHẤT nằm dưới mặc định
        // 120s của chính MAIC cho `ask` — trong khi canvas ở đây (1200×700) còn LỚN HƠN ảnh bìa
        // (1200×630) vốn được cho 120s. Lệch đó biến lời gọi được lặp nhiều nhất trong luồng blog
        // thành lời gọi trượt nhiều nhất, và mỗi lần trượt là 90 giây hạn mức cháy trắng.
        timeoutSec: 180,
      });
      await this.maicUsage.meterMaic(userId, { runId: r.runId, kind: 'blog', costUsd: r.costUsd }).catch(() => undefined);
      let html = r.answer.trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
      if (!/<!doctype|<html/i.test(html)) return '';
      const out = await this.render.renderImage({ html, w: 1200, h: 700 }).catch(() => ({ url: '' }));
      return out.url;
    } catch {
      return '';
    }
  }

  private async genCover(userId: string, title: string, tpl: MakeBlogTemplate, pal: Palette, variant: number, character: Character): Promise<string> {
    const r = await this.maic.ask({
      endUser: { id: userId },
      systemPrompt: 'You output ONLY a single self-contained HTML file. No markdown fences, no prose.',
      prompt:
        `Design a self-contained HTML blog cover image, EXACTLY ${BLOG_COVER.w}×${BLOG_COVER.h}px (html,body{margin:0}, root element exactly that size). Screenshotted once.\n\n` +
        // KHÔNG in tiêu đề vào ảnh nữa.
        //
        // Trước đây prompt này bảo "Show this Vietnamese title prominently", và hệ quả là: thẻ bài
        // trên /blog hiện tiêu đề HAI LẦN (một lần trong ảnh, một lần là chữ thật của thẻ), còn ở
        // kích thước thẻ nhỏ thì dòng chữ trong ảnh không đọc nổi. Chữ thật thì co giãn được, đọc
        // được bằng trình đọc màn hình, và Google lập chỉ mục được — chữ nướng vào ảnh thì không.
        //
        // Đổi lại ảnh bìa phải TỰ NÓI được chủ đề bằng hình. Nên vẫn đưa tiêu đề vào prompt, nhưng
        // để làm ĐỀ BÀI cho minh hoạ, không phải để viết lên ảnh.
        `STYLE: ${tpl.coverStyle}${paletteDirective(pal, variant)}${characterDirective(character, 'still')}\n\n` +
        `CHỦ ĐỀ để minh hoạ (ĐỪNG viết câu này lên ảnh): "${title}"\n` +
        `TUYỆT ĐỐI KHÔNG đặt tiêu đề bài viết lên ảnh. Không câu dài. Tối đa 3-4 TỪ dạng nhãn ngắn ` +
        `nếu thật sự cần. Hãy kể chủ đề bằng HÌNH: biểu tượng, sơ đồ, khối giao diện, đồ thị.\n` +
        `CSS + inline SVG only (Google Fonts <link> allowed). High contrast, safe margins.\n` +
        `Chừa khoảng an toàn: ảnh sẽ bị cắt thành hình vuông ở thẻ nhỏ, nên đừng dồn nội dung ra mép.\n\n` +
        `Return ONLY the HTML document (start with <!doctype html>). No \`\`\` fences.`,
      // Cùng lý do như ảnh minh hoạ: vẽ một trang HTML+SVG rồi chụp, không phải việc cần Opus.
      model: 'maic-pro',
      timeoutSec: 120,
    });
    await this.maicUsage.meterMaic(userId, { runId: r.runId, kind: 'blog', costUsd: r.costUsd }).catch(() => undefined);
    let html = r.answer.trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
    if (!/<!doctype|<html/i.test(html)) return '';
    return html;
  }
}
