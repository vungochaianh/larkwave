import { Alert } from 'antd';
import { apiFetch } from '../account/api';

/**
 * Lỗi runner (Claude CLI / API) nhìn từ phía người dùng cuối, cùng chỗ duy nhất để NHẬN DIỆN,
 * HIỂN THỊ thành các bước sửa, và GỬI telemetry về server cho /admin thấy.
 *
 * Vì sao gom một chỗ: hai màn chat (Trợ lý AI chung và Lark) xử lý sự kiện khác nhau nhưng phải
 * hiện y hệt nhau và báo cáo y hệt nhau — tách rời thì chắc chắn lệch.
 */

export type RunnerErrorKind = 'auth' | 'credit' | 'context' | 'overload' | 'rate_limit' | 'other';

/**
 * Nhận diện lỗi có cách sửa RÕ RÀNG từ nội dung một tin nhắn — CHỈ auth + credit.
 *
 * Dùng để quyết định có THAY câu lỗi tiếng Anh bằng một thẻ các bước không. Giới hạn ở auth/credit
 * vì đó là hai chữ ký đủ đặc trưng để không bắt nhầm một câu trả lời tình cờ nhắc tới "401" hay
 * "api key". Trả null cho tin nhắn thường.
 */
export function diagnoseRunnerError(text?: string): { kind: 'auth' | 'credit' } | null {
  const t = (text || '').toLowerCase();
  if (!t) return null;
  if (
    /failed to authenticate|api key is invalid|invalid api key|api error:\s*40[13]\b|401 api key|\bunauthorized\b|not logged in|xác thực claude (cli )?(bị )?(lỗi|thất bại)/.test(
      t,
    )
  ) {
    return { kind: 'auth' };
  }
  if (/credit balance is too low|insufficient credit|payment required|api error:\s*402\b|hết credit api/.test(t)) {
    return { kind: 'credit' };
  }
  return null;
}

/**
 * Phân loại RỘNG cho telemetry — gồm cả context/overload/rate_limit, và 'other'.
 *
 * Chỉ gọi khi ĐÃ CHẮC đây là một lỗi (sự kiện `error`, hoặc chữ đã khớp diagnoseRunnerError) — nên
 * trả 'other' là hợp lệ. KHÔNG quét chữ assistant tuỳ ý bằng hàm này (sẽ gắn nhãn 'other' cho mọi
 * câu trả lời bình thường).
 */
export function classifyRunnerError(text?: string): RunnerErrorKind {
  const t = (text || '').toLowerCase();
  if (
    /failed to authenticate|api key is invalid|invalid api key|api error:\s*40[13]\b|401 api key|\bunauthorized\b|not logged in|xác thực claude/.test(
      t,
    )
  )
    return 'auth';
  if (/credit balance is too low|insufficient credit|payment required|api error:\s*402\b|hết credit/.test(t))
    return 'credit';
  if (/prompt is too long|context.*(too long|window|exceed|limit)|maximum.*context|too many tokens|input length|chạm giới hạn ngữ cảnh/.test(t))
    return 'context';
  if (/overloaded|\b529\b|service unavailable|\b503\b|đang quá tải/.test(t)) return 'overload';
  if (/rate limit|too many requests|\b429\b|giới hạn tần suất/.test(t)) return 'rate_limit';
  return 'other';
}

/**
 * Thẻ hướng dẫn các bước sửa — hiện THAY cho câu lỗi tiếng Anh khó hiểu. Giữ `raw` ở cuối dưới dạng
 * "chi tiết kỹ thuật" để vẫn tra được, nhưng không bắt người dùng phải tự hiểu nó.
 */
export function RunnerErrorCard({
  kind,
  raw,
  tr,
}: {
  kind: 'auth' | 'credit';
  raw?: string;
  tr: (k: string, d: string) => string;
}) {
  const auth = kind === 'auth';
  const title = auth
    ? tr('chat.fixAuth.title', 'Xác thực Claude CLI thất bại — KHÔNG phải lỗi đăng nhập Larkwave')
    : tr('chat.fixCredit.title', 'Tài khoản Claude đã hết credit API');
  const steps = auth
    ? [
        tr(
          'chat.fixAuth.s1',
          'Đây là lỗi của Claude CLI trên MÁY BẠN, không liên quan tài khoản Larkwave (bạn vẫn đang đăng nhập bình thường).',
        ),
        tr('chat.fixAuth.s2', 'Mở Cài đặt → mục Claude: bấm "Đăng nhập lại", hoặc dán lại API key/token còn hiệu lực.'),
        tr(
          'chat.fixAuth.s3',
          'Nếu dùng API key: kiểm tra key chưa bị thu hồi và còn số dư tại console.anthropic.com → Billing.',
        ),
        tr('chat.fixAuth.s4', 'Claude CLI có thể đã cũ — cập nhật rồi thử lại: npm i -g @anthropic-ai/claude-code'),
        tr('chat.fixAuth.s5', 'Hoặc chuyển sang tab "API riêng" (dán API key) / đổi runner khác trong Cài đặt.'),
      ]
    : [
        tr(
          'chat.fixCredit.s1',
          'Nạp thêm credit cho tài khoản Anthropic của key đang dùng tại console.anthropic.com → Billing.',
        ),
        tr('chat.fixCredit.s2', 'Hoặc đăng nhập Claude bằng thuê bao Pro/Max trong Cài đặt → mục Claude.'),
        tr('chat.fixCredit.s3', 'Hoặc đổi sang runner/API key khác trong Cài đặt.'),
      ];
  return (
    <Alert
      type="warning"
      showIcon
      message={<span style={{ fontWeight: 600 }}>{title}</span>}
      description={
        <div>
          <ol style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.6 }}>
            {steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          <div style={{ marginTop: 8, fontSize: 12.5, opacity: 0.85 }}>
            {tr('chat.fixKeep', 'Hội thoại được giữ nguyên — sửa xong gửi lại tin là chạy tiếp.')}
          </div>
          {raw ? (
            <div
              style={{
                marginTop: 8,
                fontSize: 11.5,
                opacity: 0.6,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                wordBreak: 'break-word',
              }}
            >
              {tr('chat.fixTech', 'Chi tiết kỹ thuật')}: {raw.slice(0, 300)}
            </div>
          ) : null}
        </div>
      }
    />
  );
}

// Chống gửi trùng: khi lỗi tới dưới dạng chữ stream thì tin cuối cập nhật liên tục, mỗi lần một sự
// kiện — không chặn thì một lỗi đẻ ra hàng chục dòng telemetry giống hệt nhau.
let lastReport = { sig: '', at: 0 };

/**
 * Gửi một lỗi runner về server để người vận hành thấy ở /admin. Fire-and-forget:
 * KHÔNG BAO GIỜ ném, không chặn chat, nuốt mọi lỗi mạng — telemetry hỏng không được làm hỏng chat.
 */
export function reportRunnerError(input: {
  runner?: string;
  model?: string;
  kind: RunnerErrorKind;
  message?: string;
  surface?: string;
}): void {
  try {
    const msg = (input.message || '').slice(0, 1000);
    const sig = `${input.surface}|${input.runner}|${input.kind}|${msg.slice(0, 80)}`;
    const now = Date.now();
    if (sig === lastReport.sig && now - lastReport.at < 60_000) return;
    lastReport = { sig, at: now };
    void apiFetch('/me/runner-errors', {
      method: 'POST',
      body: {
        runner: input.runner || 'claude',
        model: input.model,
        kind: input.kind,
        message: msg,
        surface: input.surface || 'general',
      },
    }).catch(() => undefined);
  } catch {
    /* telemetry không bao giờ làm hỏng chat */
  }
}
