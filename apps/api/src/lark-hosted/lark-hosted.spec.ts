import { maskAppId } from './lark-hosted.service';
import { encryptJson, decryptJson } from '../common/secret-crypto';

/**
 * Bài kiểm cho tính năng "Larkwave chạy lịch hộ" — chỗ DUY NHẤT hệ thống cất app_secret Lark.
 *
 * Ở đây kiểm hai thứ không được phép trôi: khoá kho tách khỏi JWT_SECRET có thật sự tách không,
 * và app_id hiện ra giao diện có bị che đủ không.
 */
describe('lark-hosted: kho khoá', () => {
  const VAULT = 'khoa-kho-lark-rieng-32-ky-tu-tro-len';
  const JWT = 'jwt-secret-hoan-toan-khac';

  it('mã rồi giải lại ra đúng app_secret', () => {
    const blob = encryptJson({ appSecret: 'bi-mat-cua-toi' }, VAULT);
    expect(decryptJson<{ appSecret: string }>(blob, VAULT)?.appSecret).toBe('bi-mat-cua-toi');
  });

  it('KHOÁ KHO TÁCH THẬT: JWT_SECRET không mở được kho', () => {
    // Đây là lý do tồn tại của LARK_CREDS_KEY. Nếu ngày nào đó bài kiểm này đỏ, nghĩa là ai đó
    // đã cho kho tụt về dùng chung JWT_SECRET — và lộ JWT_SECRET sẽ kéo theo mọi app_secret Lark.
    const blob = encryptJson({ appSecret: 'bi-mat-cua-toi' }, VAULT);
    expect(decryptJson(blob, JWT)).toBeNull();
  });

  it('blob bị sửa thì giải mã trả null, không trả rác', () => {
    const blob = encryptJson({ appSecret: 'bi-mat-cua-toi' }, VAULT);
    const [v, iv, tag, data] = blob.split(':');
    const tampered = [v, iv, tag, `${data.slice(0, -4)}AAAA`].join(':');
    expect(decryptJson(tampered, VAULT)).toBeNull();
  });
});

describe('lark-hosted: che app_id', () => {
  it('che phần giữa nhưng vẫn nhận ra được app nào', () => {
    const masked = maskAppId('cli_a1b2c3d4e5f6g7h8');
    expect(masked).toBe('cli_a1b2…g7h8');
    expect(masked).not.toContain('c3d4e5f6');
  });

  it('chuỗi ngắn thì để nguyên (che nữa thành vô nghĩa)', () => {
    expect(maskAppId('cli_abc')).toBe('cli_abc');
  });
});
