import { laKetCucBuild } from './ket-cuc-build';

describe('laKetCucBuild', () => {
  it('ba trạng thái kết thúc thật', () => {
    expect(laKetCucBuild('succeeded')).toBe(true);
    expect(laKetCucBuild('failed')).toBe(true);
    expect(laKetCucBuild('canceled')).toBe(true);
    expect(laKetCucBuild('SUCCEEDED')).toBe(true);
  });

  it('CHỜ DUYỆT không phải kết cục — sự cố 23/09/2026', () => {
    // Đây là dòng đáng giá nhất trong tệp này. Coi 'awaiting_approval' là kết cục (thất bại) đã
    // giết ba site của một bộ sau 11 mili giây, trước khi chúng chạy một bước nào.
    expect(laKetCucBuild('awaiting_approval')).toBe(false);
  });

  it('đang trong hàng hoặc đang chạy thì chưa xong', () => {
    expect(laKetCucBuild('queued')).toBe(false);
    expect(laKetCucBuild('running')).toBe(false);
    expect(laKetCucBuild('')).toBe(false);
  });
});
