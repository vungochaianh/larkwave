import { LarkConvService } from './lark-conv.service';

/**
 * Hội thoại dùng chung: thứ tự phải ỔN ĐỊNH, và khoá lượt phải thật.
 *
 * Hai lỗi canh ở đây đều thuộc loại không kêu thành tiếng:
 *  (a) hai người gửi cùng lúc → hai dòng cùng `seq` → mỗi máy sắp một thứ tự khác nhau. Một cuộc
 *      trò chuyện mà mỗi người đọc một thứ tự còn tệ hơn không dùng chung.
 *  (b) máy của chủ báo lại cùng một lượt (mất mạng rồi thử lại) → agent "trả lời hai lần".
 */

/** Prisma giả, chỉ đủ cho đường đi của file này. `onCreate` cho phép dựng lại đúng ca đua nhau. */
function fakePrisma(opts: { onCreate?: (seq: number) => void } = {}) {
  const items: { id: string; convId: string; seq: number; turnId: string | null; role: string; text: string }[] = [];
  const turns: { id: string; convId: string | null; status: string; actorId: string }[] = [];
  const conv = {
    id: 'c1',
    grantId: 'g1',
    grant: { id: 'g1', ownerId: 'owner', granteeId: 'friend', status: 'active', expiresAt: null },
  };
  return {
    items,
    turns,
    larkSharedConv: {
      findFirst: async () => conv,
      findUnique: async () => conv,
      update: async () => conv,
      create: async () => conv,
      findMany: async () => [conv],
    },
    larkConvItem: {
      findFirst: async ({ where, orderBy }: never | any) => {
        if (orderBy?.seq === 'desc') {
          const mine = items.filter((i) => i.convId === where.convId);
          return mine.length ? mine.reduce((a, b) => (a.seq > b.seq ? a : b)) : null;
        }
        // tra theo turnId (dùng cho kiểm idempotent)
        return (
          items.find(
            (i) => i.convId === where.convId && i.turnId === where.turnId && where.role.in.includes(i.role),
          ) ?? null
        );
      },
      findMany: async ({ where }: any) =>
        items.filter((i) => i.convId === where.convId && i.seq > (where.seq?.gt ?? 0)).sort((a, b) => a.seq - b.seq),
      create: async ({ data }: any) => {
        opts.onCreate?.(data.seq);
        if (items.some((i) => i.convId === data.convId && i.seq === data.seq)) {
          throw Object.assign(new Error('unique'), { code: 'P2002' });
        }
        const row = { id: `i${items.length + 1}`, createdAt: new Date(), ...data };
        items.push(row);
        return row;
      },
    },
    larkGrantTurn: {
      findFirst: async ({ where }: any) =>
        turns.find((t) => t.convId === where.convId && where.status.in.includes(t.status)) ?? null,
      findMany: async () => turns.filter((t) => ['queued', 'running'].includes(t.status)),
      update: async ({ where, data }: any) => {
        // `submitTurn` ở bài kiểm là hàm giả, nó không chèn hàng — nên tạo hàng nếu chưa có.
        // (Prisma thật sẽ ném P2025; ở đây chỉ cần mô phỏng kết quả cuối.)
        let t = turns.find((x) => x.id === where.id);
        if (!t) {
          t = { id: where.id, convId: null, status: 'queued', actorId: 'friend' };
          turns.push(t);
        }
        Object.assign(t, data);
        return t;
      },
    },
    larkGrant: { findFirst: async () => conv.grant },
    user: { findUnique: async () => ({ name: 'Người thử' }) },
  } as never as ConstructorParameters<typeof LarkConvService>[0] & { items: typeof items; turns: typeof turns };
}

const fakeEvents = { publishUser: () => {}, publishAgent: () => {} } as never as ConstructorParameters<
  typeof LarkConvService
>[1];

describe('hội thoại dùng chung: thứ tự', () => {
  it('cấp seq tăng dần', async () => {
    const prisma = fakePrisma();
    const svc = new LarkConvService(prisma, fakeEvents);
    await svc.post('owner', 'c1', { text: 'chào' }, async () => ({ id: 't' }));
    await svc.post('friend', 'c1', { text: 'chào lại' }, async () => ({ id: 't' }));
    expect(prisma.items.map((i) => i.seq)).toEqual([1, 2]);
  });

  it('hai người gửi CÙNG LÚC vẫn ra hai số khác nhau', async () => {
    // Dựng lại đúng ca đua: lần ghi ĐẦU TIÊN bị chen ngang bởi một dòng khác cùng seq.
    let injected = false;
    const prisma = fakePrisma({
      onCreate: (seq) => {
        if (injected) return;
        injected = true;
        // "người kia" vừa chèn trước, chiếm mất số này.
        (prisma.items as never as { push: (x: unknown) => void }).push({
          id: 'other',
          convId: 'c1',
          seq,
          turnId: null,
          role: 'user',
          text: 'của người kia',
        });
      },
    });
    const svc = new LarkConvService(prisma, fakeEvents);
    const r = await svc.post('owner', 'c1', { text: 'của tôi' }, async () => ({ id: 't' }));
    const seqs = prisma.items.map((i) => i.seq).sort((a, b) => a - b);
    expect(new Set(seqs).size).toBe(seqs.length); // KHÔNG được trùng
    expect(r.seq).toBe(2); // người thua cuộc lùi xuống số kế tiếp
  });
});

describe('hội thoại dùng chung: khoá lượt', () => {
  it('đang có lượt chạy thì không ai gửi lượt mới được', async () => {
    const prisma = fakePrisma();
    prisma.turns.push({ id: 't1', convId: 'c1', status: 'running', actorId: 'friend' });
    const svc = new LarkConvService(prisma, fakeEvents);
    await expect(
      svc.post('owner', 'c1', { text: 'chạy đi', run: true }, async () => ({ id: 't2' })),
    ).rejects.toThrow(/đang chạy/);
  });

  it('nhưng NHẮN TIN thì vẫn được — chặn cả lời nhắn là hỏng đúng việc cần nhất', async () => {
    const prisma = fakePrisma();
    prisma.turns.push({ id: 't1', convId: 'c1', status: 'running', actorId: 'friend' });
    const svc = new LarkConvService(prisma, fakeEvents);
    const r = await svc.post('owner', 'c1', { text: 'khoan đã' }, async () => ({ id: 't2' }));
    expect(r.seq).toBe(1);
  });

  it.each(['friend', 'owner'])('%s chạy lượt thì PHẢI đi qua submitTurn của grant', async (who) => {
    const prisma = fakePrisma();
    const svc = new LarkConvService(prisma, fakeEvents);
    let went = false;
    await svc.post(who, 'c1', { text: 'làm hộ', run: true }, async () => {
      went = true;
      return { id: 't9' };
    });
    // Bất biến an ninh: MỘT đường thực thi duy nhất. Kể cả chủ cũng không có lối tắt — bỏ qua
    // submitTurn là bỏ qua cả hạn mức lẫn quyền ghi theo từng Base, và thành hai chỗ phải rà.
    expect(went).toBe(true);
    expect(prisma.items[0].turnId).toBe('t9');
  });
});

describe('hội thoại dùng chung: kết quả lượt', () => {
  it('báo lại cùng một lượt KHÔNG đẻ ra hai câu trả lời', async () => {
    const prisma = fakePrisma();
    const svc = new LarkConvService(prisma, fakeEvents);
    await svc.appendTurnResult('t1', 'c1', 'xong rồi', true);
    await svc.appendTurnResult('t1', 'c1', 'xong rồi', true);
    expect(prisma.items.filter((i) => i.role === 'agent')).toHaveLength(1);
  });

  it('lượt hỏng ghi vào luồng dưới dạng system, không phải câu trả lời của agent', async () => {
    const prisma = fakePrisma();
    const svc = new LarkConvService(prisma, fakeEvents);
    await svc.appendTurnResult('t1', 'c1', 'Lượt chạy thất bại: hết hạn mức', false);
    expect(prisma.items[0].role).toBe('system');
  });
});
