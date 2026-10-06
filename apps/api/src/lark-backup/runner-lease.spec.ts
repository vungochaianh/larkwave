/**
 * Ai được chạy lịch tự động hoá Lark.
 *
 * Lịch có thể chạy ở hai nơi — app desktop và một máy chạy nền (VM). Sai luật ở đây không phải là
 * một lỗi giao diện: mỗi lịch sẽ chạy HAI lần, và với lịch ghi dữ liệu đó là hai bản ghi trùng
 * trong Base thật của khách, lặp lại mỗi chu kỳ.
 */
import { canTakeRunner } from './lark-backup.service';

/** Gọi ĐÚNG luật của service — không chép lại, kẻo hai bản trôi lệch mà test vẫn xanh. */
const decide = (
  cur: { ownerId: string; ownerKind: string; beatAt: number } | null,
  me: { ownerId: string; ownerKind: 'vm' | 'desktop' },
  now: number,
) => canTakeRunner(cur, me, now);

const NOW = 1_000_000;
const vm = { ownerId: 'vm-1', ownerKind: 'vm' as const };
const pc = { ownerId: 'pc-1', ownerKind: 'desktop' as const };

describe('quyền chạy lịch', () => {
  it('chưa ai giữ ⇒ ai xin cũng được', () => {
    expect(decide(null, pc, NOW)).toBe(true);
    expect(decide(null, vm, NOW)).toBe(true);
  });

  it('chính mình đang giữ ⇒ tiếp tục giữ', () => {
    expect(decide({ ...pc, beatAt: NOW - 1000 }, pc, NOW)).toBe(true);
  });

  it('VM GIÀNH được quyền từ desktop — đó là nơi người dùng cố ý đặt để chạy 24/7', () => {
    expect(decide({ ...pc, beatAt: NOW - 1000 }, vm, NOW)).toBe(true);
  });

  it('nhưng desktop KHÔNG giành lại được từ VM đang sống — nếu không thì hai bên tranh nhau mỗi nhịp', () => {
    expect(decide({ ...vm, beatAt: NOW - 1000 }, pc, NOW)).toBe(false);
  });

  it('desktop khác cũng không cướp được của desktop đang sống', () => {
    expect(decide({ ...pc, beatAt: NOW - 1000 }, { ownerId: 'pc-2', ownerKind: 'desktop' }, NOW)).toBe(false);
  });

  it('chủ im quá 90 giây ⇒ coi như chết, bên khác tiếp quản', () => {
    expect(decide({ ...vm, beatAt: NOW - 91_000 }, pc, NOW)).toBe(true);
  });

  it('ngay TRƯỚC mốc 90 giây thì vẫn là chủ', () => {
    expect(decide({ ...vm, beatAt: NOW - 89_999 }, pc, NOW)).toBe(false);
  });

  it('VM này không cướp của VM khác đang sống — hai VM cùng chạy vẫn chỉ một cái làm việc', () => {
    expect(decide({ ownerId: 'vm-2', ownerKind: 'vm', beatAt: NOW - 1000 }, vm, NOW)).toBe(false);
  });
});
