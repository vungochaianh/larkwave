import { StoreService } from './store.service';
import type { AppConfigService } from '../config/app-config.service';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Cửa hàng đọc dữ liệu của HAI hệ, nên những gì phải giữ đúng nằm ở chỗ nối.
 *
 * Nhánh portal (giai đoạn 1): giá về đúng số, ba hình dạng trả lời khác nhau phải cùng ra một
 * kiểu, và — quan trọng nhất — những trường nội bộ của portal (giá vốn, đường giao hàng) KHÔNG
 * được lọt ra ngoài. Đây là thứ không thể "nhìn là biết": `GET /api/shop/software` của portal trả
 * `priceCost` công khai, nên nếu cổng này chép cả bản ghi thì giá vốn lên thẳng trang bán mà không
 * ai hay.
 *
 * Nhánh cơ sở dữ liệu (giai đoạn 2): cùng một luật đó, và ở đây nó còn dễ quên hơn vì dữ liệu là
 * của chính mình — `Listing.deliveryEnc` (driveLink/zipFileUrl/gitlabRepoId đã mã hoá) và
 * `Listing.notesInternal` nằm ngay cạnh các cột được bày ra. Thêm vào đó là LUẬT CHỌN NGUỒN: nó
 * quyết định cửa hàng còn đứng được hay không khi một bản nhập hỏng giữa chừng, nên nó phải có
 * bài kiểm riêng chứ không chỉ có chú thích.
 */
describe('StoreService', () => {
  const config = {
    env: {
      PORTAL_API_BASE: 'https://portal.test/api',
      PORTAL_PUBLIC_URL: 'https://portal.test',
    },
  } as unknown as AppConfigService;

  /**
   * Prisma giả. Mặc định là "bảng rỗng" — đúng trạng thái của máy chủ thật hôm nay, nên 13 bài
   * kiểm của giai đoạn 1 chạy qua đây mà không phải biết gì về nguồn thứ hai.
   */
  function mockPrisma(rows: Record<string, unknown>[] = []): PrismaService {
    const hop = (where: Record<string, unknown>) =>
      rows.filter(
        (r) =>
          r.kind === where.kind &&
          r.status === (where.status ?? 'active') &&
          (where.slug === undefined || r.slug === where.slug),
      );
    return {
      listing: {
        findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => hop(where)),
        findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => hop(where)[0] ?? null),
      },
    } as unknown as PrismaService;
  }

  /** Prisma giả luôn ném — máy chủ chưa chạy migration thì bảng `Listing` chưa tồn tại. */
  function prismaHong(): PrismaService {
    const no = async () => {
      throw new Error('relation "Listing" does not exist');
    };
    return { listing: { findMany: jest.fn(no), findFirst: jest.fn(no) } } as unknown as PrismaService;
  }

  /** Một dòng `Listing` như Prisma trả về sau khi đã lọc cột. */
  function dong(over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      kind: 'sourcecode',
      status: 'active',
      slug: 'flowpilot',
      name: 'FlowPilot',
      descriptionShort: 'no-code',
      description: 'dài',
      thumbnailUrl: null,
      gallery: [],
      priceVnd: 100000,
      category: 'Web App',
      totalSold: 0,
      detail: { languages: ['Next.js', 'Prisma'], version: '1.0.0' },
      createdAt: new Date('2026-07-06T16:11:48.205Z'),
      updatedAt: new Date('2026-09-20T10:00:00.000Z'),
      _count: { inventory: 0 },
      ...over,
    };
  }

  const SOFTWARE = {
    items: [
      {
        id: 'u1',
        name: 'Viettel 5G480B',
        slug: 'viettel-5g480b',
        category: 'Mạng 4G',
        description: 'dài',
        descriptionShort: 'ngắn',
        thumbnailUrl: null,
        priceCost: '50000',
        priceRetail: '100000',
        inventoryType: 'PACKAGE',
        totalSold: 3,
        status: 'ACTIVE',
        createdAt: '2026-04-16T02:44:44.008Z',
        updatedAt: '2026-06-25T17:51:23.489Z',
      },
    ],
    total: 1,
    page: 1,
    limit: 100,
    totalPages: 1,
  };

  /** Mã nguồn trả `{items, pagination:{...}}` — KHÁC hai loại kia. */
  const SOURCECODE = {
    items: [
      {
        id: 's1',
        name: 'FlowPilot',
        slug: 'flowpilot',
        version: '1.0.0',
        category: 'Web App',
        descriptionShort: 'no-code',
        thumbnailUrl: null,
        languages: ['Next.js', 'Prisma'],
        price: '100000',
        totalSold: 0,
        status: 'ACTIVE',
        createdAt: '2026-07-06T16:11:48.205Z',
      },
    ],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
  };

  function mockFetch(routes: Record<string, unknown>) {
    return jest.fn(async (url: string) => {
      const path = url.replace('https://portal.test/api', '').split('?')[0];
      const data = routes[path];
      if (data === undefined) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ success: true, data }) };
    }) as unknown as typeof fetch;
  }

  // ── Giai đoạn 1: đọc portal ────────────────────────────────────────────────

  it('không để lọt trường nội bộ của portal (giá vốn) ra ngoài', async () => {
    global.fetch = mockFetch({ '/shop/software': SOFTWARE });
    const svc = new StoreService(config, mockPrisma());
    const { items } = await svc.list('software', { page: 1, pageSize: 12 });
    expect(items).toHaveLength(1);
    expect(JSON.stringify(items[0])).not.toContain('50000');
    expect(items[0] as unknown as Record<string, unknown>).not.toHaveProperty('priceCost');
  });

  it('giá của portal là CHUỖI thập phân — phải về số', async () => {
    global.fetch = mockFetch({ '/shop/software': SOFTWARE });
    const svc = new StoreService(config, mockPrisma());
    const { items } = await svc.list('software', { page: 1, pageSize: 12 });
    expect(items[0].priceVnd).toBe(100000);
    expect(items[0].buyUrl).toBe('https://portal.test/shop/software/viettel-5g480b');
  });

  it('ảnh của portal là đường dẫn tương đối — phải thành địa chỉ đầy đủ', async () => {
    // Portal trả `/products/sheet1/x.png`, tương đối với CHÍNH NÓ. Chép nguyên sang trang nền tảng
    // thì trình duyệt hỏi https://toolswave.net/products/… và nhận 404 — đúng 6 ảnh hỏng đo được
    // trên /store ngày 23/09/2026.
    global.fetch = mockFetch({
      '/shop/software': {
        ...SOFTWARE,
        items: [{ ...SOFTWARE.items[0], thumbnailUrl: '/products/sheet1/x.png' }],
      },
    });
    const svc = new StoreService(config, mockPrisma());
    const { items } = await svc.list('software', { page: 1, pageSize: 12 });
    expect(items[0].thumbnailUrl).toBe('https://portal.test/products/sheet1/x.png');
  });

  it('ảnh đã có địa chỉ đầy đủ thì để nguyên', async () => {
    // Portal có thể chuyển sang CDN bất cứ lúc nào mà không báo bên này; nối thêm gốc vào một địa
    // chỉ đã đầy đủ là tự tay làm hỏng đường ảnh đang chạy tốt.
    global.fetch = mockFetch({
      '/shop/software': {
        ...SOFTWARE,
        items: [{ ...SOFTWARE.items[0], thumbnailUrl: 'https://cdn.test/x.png' }],
      },
    });
    const svc = new StoreService(config, mockPrisma());
    const { items } = await svc.list('software', { page: 1, pageSize: 12 });
    expect(items[0].thumbnailUrl).toBe('https://cdn.test/x.png');
  });

  it('hai hình dạng trả lời khác nhau cùng ra một kiểu', async () => {
    global.fetch = mockFetch({ '/shop/sourcecode': SOURCECODE });
    const svc = new StoreService(config, mockPrisma());
    const { items, total } = await svc.list('sourcecode', { page: 1, pageSize: 12 });
    expect(total).toBe(1);
    expect(items[0].priceVnd).toBe(100000);
    expect(items[0].detail.languages).toEqual(['Next.js', 'Prisma']);
    // Mã nguồn bán bản sao → không có khái niệm hết hàng.
    expect(items[0].inStock).toBeNull();
  });

  it('chỉ phần mềm mới có tồn kho, và hết suất là hết hàng', async () => {
    global.fetch = mockFetch({
      '/shop/software': SOFTWARE,
      '/shop/software/viettel-5g480b': { ...SOFTWARE.items[0], availableCount: 0 },
    });
    const svc = new StoreService(config, mockPrisma());
    const item = await svc.detail('software', 'viettel-5g480b');
    expect(item.inStock).toBe(false);
    expect(item.detail.availableCount).toBe(0);
    // Chi tiết mới có mô tả đầy đủ; danh sách để null cho nhẹ.
    expect(item.description).toBe('dài');
  });

  it('lọc chuyên mục + tìm kiếm chạy trên TOÀN danh mục, không chỉ trang đang xem', async () => {
    global.fetch = mockFetch({ '/shop/software': SOFTWARE });
    const svc = new StoreService(config, mockPrisma());
    expect((await svc.list('software', { page: 1, pageSize: 12, category: 'mạng 4g' })).total).toBe(1);
    expect((await svc.list('software', { page: 1, pageSize: 12, search: 'VIETTEL' })).total).toBe(1);
    expect((await svc.list('software', { page: 1, pageSize: 12, search: 'không có' })).total).toBe(0);
    expect(await svc.categories('software')).toEqual([{ name: 'Mạng 4G', count: 1 }]);
  });

  it('portal hỏng thì trả bản đã đệm, không trả cửa hàng trắng', async () => {
    global.fetch = mockFetch({ '/shop/software': SOFTWARE });
    const svc = new StoreService(config, mockPrisma());
    await svc.list('software', { page: 1, pageSize: 12 });
    // Hết hạn đệm + portal chết.
    (svc as unknown as { cache: Map<string, { at: number }> }).cache.get('software')!.at = 0;
    global.fetch = mockFetch({});
    const again = await svc.list('software', { page: 1, pageSize: 12 });
    expect(again.items).toHaveLength(1);
  });

  it('gộp hai cách viết của cùng một công nghệ, hiện cách viết phổ biến hơn', async () => {
    // Dữ liệu portal nhập tay: `Tailwind CSS` (93 dự án) và `TailwindCSS` (1) là hai mục riêng.
    // Để nguyên thì người lọc theo mục này mất trắng dự án nằm ở mục kia mà không hề biết.
    global.fetch = mockFetch({
      '/shop/sourcecode': {
        items: [
          { ...SOURCECODE.items[0], slug: 'a', languages: ['Tailwind CSS'] },
          { ...SOURCECODE.items[0], slug: 'b', languages: ['Tailwind CSS'] },
          { ...SOURCECODE.items[0], slug: 'c', languages: ['TailwindCSS'] },
        ],
        pagination: { page: 1, limit: 100, total: 3, totalPages: 1 },
      },
    });
    const svc = new StoreService(config, mockPrisma());
    expect(await svc.languages('sourcecode')).toEqual([{ name: 'Tailwind CSS', count: 3 }]);
    // Lọc bằng CÁCH VIẾT NÀO cũng phải ra đủ ba.
    expect((await svc.list('sourcecode', { page: 1, pageSize: 12, language: 'Tailwind CSS' })).total).toBe(3);
    expect((await svc.list('sourcecode', { page: 1, pageSize: 12, language: 'tailwindcss' })).total).toBe(3);
  });

  it('một dự án khai trùng hai cách viết chỉ đếm một lần', async () => {
    // Nếu không, con số trên chip lớn hơn số dự án lọc ra được — bấm vào là thấy hụt.
    global.fetch = mockFetch({
      '/shop/sourcecode': {
        items: [{ ...SOURCECODE.items[0], slug: 'a', languages: ['Next.js', 'NextJS', 'React'] }],
        pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
      },
    });
    const svc = new StoreService(config, mockPrisma());
    const facets = await svc.languages('sourcecode');
    expect(facets.find((f) => f.name.toLowerCase().startsWith('next'))?.count).toBe(1);
  });

  it('tìm kiếm chạm cả vào stack — gõ "Prisma" là đang hỏi về công nghệ', async () => {
    global.fetch = mockFetch({ '/shop/sourcecode': SOURCECODE });
    const svc = new StoreService(config, mockPrisma());
    expect((await svc.list('sourcecode', { page: 1, pageSize: 12, search: 'prisma' })).total).toBe(1);
  });

  it('sắp xếp có khoá phụ là tên, nên thứ tự không đổi giữa hai lần gọi', async () => {
    // Hàng loạt sản phẩm cùng giá và cùng totalSold = 0. Thiếu khoá phụ thì trang đảo chỗ giữa
    // hai lần tải — người dùng tưởng hàng đổi, máy tìm kiếm thấy một trang không ổn định.
    const ba = ['Zeta', 'Alpha', 'Mu'].map((name, i) => ({
      ...SOURCECODE.items[0],
      slug: `s${i}`,
      name,
      totalSold: 0,
      price: '100000',
    }));
    global.fetch = mockFetch({
      '/shop/sourcecode': { items: ba, pagination: { page: 1, limit: 100, total: 3, totalPages: 1 } },
    });
    const svc = new StoreService(config, mockPrisma());
    const ten = (r: { items: { name: string }[] }) => r.items.map((i) => i.name);
    expect(ten(await svc.list('sourcecode', { page: 1, pageSize: 12 }))).toEqual(['Alpha', 'Mu', 'Zeta']);
    expect(ten(await svc.list('sourcecode', { page: 1, pageSize: 12, sort: 'ten' }))).toEqual(['Alpha', 'Mu', 'Zeta']);
  });

  it('chưa cấu hình portal thì cửa hàng rỗng chứ không nổ', async () => {
    const svc = new StoreService(
      { env: { PORTAL_API_BASE: '', PORTAL_PUBLIC_URL: '' } } as unknown as AppConfigService,
      mockPrisma(),
    );
    const { items, total } = await svc.list('software', { page: 1, pageSize: 12 });
    expect(items).toEqual([]);
    expect(total).toBe(0);
  });

  // ── Giai đoạn 2: đọc cơ sở dữ liệu ─────────────────────────────────────────

  it('có hàng trong bảng Listing thì đọc bảng, không gọi portal nữa', async () => {
    // Đây là cái chốt của cả mảnh: nhập dữ liệu xong là mặt tiền tự lật nguồn. Nếu vẫn còn một
    // lượt gọi portal nào ở đây thì "tự lật" chỉ là nửa vời — cửa hàng vẫn chết theo hệ B.
    const fetchGia = mockFetch({ '/shop/sourcecode': SOURCECODE });
    global.fetch = fetchGia;
    const svc = new StoreService(config, mockPrisma([dong({ name: 'Từ cơ sở dữ liệu' })]));
    const { items, total } = await svc.list('sourcecode', { page: 1, pageSize: 12 });
    expect(total).toBe(1);
    expect(items[0].name).toBe('Từ cơ sở dữ liệu');
    expect(fetchGia).not.toHaveBeenCalled();
    expect((await svc.overview(6)).source).toBe('local');
  });

  it('một dòng Listing ra đúng hợp đồng StoreListing', async () => {
    global.fetch = mockFetch({});
    const svc = new StoreService(
      config,
      mockPrisma([dong({ thumbnailUrl: '/products/a.png', gallery: ['/products/b.png', 7] })]),
    );
    const { items } = await svc.list('sourcecode', { page: 1, pageSize: 12 });
    const it0 = items[0];
    expect(it0.priceVnd).toBe(100000);
    expect(it0.detail.languages).toEqual(['Next.js', 'Prisma']);
    expect(it0.detail.version).toBe('1.0.0');
    // Cột Json không phải chuỗi thì bị loại, không được lọt ra thành `null` trong mảng ảnh.
    expect(it0.gallery).toEqual(['https://portal.test/products/b.png']);
    expect(it0.thumbnailUrl).toBe('https://portal.test/products/a.png');
    // `updatedAt` trong bảng là Date, hợp đồng là chuỗi ISO.
    expect(it0.updatedAt).toBe('2026-09-20T10:00:00.000Z');
    // Danh sách để `description` null cho nhẹ — y như nhánh portal.
    expect(it0.description).toBeNull();
    expect(it0.inStock).toBeNull();
    expect(it0.buyUrl).toBe('https://portal.test/shop/sourcecode/flowpilot');
  });

  it('ngày "mới cập nhật" lấy theo NGUỒN, không theo ngày script chạy', async () => {
    // Sau một đợt nhập, `updatedAt` của cả danh mục là ngày script chạy — cùng một ngày cho 209
    // dự án. Để mặt tiền đọc nó thì mục "Mới cập nhật" thành vô nghĩa và sitemap khai với máy
    // tìm kiếm rằng toàn bộ danh mục vừa đổi cùng lúc.
    global.fetch = mockFetch({});
    const svc = new StoreService(
      config,
      mockPrisma([
        dong({
          updatedAt: new Date('2026-09-24T00:00:00.000Z'),
          sourceUpdatedAt: new Date('2026-05-01T00:00:00.000Z'),
        }),
      ]),
    );
    const { items } = await svc.list('sourcecode', { page: 1, pageSize: 12 });
    expect(items[0].updatedAt).toBe('2026-05-01T00:00:00.000Z');
  });

  it('món sinh ra ở hệ A (không qua nhập) vẫn dùng ngày ghi của chính nó', async () => {
    global.fetch = mockFetch({});
    const svc = new StoreService(
      config,
      mockPrisma([dong({ updatedAt: new Date('2026-09-24T00:00:00.000Z'), sourceUpdatedAt: null })]),
    );
    const { items } = await svc.list('sourcecode', { page: 1, pageSize: 12 });
    expect(items[0].updatedAt).toBe('2026-09-24T00:00:00.000Z');
  });

  it('deliveryEnc và notesInternal KHÔNG BAO GIỜ ra tới kết quả', async () => {
    // Ba quyết định đã chốt của giai đoạn 2, quyết định số 1: đường giao hàng nằm ở `deliveryEnc`
    // chứ không nằm trong `detail`, vì `detail` đi thẳng ra API công khai. Bài kiểm này canh đúng
    // chỗ đó — kể cả khi ai đó nhét thêm trường lạ vào Json `detail`, và kể cả khi một truy vấn
    // sau này lỡ `select` cả cột mã hoá về.
    global.fetch = mockFetch({});
    const svc = new StoreService(
      config,
      mockPrisma([
        dong({
          deliveryEnc: 'v1:aaa:bbb:ccc',
          notesInternal: 'khách này hay mặc cả',
          detail: {
            languages: ['Next.js'],
            driveLink: 'https://drive.google.com/BI-MAT',
            zipFileUrl: '/files/flowpilot.zip',
            gitlabRepoId: '12345',
            priceCost: 50000,
          },
        }),
      ]),
    );
    const { items } = await svc.list('sourcecode', { page: 1, pageSize: 12 });
    const chuoi = JSON.stringify(items[0]);
    for (const bimat of ['v1:aaa', 'notesInternal', 'mặc cả', 'BI-MAT', 'zipFileUrl', 'gitlabRepoId', '50000']) {
      expect(chuoi).not.toContain(bimat);
    }
    const chiTiet = JSON.stringify(await svc.detail('sourcecode', 'flowpilot'));
    for (const bimat of ['v1:aaa', 'mặc cả', 'BI-MAT', 'zipFileUrl', 'gitlabRepoId']) {
      expect(chiTiet).not.toContain(bimat);
    }
  });

  it('chi tiết đọc từ bảng thì có mô tả đầy đủ và đặc tả', async () => {
    global.fetch = mockFetch({ '/shop/sourcecode': SOURCECODE });
    const svc = new StoreService(
      config,
      mockPrisma([
        dong({
          detail: { languages: ['Next.js'], prerequisites: 'Node 20', specDocument: '# Đặc tả' },
        }),
      ]),
    );
    const item = await svc.detail('sourcecode', 'flowpilot');
    expect(item.description).toBe('dài');
    expect(item.detail.prerequisites).toBe('Node 20');
    expect(item.detail.specDocument).toBe('# Đặc tả');
  });

  it('món bị ẩn trong bảng thì không mở được bằng đường dẫn trực tiếp', async () => {
    // Trang chi tiết phải CÙNG NGUỒN với danh sách. Nếu nó "thử bảng, không thấy thì hỏi portal"
    // thì nút Ẩn của CMS không ẩn được gì: món vẫn còn bên portal và vẫn mở được từ Google.
    global.fetch = mockFetch({
      '/shop/sourcecode': SOURCECODE,
      '/shop/sourcecode/da-an': { ...SOURCECODE.items[0], slug: 'da-an' },
    });
    const svc = new StoreService(config, mockPrisma([dong(), dong({ slug: 'da-an', status: 'hidden' })]));
    await expect(svc.detail('sourcecode', 'da-an')).rejects.toThrow('Không có món này');
  });

  it('lọc/tìm/gộp công nghệ chạy y hệt nhau ở cả hai nguồn', async () => {
    // Đổi nguồn không được phép đổi cách cửa hàng lọc — nếu không, "lật nguồn" thành một thay đổi
    // mà người dùng nhìn thấy. Dữ liệu nhập từ hệ B bê nguyên các cách viết cũ sang, nên luật gộp
    // `Tailwind CSS` / `TailwindCSS` vẫn phải áp ở đây.
    global.fetch = mockFetch({});
    const svc = new StoreService(
      config,
      mockPrisma([
        dong({ slug: 'a', detail: { languages: ['Tailwind CSS'] } }),
        dong({ slug: 'b', detail: { languages: ['TailwindCSS'] } }),
        dong({ slug: 'c', category: 'CLI', detail: { languages: ['Go'] } }),
      ]),
    );
    expect(await svc.languages('sourcecode')).toEqual([
      { name: 'Tailwind CSS', count: 2 },
      { name: 'Go', count: 1 },
    ]);
    expect((await svc.list('sourcecode', { page: 1, pageSize: 12, language: 'tailwindcss' })).total).toBe(2);
    expect((await svc.list('sourcecode', { page: 1, pageSize: 12, search: 'go' })).total).toBe(1);
    expect(await svc.categories('sourcecode')).toEqual([
      { name: 'Web App', count: 2 },
      { name: 'CLI', count: 1 },
    ]);
  });

  it('phần mềm bán từ bảng thì tồn kho đếm trên Inventory', async () => {
    global.fetch = mockFetch({});
    const svc = new StoreService(
      config,
      mockPrisma([
        dong({ kind: 'software', slug: 'het', _count: { inventory: 0 }, detail: { inventoryType: 'KEY' } }),
        dong({ kind: 'software', slug: 'con', _count: { inventory: 4 }, detail: { inventoryType: 'KEY' } }),
      ]),
    );
    const { items } = await svc.list('software', { page: 1, pageSize: 12, sort: 'ten' });
    const theoSlug = Object.fromEntries(items.map((i) => [i.slug, i]));
    expect(theoSlug.het.inStock).toBe(false);
    expect(theoSlug.het.detail.availableCount).toBe(0);
    expect(theoSlug.con.inStock).toBe(true);
    expect(theoSlug.con.detail.availableCount).toBe(4);
  });

  // ── Luật chọn nguồn ────────────────────────────────────────────────────────

  it('bảng rỗng thì lùi về portal — nhập hỏng nửa chừng, cửa hàng vẫn đứng', async () => {
    global.fetch = mockFetch({ '/shop/sourcecode': SOURCECODE });
    const svc = new StoreService(config, mockPrisma([dong({ kind: 'document', slug: 'tl' })]));
    const { items, total } = await svc.list('sourcecode', { page: 1, pageSize: 12 });
    expect(total).toBe(1);
    expect(items[0].name).toBe('FlowPilot');
    expect((await svc.overview(6)).source).toBe('portal');
  });

  it('bảng chưa tồn tại (chưa chạy migration) cũng lùi về portal, không nổ', async () => {
    // Lược đồ đã thêm nhưng migration là một việc riêng chạy sau. Giữa hai thời điểm đó, mọi truy
    // vấn `Listing` đều ném — và cửa hàng vẫn phải bán hàng bình thường.
    global.fetch = mockFetch({ '/shop/sourcecode': SOURCECODE });
    const svc = new StoreService(config, prismaHong());
    const { total } = await svc.list('sourcecode', { page: 1, pageSize: 12 });
    expect(total).toBe(1);
    expect((await svc.detail('sourcecode', 'flowpilot')).name).toBe('FlowPilot');
  });

  it('STORE_SOURCE=portal bỏ qua bảng kể cả khi bảng đã có hàng', async () => {
    // Van khoá tay cho tình huống nhập sai: đổi một biến, khởi động lại, cửa hàng về đúng thứ
    // đang chạy tốt hôm nay — không phải revert mã, không phải deploy.
    global.fetch = mockFetch({ '/shop/sourcecode': SOURCECODE });
    const prisma = mockPrisma([dong({ name: 'Từ cơ sở dữ liệu' })]);
    const svc = new StoreService(
      { env: { ...config.env, STORE_SOURCE: 'portal' } } as unknown as AppConfigService,
      prisma,
    );
    const { items } = await svc.list('sourcecode', { page: 1, pageSize: 12 });
    expect(items[0].name).toBe('FlowPilot');
    expect((prisma.listing.findMany as unknown as jest.Mock)).not.toHaveBeenCalled();
  });

  it('STORE_SOURCE=local không lùi về portal, kể cả khi bảng rỗng', async () => {
    // Ép local là để SOI nhánh mới trên máy chủ thật. Có lưới đỡ thì đúng cái đang cần nhìn sẽ
    // không bao giờ lộ mặt, nên ở đây rỗng là rỗng.
    const fetchGia = mockFetch({ '/shop/sourcecode': SOURCECODE });
    global.fetch = fetchGia;
    const svc = new StoreService(
      { env: { ...config.env, STORE_SOURCE: 'local' } } as unknown as AppConfigService,
      mockPrisma(),
    );
    const { total } = await svc.list('sourcecode', { page: 1, pageSize: 12 });
    expect(total).toBe(0);
    expect(fetchGia).not.toHaveBeenCalled();
    expect((await svc.overview(6)).source).toBe('local');
  });

  it('bảng hỏng giữa chừng thì giữ bản đã đệm, không trả cửa hàng trắng', async () => {
    global.fetch = mockFetch({});
    const prisma = mockPrisma([dong()]);
    const svc = new StoreService(config, prisma);
    await svc.list('sourcecode', { page: 1, pageSize: 12 });
    (svc as unknown as { cache: Map<string, { at: number }> }).cache.get('sourcecode')!.at = 0;
    (prisma.listing.findMany as unknown as jest.Mock).mockRejectedValue(new Error('connection lost'));
    const again = await svc.list('sourcecode', { page: 1, pageSize: 12 });
    expect(again.items).toHaveLength(1);
  });

  it('sitemap đọc theo nguồn đang dùng', async () => {
    global.fetch = mockFetch({ '/shop/sourcecode': SOURCECODE });
    const svc = new StoreService(config, mockPrisma([dong({ slug: 'trong-bang' })]));
    expect(await svc.slugs()).toEqual([
      { kind: 'sourcecode', slug: 'trong-bang', updatedAt: '2026-09-20T10:00:00.000Z' },
    ]);
  });
});
