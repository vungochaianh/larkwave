/**
 * Cấp tài khoản thay mặt một hệ ngoài — ba luật, và cả ba đều là chốt bảo mật.
 *
 * Đường này đổi "id người dùng của hệ khác" lấy một token Larkwave. Nó cần thiết để người dùng
 * Social Wave chỉ phải đăng nhập MỘT lần, nhưng cũng là chỗ dễ mở cửa hậu nhất của cả tính năng.
 *
 * Luật quan trọng nhất là luật thứ hai: liên kết theo `externalId`, KHÔNG theo email. Liên kết
 * theo email thì một hệ ngoài chỉ cần khai "người dùng của tôi có email <admin>" là nhận được
 * token của tài khoản đó — tức CHIẾM tài khoản, không phải tạo tài khoản.
 */
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { AuthService } from './auth.service';

type U = { id: string; email: string; status: string; externalId: string | null; role: string };

/** Dựng một AuthService chỉ đủ cho `linkServiceAccount` — không nhấc cả Nest lên. */
function dungService(seed: U[] = []) {
  const users = [...seed];
  const signed: U[] = [];
  const prisma = {
    user: {
      findUnique: async ({ where }: { where: { externalId?: string; email?: string } }) =>
        users.find((u) =>
          where.externalId !== undefined ? u.externalId === where.externalId : u.email === where.email,
        ) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const u = { id: `u${users.length + 1}`, ...(data as object) } as U;
        users.push(u);
        return u;
      },
    },
  };
  const svc = Object.create(AuthService.prototype) as AuthService;
  // Gán qua một khung nhìn KHÔNG có kiểu: `prisma`/`audit`/`sign` là private readonly, nên gán
  // thẳng qua kiểu `AuthService` không biên dịch được. Jest vẫn chạy (nó bỏ qua kiểu) — và đó
  // chính là cách một bài kiểm "đạt" mà typecheck lại hỏng, đúng lớp lỗi vừa gặp ở Social Wave.
  const w = svc as unknown as Record<string, unknown>;
  w.prisma = prisma;
  w.audit = { log: async () => undefined };
  // `sign` thật ký JWT; ở đây chỉ cần biết NÓ ĐƯỢC GỌI VỚI AI.
  w.sign = async (u: U) => {
    signed.push(u);
    return { token: `tok-${u.id}`, user: u };
  };
  return { svc, users, signed };
}

// `ensureIdentity` là một hàm module-level trong auth.service; vô hiệu hoá để không chạm DB thật.
jest.mock('../common/identity', () => ({ ensureIdentity: jest.fn(async () => undefined) }), {
  virtual: true,
});

describe('linkServiceAccount', () => {
  it('tạo tài khoản mới khi chưa có liên kết', async () => {
    const { svc, users, signed } = dungService();
    await svc.linkServiceAccount({ provider: 'fbinbox', externalId: '1234', email: 'a@x.vn' });
    expect(users).toHaveLength(1);
    expect(users[0].externalId).toBe('fbinbox:1234');
    expect(signed[0].externalId).toBe('fbinbox:1234');
  });

  it('gọi lại cùng externalId thì DÙNG LẠI tài khoản cũ, không tạo thêm', async () => {
    const seed: U[] = [
      { id: 'u1', email: 'a@x.vn', status: 'active', externalId: 'fbinbox:1234', role: 'user' },
    ];
    const { svc, users, signed } = dungService(seed);
    await svc.linkServiceAccount({ provider: 'fbinbox', externalId: '1234' });
    expect(users).toHaveLength(1);
    expect(signed[0].id).toBe('u1');
  });

  it('TỪ CHỐI khi email trùng một tài khoản đã có — đây là chốt chống chiếm tài khoản', async () => {
    // Kịch bản thật: hệ ngoài khai email của quản trị viên. Nếu liên kết theo email, nó nhận được
    // token của tài khoản đó.
    const seed: U[] = [
      { id: 'admin', email: 'admin@toolswave.net', status: 'active', externalId: null, role: 'admin' },
    ];
    const { svc, users, signed } = dungService(seed);
    await expect(
      svc.linkServiceAccount({ provider: 'fbinbox', externalId: '999', email: 'admin@toolswave.net' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(users).toHaveLength(1); // không tạo gì
    expect(signed).toHaveLength(0); // và TUYỆT ĐỐI không ký token cho ai
  });

  it('tài khoản bị khoá thì không cấp token', async () => {
    const seed: U[] = [
      { id: 'u1', email: 'a@x.vn', status: 'suspended', externalId: 'fbinbox:1', role: 'user' },
    ];
    const { svc, signed } = dungService(seed);
    await expect(svc.linkServiceAccount({ provider: 'fbinbox', externalId: '1' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(signed).toHaveLength(0);
  });

  it('chặn provider/externalId không hợp lệ', async () => {
    const { svc } = dungService();
    for (const bad of [
      { provider: 'fb inbox', externalId: '1' },
      { provider: 'a', externalId: '1' },
      { provider: '../etc', externalId: '1' },
      { provider: 'fbinbox', externalId: '' },
      { provider: 'fbinbox', externalId: 'x'.repeat(129) },
    ]) {
      await expect(svc.linkServiceAccount(bad)).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('không có email thì vẫn tạo được, và email nội bộ phải duy nhất theo externalId', async () => {
    const { svc, users } = dungService();
    await svc.linkServiceAccount({ provider: 'fbinbox', externalId: 'a1' });
    await svc.linkServiceAccount({ provider: 'fbinbox', externalId: 'a2' });
    expect(users[0].email).not.toBe(users[1].email);
  });
});
