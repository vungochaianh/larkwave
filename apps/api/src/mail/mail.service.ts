import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { AppConfigService } from '../config/app-config.service';

/**
 * Outbound mail via SMTP (Gmail by default). DEGRADES GRACEFULLY: when
 * SMTP_USER + SMTP_PASS are not both set, `isConfigured()` is false, `send()`
 * logs a warning and returns false (never throws), so the rest of the flow
 * (e.g. forgot-password) keeps working without leaking that mail is disabled.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: AppConfigService) {}

  /** True only when both SMTP credentials are present. */
  isConfigured(): boolean {
    const { SMTP_USER, SMTP_PASS } = this.config.env;
    return Boolean(SMTP_USER && SMTP_PASS);
  }

  /**
   * Đường thư có DÙNG ĐƯỢC không — kiểm tra thật bằng cách bắt tay với máy chủ SMTP.
   *
   * Vì sao cần: `isConfigured()` chỉ nói "có điền user/pass", KHÔNG nói mật khẩu còn đúng. Gmail
   * từ chối mật khẩu tài khoản thường (bắt buộc App Password) và thu hồi App Password khi đổi mật
   * khẩu — lúc đó cấu hình vẫn "đầy đủ" mà mọi lượt gửi đều hỏng. Trước đây hậu quả là người dùng
   * bấm "Quên mật khẩu", được báo "đã gửi mã", rồi chờ một email KHÔNG BAO GIỜ tới; chỉ có một
   * dòng WARN trong log máy chủ mà không ai đọc.
   *
   * Nhớ đệm kết quả: bắt tay SMTP tốn cả giây, không thể làm mỗi lượt gọi.
   */
  private healthAt = 0;
  private healthy: boolean | null = null;

  async isHealthy(): Promise<boolean> {
    if (!this.isConfigured()) return false;
    const TTL = 5 * 60_000;
    if (this.healthy !== null && Date.now() - this.healthAt < TTL) return this.healthy;
    try {
      await this.getTransporter()!.verify();
      this.healthy = true;
    } catch (err) {
      this.logger.error(`SMTP không dùng được: ${String(err).slice(0, 200)}`);
      this.healthy = false;
    }
    this.healthAt = Date.now();
    return this.healthy;
  }

  /** Một lượt gửi hỏng cũng làm mất hiệu lực bộ nhớ đệm — lần sau kiểm lại ngay. */
  private markUnhealthy(): void {
    this.healthy = false;
    this.healthAt = Date.now();
  }

  private getTransporter(): Transporter | null {
    if (!this.isConfigured()) return null;
    if (this.transporter) return this.transporter;
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = this.config.env;
    this.transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465, // SSL on 465, STARTTLS otherwise
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    return this.transporter;
  }

  /**
   * Send an HTML email. Returns true on success, false when mail is not
   * configured or the send failed — never throws into the caller's path.
   */
  async send(to: string, subject: string, html: string): Promise<boolean> {
    const transporter = this.getTransporter();
    if (!transporter) {
      this.logger.warn(`Mail not configured — skipped sending "${subject}" to ${to}`);
      return false;
    }
    const { SMTP_FROM, SMTP_USER, MAIL_FROM_NAME } = this.config.env;
    const fromAddress = SMTP_FROM || SMTP_USER;
    try {
      await transporter.sendMail({
        from: `"${MAIL_FROM_NAME}" <${fromAddress}>`,
        to,
        subject,
        html,
      });
      return true;
    } catch (err) {
      this.logger.error(`Mail send failed to ${to}: ${String(err)}`);
      this.markUnhealthy();
      return false;
    }
  }

  /**
   * Send a Vietnamese OTP email showing the 6-digit `code` prominently. `purpose`
   * tailors the heading/intro: `'reset'` = đặt lại mật khẩu, `'change'` = đổi mật
   * khẩu. The code expires after 10 minutes. Returns false (never throws) when
   * mail is not configured.
   */
  async sendOtpCode(to: string, code: string, purpose: 'reset' | 'change'): Promise<boolean> {
    const action = purpose === 'change' ? 'đổi mật khẩu' : 'đặt lại mật khẩu';
    const heading = purpose === 'change' ? 'Mã xác thực đổi mật khẩu' : 'Mã xác thực đặt lại mật khẩu';
    const subject = purpose === 'change' ? 'Mã đổi mật khẩu Larkwave' : 'Mã đặt lại mật khẩu Larkwave';
    const safeCode = this.escapeHtml(code);
    const html = `<!DOCTYPE html>
<html lang="vi">
  <body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
            <tr>
              <td style="background:#4f46e5;padding:24px 32px;">
                <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.02em;">Larkwave</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;color:#1f2937;">
                <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#111827;">${heading}</h1>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#374151;">
                  Chúng tôi nhận được yêu cầu ${action} cho tài khoản của bạn.
                  Nhập mã xác thực bên dưới để tiếp tục.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:8px 0 24px;">
                  <tr>
                    <td align="center" style="background:#f3f4ff;border:1px solid #e0e7ff;border-radius:12px;padding:20px;">
                      <div style="font-size:38px;font-weight:700;letter-spacing:10px;color:#4f46e5;font-family:'Courier New',Courier,monospace;">${safeCode}</div>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#6b7280;">
                  Mã này sẽ <strong>hết hạn sau 10 phút</strong>. Vì lý do bảo mật, vui lòng không
                  chia sẻ mã này với bất kỳ ai.
                </p>
                <p style="margin:8px 0 0;font-size:13px;line-height:1.6;color:#6b7280;">
                  Nếu bạn không yêu cầu ${action}, vui lòng bỏ qua email này —
                  tài khoản của bạn vẫn an toàn.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #f0f0f0;">
                <p style="margin:0;font-size:12px;color:#9ca3af;">© Larkwave — Nền tảng tạo app bằng AI</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
    return this.send(to, subject, html);
  }

  /**
   * Gửi MỘT THƯ DO NGƯỜI VẬN HÀNH TỰ SOẠN tới một người dùng.
   *
   * Vì sao cần: nền tảng có người dùng thật, nhưng trước đó KHÔNG có đường nào để nói với họ
   * khi có sự cố. Đo ngày 24/09/2026: một người dùng mất bốn site vì một lỗi của chúng ta, đã
   * sửa xong, nhưng không có cách nào báo cho họ biết — mọi `notify()` trong kho đều là thông báo tự
   * động, và không có màn nào soạn thư.
   *
   * `body` là VĂN BẢN THUẦN, không phải HTML: nó được ESCAPE rồi mới đặt vào khung. Người vận
   * hành gõ dấu `<` trong một câu bình thường không được phép làm vỡ thư, và một đoạn HTML dán
   * nhầm vào đó không được phép trở thành thẻ thật.
   *
   * Địa chỉ người nhận KHÔNG được lấy từ đầu vào của client ở tuyến gọi hàm này — phải đọc từ
   * CSDL theo `userId`, nếu không là biến hệ thống thành một relay mở cho bất kỳ ai có quyền admin bị
   * chiếm.
   */
  async sendNotice(
    to: string,
    subject: string,
    body: string,
    cta?: { label: string; url: string },
  ): Promise<boolean> {
    const safeSubject = this.escapeHtml(subject);
    // Xuống dòng của người soạn phải thành xuống dòng trong thư: escape TRƯỚC, đổi ký tự xuống
    // dòng thành thẻ <br> SAU — làm ngược thứ tự thì chính các thẻ vừa chèn bị escape mất.
    const safeBody = this.escapeHtml(body).replace(/\r?\n/g, '<br />');
    const nutCta = cta
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;">
                  <tr>
                    <td style="background:#4f46e5;border-radius:10px;">
                      <a href="${this.escapeHtml(cta.url)}" style="display:inline-block;padding:12px 22px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">${this.escapeHtml(cta.label)}</a>
                    </td>
                  </tr>
                </table>`
      : '';
    const html = `<!DOCTYPE html>
<html lang="vi">
  <body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
            <tr>
              <td style="background:#4f46e5;padding:24px 32px;">
                <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.02em;">Larkwave</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;color:#1f2937;">
                <h1 style="margin:0 0 16px;font-size:19px;font-weight:600;color:#111827;">${safeSubject}</h1>
                <div style="margin:0;font-size:15px;line-height:1.7;color:#374151;">${safeBody}</div>
                ${nutCta}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #f0f0f0;">
                <p style="margin:0;font-size:12px;color:#9ca3af;">© Larkwave — Nền tảng tạo app bằng AI</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
    return this.send(to, subject, html);
  }

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
