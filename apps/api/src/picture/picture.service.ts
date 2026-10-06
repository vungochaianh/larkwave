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
import { PICTURE_TEMPLATES, getPictureTemplate, pictureDims, type PictureTemplate } from './templates';
import { buildFallbackPoster } from './fallback-poster';
import { PALETTE_OPTIONS, hashSeed, layoutVariant, paletteDirective, resolvePalette, type Palette } from '../media/palettes';
import { CHARACTER_OPTIONS, characterDirective, getCharacter, type Character } from '../media/characters';

interface CreatePictureInput {
  topic: string;
  template?: string;
  aspect?: string;
  palette?: string;
  character?: string;
  count?: number;
  categoryId?: string;
  attachmentIds?: string[];
  title?: string;
}

/** Per-slide role brief so a multi-image post reads as a coherent carousel (cover → points → CTA). */
function slideRole(i: number, count: number): string {
  if (count <= 1) return '';
  if (i === 0)
    return `Đây là ảnh BÌA (trang 1/${count}) của một bài đăng NHIỀU ẢNH (carousel): làm tiêu đề/HOOK giật tít, cực cuốn, gợi tò mò về chủ đề. KHÔNG liệt kê hết nội dung ở đây.`;
  if (i === count - 1)
    return `Đây là ảnh CUỐI (trang ${count}/${count}) của bài đăng nhiều ảnh: một lời KÊU GỌI HÀNH ĐỘNG rõ ràng — rủ người xem lưu lại / chia sẻ / theo dõi.`;
  return `Đây là trang ${i + 1}/${count} của bài đăng nhiều ảnh: trình bày MỘT ý chính / điểm nội dung số ${i} (không lặp lại các trang khác), ngắn gọn, giữ phong cách nhất quán với các ảnh còn lại.`;
}

@Injectable()
export class PictureService {
  private readonly logger = new Logger(PictureService.name);
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
    return PICTURE_TEMPLATES;
  }
  palettes() {
    return PALETTE_OPTIONS;
  }
  characters() {
    return CHARACTER_OPTIONS;
  }
  list(userId: string) {
    return this.prisma.pictureProject.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100 });
  }
  async get(userId: string, id: string) {
    const p = await this.prisma.pictureProject.findFirst({ where: { id, userId } });
    if (!p) throw new NotFoundException('Không tìm thấy ảnh.');
    return p;
  }
  async remove(userId: string, id: string) {
    await this.prisma.pictureProject.deleteMany({ where: { id, userId } });
    await this.history.deleteForProject(id);
    return { ok: true };
  }

  async listHistory(userId: string, id: string) {
    const p = await this.prisma.pictureProject.findFirst({ where: { id, userId }, select: { id: true } });
    if (!p) throw new NotFoundException('Không tìm thấy ảnh.');
    return this.history.list(userId, 'picture', id);
  }

  async restore(userId: string, id: string, editId: string) {
    const p = await this.prisma.pictureProject.findFirst({ where: { id, userId }, select: { id: true } });
    if (!p) throw new NotFoundException('Không tìm thấy ảnh.');
    const e = await this.history.get(userId, editId);
    if (!e || e.projectId !== id) throw new NotFoundException('Không tìm thấy phiên bản.');
    await this.prisma.pictureProject.update({
      where: { id },
      // history keeps the cover image per version → restoring collapses to that single image
      data: { status: 'done', stage: '', error: null, imageUrl: e.mediaUrl, imageUrls: e.mediaUrl ? [e.mediaUrl] : [], caption: e.caption, html: e.extra },
    });
    return { ok: true };
  }

  private async insert(userId: string, dto: CreatePictureInput, user?: AuthUser) {
    const topic = (dto.topic || '').trim();
    if (!topic) throw new BadRequestException('Thiếu nội dung ảnh.');
    if (!this.maic.enabled) throw new BadRequestException('Trợ lý AI (hosted) chưa được cấu hình.');
    const u = user ?? (await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, role: true } })) ?? undefined;
    if (u) await this.maicUsage.assertMaicAllowed(u as AuthUser);
    const template = getPictureTemplate(dto.template || 'quote').id;
    const aspect = ['1:1', '4:5', '16:9'].includes(dto.aspect || '') ? (dto.aspect as string) : '1:1';
    const palette = dto.palette || 'auto';
    const character = getCharacter(dto.character).id;
    const count = Math.min(10, Math.max(1, Math.round(dto.count || 1)));
    return this.prisma.pictureProject.create({
      data: { userId, title: (dto.title || topic).slice(0, 80), template, aspect, palette, character, count, categoryId: dto.categoryId || null, topic, status: 'draft' },
    });
  }

  async create(userId: string, dto: CreatePictureInput, user?: AuthUser) {
    const proj = await this.insert(userId, dto, user);
    void this.run(proj.id, '', { deliver: true, attachmentIds: dto.attachmentIds }).catch((e) => this.logger.error(`picture ${proj.id} failed: ${(e as Error).message}`));
    return proj;
  }

  async createAndAwait(userId: string, dto: CreatePictureInput) {
    const proj = await this.insert(userId, dto);
    await this.run(proj.id);
    const d = await this.prisma.pictureProject.findUnique({ where: { id: proj.id } });
    return {
      id: proj.id,
      status: d?.status || 'error',
      title: d?.title || proj.title,
      error: d?.error ?? null,
      imageUrl: d?.imageUrl || '',
      imageUrls: d?.imageUrls || [],
      caption: d?.caption || '',
    };
  }

  async rerender(userId: string, id: string) {
    const p = await this.prisma.pictureProject.findFirst({ where: { id, userId }, select: { id: true } });
    if (!p) throw new NotFoundException('Không tìm thấy ảnh.');
    void this.run(id).catch((e) => this.logger.error(`picture ${id} re-render failed: ${(e as Error).message}`));
    return { ok: true };
  }

  /** Refine: re-run EDITING the previous poster per the user's instruction (empty = plain redo). */
  async refine(userId: string, id: string, instruction: string) {
    const p = await this.prisma.pictureProject.findFirst({ where: { id, userId }, select: { id: true } });
    if (!p) throw new NotFoundException('Không tìm thấy ảnh.');
    void this.run(id, (instruction || '').trim()).catch((e) => this.logger.error(`picture ${id} refine failed: ${(e as Error).message}`));
    return { ok: true };
  }

  private async run(id: string, instruction = '', opts: { deliver?: boolean; attachmentIds?: string[] } = {}): Promise<void> {
    const p = await this.prisma.pictureProject.findUnique({ where: { id } });
    if (!p) return;
    const set = (data: Record<string, unknown>) => this.prisma.pictureProject.update({ where: { id }, data });
    try {
      const tpl = getPictureTemplate(p.template);
      const { w, h } = pictureDims(p.aspect);
      const seed = hashSeed(p.id);
      const pal = resolvePalette(p.palette, seed);
      const variant = layoutVariant(seed);
      const character = getCharacter(p.character);

      const count = Math.min(10, Math.max(1, p.count || 1));
      const att = await this.attachments.resolve(p.userId, opts.attachmentIds).catch(() => ({ sourceText: '', imageUrls: [] }));

      await set({ status: 'rendering', stage: 'caption', error: null });
      const caption = await this.genCaption(p.userId, p.topic, count, att.sourceText).catch(() => '');
      await set({ caption, stage: 'image' });

      // One post can be MANY images (carousel): cover → content slides → CTA. Each slide is a poster
      // sharing the same palette/character/style; per-slide role text keeps the content coherent.
      const urls: string[] = [];
      let firstHtml = '';
      for (let i = 0; i < count; i++) {
        await set({ stage: count > 1 ? `image ${i + 1}/${count}` : 'image' });
        const extra = [slideRole(i, count), instruction].filter(Boolean).join(' ');
        // Edit-the-previous only for single-image refine; a carousel refine regenerates the set.
        const prev = count === 1 && instruction ? p.html : '';
        const html = await this.genPoster(p.userId, p.topic, tpl, w, h, pal, variant + i, character, prev, extra, att.sourceText);
        const out = await this.render.renderImage({ html, w, h });
        urls.push(out.url);
        if (i === 0) firstHtml = html;
      }
      // Append the user's own uploaded images as extra slides of the post.
      for (const u of att.imageUrls) urls.push(u);
      await set({ status: 'done', stage: '', imageUrl: urls[0], imageUrls: urls.slice(0, 12), html: firstHtml });
      await this.history.record({
        projectId: id, userId: p.userId, kind: 'picture', instruction, title: p.title,
        caption, mediaUrl: urls[0], extra: firstHtml,
      });
      await this.notifications
        .notify(p.userId, 'system', `🖼️ ${p.title}`, 'Ảnh đã tạo xong.', `/marketing/picture/library?id=${id}`)
        .catch(() => undefined);
      if (opts.deliver && p.categoryId) {
        await this.delivery
          .deliver(p.userId, p.categoryId, 'picture', { title: p.title, caption, imageUrl: urls[0], imageUrls: urls })
          .catch(() => undefined);
      }
    } catch (e) {
      await set({ status: 'error', stage: '', error: (e as Error)?.message?.slice(0, 500) || 'Lỗi tạo ảnh.' }).catch(() => undefined);
    }
  }

  private async genCaption(userId: string, topic: string, count = 1, sourceText = ''): Promise<string> {
    const src = sourceText ? ` Dựa trên tài liệu người dùng cung cấp:\n"""\n${sourceText.slice(0, 4000)}\n"""` : '';
    const r = await this.maic.ask({
      endUser: { id: userId },
      prompt: `Viết 1 caption ngắn tiếng Việt (1–2 câu + 3–5 hashtag) cho một bài đăng mạng xã hội${count > 1 ? ` gồm ${count} ảnh (carousel)` : ' có ảnh'} về: "${topic}".${src}${count > 1 ? ' Có thể nhắc người xem "lướt xem hết các ảnh".' : ''} CHỈ trả về caption thuần.`,
      timeoutSec: 60,
    });
    await this.maicUsage.meterMaic(userId, { runId: r.runId, kind: 'picture', costUsd: r.costUsd }).catch(() => undefined);
    return r.answer.trim().replace(/^["']|["']$/g, '').slice(0, 800);
  }

  private async genPoster(userId: string, topic: string, tpl: PictureTemplate, w: number, h: number, pal: Palette, variant: number, character: Character, prevHtml = '', instruction = '', sourceText = ''): Promise<string> {
    const editing = !!(prevHtml && instruction && /<html|<!doctype/i.test(prevHtml));
    const src = sourceText ? `\n\nTÀI LIỆU THAM KHẢO (lấy nội dung/số liệu từ đây): """${sourceText.slice(0, 5000)}"""` : '';
    const palDir = paletteDirective(pal, variant) + characterDirective(character, 'still') + src;
    try {
      const r = await this.maic.ask({
      endUser: { id: userId },
      systemPrompt: 'You output ONLY a single self-contained HTML file. No markdown fences, no prose, no explanation.',
      prompt: editing
        ? `Here is the CURRENT HTML poster (${w}×${h}px):\n"""\n${prevHtml.slice(0, 24000)}\n"""\n\nEDIT it per this instruction (VIETNAMESE): "${instruction}". Keep the exact ${w}×${h}px size, CSS + inline SVG only (Google Fonts <link> allowed), high contrast, safe margins. IMPORTANT: text must NEVER overlap — keep a single clean flex/grid layout with clear spacing. Return ONLY the full revised HTML document (start with <!doctype html>). No \`\`\` fences.`
        : `Design a self-contained HTML social poster image, EXACTLY ${w}×${h}px (set html,body{margin:0} and a root element of exactly ${w}px by ${h}px, box-sizing:border-box). It is screenshotted once — no animation needed.\n\n` +
          `STYLE: ${tpl.style}${palDir}\n\n` +
          (instruction ? `EXTRA REQUIREMENT: ${instruction}\n\n` : '') +
          `LAYOUT RULES (CRITICAL — bad layout = fail): lay the poster out as ONE vertical flexbox/grid column with generous padding and gap between blocks. Text elements must NEVER overlap each other or any shape/icon — give every block clear space; do NOT stack text with absolute/negative positioning. Use a clear type scale (one big headline + smaller supporting text). Keep the text SHORT so nothing is cramped, clipped, or runs off the ${w}×${h} canvas. Use line-height ≥1.2 and let blocks wrap naturally.\n\n` +
          `CONTENT: create the poster in VIETNAMESE about: "${topic}". Write compelling on-image Vietnamese text yourself (headline/quote/bullets as fits the style). Use only CSS + inline SVG (no external images/fonts except Google Fonts <link> which is allowed). Ensure all text fits inside the canvas with safe margins and high contrast.\n\n` +
          `Return ONLY the HTML document (start with <!doctype html>). No \`\`\` fences.`,
      timeoutSec: 150,
    });
      await this.maicUsage.meterMaic(userId, { runId: r.runId, kind: 'picture', costUsd: r.costUsd }).catch(() => undefined);
      let html = r.answer.trim();
      html = html.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
      if (/<!doctype|<html/i.test(html)) return html;
      this.logger.warn('picture poster: MAIC returned invalid HTML → using fallback poster');
    } catch (e) {
      this.logger.warn(`picture poster: MAIC failed (${(e as Error).message?.slice(0, 80)}) → using fallback poster`);
    }
    return buildFallbackPoster({ headline: topic.slice(0, 140), pal, w, h });
  }
}
