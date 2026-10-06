import { MarketingScheduleService } from './marketing-schedule.service';

/**
 * Canh CÁI NỐI giữa "sinh bài" và "đăng lên site". Các hàm SEO đã có test riêng
 * (blog-seo.spec.ts); chỗ này canh thứ khác hẳn, và đều là lỗi im lặng:
 *
 *  (a) Lịch KHÔNG bật cờ mà vẫn đăng → bài nội bộ bỗng nằm công khai trên /blog. Không ai
 *      hoàn tác được chuyện đã lên Google.
 *  (b) Đăng lỗi mà ném ra ngoài → kéo đổ luôn nhánh gửi Telegram của cùng lượt chạy.
 *  (c) Bài rỗng vẫn đăng → trang mỏng, kéo tụt đánh giá của cả site. Đúng cái mục tiêu traffic
 *      mà tính năng này sinh ra để phục vụ.
 */

/** Gọi hàm private qua chỉ số chuỗi — đây là ranh giới muốn canh, không phải API công khai. */
const publish = (svc: MarketingScheduleService, s: unknown, built: unknown) =>
  (svc as unknown as { publishToSiteBlog: (a: unknown, b: unknown) => Promise<unknown> }).publishToSiteBlog(s, built);

function makeService(createImpl?: (...a: unknown[]) => Promise<unknown>) {
  const calls: Record<string, unknown>[] = [];
  const sitePost = {
    createFromSchedule: async (userId: string, author: string, dto: Record<string, unknown>) => {
      calls.push({ userId, author, dto });
      if (createImpl) return createImpl(userId, author, dto);
      return { slug: 'bai-viet-moi' };
    },
  };
  const svc = new MarketingScheduleService(
    {} as never, {} as never, {} as never, {} as never,
    sitePost as never,
    {} as never, {} as never,
  );
  return { svc, calls };
}

const schedule = (over: Record<string, unknown> = {}) => ({
  id: 's1', userId: 'u1', kind: 'blog', publishToBlog: true,
  topic: 'tạo web app bằng AI', template: 'howto', ...over,
});
const built = (over: Record<string, unknown> = {}) => ({
  id: 'b1', status: 'done', title: 'Cách dựng web app bằng AI', error: null,
  body: '# Mở đầu\n\nNội dung **thật** ở đây.', caption: 'Tóm tắt ngắn.', coverUrl: 'https://x/y.png', ...over,
});

describe('publishToSiteBlog', () => {
  it('KHÔNG đăng khi lịch chưa bật cờ', async () => {
    const { svc, calls } = makeService();
    expect(await publish(svc, schedule({ publishToBlog: false }), built())).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('KHÔNG đăng khi lịch không phải kind blog', async () => {
    const { svc, calls } = makeService();
    expect(await publish(svc, schedule({ kind: 'video' }), built())).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('KHÔNG đăng bài rỗng — trang mỏng kéo tụt cả site', async () => {
    const { svc, calls } = makeService();
    const r = (await publish(svc, schedule(), built({ body: '   ' }))) as { error: string };
    expect(r.error).toMatch(/rỗng/);
    expect(calls).toHaveLength(0);
  });

  it('đăng với đủ trường SEO, trạng thái published', async () => {
    const { svc, calls } = makeService();
    const r = (await publish(svc, schedule(), built())) as { slug: string };
    expect(r.slug).toBe('bai-viet-moi');
    expect(calls).toHaveLength(1);
    const dto = calls[0].dto as Record<string, unknown>;
    expect(dto.status).toBe('published');
    expect(dto.seoTitle).toBe('Cách dựng web app bằng AI · Larkwave');
    expect(dto.seoDescription).toBe('Tóm tắt ngắn.');
    expect(dto.coverImage).toBe('https://x/y.png');
    expect((dto.tags as string[])[0]).toBe('howto');
    expect(calls[0].userId).toBe('u1');
  });

  it('lỗi khi đăng thì TRẢ VỀ lỗi, không ném — nhánh Telegram phải sống', async () => {
    const { svc } = makeService(async () => {
      throw new Error('DB sập');
    });
    const r = (await publish(svc, schedule(), built())) as { error: string };
    expect(r.error).toBe('DB sập');
  });
});
