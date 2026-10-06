import type { GeneratedFile } from '@larkwave/shared';
import {
  cleanSuitePrompt,
  normalizeSurfaces,
  suiteApiContract,
  suiteAppName,
  suiteBrandNote,
  suitePrompt,
  suiteUrl,
  type SuiteMember,
  chonDaiDienMoi,
  xepTangBo,
  THU_TU_TANG,
} from './suite';

describe('normalizeSurfaces', () => {
  it('coi một mặt là app đơn, không phải bộ site', () => {
    expect(normalizeSurfaces(['site'])).toEqual([]);
    expect(normalizeSurfaces([])).toEqual([]);
    expect(normalizeSurfaces(undefined)).toEqual([]);
  });

  it('từ hai mặt trở lên thì LUÔN kèm API — thiếu nó thì các site không dùng chung dữ liệu', () => {
    expect(normalizeSurfaces(['site', 'cms'])).toEqual(['api', 'site', 'cms']);
    expect(normalizeSurfaces(['cms', 'portal'])).toEqual(['api', 'cms', 'portal']);
  });

  it('xếp API lên đầu và bỏ trùng lặp / giá trị lạ', () => {
    expect(normalizeSurfaces(['portal', 'site', 'portal', 'khong-co-that'])).toEqual([
      'api',
      'site',
      'portal',
    ]);
  });

  it('không nhân đôi API khi người dùng đã tự chọn', () => {
    const out = normalizeSurfaces(['api', 'cms']);
    expect(out.filter((s) => s === 'api')).toHaveLength(1);
    expect(out).toEqual(['api', 'cms']);
  });
});

describe('suiteAppName', () => {
  it('giữ tên gốc và thêm hậu tố phân biệt', () => {
    expect(suiteAppName('Cửa hàng ABC', 'cms')).toBe('Cửa hàng ABC — Quản trị');
    expect(suiteAppName('Cửa hàng ABC', 'api')).toBe('Cửa hàng ABC — API');
  });

  it('không vượt quá giới hạn 60 ký tự của cột name', () => {
    expect(suiteAppName('x'.repeat(200), 'portal').length).toBeLessThanOrEqual(60);
  });
});

describe('suitePrompt', () => {
  const members: SuiteMember[] = [
    { surface: 'api', slug: 'aaaaaa', name: 'X — API' },
    { surface: 'site', slug: 'bbbbbb', name: 'X — Website' },
    { surface: 'cms', slug: 'cccccc', name: 'X — Quản trị' },
  ];

  it('mọi site đều nhận địa chỉ THẬT của các site anh em', () => {
    for (const m of members) {
      const p = suitePrompt('Bán cà phê', m.surface, members);
      expect(p).toContain(suiteUrl('aaaaaa'));
      expect(p).toContain(suiteUrl('bbbbbb'));
      expect(p).toContain(suiteUrl('cccccc'));
    }
  });

  it('giữ nguyên mô tả của người dùng ở đầu prompt', () => {
    expect(suitePrompt('Bán cà phê', 'site', members).startsWith('Bán cà phê')).toBe(true);
  });

  it('chỉ site API mới được tạo schema.sql / functions', () => {
    const api = suitePrompt('x', 'api', members);
    expect(api).toContain('schema.sql');
    expect(api).toContain('functions/api/');
    for (const s of ['site', 'cms'] as const) {
      const p = suitePrompt('x', s, members);
      expect(p).toContain('KHÔNG có cơ sở dữ liệu riêng');
      expect(p).toContain('không gọi đường dẫn tương đối');
    }
  });

  it('site API liệt kê ĐÚNG các origin được phép cho CORS (không có chính nó, không dùng *)', () => {
    const api = suitePrompt('x', 'api', members);
    expect(api).toContain(suiteUrl('bbbbbb'));
    expect(api).toContain(suiteUrl('cccccc'));
    expect(api).toContain('Access-Control-Allow-Credentials');
    // "*" không dùng được khi có gửi cookie — chỉ dẫn phải nói rõ điều đó.
    expect(api).toContain('KHÔNG dùng "*"');
  });

  it('đánh dấu đúng site đang được dựng, và chỉ một', () => {
    const p = suitePrompt('x', 'cms', members);
    expect(p.match(/← SITE BẠN ĐANG DỰNG/g)).toHaveLength(1);
    expect(p).toContain('SITE BẠN ĐANG DỰNG: Backoffice (CMS)');
  });

  it('backoffice không được nhúng vào website công khai', () => {
    expect(suitePrompt('x', 'site', members)).toContain('KHÔNG nhúng khu quản trị vào site này');
  });

  it('portal chỉ thấy dữ liệu của chính người đăng nhập', () => {
    const p = suitePrompt('x', 'portal', [
      ...members.filter((m) => m.surface !== 'cms'),
      { surface: 'portal', slug: 'dddddd', name: 'X — Cổng khách hàng' },
    ]);
    expect(p).toContain('THUỘC VỀ người đang đăng nhập');
    expect(p).toContain('KHÔNG có chức năng quản trị');
  });
});

describe('suiteApiContract — hợp đồng THẬT chuyền sang các site sau', () => {
  const files = (arr: [string, string][]) =>
    arr.map(([path, content]) => ({ path, content }) as GeneratedFile);

  it('rút bảng + endpoint từ file đã sinh, bỏ phần seed', () => {
    const out = suiteApiContract(
      files([
        [
          'schema.sql',
          "CREATE TABLE IF NOT EXISTS bai_viet (id INTEGER PRIMARY KEY, tieu_de TEXT);\nINSERT INTO bai_viet (tieu_de) VALUES ('mẫu');\n",
        ],
        ['functions/api/bai-viet.js', 'export const onRequestGet = () => {}'],
        ['functions/api/bai-viet/[id].js', 'export const onRequestGet = () => {}'],
        ['src/App.tsx', 'x'],
      ]),
    );
    expect(out).toContain('CREATE TABLE IF NOT EXISTS bai_viet');
    // Seed chiếm gần hết file mà không nói thêm gì về hình dạng dữ liệu.
    expect(out).not.toContain('INSERT INTO');
    expect(out).toContain('/api/bai-viet');
    // "[id]" là tham số đường dẫn của Pages Functions — phải viết lại cho đọc được.
    expect(out).toContain('/api/bai-viet/:id');
    expect(out).not.toContain('src/App.tsx');
  });

  it('không có gì để nói thì IM, không chuyền một hợp đồng rỗng', () => {
    expect(suiteApiContract([])).toBe('');
    expect(suiteApiContract(files([['src/App.tsx', 'x']]))).toBe('');
  });

  it('cấm site sau bịa endpoint không có trong danh sách', () => {
    const out = suiteApiContract(files([['functions/api/x.js', 'y']]));
    expect(out).toContain('KHÔNG bịa endpoint');
  });
});

describe('suiteBrandNote — bản sắc chuyền từ mặt tiền sang backoffice/portal', () => {
  const css = (content: string) => [{ path: 'src/index.css', content }] as GeneratedFile[];

  it('lấy màu thương hiệu theo tần suất và BỎ mọi sắc xám', () => {
    const out = suiteBrandNote(
      css(`
        a { color: #c8102e } b { color: #c8102e } c { color: #c8102e }
        d { color: #f5a623 }
        e { color: #ffffff } f { color: #000000 } g { color: #888888 }
      `),
    );
    expect(out).toContain('#c8102e');
    expect(out).toContain('#f5a623');
    // Trắng/đen/xám có ở mọi trang web nên không nói lên thương hiệu nào.
    expect(out).not.toContain('#ffffff');
    expect(out).not.toContain('#000000');
    expect(out).not.toContain('#888888');
  });

  it('lấy họ phông thật, bỏ từ khoá chung chung', () => {
    const out = suiteBrandNote(css(`body{font-family:"Be Vietnam Pro",sans-serif} i{font-family:inherit} u{color:#c8102e}`));
    expect(out).toContain('Be Vietnam Pro');
    expect(out).not.toContain('inherit');
  });

  it('không rút được gì thì trả rỗng — thà im còn hơn chuyền một bảng màu bịa', () => {
    expect(suiteBrandNote([])).toBe('');
    expect(suiteBrandNote(css('body{margin:0}'))).toBe('');
  });

  it('nói thẳng đừng dùng màu tím mặc định — đó chính là thứ đã xảy ra', () => {
    expect(suiteBrandNote(css('a{color:#c8102e}'))).toContain('KHÔNG dùng màu tím mặc định');
  });
});

describe('suiteBrandNote — phông đọc từ ĐÚNG chỗ codegen thật sự khai', () => {
  const asFile = (path: string, content: string) => ({ path, content }) as GeneratedFile;

  it('đọc được phông từ thẻ Google Fonts (đo trên app thật: đây mới là nguồn có thật)', () => {
    const out = suiteBrandNote([
      asFile(
        'index.html',
        '<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;700&family=Inter:wght@400&display=swap">',
      ),
      asFile('src/index.css', 'a{color:#c8102e}'),
    ]);
    expect(out).toContain('Plus Jakarta Sans');
    expect(out).toContain('Inter');
    expect(out).not.toContain('display=swap');
  });

  it('đọc được phông từ biến CSS --font-*', () => {
    const out = suiteBrandNote([
      asFile(':root', ''),
      asFile('src/index.css', ":root{--font-display:'Be Vietnam Pro', system-ui;--font-body:'Inter',sans-serif} a{color:#c8102e}"),
    ]);
    expect(out).toContain('Be Vietnam Pro');
  });

  it('không nhận system-ui làm phông thương hiệu', () => {
    const out = suiteBrandNote([asFile('src/index.css', ':root{--font-body:system-ui,sans-serif} a{color:#c8102e}')]);
    expect(out).not.toContain('system-ui');
  });
});

describe('đăng nhập của cả bộ phải nằm ở site API', () => {
  const withPortal: SuiteMember[] = [
    { surface: 'api', slug: 'aaaaaa', name: 'API' },
    { surface: 'portal', slug: 'bbbbbb', name: 'Cổng KH' },
  ];

  it('bộ có portal/backoffice ⇒ site API BẮT BUỘC có endpoint auth', () => {
    const p = suitePrompt('x', 'api', withPortal);
    // Các site kia bị cấm có CSDL riêng, nên chỉ một cái BẢNG users là không đủ.
    expect(p).toContain('functions/api/auth/[action].js');
    expect(p).toContain('register, login, logout, me');
  });

  it('cảnh báo SameSite — khác tên miền thì Lax không gửi cookie, cả bộ mất phiên ngay', () => {
    expect(suitePrompt('x', 'api', withPortal)).toContain('SameSite=None');
  });

  it('bộ KHÔNG có portal/backoffice thì không ép thêm auth', () => {
    const p = suitePrompt('x', 'api', [
      { surface: 'api', slug: 'aaaaaa', name: 'API' },
      { surface: 'site', slug: 'cccccc', name: 'Website' },
    ]);
    expect(p).not.toContain('functions/api/auth/[action].js');
  });
});

describe('cleanSuitePrompt — "Chạy lại" trên build đã phình', () => {
  it('bỏ khối bản đồ bộ site, giữ đúng câu người dùng', () => {
    const nguoiDung = 'clone https://truanayangi.com/';
    const daPhinh = suitePrompt(nguoiDung, 'site', [
      { surface: 'api', slug: 'aaaaaa', name: 'API' },
      { surface: 'site', slug: 'bbbbbb', name: 'Website' },
    ]);
    // Chỉ cần chứng minh nó phình ĐÁNG KỂ so với câu gốc; con số tuyệt đối tuỳ số mặt trong bộ.
    expect(daPhinh.length).toBeGreaterThan(nguoiDung.length * 20);
    expect(cleanSuitePrompt(daPhinh)).toBe(nguoiDung);
  });

  it('bỏ cả hợp đồng API và bản sắc giao diện nối thêm sau', () => {
    const p =
      'sua mau nut' +
      '\n\n═══ HỆ THỐNG NHIỀU SITE ═══\nblah' +
      '\n\n═══ HỢP ĐỒNG THẬT CỦA SITE API (đã dựng xong) ═══\nblah' +
      '\n\n═══ BẢN SẮC GIAO DIỆN CỦA HỆ THỐNG ═══\nblah';
    expect(cleanSuitePrompt(p)).toBe('sua mau nut');
  });

  it('ca thật đã đo: 4568 ký tự với khối NHÂN BẢN x2 → về đúng câu gốc', () => {
    const goc = 'he thong ban hang';
    // Đúng bộ 4 mặt như ca thật (truanayangi) — số mặt quyết định độ dài bản đồ.
    const M = [
      { surface: 'api' as const, slug: 'aaaaaa', name: 'API' },
      { surface: 'site' as const, slug: 'bbbbbb', name: 'Website' },
      { surface: 'cms' as const, slug: 'cccccc', name: 'Quản trị' },
      { surface: 'portal' as const, slug: 'dddddd', name: 'Cổng KH' },
    ];
    // Đúng cách nó phình: prompt đã có khối rồi lại đi qua suitePrompt lần nữa.
    const x2 = suitePrompt(suitePrompt(goc, 'cms', M), 'cms', M);
    expect((x2.match(/HỆ THỐNG NHIỀU SITE/g) ?? []).length).toBe(2);
    expect(x2.length).toBeGreaterThan(4000);
    const sach = cleanSuitePrompt(x2);
    expect(sach).toBe(goc);
    expect(sach.length).toBeLessThanOrEqual(4000);
  });

  it('prompt bình thường không bị đụng', () => {
    expect(cleanSuitePrompt('lam mot trang ban ca phe')).toBe('lam mot trang ban ca phe');
    expect(cleanSuitePrompt('')).toBe('');
  });
});

describe('phép cắt tay cũ không bao giờ có thể sạch — vì sao phải dùng cleanSuitePrompt', () => {
  const M = [
    { surface: 'api' as const, slug: 'aaaaaa', name: 'API' },
    { surface: 'site' as const, slug: 'bbbbbb', name: 'Website' },
    { surface: 'cms' as const, slug: 'cccccc', name: 'Quản trị' },
    { surface: 'portal' as const, slug: 'dddddd', name: 'Cổng KH' },
  ];
  /** Đúng phép cắt mà rebuildSuite từng dùng: chỉ 2 trong 3 mốc. */
  const catTay = (p: string) =>
    p.split('\n═══ HỢP ĐỒNG THẬT CỦA SITE API')[0]!.split('\n═══ BẢN SẮC GIAO DIỆN CỦA HỆ THỐNG')[0]!;

  it('suitePrompt phát bản đồ TRƯỚC, hợp đồng nối SAU — nên cắt từ hợp đồng luôn chừa bản đồ lại', () => {
    const legacy = `${suitePrompt('he thong ban hang', 'cms', M)}\n\n═══ HỢP ĐỒNG THẬT CỦA SITE API ═══\nblah`;
    expect(catTay(legacy)).toContain('HỆ THỐNG NHIỀU SITE'); // ← chính là lỗ hổng
    expect(cleanSuitePrompt(legacy)).toBe('he thong ban hang');
  });

  it('bản đồ sót lại + suiteRunNote nối bản mới = NHÂN ĐÔI, đúng lỗi vừa diệt xong', () => {
    const legacy = `${suitePrompt('he thong ban hang', 'cms', M)}\n\n═══ HỢP ĐỒNG THẬT CỦA SITE API ═══\nblah`;
    const luotSau = suitePrompt(catTay(legacy), 'cms', M); // mô phỏng ghép lúc chạy
    expect((luotSau.match(/HỆ THỐNG NHIỀU SITE/g) ?? []).length).toBe(2);
    // Còn đường đúng thì chỉ một bản, và ngắn hơn hẳn.
    const dung = suitePrompt(cleanSuitePrompt(legacy), 'cms', M);
    expect((dung.match(/HỆ THỐNG NHIỀU SITE/g) ?? []).length).toBe(1);
    expect(dung.length).toBeLessThan(luotSau.length);
  });

  it('prompt cũ bắt đầu NGAY bằng khối hệ thống ⇒ làm sạch ra rỗng (phải bị chặn, không dựng)', () => {
    const khongCoCauGoc = suitePrompt('', 'portal', M);
    expect(cleanSuitePrompt(khongCoCauGoc).trim().length).toBeLessThan(3);
  });
});

describe('chonDaiDienMoi', () => {
  it('trao vai đại diện theo thứ tự mặt tiền, không theo thứ tự tạo', () => {
    // Người dùng xoá site đại diện. Ai lên thay phải là chỗ có gì đó XEM ĐƯỢC — không phải trang
    // chỉ mục endpoint của API, dù API thường được tạo trước.
    expect(
      chonDaiDienMoi([
        { id: 'a', surface: 'api' },
        { id: 'c', surface: 'cms' },
        { id: 'p', surface: 'portal' },
      ]),
    ).toBe('p');
    expect(
      chonDaiDienMoi([
        { id: 'a', surface: 'api' },
        { id: 'c', surface: 'cms' },
      ]),
    ).toBe('c');
    expect(chonDaiDienMoi([{ id: 'a', surface: 'api' }])).toBe('a');
  });

  it('bộ không còn ai thì không có gì để trao', () => {
    expect(chonDaiDienMoi([])).toBeNull();
  });

  it('mặt lạ vẫn phải có đại diện — không để bộ mồ côi', () => {
    // Bộ về sau có thể thêm vai mới. Trả null ở đây là để lại đúng cái hố vừa lấp: các site còn
    // lại biến mất khỏi danh sách và không còn đường nào mở ra.
    expect(chonDaiDienMoi([{ id: 'x', surface: 'docs' }])).toBe('x');
    expect(chonDaiDienMoi([{ id: 'x', surface: null }])).toBe('x');
  });
});

describe('xepTangBo', () => {
  const bo = (mats: string[]) => (m: string) => (mats.includes(m) ? 'b:' + m : undefined);

  it('bộ đủ bốn mặt: API chạy trước, rồi mặt tiền, rồi hai cái còn lại song song', () => {
    expect(xepTangBo(bo(['api', 'site', 'cms', 'portal']))).toEqual({
      tangDau: 'b:api',
      tangSau: [['b:site'], ['b:cms', 'b:portal']],
    });
  });

  it('bỏ tầng rỗng chứ không để một tầng trống chặn đường', () => {
    // Một tầng rỗng nạp vào hàng chờ là một lần mở khóa không mở gì — các tầng sau nó có thể
    // đứng im mài mãi.
    expect(xepTangBo(bo(['api', 'portal']))).toEqual({ tangDau: 'b:api', tangSau: [['b:portal']] });
    expect(xepTangBo(bo(['api']))).toEqual({ tangDau: 'b:api', tangSau: [] });
  });

  it('không có mặt API thì không có tầng đầu — người gọi phải tự lo', () => {
    // `normalizeSurfaces` luôn kèm 'api' nên hôm nay không xảy ra; giữ bài kiểm để một thay đổi
    // sau này ở đó không biến chỗ này thành một hàng chờ đứng im.
    expect(xepTangBo(bo(['site', 'cms']))).toEqual({ tangDau: undefined, tangSau: [['b:site'], ['b:cms']] });
  });

  it('thứ tự tầng là một danh sách dùng chung, không phải ba bản sao', () => {
    expect(THU_TU_TANG.map((n) => [...n])).toEqual([['api'], ['site'], ['cms', 'portal']]);
  });
});
