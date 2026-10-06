/**
 * In HTML ra PDF bằng chính Chromium có sẵn trong Electron.
 *
 * Vì sao KHÔNG tự dựng PDF từ số không: PDF không có khái niệm "bọc dòng" hay "bảng" — muốn có
 * thì phải tự nhúng phông, tự đo bề rộng từng chữ, tự ngắt dòng, tự sang trang. Với tiếng Việt
 * còn thêm dấu chồng. Làm tay thì ra một tệp PDF trông như máy đánh chữ hỏng, trong khi Chromium
 * đã làm đúng việc đó hàng tỉ lần mỗi ngày và đã nằm sẵn trong bản cài.
 *
 * TÁCH RIÊNG khỏi `fileBuild.ts` vì module này `import 'electron'`. `fileBuild.ts` phải dùng được
 * ở bản chạy nền trên VM (chỗ không có Electron); gộp chung là kéo electron vào bản dựng headless
 * và nó chết ngay lúc khởi động bằng một lỗi chẳng liên quan gì tới nguyên nhân.
 */
import { BrowserWindow } from 'electron';

/**
 * Dựng PDF từ một trang HTML tự chứa.
 *
 * Nạp bằng `data:` URL chứ không ghi tệp tạm: trang này do model sinh nội dung, và một tệp `.html`
 * nằm trên đĩa là thứ có thể bị mở nhầm bằng trình duyệt thật sau đó. `data:` sống đúng trong lượt
 * in rồi biến mất cùng cửa sổ.
 */
export async function htmlToPdf(html: string): Promise<Buffer> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      // Trang này chứa dữ liệu từ Base của người dùng. Không cho nó chạm gì ngoài việc hiển thị:
      // không Node, có cách ly ngữ cảnh, bật hộp cát. Ngay cả khi model nhét <script> vào nội
      // dung thì nó cũng không với tới được máy.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      javascript: false,
      webSecurity: true,
      images: false,
    },
  });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    return await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { marginType: 'custom', top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
    });
  } finally {
    // `destroy()` chứ không `close()`: `close()` có thể bị chặn bởi handler, và một cửa sổ ẩn
    // sống sót thì tiến trình không thoát được — người dùng bấm thoát mà app vẫn nằm ở Dock.
    if (!win.isDestroyed()) win.destroy();
  }
}

/** Có dựng PDF được ở tiến trình này không (bản chạy nền trên VM thì không). */
export function canMakePdf(): boolean {
  try {
    return typeof BrowserWindow === 'function';
  } catch {
    return false;
  }
}
