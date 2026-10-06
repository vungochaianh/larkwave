/**
 * Cầu để tool `create_skill` của Lark agent tạo được KỸ NĂNG mà tầng tool không phải import
 * `SkillHost` (tool chỉ nhận một `LarkClient`).
 *
 * Cùng lý do với `scheduleBridge`: `SkillHost` chạm `electron` (app.getPath) và `fs`, nên import
 * cứng từ tầng tool sẽ kéo electron vào bản dựng headless cho VM và chết ngay lúc khởi động bằng
 * một lỗi chẳng liên quan gì tới nguyên nhân. Ai có `SkillHost` thì tự đăng ký vào đây.
 *
 * Vì sao cần tool này: người dùng đã dạy được agent LÊN LỊCH cho chính nó (`schedule_agent_job`),
 * nhưng kỹ năng thì vẫn phải tự mở màn hình Kỹ năng gõ tay. Mà một "bộ kỹ năng kiểm chéo" đúng là
 * thứ hội thoại sinh ra tự nhiên nhất — agent vừa phân tích xong Base, nó biết chính xác cần khoá
 * gì, sinh ra khoá gì. Bắt người dùng chép tay lại toàn bộ sang màn hình khác là vứt đi đúng phần
 * ngữ cảnh khó kiếm nhất.
 */
export interface AuthorSkillInput {
  /** Tên hiển thị. Id/slug do `SkillHost` tự sinh từ tên này. */
  name: string;
  /** Thân SKILL.md — hướng dẫn bằng lời cho model. */
  instructions: string;
  /** "/lệnh" tắt, không kèm dấu "/" ở đầu. Bỏ trống = không có lệnh tắt. */
  command?: string;
  /** Nhãn phân loại (vd "Lark"). */
  tags?: string[];
  /** Model nào áp dụng ('claude'|'grok'|'gemini'|'codex'); bỏ trống = tất cả. */
  scope?: string[];
  /** Hợp đồng — bỏ trống là kỹ năng thường, không tham gia kiểm chéo. */
  contract?: {
    needs?: string[];
    produces?: string[];
    checks?: string[];
    target?: { base?: string; table: string; map: Record<string, string> };
  };
}

export interface AuthorSkillResult {
  id: string;
  name: string;
  /** Có khai hợp đồng không — để câu trả lời của agent nói đúng nó vừa tạo loại gì. */
  hasContract: boolean;
  /** Khoá đang thiếu người sinh ra, nếu bộ này chưa đủ. Rỗng = không vướng gì. */
  missingKeys: string[];
}

export interface EditSkillInput {
  /** Id kỹ năng (lấy từ `list_skills`). */
  id: string;
  instructions?: string;
  contract?: AuthorSkillInput['contract'];
}

type Author = (input: AuthorSkillInput) => Promise<AuthorSkillResult>;
type Editor = (input: EditSkillInput) => Promise<AuthorSkillResult>;
type Lister = () => Promise<{ id: string; name: string; enabled: boolean; needs: string[]; produces: string[] }[]>;

let author: Author | null = null;
let editor: Editor | null = null;
let lister: Lister | null = null;

/** localAdapter đăng ký ở đây — nó là nơi giữ `SkillHost`. */
export function setAgentSkillAuthor(fn: Author | null): void {
  author = fn;
}
export function getAgentSkillAuthor(): Author | null {
  return author;
}
export function setAgentSkillLister(fn: Lister | null): void {
  lister = fn;
}
export function getAgentSkillLister(): Lister | null {
  return lister;
}
export function setAgentSkillEditor(fn: Editor | null): void {
  editor = fn;
}
export function getAgentSkillEditor(): Editor | null {
  return editor;
}
