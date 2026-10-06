export type PictureTemplateId = 'quote' | 'announce' | 'tip' | 'promo';

export interface PictureTemplate {
  id: PictureTemplateId;
  name: string;
  description: string;
  /** Visual-style guidance injected into the poster-generation prompt. */
  style: string;
}

export const PICTURE_TEMPLATES: PictureTemplate[] = [
  {
    id: 'quote',
    name: 'Trích dẫn (Quote)',
    description: 'Ảnh trích dẫn — câu nói nổi bật giữa nền gradient sang trọng.',
    style:
      'ELEGANT QUOTE CARD: a rich gradient or solid brand background, a large centered Vietnamese quote in a bold serif/display webfont, a small author/handle line, tasteful padding and a subtle decorative mark (quotation glyph). High contrast, lots of negative space, poster-grade typography.',
  },
  {
    id: 'announce',
    name: 'Thông báo',
    description: 'Ảnh thông báo/sự kiện — tiêu đề lớn, thông tin rõ ràng.',
    style:
      'ANNOUNCEMENT POSTER: a bold headline (Vietnamese) top or center, a short supporting line, optional date/CTA chip, strong color blocking with a brand accent, clean sans-serif, clear visual hierarchy so it reads at a glance on a phone.',
  },
  {
    id: 'tip',
    name: 'Mẹo / Infographic',
    description: 'Thẻ mẹo — vài gạch đầu dòng ngắn gọn, biểu tượng đơn giản.',
    style:
      'TIP / MINI-INFOGRAPHIC CARD: a clear title, 3–5 short Vietnamese bullet points each with a simple drawn/emoji-like icon, a light background with an accent header bar, comfortable spacing, friendly and legible.',
  },
  {
    id: 'promo',
    name: 'Khuyến mãi / Sản phẩm',
    description: 'Ảnh quảng cáo — nổi bật ưu đãi, lời kêu gọi hành động.',
    style:
      'PROMO / SALE CARD: an eye-catching offer (big % or price), product/benefit line, a bright CTA button shape, energetic colors with a brand accent, badges/starbursts allowed, bold and punchy.',
  },
];

export function getPictureTemplate(id: string): PictureTemplate {
  return PICTURE_TEMPLATES.find((t) => t.id === id) ?? PICTURE_TEMPLATES[0];
}

/** Pixel dimensions for a picture aspect. */
export function pictureDims(aspect: string): { w: number; h: number } {
  if (aspect === '16:9') return { w: 1200, h: 675 };
  if (aspect === '4:5') return { w: 1080, h: 1350 };
  return { w: 1080, h: 1080 }; // 1:1 default
}
