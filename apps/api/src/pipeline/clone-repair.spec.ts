import { shouldRepairClone, type CloneFidelity } from './clone-repair';

const f = (o: Partial<CloneFidelity>): CloneFidelity => ({
  score: 50,
  missingLines: ['một dòng nội dung bị thiếu'],
  missingTables: 0,
  invented: [],
  ...o,
});
const codegen = { mode: 'codegen', alreadyTried: false };

describe('shouldRepairClone', () => {
  it('sửa khi điểm thấp và biết rõ thiếu gì', () => {
    expect(shouldRepairClone(f({}), codegen)).toBe(true);
  });

  it('KHÔNG sửa khi chưa chấm được — sửa mù còn tệ hơn không sửa', () => {
    expect(shouldRepairClone(undefined, codegen)).toBe(false);
  });

  it('KHÔNG sửa khi điểm đã đủ tốt (nội dung động khiến điểm không bao giờ chạm 100)', () => {
    expect(shouldRepairClone(f({ score: 70 }), codegen)).toBe(false);
    expect(shouldRepairClone(f({ score: 85 }), codegen)).toBe(false);
  });

  it('KHÔNG sửa lần thứ hai — có khoảng cách không bao giờ khép được', () => {
    expect(shouldRepairClone(f({}), { ...codegen, alreadyTried: true })).toBe(false);
  });

  it('KHÔNG đụng vào mã người dùng tự mang tới (không phải build codegen)', () => {
    for (const mode of ['edit', 'import', 'service']) {
      expect(shouldRepairClone(f({}), { mode, alreadyTried: false })).toBe(false);
    }
  });

  it('điểm thấp nhưng KHÔNG nói được thiếu gì → không sửa (tránh đoán mò)', () => {
    expect(shouldRepairClone(f({ missingLines: [], missingTables: 0, invented: [] }), codegen)).toBe(false);
  });

  it('thiếu bảng, hoặc thừa menu tự bịa, cũng đủ để sửa', () => {
    expect(shouldRepairClone(f({ missingLines: [], missingTables: 2 }), codegen)).toBe(true);
    expect(shouldRepairClone(f({ missingLines: [], invented: ['Liên hệ'] }), codegen)).toBe(true);
  });
});
