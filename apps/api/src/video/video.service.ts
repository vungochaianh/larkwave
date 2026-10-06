import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MaicService } from '../maic/maic.service';
import { MaicUsageService } from '../maic/maic-usage.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { AuthUser } from '../common/auth-user';
import { MarketingHistoryService } from '../media/marketing-history.service';
import { AttachmentService } from '../media/attachment.service';
import { MarketingDeliveryService } from '../delivery/marketing-delivery.service';
import { TtsService } from './tts.service';
import { RenderService } from './render.service';
import { VIDEO_TEMPLATES, aspectDims, getTemplate, type VideoTemplate } from './templates';
import { buildScene, buildCues, composeScene } from './fallback-scene';
import { PALETTE_OPTIONS, hashSeed, layoutVariant, paletteDirective, resolvePalette, type Palette } from '../media/palettes';
import { CHARACTER_OPTIONS, characterDirective, getCharacter, type Character } from '../media/characters';

interface CreateVideoInput {
  topic: string;
  template?: string;
  aspect?: string;
  palette?: string;
  character?: string;
  categoryId?: string;
  attachmentIds?: string[];
  voiceId?: string;
  title?: string;
}

@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly maic: MaicService,
    private readonly maicUsage: MaicUsageService,
    private readonly tts: TtsService,
    private readonly render: RenderService,
    private readonly notifications: NotificationsService,
    private readonly history: MarketingHistoryService,
    private readonly delivery: MarketingDeliveryService,
    private readonly attachments: AttachmentService,
  ) {}

  templates() {
    return VIDEO_TEMPLATES;
  }
  palettes() {
    return PALETTE_OPTIONS;
  }
  characters() {
    return CHARACTER_OPTIONS;
  }
  listVoices() {
    return this.tts.listVoices();
  }
  list(userId: string) {
    return this.prisma.videoProject.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100 });
  }
  async get(userId: string, id: string) {
    const p = await this.prisma.videoProject.findFirst({ where: { id, userId } });
    if (!p) throw new NotFoundException('Không tìm thấy video.');
    return p;
  }
  async remove(userId: string, id: string) {
    await this.prisma.videoProject.deleteMany({ where: { id, userId } });
    await this.history.deleteForProject(id);
    return { ok: true };
  }

  /** Version/commit history (create + each fix). */
  async listHistory(userId: string, id: string) {
    const p = await this.prisma.videoProject.findFirst({ where: { id, userId }, select: { id: true } });
    if (!p) throw new NotFoundException('Không tìm thấy video.');
    return this.history.list(userId, 'video', id);
  }

  /** Restore a previous version's result onto the project. */
  async restore(userId: string, id: string, editId: string) {
    const p = await this.prisma.videoProject.findFirst({ where: { id, userId }, select: { id: true } });
    if (!p) throw new NotFoundException('Không tìm thấy video.');
    const e = await this.history.get(userId, editId);
    if (!e || e.projectId !== id) throw new NotFoundException('Không tìm thấy phiên bản.');
    await this.prisma.videoProject.update({
      where: { id },
      data: { status: 'done', stage: '', error: null, videoUrl: e.mediaUrl, thumbnailUrl: e.thumbnailUrl, caption: e.caption, script: e.extra, durationSec: e.durationSec },
    });
    return { ok: true };
  }

  /** Insert the draft row (no render). Validates config + quota. */
  private async insert(userId: string, dto: CreateVideoInput, user?: AuthUser) {
    const topic = (dto.topic || '').trim();
    if (!topic) throw new BadRequestException('Thiếu chủ đề video.');
    if (!this.maic.enabled) throw new BadRequestException('Trợ lý AI (hosted) chưa được cấu hình — không tạo được kịch bản.');
    if (!this.tts.enabled) throw new BadRequestException('Giọng đọc (ElevenLabs) chưa được cấu hình.');
    // Quota / plan gate (mirror the interactive assistant). Best-effort user lookup.
    const u = user ?? (await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, role: true } })) ?? undefined;
    if (u) await this.maicUsage.assertMaicAllowed(u as AuthUser);
    const template = getTemplate(dto.template || 'draw').id;
    const aspect = dto.aspect === '16:9' ? '16:9' : '9:16';
    const palette = dto.palette || 'auto';
    const character = getCharacter(dto.character).id;
    return this.prisma.videoProject.create({
      data: { userId, title: (dto.title || topic).slice(0, 80), template, aspect, palette, character, categoryId: dto.categoryId || null, topic, voiceId: dto.voiceId || '', status: 'draft' },
    });
  }

  /** UI path: create the row, kick off the render in the background, return immediately. */
  async create(userId: string, dto: CreateVideoInput, user?: AuthUser) {
    const proj = await this.insert(userId, dto, user);
    // Manual create auto-delivers to the chosen Category's channels when done.
    void this.run(proj.id, '', { deliver: true, attachmentIds: dto.attachmentIds }).catch((e) => this.logger.error(`video ${proj.id} failed: ${(e as Error).message}`));
    return proj;
  }

  /** Scheduler path: create + AWAIT the full render, return the finished row for delivery. */
  async createAndAwait(userId: string, dto: CreateVideoInput) {
    const proj = await this.insert(userId, dto);
    await this.run(proj.id);
    const d = await this.prisma.videoProject.findUnique({ where: { id: proj.id } });
    return {
      id: proj.id,
      status: d?.status || 'error',
      title: d?.title || proj.title,
      error: d?.error ?? null,
      videoUrl: d?.videoUrl || '',
      thumbnailUrl: d?.thumbnailUrl || '',
      caption: d?.caption || '',
    };
  }

  async rerender(userId: string, id: string) {
    const p = await this.prisma.videoProject.findFirst({ where: { id, userId }, select: { id: true } });
    if (!p) throw new NotFoundException('Không tìm thấy video.');
    void this.run(id).catch((e) => this.logger.error(`video ${id} re-render failed: ${(e as Error).message}`));
    return { ok: true };
  }

  /** Refine: re-run EDITING the previous script + scene per the user's instruction (empty = plain redo). */
  async refine(userId: string, id: string, instruction: string) {
    const p = await this.prisma.videoProject.findFirst({ where: { id, userId }, select: { id: true } });
    if (!p) throw new NotFoundException('Không tìm thấy video.');
    void this.run(id, (instruction || '').trim()).catch((e) => this.logger.error(`video ${id} refine failed: ${(e as Error).message}`));
    return { ok: true };
  }

  /** The full pipeline (async): script → voice → scene → render. `instruction` (refine) edits the
   *  PREVIOUS script + scene instead of generating from scratch. Updates status/stage as it goes. */
  private async run(id: string, instruction = '', opts: { deliver?: boolean; attachmentIds?: string[] } = {}): Promise<void> {
    const p = await this.prisma.videoProject.findUnique({ where: { id } });
    if (!p) return;
    const set = (data: Record<string, unknown>) => this.prisma.videoProject.update({ where: { id }, data });
    try {
      const tpl = getTemplate(p.template);
      const { w, h } = aspectDims(p.aspect);
      // Palette + composition vary per project so videos don't all look the same. `auto` → picked
      // from the id-seed (stable across refine/rerender, different across videos).
      const seed = hashSeed(p.id);
      const pal = resolvePalette(p.palette, seed);
      const variant = layoutVariant(seed);
      const character = getCharacter(p.character);
      const att = await this.attachments.resolve(p.userId, opts.attachmentIds).catch(() => ({ sourceText: '', imageUrls: [] }));

      await set({ status: 'rendering', stage: 'script', error: null });
      const script = await this.genScript(p.userId, p.topic, tpl, instruction ? p.script : '', instruction, att.sourceText);
      const gm = await this.genMeta(p.userId, p.topic).catch(() => ({ title: '', caption: '' }));
      const caption = gm.caption;
      // Give a catchy AI title on first create (when the title is still the auto/topic default); keep the user's own title otherwise.
      const finalTitle = p.title === p.topic.slice(0, 80) && gm.title ? gm.title.slice(0, 80) : p.title;
      await set({ script, caption, title: finalTitle, stage: 'voice' });

      const audio = await this.tts.synth(script, p.voiceId);
      await set({ audioUrl: audio.url, durationSec: audio.durationSec, stage: 'scene' });

      // Captions: ONE at a time, timed to the exact spoken window (ElevenLabs alignment) → in sync,
      // never overlapping, no underline. Visuals: MAIC draws ILLUSTRATIONS ONLY (no text) and we
      // overlay the subtitles on top; if MAIC fails/times out, fall back to the clean text scene.
      const cues = buildCues(script.slice(0, 5000), audio.alignment, audio.durationSec);
      const art = await this.genSceneArt(p.userId, p.topic, tpl, p.aspect, w, h, audio.durationSec, pal, variant, character, script, instruction ? p.sceneHtml : '', instruction);
      const renderHtml = art ? composeScene(art, cues, w, h) : buildScene({ cues, durationSec: audio.durationSec, template: tpl.id, w, h, pal, variant, character: character.body });
      await set({ stage: 'render', sceneHtml: art }); // store raw art (for refine); '' when fallback used

      const out = await this.render.render({ sceneHtml: renderHtml, audioPath: audio.path, durationSec: audio.durationSec, w, h });
      await set({ status: 'done', stage: '', videoUrl: out.url, thumbnailUrl: out.thumbnailUrl || '' });
      await this.history.record({
        projectId: id, userId: p.userId, kind: 'video', instruction, title: finalTitle,
        caption, mediaUrl: out.url, thumbnailUrl: out.thumbnailUrl || '', extra: script, durationSec: audio.durationSec,
      });
      await this.notifications
        .notify(p.userId, 'system', `🎬 ${finalTitle}`, 'Video đã tạo xong.', `/marketing/video/library?id=${id}`)
        .catch(() => undefined);
      if (opts.deliver && p.categoryId) {
        await this.delivery
          .deliver(p.userId, p.categoryId, 'video', { title: finalTitle, caption, videoUrl: out.url, thumbnailUrl: out.thumbnailUrl || '' })
          .catch(() => undefined);
      }
    } catch (e) {
      await set({ status: 'error', stage: '', error: (e as Error)?.message?.slice(0, 500) || 'Lỗi tạo video.' }).catch(() => undefined);
    }
  }

  private async genScript(userId: string, topic: string, tpl: VideoTemplate, prevScript = '', instruction = '', sourceText = ''): Promise<string> {
    const src = sourceText ? `\n\nTÀI LIỆU THAM KHẢO (ưu tiên bám sát nội dung này, không bịa thông tin trái với tài liệu):\n"""\n${sourceText.slice(0, 8000)}\n"""\n` : '';
    const prompt =
      prevScript && instruction
        ? `Đây là KỊCH BẢN LỜI THOẠI hiện tại (tiếng Việt):\n"""\n${prevScript}\n"""\n\nHãy CHỈNH SỬA theo yêu cầu: "${instruction}". Giữ nguyên phần tốt, chỉ đổi theo yêu cầu. CHỈ trả về kịch bản mới (lời thoại thuần, không chú thích, không markdown), 90–140 từ.`
        : `Viết KỊCH BẢN LỜI THOẠI (chỉ lời nói, tiếng Việt) cho một video ngắn dạng short/reel ~45–65 giây về chủ đề: "${topic}".${src} Phong cách: ${tpl.name}.\n\n` +
          `YÊU CẦU để video CUỐN HÚT:\n` +
          `- CÂU MỞ ĐẦU là một HOOK mạnh trong 3 giây đầu (câu hỏi gây tò mò, con số bất ngờ, hoặc một khẳng định táo bạo) — KHÔNG mở đầu bằng "Xin chào" hay "Hôm nay".\n` +
          `- Giọng văn năng lượng, gần gũi, xưng "bạn"; câu NGẮN, dồn dập, dễ đọc thành tiếng.\n` +
          `- Triển khai mạch lạc (nếu là danh sách mẹo thì đánh số rõ: "Mẹo 1…", "Mẹo 2…").\n` +
          `- Câu KẾT là lời kêu gọi hành động ngắn gọn (rủ lưu lại / thử ngay / theo dõi).\n` +
          `- 95–135 từ. CHỈ trả về lời thoại thuần: KHÔNG tiêu đề, KHÔNG chú thích, KHÔNG markdown, KHÔNG emoji, KHÔNG ghi chú sân khấu.`;
    const r = await this.maic.ask({ endUser: { id: userId }, prompt, timeoutSec: 120 });
    await this.maicUsage.meterMaic(userId, { runId: r.runId, kind: 'video', costUsd: r.costUsd }).catch(() => undefined);
    return r.answer.trim().replace(/^["']|["']$/g, '').slice(0, 4000);
  }

  /** Catchy title + social caption (Vietnamese) in one call — for good "seed" videos. */
  private async genMeta(userId: string, topic: string): Promise<{ title: string; caption: string }> {
    const r = await this.maic.ask({
      endUser: { id: userId },
      systemPrompt: 'You output ONLY valid minified JSON. No markdown fences, no prose.',
      prompt:
        `Cho một video ngắn tiếng Việt về chủ đề: "${topic}".\n` +
        `Trả về JSON: {"title": tiêu đề CỰC HẤP DẪN kiểu giật tít/gây tò mò để hút xem (<=60 ký tự, tiếng Việt, KHÔNG hashtag, KHÔNG dấu ngoặc kép), "caption": 1–2 câu hấp dẫn kèm 3–5 hashtag}. Chỉ trả JSON, không giải thích.`,
      timeoutSec: 60,
    });
    await this.maicUsage.meterMaic(userId, { runId: r.runId, kind: 'video', costUsd: r.costUsd }).catch(() => undefined);
    let raw = r.answer.trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
    const a = raw.indexOf('{');
    const z = raw.lastIndexOf('}');
    if (a >= 0 && z > a) raw = raw.slice(a, z + 1);
    try {
      const j = JSON.parse(raw) as { title?: string; caption?: string };
      return { title: (j.title || '').replace(/^["']|["']$/g, '').trim().slice(0, 80), caption: (j.caption || '').trim().slice(0, 800) };
    } catch {
      return { title: '', caption: r.answer.trim().slice(0, 800) };
    }
  }

  /**
   * MAIC draws the ILLUSTRATION/animation layer only (NO text — captions are overlaid separately),
   * exposing window.TW.seek(t). Returns the art HTML, or '' on timeout/invalid → caller falls back
   * to the clean text scene. On refine, edits the previous art per the instruction.
   */
  private async genSceneArt(userId: string, topic: string, tpl: VideoTemplate, aspect: string, w: number, h: number, durationSec: number, pal: Palette, variant: number, character: Character, script = '', prevArt = '', instruction = ''): Promise<string> {
    const editing = !!(prevArt && instruction && /window\.TW/.test(prevArt));
    const palDir = paletteDirective(pal, variant) + characterDirective(character, 'scene');
    try {
      const r = await this.maic.ask({
      endUser: { id: userId },
        systemPrompt: 'You output ONLY a single self-contained HTML file. No markdown fences, no prose. Keep it compact.',
        prompt: editing
          ? `Here is the CURRENT self-contained HTML ART scene (window.TW={duration,fps,seek(t)}, canvas ${w}×${h}, NO text):\n"""\n${prevArt.slice(0, 24000)}\n"""\n\n` +
            `EDIT it per this instruction: "${instruction}". Keep the window.TW contract, canvas ${w}×${h}, duration ${durationSec}, pure deterministic seek(t) (no rAF/Date/setTimeout), keep it lively/animated and TEXT-FREE (no words/letters/numbers). Return ONLY the full revised HTML (start with <!doctype html>). No \`\`\` fences.`
          : `Create a self-contained animated HTML illustration scene for a ${aspect} social video (${w}×${h}px), duration ${durationSec}s, about: "${topic}". Style: ${tpl.style}${palDir}\n\n` +
            `Draw a FEW simple, clear ILLUSTRATIONS relevant to this narration (change/advance the imagery across the ${durationSec}s so it loosely tracks the ideas — do NOT write the words, just draw):\n"""\n${script.slice(0, 900)}\n"""\n\n` +
            `Keep constant gentle motion (a bobbing character/shapes, drifting accents) so it feels alive.\n\n` +
            `RULES: (1) NO text/words/letters/numbers anywhere — captions are overlaid separately; if you draw glyphs you fail. (2) Keep the lower 22% of the canvas clear for the subtitle. (3) Write COMPACT, efficient JavaScript (aim under ~120 lines) so it GENERATES FAST.\n\n` +
            `HARD CONTRACT: define \`window.TW = { duration: ${durationSec}, fps: 30, seek(t) }\`. seek(t) DETERMINISTICALLY draws the full frame for time t onto ONE <canvas> exactly ${w}×${h}, a pure function of t (no requestAnimationFrame/Date/performance.now/setTimeout), filling the canvas each frame.\n\n` +
            `Return ONLY the HTML document (start with <!doctype html>). No \`\`\` fences.`,
        timeoutSec: 196,
      });
      await this.maicUsage.meterMaic(userId, { runId: r.runId, kind: 'video', costUsd: r.costUsd }).catch(() => undefined);
      let html = r.answer.trim().replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim();
      if (/window\.TW/.test(html) && /<canvas|<!doctype|<html/i.test(html)) return html;
      this.logger.warn('video art: MAIC returned invalid HTML → clean text scene');
    } catch (e) {
      this.logger.warn(`video art: MAIC failed (${(e as Error).message?.slice(0, 80)}) → clean text scene`);
    }
    return '';
  }
}
