import { cloneIntentWithoutUrl, cloneUrlFromPrompt } from './clone-intent';

/**
 * Ca thật đã làm hỏng trải nghiệm của người dùng: gõ "tạo bản sao website socamdo" thì hệ thống
 * bỏ qua toàn bộ đường sao chép và lặng lẽ dựng một app bất kỳ. Hai lỗi chồng nhau — "bản sao"
 * không nằm trong danh sách từ khoá, và tên miền trần (không có https://) thì không được nhận.
 */
describe('cloneUrlFromPrompt', () => {
  it('nhận địa chỉ đầy đủ', () => {
    expect(cloneUrlFromPrompt('sao chép website https://socamdo.com')).toBe('https://socamdo.com/');
  });

  it('nhận TÊN MIỀN TRẦN — người ta hiếm khi gõ https://', () => {
    expect(cloneUrlFromPrompt('tạo bản sao website socamdo.com')).toBe('https://socamdo.com/');
    expect(cloneUrlFromPrompt('clone giúp tôi www.abc.vn/gioi-thieu')).toContain('abc.vn/gioi-thieu');
  });

  it('"bản sao" cũng là ý định sao chép, không chỉ "sao chép"', () => {
    expect(cloneUrlFromPrompt('làm bản sao của trang xemlicham.com')).toBe('https://xemlicham.com/');
  });

  it('KHÔNG coi tên tệp là tên miền', () => {
    for (const p of ['sao chép logic trong app.js', 'dựng lại theo data.json', 'clone file style.css']) {
      expect(cloneUrlFromPrompt(p)).toBeUndefined();
    }
  });

  it('KHÔNG nhận số phiên bản', () => {
    expect(cloneUrlFromPrompt('dựng lại y hệt bản 1.2.3')).toBeUndefined();
  });

  it('có địa chỉ nhưng KHÔNG có ý định sao chép → bỏ qua', () => {
    expect(cloneUrlFromPrompt('app đọc RSS từ https://vnexpress.net/rss')).toBeUndefined();
    expect(cloneUrlFromPrompt('trang giới thiệu cho socamdo.com')).toBeUndefined();
  });
});

describe('cloneIntentWithoutUrl', () => {
  it('rõ ràng muốn sao chép nhưng KHÔNG có địa chỉ → phải báo', () => {
    expect(cloneIntentWithoutUrl('tạo bản sao website socamdo')).toBe(true);
    expect(cloneIntentWithoutUrl('clone giúp tôi trang chủ của shop kia')).toBe(true);
  });

  it('có địa chỉ rồi thì không báo', () => {
    expect(cloneIntentWithoutUrl('tạo bản sao website socamdo.com')).toBe(false);
  });

  it('không nhắc gì tới sao chép thì không báo', () => {
    expect(cloneIntentWithoutUrl('làm cho tôi một landing page quán cà phê')).toBe(false);
  });
});
