/**
 * "⚡ Hỏi nhanh" của Lark × Agents — các nút bấm-một-cái gửi một yêu cầu dài, chính xác cho trợ lý
 * (bong bóng chat chỉ hiện NHÃN ngắn; câu lệnh thật đi thẳng tới AI).
 *
 * Hàm THUẦN (không React) để kiểm được bằng node: bộ nút theo chế độ (hội thoại thường / Tạo
 * workflow), chèn app_token của Base đang áp dụng vào câu lệnh, chọn đường công cụ theo việc có
 * custom app (App ID) hay chỉ có phiên Lark web, và danh sách "Hỏi nhanh của tôi" tách theo chế độ.
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
export interface QuickAskCtx {
  mode: QuickAskMode;
  /** Base đang áp dụng (chế độ Tạo workflow: đúng Base đang chọn ở bộ chọn). */
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

/** Luật an toàn + cách tạo chung cho mọi nút tạo automation ở chế độ Tạo workflow. */
const WF_CREATE_RULES =
  'Tạo bằng lark_web_create_automations (MỘT lần cho cả bộ; chỉ 1 cái thì lark_web_create_automation) — chế độ tự động, không hỏi lại; luôn là bản nháp TẮT. ' +
  'Loại bước chưa tạo thẳng được (kind "unsupported": trigger theo ngày/hẹn giờ, tìm bản ghi, rẽ nhánh, gửi nhóm…) → dựng trong trình soạn Lark ở khung bên phải bằng lark_ui_*, bấm "Lưu" (KHÔNG "Lưu và bật") rồi lark_ui_saved. ' +
  'Thiếu cột cần dùng → thêm bằng lark_web_add_fields trước. Người nhận ưu tiên CỘT NGƯỜI của bản ghi (vd «Người phụ trách») — chỉ dùng "tôi" khi bảng không có cột Người. ' +
  'TUYỆT ĐỐI KHÔNG bật, xoá hay chạy thử automation. Cuối cùng báo bảng: tên · workflow_id · "đang TẮT", và nhắc tôi mở "Tự động hoá" trong khung Lark để xem lại rồi TỰ BẬT.';

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
        'Đề xuất 3–6 automation NÊN THÊM để Base hoàn thiện & tự động hơn, theo các nhóm: nhắc hạn/quá hạn, báo khi đổi trạng thái, giao việc cho người phụ trách, báo cáo định kỳ, kiểm tra ngưỡng/tồn kho, chống trùng. ' +
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

/** Bộ nút của hội thoại thường khi đã gắn Base. */
export function chatQuickAsks(bases: QuickBase[], appConnected: boolean, dev = false): QuickAsk[] {
  if (!bases.length) return CHAT_EXAMPLES;
  const b0 = bases[0];
  const all = bases.map((b) => `${b.name} (app_token=${b.appToken})`).join('; ');
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
  out.push(
    {
      k: 'readWf',
      label: '🔧 Đọc workflow',
      prompt:
        `Đọc và giải thích ĐẦY ĐỦ, CHI TIẾT các workflow/automation (tự động hoá) của base đang áp dụng: ${all}. ` +
        (appConnected
          ? `Gọi bitable_read_workflows với app_token=${b0.appToken}${more}. `
          : `Gọi lark_web_read_automations với app_token=${b0.appToken}${more} (phiên Lark web — không cần App ID). `) +
        WF_FORMAT +
        ' Nếu tool báo chưa kết nối/hết phiên Lark web, nhắc tôi đăng nhập Lark web (mở "Tạo workflow" và đăng nhập trong khung Lark).',
    },
    {
      k: 'auditWf',
      label: '🔎 Soát lỗi workflow',
      prompt:
        `Soát lỗi/rà soát toàn bộ workflow của base ${b0.name} (app_token=${b0.appToken}). ` +
        (appConnected
          ? 'Gọi bitable_read_workflows để đọc tất cả (và bitable_list_fields nếu cần đối chiếu cột). '
          : 'Gọi lark_web_read_automations để đọc tất cả (và lark_web_scan_base nếu cần đối chiếu cột). ') +
        AUDIT_CHECKLIST,
    },
    {
      k: 'suggestWf',
      label: '🧩 Nên thêm workflow nào',
      prompt:
        `Dựa trên các bảng/cột hiện có của base ${b0.name} (app_token=${b0.appToken}) và các workflow đang có ` +
        '(quét bằng lark_web_scan_base — đã kèm danh sách workflow đang có), đề xuất những automation/workflow NÊN THÊM để base hoàn thiện & tự động hơn. ' +
        'Gợi ý theo các nhóm: nhắc hạn/quá hạn, tự điền & tính toán, thông báo khi đổi trạng thái, kiểm tra tồn kho/ngưỡng, chống trùng, tổng hợp/rollup, đồng bộ giữa bảng. ' +
        'Với mỗi đề xuất nêu: mục đích, TRIGGER (bảng + điều kiện), HÀNH ĐỘNG, và mức ưu tiên (tên bảng/cột để trong «…»). ' +
        'Sau khi tôi chọn (ở chế độ Thực thi), bạn TẠO bằng lark_web_create_automations (phiên Lark web, một lần cho cả bộ)' +
        (appConnected ? ' — loại bước nó chưa hỗ trợ thì dùng bitable_workflow_create (Open API v3)' : '') +
        '. Luôn tạo ở trạng thái TẮT; bạn KHÔNG bật — tôi tự xem lại rồi bật trong Lark.',
    },
  );
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
      'Dựa trên dữ liệu hiện có, đề xuất schema hoàn chỉnh cho base đang chọn rồi (sau khi tôi duyệt) tạo các bảng/cột còn thiếu' +
      (appConnected ? '.' : ' bằng lark_web_add_table / lark_web_add_fields (chỉ cộng thêm, không đổi/xoá cái đang có).'),
  });
  if (appConnected)
    out.push(
      { k: 'kanban', label: '📌 Tạo Kanban pipeline', prompt: 'Tạo một view Kanban theo cột trạng thái/giai đoạn cho bảng chính của base đang chọn để làm pipeline.' },
      { k: 'sampleData', label: '🌱 Nhập dữ liệu mẫu', prompt: 'Tạo và nhập một vài bản ghi mẫu hợp lý vào các bảng của base đang chọn để minh hoạ.' },
    );
  return out;
}

/** Bộ nút dựng sẵn theo chế độ. */
export function buildQuickAsks(ctx: QuickAskCtx): QuickAsk[] {
  if (ctx.mode === 'workflow') return ctx.bases[0]?.appToken ? workflowQuickAsks(ctx.bases[0]) : [];
  return chatQuickAsks(ctx.bases, ctx.appConnected, !!ctx.dev);
}

/** Khoá localStorage của "Hỏi nhanh của tôi" — mỗi chế độ một danh sách. */
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
