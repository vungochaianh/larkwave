import { canCall, normalizeRoute, readScopes, monthStart, ROUTE_SCOPE } from './api-scopes';

/**
 * Luật phân quyền của Developer API. Sai ở đây nghĩa là một chương trình bên ngoài làm được thứ
 * chủ tài khoản không cho phép — hoặc ngược lại, mọi tích hợp đang chạy chết đồng loạt.
 */

describe('canCall: phạm vi rỗng = toàn quyền', () => {
  it('key CŨ (chưa có phạm vi) vẫn gọi được — không được làm chết tích hợp đang chạy', () => {
    // Đây là luật giữ cho việc thêm tính năng này không thành một sự cố: mọi key phát trước đó
    // đều có scopes rỗng.
    expect(canCall([], 'POST /pub/apps')).toBe(true);
    expect(canCall([], 'GET /pub/me')).toBe(true);
  });

  it('nhưng tuyến KHÔNG khai báo thì từ chối, kể cả key toàn quyền', () => {
    // Danh sách trắng: thêm endpoint mới mà quên khai thì nó bị chặn. Chiều hỏng đó là ĐÚNG —
    // chiều ngược lại là một endpoint mới vô tình mở cho mọi key trên hệ thống.
    expect(canCall([], 'DELETE /pub/apps/:id')).toBe(false);
    expect(canCall(['apps:write'], 'GET /pub/bi-mat')).toBe(false);
  });
});

describe('canCall: phạm vi cụ thể', () => {
  it('chỉ đọc thì KHÔNG tạo được app', () => {
    const readOnly = ['apps:read', 'builds:read'];
    expect(canCall(readOnly, 'GET /pub/apps')).toBe(true);
    expect(canCall(readOnly, 'POST /pub/apps')).toBe(false);
  });

  it('quyền tạo app không tự kéo theo quyền xem gói', () => {
    expect(canCall(['apps:write'], 'GET /pub/me')).toBe(false);
  });
});

describe('normalizeRoute: gom id lại để báo cáo còn đọc được', () => {
  it('id trong đường dẫn thành :id', () => {
    expect(normalizeRoute('get', '/pub/builds/cmtb38oz70000m5pzizw1k2zy')).toBe('GET /pub/builds/:id');
    expect(normalizeRoute('GET', '/pub/builds/550e8400-e29b-41d4-a716-446655440000')).toBe(
      'GET /pub/builds/:id',
    );
  });

  it('bỏ query và dấu / thừa', () => {
    expect(normalizeRoute('GET', '/pub/apps/?page=2')).toBe('GET /pub/apps');
  });

  it('KHÔNG đụng vào từ thường — nếu không mọi tuyến gom thành một dòng vô nghĩa', () => {
    expect(normalizeRoute('GET', '/pub/apps')).toBe('GET /pub/apps');
    expect(normalizeRoute('GET', '/pub/me')).toBe('GET /pub/me');
  });

  it('mọi tuyến đã khai đều chuẩn hoá về đúng khoá của nó', () => {
    // Canh hai bảng không trôi lệch: khoá sinh ra lúc chạy phải khớp khoá khai trong ROUTE_SCOPE,
    // nếu không thì luật phân quyền không bao giờ khớp và mọi lượt gọi bị từ chối.
    for (const key of Object.keys(ROUTE_SCOPE)) {
      const [method, path] = key.split(' ');
      const sample = path.replace(':id', 'cmtb38oz70000m5pzizw1k2zy');
      expect(normalizeRoute(method, sample)).toBe(key);
    }
  });
});

describe('readScopes: cột Json không được CSDL bảo đảm hình dạng', () => {
  it('bỏ giá trị lạ và trùng lặp', () => {
    expect(readScopes(['apps:read', 'apps:read', 'khong-co-that', 42, null])).toEqual(['apps:read']);
  });

  it('không phải mảng thì coi như rỗng (= toàn quyền, đúng luật tương thích)', () => {
    expect(readScopes(null)).toEqual([]);
    expect(readScopes('apps:read')).toEqual([]);
  });
});

describe('monthStart: cửa sổ hạn mức', () => {
  it('về đúng 00:00 ngày 1 của tháng đó', () => {
    expect(monthStart(new Date('2026-09-17T23:59:59Z')).toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('ngày 1 vẫn thuộc tháng đó, không lùi về tháng trước', () => {
    expect(monthStart(new Date('2026-09-01T00:00:00Z')).toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });
});
