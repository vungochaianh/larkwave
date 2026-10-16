/**
 * Thư mục tệp của LƯỢT CHẠY HIỆN TẠI — và bộ phân giải đường dẫn công cụ dùng chung.
 *
 * Trước đây thư mục ghi (`OUT_DIR`) và thư mục đính kèm là hai biến cấp module, đặt lúc BẮT ĐẦU một
 * lượt. Hai lượt chạy song song (một lịch tự động hoá nổ đúng lúc người dùng đang chat) thì lượt sau
 * ghi đè thư mục của lượt trước: báo cáo của lịch rơi vào thư mục hội thoại, tệp người dùng vừa đính
 * kèm thì "không tìm thấy". Nay mỗi lần THỰC THI công cụ chạy trong `withTurnFiles(ctx, …)`
 * (AsyncLocalStorage) — ngữ cảnh đi theo chuỗi async của đúng lời gọi đó; biến cấp module chỉ còn là
 * giá trị dự phòng cho nơi gọi cũ chưa truyền ngữ cảnh.
 *
 * Thuần Node (không electron) — bản chạy nền trên VM dùng chung.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { resolveLocalFile, type LocalFilePolicy, type ResolvedFile } from './filePaths';

export interface TurnFileContext {
  /** Nơi `create_file`/xuất bảng ghi tệp của lượt này. */
  outDir?: string | null;
  /** Thư mục chứa tệp người dùng đính kèm (đọc được, `fill_xlsx` lấy mẫu từ đây). */
  attachDir?: string | null;
  /** Thư mục được phép thêm (thư mục của một quy tắc tự động hoá). */
  extraRoots?: string[];
  /**
   * KHÔNG sao lưu tệp dựng ra lên máy chủ tài khoản (lượt tự động hoá / Học từ Base): tệp của lần chạy đã
   * nằm trong thư mục quy tắc (giữ N lần) — tải lên mỗi lần chạy chỉ làm đầy hạn mức lưu trữ.
   */
  noUpload?: boolean;
  /**
   * LÀN của lượt = id hội thoại: mọi tool phiên Lark web chạy trên TRANG Lark riêng của hội thoại này
   * (larkWebSession.withLarkLane) — hai tab làm hai Base khác nhau không kéo trang của nhau đi.
   */
  lane?: string;
  /**
   * Quyền dùng kết nối CÁ NHÂN (Zalo, Gmail) của lượt này — xem tools/connectors.ts. CHỈ lượt trò chuyện
   * của chính chủ máy mới có (larkService.chat); lượt bot Lark, lịch tự động, lượt chia sẻ: không có.
   */
  connectors?: ConnectorAccess;
}

/**
 * Kỹ năng đã nạp vào lượt + ĐÚNG những công cụ Zalo/Gmail mà nội dung của chúng dùng tới. Đổi được
 * giữa lượt (skill_get nạp thêm kỹ năng).
 */
export interface ConnectorAccess {
  skills: string[];
  tools: string[];
}

const als = new AsyncLocalStorage<TurnFileContext>();

let OUT_DIR: string | null = null;
let ATTACH_DIR: string | null = null;

/** Chạy `fn` với ngữ cảnh tệp của một lượt (không có ngữ cảnh → chạy thẳng, dùng giá trị dự phòng). */
export function withTurnFiles<T>(ctx: TurnFileContext | null | undefined, fn: () => T): T {
  return ctx ? als.run(ctx, fn) : fn();
}

export function currentTurnFiles(): TurnFileContext | undefined {
  return als.getStore();
}

export function setGlobalOutDir(dir: string | null): void {
  OUT_DIR = dir;
}
export function setGlobalAttachDir(dir: string | null): void {
  ATTACH_DIR = dir;
}
/** Thư mục ghi của lượt hiện tại (ngữ cảnh lượt thắng giá trị dự phòng). */
export function turnOutDir(): string | null {
  const s = als.getStore();
  return s && s.outDir !== undefined ? s.outDir : OUT_DIR;
}
export function turnAttachDir(): string | null {
  const s = als.getStore();
  return s && s.attachDir !== undefined ? s.attachDir : ATTACH_DIR;
}
export function turnExtraRoots(): string[] {
  return als.getStore()?.extraRoots ?? [];
}

/** Môi trường cố định của tiến trình (đặt một lần lúc khởi động). */
export interface LocalFileEnv {
  larkwaveWorkRoot?: string | null;
  toolswaveRoots?: string[];
  conversationExists?: (convId: string) => boolean;
}
let ENV: LocalFileEnv = {};
export function setLocalFileEnv(env: LocalFileEnv): void {
  ENV = { ...env };
}
export function getLocalFileEnv(): LocalFileEnv {
  return ENV;
}

/** Chính sách phân giải cho lượt hiện tại (+ thư mục phụ do nơi gọi đưa, vd `userData/lark/work` của nút trên thẻ tệp). */
export function turnFilePolicy(extraRoot?: string | null): LocalFilePolicy {
  return {
    roots: [turnOutDir(), turnAttachDir(), ...turnExtraRoots(), extraRoot ?? null],
    larkwaveWorkRoot: ENV.larkwaveWorkRoot ?? null,
    toolswaveRoots: ENV.toolswaveRoots ?? [],
    conversationExists: ENV.conversationExists,
  };
}

/**
 * Phân giải một đường dẫn tệp do MODEL đưa cho công cụ (đính/tải lên/nhập/điền/gửi/đọc): thư mục của
 * lượt, thư mục đính kèm, thư mục tự động hoá, hoặc tệp trong thư mục làm việc Toolswave của một hội
 * thoại đã nhập (tự chép sang Larkwave). Mọi thứ khác bị từ chối. Xem filePaths.resolveLocalFile.
 */
export function resolveToolFile(p: string | null | undefined, extraRoot?: string | null): Promise<ResolvedFile> {
  return resolveLocalFile(p, turnFilePolicy(extraRoot));
}
