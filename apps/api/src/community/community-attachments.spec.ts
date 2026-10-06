import { CommunityService } from './community.service';

/**
 * Hai luật của Cộng đồng mà sai thì KHÔNG kêu thành lỗi:
 *
 *  1. Đính kèm nằm trong cột Json, nên CSDL không bảo đảm hình dạng — dữ liệu cũ, một lần ghi tay,
 *     hay một bản vá hỏng đều để lại rác. Rác đó đi THẲNG ra trang công khai, vào thuộc tính
 *     `src`/`href`. Một `javascript:` lọt qua là một lỗ XSS.
 *
 *  2. Trả lời chỉ MỘT cấp, và cha phải thuộc ĐÚNG bài đang xem. Thiếu điều kiện thứ hai thì gửi
 *     id bình luận của bài khác sẽ ghép một nhánh trả lời vào bài không liên quan.
 */

/** Prisma giả, chỉ đủ cho đường đi được kiểm. */
function fakePrisma(comments: { id: string; postId: string; parentId: string | null }[] = []) {
  const created: Record<string, unknown>[] = [];
  return {
    created,
    socialPost: {
      findUnique: async () => ({ id: 'p1' }),
      create: async ({ data }: never | any) => {
        created.push(data);
        return { ...data, id: 'new', createdAt: new Date(), author: { id: 'u1', name: 'Ai đó', email: 'a@b.c', avatarUrl: null } };
      },
    },
    socialComment: {
      findFirst: async ({ where }: never | any) =>
        comments.find((c) => c.id === where.id && c.postId === where.postId) ?? null,
      create: async ({ data }: never | any) => {
        created.push(data);
        return { ...data, id: 'c-new', createdAt: new Date(), author: { id: 'u1', name: 'Ai đó', email: 'a@b.c', avatarUrl: null } };
      },
    },
  } as never as ConstructorParameters<typeof CommunityService>[0] & { created: typeof created };
}

/** Config giả: các bài kiểm ở đây không chạm đĩa, chỉ cần constructor nhận đủ tham số. */
const fakeConfig = { uploadsDir: '/tmp/tw-test-uploads', publicApiUrl: 'https://api.test' } as never as ConstructorParameters<
  typeof CommunityService
>[1];

const user = { id: 'u1', email: 'a@b.c', role: 'user' } as never as Parameters<
  CommunityService['createPost']
>[0];

describe('Cộng đồng: đính kèm phải được lọc', () => {
  it('chặn javascript: và data: — chúng đi vào src/href của trang công khai', async () => {
    const prisma = fakePrisma();
    const svc = new CommunityService(prisma, fakeConfig);
    const r = await svc.createPost(user, 'xem này', [
      { url: 'javascript:alert(1)', name: 'x', mime: 'image/png', size: 1 },
      { url: 'data:text/html,<script>', name: 'y', mime: 'image/png', size: 1 },
      { url: '/uploads/images/ok.png', name: 'thật', mime: 'image/png', size: 10 },
      { url: 'https://cdn.example.com/a.png', name: 'ngoài', mime: 'image/png', size: 10 },
    ]);
    expect(r.attachments.map((a) => a.url)).toEqual([
      '/uploads/images/ok.png',
      'https://cdn.example.com/a.png',
    ]);
  });

  it('dữ liệu rác trong cột Json không làm vỡ bài đăng', async () => {
    const prisma = fakePrisma();
    const svc = new CommunityService(prisma, fakeConfig);
    const r = await svc.createPost(user, 'x', [null, 'chuỗi', 42, {}] as never);
    expect(r.attachments).toEqual([]);
  });

  it('bài CHỈ có ảnh là hợp lệ — đừng bắt người ta gõ một dấu chấm cho qua cửa', async () => {
    const prisma = fakePrisma();
    const svc = new CommunityService(prisma, fakeConfig);
    const r = await svc.createPost(user, '', [
      { url: '/uploads/images/a.png', name: 'a', mime: 'image/png', size: 1 },
    ]);
    expect(r.attachments).toHaveLength(1);
    expect(r.content).toBe('');
  });

  it('không ảnh mà cũng không chữ thì vẫn phải từ chối', async () => {
    const svc = new CommunityService(fakePrisma(), fakeConfig);
    await expect(svc.createPost(user, '   ')).rejects.toThrow();
  });
});

describe('Cộng đồng: trả lời chỉ một cấp', () => {
  it('trả lời một TRẢ LỜI thì gắn lên cha của nó, không đẻ tầng ba', async () => {
    const prisma = fakePrisma([
      { id: 'goc', postId: 'p1', parentId: null },
      { id: 'traloi', postId: 'p1', parentId: 'goc' },
    ]);
    const svc = new CommunityService(prisma, fakeConfig);
    const r = await svc.addComment(user, 'p1', 'nói thêm', 'traloi');
    expect(r.parentId).toBe('goc');
  });

  it('cha thuộc bài KHÁC thì từ chối — nếu không nhánh trả lời ghép nhầm bài', async () => {
    const prisma = fakePrisma([{ id: 'cua-bai-khac', postId: 'p2', parentId: null }]);
    const svc = new CommunityService(prisma, fakeConfig);
    await expect(svc.addComment(user, 'p1', 'x', 'cua-bai-khac')).rejects.toThrow();
  });

  it('không có cha thì là bình luận gốc', async () => {
    const svc = new CommunityService(fakePrisma(), fakeConfig);
    const r = await svc.addComment(user, 'p1', 'chào');
    expect(r.parentId).toBeNull();
  });
});
