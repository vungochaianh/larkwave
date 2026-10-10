/**
 * BỘ KỸ NĂNG DỰNG SẴN "Larkwave · Tệp & dữ liệu" — cài/cập nhật mặc định (SkillHost.ensureBuiltins).
 *
 * Mỗi kỹ năng: cụm từ gọi (VI/EN), ĐÚNG chuỗi công cụ, luật xác minh + báo cáo, xử lý lỗi. Dùng được ở
 * chat (nạp đủ thân khi câu lệnh khớp từ khoá — xem collectSkillsPrompt), lệnh "/" và lượt tự động hoá.
 * Hợp đồng (needs/produces/checks) theo định dạng skillContract — khoá riêng từng kỹ năng, không nối
 * thành bộ với nhau hay với kỹ năng của người dùng.
 *
 * Tăng `version` khi đổi nội dung: máy có bản CHƯA bị người dùng sửa sẽ tự lên bản mới (có bản lưu để
 * lùi); bản đã sửa thì giữ nguyên và chỉ báo "có bản mới".
 */
import type { SkillContractFields } from '@larkwave/core';

export interface BuiltinSkill {
  id: string;
  name: string;
  version: number;
  command: string;
  /** "Dùng khi …" — CLI đọc mô tả này để tự chọn kỹ năng. */
  description: string;
  triggers: string[];
  contract?: SkillContractFields;
  body: string;
}

/** Tiền tố id của kỹ năng dựng sẵn — thư mục CLI là `larkwave-lw-…`, không đụng id của người dùng/Toolswave. */
export const BUILTIN_PREFIX = 'lw-';
export const BUILTIN_TAGS = ['Larkwave', 'Tệp & dữ liệu'];

const FACTS_NOTE =
  'Khi chạy trong một BỘ kỹ năng (lượt kỹ năng có hợp đồng), kết thúc bằng khối ```facts ghi các khoá ở `produces`; trò chuyện thường thì không cần khối này.';

export const BUILTIN_SKILLS: BuiltinSkill[] = [
  {
    id: 'lw-dinh-tep-bitable',
    name: 'Đính tệp vào ô Bitable',
    version: 1,
    command: 'dinh-tep',
    description: 'Dùng khi cần ĐÍNH một tệp (tệp vừa dựng, tệp người dùng gửi, tệp trong hội thoại cũ/Toolswave) vào ô Tệp đính kèm của một bản ghi — ghi thêm, đọc lại.',
    triggers: ['đính tệp', 'đính kèm tệp', 'đính file', 'gắn tệp vào', 'gắn file vào', 'đưa tệp vào ô', 'ô tệp đính kèm', 'attach file', 'attach to record', 'đính vào bản ghi'],
    contract: { needs: [], produces: ['dinh_tep_truoc', 'dinh_tep_sau'], checks: ['dinh_tep_sau > dinh_tep_truoc'] },
    body: `## Khi nào dùng
Người dùng muốn tệp nằm trong ô **Tệp đính kèm** của một dòng Bitable ("đính tệp X vào ô Tệp đính kèm của bản ghi Y", "gắn báo cáo vào dòng đơn hàng DH-001").

## Các bước (đúng thứ tự)
1. **Chuẩn bị tệp**: \`prepare_local_file\` với ĐÚNG đường dẫn người dùng/hội thoại đưa (kể cả đường dẫn cũ \`…/@toolswave/desktop/lark/work/…\`). Dùng \`path\` MỚI tool trả về cho các bước sau. Tệp vừa dựng bằng \`create_file\`/\`fill_xlsx\`/\`lark_export_table_file\` thì dùng thẳng \`path\` của kết quả đó.
2. **Xác định đích**: Base (token), bảng, bản ghi, cột đính kèm. Có sẵn trong hội thoại thì dùng luôn. Chỉ biết KHOÁ (mã đơn, tên…) → \`lark_web_read_records\` (lọc theo cột khoá) để lấy \`record_id\`. Chưa rõ cột nào là cột đính kèm → \`lark_web_scan_base\` (cột kiểu Attachment).
3. **Đính**: \`lark_web_attach_file\` {app_token, table, record_id, field, path}. MẶC ĐỊNH GHI THÊM (giữ tệp cũ). Chỉ truyền \`replace:true\` khi người dùng nói rõ "thay"/"xoá tệp cũ".
4. **Không đính trùng**: trước khi đính lại cùng một tệp (vd lượt tự động chạy lần 2), đọc bản ghi — ô đã có tệp CÙNG TÊN thì không đính nữa, báo "đã có".

## Xác minh & báo cáo
- Chỉ nói "đã đính" khi kết quả có \`verified:true\`; nêu: tên tệp, ô «cột», bản ghi, số tệp trong ô trước → sau (\`kept_existing\` → \`files_in_cell\`), và LINK bảng (\`url\`).
- \`verified:false\` → nói rõ chưa xác minh được, KHÔNG nói đã xong.

## Khi lỗi
- "Chỉ đưa được lên Lark tệp trong thư mục…" → tệp nằm ngoài thư mục hội thoại/đính kèm/tự động hoá: nhờ người dùng kéo tệp vào hội thoại (hoặc vào "Tệp nguồn" của quy tắc).
- "Chưa đăng nhập Lark web" → nhắc bấm "Đăng nhập lại" ở khung Lark; có custom app thì dùng \`send_file\` {to:"bitable", app_token, table_id, record_id, field_name, path} (cũng ghi thêm).
- Cột không phải cột Tệp đính kèm → liệt kê các cột đính kèm của bảng, hỏi lại.
- Lượt tự động: \`replace:true\` chỉ chạy khi quy tắc được cấp quyền "Đính thay tệp" — bị từ chối thì ghi vào báo cáo, không thử lại.

${FACTS_NOTE}`,
  },
  {
    id: 'lw-xuat-bang',
    name: 'Xuất bảng ra Excel/CSV đầy đủ',
    version: 1,
    command: 'xuat-bang',
    description: 'Dùng khi cần XUẤT một bảng Bitable ra tệp Excel/CSV đủ MỌI dòng (đọc hết các trang, đối chiếu số dòng, thẻ tệp có xem trước).',
    triggers: ['xuất bảng', 'xuất excel', 'xuất ra excel', 'xuất csv', 'xuất file', 'tải bảng về', 'export excel', 'export csv', 'export table', 'xuất dữ liệu', 'ra file excel'],
    contract: { needs: [], produces: ['xuat_so_dong_nguon', 'xuat_so_dong_tep'], checks: ['xuat_so_dong_tep == xuat_so_dong_nguon'] },
    body: `## Khi nào dùng
"Xuất bảng X ra Excel", "tải toàn bộ dữ liệu bảng đơn hàng về", "export the table to CSV".

## Các bước
1. Xác định Base + bảng (+ view nếu người dùng nói "theo view …", + danh sách cột nếu chỉ cần một số cột). Chưa rõ → \`lark_web_list_bases\` / \`lark_web_scan_base\`.
2. \`lark_export_table_file\` {app_token, table, view_id?, fields?, format: "xlsx" | "csv", name?}. Tool tự đọc HẾT mọi trang (phiên web; Open API khi chỉ có custom app), giữ kiểu (số là số, mã có số 0 đầu giữ là chữ, ngày theo múi giờ Base, lựa chọn/người ra tên).
3. KHÔNG tự đọc từng trang rồi dựng bảng bằng tay; KHÔNG dán bảng vào hội thoại thay cho tệp.
4. Cần trang trí thêm (dòng tổng, sheet tổng hợp, công thức) → đọc thêm kỹ năng người dùng đã dạy (nếu có), rồi dựng bằng \`create_file\` với \`sheets\` / ô công thức ("=SUM(B2:B100)") TỪ đúng dữ liệu đã xuất — số dòng chi tiết phải vẫn khớp.

## Xác minh & báo cáo
- Kết quả có \`source_rows\` và \`file_rows\`: PHẢI bằng nhau. Nói rõ "**N dòng nguồn → N dòng trong tệp «tên»** (M cột)". Thẻ tệp tự hiện (Mở / Lưu về / Đưa lên Lark).
- Không cần đẩy tệp lên Lark trừ khi người dùng muốn (xem kỹ năng "Đưa tệp lên Drive / Sheets / Docs").

## Khi lỗi
- "Lệch số dòng" / "Đọc thiếu dữ liệu" → KHÔNG tạo tệp thiếu; báo con số, thử lại một lần; vẫn lệch thì báo người dùng (có thể bảng đang bị sửa).
- Bảng rất lớn (> 50 000 dòng) → đề nghị CSV hoặc lọc theo view.
- Phiên web hết hạn → nhắc đăng nhập lại khung Lark.

${FACTS_NOTE}`,
  },
  {
    id: 'lw-nhap-bang',
    name: 'Nhập Excel/CSV vào bảng',
    version: 1,
    command: 'nhap-bang',
    description: 'Dùng khi cần NHẬP dữ liệu từ tệp Excel/CSV vào một bảng Bitable: ghép cột theo tên (xác nhận trong chat), đúng kiểu cột, ghi theo khoá để không trùng, báo N dòng vào → N dòng ghi.',
    triggers: ['nhập excel', 'nhập csv', 'nhập file vào bảng', 'nhập dữ liệu vào bảng', 'import excel', 'import csv', 'đổ dữ liệu', 'đưa dữ liệu từ file vào', 'ghi file vào bảng', 'cập nhật bảng từ file', 'upload excel vào base'],
    contract: { needs: [], produces: ['nhap_dong_vao', 'nhap_dong_ghi', 'nhap_dong_bo_qua'], checks: ['nhap_dong_ghi <= nhap_dong_vao', 'nhap_dong_ghi cộng nhap_dong_bo_qua phải bằng nhap_dong_vao'] },
    body: `## Khi nào dùng
"Nhập file Excel này vào bảng Khách hàng", "cập nhật bảng đơn từ file CSV", "import this spreadsheet into the Base".

## Các bước
1. **Đọc tệp**: \`prepare_local_file\` (đường dẫn người dùng đưa / tệp đính kèm / tệp nguồn của quy tắc) → hàng tiêu đề + các dòng (đọc \`text\`; dài thì Read \`text_path\`). Nhiều sheet → hỏi sheet nào (trừ khi chỉ một sheet có dữ liệu).
2. **Đọc bảng đích**: \`lark_web_scan_base\` → cột + KIỂU + lựa chọn của bảng.
3. **Ghép cột theo TÊN** (bỏ dấu, không phân biệt hoa thường; gần đúng thì đề xuất). Trình bày bảng ghép "Cột trong tệp → Cột trong bảng (kiểu)" + cột bỏ qua, rồi **xác nhận bằng \`ask_user\`** trước khi ghi. Lượt tự động (không ai trả lời): chỉ ghép cột TRÙNG TÊN chắc chắn, phần còn lại bỏ qua và ghi vào báo cáo.
4. **Chọn cột khoá** (mã đơn / mã KH / email / số HĐ — cột định danh duy nhất) để ghi theo khoá. Không có cột nào như vậy → nói rõ: nhập lại sẽ tạo dòng trùng.
5. **Chuẩn hoá giá trị theo kiểu cột**: Số/Tiền = số (bỏ dấu chấm nghìn "1.200.000" → 1200000); Ngày = "YYYY-MM-DD" (đọc đúng "DD/MM/YYYY"); Chọn một/nhiều = TÊN lựa chọn có sẵn; Hộp kiểm = true/false; Người = tên/email; mã có số 0 đầu GIỮ là chữ. Lựa chọn chưa có → hỏi; CHỈ khi người dùng bảo mới truyền \`create_missing_options:true\`.
6. **Ghi**: \`lark_web_write_records\` {app_token, table, records:[{fields}], match_by:[cột khoá]} theo lô ≤ 500. Dòng có khoá đã có + giống hệt → bỏ qua; khác → sửa đúng ô khác (ghi đè → ứng dụng hỏi người dùng / quy tắc tự động cần quyền "ghi đè ô"); chưa có → thêm.

## Xác minh & báo cáo
- Cộng các lô: \`created\` + \`updated\` + \`unchanged\` + \`rejected\` = số dòng vào. Báo: "**N dòng vào → X mới · Y sửa · Z không đổi · W không ghi được**" + lý do từng dòng bị từ chối + LINK bảng. Chỉ nói đã ghi khi \`verified:true\`.

## Khi lỗi
- \`kind:"invalid"\` (sai kiểu/lựa chọn/cột) → CHƯA ghi gì: sửa đúng các dòng lỗi rồi gọi lại.
- Nhiều bản ghi cùng khoá → không ghi dòng đó, liệt kê để người dùng dọn bảng.
- Chỉ có custom app → \`bitable_batch_create_records\` kèm \`match_by\` (cần table_id tbl…).

${FACTS_NOTE}`,
  },
  {
    id: 'lw-tep-len-lark',
    name: 'Đưa tệp lên Drive / Lark Sheets / Lark Docs',
    version: 1,
    command: 'tep-len-lark',
    description: 'Dùng khi cần đưa một tệp lên Lark: lưu vào Drive, nhập Excel/CSV thành Lark Sheets, nhập Word/Markdown thành Lark Docs — đọc lại và gửi link.',
    triggers: ['lên drive', 'lưu lên drive', 'tải lên drive', 'đưa lên lark', 'thành lark sheets', 'thành sheet', 'tạo sheet từ file', 'thành lark docs', 'thành tài liệu', 'upload to drive', 'import as sheet', 'import as doc'],
    contract: { needs: [], produces: ['len_lark_link'], checks: ['len_lark_link phải là link Lark đã đọc lại khớp tệp gốc'] },
    body: `## Khi nào dùng
"Lưu báo cáo này lên Drive", "biến file Excel thành Lark Sheets", "đưa file Word thành Lark Docs".

## Các bước
1. \`prepare_local_file\` với đường dẫn tệp (hoặc dùng \`path\` của tệp vừa dựng).
2. Chọn đích theo yêu cầu:
   - Drive → \`lark_web_drive_upload\` {path, folder?}
   - Lark Sheets MỚI (.xlsx/.xls/.csv) → \`lark_web_import_as_sheet\` {path, folder?}
   - Lark Docs MỚI (.docx/.md/.txt) → \`lark_web_import_as_doc\` {path, folder?}
   - Ghi vào Lark Sheets ĐÃ CÓ → \`lark_web_sheet_write_range\` (ghi đè vùng → ứng dụng hỏi người dùng).
   \`folder\` = link/token thư mục người dùng nêu; bỏ trống = thư mục «Larkwave» trong "Không gian của tôi".
3. Chỉ làm khi người dùng muốn đưa lên Lark — mặc định tệp đã có thẻ tải về trong hội thoại.

## Xác minh & báo cáo
- Drive: \`ok:true\` + "thấy trong thư mục". Sheets: tên sheet + số dòng khớp tệp gốc. Docs: tiêu đề + đoạn đầu khớp.
- Báo: đã đưa gì → đâu + LINK (\`url\`). Lệch/chưa đọc lại được → nói rõ, không nói đã xong.

## Khi lỗi
- Đuôi tệp không hợp (vd .pdf → Sheets) → đề nghị Drive.
- Phiên web hết hạn → nhắc đăng nhập lại; có custom app thì Drive dùng được đường Open API.

${FACTS_NOTE}`,
  },
  {
    id: 'lw-doc-dinh-kem',
    name: 'Đọc tệp đính kèm trong Base và tổng hợp',
    version: 1,
    command: 'doc-dinh-kem',
    description: 'Dùng khi cần ĐỌC NỘI DUNG các tệp đính kèm (Excel/PDF/Word/ảnh/CSV) trong một cột của Base rồi tóm tắt, trích số liệu, so sánh hoặc tổng hợp.',
    triggers: ['đọc tệp đính kèm', 'đọc file đính kèm', 'đọc nội dung file', 'tổng hợp tệp đính kèm', 'tóm tắt file trong base', 'trích số liệu từ file', 'read attachments', 'summarize attachments', 'nội dung tệp trong ô'],
    contract: { needs: [], produces: ['dinh_kem_so_tep_doc'], checks: ['dinh_kem_so_tep_doc >= 1'] },
    body: `## Khi nào dùng
"Đọc các hoá đơn đính kèm trong bảng Chi phí rồi tổng tiền", "tóm tắt hợp đồng trong ô Tệp của dòng này".

## Các bước
1. Xác định Base + bảng + cột đính kèm (+ bản ghi/lọc nếu người dùng nói).
2. Tải và đọc:
   - Phiên web → \`lark_web_download_attachments\` {app_token, table, field, record_id?, max_files} — tải về thư mục hội thoại, trả đường dẫn + chữ đã trích (Excel/Word/CSV). Ảnh/PDF: dùng Read với \`path\` trả về.
   - Chỉ có custom app → đọc bản ghi (\`bitable_search_records\`) rồi \`lark_read_attachment\` {file_token, url, table_id, record_id, field_id} cho từng tệp (truyền NGUYÊN VĂN \`url\` của ô).
3. Đọc HẾT các tệp cần thiết (nhiều tệp → đọc lần lượt, ghi chú từng tệp), rồi mới tổng hợp.

## Xác minh & báo cáo
- Nêu rõ đã đọc bao nhiêu tệp / tổng số tệp trong cột, tệp nào không đọc được (vì sao).
- Số liệu trích ra phải ghi nguồn (tên tệp, bản ghi). Không bịa phần không đọc được.
- Kết quả dạng bảng nhiều → đề nghị xuất tệp (\`create_file\`) thay vì dán dài.

## Khi lỗi
- Tệp quá lớn / bị khoá quyền → báo tệp đó, đọc tiếp các tệp khác.
- Base bật quyền nâng cao → luôn truyền \`table_id\` (đường Open API) — đường phiên web tự kèm.

${FACTS_NOTE}`,
  },
  {
    id: 'lw-bao-cao-dinh-ky',
    name: 'Báo cáo định kỳ ra tệp',
    version: 1,
    command: 'bao-cao-dinh-ky',
    description: 'Mẫu cho việc định kỳ/tự động: đọc dữ liệu Base → dựng báo cáo .xlsx (tổng hợp + chi tiết) → đính vào một bản ghi hoặc lưu lên Drive; chỉ gửi tin khi đã được cấp quyền.',
    triggers: ['báo cáo định kỳ', 'báo cáo hằng ngày', 'báo cáo hàng ngày', 'báo cáo hằng tuần', 'báo cáo tuần', 'báo cáo tháng', 'mỗi sáng xuất báo cáo', 'periodic report', 'daily report', 'weekly report'],
    contract: { needs: [], produces: ['bao_cao_so_dong', 'bao_cao_tep'], checks: ['bao_cao_tep phải là tệp dựng trong lần chạy này, có đủ bao_cao_so_dong dòng chi tiết'] },
    body: `## Khi nào dùng
Một lịch tự động hoá ("mỗi sáng 8h xuất báo cáo đơn hàng") hoặc người dùng muốn một báo cáo theo kỳ.

## Các bước
1. **Đọc đủ dữ liệu**: \`lark_export_table_file\` (toàn bộ / theo view) hoặc \`lark_web_read_records\` khi \`complete:true\`. Lọc theo KỲ (hôm qua / tuần trước / tháng này) theo cột ngày — ghi rõ khoảng ngày đã dùng.
2. **Dựng báo cáo**: \`create_file\` format "xlsx", \`sheets\`: [{name:"Tổng hợp", rows: chỉ số chính + công thức}, {name:"Chi tiết", rows: các dòng của kỳ}]. Tên tệp CÓ NGÀY: "Báo cáo <chủ đề> <YYYY-MM-DD>". Lượt tự động: tệp tự nằm trong thư mục kết quả của lần chạy.
3. **Đưa đi** (theo cấu hình việc):
   - Đính vào một bản ghi (vd dòng "Báo cáo tuần") → \`lark_web_attach_file\` (GHI THÊM; kiểm ô chưa có tệp cùng tên).
   - Lưu lên Drive → \`lark_web_drive_upload\` {folder}.
   - Gửi vào nhóm → CHỈ khi quy tắc được cấp quyền "Gửi tin nhắn" (hoặc đã đặt "Gửi báo cáo vào nhóm" ở quy tắc) và có custom app; không thì bỏ qua + ghi rõ trong báo cáo.
4. Không ghi đè/xoá gì trong bảng nguồn.

## Xác minh & báo cáo
- "Kỳ: … · N dòng → tệp «…» (sheet Tổng hợp + Chi tiết)"; đính/tải lên phải \`verified\`/\`ok\` + LINK.
- Liệt kê thao tác bị bỏ qua (thiếu quyền) để người dùng cấp nếu muốn.

## Khi lỗi
- Không có dòng nào trong kỳ → vẫn dựng tệp với dòng "Không có dữ liệu trong kỳ" và báo rõ (đừng im lặng).
- Đọc thiếu dữ liệu → không dựng báo cáo trên dữ liệu thiếu; báo lỗi.

${FACTS_NOTE}`,
  },
  {
    id: 'lw-tu-dong-doc-tep',
    name: 'Tự động hoá: đọc tệp → ghi Base',
    version: 1,
    command: 'tu-dong-doc-tep',
    description: 'Mẫu dựng một quy tắc tự động hoá ĐỌC TỆP (tệp nguồn / Drive / ô đính kèm / Lark Sheets) rồi GHI vào bảng Base theo khoá, kèm thư mục, quyền khi chạy tự động và chống trùng.',
    triggers: ['tự động đọc file', 'tự động đọc tệp', 'tự động nhập file', 'mỗi ngày đọc file', 'tự động ghi vào base', 'đọc file rồi ghi', 'automation đọc file', 'lần sau tự động ghi', 'auto import file', 'automate file import'],
    contract: { needs: [], produces: ['tu_dong_id_quy_tac'], checks: ['tu_dong_id_quy_tac phải là id quy tắc vừa tạo và đã chạy thử'] },
    body: `## Khi nào dùng
"Mỗi sáng đọc file Excel mới rồi ghi vào bảng Đơn hàng", "lần sau cứ có file là tự ghi vào Base", "automate importing this file every day".

## Các bước (trong hội thoại — người dùng đang có mặt)
1. **Làm rõ 5 điều** (hỏi gộp một lần bằng \`ask_user\` nếu thiếu):
   - NGUỒN tệp: tệp đính kèm trong chat (thành "Tệp nguồn" của quy tắc), link Drive, link Lark Sheets, hay cột đính kèm của một bảng.
   - BẢNG đích + CỘT KHOÁ để ghi theo khoá (chống trùng khi chạy lại).
   - LỊCH: giờ/ngày (mặc định 8:00 các ngày làm việc) hoặc mỗi N phút.
   - QUYỀN cần khi chạy tự động: có cần SỬA dòng đã có (ghi đè ô)? thay tệp? gửi tin? (mặc định KHÔNG cấp).
   - "Chỉ xử lý tệp mới" (mặc định BẬT khi nguồn là tệp).
2. **Chạy thử một lần ngay trong chat** với tệp hiện có (kỹ năng "Nhập Excel/CSV vào bảng") để chốt bảng ghép cột — ghi lại bảng ghép vào câu lệnh của lịch.
3. **Tạo lịch**: \`schedule_agent_job\` với:
   - \`prompt\` TỰ CHỨA: Base token + bảng + bảng ghép cột cụ thể + \`match_by\` + cách xử lý dòng lỗi + "kết thúc bằng báo cáo: đã đọc / đã ghi (mới·sửa·không đổi) / đọc lại / bị bỏ qua".
   - \`input_files\`: đường dẫn các tệp người dùng đã gửi (thành Tệp nguồn); \`sources\`: [{kind:"drive"|"sheet"|"attachment", url, field?}].
   - \`only_new_files\`: true; \`keep_outputs\`: 10; \`permissions\`: chỉ những quyền người dùng đồng ý; \`run_on\`: "desktop" (cần phiên Lark web / thư mục trên máy).
   Ứng dụng hiện hộp xác nhận cho người dùng duyệt.
4. Báo: tên lịch, giờ chạy, thư mục tệp nguồn (màn **Tự động hoá** → quy tắc → "Tệp nguồn & thư mục"), quyền đã cấp, và nhắc bấm ▶ "Chạy thử ngay" — lần chạy thứ hai với cùng tệp phải ra "không đổi" (không trùng dòng).

## Luật
- KHÔNG cấp quyền người dùng chưa đồng ý. Lượt tự động chỉ cộng thêm khi thiếu quyền; thao tác bị từ chối được ghi vào biên bản lần chạy.
- KHÔNG bật workflow Lark; KHÔNG gửi tin khi chưa có quyền + custom app.

${FACTS_NOTE}`,
  },
];
