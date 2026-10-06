export type MakeBlogTemplateId = 'howto' | 'listicle' | 'news' | 'story';

export interface MakeBlogTemplate {
  id: MakeBlogTemplateId;
  name: string;
  description: string;
  /** Guidance injected into the article-writing prompt. */
  style: string;
  /** Guidance for the cover image. */
  /**
   * Phong cách ảnh bìa. KHÔNG được bảo mô hình viết tiêu đề/headline lên ảnh.
   *
   * Cả bốn kiểu trước đây đều nói "title" / "big number + title" / "headline over a banner", trong
   * khi prompt ở makeblog.service lại CẤM in tiêu đề. Prompt tự mâu thuẫn thì mô hình theo câu cụ
   * thể hơn — và nó theo câu ở đây. Đo trên bài thật sinh SAU khi vá: tiêu đề vẫn nằm trong ảnh.
   *
   * Bài học: thêm một lệnh cấm mà để nguyên câu bảo làm ngược lại thì lệnh cấm không có tác dụng,
   * và chuyện đó không kêu thành lỗi — chỉ ra một tấm ảnh sai.
   */
  coverStyle: string;
}

export const MAKEBLOG_TEMPLATES: MakeBlogTemplate[] = [
  {
    id: 'howto',
    name: 'Hướng dẫn (How-to)',
    description: 'Bài hướng dẫn từng bước, rõ ràng, dễ làm theo.',
    style: 'A practical step-by-step how-to guide: short intro, numbered steps as ## headings, concrete tips, brief conclusion.',
    coverStyle: 'clean instructional cover: a step/checklist diagram as the subject, brand accent, professional. NO title text.',
  },
  {
    id: 'listicle',
    name: 'Danh sách (Listicle)',
    description: 'Bài dạng “N điều/mẹo…”, mỗi mục ngắn gọn.',
    style: 'A listicle: a hook intro then N clearly numbered items as ## headings, each 2–4 sentences, ending with a takeaway.',
    coverStyle: 'punchy listicle cover: one big NUMBER as the hero element, energetic colors, bold sans-serif. NO title text.',
  },
  {
    id: 'news',
    name: 'Tin tức / Cập nhật',
    description: 'Bài tin ngắn gọn, khách quan, có bối cảnh.',
    style: 'A concise news/update article: a lede answering what/when/why, supporting context, neutral tone, short paragraphs.',
    coverStyle: 'editorial news cover: a clean symbolic illustration, restrained palette, credible look. NO headline text.',
  },
  {
    id: 'story',
    name: 'Kể chuyện / Chia sẻ',
    description: 'Bài chia sẻ trải nghiệm, giọng gần gũi, cuốn hút.',
    style: 'A first-person story/opinion piece: engaging hook, a narrative arc with a couple of ## sub-sections, a reflective ending.',
    coverStyle: 'warm storytelling cover: an evocative scene or object, soft gradient, friendly shapes. NO title text.',
  },
];

export function getMakeBlogTemplate(id: string): MakeBlogTemplate {
  return MAKEBLOG_TEMPLATES.find((t) => t.id === id) ?? MAKEBLOG_TEMPLATES[0];
}

/** Blog cover image dimensions (OG-style 1.91:1). */
export const BLOG_COVER = { w: 1200, h: 630 };
