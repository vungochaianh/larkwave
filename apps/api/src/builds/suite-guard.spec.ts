/**
 * Hai bất biến của "bộ site" mà PROMPT KHÔNG giữ nổi — đã đo được là hỏng trên bộ thật đầu tiên
 * (truanayangi, 2026-09-10: ba cơ sở dữ liệu D1 riêng dù chỉ thị nói rõ chỉ site API mới có).
 * Vì vậy chúng được canh bằng mã, và canh bằng mã thì phải có test.
 */
import { stripSuiteBackend, surfaceFlags } from './suite';

/** Gọi ĐÚNG hàm pipeline dùng — không chép lại luật, kẻo hai bản trôi lệch mà test vẫn xanh. */
function enforce(app: { suiteId?: string | null; surface?: string | null }, paths: string[]): string[] {
  const res = stripSuiteBackend(app, paths);
  return res ? paths.filter((_, i) => res.keep[i]) : paths;
}

const FILES = [
  'src/App.tsx',
  'schema.sql',
  'functions/api/posts.js',
  'functions/api/posts/[id].js',
  'index.html',
];

describe('rào cứng: site trong bộ không được có CSDL riêng', () => {
  it('mặt cms bị bỏ schema.sql và toàn bộ functions/', () => {
    const out = enforce({ suiteId: 's1', surface: 'cms' }, FILES);
    expect(out).toEqual(['src/App.tsx', 'index.html']);
  });

  it('mặt portal và site cũng vậy', () => {
    for (const surface of ['portal', 'site']) {
      const out = enforce({ suiteId: 's1', surface }, FILES);
      expect(out).not.toContain('schema.sql');
      expect(out.some((p) => p.startsWith('functions/'))).toBe(false);
    }
  });

  it('mặt API GIỮ NGUYÊN — nó là nơi duy nhất được có dữ liệu', () => {
    expect(enforce({ suiteId: 's1', surface: 'api' }, FILES)).toHaveLength(FILES.length);
  });

  it('app KHÔNG thuộc bộ nào đi qua mà không mất gì (app đơn, import git, mobile)', () => {
    expect(enforce({ suiteId: null, surface: null }, FILES)).toHaveLength(FILES.length);
    // Có surface mà không có suiteId (dữ liệu lệch) cũng không được đụng vào.
    expect(enforce({ suiteId: null, surface: 'cms' }, FILES)).toHaveLength(FILES.length);
    expect(enforce({ suiteId: 's1', surface: null }, FILES)).toHaveLength(FILES.length);
  });

  it('bắt cả đường dẫn có tiền tố ./ và /', () => {
    const out = enforce({ suiteId: 's1', surface: 'cms' }, [
      './schema.sql',
      '/functions/api/x.js',
      'src/main.tsx',
    ]);
    expect(out).toEqual(['src/main.tsx']);
  });

  it('KHÔNG bỏ nhầm file chỉ TRÔNG giống', () => {
    const out = enforce({ suiteId: 's1', surface: 'cms' }, [
      'db/schema.sql',
      'src/functions/helpers.ts',
      'docs/schema.sql.md',
    ]);
    expect(out).toHaveLength(3);
  });
});

describe('surfaceFlags — VAI là nguồn sự thật, không phải cột backendKind', () => {
  it('mặt API là nơi DUY NHẤT được full-stack', () => {
    expect(surfaceFlags({ suiteId: 's1', surface: 'api' })).toEqual({
      backendKind: 'fullstack',
      cms: false,
    });
  });

  it('ba mặt còn lại luôn static, không CMS, và KHÔNG trỏ tới CSDL riêng', () => {
    for (const surface of ['site', 'cms', 'portal']) {
      expect(surfaceFlags({ suiteId: 's1', surface })).toEqual({
        backendKind: 'static',
        cms: false,
        d1DatabaseId: null,
        d1Ready: false,
      });
    }
  });

  it('KHÔNG phụ thuộc cột đã lệch — đây là toàn bộ lý do hàm này tồn tại', () => {
    // Ca thật: app 'bb8tyh' surface='site' bị ghi thành fullstack+cms=true rồi chết ở chốt chặn.
    expect(
      surfaceFlags({ suiteId: 's1', surface: 'site', backendKind: 'fullstack', cms: true }),
    ).toMatchObject({ backendKind: 'static', cms: false });
  });

  it('app KHÔNG thuộc bộ thì trả null — không đụng vào app đơn hay app import git', () => {
    expect(surfaceFlags({ suiteId: null, surface: null, backendKind: 'fullstack' })).toBeNull();
    expect(surfaceFlags({ suiteId: null, surface: 'cms' })).toBeNull();
    expect(surfaceFlags({ suiteId: 's1', surface: null })).toBeNull();
  });
});

describe('rào cứng phải chịu được VÒNG TỰ SỬA, không chỉ lượt sinh đầu', () => {
  // Đường lọt thật: chỉ thị bộ site bắt portal gọi `${API_BASE}/api/auth/login`, mà
  // CodegenService.ensureAuth thấy chuỗi "/api/auth" trong BẤT KỲ file nào là tự thêm
  // schema.sql + functions/api/auth/[action].js. Tức chính câu "gọi sang API anh em" kích hoạt
  // cỗ máy dựng backend tại chỗ — tất định, mọi lần, ở mọi vòng sửa lỗi build.
  const afterEnsureAuth = [
    'src/pages/Login.tsx', // chứa fetch(`${API_BASE}/api/auth/login`)
    'schema.sql',
    'functions/api/auth/[action].js',
  ];

  it('lượt sửa lỗi build cũng bị lọc, không chỉ lượt sinh đầu', () => {
    const r = stripSuiteBackend({ suiteId: 's1', surface: 'portal' }, afterEnsureAuth)!;
    expect(r.dropped).toEqual(['schema.sql', 'functions/api/auth/[action].js']);
    expect(afterEnsureAuth.filter((_, i) => r.keep[i])).toEqual(['src/pages/Login.tsx']);
  });

  it('mặt API vẫn được giữ nguyên phần auth — nó là nơi auth PHẢI nằm', () => {
    expect(stripSuiteBackend({ suiteId: 's1', surface: 'api' }, afterEnsureAuth)).toBeNull();
  });
});
