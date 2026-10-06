import { etaFor, kindOf, remainingSec } from './build-eta';

describe('kindOf', () => {
  it('phân biệt bản sao với website thường — hai loại chênh nhau gấp đôi thời gian', () => {
    expect(kindOf({ mode: 'codegen', hasSourceUrl: true })).toBe('clone');
    expect(kindOf({ mode: 'codegen', hasSourceUrl: false })).toBe('codegen');
    expect(kindOf({ mode: 'edit', hasSourceUrl: false })).toBe('edit');
    expect(kindOf({ mode: 'import', hasSourceUrl: false })).toBe('other');
  });
});

describe('etaFor', () => {
  it('ít mẫu thì dùng mặc định đo sẵn, không bịa', () => {
    const e = etaFor('clone', [100, 200]);
    expect(e.samples).toBe(2);
    expect(e.p50).toBe(890);
  });

  it('đủ mẫu thì tin lịch sử', () => {
    const e = etaFor('codegen', [100, 200, 300, 400, 500, 600]);
    expect(e.samples).toBe(6);
    expect(e.p50).toBe(400);
  });

  it('bỏ qua số rác (0, âm, NaN) — build hỏng sớm sẽ kéo lệch dự đoán', () => {
    const e = etaFor('codegen', [0, -5, NaN, 100, 200, 300, 400, 500]);
    expect(e.samples).toBe(5);
  });
});

describe('remainingSec', () => {
  it('còn trong hạn → đếm ngược bình thường', () => {
    expect(remainingSec({ kind: 'codegen', samples: 9, p50: 600, p80: 900 }, 120)).toEqual({ remain: 480, overdue: false });
  });

  it('quá p50 → chuyển sang mốc p80 thay vì đứng ở 0', () => {
    const r = remainingSec({ kind: 'codegen', samples: 9, p50: 600, p80: 900 }, 700);
    expect(r).toEqual({ remain: 200, overdue: false });
  });

  it('quá cả p80 → thú nhận không đoán được nữa', () => {
    const r = remainingSec({ kind: 'codegen', samples: 9, p50: 600, p80: 900 }, 1000);
    expect(r.overdue).toBe(true);
    expect(r.remain).toBe(0);
  });
});
