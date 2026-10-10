/**
 * "⚡ Hỏi nhanh" của Lark × Agents — các nút bấm-một-cái gửi một yêu cầu dài, chính xác cho trợ lý
 * (bong bóng chat chỉ hiện NHÃN ngắn; câu lệnh thật đi thẳng tới AI).
 *
 * Hàm THUẦN (không React) để kiểm được bằng node. Từ 10/2026 "Lark × Agents" và "Tạo workflow" là MỘT
 * agent / MỘT danh sách hội thoại, hai BỐ CỤC — nên chỉ còn MỘT bộ nút (gộp nút dữ liệu + nút workflow,
 * khử trùng), xếp thứ tự theo bố cục: 'chat' → nút dữ liệu trước; 'frame' → nút workflow trước. Câu lệnh
 * chèn app_token của Base của hội thoại, chọn đường công cụ theo việc có custom app hay chỉ có phiên
 * Lark web, và "Hỏi nhanh của tôi" là một danh sách duy nhất.
 *
 * Quy ước tên gọi: "workflow" = KHỐI Workflow (canvas ở thanh bên Base, lark_web_create_workflows);
 * "tự động hoá/automation" = Automation cổ điển — nút chỉ tạo automation khi nhãn nói rõ như vậy.
 *
 * Luật chung: không câu lệnh nào được bảo trợ lý BẬT automation — bản nháp luôn TẮT, người dùng tự bật.
 */

export interface QuickAsk {
  /** Khoá ổn định (cũng là khoá dịch `chat.util_<k>`). Hỏi nhanh tự thêm thì không có. */
  k?: string;
  label: string;
  prompt: string;
}
export interface QuickBase {
  name: string;
  appToken: string;
}
export type QuickAskMode = 'chat' | 'workflow';
export type QuickAskLayout = 'chat' | 'frame';
export interface QuickAskCtx {
  /** Bố cục đang hiển thị ('frame' = màn Tạo workflow). `mode` cũ: 'workflow' ≙ 'frame'. */
  layout?: QuickAskLayout;
  mode?: QuickAskMode;
  /** Base của hội thoại (một hoặc nhiều). */
  bases: QuickBase[];
  /** Đã kết nối custom app (App ID/App Secret) → được dùng thêm tool Open API. */
  appConnected: boolean;
  /** Bản dev: hiện thêm nút gỡ lỗi (không bao giờ cho người dùng thường). */
  dev?: boolean;
}

/** Hội thoại thường, chưa gắn Base: câu ví dụ (nhãn = câu lệnh). */
export const CHAT_EXAMPLES: QuickAsk[] = [
  { k: 'ex1', label: 'Liệt kê tất cả các bảng trong Base đã đăng ký', prompt: 'Liệt kê tất cả các bảng trong Base đã đăng ký' },
  { k: 'ex2', label: 'Bảng đầu tiên có những trường (cột) nào?', prompt: 'Bảng đầu tiên có những trường (cột) nào?' },
  { k: 'ex3', label: 'Có bao nhiêu bản ghi trong bảng "Khách hàng"?', prompt: 'Có bao nhiêu bản ghi trong bảng "Khách hàng"?' },
  { k: 'ex4', label: 'Tìm các bản ghi có Trạng thái = "ON" trong bảng Đơn', prompt: 'Tìm các bản ghi có Trạng thái = "ON" trong bảng Đơn' },
  { k: 'ex5', label: 'Tóm tắt dữ liệu trong Base này giúp tôi', prompt: 'Tóm tắt dữ liệu trong Base này giúp tôi' },
  { k: 'ex6', label: 'Thêm một dòng mới vào bảng Công việc: Tên = "Demo", Trạng thái = "Mới"', prompt: 'Thêm một dòng mới vào bảng Công việc: Tên = "Demo", Trạng thái = "Mới"' },
  { k: 'ex7', label: 'Cập nhật bản ghi … thành …', prompt: 'Cập nhật bản ghi … thành …' },
  { k: 'ex8', label: 'Gửi tin nhắn vào nhóm chat … nội dung …', prompt: 'Gửi tin nhắn vào nhóm chat … nội dung …' },
];

/** Định dạng bắt buộc khi trình bày workflow — giao diện tự vẽ cây + liên kết "WF<số>". */
export const WF_FORMAT =
  'ĐỊNH DẠNG BẮT BUỘC (giao diện sẽ tự vẽ đẹp): với TỪNG workflow, in một tiêu đề đúng dạng "**WF<số>: <tên>** — đang bật/đang tắt" ' +
  '(đánh số WF1, WF2… để bấm liên kết được); NGAY DƯỚI đó dán NGUYÊN VĂN nội dung field "logic" của workflow đó từ kết quả tool — ' +
  'GIỮ nguyên từng dòng "• <biểu tượng> …", thụt lề 2 khoảng trắng mỗi cấp, tên bảng/cột/tuỳ chọn trong «…», và các nhãn "┗ ✔ ĐÚNG →", "┗ ✗ NGƯỢC LẠI →", "┗ Nhánh …", "┗ Mặc định …", "↳ chỉ chạy tiếp NẾU …". ' +
  'TUYỆT ĐỐI KHÔNG diễn giải cây thành đoạn văn, KHÔNG rút gọn, KHÔNG bỏ bước, KHÔNG đổi «…» thành id. Khi nhắc lại một workflow ở chỗ khác thì viết "WF<số>".';

const AUDIT_CHECKLIST =
  'Đánh số các workflow WF1, WF2… (nhắc tới chúng bằng "WF<số>" để bấm liên kết được). Tìm và chỉ ra các vấn đề: ' +
  'workflow đang TẮT (có đáng để tôi tự bật không? — nếu có thì hướng dẫn TÔI tự bật trong Lark, bạn KHÔNG bật); nhánh không bao giờ chạy hoặc điều kiện mâu thuẫn/không thể thoả; ' +
  'hành động trỏ tới bảng/cột đã bị đổi tên hoặc xoá; workflow không có hành động; người nhận cố định trong khi bảng có cột Người phụ trách; ' +
  'hai workflow cùng ghi vào một cột (xung đột) hoặc trùng lặp; thiếu nhánh "Nếu không"; nguy cơ vòng lặp/kích hoạt dây chuyền vô tận. ' +
  'Với mỗi vấn đề: nêu rõ WF<số> nào, lỗi gì, mức độ (cao/vừa/thấp), và CÁCH SỬA cụ thể. Trình bày thành bảng dễ đọc (tên bảng/cột để trong «…»); nếu không có lỗi thì nói rõ. ' +
  'Đây là việc CHỈ ĐỌC — không tạo/sửa gì.';

/** Luật an toàn + cách tạo chung cho mọi nút tạo WORKFLOW (khối canvas). */
const WF_CREATE_RULES =
  'Tạo bằng lark_web_create_workflows (MỘT lần cho cả bộ, kể cả khi chỉ 1 cái) — mỗi cái thành một KHỐI Workflow (canvas) ở thanh bên Base; chế độ tự động, không hỏi lại; luôn TẮT. ' +
  'Loại bước chưa tạo thẳng được (kind "unsupported": trigger theo ngày/hẹn giờ, tìm bản ghi, rẽ nhánh, gửi nhóm…) → tạo khối với phần tạo được rồi thêm bước còn lại trên canvas trong khung Lark bằng lark_ui_*, rồi lark_ui_saved. ' +
  'Thiếu cột cần dùng → thêm bằng lark_web_add_fields trước. Người nhận ưu tiên CỘT NGƯỜI của bản ghi (vd «Người phụ trách») — chỉ dùng "tôi" khi bảng không có cột Người. ' +
  'TUYỆT ĐỐI KHÔNG bật, xoá hay chạy thử workflow. Cuối cùng báo bảng: tên · workflow_id · "đang TẮT", và nhắc tôi xem canvas trong khung Lark rồi TỰ BẬT.';

const baseRef = (b: QuickBase) => `Base «${b.name}» (app_token=${b.appToken})`;

/** Bộ nút của chế độ "Tạo workflow" cho đúng Base đang chọn ở bộ chọn. */
export function workflowQuickAsks(base: QuickBase): QuickAsk[] {
  const B = baseRef(base);
  const T = base.appToken;
  return [
    {
      k: 'wfSuggest',
      label: '🧩 Nên thêm workflow nào',
      prompt:
        `Quét ${B} bằng lark_web_scan_base (đã kèm danh sách automation đang có — tránh tạo trùng). ` +
        'Đề xuất 3–6 WORKFLOW NÊN THÊM để Base hoàn thiện & tự động hơn, theo các nhóm: nhắc hạn/quá hạn, báo khi đổi trạng thái, giao việc cho người phụ trách, báo cáo định kỳ, kiểm tra ngưỡng/tồn kho, chống trùng. ' +
        'Với mỗi đề xuất nêu ngắn: mục đích, TRIGGER (bảng + cột + điều kiện), HÀNH ĐỘNG, NGƯỜI NHẬN, mức ưu tiên (tên bảng/cột để trong «…»). ' +
        'Rồi TẠO NGAY các đề xuất ưu tiên cao/vừa. ' +
        WF_CREATE_RULES,
    },
    {
      k: 'wfRead',
      label: '🔧 Đọc workflow',
      prompt:
        `Đọc và giải thích ĐẦY ĐỦ, CHI TIẾT các automation/quy trình đang có của ${B}. ` +
        `Gọi lark_web_read_automations với app_token=${T} (phiên Lark web — không cần App ID). ` +
        WF_FORMAT +
        ' Đây là việc CHỈ ĐỌC — không tạo/sửa gì. Base chưa có automation nào thì nói rõ và gợi ý bấm "🧩 Nên thêm workflow nào". ' +
        'Phiên Lark web hết hạn thì nhắc tôi bấm "Đăng nhập lại" ở khung Lark bên phải.',
    },
    {
      k: 'wfAudit',
      label: '🔎 Soát lỗi workflow',
      prompt:
        `Soát lỗi/rà soát toàn bộ automation/quy trình của ${B}. ` +
        `Gọi lark_web_read_automations với app_token=${T} để đọc tất cả, và lark_web_scan_base để đối chiếu bảng/cột/lựa chọn hiện có. ` +
        AUDIT_CHECKLIST,
    },
    {
      k: 'wfRemind',
      label: '🔔 Nhắc hạn / quá hạn',
      prompt:
        `Quét ${B} bằng lark_web_scan_base, tìm các cột Ngày mang nghĩa hạn (hạn chót, deadline, ngày hết hạn, ngày giao…) cùng cột Trạng thái và cột Người của bảng đó. ` +
        'Thiết kế automation nhắc: (1) trước hạn 1 ngày, (2) khi đã quá hạn mà Trạng thái chưa hoàn thành — gửi tin nhắn Lark cho người trong cột Người phụ trách, nội dung có tên bản ghi + ngày hạn (ref cột) + nút "Xem bản ghi". ' +
        'Không có cột Ngày phù hợp thì nói rõ, thêm cột «Hạn chót» (Ngày) bằng lark_web_add_fields rồi làm tiếp. Ghi rõ giả định (giờ nhắc mặc định 9:00). ' +
        WF_CREATE_RULES,
    },
    {
      k: 'wfStatus',
      label: '🔁 Báo khi đổi trạng thái',
      prompt:
        `Quét ${B} bằng lark_web_scan_base, tìm các cột chọn mang nghĩa trạng thái/giai đoạn (Trạng thái, Tình trạng, Giai đoạn…) và cột Người của cùng bảng. ` +
        'Với mỗi bảng chính, tạo automation SetRecordTrigger khi cột trạng thái đổi sang các giá trị quan trọng (dùng ĐÚNG tên lựa chọn quét được, vd hoàn thành/bị huỷ/cần duyệt) → LarkMessageAction gửi cho người trong cột Người phụ trách (ref cột Người), ' +
        'nội dung: tên bản ghi + trạng thái mới (ref cột) + nút "Xem bản ghi". Trùng với automation đang có thì bỏ qua và nói rõ. ' +
        WF_CREATE_RULES,
    },
    {
      k: 'wfReport',
      label: '📊 Báo cáo định kỳ',
      prompt:
        `Quét ${B} bằng lark_web_scan_base, chọn bảng chính có cột Trạng thái/Ngày. ` +
        'Thiết kế automation báo cáo định kỳ: TimerTrigger (mặc định 8:30 sáng thứ Hai hằng tuần nếu tôi chưa nói) → tìm các bản ghi cần chú ý (chưa hoàn thành, sắp/quá hạn) → gửi tin nhắn Lark cho tôi tóm tắt số lượng + danh sách. Ghi rõ giả định. ' +
        WF_CREATE_RULES,
    },
    {
      k: 'wfOwner',
      label: '👥 Gửi đúng người phụ trách',
      prompt:
        `Với ${B}: gọi lark_web_read_automations với app_token=${T} và lark_web_scan_base để đối chiếu cột. ` +
        'Tìm các automation đang gửi tin cho người CỐ ĐỊNH ("tôi"/một người cụ thể) trong khi bảng của trigger có cột Người (vd «Người phụ trách», «Sales phụ trách»). Liệt kê thành bảng: WF<số> · tên · người nhận hiện tại · cột Người nên dùng. ' +
        'KHÔNG sửa hay xoá automation gốc. Với mỗi cái cần đổi, tạo một BẢN SỬA mới (tên gốc + " (gửi người phụ trách)") giữ nguyên trigger/nội dung, người nhận = {"value_type":"ref","value":"$.<id trigger>.<field_id cột Người>"}. ' +
        WF_CREATE_RULES +
        ' Nhắc tôi so sánh rồi tự tắt/xoá bản cũ trong Lark.',
    },
    {
      k: 'wfStruct',
      label: '🧱 Dựng bảng/cột còn thiếu',
      prompt:
        `Quét ${B} bằng lark_web_scan_base. Xác định bảng/cột/lựa chọn còn thiếu để chạy được các automation phổ biến (Người phụ trách kiểu Người, Trạng thái kiểu chọn một có đủ lựa chọn, Hạn chót kiểu Ngày, Ngày hoàn thành…). ` +
        'Liệt kê ngắn những gì sẽ thêm rồi tạo NGAY: bảng mới bằng lark_web_add_table, cột/lựa chọn bằng lark_web_add_fields (KHÔNG bấm giao diện). Chỉ CỘNG THÊM — không đổi tên, không đổi kiểu, không xoá cột/bảng/bản ghi đang có. ' +
        'Bước này KHÔNG tạo automation. Báo lại field_id của từng cột mới.',
    },
  ];
}

/** Ô gợi ý ở trạng thái trống của Tạo workflow — 4 nút đầu, theo Base đang chọn. */
export function workflowEmptyExamples(base: QuickBase | null | undefined): QuickAsk[] {
  if (!base?.appToken) return [];
  const all = workflowQuickAsks(base);
  const pick = ['wfSuggest', 'wfStatus', 'wfRemind', 'wfRead'];
  return pick.map((k) => all.find((c) => c.k === k)!).filter(Boolean);
}

/** Nút DỮ LIỆU khi hội thoại đã có Base (hỏi đáp, đánh giá, phân quyền, dựng cấu trúc…). */
export function dataQuickAsks(bases: QuickBase[], appConnected: boolean, dev = false): QuickAsk[] {
  if (!bases.length) return [];
  const b0 = bases[0];
  const more = bases.length > 1 ? ' (rồi lần lượt các base còn lại)' : '';
  const out: QuickAsk[] = [
    {
      k: 'tablesCols',
      label: '🔍 Bảng & cột',
      prompt:
        'Liệt kê ĐẦY ĐỦ TẤT CẢ bảng trong base đang chọn (kể cả bảng chưa có bản ghi nào), kèm các cột (tên + kiểu) của từng bảng. Làm cho HẾT trong một lượt, KHÔNG hỏi lại "xem tiếp không" dù nhiều bảng.' +
        (appConnected ? '' : ` Dùng lark_web_scan_base với app_token=${b0.appToken}${more} (phiên Lark web — chưa kết nối custom app).`),
    },
    {
      k: 'summaryBase',
      label: '📋 Tóm tắt base',
      prompt:
        (appConnected ? 'Dùng bitable_base_overview' : `Dùng lark_web_scan_base (app_token=${b0.appToken}, sample_records=3)`) +
        ' để tóm tắt base đang chọn: liệt kê ĐẦY ĐỦ các bảng (kể cả bảng rỗng), mỗi bảng nêu số bản ghi (record_count), các cột chính, và vài bản ghi mẫu để minh hoạ ý nghĩa. Làm gọn, không hỏi lại.',
    },
    { k: 'evalBase', label: '📊 Đánh giá base', prompt: 'Đánh giá thiết kế của base đang chọn: điểm mạnh, điểm yếu, các cột/bảng còn thiếu, gợi ý cải thiện cụ thể.' },
  ];
  if (appConnected)
    out.push({
      k: 'permissions',
      label: '🔐 Phân quyền',
      prompt: 'Xem cấu hình phân quyền của base đang chọn: gọi bitable_list_roles để liệt kê các vai trò + quyền theo từng bảng/bản ghi/cột, và (nếu cần) bitable_list_role_members để xem thành viên mỗi vai trò. Trình bày gọn thành bảng dễ đọc.',
    });
  if (dev && appConnected)
    out.push({
      k: 'debugEndpoint',
      label: '🐞 Endpoint (gỡ lỗi)',
      prompt:
        `Gọi bitable_read_workflows với app_token=${b0.appToken} và debug=true. ` +
        'IN NGUYÊN VĂN toàn bộ kết quả JSON (đặc biệt captured_endpoints và captured_workflow_ids), ' +
        'KHÔNG tóm tắt, KHÔNG bỏ bớt dòng nào — tôi cần copy danh sách endpoint này.',
    });
  out.push({
    k: 'design',
    label: '🎨 Thiết kế / bổ sung',
    prompt:
      'Dựa trên dữ liệu hiện có, đề xuất schema hoàn chỉnh cho base đang chọn rồi tạo các bảng/cột còn thiếu' +
      (appConnected ? '.' : ' bằng lark_web_add_table / lark_web_add_fields (chỉ cộng thêm, không đổi/xoá cái đang có).'),
  });
  if (appConnected)
    out.push(
      { k: 'kanban', label: '📌 Tạo Kanban pipeline', prompt: 'Tạo một view Kanban theo cột trạng thái/giai đoạn cho bảng chính của base đang chọn để làm pipeline.' },
      { k: 'sampleData', label: '🌱 Nhập dữ liệu mẫu', prompt: 'Tạo và nhập một vài bản ghi mẫu hợp lý vào các bảng của base đang chọn để minh hoạ.' },
    );
  out.push(...fileQuickAsks(b0));
  return out;
}

/** Khoá các nút "Tệp & dữ liệu" (bộ kỹ năng dựng sẵn). */
export const FILE_ASK_KEYS = ['fileExport', 'fileImport', 'fileAttach', 'fileReadAttach', 'autoFromFiles'] as const;

/**
 * Nút "Tệp & dữ liệu" — mỗi nút gọi đúng một kỹ năng dựng sẵn (Larkwave · Tệp & dữ liệu). Chạy được chỉ
 * với phiên Lark web (công cụ lark_web_*).
 */
export function fileQuickAsks(b: QuickBase): QuickAsk[] {
  const B = baseRef(b);
  return [
    {
      k: 'fileExport',
      label: '📤 Xuất bảng ra Excel',
      prompt:
        `Xuất TOÀN BỘ một bảng của ${B} ra Excel theo kỹ năng «Xuất bảng ra Excel/CSV đầy đủ» (lark_export_table_file — đọc đủ mọi trang, báo "N dòng nguồn → N dòng trong tệp"). ` +
        'Base có nhiều bảng thì hỏi tôi bảng nào (ask_user với tên các bảng).',
    },
    {
      k: 'fileImport',
      label: '📥 Nhập Excel/CSV vào bảng',
      prompt:
        `Tôi muốn nhập một tệp Excel/CSV vào một bảng của ${B}. Làm theo kỹ năng «Nhập Excel/CSV vào bảng»: đọc tệp tôi gửi (chưa có thì nhắc tôi kéo tệp vào hội thoại), đọc cấu trúc bảng, ` +
        'đề xuất ghép cột theo tên và hỏi tôi xác nhận, chọn cột khoá để ghi theo khoá (match_by) không tạo dòng trùng, chỉ tạo lựa chọn mới khi tôi đồng ý, rồi báo "N dòng vào → mới · sửa · không đổi".',
    },
    {
      k: 'fileAttach',
      label: '📎 Đính tệp vào ô',
      prompt:
        `Đính tệp vào ô Tệp đính kèm của một bản ghi trong ${B} theo kỹ năng «Đính tệp vào ô Bitable» (prepare_local_file → lark_web_attach_file, GHI THÊM không xoá tệp cũ, đọc lại xác minh). ` +
        'Chưa rõ tệp nào / bản ghi nào / cột nào thì hỏi tôi.',
    },
    {
      k: 'fileReadAttach',
      label: '🔎 Đọc tệp đính kèm',
      prompt:
        `Đọc các tệp đính kèm trong ${B} rồi tổng hợp theo kỹ năng «Đọc tệp đính kèm trong Base và tổng hợp» (lark_web_download_attachments). ` +
        'Base có nhiều cột đính kèm thì hỏi tôi bảng/cột nào; nêu rõ đã đọc bao nhiêu tệp / tổng số tệp.',
    },
    {
      k: 'autoFromFiles',
      label: '⏰ Tự động đọc tệp → ghi Base',
      prompt:
        `Giúp tôi dựng một quy tắc TỰ ĐỘNG đọc tệp rồi ghi vào bảng của ${B} theo kỹ năng «Tự động hoá: đọc tệp → ghi Base»: hỏi tôi nguồn tệp, bảng đích + cột khoá, lịch chạy và quyền khi chạy tự động; ` +
        'chạy thử một lần với tệp hiện có rồi mới tạo lịch (schedule_agent_job kèm tệp nguồn, only_new_files, permissions). KHÔNG cấp quyền tôi chưa đồng ý.',
    },
  ];
}

/** (Tên cũ) bộ nút của hội thoại thường = bộ hợp nhất ở bố cục chat. */
export function chatQuickAsks(bases: QuickBase[], appConnected: boolean, dev = false): QuickAsk[] {
  return buildQuickAsks({ layout: 'chat', bases, appConnected, dev });
}

/**
 * MỘT bộ nút cho mọi hội thoại. Chưa có Base: bố cục chat → câu ví dụ; bố cục frame → không có nút
 * (ô gợi ý nhắc chọn Base). Có Base: nút dữ liệu + nút workflow (Base đầu), khử trùng — 'frame' đặt
 * nút workflow lên trước, 'chat' đặt nút dữ liệu lên trước. "Dựng bảng/cột còn thiếu" (wfStruct) trùng
 * vai với "Thiết kế / bổ sung" → bố cục chat giữ "Thiết kế", bố cục frame giữ wfStruct.
 */
export function buildQuickAsks(ctx: QuickAskCtx): QuickAsk[] {
  const layout: QuickAskLayout = ctx.layout ?? (ctx.mode === 'workflow' ? 'frame' : 'chat');
  const bases = (ctx.bases || []).filter((b) => b?.appToken);
  if (!bases.length) return layout === 'frame' ? [] : CHAT_EXAMPLES;
  const wf = workflowQuickAsks(bases[0]);
  const data = dataQuickAsks(bases, ctx.appConnected, !!ctx.dev);
  // Bố cục frame (Tạo workflow) giữ đúng bộ nút workflow + dữ liệu — nút tệp ở bố cục chat.
  if (layout === 'frame') return [...wf, ...data.filter((c) => c.k !== 'design' && !(FILE_ASK_KEYS as readonly (string | undefined)[]).includes(c.k))];
  const order = ['tablesCols', 'summaryBase', 'evalBase', 'wfSuggest', 'wfRead', 'wfAudit', 'wfRemind', 'wfStatus', 'wfReport', 'wfOwner', 'permissions', 'design', 'kanban', 'sampleData', ...FILE_ASK_KEYS, 'debugEndpoint'];
  const all = [...data, ...wf.filter((c) => c.k !== 'wfStruct')];
  return order.map((k) => all.find((c) => c.k === k)).filter((c): c is QuickAsk => !!c);
}

/** Ô gợi ý của hội thoại trống, theo bố cục. */
export function emptyExamples(ctx: QuickAskCtx): QuickAsk[] {
  const layout: QuickAskLayout = ctx.layout ?? (ctx.mode === 'workflow' ? 'frame' : 'chat');
  if (layout === 'frame') return workflowEmptyExamples(ctx.bases?.[0]);
  const all = buildQuickAsks(ctx);
  if (!ctx.bases?.length) return all;
  const pick = ['tablesCols', 'summaryBase', 'wfSuggest', 'wfRead'];
  return pick.map((k) => all.find((c) => c.k === k)).filter((c): c is QuickAsk => !!c);
}

/** Khoá localStorage của "Hỏi nhanh của tôi" — mỗi chế độ một danh sách. */
/** Khoá DUY NHẤT của "Hỏi nhanh của tôi" sau khi hợp nhất (danh sách workflow cũ được gộp vào, xem migrateCustomAsks). */
export const CUSTOM_ASKS_KEY = 'tw_lark_quickasks';
export const CUSTOM_ASKS_KEYS: Record<QuickAskMode, string> = {
  chat: 'tw_lark_quickasks',
  workflow: 'tw_lark_quickasks_wf',
};

/** Đọc danh sách tự thêm đã lưu: bỏ mục hỏng/rỗng, khử trùng theo nhãn. */
export function parseCustomAsks(raw: string | null | undefined): QuickAsk[] {
  try {
    const v = JSON.parse(raw || '[]');
    if (!Array.isArray(v)) return [];
    const seen = new Set<string>();
    const out: QuickAsk[] = [];
    for (const x of v) {
      const label = typeof x?.label === 'string' ? x.label.trim() : '';
      const prompt = typeof x?.prompt === 'string' ? x.prompt.trim() : '';
      if (label && prompt && !seen.has(label)) {
        seen.add(label);
        out.push({ label, prompt });
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Nút dựng sẵn + nút tự thêm (nút tự thêm không bao giờ che nhãn dựng sẵn → khoá React duy nhất). */
export function mergeChips(builtIn: QuickAsk[], custom: QuickAsk[]): { chips: QuickAsk[]; isCustom: (label: string) => boolean } {
  const labels = new Set(builtIn.map((b) => b.label));
  const chips = [...builtIn, ...custom.filter((a) => !labels.has(a.label))];
  return { chips, isCustom: (label) => !labels.has(label) && custom.some((a) => a.label === label) };
}
