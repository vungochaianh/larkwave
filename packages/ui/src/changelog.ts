/**
 * App changelog — shown via the sidebar "phiên bản" footer → modal. Newest first;
 * the top entry's version is the app's current version. This list is bundled with
 * the RENDERER, so it updates together with a code-push: seeing a newer top version
 * in the app confirms the renderer code-push landed. Add an entry on each release.
 */
export interface ChangelogEntry {
  version: string;
  /** YYYY-MM-DD */
  date: string;
  items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.0.348',
    date: '2026-10-01',
    items: [
      'Tệ hơn: nó mất NGAY ở lần lưu kế tiếp, không cần khởi động lại. Nhắn tin đầu tiên là app lưu theo danh sách Base CŨ, và các Base vừa gắn biến mất ngay tại đó.',
      'Nay gắn Base được coi là thao tác có chủ ý và được ghi lại ngay. Bấm "+" rồi bỏ đó thì vẫn không đẻ ra hội thoại rỗng như cũ.',
    ],
  },
  {
    version: '1.0.347',
    date: '2026-10-01',
    items: [
      'NÉN CHỦ ĐỘNG: trước đây app chỉ nén khi một lượt dừng giữa chừng, nên hội thoại cứ ngồi ở 100% — mỗi lượt vẫn chạy nhưng agent mất dần phần đầu, và cảnh báo nằm đó mãi. Nay xong việc mà ngữ cảnh gần đầy là nén ngay, không đợi tới lúc hỏng.',
      'Nén xong KHÔNG tự chạy thêm lượt nào: bạn chưa yêu cầu gì thì app chỉ dọn chỗ rồi thôi.',
    ],
  },
  {
    version: '1.0.346',
    date: '2026-10-01',
    items: [
      'SỬA: trợ lý kết thúc bằng câu "8/24 bảng đã dựng, tiếp tục 1.3 và 1.4" rồi DỪNG. Đó là một câu trả lời nên bản trước coi là xong. Nay app đọc được kết luận TỰ NHẬN còn dở (phân số tiến độ, "còn N bảng", "chưa xong", "tiếp tục…") và chạy tiếp thay vì để bạn ngồi chờ.',
      'Thêm model Claude Fable vào danh sách, và ghi rõ từng model mạnh/nhanh/cân bằng. Các tên này là BÍ DANH — chúng luôn trỏ tới bản mới nhất mà Claude CLI trên máy bạn biết.',
      'HIỆN TÊN MODEL THẬT trên mỗi câu trả lời (vd "claude · claude-opus-5-5") thay vì chỉ bí danh "opus". Đo thật trên cùng một máy: CLI 2.1.220 cho ra claude-opus-5, CLI 2.1.286 cho ra claude-opus-5-5 — cùng một lựa chọn "Opus", hai model khác đời, mà trước đây không có gì báo.',
      'CẢNH BÁO KHI CLAUDE CLI ĐÃ CŨ, kèm sẵn câu lệnh cập nhật. Quan trọng vì model chọn bằng bí danh: máy cài CLI cũ vẫn chạy bình thường, không báo lỗi, chỉ là chạy model đời trước — và bạn không có cách nào biết.',
    ],
  },
  {
    version: '1.0.345',
    date: '2026-10-01',
    items: [
      'Trợ lý nay TẠO ĐƯỢC BASE CÓ TÊN, đặt đúng thư mục. Trước đây nó dựng xong vài chục bảng nhưng Base thì không tên, nằm trơ ở gốc Drive — bạn phải tự vào Lark đặt tên rồi kéo đi, vì bộ công cụ chỉ xuống tới bảng/cột/bản ghi, không có cấp Base.',
      'Thêm 4 công cụ: tạo Base (có tên + thư mục), đổi tên Base, tạo thư mục Drive, di chuyển Base/tài liệu sang thư mục khác. Cả bốn đều hỏi xác nhận trước khi ghi.',
      'Trợ lý được dặn thẳng: ĐỪNG dựng bảng vào một Base không tên ở gốc Drive rồi bảo bạn tự đặt tên.',
    ],
  },
  {
    version: '1.0.344',
    date: '2026-10-01',
    items: [
      'NGỮ CẢNH ĐẦY NAY ĐƯỢC NÉN NGAY TRONG CUỘC TRÒ CHUYỆN ĐANG MỞ — giống Claude. Giữ nguyên lịch sử, giữ nguyên Base, bạn không bị đẩy sang hội thoại mới giữa lúc đang làm dở. Bản 1.0.343 tạo hội thoại mới, và như vậy là cắt đôi thứ bạn đang làm.',
      'Bên dưới: phiên trò chuyện với AI được thay bằng phiên mới mang theo bản tóm tắt (mục tiêu, bảng đang thao tác, đã xong gì, còn gì). Bên trên bạn chỉ thấy một dòng "đã nén lại" rồi nó làm tiếp.',
      'Lượt chạy dừng giữa chừng vẫn tự chạy tiếp như 1.0.343 (tối đa 3 lần), và vẫn bắt agent đếm lại thực tế rồi tổng kết "đã xong gì, còn thiếu gì".',
    ],
  },
  {
    version: '1.0.343',
    date: '2026-10-01',
    items: [
      'LƯỢT CHẠY DỪNG GIỮA CHỪNG NAY TỰ CHẠY TIẾP. Trước đây agent gọi một loạt công cụ rồi im, ô soạn mở lại như thể xong việc — bạn hỏi "xong chưa" mới biết là chưa. Nay app tự nhận ra lượt kết thúc KHÔNG có kết luận và chạy tiếp (tối đa 3 lần cho mỗi yêu cầu).',
      'NGỮ CẢNH ĐẦY NAY TỰ XỬ LÝ. Từ ~85% ngữ cảnh, nếu một lượt dừng giữa chừng thì app tự sang phiên mới kèm tóm tắt rồi chạy tiếp — không còn bắt bạn đọc cảnh báo rồi tự bấm.',
      'Lần tự chạy tiếp luôn bắt agent ĐẾM LẠI THỰC TẾ bằng công cụ trước khi làm tiếp, và kết thúc bằng một dòng tổng kết "đã xong gì, còn thiếu gì" — hai thứ thiếu đúng lúc cần nhất.',
      'Hết 3 lần mà vẫn dở dang thì app NÓI RA, thay vì im lặng để bạn tưởng đã xong.',
    ],
  },
  {
    version: '1.0.342',
    date: '2026-09-29',
    items: [
      'SỬA LỖI CHÍNH: thẻ tệp KHÔNG BAO GIỜ hiện trong hội thoại Lark. Tool chạy qua hai đường khác nhau và bản vá trước chỉ gắn vào một đường — đúng đường ít dùng. Tệp vẫn được tạo, nhưng bạn không thấy nó đâu cả.',
      'Đó cũng là lý do trợ lý cứ tự đẩy tệp lên Lark Drive: nó không có chỗ nào khác để đưa cho bạn. Nay tệp hiện ngay trong hội thoại, và trợ lý được dặn rõ KHÔNG tự đẩy lên Lark Drive/Base nữa — chỉ gửi khi bạn nói rõ muốn gửi đi đâu.',
      'Tệp nay được SAO LƯU LÊN MÁY CHỦ tài khoản, giống như hội thoại: mở cùng hội thoại đó ở máy khác vẫn bấm tải được, thay vì nằm chết trên đúng một máy.',
      'Bấm vào thẻ: ưu tiên mở bản trên máy; máy khác không có thì tự lấy bản đã sao lưu về.',
    ],
  },
  {
    version: '1.0.341',
    date: '2026-09-29',
    items: [
      'Cửa sổ "Đang tải bộ cài" nay hiện SỐ THẬT: đã tải bao nhiêu / tổng bao nhiêu, tốc độ mỗi giây và thời gian còn lại. Trước đây nó chỉ có một thanh nhấp nháy ghim cứng ở 100% — không mang một bit thông tin nào, nên mười giây và mười phút trông y hệt nhau và ai cũng tưởng nó treo.',
      'Bỏ dòng "~100MB": bộ cài thật là ~214 MB (bản gộp cho cả máy Intel lẫn Apple Silicon). Nói sai một nửa cỡ tệp thì chờ đúng thời gian cũng thành cảm giác lâu bất thường.',
      'Đo lại tốc độ thật từ máy chủ: 214 MB trong khoảng 8 giây. Việc tải vốn không chậm — chỉ là app không nói gì trong lúc chờ.',
    ],
  },
  {
    version: '1.0.340',
    date: '2026-09-29',
    items: [
      'Màn "Trợ lý AI" chung nay cũng đưa được tệp về: mọi tệp trợ lý tạo ra trong lượt chạy đều hiện thành thẻ bấm-để-mở. Trước đây nó chỉ nói "đã lưu ở /var/folders/..." kèm một đường dẫn trong thư mục tạm mà bạn không có cách nào mở.',
      'Tệp bị GHI ĐÈ cũng hiện lại. Bảo "sửa lại cột ngày trong file vừa rồi" thì trợ lý ghi đè đúng tệp cũ — nếu chỉ nhận tệp mới thì bạn tải lại đúng bản chưa sửa.',
      'Lọc bớt: chỉ tệp đáng nhận mới lên thẻ (bỏ tệp nháp, tệp ẩn, tệp rỗng), tối đa 10 thẻ mỗi lượt để hội thoại không bị ngập.',
    ],
  },
  {
    version: '1.0.339',
    date: '2026-09-28',
    items: [
      'TRỢ LÝ LARK NAY TẠO ĐƯỢC TỆP THẬT: Excel (.xlsx), CSV, Word (.docx), PDF, Markdown, text, HTML. Cứ bảo "xuất ra Excel", "làm báo cáo PDF" là nó dựng tệp và hiện ngay trong hội thoại — bấm là mở. Trước đây nó chỉ dán được bảng dưới dạng chữ rồi nói là đã xuất tệp, vì thật sự không có cách nào khác.',
      'Muốn gửi đi đâu thì nói rõ: gửi vào một nhóm Lark, đính vào ô đính kèm của một dòng Bitable, hoặc lưu lên Lark Drive. Đính vào Bitable là GHI THÊM, không xoá tệp đang có trong ô đó.',
      'Số liệu vào Excel đúng KIỂU SỐ để cộng trừ được ngay, còn mã có số 0 ở đầu (mã khách, số điện thoại) thì giữ nguyên chứ không bị nuốt mất số 0. CSV có sẵn dấu nhận diện để Excel trên Windows không làm hỏng chữ tiếng Việt.',
      'PDF chỉ dựng được trên app desktop (dùng bộ in sẵn có của app nên chữ tiếng Việt và bảng biểu ra đúng). Chạy trên máy chủ thì trợ lý sẽ nói rõ và đề nghị .docx hoặc .html thay thế.',
    ],
  },
  {
    version: '1.0.338',
    date: '2026-09-28',
    items: [
      'SỬA: lịch tự động hoá tự đẻ ra hội thoại mới mỗi lần chạy mà không làm việc. Nguyên nhân: lượt chạy theo lịch vẫn cầm công cụ ĐẶT LỊCH, mà prompt của lịch viết theo giọng đặt việc ("mỗi ngày 9h chạy skill …") nên AI đọc thành "hãy đặt lịch" rồi đặt thêm một lịch nữa — tự duyệt luôn vì không có ai ngồi đó. Lịch mới có id mới nên kèm một hội thoại mới, và lần sau lặp lại.',
      'Nay lượt chạy theo lịch không cầm công cụ đặt lịch nữa. Bạn vẫn đặt lịch bình thường trong hội thoại — chỗ có người đọc câu xác nhận.',
    ],
  },
  {
    version: '1.0.337',
    date: '2026-09-28',
    items: [
      'SỬA LỖI "Quá thời gian chạy (240 giây)" của Tự động hoá Lark. Trần thời gian cho việc "Chạy AI agent" nay là 900 giây thay vì 240 — lượt chạy XONG gần nhất trong lịch sử của bạn mất 488 giây, tức trần cũ cắt vào giữa một công việc bình thường chứ không phải cắt một lượt chạy loạn.',
      'Hết giờ nay CẮT THẬT. Trước đây trần thời gian chỉ giơ cờ rồi chờ sự kiện kế tiếp, mà lượt chạy đang treo chờ model nghĩ thì chẳng có sự kiện nào — nên có lượt chạy tới 958 giây dưới trần 240 giây, làm xong hết việc, tốn đủ tiền, rồi mới bị vứt kết quả. Nay tới hạn là dừng ngay.',
      'Lượt chạy hết lượt Claude ("You\'ve hit your weekly limit") nay ghi là HỎNG. Trước đây CLI in câu đó ra như một câu trả lời bình thường rồi thoát êm, nên lịch sử ghi dấu ✓ cho một lượt 6 giây chưa đọc nổi một dòng Base nào.',
      'Hai lượt CHẠY HỘ (bạn bè dùng Trợ lý AI được chia sẻ) cũng mắc đúng lỗi hết-giờ-không-cắt ấy, nay sửa luôn — trước đó một lượt treo có thể sống quá trần 120 giây trên máy chủ nhà mà chủ máy không hay.',
    ],
  },
  {
    version: '1.0.335',
    date: '2026-09-24',
    items: [
      'Cảnh báo chỉ hiện đúng trường hợp phần lõi chặn địa chỉ máy chủ mới, KHÔNG hiện khi mất mạng — hai thứ này trả về cùng một mã lỗi, mà bảo một người đang mất mạng đi tải bộ cài 214 MB thì vô nghĩa.',
    ],
  },
  {
    version: '1.0.334',
    date: '2026-09-24',
    items: [
      'SỬA: chỗ "dán token thủ công" khi đăng nhập không tự nhảy về vẫn chỉ bạn mở app.toolswave.net/auth/callback — trang đó nay trả 404. Đúng phải là toolswave.net/auth/callback. Đây chính là chỗ người ta tìm đến khi đăng nhập đã hỏng, nên sai ở đây là sai hai lần.',
      'Các địa chỉ hiện trên màn hình (mở trên điện thoại, mã QR, bấm để sao chép) nay ghi cùng một tên miền toolswave.net. Trước đó mã QR và nút sao chép đã đúng rồi, chỉ dòng chữ bên cạnh còn ghi tên cũ — nhìn một đằng, sao chép một nẻo.',
    ],
  },
  {
    version: '1.0.333',
    date: '2026-09-24',
    items: [
      'SỬA LỖI QUAN TRỌNG: app gọi vào địa chỉ máy chủ CŨ. Sau lần hoán đổi tên miền, địa chỉ cũ không chết mà đã thành một hệ thống khác, nên app không báo mất mạng — nó nhận 404 từ một nơi xa lạ. Đăng nhập, danh sách app, token tác tử, đồng bộ Lark đều có thể hỏng theo kiểu khó hiểu.',
      'Phải CÀI LẠI bản này mới hết: phần lõi của bản đang cài nướng sẵn địa chỉ cũ, cập nhật giao diện không chạm tới được.',
      'Từ nay đặt biến môi trường LARKWAVE_API_BASE là đủ đổi địa chỉ cho TOÀN BỘ app — trước đây nó chỉ có tác dụng ở một chỗ trong ba mươi mốt chỗ gọi.',
    ],
  },
  {
    version: '1.0.332',
    date: '2026-09-21',
    items: [
      'Mục Kỹ năng chéo có ô "Mô tả bằng lời — trợ lý tự dựng cả bộ": cứ viết các bước bạn muốn làm bằng tiếng Việt thường, trợ lý tự đặt tên kết quả, tự nối, tự tạo từng kỹ năng. Không phải nghĩ tên khoá, không phải biết bước nào chạy trước.',
      'Bấm là mở thẳng hội thoại với yêu cầu điền sẵn — bạn đọc lại rồi mới gửi, và trợ lý nói ra nó định tạo những gì TRƯỚC khi tạo.',
      'Form khai tay vẫn còn nguyên cho ai muốn tự làm.',
    ],
  },
  {
    version: '1.0.331',
    date: '2026-09-21',
    items: [
      'Kỹ năng hỏng giữa chừng KHÔNG còn bị bỏ luôn: bộ chạy tiếp các kỹ năng khác rồi QUAY LẠI thử nó lần nữa, khi dữ liệu đã đầy hơn lúc nó hỏng. Giống cách người ta làm việc — gặp chỗ tắc thì để đó, xong quay lại.',
      'Nói đúng lại cách bộ chạy: mặc định các kỹ năng chạy LẦN LƯỢT, không cần nối gì cả. Chỉ nối khi một kỹ năng thật sự cần kết quả của kỹ năng khác.',
    ],
  },
  {
    version: '1.0.330',
    date: '2026-09-21',
    items: [
      'SỬA: không còn bắt chọn bảng trước mới khai được kỹ năng. Phần lớn kỹ năng chỉ là các bước bạn nghĩ ra, kết quả của chúng chẳng phải cột nào cả — bảng nay chỉ là GỢI Ý tên, tuỳ chọn.',
      'Nói rõ tên kết quả là tên BẠN tự đặt: cứ gõ "số khách trùng" rồi Enter. Chọn từ cột Base chỉ để khỏi gõ khi kết quả đúng là một cột.',
      'Nói rõ thứ tự chạy KHÔNG nhất thiết là 1→2→3: tuỳ dữ liệu, nó có thể chạy bước 2 trước, rồi 5, rồi 3.',
    ],
  },
  {
    version: '1.0.329',
    date: '2026-09-21',
    items: [
      'Thêm nút "Nối hai kỹ năng" ngay trên thanh công cụ mục Kỹ năng chéo. Trước đây muốn nối phải có một BỘ đã, rồi mở ngăn Skills, rồi bật chế độ sửa — nhưng lúc mới bắt đầu thì chưa có bộ nào, mà đó đúng là lúc cần nối nhất.',
      'Hộp nối hỏi theo đúng thứ tự người ta nghĩ: kỹ năng chạy TRƯỚC (làm ra kết quả) → kết quả nào chuyền sang → kỹ năng chạy SAU (dùng kết quả đó). Nối xong nói rõ điều gì vừa thay đổi.',
    ],
  },
  {
    version: '1.0.328',
    date: '2026-09-21',
    items: [
      'SỬA LỖI: mục "Kỹ năng" vẫn hiện phần khai hợp đồng của kỹ năng chéo. Khai vào đó là kỹ năng vừa tạo LẬP TỨC biến mất sang mục kia — bạn không làm gì sai mà thấy nó mất tích. Nay phần đó chỉ có ở mục "Kỹ năng chéo".',
      'Hai mục có link sang nhau, để bạn không phải tự đi tìm khi chọn nhầm chỗ.',
    ],
  },
  {
    version: '1.0.327',
    date: '2026-09-21',
    items: [
      'Form tạo kỹ năng LỘ DẦN THEO BƯỚC: chọn bảng xong mới hiện "Cần có trước / Sinh ra / Ràng buộc". Trước đây ba ô hiện sẵn nhưng rỗng, không có gì để chọn, và cách duy nhất biết phải làm gì trước là đoán.',
      'Có lối thoát "Kỹ năng này không đọc bảng nào" cho kỹ năng chỉ tính toán — không bị chặn cứng ở bước chọn bảng.',
      'Viết lại toàn bộ phần giải thích cho người chưa từng viết code: mỗi ô nói rõ chọn vào đó thì ĐIỀU GÌ XẢY RA, kèm ví dụ thật ("chọn Số khách trùng thì kỹ năng này chỉ chạy sau khi một kỹ năng khác đếm xong con số ấy").',
      'Bỏ hàng "Ví dụ — bấm để điền sẵn" ở hộp tạo kỹ năng.',
    ],
  },
  {
    version: '1.0.326',
    date: '2026-09-21',
    items: [
      'Bỏ tab "Trợ lý AI" khỏi menu bản desktop — mọi việc ở đây đã đi qua nhóm Lark, thêm một ô chat đa năng thứ hai chỉ làm bạn phải chọn giữa hai cửa vào mà không biết nên vào cửa nào. (Bản web giữ nguyên: ở đó không có nhóm Lark.)',
      'Kỹ năng chuyển vào nhóm Lark và TÁCH LÀM HAI: "Kỹ năng" (quy tắc rời, AI tự áp khi yêu cầu khớp mô tả) và "Kỹ năng chéo" (nối nhau bằng khoá, chạy theo thứ tự suy ra từ dữ liệu và kiểm chéo sau mỗi bước).',
      'Hai luồng này logic khác hẳn nhau nên gộp chung một danh sách thì mọi câu hướng dẫn đều phải nói "nếu loại A thì…, nếu loại B thì…". Tách ra là mỗi mục nói đúng một chuyện.',
      'Thẻ "Bộ kỹ năng" chỉ còn ở mục Kỹ năng chéo — ở mục kia nó luôn rỗng và chỉ làm bạn tưởng mình đang thiếu gì đó.',
    ],
  },
  {
    version: '1.0.325',
    date: '2026-09-21',
    items: [
      'Phần "Bảng đích" giờ nói rõ DÙNG ĐỂ LÀM GÌ: chỉ dành cho kỹ năng đọc tệp (hoá đơn PDF, Excel…) rồi ghi mỗi tệp thành một dòng. Kỹ năng chỉ tính toán rồi chuyền kết quả thì bỏ trống.',
      'Chọn bảng đích từ danh sách thay vì gõ tên, và mỗi kết quả chọn cột từ danh sách cột THẬT của bảng đó — không còn gõ tay rồi sai một chữ là không ghi được.',
      'Mở lại một kỹ năng đã có bảng đích thì cột nạp sẵn, không còn hiện rỗng làm tưởng bảng không có cột.',
    ],
  },
  {
    version: '1.0.324',
    date: '2026-09-21',
    items: [
      'Tạo kỹ năng: "Cần có trước" và "Sinh ra" giờ là ô CHỌN, lấy thẳng từ cột trong Base — không phải gõ. Hai kỹ năng cùng chọn một cột sẽ ra cùng một khoá nên tự nối được.',
      'Có nút nạp lại bên cạnh: vừa thêm cột trong Base ở cửa sổ khác thì bấm là thấy ngay, không phải đóng hộp thoại (mất hết những gì vừa khai) rồi mở lại.',
      'Danh sách chọn tách hai nhóm rõ ràng: "Cột trong bảng đã chọn" và "Khoá kỹ năng khác đã dùng". Kết quả không phải là cột (vd một con số đếm được) thì vẫn gõ tiếng Việt rồi Enter như cũ.',
    ],
  },
  {
    version: '1.0.323',
    date: '2026-09-21',
    items: [
      'Tạo kỹ năng: KHÔNG còn phải tự nghĩ ra tên khoá kiểu gia_von hay tt_kh_trung. Gõ bằng tiếng Việt — "Số khách hàng trùng" — máy tự đặt tên khoá và hiện ra bên cạnh.',
      'Ràng buộc dựng bằng ô chọn: chọn khoá, chọn phép so sánh, gõ vế phải, bấm Thêm. Không phải đoán cú pháp từ một ô trống.',
      'Thêm khối "Khi chạy, kỹ năng này sẽ:" — dịch phần khai báo thành một câu kể: chờ khoá nào, sinh ra gì, máy kiểm gì, ghi vào đâu.',
      'Hộp tạo/sửa kỹ năng rộng 860px khi có phần hợp đồng — ở 520px các ô chồng lên nhau và mỗi dòng gãy làm ba.',
    ],
  },
  {
    version: '1.0.322',
    date: '2026-09-19',
    items: [
      '"Nối skill vào bộ" nay NỐI THẬT: chọn kỹ năng + chọn khoá của bộ, bấm Nối là xong. Hợp đồng cũ của kỹ năng đó (produces, ràng buộc) được giữ nguyên, và có bản lưu để lùi.',
      '"Nhờ AI thiết kế lại bộ" nay mở hội thoại Trợ lý Lark và ĐIỀN SẴN yêu cầu — kèm đủ tên kỹ năng, khoá, vấn đề đang có và lượt chạy gần nhất hỏng ở đâu. Chỉ điền, không tự gửi: bạn đọc lại rồi mới gửi.',
    ],
  },
  {
    version: '1.0.321',
    date: '2026-09-19',
    items: [
      'SỬA LỖI: bấm "Sửa bộ" xong ba nút chức năng vẫn mờ — hiện ra mà không bấm được, tệ hơn cả không hiện.',
      '"Đổi thứ tự" chạy thật: mũi tên lên/xuống trên các bước TỰ DO. Bước bị khoá bởi khoá thì không có mũi tên — đổi cũng không ăn, nên không bày ra.',
      'Bật/tắt kỹ năng từ thẻ bộ giờ làm LƯỚI KỸ NĂNG phía trên nạp lại ngay — trước đây thẻ nói "đang tắt" mà lưới vẫn nói "Đang bật".',
      'Thứ tự được ghi TRƯỚC khi bật lại bộ, để không có khoảnh khắc bộ đã sống mà thứ tự còn cũ.',
    ],
  },
  {
    version: '1.0.320',
    date: '2026-09-19',
    items: [
      'Thêm chế độ SỬA BỘ: bấm "Sửa bộ" là các kỹ năng trong bộ tự tắt, nên lịch tự động không nổ giữa lúc bạn đang sửa dở. Xong thì chọn "Lưu & bật lại" hoặc "Lưu, vẫn để tắt".',
      'Bật lại đúng những kỹ năng VỐN đang bật — cái bạn đã cố tình tắt từ trước thì vẫn tắt.',
      'SỬA LỖI: tắt một kỹ năng là cả bộ biến mất khỏi danh sách (vì danh sách chỉ lấy kỹ năng đang bật). Nay bộ vẫn hiện, kỹ năng tắt có nhãn "đang tắt" — chạy thì vẫn chỉ chạy kỹ năng đang bật.',
    ],
  },
  {
    version: '1.0.319',
    date: '2026-09-19',
    items: [
      'SỬA LỖI: kỹ năng tổng hợp quay lại Lark ĐẾM LẠI TỪ ĐẦU thay vì cộng các con số vừa được đưa cho, nên ràng buộc "tổng == tổng các thành phần" gãy ở mọi lần thử. Nay lời nhắc nói rõ: khoá bạn CẦN là kết quả chốt của bước trước, dùng nguyên, không truy vấn lại.',
      'BẢN LƯU cho từng kỹ năng: mỗi lần kỹ năng bị sửa — bạn sửa hay AI sửa — đều chụp lại một bản, lùi về được. Mở trong Skills → Bản lưu.',
      'Trợ lý Lark giờ SỬA được kỹ năng đã có (không chỉ tạo mới): bảo "sửa lại kỹ năng X, nó đếm sai tổng" là nó tự sửa. Mọi lần AI sửa đều có bản lưu để lùi.',
      'Khôi phục cũng lưu lại bản hiện tại trước — lùi nhầm vẫn tiến lại được.',
    ],
  },
  {
    version: '1.0.318',
    date: '2026-09-19',
    items: [
      'Mục "Bộ kỹ năng" vẽ lại: mỗi bộ giờ là MỘT HÀNG GỌN — tên + bốn nút Chạy thử / Chạy thật / Lịch sử / Skills. Nhìn lướt là biết có mấy bộ và bộ nào vừa hỏng.',
      'Bấm Skills ra danh sách kỹ năng đang nối, có đánh số và nói rõ bước nào BỊ ÉP thứ tự (kèm tên kỹ năng ép nó) và bước nào TỰ DO đổi chỗ.',
      'Bấm Lịch sử ra các lượt chạy dạng vòng tròn: xanh xong, đỏ hỏng, cam phải chạy lại. Bấm một vòng tròn ra chi tiết bước đó.',
      'Các bộ tách nhau bằng TIỀN TỐ KHOÁ (tt_, kc2_, sw_) thay vì bằng nhãn — ba bộ khác hẳn nhau của bạn đều mang cùng nhãn Lark + Kiểm chéo nên gom theo nhãn là nhét chung một chỗ.',
      'Cảnh báo mới: khoá nào có kỹ năng CẦN mà chưa kỹ năng nào làm ra — đó là lý do một bộ dừng giữa chừng, và trước nay không có gì báo.',
    ],
  },
  {
    version: '1.0.317',
    date: '2026-09-19',
    items: [
      'Trợ lý Lark LUÔN tổng kết cuối lượt khi có làm việc: đã làm gì (kèm con số, tên bảng), kiểm lại ở đâu, và lưu ý / đề xuất bước tiếp. Trước đây làm xong là im, bạn phải tự mở Base ra dò.',
      'Trợ lý muốn hỏi gì thì hiện HỘP LỰA CHỌN bấm được, thay vì viết câu hỏi ra rồi dừng lượt. Câu hỏi viết thành văn thì bạn phải tự gõ lại, mà lượt đã kết thúc nên câu trả lời mất ngữ cảnh.',
    ],
  },
  {
    version: '1.0.316',
    date: '2026-09-19',
    items: [
      'SỬA LỖI NẶNG: lượt chạy HẾT GIỜ mà đã có chữ dở dang thì bị coi là THÀNH CÔNG. Kỹ năng "chạy xong" nhưng không ra khoá nào, các bước sau bị chặn, và nguyên nhân thật (hết giờ) không hiện ở đâu cả.',
      'Trần thời gian mỗi bước kỹ năng nâng 240 giây → 10 phút. Kỹ năng kiểm chéo thường quét trọn một bảng có phân trang, và 240 giây vừa đủ để bị cắt ngang lúc đang đọc trang cuối.',
      'Lịch sử chạy giờ ghi LÝ DO một bước hỏng (hết giờ, mất mạng…) thay vì chỉ "không ra khoá" — hai chuyện khác hẳn nhau.',
    ],
  },
  {
    version: '1.0.315',
    date: '2026-09-19',
    items: [
      'SỬA LỖI: chuỗi kỹ năng trong một bộ hiện SAI thứ tự — kỹ năng tổng hợp (cần khoá của mọi kỹ năng khác nên phải chạy cuối) lại đứng đầu. Nay sắp đúng thứ tự sẽ chạy và có đánh số 1. 2. 3.',
      'Gọi đúng tên nó là thứ tự DỰ KIẾN: lúc chạy thật có thể khác nếu dữ liệu đầu vào đã có sẵn khoá — lịch sử chạy mới là thứ tự đã xảy ra.',
      'Kỹ năng trợ lý tạo ra giờ TỰ THỪA HƯỞNG nhãn của bộ mà nó nối vào, thay vì để trống rồi cả ngăn mất tên.',
      'Nhãn của một ngăn tính theo ĐA SỐ thành viên thay vì phải mọi thành viên cùng có — chỉ một kỹ năng quên gắn nhãn là cả ngăn mất tên, dù các kỹ năng còn lại đều đủ.',
      'Lịch sử chạy chuyển thành nút mở hộp riêng, thay vì nằm dài trong từng bộ.',
    ],
  },
  {
    version: '1.0.314',
    date: '2026-09-19',
    items: [
      'Mục "Bộ kỹ năng" gom các bộ vào NGĂN theo nhãn bạn đã gắn — có vài chục bộ vẫn nhìn được, thay vì một chồng thẻ dài xếp dọc.',
      'Cảnh báo giống nhau của cả ngăn gom lại nói MỘT lần. Trước đây bốn bộ cùng vướng một chuyện là bốn hộp vàng y hệt nhau chiếm gần hết màn hình.',
      'Mỗi bộ hiện luôn khoá nó sinh ra — đó là thứ dùng để nối nó với bộ khác. Bộ một mình thì nói thẳng "một mình — chưa nối với kỹ năng nào" thay vì "1 kỹ năng dính nhau về dữ liệu".',
      'Lưu ý: nhãn chỉ để SẮP XẾP cho dễ nhìn. Cái gì chạy cùng nhau vẫn do quan hệ dữ liệu quyết định (needs/produces/checks), không phải do nhãn.',
    ],
  },
  {
    version: '1.0.313',
    date: '2026-09-19',
    items: [
      'Bộ kỹ năng có LỊCH SỬ CHẠY: mỗi lượt lưu lại THỨ TỰ THẬT các kỹ năng đã chạy, kỹ năng nào sinh ra khoá gì, và kỹ năng nào làm gãy ràng buộc rồi bị bắt chạy lại (↻). Giữ 20 lượt gần nhất mỗi bộ.',
      'Thứ tự đổi giữa hai lượt là bình thường — nó suy ra từ dữ liệu. Nhưng trước đây không hiện ra nên trông như ngẫu nhiên; giờ rê chuột vào từng bước là thấy lý do.',
      'Lượt “Chọn tệp & ghi” cũng vào lịch sử, kèm số dòng đã ghi và tệp nào bị chặn — đây là đường duy nhất ghi thẳng vào Base nên cần rà lại được.',
      'Thẻ “Bộ kỹ năng” có khoảng hở với lưới kỹ năng phía trên (trước đây dính sát).',
    ],
  },
  {
    version: '1.0.312',
    date: '2026-09-19',
    items: [
      'SỬA LỖI NẶNG: bật "Tự động duyệt" giữa lúc đang chạy thì không ăn thua — lượt đó vẫn hỏi xác nhận rồi hết 10 phút là bị từ chối. Nay cờ này được đọc ngay lúc hỏi.',
      'SỬA LỖI NẶNG: thoát hội thoại rồi vào lại thì mất chỗ bấm duyệt — thao tác treo ở "cần xác nhận" không còn cách nào cứu, 10 phút sau tự hỏng. Nay mở lại hội thoại là hiện lại đúng những gì đang chờ.',
      'Kỹ năng có khai hợp đồng nhưng chưa nối với ai giờ VẪN hiện ở mục "Bộ kỹ năng", kèm câu nói rõ cần thêm gì mới kiểm chéo được — trước đây bị giấu hẳn và màn hình báo "chưa kỹ năng nào khai hợp đồng" dù vừa khai xong.',
      'Tên kỹ năng tiếng Việt không còn bị băm: "KC - Đối chiếu số liệu Chiến dịch" ra kc-doi-chieu-so-lieu-chien-dich thay vì kc-i-chi-u-s-li-u-chi-n-d-ch.',
    ],
  },
  {
    version: '1.0.311',
    date: '2026-09-18',
    items: [
      'Bảo trợ lý Lark “tạo bộ kỹ năng đánh giá app / đối chiếu công nợ…” là nó TỰ TẠO kỹ năng luôn — không phải mở màn hình Kỹ năng gõ tay nữa. Tạo được cả kỹ năng thường lẫn bộ kỹ năng kiểm chéo nhiều bước.',
      'Trợ lý tự đọc các khoá đã có trước khi đặt tên mới, nên các kỹ năng nối được với nhau thay vì mỗi cái một tên riêng cho cùng một thứ.',
      'Nó cũng báo luôn bộ còn thiếu bước nào (khoá chưa ai sinh ra), thay vì nói “đã tạo xong” rồi bạn phát hiện bế tắc lúc bấm Chạy.',
      'Thẻ “Bộ kỹ năng — kiểm chéo liên tục” chuyển xuống dưới danh sách kỹ năng, và nút “?” mở hộp hướng dẫn riêng (trước đây nó đổ chữ vào ô kết quả chạy rồi bị xoá mất).',
      'SỬA: hộp “Claude cần bạn hỗ trợ” — nút lựa chọn dài bị tràn ra ngoài; và với câu hỏi dài thì nút “Gửi”/“Bỏ qua” bị đẩy khỏi màn hình khiến lượt chạy treo không thoát được.',
      'SỬA: trả lời xong câu hỏi của trợ lý thì mất chấm chờ — máy vẫn đang chạy nhưng màn hình im lặng.',
      'SỬA: tải bộ cài trong app bị “fetch failed” giữa chừng — nay tải tiếp được phần còn thiếu thay vì tải lại từ đầu, và bỏ trần 5 phút (bộ cài 214 MiB, mạng 2 Mbps cần 15 phút nên trần cũ luôn luôn hỏng).',
    ],
  },
  {
    version: '1.0.310',
    date: '2026-09-18',
    items: [
      'Khai hợp đồng kỹ năng NGAY TRONG FORM: ô “Cần có trước / Sinh ra / Ràng buộc” ở màn hình tạo và sửa kỹ năng — trước đây phải tự mở SKILL.md gõ YAML mới dùng được bộ kỹ năng kiểm chéo.',
      'Nút “AI đề xuất”: đọc phần mô tả bạn viết bằng tiếng Việt rồi đề xuất sẵn các khoá, có nêu lý do. Nó dùng lại tên khoá các kỹ năng khác đã khai, nên các kỹ năng nối được với nhau thay vì mỗi cái một tên riêng.',
      'Cảnh báo ngay tại form: hai kỹ năng cùng sinh một khoá, khoá vừa cần vừa sinh ra (kỹ năng tự chờ chính nó), ràng buộc nhắc tới khoá chưa khai.',
      'SỬA LỖI: đổi tên một kỹ năng làm mất sạch hợp đồng đã khai trong SKILL.md — không báo gì, chỉ là lần chạy sau bộ kỹ năng thôi kiểm chéo nhau.',
      'Tự động hoá có thêm việc làm “Chạy bộ kỹ năng”: khi một dòng Base khớp điều kiện, các ô của dòng đó thành dữ liệu đầu vào, thứ tự tự suy ra, ràng buộc còn sai đến cuối thì KHÔNG ghi dòng nào.',
      'Khoá nào đã có sẵn trong dòng thì kỹ năng tương ứng được bỏ qua — lịch không ghi đè lên cột nhân viên vừa nhập tay.',
    ],
  },
  {
    version: '1.0.309',
    date: '2026-09-16',
    items: [
      'Kỹ năng trích xuất: chọn tệp Excel/PDF/ảnh/Word → đọc → ghi thẳng vào bảng Bitable, theo format bạn khai sẵn trong SKILL.md (khối target: bảng nào, khoá nào vào cột nào).',
      'Dòng nào không qua được ràng buộc thì KHÔNG được ghi — bảng kết quả chỉ rõ tệp nào bị chặn và sai ở đâu, để sửa chứng từ gốc thay vì đi dọn bảng sau.',
      'Có nút “Chọn tệp & xem thử” chạy chỉ-đọc trước khi ghi thật.',
      'Cảnh báo ngay khi một cột trong map gắn với khoá không kỹ năng nào sinh ra — biết trước khi chạy, không phải sau khi đã ghi 50 dòng.',
    ],
  },
  {
    version: '1.0.308',
    date: '2026-09-16',
    items: [
      'Bộ kỹ năng kiểm chéo nhau: khai needs/produces/checks trong SKILL.md thì thứ tự CHẠY tự suy ra từ dữ liệu — không cần đánh số 1..7, và chạy 3→1→2 vẫn đúng.',
      'Sau MỖI kỹ năng, máy tính lại mọi ràng buộc đủ dữ liệu. Mâu thuẫn lộ ngay tại bước gây ra nó, và kỹ năng vừa làm gãy bị bắt sửa.',
      '“Chưa kiểm được” hiện riêng, không gộp vào “đạt” — ràng buộc viết bằng lời thì do AI phán, yếu hơn loại máy tính được.',
      'Chạy bộ mặc định CHỈ ĐỌC. Muốn ghi vào Base thật thì bấm nút riêng, có xác nhận.',
      'Hội thoại dùng chung cho Lark Agents: chủ và người được chia sẻ cùng một luồng, cùng thấy kết quả trợ lý. Mỗi hội thoại chỉ chạy một lượt tại một thời điểm, nhưng nhắn tin thì lúc nào cũng được. (Cần máy chủ cập nhật mới hiện.)',
    ],
  },
  {
    version: '1.0.307',
    date: '2026-09-12',
    items: [
      'Thêm “Để Larkwave chạy lịch hộ”: bật lên thì lịch tự động hoá chạy kể cả khi bạn tắt app. Nút nằm ngay trên danh sách Tự động hoá.',
      'Tắt là xoá khoá khỏi máy chủ, không phải chỉ ẩn đi.',
      'Sửa lỗi tài khoản chưa từng đồng bộ Lark thì bộ chạy lịch nền chết ngay khi khởi động.',
    ],
  },
  {
    version: '1.0.306',
    date: '2026-09-12',
    items: [
      'Sửa lỗi hội thoại của lịch tự động hoá bị nhét TOÀN BỘ Base đã đăng ký vào hàng “Base áp dụng” — nay chỉ còn đúng Base mà việc đó dùng tới.',
      'Lượt chạy theo lịch cũng chỉ nhìn thấy Base liên quan, thay vì cả kho: đỡ tốn token mỗi lần chạy, và quan trọng hơn là agent tự động không còn thấy những Base nó không có việc gì để đụng vào.',
    ],
  },
  {
    version: '1.0.305',
    date: '2026-09-12',
    items: [
      'Lịch tự động hoá chạy được 24/7 trên một VM, không cần mở app trên máy tính — giống cách Đồng bộ Bitable đang làm. Khoá Lark vẫn nằm trên máy bạn (nay là VM), máy chủ Larkwave vẫn không giữ khoá nào.',
      'Khi VM đang chạy lịch, app trên máy tính tự nhường — mỗi lịch chỉ chạy một lần, không còn nguy cơ tạo bản ghi trùng.',
      'Lịch tự động hoá nay đi theo tài khoản: đổi máy hoặc cài lại vẫn còn nguyên.',
    ],
  },
  {
    version: '1.0.304',
    date: '2026-09-12',
    items: [
      'Lịch tự động hoá nay THỰC THI thật: được thêm/sửa/xoá dữ liệu Lark. Trước đây mọi lịch đều chạy chỉ-đọc, nên một lịch kiểu “mỗi ngày 9h đối chiếu rồi ghi vào bảng” chạy xong chỉ báo lại rằng nó không có quyền ghi.',
      'Sửa lỗi “tự động hoá cứ hỏi lại mà không làm gì”: khi chạy tự động, câu hỏi của agent trước đây nhận về một chuỗi rỗng nên nó hỏi lại mãi tới hết giờ. Nay nó được bảo rõ là không có ai để hỏi, hãy tự quyết rồi làm tiếp và nêu giả định trong báo cáo.',
      'Thêm LỊCH SỬ THỰC THI cho từng quy tắc: mỗi lần chạy ghi lại thời điểm, mất bao lâu, thành công hay lỗi, và SỐ THAO TÁC GHI — để rà lại một lịch chạy tự động không ai trông.',
      'Ô “Cho phép ghi dữ liệu (thực thi)” khi tạo lịch — bỏ tick nếu chỉ muốn lịch đọc và báo cáo.',
    ],
  },
  {
    version: '1.0.303',
    date: '2026-09-11',
    items: [
      'Lark × Agents có thêm nguồn chạy thứ ba: “Gói Larkwave” — chạy bằng số token bạn đã mua trên website, KHÔNG cần cài CLI và KHÔNG cần dán khoá API riêng.',
      'Chỗ chọn cách chạy đổi từ công tắc bật/tắt thành ba lựa chọn rõ ràng: CLI trên máy · API riêng · Gói Larkwave.',
    ],
  },
  {
    version: '1.0.302',
    date: '2026-09-11',
    items: [
      'Khi trợ lý hỏi “(a)… hay (b)…?”, các lựa chọn hiện thành nút bấm ngay dưới câu trả lời — bấm một cái là gửi, không phải gõ lại.',
      'Khi trợ lý báo đang ở chế độ Hỏi đáp (chỉ đọc) và cần quyền ghi, có luôn nút “Chuyển sang Thực thi” ngay tại chỗ, thay vì phải đi tìm công tắc ở dưới khung soạn.',
    ],
  },
  {
    version: '1.0.301',
    date: '2026-09-11',
    items: [
      'Lịch tự động hoá không còn tự chạy ngay lúc vừa đặt: hẹn “mỗi ngày 9h” vào buổi chiều thì nó đợi tới 9h sáng mai, thay vì chạy luôn rồi tự mở một hội thoại mới hỏi lại chính câu bạn vừa gõ.',
      'Đặt trùng một lịch không còn đẻ thêm mục mới ở trang Tự động hoá — các mục đã trùng sẵn cũng được gộp lại khi mở app, giữ nguyên lịch sử chạy.',
      'Mỗi lịch nay chỉ có MỘT hội thoại, mỗi lần chạy là một lượt mới trong đó — trước đây chạy hằng ngày là mỗi tháng thêm 30 hội thoại cùng tên.',
      'Trang Tự động hoá hiện rõ câu lệnh của từng lịch AI và gắn nhãn “Trùng”, nên biết ngay mục nào nên xoá.',
      'Tạo được lịch theo giờ ngay cả khi chưa thêm Base nào — trước đây nút “Thêm quy tắc” bị khoá nên cách duy nhất để có lịch là nhắn cho agent.',
      'Lời mời dùng chung Lark nay hiện NGAY cả khi bạn chưa kết nối Lark của riêng mình — trước đây người được mời không bao giờ thấy nút “Kết nối”, nên tính năng chia sẻ coi như không dùng được.',
      'Thêm nút “Chia sẻ” riêng ở đầu màn Lark × Agents, thay vì nằm lẫn trong Cài đặt.',
    ],
  },
  {
    version: '1.0.300',
    date: '2026-09-09',
    items: [
      'Trong Lark × Agents, tệp đã GỬI RỒI vẫn bấm vào tên để xem trước được — trước đó gửi xong là nó trở lại thành chữ thường.',
      'Bấm chip “/lệnh” trong tin nhắn để đọc nội dung skill ngay tại chỗ, giống Trợ lý AI.',
    ],
  },
  {
    version: '1.0.299',
    date: '2026-09-09',
    items: [
      'Thêm mục “Tệp đã gửi” trong nhóm Lark: xem toàn bộ tệp bạn từng đính kèm, gom theo cuộc trò chuyện, biết dung lượng đang chiếm, bấm để xem trước và xoá hẳn khỏi máy khi không cần nữa.',
    ],
  },
  {
    version: '1.0.298',
    date: '2026-09-09',
    items: [
      'ĐÍNH KÈM EXCEL/WORD ĐỌC ĐƯỢC: trước đây gửi file .xlsx thì trợ lý báo “không có công cụ nào đọc được”. Nay phần chữ trong file được trích sẵn nên nó đọc và phân tích bình thường (.xlsx / .docx / .pptx).',
      'Bấm vào tên file đính kèm để XEM TRƯỚC ngay trong app — bảng tính hiện thành bảng, không còn chỉ là một cái tên.',
    ],
  },
  {
    version: '1.0.297',
    date: '2026-09-09',
    items: [
      'Mở tab mới KHÔNG còn tạo hội thoại rỗng trong “Hội thoại cũ” — chỉ khi bạn thật sự nhắn gì đó thì cuộc trò chuyện mới được lưu.',
      'Màn hình chờ “Đang kiểm tra agents…” nay che kín, không còn lộ tiêu đề mục phía sau.',
    ],
  },
  {
    version: '1.0.296',
    date: '2026-09-09',
    items: [
      'Nút “Trang chủ” trên thanh tab Lark đã bấm được — trước đó nó không làm gì.',
      'Hộp thoại đổi tên / xoá hội thoại nay đóng được bằng cách bấm ra ngoài.',
      'Ghim tab đã hoạt động: tab được ghim không bị “đóng các tab khác” hay “đóng tất cả” cuốn theo.',
    ],
  },
  {
    version: '1.0.295',
    date: '2026-09-09',
    items: [
      'ĐỔI TÊN hội thoại Lark: nút bút chì trong ngăn “Hội thoại cũ”. Để trống thì quay lại tên tự đặt theo tin nhắn đầu.',
      'Chia sẻ Lark nay đặt quyền THEO TỪNG BASE: Không / Đọc / Đọc + ghi. Trước đây chỉ có một mức quyền chung cho cả lượt chia sẻ, mà thực tế thường là “sửa được bảng này, chỉ đọc bảng kia”.',
      'Quyền ghi được chặn ở tầng công cụ, kiểm theo từng thao tác: hỏi sửa dữ liệu trên Base chỉ-đọc sẽ bị từ chối ngay. Base không chia sẻ thì người kia không thấy và không hỏi được, kể cả khi biết tên.',
    ],
  },
  {
    version: '1.0.294',
    date: '2026-09-09',
    items: [
      'Lark × Agents: màn hình mở đầu có lời chào theo buổi (sáng / trưa / chiều / tối) kèm hiệu ứng hiện lên nhẹ.',
      'XOÁ HỘI THOẠI đã dùng lại được — nút xoá nằm trong ngăn “Hội thoại cũ”, có hỏi lại trước khi xoá.',
      'Hội thoại cũ nay được GOM NHÓM THEO BASE đang áp dụng, tìm được theo tên, và đánh dấu cuộc nào đang mở.',
    ],
  },
  {
    version: '1.0.293',
    date: '2026-09-09',
    items: [
      'SỬA GẤP: bản 1.0.292 làm các cuộc trò chuyện Lark cũ trông như biến mất — thanh tab chỉ liệt kê tab đang mở nên không còn lối nào mở lại hội thoại cũ. Dữ liệu KHÔNG hề mất; nay có nút “Hội thoại cũ” (biểu tượng đồng hồ, bên trái thanh tab) mở ra danh sách đầy đủ, tìm được theo tên.',
    ],
  },
  {
    version: '1.0.292',
    date: '2026-09-09',
    items: [
      'Lark × Agents có THANH TAB: mở nhiều cuộc trò chuyện cùng lúc và hỏi song song — không phải chờ cuộc này xong mới hỏi cuộc kia. Tối đa 3 cuộc chạy cùng lúc; kéo để sắp lại tab, chuột giữa để đóng, mở lại được tab vừa đóng.',
      'Nút “Dừng” nay chỉ dừng ĐÚNG cuộc trò chuyện của tab đó, không còn dừng luôn cuộc đang chạy ở tab khác.',
      'Xoá cuộc trò chuyện Lark là mất hẳn. Trước đây xoá xong, lần đồng bộ sau nó hiện lại y nguyên — và nếu bạn dùng nhiều máy thì máy kia cũng xoá theo.',
    ],
  },
  {
    version: '1.0.290',
    date: '2026-09-08',
    items: [
      'Chỗ nào không có hạn mức thì thanh không còn biến mất để lại khoảng trống trông như hỏng: thanh vẫn vẽ, nhưng mép phải nhoè dần để không ai đọc nhầm thành "đã dùng hết".',
    ],
  },
  {
    version: '1.0.289',
    date: '2026-09-08',
    items: [
      'Chế độ "API trực tiếp" nay ĐỌC ĐƯỢC cả PDF đính kèm trong Bitable, không chỉ ảnh.',
      'Huy hiệu "Lỗi" chỉ còn đếm lỗi THẬT. Những thất bại bình thường mà trợ lý tự xử lý được (giao diện Lark vừa đổi, chưa thấy nút…) nay hiện xám "bỏ qua" thay vì nhuộm đỏ — để con số màu đỏ lấy lại ý nghĩa.',
      'Việc cần bạn xác nhận hiện nhãn "bị chặn" riêng, không lẫn vào lỗi.',
      'Bản tiếng Anh: nhãn trạng thái công cụ nay dịch đúng (trước vẫn hiện tiếng Việt).',
      'Tệp đính kèm quá khổ không còn làm hỏng cả lượt trò chuyện: trợ lý bỏ tệp ra, trả lời tiếp bằng phần chữ và nói rõ là chưa xem được tệp.',
    ],
  },
  {
    version: '1.0.287',
    date: '2026-09-08',
    items: [
      'Trợ lý KHÔNG còn đổ lỗi cho "bản cài cũ" khi thật ra là Lark từ chối, mất mạng, hay tệp vượt giới hạn — những thứ cài lại bao nhiêu lần cũng không sửa được. Nay chỉ nhắc khi có dấu hiệu thật của lỗi ứng dụng.',
      'Đường "API trực tiếp" nay XEM ĐƯỢC ảnh đính kèm trong Bitable (trước chỉ nhận được đường dẫn rồi tắc, vì đường này không có công cụ đọc tệp).',
      'Lỗi công cụ hiện bằng tiếng Việt dễ hiểu thay vì mã máy như "stale-ref" hay "requires-confirm".',
      'Bấm Từ chối một thao tác thì thẻ công cụ dừng đúng lúc, không còn kẹt ở "đang chạy" mãi.',
      'Thẻ nhắc cài lại nay nằm ngay trên ô soạn tin nên luôn nhìn thấy (trước đó nó ở đầu hội thoại và bị cuộn mất).',
      'Sao chép website ở chế độ "API trực tiếp" không còn bắt trợ lý dùng một công cụ mà chế độ đó không có.',
    ],
  },
  {
    version: '1.0.285',
    date: '2026-09-07',
    items: [
      'Trợ lý nay TỰ NÓI khi bản cài của bạn đã cũ: nếu một việc hỏng mà bản mới có thể đã sửa, câu trả lời sẽ nói rõ đang chạy bản nào, có bản nào mới hơn, và chỗ tải — thay vì chỉ xin lỗi.',
      'Màn phiên bản (cuối thanh bên) nay hiện nút tải bản cài mới cả khi bản mới chỉ sửa phần LÕI. Trước đây nút duy nhất là "kiểm tra & tải lại bản mới nhất", thứ chỉ làm mới giao diện và không bao giờ sửa được lỗi phần lõi.',
      'Trợ lý KHÔNG nhắc cài lại sai chỗ: không nhắc khi chỉ đang xin xác nhận hay khi bạn từ chối một thao tác, và không nhắc trong tin bot Lark gửi vào nhóm hay lượt chạy hộ bạn bè.',
    ],
  },
  {
    version: '1.0.284',
    date: '2026-09-07',
    items: [
      'SỬA: đọc tệp đính kèm trong Bitable bị lỗi "Tải tệp thất bại (HTTP 400)". Base có bật "Phân quyền nâng cao" bắt buộc phải kèm ngữ cảnh bảng khi tải tệp — nay trợ lý dùng thẳng đường tải mà chính ô đính kèm trả về, và còn ba đường dự phòng nếu đường đó hỏng.',
      'Trợ lý Lark KHÔNG còn nói "tôi không có tool đọc file đính kèm": câu hướng dẫn về khả năng này trước đây nằm nhầm ở màn Trợ lý AI (nơi không có tool Lark), nay nằm đúng chỗ.',
      'Ảnh và PDF tải từ Bitable giờ MỞ ĐƯỢC: lượt chat Lark trước đây chạy không có công cụ đọc tệp, nên tải về xong cũng không xem được.',
      'Xem tổng quan Base không còn làm mất dấu tệp đính kèm (trước đây chỉ còn lại tên tệp, không đủ để mở).',
      'Lỗi công cụ hiện rõ ngay trong khung chat thay vì chỉ còn lời diễn giải chung chung của trợ lý; thông báo lỗi tải tệp nay nói đúng nguyên nhân (thiếu tham số / thiếu quyền / không tìm thấy).',
      'Kết quả tra cứu dài không còn bị cắt giữa chừng thành dữ liệu hỏng, và nội dung tệp dài được ghi trọn ra đĩa để đọc tiếp.',
      'Tải tệp đính kèm không còn bị cắt ở 20 giây như mọi lời gọi API khác — tệp vài chục MB trên đường truyền chậm trước đây hỏng giữa chừng và hiện ra như lỗi mạng.',
    ],
  },
  {
    version: '1.0.282',
    date: '2026-09-07',
    items: [
      'Lark × Agents ĐỌC ĐƯỢC tệp đính kèm trong Bitable: Excel, Word, PowerPoint trả về nội dung ngay; ảnh và PDF được tải về rồi trợ lý tự mở xem. Trước đây nó chỉ đưa được link tải và bảo bạn tự tải về dán lại.',
      'Bảng tính đọc chính xác hơn: giữ đúng vị trí cột, số ra 0.357 thay vì 0.35699999999999998, ngày ra 21/08/2026 thay vì số sê-ri, và lấy đúng tên sheet.',
      'Sửa: trợ lý không còn tự nhận là “không mở được tệp đính kèm” khi thực ra nó mở được.',
    ],
  },
  {
    version: '1.0.281',
    date: '2026-09-03',
    items: [
      'Gõ “/” trong khung chat giờ LUÔN có gợi ý, kể cả khi bạn chưa tạo lệnh nào: 6 lệnh có sẵn — /tom-tat, /giai-thich, /viet-lai, /dich, /kiem-tra, /y-tuong — chọn xong là có sẵn câu lệnh, chỉ việc dán nội dung vào.',
      'Thêm hàng “Tạo lệnh mới…” ngay trong menu “/” để nhảy thẳng sang Skills mà đặt lệnh riêng.',
      'Menu chia rõ hai phần “Lệnh của bạn” và “Có sẵn”. Các lệnh có sẵn chạy được ngay trên bản app hiện tại (không cần cài lại).',
      'Sửa: gõ một dòng bắt đầu bằng “/” mà không khớp lệnh nào (vd “/help”) rồi Enter thì gửi tin nhắn bình thường, không còn bị nhảy màn hình.',
      'Sửa: bấm Esc để đóng gợi ý rồi gõ tiếp thì gợi ý không bật lại; di chuyển con trỏ ra khỏi lệnh thì gợi ý tự đóng.',
    ],
  },
  {
    version: '1.0.280',
    date: '2026-09-03',
    items: [
      'Skills có “lệnh gọi nhanh”: đặt lệnh cho skill (vd /sieu-ba) khi tạo hoặc sửa, rồi gõ “/” trong khung chat để chọn — có cả ở Trợ lý AI lẫn Lark, trên web và trên máy.',
      'Gọi skill bằng lệnh là chỉ định RÕ RÀNG: skill được áp dụng cho lượt đó kể cả khi đang tắt, và với mọi model (Claude/Grok/Gemini/Codex, CLI hay API trực tiếp).',
      'Sửa: skill chỉ gắn cho Grok / Gemini / Codex trước đây KHÔNG bao giờ được nạp (bộ lọc bị cố định vào Claude) — nay nạp đúng theo model đang chạy.',
      'Sửa: nhấn Enter khi đang chọn từ gợi ý bộ gõ tiếng Việt không còn vô tình gửi tin nhắn.',
      'Lưu ý: trên WEB dùng được ngay. Trên máy (app) phần “/lệnh” cần bản cài 1.0.280 — bản cũ vẫn chạy bình thường, chỉ là chưa thấy ô “Lệnh gọi nhanh”.',
    ],
  },
  {
    version: '1.0.279',
    date: '2026-09-03',
    items: [
      'Sửa lỗi banner “Cập nhật” cứ hiện mãi dù đã ở bản mới nhất — nay chỉ hiện khi thật sự có bản renderer mới hơn để tải lại.',
    ],
  },
  {
    version: '1.0.278',
    date: '2026-09-03',
    items: [
      'Thêm tab “Tự động hoá” ngay trong nhóm Lark ở sidebar (trước đây phải mở Cài đặt mới thấy) — quản lý các lịch tự chạy gọn gàng, gồm cả hành động “Chạy AI agent”.',
      'Nhắc: trong Lark × Agents chỉ cần nhắn “mỗi ngày 9h chạy PBTTCN / tự động đối chiếu hằng ngày…”, agent sẽ tự tạo lịch (cần bản 1.0.277 trở lên).',
    ],
  },
  {
    version: '1.0.277',
    date: '2026-09-03',
    items: [
      'LÊN LỊCH TỰ ĐỘNG cho Lark Agent NGAY TRONG HỘI THOẠI: chỉ cần nhắn kiểu “mỗi ngày 9h chạy PBTTCN / tự động đối chiếu hằng ngày…”, agent sẽ tự tạo lịch chạy (không cần vào Cài đặt tạo tay). Kèm nhắc chỗ tạo lịch thủ công: Lark × Agents → Cài đặt → Tự động hoá → hành động “Chạy AI agent”.',
    ],
  },
  {
    version: '1.0.276',
    date: '2026-09-03',
    items: [
      'TẠO ẢNH trong Trợ lý AI: gõ “tạo hình/ảnh…” → ra ẢNH AI thật (OpenAI). Mỗi khối HTML/SVG có nút “Tạo ảnh PNG” (render thành ảnh thật) + “Tải file mã”; khối code có nút “Tải”.',
      'XUẤT PDF cho Lark × Agents — lưu lại hội thoại/báo cáo thành file PDF.',
      'MỚI — Lịch tự chạy Lark Agent: Tự động hoá → hành động “Chạy AI agent” → chọn lịch để job (vd đối chiếu “PBTTCN”) tự chạy read-only + gửi báo cáo vào nhóm Lark / lưu hội thoại / thông báo. (Cần cài lại bản .dmg 1.0.276 để phần chạy nền hoạt động.)',
    ],
  },
  {
    version: '1.0.275',
    date: '2026-08-28',
    items: [
      'ĐA NGÔN NGỮ (tiếp): dịch màn Skills (Kỹ năng) — trước đây viết bằng tiếng Việt thô chưa bọc dịch nên bật EN vẫn ra tiếng Việt; nay dịch đầy đủ. Kèm màn Lark × Agents, phần render markdown và màn đăng nhập tài khoản (+360 chuỗi). Từ điển đã ~2.500 chuỗi.',
    ],
  },
  {
    version: '1.0.274',
    date: '2026-08-28',
    items: [
      'ĐA NGÔN NGỮ (tiếp): dịch nốt màn Trợ lý AI (khung chat, lịch sử, project, chia sẻ), trình soạn app và quản lý thiết bị — nhiều chữ trước đây đã bọc dịch nhưng THIẾU bản tiếng Anh nên vẫn hiện tiếng Việt; nay bật EN là ra tiếng Anh (+140 chuỗi).',
    ],
  },
  {
    version: '1.0.273',
    date: '2026-08-28',
    items: [
      'ĐA NGÔN NGỮ — dịch bổ sung ~340 chuỗi còn sót trên website: khi bật English, các trang (trang chủ, Apps, Hồ sơ, Bạn bè, Điều khiển từ xa, Tác vụ định kỳ, Dự án, Artifacts, trang giá, tải app…) hiển thị tiếng Anh đầy đủ hơn, không còn lẫn nhiều tiếng Việt.',
    ],
  },
  {
    version: '1.0.270',
    date: '2026-08-28',
    items: [
      'MỚI — Tác vụ định kỳ (web): để Trợ lý AI tự chạy theo lịch (hằng ngày / ngày thường / hằng tuần / mỗi giờ) rồi gửi kết quả về Thông báo. Có mẫu nhanh (tóm tắt ngày, tổng kết tuần, ý tưởng nội dung, theo dõi chủ đề), nút “Chạy ngay”, xem lại kết quả. (Vào mục “Tác vụ định kỳ” ở menu trái.)',
    ],
  },
  {
    version: '1.0.269',
    date: '2026-08-27',
    items: [
      'Skills (web) — màn “Tạo skill” theo đúng kiểu Claude: Tên + Mô tả (KHI NÀO dùng) + Hướng dẫn (LÀM GÌ) + ĐÍNH KÈM FILE ngay trong lúc tạo (mỗi file có mô tả riêng). Nút “Tải file lên” rời đã gộp vào đây.',
      'Skill đang BẬT được đưa thẳng vào Trợ lý AI (mô tả + hướng dẫn + nội dung file đính kèm) — hỏi đúng ngữ cảnh là AI áp dụng.',
    ],
  },
  {
    version: '1.0.268',
    date: '2026-08-27',
    items: [
      'Skills: khi CHƯA có kỹ năng, màn hình gọn & đẹp hơn — icon + chữ TO và căn GIỮA, bỏ các nút/hàng lọc trùng ở phía trên (hết cảnh “lắm nút dư”).',
      'Website: nền các trang thêm hiệu ứng lưới “caro” động chạy nhẹ nhàng (tự tắt nếu máy bật giảm chuyển động).',
    ],
  },
  {
    version: '1.0.266',
    date: '2026-08-27',
    items: [
      'QA tự động soi toàn site → sửa 19 lỗi giao diện/logic: bảng giá /pricing nay XEM ĐƯỢC khi chưa đăng nhập (trước bị đá về login); nền TỐI ở Hồ sơ hết cảnh chữ/số "tàng hình"; tăng tương phản nền tối cho mục menu đang chọn + tin nhắn/nhãn trong Trợ lý AI.',
      'Header trang chủ trên điện thoại gọn 1 hàng (Đăng nhập + Dùng thử) + thêm menu "⋯" chứa 4 mục phụ; nút đính kèm trong ô chat có nhãn cho trình đọc màn hình; hộp thoại xoá hội thoại hết lặp tiêu đề và ghi rõ nghĩa hơn.',
      'Tiêu đề trang hết lặp "· Larkwave · Larkwave"; trang Đăng ký có tiêu đề riêng; nút đăng nhập mạng xã hội ở trang Đăng ký ghi đúng "Đăng ký với…".',
      'Bổ sung dịch tiếng Anh cho trang Điều khiển từ xa, Bảng xếp hạng (định dạng số + tên cấp) và header trang chủ; app do AI tạo dùng TÊN GỌN cho tiêu đề thay vì cắt ngang câu mô tả.',
    ],
  },
  {
    version: '1.0.265',
    date: '2026-08-27',
    items: [
      'Trợ lý AI mở NHANH hơn: không còn màn hình chờ đứng hình khi máy chủ bận — khung chat hiện ngay, tự nâng cấp lên chế độ hosted khi sẵn sàng.',
      'Sửa lỗi hiển thị tràn của ô "Nhắn cho trợ lý…" trên điện thoại.',
    ],
  },
  {
    version: '1.0.264',
    date: '2026-08-27',
    items: [
      'TỐI ƯU RESPONSIVE toàn website: header trên điện thoại gọn hơn (gộp nút Ngôn ngữ/Sáng-Tối vào menu "⋯", tiêu đề tự cắt gọn); khung chat Trợ lý AI gọn gàng trên mobile (bớt lề, gợi ý 1 cột, Thư viện/Chia sẻ mở full màn hình); lưới thẻ + bảng tự co theo màn hình và cuộn ngang trong khung riêng nên KHÔNG tràn ngang trang.',
    ],
  },
  {
    version: '1.0.262',
    date: '2026-08-26',
    items: [
      'Thanh điều hướng bên trái nay MẶC ĐỊNH THU GỌN cho gọn màn hình — bấm nút để mở rộng khi cần; lựa chọn của bạn được ghi nhớ.',
    ],
  },
  {
    version: '1.0.261',
    date: '2026-08-26',
    items: [
      'GIỚI HẠN THIẾT BỊ: mỗi tài khoản đăng nhập tối đa 3 thiết bị (điện thoại + 2 máy tính). Đăng nhập thiết bị thứ 4 sẽ tự đăng xuất thiết bị cũ ít dùng nhất — tránh dùng chung tài khoản trên quá nhiều máy.',
      'Thêm mục "Thiết bị đăng nhập" trong Cài đặt: xem danh sách thiết bị + đăng xuất từng thiết bị.',
    ],
  },
  {
    version: '1.0.260',
    date: '2026-08-26',
    items: [
      'SỬA gốc rễ MẤT HÌNH VẼ/NỘI DUNG khi tải lại: câu trả lời sinh lâu (vẽ HTML/sơ đồ ~30s) trước đây KHÔNG được lưu — do hệ thống lưu nhầm quá sớm (lúc mới có câu hỏi) rồi bỏ qua phần trả lời. Nay chỉ lưu khi trả lời XONG → tải lại vẫn còn hình + nội dung.',
      'Thêm "Đang suy nghĩ…" (3 chấm nhấp nháy) trong lúc chờ AI — có phản hồi ngay, đỡ tưởng bị treo; kèm nút Dừng khi đang trả lời.',
      'Ô nhập chat sinh động hơn: nút Gửi bo tròn nền gradient thương hiệu + hiệu ứng hover.',
      'Chống mất dữ liệu khi hết dung lượng lưu cục bộ: tự dọn hội thoại cũ (vẫn còn trên máy chủ) để giữ hội thoại hiện tại.',
    ],
  },
  {
    version: '1.0.259',
    date: '2026-08-26',
    items: [
      'Phân vùng giao diện chat rõ ràng hơn (như ChatGPT/Claude): thanh LỊCH SỬ hội thoại nay có nền xám riêng, khung CHAT nền trắng — tách bạch nhau và tách khỏi thanh điều hướng; thêm lề cho danh sách hội thoại nên hết "dính" vào menu.',
    ],
  },
  {
    version: '1.0.258',
    date: '2026-08-26',
    items: [
      'SỬA: sau khi tải lại trang, menu con "Điều khiển từ xa" bị bung đè lên sidebar (do thanh nav tự thu gọn) — nay không còn.',
      'SỬA: nội dung chat bị lệch/dính sát trái — nay CĂN GIỮA đúng cột (768px) + có lề, thoáng như ChatGPT/Claude.',
      'SỬA MẤT DỮ LIỆU: tải lại trang khi câu trả lời đang gõ dở có thể mất tin nhắn — nay tự LƯU ngay khi rời/tải lại trang (pagehide).',
    ],
  },
  {
    version: '1.0.257',
    date: '2026-08-26',
    items: [
      'Trợ lý AI có hiệu ứng "gõ dần" (streaming): câu trả lời hiện DẦN như Claude — phần chữ gõ ra từ từ, còn sơ đồ/HTML hiện TRỌN VẸN (không nhấp nháy). Sẽ thành token-streaming thật khi máy chủ AI bật SSE.',
      'Giao diện chat gọn & giống ChatGPT/Claude hơn: thanh điều hướng TỰ THU GỌN khi vào Trợ lý AI (icon thu gọn/mở rộng rõ hơn); cột nội dung căn giữa + thoáng hơn (bớt "dính"); khoảng cách tin nhắn / đoạn văn / tiêu đề rộng rãi hơn.',
    ],
  },
  {
    version: '1.0.256',
    date: '2026-08-26',
    items: [
      'Trợ lý AI trả lời PHONG PHÚ như Claude: câu trả lời có thể VẼ SỐNG bằng HTML/SVG (biểu đồ, sơ đồ, mô hình, canvas, hoạt hoạ…) ngay trong khung xem cách ly an toàn — có nút Xem / Mã / Mở rộng toàn màn hình.',
      'Hỗ trợ sơ đồ Mermaid (luồng/tuần tự/lớp/gantt) và TÔ MÀU CÚ PHÁP cho các khối mã.',
      'Chuẩn bị sẵn cho chat "gõ dần" (streaming) — sẽ tự bật khi máy chủ AI hỗ trợ, không cần cập nhật thêm.',
    ],
  },
  {
    version: '1.0.255',
    date: '2026-08-25',
    items: [
      'Giao diện Trợ lý AI hiện đại & chuyên nghiệp hơn: ô nhập tin có viền sáng khi đang gõ, tiêu đề gọn kèm đường kẻ phân tách, bong bóng tin nhắn mềm mại hơn, khoảng cách giữa các tin thoáng hơn, nút "Cuộc trò chuyện mới" nổi bật hơn.',
      'Sửa căn khung chat (thừa khoảng trống ở đáy, ô nhập không chạm đáy) — khung chat nay lấp đầy đúng vùng hiển thị trên web.',
    ],
  },
  {
    version: '1.0.254',
    date: '2026-08-22',
    items: [
      'SỬA TIẾP gốc rễ của "AI quên giữa hội thoại": Claude lưu phiên theo THƯ MỤC LÀM VIỆC, mà trước đây lượt có ĐÍNH KÈM file lại chạy trong thư mục tạm riêng → phiên bị tách đôi, các lượt sau không còn nhớ nội dung lượt đính kèm. Nay mỗi hội thoại có một thư mục làm việc cố định, mọi lượt (kèm file hay không) đều nối đúng một phiên.',
      'Trợ lý AI (chat chung): trước đây MỖI LƯỢT chạy trong một thư mục tạm mới nên không bao giờ nhớ được lượt trước — nay đã nhớ xuyên suốt hội thoại như chat Lark.',
      'File đính kèm được giữ trong thư mục của hội thoại (trợ lý có thể xem lại file bạn gửi ở lượt trước), và bị xoá cùng khi bạn xoá hội thoại.',
      'MỚI — Trợ lý AI "hosted": máy KHÔNG cài Claude vẫn dùng được chat Trợ lý AI (chạy trên máy chủ Larkwave qua gói của bạn). Máy đã có Claude thì vẫn chạy nội bộ như cũ; hết hạn mức gói sẽ báo rõ.',
    ],
  },
  {
    version: '1.0.253',
    date: '2026-08-20',
    items: [
      'SỬA lỗi QUAN TRỌNG "AI quên/mất thông tin giữa hội thoại" (Lark × Agents): trước đây nếu phiên Claude trên máy không còn (khôi phục từ máy khác/cài lại app/CLI dọn phiên) hoặc sau khi đổi runner, hội thoại chạy lại TỪ ĐẦU dù màn hình vẫn hiển thị đủ lịch sử. Nay tự khôi phục ngữ cảnh từ lịch sử hội thoại.',
      'Trợ lý giờ NHỚ cả dữ liệu đã tra/ghi ở Lark trong các lượt trước (đưa cả thao tác tool vào ngữ cảnh), không chỉ nhớ lời thoại.',
      'Cửa sổ ngữ cảnh rộng hơn: dùng ngân sách token thay cho giới hạn cứng 14 tin/900 ký tự (hay bị rơi thông tin cũ ở hội thoại dài).',
      'Chat từ xa (web/điện thoại) và nhiều tab: mỗi lượt chạy ĐÚNG hội thoại đang mở (không chạy nhầm phiên đang active của máy).',
    ],
  },
  {
    version: '1.0.252',
    date: '2026-08-19',
    items: [
      'Lark × Agents: XOÁ cuộc trò chuyện giờ TỨC THÌ — bỏ khỏi danh sách + đóng hộp thoại ngay, việc xoá chạy nền (trước đây chờ round-trip nên hơi lâu).',
      'Giao diện chat gọn hơn: giảm padding/margin ở khung chat, tin của trợ lý dùng nhiều bề ngang hơn (bớt khoảng trống).',
    ],
  },
  {
    version: '1.0.251',
    date: '2026-08-19',
    items: [
      'SỬA lỗi hội thoại đang ở Base A bị chuyển sang "Chưa gắn base" sau khi nhắn: mỗi lượt chat giờ CHỈ lưu nội dung, KHÔNG đụng tới Base của hội thoại (giữ nguyên Base đã gắn). Việc thêm/bớt Base vẫn qua nút Base riêng như cũ.',
    ],
  },
  {
    version: '1.0.250',
    date: '2026-08-19',
    items: [
      'Lark × Agents: XOÁ hội thoại giờ có HỘP XÁC NHẬN (không xoá thẳng nữa) — kèm tên cuộc trò chuyện.',
      'Lark × Agents: thanh danh sách hội thoại (bên trái) nay có NỀN riêng (panel) tách khỏi khung chat (canvas) — dễ phân biệt khu vực hơn ở cả nền sáng lẫn tối; sửa cảm giác "phẳng, không có màu" trên web.',
    ],
  },
  {
    version: '1.0.249',
    date: '2026-08-19',
    items: [
      'SỬA lỗi NGHIÊM TRỌNG mất dữ liệu ở Lark × Agents trên WEB: khi mạng chậm/máy bận, việc tải một hội thoại (nhất là hội thoại dài) từ máy về web có thể bị lỗi rồi hiển thị RỖNG — chat tiếp lúc đó sẽ GHI ĐÈ, làm mất nội dung + mất Base của hội thoại. Nay nếu tải hội thoại thất bại, web GIỮ NGUYÊN màn hiện tại + báo lỗi và KHÔNG lưu đè; chỉ lưu khi đã tải/ tạo phiên hợp lệ. (Hội thoại cũ trên máy an toàn.)',
    ],
  },
  {
    version: '1.0.248',
    date: '2026-08-19',
    items: [
      'Giao diện Trợ lý AI + Lark × Agents trên WEB/ĐIỆN THOẠI giờ responsive gọn: trên màn hẹp/điện thoại, thanh lịch sử hội thoại tự thu thành NGĂN KÉO (bấm nút ☰ ở đầu thanh trên) → khung chat chiếm trọn bề ngang; bảng Ghi chú (Lark) cũng thành ngăn kéo. Trên máy tính (cửa sổ rộng) giữ nguyên bố cục 2–3 cột như cũ.',
    ],
  },
  {
    version: '1.0.247',
    date: '2026-08-19',
    items: [
      'SỬA lỗi chat Lark × Agents TỪ WEB làm hỏng/mất-vị-trí hội thoại trên máy: web và máy giờ dùng CHUNG một phiên — web tự mở đúng phiên ĐANG hoạt động của máy (không nhảy sang phiên mới nhất nữa); chạy xong một lượt bên web thì màn Lark trên máy tự cập nhật theo.',
      'Khi có lượt chạy TỪ XA (web/điện thoại) đang điều khiển máy: máy hiện rõ pill "Điều khiển từ xa · Lark × Agents · từ xa" và tạm khoá ô nhập trên máy để không gõ chồng lên nhau.',
    ],
  },
  {
    version: '1.0.246',
    date: '2026-08-19',
    items: [
      'SỬA lỗi đăng nhập lại Lark CMS TỪ XA (web/điện thoại): khi phiên Lark trên máy đã hết hạn (cần quét QR) mà bấm "đăng nhập lại" lại báo "thành công" nhưng KHÔNG hiện mã QR. Nay app kiểm tra phiên THẬT bằng một lệnh gọi API nội bộ — nếu phiên đã chết thì tự xoá phiên cũ + tải lại để Lark hiện trang đăng nhập (QR) cho bạn quét, không báo thành công giả nữa. (Gộp kèm 1.0.244/245.)',
    ],
  },
  {
    version: '1.0.244',
    date: '2026-08-19',
    items: [
      'MỚI — "Lark × Agents" ĐẦY ĐỦ trên web/điện thoại (Điều khiển từ xa → Lark × Agents): giờ giống hệt trên máy — chọn Base để làm việc, nhiều phiên chat có lịch sử, tự-động-duyệt, ghi chú… Mọi thao tác chạy trên máy tính của bạn qua kết nối Lark sẵn có. (Cần cài lại bản này trên máy để web điều khiển được Lark.)',
      'Trợ lý AI: thêm nút "Đồng bộ" + hiển thị "đã đồng bộ lúc …" ở thanh bên — bấm để đẩy/tải lịch sử hội thoại giữa máy tính và web ngay (trước đây đồng bộ ngầm nên không thấy).',
    ],
  },
  {
    version: '1.0.243',
    date: '2026-08-19',
    items: [
      'ĐỒNG BỘ lịch sử Trợ lý AI giữa máy tính ↔ web/điện thoại: các cuộc trò chuyện trên máy giờ tự hiện lên web (và ngược lại) khi đăng nhập cùng tài khoản. Đổi tên, ghim, xếp vào Project cũng đồng bộ 2 chiều; mở một hội thoại chưa có trên thiết bị này sẽ tự tải nội dung về.',
      'Lần đầu bật bản này, máy tính đẩy toàn bộ lịch sử hiện có lên máy chủ để web thấy — bạn không cần làm gì thêm. (Ảnh đính kèm không đồng bộ để giữ nhẹ; nội dung chữ vẫn đầy đủ.)',
    ],
  },
  {
    version: '1.0.242',
    date: '2026-08-19',
    items: [
      'MỚI — Trò chuyện từ xa trên web/điện thoại: vào "Điều khiển từ xa → Trò chuyện" để chat với Trợ lý AI HOẶC Lark ngay trên trình duyệt/điện thoại — câu trả lời chạy bằng Claude CLI trên MÁY TÍNH của bạn (máy phải mở app + đăng nhập cùng tài khoản). Trả lời hiện dần theo thời gian thực.',
      'Chế độ "Thực thi" (ghi Base) qua điện thoại: bật công tắc để cho AI tạo/sửa dữ liệu Lark — MỖI thao tác ghi hiện hộp xác nhận ngay trên màn chat để bạn Cho phép/Từ chối; AI hỏi thêm (chọn Base, thiếu thông tin…) cũng trả lời ngay tại đó.',
    ],
  },
  {
    version: '1.0.241',
    date: '2026-08-18',
    items: [
      'SỬA Skill không chạy trong chat Lark / Trợ lý AI: nay app CHÈN nội dung ĐẦY ĐỦ của các skill đang bật vào ngữ cảnh chat — gõ "chạy <tên skill>" là trợ lý làm theo đúng quy trình. (Claude CLI ở chế độ nền chỉ thấy TÊN skill chứ không thấy nội dung, nên trước đây trợ lý hỏi lại "là gì".) Nhớ bật chế độ "Thực thi" nếu skill cần ghi dữ liệu.',
      'Skill theo BASE: gắn NHÃN trùng ĐÚNG tên một Base → skill đó chỉ áp dụng khi Base đó đang mở trong hội thoại; nhãn khác (vd "Lark") thì áp dụng mọi nơi.',
    ],
  },
  {
    version: '1.0.239',
    date: '2026-08-18',
    items: [
      'SỬA "phiên Claude kết thúc với lỗi / Credit balance is too low" khi trong app có API key Anthropic đã HẾT credit hoặc không hợp lệ — key đó bị nhét đè lên đăng nhập Claude CLI (subscription) của bạn. Nay khi gặp lỗi credit/auth, app TỰ bỏ qua key trong app và chạy bằng đăng nhập Claude CLI của bạn (giữ nguyên hội thoại). Áp dụng cả Trợ lý AI lẫn Lark chat. (Cách thủ công: Cài đặt → xoá/tắt API key đã hết.)',
    ],
  },
  {
    version: '1.0.238',
    date: '2026-08-18',
    items: [
      'SỬA "phiên Claude kết thúc với lỗi" (hay gặp trên Mac Intel): mở rộng cách tìm `claude` — dò trực tiếp các thư mục nvm + vị trí cài native (~/.claude/local) + Intel homebrew (/usr/local/bin), không còn phụ thuộc hoàn toàn vào PATH của shell (dễ hỏng khi mở app từ Finder).',
    ],
  },
  {
    version: '1.0.237',
    date: '2026-08-18',
    items: [
      'HỖ TRỢ MÁY MAC INTEL: bản cài macOS nay là UNIVERSAL (chạy cả Apple Silicon lẫn Intel) — sửa lỗi "chưa có link cài cho hệ điều hành" trên máy Mac Intel. (Kèm cả bản vá "Credit balance is too low" 1.0.236.)',
    ],
  },
  {
    version: '1.0.236',
    date: '2026-08-18',
    items: [
      'SỬA "Credit balance is too low": khi bật "API trực tiếp" mà key HẾT credit nhưng Claude CLI vẫn đăng nhập đầy đủ, app TỰ CHUYỂN sang CLI/subscription (giữ nguyên hội thoại) thay vì báo lỗi ở mọi câu chat. Fallback nay 2 CHIỀU (CLI↔API) và nhớ trong phiên để không thử lại key đã hết mỗi lượt.',
    ],
  },
  {
    version: '1.0.235',
    date: '2026-08-17',
    items: [
      'MỚI: Chia sẻ "Trợ lý AI" cho bạn bè — bấm "Chia sẻ" ở khung Trợ lý AI, chọn một người bạn. Họ hỏi–đáp qua trợ lý chạy trên MÁY BẠN, ở chế độ CHỈ ĐỌC an toàn (chỉ hỏi–đáp + tra cứu web; KHÔNG đọc tệp, KHÔNG chạy lệnh trên máy bạn). Không chia sẻ mật khẩu/khoá; thu hồi từng người một, có nhật ký.',
      'Bạn bè được chia sẻ chọn ngay trong khung chat: menu "Trợ lý của tôi / Trợ lý của <người chia sẻ>" — giao diện chat giống hệt, câu hỏi chạy trên máy người chia sẻ (cần máy họ đang mở).',
      'Sửa: các lượt được chia sẻ (Lark & Trợ lý AI) nay chạy kể cả khi bạn KHÔNG mở panel chia sẻ (cổng uỷ quyền chạy nền toàn app).',
      'BẢO MẬT: siết chặt mọi lượt do bạn bè chạy trên máy bạn — luôn ở môi trường an toàn (chỉ hỏi–đáp + tìm kiếm web; KHÔNG đọc tệp/dữ liệu riêng, KHÔNG chạy lệnh, KHÔNG tải địa chỉ nội bộ), kể cả khi bạn đang dùng CLI khác (Codex/Grok/Gemini) hay có cài MCP riêng.',
      'SỬA lỗi Trợ lý AI báo "--resume requires a valid session ID": nay tạo phiên bằng UUID chuẩn (hội thoại cũ tự chuyển đổi) — trả lời & nối tiếp hội thoại bình thường.',
      'Giao diện Trợ lý AI làm mới giống ChatGPT/Claude: màn chào + thẻ gợi ý câu hỏi, tin nhắn gọn gàng hơn; mục "Trợ lý AI" trên menu được làm nổi bật (nhãn MỚI + màu thương hiệu).',
      'Trợ lý AI: thêm LỊCH SỬ HỘI THOẠI ở cột trái như ChatGPT — nhiều cuộc trò chuyện được tự lưu (đổi tên/xoá, nhóm theo ngày), màn chào + ô nhập ở giữa khi bắt đầu.',
      'Mặc định giao diện SÁNG (light mode) — vẫn có thể đổi sang tối bằng nút chuyển chủ đề.',
      'SỬA: màn "Đang tải tài khoản" (và trang đăng nhập) khi mở lại app bị hiện SÁNG dù đang ở chế độ TỐI — nay bám đúng theme ngay từ khung hình đầu.',
      'Trợ lý AI có đủ thanh bên như ChatGPT: TÌM KIẾM hội thoại, PROJECTS (thư mục nhóm hội thoại: tạo/đổi tên/xoá, kéo hội thoại vào), GHIM hội thoại lên đầu, và THƯ VIỆN tệp đã tải lên (xem lại · dùng lại · tải xuống · xoá ảnh/file).',
      'Trợ lý AI gọn & chuyên nghiệp hơn: đổi icon (bỏ icon "thí nghiệm" → biểu tượng hội thoại), nhãn "Đa năng" thay cho "Mới"; Thư viện tệp làm lại như ChatGPT — tìm theo tên tệp, lưới thẻ đẹp hơn.',
      'Thư viện tệp: BẤM ẢNH để xem lớn dạng gallery (phóng to, xoay, chuyển ảnh trước/sau); chia LOẠI chi tiết — Ảnh · Tài liệu · Bảng tính · Trình chiếu · PDF (chỉ hiện loại đang có), mỗi loại có icon + màu riêng.',
      'Trả lời của Trợ lý AI có thao tác như ChatGPT: khối mã có nhãn ngôn ngữ + nút "Sao chép"; dưới mỗi câu trả lời có nút Sao chép & Tạo lại (chạy lại câu hỏi). (Khối mã áp dụng cho cả chat Lark.)',
      'Chia sẻ Trợ lý AI: người được cấp dùng ĐẦY ĐỦ bằng TÀI KHOẢN CLAUDE CỦA NGƯỜI CHIA SẺ — không tốn phí, không cần máy họ bật; chế độ an toàn (hỏi–đáp + tra web). Có thể dựng "máy chủ Trợ lý AI" (tw-agent-host) chạy 24/7 trên VM để phục vụ liên tục không cần bật máy cá nhân.',
    ],
  },
  {
    version: '1.0.234',
    date: '2026-08-17',
    items: [
      'SỬA "Trợ lý AI" không trả lời / không streaming: do dùng sai cờ CLI (--tools) làm hỏng tiến trình Claude. Nay chạy đúng như Claude CLI (đầy đủ công cụ read/write/bash/web + đọc được ảnh/file), trả lời & streaming bình thường.',
      'Trợ lý AI: thêm nút CHỌN MODEL / runner ngay trên đầu chat (đổi giữa các model / CLI).',
    ],
  },
  {
    version: '1.0.233',
    date: '2026-08-17',
    items: [
      'MỚI — "Trợ lý AI" (Agents chat): trợ lý AI đa năng như ChatGPT/Claude ngay trong app — hỏi-đáp, phân tích, viết lách & lập trình, và GỬI ẢNH/FILE để mình đọc-phân tích. Chạy bằng Claude CLI với đầy đủ công cụ (đọc/ghi/chạy lệnh/tìm web) trong một không gian làm việc riêng, tạm thời. Giao diện chat quen thuộc; hội thoại được giữ theo phiên (mỗi tài khoản một cuộc, "Cuộc mới" để bắt đầu lại).',
      '(Lưu ý: đây là bản đầu — hãy thử cả Trợ lý AI mới lẫn Lark × Agents cũ; nếu chat Lark có gì lạ báo mình sửa ngay.)',
    ],
  },
  {
    version: '1.0.232',
    date: '2026-08-16',
    items: [
      'Lark × Agents — TỰ KHÔI PHỤC khi hết credit: nếu đang chạy bằng CLI mà báo "Credit balance too low", app tự chạy lại lượt đó bằng API trực tiếp (nếu bạn đã cấu hình API key), GIỮ NGUYÊN hội thoại — không phải làm lại. Nếu chưa có key dự phòng thì hiện thông báo rõ như cũ (không bao giờ tệ hơn trước).',
    ],
  },
  {
    version: '1.0.231',
    date: '2026-08-16',
    items: [
      'Lark × Agents: lỗi runner giờ hiện rõ ràng + hướng xử lý (hết credit → nạp/đăng nhập thuê bao/đổi key; hết context → gửi tiếp để Claude tự tóm tắt; quá tải/giới hạn/xác thực có hướng dẫn riêng) — và luôn TRẤN AN "hội thoại vẫn được giữ": chat theo phiên, xử lý xong gửi lại là chạy tiếp, không mất hội thoại.',
    ],
  },
  {
    version: '1.0.230',
    date: '2026-08-16',
    items: [
      'Tổng quan — cân đối lại 2 khối cuối trang "Bảng xếp hạng" + "Người dùng": nay cao BẰNG NHAU, đáy thẳng hàng (trước lệch nhau trông xấu).',
    ],
  },
  {
    version: '1.0.229',
    date: '2026-08-16',
    items: [
      'SỬA lỗi sửa nội dung skill bị NHÂN ĐÔI tiêu đề: trước đây mỗi lần lưu lại thêm một dòng "# tên skill" + làm hỏng phần mô tả. Nay ô "Nội dung hướng dẫn" chỉ hiện đúng phần hướng dẫn (không lẫn tiêu đề) và lưu không nhân đôi. (Bản .dmg này thay cho 1.0.225.)',
    ],
  },
  {
    version: '1.0.228',
    date: '2026-08-16',
    items: [
      'HIỆN LẠI thông báo tải bản mới trên mọi trang (kể cả Tổng quan): khi có bản .dmg mới hơn phần LÕI đang cài, banner "Đã có bản cài mới (vX)" xuất hiện kèm nút "Tải & mở bộ cài" (app tự tải + mở sẵn bộ cài) — không bắt buộc, ẩn được. Trước đây banner chỉ hiện khi BẮT BUỘC cài lại (minMain), nên các bản cập nhật lõi không-bắt-buộc bị mất thông báo.',
    ],
  },
  {
    version: '1.0.227',
    date: '2026-08-16',
    items: [
      'Kỹ năng: khi chưa cài bản LÕI mới, hộp Sửa skill nay nói rõ "số phiên bản là bản GIAO DIỆN, phần LÕI phải tải & cài lại .dmg" + nút "Tải bản mới (.dmg)" mở thẳng trang tải (trước ghi nhầm "⌘Q rồi mở lại" nên gây hiểu lầm).',
    ],
  },
  {
    version: '1.0.226',
    date: '2026-08-16',
    items: [
      'SỬA "Kỹ năng" kẹt ở "Đang tải nội dung…": app nhận đúng khả năng của bản đang cài — máy CHƯA cập nhật .dmg sẽ hiện ghi chú "cập nhật app" (không quay mãi); máy đã cài 1.0.225 sửa nội dung skill bình thường.',
    ],
  },
  {
    version: '1.0.225',
    date: '2026-08-16',
    items: [
      'Kỹ năng: giờ SỬA ĐƯỢC nội dung skill trực tiếp — bấm vào skill để chỉnh Tên + Nội dung hướng dẫn + Model + Nhãn ngay trong hộp thoại (trước nội dung bị ẩn, không sửa được).',
      'Kỹ năng: sửa lỗi NHÃN khi tạo skill không lưu (bản cũ bỏ qua nhãn/scope do phần lõi chưa nhận). Bản này lưu đúng nhãn + model khi tạo.',
      '(Hai mục trên cần bản .dmg mới — hãy tải & cài lại app.)',
    ],
  },
  {
    version: '1.0.224',
    date: '2026-08-16',
    items: [
      'Khi có job lỗi session: panel nêu rõ cách sửa — bấm "Làm mới session" (bơm phiên mới, tự bật lại job hết phiên); nút này thành nút CHÍNH khi đang có lỗi. Nếu làm mới vẫn lỗi → là lỗi cần sửa tay (mất quyền Base / bảng-cột đã đổi), không phải do phiên.',
    ],
  },
  {
    version: '1.0.223',
    date: '2026-08-16',
    items: [
      'SỬA GẤP: trang Kỹ năng bị lỗi trắng "Cannot read properties of undefined (reading \'bridge\')" — do bản 1.0.222 gọi listSkills tách rời khỏi runtime (mất ngữ cảnh this). Đã gọi đúng lại, trang Kỹ năng hoạt động bình thường.',
    ],
  },
  {
    version: '1.0.222',
    date: '2026-08-16',
    items: [
      'SỬA "Cài đặt": nút "Làm mới" khoá API trước đây tải lại CẢ cửa sổ (làm mất tab app + tiến trình dựng đang chạy) — nay chỉ làm mới đúng ô khoá.',
      'SỬA "Hồ sơ": lời mời kết bạn giờ CHẤP NHẬN/TỪ CHỐI được ngay trong trang (trước không có chỗ nào nhận lời mời); gộp các ô số liệu về một kiểu; thêm hoạt động & thành tích.',
      'SỬA "Gói": các thẻ gói cao bằng nhau, nút ghi đúng "Nâng cấp/Chuyển xuống/Gói hiện tại" (trước luôn ghi "Nâng cấp" kể cả khi hạ gói); hiện rõ ngân sách token mỗi gói.',
      '"Kỹ năng": thẻ đều nhau + bấm để sửa trong hộp thoại; màu sắc theo đúng bộ nhấn (an toàn cho chế độ tối).',
    ],
  },
  {
    version: '1.0.221',
    date: '2026-08-15',
    items: [
      'Trang "Báo lỗi của tôi" giờ CÓ nút "Báo lỗi mới" (trước đây chỉ báo lỗi được qua nút nổi ở góc) — bấm là gửi ngay, danh sách tự tải lại; bảng trống cũng có nút "Gửi báo lỗi đầu tiên".',
    ],
  },
  {
    version: '1.0.220',
    date: '2026-08-15',
    items: [
      'Giữ cách chạy TUẦN TỰ (AI một phiên/lần) — an toàn hơn cho giới hạn API + tài nguyên máy; nếu muốn chạy song song thật (bounded) thì cần bản .dmg riêng.',
    ],
  },
  {
    version: '1.0.218',
    date: '2026-08-15',
    items: [
      'Đồng bộ Bitable (CMS) — MINH BẠCH phiên đăng nhập Lark trên VM: thêm bảng "Phiên đăng nhập Lark trên VM" cho thấy trạng thái máy VM (đang giữ phiên / hết phiên + QR đăng nhập lại), NHÓM job theo host/tài khoản nguồn, và mục "Cách hoạt động" giải thích luồng bơm session.',
      'Nhiều tài khoản Lark: khi các job thuộc >1 host/tài khoản, hiện cảnh báo MINH BẠCH — hiện hệ thống chỉ giữ 1 phiên (1 tài khoản), chỉ job của tài khoản đang đăng nhập đồng bộ được, các tài khoản khác báo lỗi session cho tới khi đăng nhập đúng tài khoản. (Đa-tài-khoản song song — mỗi tài khoản 1 phiên riêng trên VM — đang được phát triển.)',
    ],
  },
  {
    version: '1.0.215',
    date: '2026-08-15',
    items: [
      'Trang Tổng quan giờ dùng FULL chiều ngang (không còn co hẹp giữa trang).',
      'SỬA "Cần xử lý": mục app đang lỗi giờ bấm "Xem" là BUNG RA CÁC CARD APP lỗi (không còn tự nhảy vào hội thoại của 1 app) — mỗi card mở đúng app đó để bạn xem lỗi và nhờ AI sửa nhanh.',
    ],
  },
  {
    version: '1.0.214',
    date: '2026-08-15',
    items: [
      'TỔNG QUAN THÀNH TRUNG TÂM TỔNG HỢP THẬT SỰ (không còn rời rạc): hero gradient có dải chỉ số + ĐỒNG HỒ NGÂN SÁCH TOKEN (gói · % đã dùng · làm mới) — trước đây phải vào tận Hồ sơ & Gói mới thấy.',
      'Băng "CẦN XỬ LÝ" gom mọi việc cần làm từ khắp app vào một chỗ: app đang lỗi, job CMS lỗi, máy VM ngoại tuyến, Lark rớt kết nối, thưởng báo lỗi chờ chi, lời mời kết bạn — bấm là nhảy thẳng tới nơi xử lý.',
      'Nút làm mới trên hero + mọi thẻ đều liên kết chéo sang màn tương ứng — app giờ liền mạch, kết nối với nhau.',
    ],
  },
  {
    version: '1.0.210',
    date: '2026-08-15',
    items: [
      'SỬA "NHẬP TỪ THƯ MỤC" (chẩn đoán tận gốc): thêm nhật ký chi tiết (liệt kê mọi cửa sổ + cửa sổ nào được chọn để gắn hộp chọn) và surface lỗi thật ngay lập tức thay vì để nút quay hoài. Hộp chọn bám đúng cửa sổ chính + đưa app lên trước (giống "Đổi vị trí lưu" vốn chạy tốt). (Cần cài bản .dmg này để có hiệu lực.)',
    ],
  },
  {
    version: '1.0.209',
    date: '2026-08-15',
    items: [
      'SỬA MÀN TRẮNG DARK MODE ở "Phiên bản & thay đổi": bảng thông tin trước đây dùng màu sáng cứng nên tối màn — nay dùng token theo theme, hiển thị đúng ở cả sáng/tối.',
      'Nút "Báo lỗi" chuyển lên thanh trên cùng (cạnh nút sáng/tối) thay cho nút nổi góc phải.',
      'Hồ sơ & Gói gộp thành MỘT trang: thêm mục "Bạn bè của tôi", gộp gói thanh toán, lịch sử thanh toán mở bằng popup.',
      'Trang Cài đặt bố cục lưới toàn chiều rộng (2 cột xen kẽ) cho gọn, chuyên nghiệp.',
    ],
  },
  {
    version: '1.0.208',
    date: '2026-08-14',
    items: [
      'ĐỒNG BỘ BITABLE CHẠY 24/7 KHÔNG CẦN MỞ APP: thêm "máy VM giữ phiên" (tw-cms-keeper) — một dịch vụ nhỏ chạy trên VM Linux giữ phiên Lark web sống + bơm session cho các job CMS mỗi 30 phút, để đồng bộ vẫn chạy khi bạn tắt app/máy. Màn "Đồng bộ Bitable (CMS)" giờ có thẻ "Máy VM giữ phiên" hiển thị Đang chạy/Ngoại tuyến + Đã đăng nhập/Phiên hết hạn + lần đẩy session gần nhất — check nhanh khỏi cần SSH.',
      'BÁO LỖI KÈM LINK QUÉT QR ĐĂNG NHẬP LẠI: khi phiên Lark của VM hết hạn, card báo lỗi (webhook/nhóm Lark) nay kèm nút "📲 Quét QR đăng nhập lại" mở trang QR SỐNG (tự làm mới) — quét bằng điện thoại là VM đăng nhập lại ngay, không cần SSH/VNC. Thẻ trong app cũng có nút tương tự.',
      'Webhook báo lỗi chuẩn hơn: BỎ QUA lỗi mạng tạm thời (EAI_AGAIN/timeout…) — không còn báo nhầm và không tính vào ngưỡng tự-tắt job; chỉ báo khi thật sự hết session (≥3 lần liên tiếp) hoặc job bị tự-tắt, và báo 1 lần/đợt.',
    ],
  },
  {
    version: '1.0.204',
    date: '2026-08-11',
    items: [
      'THEO DÕI TIẾN TRÌNH RÕ THỜI GIAN THỰC: thanh dựng giờ hiện ĐANG LÀM GÌ (⏳ "Ghi src/App.tsx", "Chạy npm…", "Đọc lib/…") + đếm "N tệp · M thao tác", thay vì chỉ "🔧 Write" chung chung nhìn như treo. (Phần hiển thị này về ngay qua cập nhật; các bước tự-hoàn-thiện cần bản .dmg 1.0.204.)',
    ],
  },
  {
    version: '1.0.203',
    date: '2026-08-11',
    items: [
      'Điều khiển từ xa (web app.toolswave.net/remote/lark): thêm phần "Đồng bộ Bitable (CMS)" — liệt kê các job đồng bộ + chọn nhiều job (hoặc "Chạy tất cả") rồi bấm CHẠY ngay từ điện thoại/web. Lệnh đi QUA MÁY TÍNH ĐANG BẬT (dùng phiên Lark sống trên máy — Approach B), có tiến độ "Đang chạy X/N: tên job" và tổng kết OK/lỗi từng job. Cần máy đang mở app + đăng nhập cùng tài khoản + bật "Điều khiển từ xa". (Bản .dmg này bổ sung bộ nhận lệnh cmsSyncRun ở máy; danh sách job lấy từ máy chủ CMS.)',
    ],
  },
  {
    version: '1.0.202',
    date: '2026-08-11',
    items: [
      'Đồng bộ Bitable (CMS): thêm CHẠY TEST HÀNG LOẠT — nút "Chạy test tất cả" (chạy mọi job đang hiển thị theo bộ lọc/tìm kiếm), và nút "Chạy test" cho các job ĐÃ CHỌN (tick nhiều dòng). Chạy LẦN LƯỢT từng job (không song song, vì đồng bộ connector dùng chung một cửa sổ Lark), có thanh tiến độ "Đang chạy X/N: tên job", và tổng kết "N OK, M lỗi" kèm chi tiết phản hồi Lark từng job ở khung bên dưới. Bảng lớn báo "đang đồng bộ" (bận) không tính là lỗi.',
    ],
  },
  {
    version: '1.0.198',
    date: '2026-08-11',
    items: [
      'Đồng bộ Bitable (CMS): màn hình giờ TỰ LÀM MỚI trạng thái mỗi 30 giây (tạm dừng khi bạn chuyển tab) — không cần bấm tải lại để thấy job "đang đồng bộ" tự chuyển sang xanh khi bảng lớn chạy xong.',
      'Job bảng lớn đang chạy hiện đồng hồ "⏳ đang đồng bộ ~N phút" để bạn biết nó đang tiến hành (không phải treo). Lark không cấp %/thời gian còn lại nên đây là thời gian đã trôi, đếm từ lúc app thấy nó bận.',
    ],
  },
  {
    version: '1.0.197',
    date: '2026-08-11',
    items: [
      'Đồng bộ Bitable (CMS) — SỬA hiển thị gây hiểu nhầm "job lỗi": khi bảng có nhiều bản ghi, Lark cần thời gian dài để đồng bộ; lần kích hoạt kế tiếp gặp "still syncing" (bảng đang chạy dở) nên bị BỎ QUA — đây KHÔNG phải lỗi, dữ liệu vẫn đang được đồng bộ. Trước đây app hiện dòng đỏ "lỗi: … skipped (still syncing)" và "-1" khiến tưởng là hỏng. Nay hiện đúng: nhãn xanh "đang đồng bộ" + "⏳ N đang đồng bộ — bảng lớn, chạy lâu, sẽ tự xong", và ▶ số bảng đã kích hoạt (không còn nhầm là số bản ghi/xoá). Trigger là bất đồng bộ (bắn xong trả ngay), không có "timeout ép sync"; bảng bận thì Lark tự từ chối trigger mới và sẽ chạy tiếp khi xong.',
    ],
  },
  {
    version: '1.0.196',
    date: '2026-08-11',
    items: [
      'Tinh chỉnh tính năng tự hồi sinh job (1.0.195): chỉ bật lại job bị tắt do HẾT SESSION (mã 99991668/99991663 — "Token đã hết hạn"). KHÔNG bật lại job bị tắt vì lỗi cần sửa tay (base/bảng đã xoá "AppTokenNotFound", thiếu quyền, sai field…) — trước đây từ "token" trong "AppTokenNotFound" dễ bị nhận nhầm là hết session. Đã đối chiếu trực tiếp với logic máy chủ CMS để nhận diện đúng.',
    ],
  },
  {
    version: '1.0.195',
    date: '2026-08-11',
    items: [
      'SỬA "đồng bộ tự động không gọi lại" (Đồng bộ Bitable/CMS): nguyên nhân thật — khi máy tắt/đóng app lâu, session Lark hết hạn → máy chủ TỰ TẮT job (enabled=false), và cơ chế làm mới cũ chỉ bơm cookie mới mà KHÔNG bật lại job → job nằm im vĩnh viễn nên lịch 5 phút/lần không chạy nữa. Đã kiểm tra trực tiếp: bộ lập lịch phía máy chủ vẫn chạy đúng 5 phút/lần khi job còn bật — vấn đề là job bị tắt mà không ai bật lại.',
      'Cách sửa: app giờ TỰ HỒI SINH job — mỗi 30 phút và NGAY khi mở app, nó bơm session mới + TỰ BẬT LẠI những job bị máy chủ tắt do hết session (nhận diện theo lỗi session/hết hạn; job bạn tự tắt tay KHÔNG bị đụng). Trước đây làm mới 6 tiếng/lần và không bật lại — nên job chết cả buổi. Nút "Làm mới session (tất cả)" và lúc đăng nhập lại giờ cũng báo "đã bật lại N job".',
      'Lưu ý: ngoài khung giờ 06:00–22:00 (giờ VN) lịch tự dừng theo cấu hình của từng job — muốn chạy 24/7 thì chỉnh "khung giờ" hoặc bật "bỏ qua lịch" trong job.',
    ],
  },
  {
    version: '1.0.194',
    date: '2026-08-11',
    items: [
      'Sửa: "Đăng nhập lại Lark web" (Đồng bộ Bitable/CMS) trước đây hiện MÀN TỐI ĐEN — cửa sổ đăng nhập bật lên trước khi trang Lark kịp vẽ khung đầu tiên (nhất là chế độ tối trên macOS) nên thành khung đen. Nay cửa sổ nền TRẮNG và chỉ hiện sau khi đã vẽ xong (kèm hẹn giờ dự phòng để trang chậm vẫn hiện ra) — không còn màn đen.',
    ],
  },
  {
    version: '1.0.192',
    date: '2026-08-11',
    items: [
      'Sửa lỗi kẹt khóa AI: sau khi tải lại app mà một lượt AI cũ vẫn đang chạy cho CHÍNH app đó, trước đây không hiện gì và không gửi/không sửa được. Nay hiện banner + nút "Mở khoá nếu treo" ngay ở khung chat để thoát ngay (một lượt CLI vẫn chạy tuần tự — nhưng bạn luôn có nút thoát khi bị treo).',
    ],
  },
  {
    version: '1.0.191',
    date: '2026-08-11',
    items: [
      'Quản trị → Người dùng: KÍCH HOẠT GÓI trực tiếp cho một người dùng — chọn gói (Miễn phí / Khởi đầu / Chuyên nghiệp / Doanh nghiệp), số tháng của chu kỳ hạn mức và tuỳ chọn đặt hạn mức đã dùng về 0. Thêm cột "Gói" để thấy ngay ai đang ở gói nào; mỗi lần cấp đều được ghi nhật ký quản trị.',
    ],
  },
  {
    version: '1.0.189',
    date: '2026-08-10',
    items: [
      '(3) THÊM tab "API" (kiểu Swagger): liệt kê endpoint của backend, chọn method + path + body, Gửi và xem response (status/thời gian/JSON). Gọi qua tiến trình chính nên không vướng CORS, tới đúng cổng api.',
      'Sửa gốc: chuỗi services (home/cms/api + URL) trước đây bị RỚT ở tầng IPC nên panel Cổng/định tuyến theo service chưa chạy — nay truyền xuyên suốt.',
    ],
  },
  {
    version: '1.0.187',
    date: '2026-08-10',
    items: [
      'Sửa app (Xem trước cục bộ) — nâng cấp lớn: (1) THÊM THANH ĐỊA CHỈ hiển thị đúng URL trang đang xem + nút copy. (2) "Các trang / API" nay CHẠY ĐÚNG: mỗi route mở đúng service của nó — trước đây mọi route nối vào cổng của "home" nên /api/* và /admin (chạy cổng khác) bị 404. (3) THÊM nút "Cổng" liệt kê cổng từng dịch vụ (home/cms/api) — copy + mở ngoài; backend đã trả sẵn nhưng UI trước đây vứt đi.',
      'Tab "Prompt" giờ hiện PROMPT ĐÃ GỬI gần nhất (đọc .toolswave/last-prompt-audit.txt) thay vì chỉ ô trống khó hiểu — gõ yêu cầu mới ở chat thì xem prompt của lần tới.',
    ],
  },
  {
    version: '1.0.186',
    date: '2026-08-10',
    items: [
      'Đồng bộ Bitable (CMS): thêm CẤU HÌNH HÀNG LOẠT. Chọn nhiều job → bấm "Cấu hình" → áp dụng cùng lúc cho tất cả: Tần suất (giây), Lịch tự động (24/7 hoặc giờ + ngày), và Báo lỗi Lark (bật/nhóm/webhook). Mỗi mục có ô TICK "áp dụng" riêng — chỉ mục tick mới ghi đè, mục không tick giữ nguyên (không lo clobber cấu hình cũ).',
      'Vẫn cảnh báo rõ: job CMS dùng chung máy chủ, thay đổi áp dụng cho mọi tài khoản thấy màn này.',
    ],
  },
  {
    version: '1.0.185',
    date: '2026-08-10',
    items: [
      'Đồng bộ Bitable (CMS): thêm CHỌN NHIỀU + BẬT/TẮT HÀNG LOẠT. Tick chọn từng job (hoặc header để chọn tất cả/đảo/bỏ), rồi bấm "Bật"/"Tắt" cho các job đã chọn — dùng lệnh đặt trạng thái chính xác (không phải đảo), chạy tuần tự + báo số thành công/lỗi.',
      'CẢNH BÁO khi bật/tắt hàng loạt: các job CMS nằm CHUNG một máy chủ, KHÔNG tách theo tài khoản — thao tác áp dụng cho MỌI tài khoản thấy màn này (vd deveris.vu + phuongdang…) và bật/dừng lịch chạy nền trên server cho tất cả. Có hộp xác nhận nói rõ điều này trước khi chạy.',
    ],
  },
  {
    version: '1.0.184',
    date: '2026-08-10',
    items: [
      '`lark_app_inspect` giờ SOI XUYÊN IFRAME: nhiều "Lark App" thực ra là Lark Docs có khối Bitable/Base NHÚNG (các tab như "Dữ Liệu Vận Đơn" nằm TRONG khối nhúng, ở iframe khác origin mà trước đây tool không đọc/không click vào được). Nay dùng WebFrameMain (main-process chạy JS được trong MỌI frame, kể cả cross-origin) để đọc control + click tab + bắt lỗi theo từng frame. Kết quả trả thêm `frames[]` (từng frame + trạng thái) và mỗi control gắn `frame` để biết nằm ở khối nhúng nào.',
      'Nhận diện lỗi khối nhúng: console "Record error" / "getChartId error" (chart bị xoá hoặc mất quyền) giờ được phân loại là `status:error` — đúng nguyên nhân khối dữ liệu không hiển thị dù không có banner/HTTP lỗi.',
    ],
  },
  {
    version: '1.0.182',
    date: '2026-08-10',
    items: [
      'MỚI (thử nghiệm) — SOI LỖI LOADING + CHỨC NĂNG của một "Lark App" (aPaaS "Ứng dụng" low-code, link dạng https://…/app/<id>?pageId=…). Open API không đọc được trang app này; giờ có tool `lark_app_inspect`: mở link trong cửa sổ Lark (cần đã Kết nối Lark web) → chờ tải → trả về `status` (ok/empty/stuck/error/nav-failed), chữ lỗi banner người dùng thấy, request lỗi (4xx/5xx hoặc Lark soft-error code≠0 + msg → nguyên nhân gốc như thiếu quyền/thiếu field/table), console errors, và danh sách control đã render.',
      'Cách dùng: đã "Kết nối Lark web" → nhờ trợ lý "kiểm tra app này: <dán URL /app/ đầy đủ>". Chỉ ĐỌC (không bấm gì); kết quả `permission/无权限` là app thật sự hỏng với tài khoản đó.',
    ],
  },
  {
    version: '1.0.181',
    date: '2026-08-10',
    items: [
      'MỚI (thử nghiệm) — Trợ lý TỰ LÁI giao diện Lark để tạo Automation: thay vì bạn thao tác tay, trợ lý tự ĐỌC giao diện Lark sống (lark_ui_snapshot) rồi tự BẤM/ĐIỀN/CHỌN (lark_ui_act/lark_ui_wait) để dựng automation NGAY TRONG panel "Tự động hoá" của Lark → chính Lark sinh schema hợp lệ, không còn 800004006. Cần đã "Kết nối Lark web".',
      'Bản "học → tạo lại" (record→replay, 1.0.180) vẫn giữ làm phương án dự phòng cho các ca kéo-thả/giá trị hằng/iframe khác origin.',
    ],
  },
  {
    version: '1.0.180',
    date: '2026-08-09',
    items: [
      'MỚI — Tạo workflow bằng cách ĐIỀU KHIỂN Lark (Cài đặt → Lark × Agents → "Kết nối Lark web"). Vì schema workflow của Lark là API nội bộ, không tài liệu (nguồn gốc lỗi 800004006), app KHÔNG đoán nữa mà HỌC từ chính Lark: ① bấm "Mở Lark & bắt đầu học" rồi tạo tay 1 workflow trong cửa sổ Lark → ② "Lưu bản ghi" (app bắt ĐÚNG gói request hợp lệ Lark gửi) → ③ "Tạo lại" tạo workflow THẬT bằng chính gói đó → hợp lệ 100%, hết 800004006.',
      'Bản ghi còn lưu lại các thao tác UI + có nút "Sao chép JSON" — nền để dựng bộ điều khiển tạo workflow tuỳ ý theo từng bước ở bản sau.',
      'Thông báo lỗi 800004006 giờ chỉ thẳng sang luồng "học từ Lark → tạo lại" này thay vì bảo tự đoán khuôn.',
    ],
  },
  {
    version: '1.0.179',
    date: '2026-08-09',
    items: [
      '"Kết nối Lark web" (Cài đặt → Lark × Agents) làm lại: (1) sửa DARK MODE — trước đây cả khối để nền vàng sáng cứng, chế độ tối bị chói; nay theo theme. (2) KHÔNG còn bắt dán link — chỉ cần bấm "Mở cửa sổ Lark & đăng nhập" là mở thẳng cửa sổ Lark để đăng nhập (QR/SSO); URL chỉ là tuỳ chọn NÂNG CAO cho tổ chức dùng máy chủ riêng (Feishu/vùng khác). (3) Ghi rõ: kết nối một lần để MỞ KHOÁ đọc/tạo Workflow; chưa kết nối thì lệnh workflow trong hội thoại sẽ báo cần kết nối.',
    ],
  },
  {
    version: '1.0.178',
    date: '2026-08-09',
    items: [
      'Hỏi nhanh (Lark chat) gọn hơn: bấm một mục "Hỏi nhanh" (hoặc "Tóm tắt") giờ chỉ hiện NHÃN NGẮN "⚡ <tên>" trong bong bóng chat — không còn dội nguyên khối prompt kỹ thuật dài (ĐỊNH DẠNG BẮT BUỘC… WF…) vào hội thoại. AI VẪN nhận đầy đủ prompt nên logic chạy y nguyên.',
      'bitable_read_workflows thêm `raw:true` → trả kèm `raw_draft` (schema THÔ của workflow) để AI COPY đúng khuôn khi TẠO workflow mới — khắc phục lỗi 800004006 (schema hằng của Lark quá khó đoán).',
    ],
  },
  {
    version: '1.0.177',
    date: '2026-08-09',
    items: [
      'Thiết kế Base (Lark × Agents): khi AI tạo bảng/cột giờ TỰ THÊM MÔ TẢ CỘT (description) — hiện ngay trên đầu mỗi cột trong Base. bitable_create_table / bitable_create_field / bitable_update_field đều nhận `description`.',
      'Sửa dark mode ở các modal "Hỏi nhanh" (Lark chat): trước đây nền hộp xem trước để màu sáng cứng → ở chế độ tối bị chói/khó đọc; nay theo đúng theme. Chip đính kèm cũng theo theme.',
      'bitable_create_workflow (tạo tự động hoá) hay bị Lark từ chối lỗi 800004006 do phần schema HẰNG (giá trị cố định / tham chiếu bản ghi trigger) là API nội bộ khó đoán: giờ hướng dẫn AI ĐỌC một workflow có sẵn để copy đúng khuôn thay vì tự đoán, và thông báo lỗi chỉ rõ cách sửa.',
    ],
  },
  {
    version: '1.0.175',
    date: '2026-08-09',
    items: [
      'Sửa bố cục trang Kỹ năng (Skills) bị dồn sang trái / mất cân đối: giờ dùng HẾT bề rộng, các thẻ skill xếp thành LƯỚI nhiều cột (2–4 cột tuỳ màn); phần giới thiệu khi chưa có skill được căn giữa.',
    ],
  },
  {
    version: '1.0.174',
    date: '2026-08-09',
    items: [
      'Trang Kỹ năng (Skills): thêm nút "?" (Hướng dẫn) mở guide đầy đủ — Kỹ năng là gì, 2 cách thêm (Tạo / Nhập SKILL.md), áp cho model nào (Claude/Grok/Gemini/Codex hay dùng chung), bật/tắt, mẹo viết hướng dẫn + ví dụ. Polish giao diện: header hiện số skill đang bật + link "Xem hướng dẫn"; màn hình trống giờ có phần giới thiệu + ví dụ + nút bắt đầu thay vì trống trơn.',
    ],
  },
  {
    version: '1.0.167',
    date: '2026-08-09',
    items: [
      'Mở nhầm link renderer (twd-desktop-renderer.pages.dev) trên TRÌNH DUYỆT không còn hiện "Application error: a client-side exception" đáng sợ — giờ hiện thông báo thân thiện "Trang này chạy trong ứng dụng Larkwave". (Giao diện này cần môi trường app nên không chạy trên trình duyệt; trong app vẫn bình thường.)',
    ],
  },
  {
    version: '1.0.164',
    date: '2026-08-09',
    items: [
      'Sửa cảnh báo "đã dùng ~100% ngữ cảnh" báo sai trên app đơn giản: trước đây lấy nhầm tổng token CỘNG DỒN của cả lượt chạy (đếm lại cache mỗi bước) nên phình quá cửa sổ → kẹp ~100%. Giờ đo theo lượt cuối của model (ngữ cảnh thực), nên % khớp thực tế — app nhỏ sẽ hiện vài % chứ không dọa 100%.',
      'Chi phí khi dùng Claude CLI: bỏ hiển thị "Hoàn tất ($2.24)" gây hiểu lầm bị trừ tiền. Giờ ghi rõ đây chỉ là ước tính nếu tính theo giá API — dùng Claude CLI (gói thuê bao) KHÔNG bị tính tiền.',
    ],
  },
  {
    version: '1.0.160',
    date: '2026-08-09',
    items: [
      'Sửa "app không thoát hẳn khi cài": trước đây một cửa sổ ẩn (phiên web Lark / đăng nhập) giữ tiến trình sống, nên tải xong app vẫn chạy (thấy trong Force Quit) và không cài đè được. Giờ khi tự-thoát / bấm "Thoát ngay", app BUỘC THOÁT hẳn (đóng mọi cửa sổ + thoát tiến trình) → cài đè được ngay.',
    ],
  },
  {
    version: '1.0.159',
    date: '2026-08-09',
    items: [
      'Form "Tạo app" gọn hơn: giới hạn bề rộng + căn giữa (hết cảnh trải full màn trống trơn), khoảng cách sít lại.',
    ],
  },
  {
    version: '1.0.157',
    date: '2026-08-09',
    items: [
      'Ô "Tạo app" giờ ĐÍNH KÈM ẢNH / FILE được: nút "Đính kèm ảnh / file" (cạnh nút Tạo app) + DÁN ảnh trực tiếp vào ô mô tả → AI sẽ MỞ/ĐỌC ảnh-tài liệu để hiểu đúng thiết kế/yêu cầu (trước đây bản desktop chưa có, chỉ web mới có).',
    ],
  },
  {
    version: '1.0.156',
    date: '2026-08-09',
    items: [
      '"Tải & mở bộ cài": sau khi tải xong + mở bộ cài, app sẽ TỰ ĐẾM NGƯỢC rồi thoát (mặc định 4 giây) để bạn kéo-thả cài đè ngay — không phải bấm "Thoát" thủ công. Có nút "Thoát ngay" và "Để tôi tự làm" (huỷ tự thoát).',
    ],
  },
  {
    version: '1.0.154',
    date: '2026-08-09',
    items: [
      'Thêm mẫu mới: Trò chơi (2048, lật thẻ trí nhớ, rắn săn mồi) và Tiện ích mở rộng (theo dõi giá, ghi chú nhanh).',
    ],
  },
  {
    version: '1.0.151',
    date: '2026-08-08',
    items: [
      'Báo lỗi / góp ý giờ tự đính kèm TÊN TRANG (hoặc app) đang mở → biết chính xác trang nào lỗi.',
      'Dark mode: sidebar trang "Quản trị", trang "Gói & Thanh toán", "Hồ sơ", và phần "API key của nhóm" (Cài đặt) — hết nền trắng / chữ tối khó đọc.',
    ],
  },
  {
    version: '1.0.150',
    date: '2026-08-08',
    items: [
      'Cửa sổ tin nhắn (Messenger) giờ theo chế độ tối: nền, viền, bong bóng tin và ô nhập đều đổi màu — hết cảnh nền trắng chói trên nền tối.',
      'Nút "báo lỗi" (đỏ) không còn che ô gửi của cửa sổ chat: khi mở chat, nút tự dời sang trái để vẫn bấm được mà không đè lên nội dung.',
    ],
  },
  {
    version: '1.0.149',
    date: '2026-08-08',
    items: [
      'Trang "Đồng bộ Bitable (CMS)" giờ MỞ ĐƯỢC ngay cả khi chưa đăng nhập AI CLI nào — vì CMS chạy qua phiên Lark + backend, không cần AI. (Chỉ cần đăng nhập tài khoản có quyền.)',
      'Lớp "Đang kiểm tra agents…" lúc mở app không còn nền trắng ở chế độ tối.',
    ],
  },
  {
    version: '1.0.148',
    date: '2026-08-08',
    items: [
      'Dark mode ở trang Cài đặt: các dòng chữ phụ (mô tả, nhãn) trước đây bị nhạt/khó đọc trên nền tối — giờ đổi theo theme.',
    ],
  },
  {
    version: '1.0.147',
    date: '2026-08-08',
    items: [
      'Hết nháy trắng khi mở / tải lại app ở chế độ tối: theme được áp NGAY từ khung hình đầu tiên (một đoạn mã chạy trước khi React dựng) — không còn "màn splash trắng".',
    ],
  },
  {
    version: '1.0.144',
    date: '2026-08-07',
    items: [
      'Modal "Đồng bộ lên điện thoại" rộng hơn — mã QR to & rõ hơn (không còn bị co lại), thêm link bấm-sao-chép bên cạnh.',
      'Modal hiện rõ ĐANG ĐỒNG BỘ DƯỚI TÀI KHOẢN nào — trên điện thoại phải đăng nhập ĐÚNG tài khoản đó mới thấy app (tránh cảnh "máy báo đã đồng bộ N app nhưng web trống" do đăng nhập nhầm tài khoản).',
    ],
  },
  {
    version: '1.0.143',
    date: '2026-08-07',
    items: [
      '"Tải & mở bộ cài": mở cửa sổ "Đang tải…" có thanh tiến trình động (bộ cài ~100MB) + tự dừng sau 5 phút nếu mạng chết, thay vì chỉ có spinner nhỏ; tải xong tự chuyển sang hướng dẫn cài.',
      'Nút "Làm mới" liên kết Telegram giờ có trạng thái đang tải.',
    ],
  },
  {
    version: '1.0.142',
    date: '2026-08-07',
    items: [
      'Nút "Đồng bộ lên điện thoại" giờ báo tiến trình rõ ràng: hiện "Đang đồng bộ…" trong lúc chạy rồi báo kết quả (đã đồng bộ N app / chưa có app nào trên máy / cần bật "Điều khiển từ xa" + đăng nhập). Hết cảnh bấm mà "không thấy gì".',
      'Nếu mạng treo, tự dừng sau 20 giây kèm thông báo — nút không còn quay mãi không phản hồi.',
    ],
  },
  {
    version: '1.0.141',
    date: '2026-08-07',
    items: [
      'Bản này cần CÀI LẠI app (đổi phần lõi).',
    ],
  },
  {
    version: '1.0.140',
    date: '2026-08-07',
    items: [
      'Bản này cần CÀI LẠI app (đổi phần lõi).',
    ],
  },
  {
    version: '1.0.139',
    date: '2026-08-07',
    items: [
      'Cập nhật lõi mượt hơn: sau khi "Tải & mở bộ cài", app hiện hướng dẫn 3 bước + nút "Thoát app để cài" (vì macOS báo "in use" khi app đang chạy — phải thoát trước rồi mới kéo đè vào Applications được).',
      'Bản này CẬP NHẬT NGAY (không cần cài lại).',
    ],
  },
  {
    version: '1.0.138',
    date: '2026-08-07',
    items: [
      'Sửa lời nhắc cập nhật lõi cho rõ: thay vì "hãy TẢI .dmg/.exe rồi cài đè", banner giờ hướng dẫn bấm nút "Tải & mở bộ cài" (app tự tải + mở bộ cài) và nói rõ chỉ khi ĐỔI phần lõi mới cần cài lại.',
      'Bản này CẬP NHẬT NGAY (không cần cài lại).',
    ],
  },
  {
    version: '1.0.137',
    date: '2026-08-07',
    items: [
      'Bản này cần CÀI LẠI app (đổi phần lõi).',
    ],
  },
  {
    version: '1.0.136',
    date: '2026-08-07',
    items: [
      'Đồng bộ Bitable (CMS): gọn lại giao diện — mã QR + link đưa vào nút "Từ điện thoại (QR)" dạng popover (khỏi lộn xộn ở đầu trang); "Nhật ký & báo cáo" và "Lịch sử đăng nhập lại Lark" giờ GẬP/MỞ được (Collapse), tự mở khi có lỗi.',
      'Trang chủ: thêm nút "Điều khiển từ điện thoại" — bấm hiện mã QR để quét mở "Máy của tôi" (/remote/agent) trên điện thoại.',
      'Bản này CẬP NHẬT NGAY (không cần cài lại).',
    ],
  },
  {
    version: '1.0.135',
    date: '2026-08-07',
    items: [
      'Cập nhật phần lõi DỄ hơn: banner "Cần cập nhật PHẦN LÕI" giờ có nút "Tải & mở bộ cài" — app tự tải đúng .dmg/.exe rồi mở sẵn bộ cài, khỏi phải vào trang tải tìm file. (Do app chưa ký số nên vẫn cần bạn xác nhận cài đè; đây là lần cài tay này — từ sau nút 1 chạm sẽ có sẵn.)',
      'Bản này cần CÀI LẠI app (đổi phần lõi).',
    ],
  },
  {
    version: '1.0.134',
    date: '2026-08-07',
    items: [
      'Đồng bộ Bitable (CMS): thêm MÃ QR ngay cạnh nút đăng nhập lại từ điện thoại — quét bằng camera điện thoại là mở thẳng trang /remote/lark, khỏi phải nhớ/gõ link.',
      'Bản này CẬP NHẬT NGAY (không cần cài lại).',
    ],
  },
  {
    version: '1.0.133',
    date: '2026-08-07',
    items: [
      'Đồng bộ Bitable (CMS): thêm "Lịch sử đăng nhập lại Lark" — ghi mỗi lần đăng nhập lại phiên Lark web (🖥 tại máy hoặc 📱 từ điện thoại/QR) kèm kết quả (thành công/thất bại/hết giờ) và thời điểm. Lưu lại 30 lần gần nhất theo từng tài khoản.',
      'Bản này cần CÀI LẠI app (đổi phần lõi).',
    ],
  },
  {
    version: '1.0.132',
    date: '2026-08-07',
    items: [
      'Sửa cảnh báo "đã dùng ~X% ngữ cảnh" báo sai (vd 84% trong khi thực tế ~17%): trước đây khi không đọc được model từ CLI, app mặc định cửa sổ 200K nên tính gấp ~5 lần. Giờ mặc định 1.000.000 token (đúng cho Opus/Sonnet/Fable — chỉ Haiku là 200K) nên % ngữ cảnh khớp với CLI.',
      'Bản này cần CÀI LẠI app (đổi phần lõi).',
    ],
  },
  {
    version: '1.0.131',
    date: '2026-08-06',
    items: [
      'Web: gom "Máy của tôi" và "Lark" vào nhóm "Điều khiển từ xa" trong menu (URL mới /remote/agent, /remote/lark; link cũ /agent tự chuyển). Trang Máy của tôi bỏ 2 sidebar — hội thoại giờ là ô chọn gọn ở đầu trang. Trang Lark có nút đăng nhập lại Lark (QR) + báo lỗi chạy gần đây.',
      'CMS: nút đăng nhập lại từ điện thoại giờ trỏ app.toolswave.net/remote/lark.',
      'Bản này CẬP NHẬT NGAY (không cần cài lại).',
    ],
  },
  {
    version: '1.0.130',
    date: '2026-08-06',
    items: [
      'Đồng bộ Bitable (CMS): nút "Đăng nhập lại từ điện thoại" giờ hiện RÕ địa chỉ trang — app.toolswave.net/agent (bấm để sao chép), để mở đúng chỗ trên điện thoại khi không ở cạnh máy.',
      'Bản này CẬP NHẬT NGAY (không cần cài lại).',
    ],
  },
  {
    version: '1.0.129',
    date: '2026-08-06',
    items: [
      'Máy của tôi (web /agent): thêm HỘI THOẠI ĐẶT TÊN — thanh bên tạo/đổi tên/xoá nhiều hội thoại (như ChatGPT); mỗi yêu cầu gửi được gom vào hội thoại đang chọn, chuyển hội thoại để xem riêng từng luồng.',
      'Đồng bộ Bitable (CMS): thêm khu "Nhật ký & báo cáo" — tóm tắt lần chạy gần nhất của từng job (thời điểm + số bản ghi thêm/sửa/xoá) và danh sách job đang lỗi kèm "Chạy lại".',
      'Đồng bộ Bitable (CMS): thêm nút "Đăng nhập lại từ điện thoại (QR)" — mở trang /agent để đăng nhập lại Lark cho máy từ điện thoại (quét QR) khi không ở cạnh máy.',
      'Bản này CẬP NHẬT NGAY (không cần cài lại).',
    ],
  },
  {
    version: '1.0.128',
    date: '2026-08-06',
    items: [
      'Bản này cần CÀI LẠI app (đổi phần lõi).',
    ],
  },
  {
    version: '1.0.127',
    date: '2026-08-06',
    items: [
      'Bản này CẬP NHẬT NGAY (không cần cài lại).',
    ],
  },
  {
    version: '1.0.126',
    date: '2026-08-06',
    items: [
      'Bản này CẬP NHẬT NGAY (không cần cài lại).',
    ],
  },
  {
    version: '1.0.125',
    date: '2026-08-06',
    items: [
      'Bản này CẬP NHẬT NGAY (không cần cài lại).',
    ],
  },
  {
    version: '1.0.124',
    date: '2026-08-06',
    items: [
      'Điều khiển từ xa — Token webhook: thêm nút "Test" mỗi token (kiểm token còn dùng được + máy có đang online không, KHÔNG chạy gì) và "Báo KQ" để khi tác vụ chạy xong tự gửi kết quả ra Telegram hoặc nhóm Lark.',
      'Điều khiển bằng CHAT: nối một chat Telegram với máy — nhắn nội dung vào chat là máy chạy rồi trả kết quả về (bấm "Nối Telegram" để lấy mã, gửi /start <mã> cho bot). Cần quản trị đặt bot token trên máy chủ.',
      'Bản này cần CÀI LẠI app (đổi phần lõi).',
    ],
  },
  {
    version: '1.0.123',
    date: '2026-08-06',
    items: [
      'Đồng bộ Bitable (CMS): khi phiên Lark trên máy hết hạn, giờ có thể ĐĂNG NHẬP LẠI TỪ ĐIỆN THOẠI. Trên web (trang Điều khiển từ xa) bấm "Đăng nhập lại Lark (CMS) trên máy" → máy mở màn đăng nhập Lark và đẩy mã QR sang điện thoại → mở app Lark quét QR là xong; máy tự nhận phiên mới rồi đồng bộ lại.',
      'Bản này cần CÀI LẠI app (đổi phần lõi).',
    ],
  },
  {
    version: '1.0.122',
    date: '2026-08-06',
    items: [
      'Bản này cần CÀI LẠI app (đổi phần lõi).',
    ],
  },
  {
    version: '1.0.121',
    date: '2026-08-06',
    items: [
      'Sửa lỗi chạy app cục bộ ("Dev server đã thoát exit 1"): thông báo giờ HIỆN ĐÚNG NGUYÊN NHÂN THẬT (esbuild lệch bản, thiếu thư viện, cổng bận…) thay vì chỉ "exit 1/.env". Và khi phát hiện esbuild hỏng, app TỰ CÀI LẠI thư viện rồi thử lại — nhiều trường hợp tự khỏi.',
      'Bản này cần CÀI LẠI app (đổi phần lõi).',
    ],
  },
  {
    version: '1.0.120',
    date: '2026-08-06',
    items: [
      'Bot trong Lark: thêm nút "Tạo nhóm chat với Bot" (tự động tạo nhóm Lark có bot + link tham gia 1 chạm, như bên CMS) — vào nhóm là nhắn cho AI ngay.',
      'Bot trong Lark: thêm HƯỚNG DẪN 6 bước thiết lập rõ ràng (bật Bot + quyền im:chat/im:message trong Lark Console, URL công khai, đăng ký sự kiện im.message.receive_v1, Encrypt Key/Verification Token).',
      'Bản này cần CÀI LẠI app (đổi phần lõi).',
    ],
  },
  {
    version: '1.0.119',
    date: '2026-08-06',
    items: [
      'Sửa: "Điều khiển từ xa" — công tắc bật/tắt bị kẹt xoay-xoay (loading) mãi dù đã kết nối. Nguyên nhân: lệnh bật chờ luồng dữ liệu (không bao giờ "xong"). Giờ công tắc phản hồi ngay, trạng thái kết nối hiện qua thẻ xanh "Đã kết nối máy chủ".',
      'Điều khiển từ xa: thêm HƯỚNG DẪN 4 bước ngay trong mục — cách mở app.toolswave.net/agent trên điện thoại, đăng nhập cùng tài khoản, chọn đúng máy và gửi yêu cầu.',
    ],
  },
  {
    version: '1.0.118',
    date: '2026-08-06',
    items: [
      'Sửa: sau khi "Tạo nhóm" trong Webhook báo lỗi tổng, nhóm mới CHƯA được lưu xuống máy chủ (gửi test thì được vì dùng tạm) → mở lại trang bị mất, phải chọn lại. Giờ tạo nhóm xong là LƯU LUÔN. Nhóm đã chọn cũng luôn hiển thị đúng dù danh sách tải chậm.',
    ],
  },
  {
    version: '1.0.117',
    date: '2026-08-06',
    items: [
      'Sửa: "Webhook báo lỗi tổng" bật lên rồi mở lại trang bị tắt — do phải bấm "Lưu" mới ghi. Giờ BẬT/CHỌN NHÓM là TỰ LƯU ngay (webhook URL tự lưu khi rời ô). Nếu bản app quá cũ chưa hỗ trợ, sẽ báo rõ "cần cài lại" thay vì im lặng.',
    ],
  },
  {
    version: '1.0.116',
    date: '2026-08-06',
    items: [
      'Đồng bộ Bitable (CMS): "Tạo nhóm" giờ TỰ ĐỘNG cho bạn vào nhóm — app tạo nhóm Lark (bot ở trong để gửi lỗi) rồi mở LỜI MỜI trong Lark, bạn chỉ bấm "Tham gia" một phát là vào và nhận báo lỗi ngay. Khỏi tự tạo nhóm/thêm bot thủ công.',
      'Bản này cần CÀI LẠI app (đổi phần lõi).',
    ],
  },
  {
    version: '1.0.115',
    date: '2026-08-06',
    items: [
      'Đồng bộ Bitable (CMS): sửa thông báo gây khó hiểu khi "Tạo nhóm" chỉ tạo được nhóm-chỉ-bot — giờ giải thích rõ (bạn không thấy nhóm vì chưa được thêm vào) + hướng dẫn cách chắc chắn (chọn nhóm có sẵn, hoặc tự tạo nhóm trong Lark + thêm bot rồi bấm Làm mới). Thêm nút "Làm mới" danh sách nhóm.',
    ],
  },
  {
    version: '1.0.114',
    date: '2026-08-05',
    items: [
      'Sửa: "Tạo nhóm" báo lỗi ở Lark — nguyên nhân do thêm thành viên bằng open_id khác app (app đăng nhập ≠ app bot gửi tin). Giờ tạo nhóm luôn chạy (bot vào nhóm, gửi được ngay), còn thêm bạn vào nhóm là best-effort qua EMAIL. Nếu chưa thêm được bạn, app báo rõ để bạn tự vào nhóm.',
      'Bản này cần CÀI LẠI app (đổi phần lõi).',
    ],
  },
  {
    version: '1.0.113',
    date: '2026-08-05',
    items: [
      'Đồng bộ Bitable (CMS) — Webhook báo lỗi tổng: thêm nút "Tạo nhóm" (tạo nhóm Lark mới ngay trong app — có sẵn bot Larkwave + tài khoản của bạn) và "Gửi tin test" (bắn 1 card test vào nhóm/webhook để biết đã kết nối chưa). Có cả ở phần Cấu hình từng job.',
      'Bản này cần CÀI LẠI app (đổi phần lõi).',
    ],
  },
  {
    version: '1.0.112',
    date: '2026-08-05',
    items: [
      'Đồng bộ Bitable (CMS): báo lỗi giờ GỬI THẲNG VÀO NHÓM LARK — chọn nhóm từ danh sách (bot Larkwave đang ở trong), khỏi phải tạo Custom Bot/webhook. Vẫn giữ cách dán webhook URL. Áp dụng cả mức tổng lẫn từng job.',
      'Bản này cần CÀI LẠI app (đổi phần lõi).',
    ],
  },
  {
    version: '1.0.111',
    date: '2026-08-05',
    items: [
      'Đồng bộ Bitable (CMS): thêm BÁO LỖI qua Lark bot webhook. Mức TỔNG — mọi job lỗi → 1 webhook (card "Webhook báo lỗi tổng"); và THEO TỪNG JOB — đặt webhook riêng trong nút Cấu hình. Chạy trên máy chủ 24/7 (báo cả khi tắt app).',
      'Bản này cần CÀI LẠI app (đổi phần lõi).',
    ],
  },
  {
    version: '1.0.110',
    date: '2026-08-05',
    items: [
      'Đồng bộ Bitable (CMS): mở màn này cho thêm 2 tài khoản (phuongdang29492@gmail.com + dbrainv.ai@gmail.com), ngoài admin. Lưu ý: các job CMS nằm chung trên một máy chủ (không tách theo tài khoản) — 3 tài khoản đều nhìn thấy CÙNG một bộ job; mỗi tài khoản vẫn cần tự đăng nhập Lark web của mình để chạy/làm mới session.',
    ],
  },
  {
    version: '1.0.109',
    date: '2026-08-05',
    items: [
      'Lark: thêm tool "tạo hội thoại nhóm" + gửi tin ĐỊNH DẠNG (rich text/card) — nhờ agent tạo nhóm rồi đẩy nội dung vào đó ngay trong hội thoại.',
      'Tự động hoá: thêm loại kích hoạt "Theo lịch giờ" — đăng 1 nội dung cố định vào nhóm mỗi ngày vào giờ chọn (hoặc lặp mỗi N giây), không cần bảng Base.',
      'Bot Lark: bật "Tự tạo URL công khai (cloudflared)" để app tự sinh URL webhook công khai (cần cài cloudflared), khỏi chạy ngrok/cloudflared bằng tay.',
      'Windows: sửa cửa sổ đăng nhập Lark chạy khác Mac — chặn deeplink larksuite:// / popup lạ, ép cùng user-agent Chrome (gộp từ bản trước).',
      'Bản này cần CÀI LẠI app (đổi phần lõi).',
    ],
  },
  {
    version: '1.0.108',
    date: '2026-08-03',
    items: [
      'Sửa: "Đăng nhập lại Lark web" trên Windows chạy KHÁC Mac — cửa sổ Lark trước đây dùng user-agent mặc định của Electron (kèm token hệ điều hành + chuỗi "Electron" khác nhau), Lark soi vào đó để chặn/đổi giao diện đăng nhập. Giờ ép CÙNG một user-agent Chrome cho cả hai nền tảng → đăng nhập + đồng bộ connector hoạt động giống hệt nhau trên Mac và Windows.',
    ],
  },
  {
    version: '1.0.107',
    date: '2026-08-02',
    items: [
      'Đồng bộ Bitable (CMS): thêm nút CẤU HÌNH cho mỗi job (giống trang web /sync/bitable) — sửa Tên, Tần suất đồng bộ (giây), và Lịch tự động (chạy 24/7 hoặc theo Giờ bắt đầu/kết thúc + Ngày trong tuần).',
      'Đồng bộ Bitable (CMS): bảng hiện thêm tần suất mỗi job (mỗi N phút · 24/7).',
      'Bản này cần CÀI LẠI app (đổi phần lõi để lưu cấu hình xuống máy chủ CMS).',
    ],
  },
  {
    version: '1.0.106',
    date: '2026-08-02',
    items: [
      'Đồng bộ Bitable (CMS): danh sách job giờ là BẢNG phân trang (10 job/trang) — gọn, dễ quét thay vì cuộn dài.',
      'Đồng bộ Bitable (CMS): thêm ô TÌM KIẾM theo tên job + bộ LỌC theo Base ngay trên bảng.',
      'Đồng bộ Bitable (CMS): bỏ ô "Máy chủ CMS" khỏi giao diện (vẫn dùng máy chủ mặc định apihoanam).',
    ],
  },
  {
    version: '1.0.105',
    date: '2026-08-02',
    items: [
      'Đồng bộ Bitable (CMS): thêm hàng THỐNG KÊ ở đầu trang (số job connector, đang bật, tổng số bảng, bản ghi lần cuối, đang lỗi) + mỗi job hiện số bản ghi (+thêm ~sửa -xoá), thời điểm đồng bộ gần nhất và lỗi — giống trang web /sync/bitable.',
      'Đồng bộ Bitable (CMS): màn này giờ CHỈ HIỆN cho tài khoản admin (của bạn) — tài khoản khác không thấy để tránh lộ job dùng chung.',
    ],
  },
  {
    version: '1.0.104',
    date: '2026-08-02',
    items: [
      'Đồng bộ Bitable: "Chạy ngay" giờ HIỆN PHẢN HỒI THẬT của Lark cho từng bảng (code + msg + raw) trong khung xanh — kể cả khi báo "thành công". Để soi trường hợp "báo ok nhưng bảng không đổi": copy khung đó gửi để tôi biết Lark thật sự trả gì.',
    ],
  },
  {
    version: '1.0.103',
    date: '2026-08-02',
    items: [
      'Đồng bộ Bitable: khi "Chạy ngay", app TỰ ĐIỀU HƯỚNG cửa sổ Lark tới đúng SHARD/máy chủ của base trước khi gọi (trước đây fetch chạy nhầm origin www.larksuite.com → thiếu cookie/csrf của shard → không sync). "Đăng nhập lại Lark web" cũng mở đúng shard đã lưu.',
      'Hiện LỖI ĐẦY ĐỦ trong khung đỏ (copy được) khi chạy thất bại — kèm origin cửa sổ + mã Lark thật, để soi đúng nguyên nhân.',
    ],
  },
  {
    version: '1.0.102',
    date: '2026-08-02',
    items: [
      'SỬA đúng lỗi base trong WIKI không đồng bộ: khi "Chạy ngay", desktop giờ gửi kèm docs-host-id (mã node wiki) + docs-host-type + doc-biz/os/platform — đúng như thao tác thật trong Lark. Trước đây thiếu các header này nên Lark âm thầm từ chối base wiki. Job cũ (do extension bắt) đã có sẵn hostId đúng nên chạy được ngay.',
      '(Đã gồm nút "Đăng nhập lại Lark web" của 1.0.101.)',
    ],
  },
  {
    version: '1.0.101',
    date: '2026-08-02',
    items: [
      'Đồng bộ Bitable (CMS): thêm nút "Đăng nhập lại Lark web" — MỞ cửa sổ Lark để bạn đăng nhập lại lấy SESSION MỚI (session Lark hết hạn theo thời gian, chỉ đăng nhập lại mới cấp cookie sống). Đăng nhập xong app TỰ bơm cookie mới cho tất cả job. Hiện rõ trạng thái "đã/chưa kết nối" + máy chủ.',
      'Đây là thứ còn thiếu khiến "làm mới" trước đây vô dụng: nó chỉ đọc lại cookie cũ đã chết. Giờ làm mới = đăng nhập lại thật.',
    ],
  },
  {
    version: '1.0.100',
    date: '2026-08-02',
    items: [
      'SỬA LỖI đồng bộ Bitable (CMS) "báo thành công nhưng bảng không đổi": nút "Chạy ngay" giờ để DESKTOP tự gọi Lark trực tiếp bằng phiên web sống (đúng như thao tác bấm "Đồng bộ" trong Lark) và BÁO KẾT QUẢ THẬT theo từng bảng — nếu Lark báo lỗi (session hết hạn / sai token) sẽ hiện rõ thay vì báo thành công giả.',
      'Làm mới session giờ áp dụng cho CẢ job đã bị TẮT (backend tự tắt job khi session hết hạn) — trước đây bỏ qua job tắt nên không cứu được. Thêm nút "Làm mới session" cho từng job.',
      'Thông báo trung thực: "Đã đồng bộ N/M bảng" hoặc liệt kê bảng lỗi; nếu không có job connector thì báo rõ thay vì "0/0 thành công".',
    ],
  },
  {
    version: '1.0.99',
    date: '2026-08-02',
    items: [
      'Thiết lập đồng bộ Bitable bằng HỘI THOẠI: trong Lark × Agents (chế độ Thực thi), dán một danh sách kiểu "TÊN BẢNG base TÊN BASE" — agent tự tìm base + bảng, HỎI chu kỳ đồng bộ, liệt kê trước rồi tạo hàng loạt (xác nhận 1 lần). Tên job lấy đúng dòng bạn nhập.',
      'Công cụ mới cho agent: cms_create_bitable_sync — tạo nhiều job đồng bộ CMS cùng lúc, session connector tự gắn tươi (không cần extension). Xem/sửa ở màn "Đồng bộ Bitable".',
    ],
  },
  {
    version: '1.0.98',
    date: '2026-08-01',
    items: [
      'Group Lark — thêm "Đồng bộ Bitable (CMS)": kết nối với hệ thống cms-lark-sync của bạn nhưng KHÔNG cần bắt lại session bằng extension nữa. Desktop giữ session connector (cookie/csrf) LUÔN TƯƠI từ phiên Lark web đã lưu.',
      'Chọn Base → chọn NHIỀU BẢNG trong Base đó để tạo một job đồng bộ (job tự lặp qua từng bảng). Job có sẵn cũng có nút "Sửa bảng" để chọn lại các bảng.',
      'Máy chủ CMS vẫn là bên gọi Lark như cũ. Session tự làm mới: định kỳ 6 giờ + tự thử lại khi chạy lỗi + nút "Làm mới session (tất cả)".',
      'Cấu hình được địa chỉ máy chủ CMS (mặc định apihoanam). Cần "Kết nối Lark web" một lần để lấy session.',
    ],
  },
  {
    version: '1.0.96',
    date: '2026-07-30',
    items: [
      'Bảng trong câu trả lời nay hiển thị đúng dạng BẢNG (kể cả khi có tiêu đề ngay phía trên bảng, trước đây bị dính thành chữ thô).',
      'Thêm nút “Lỗi” có badge đếm (cạnh Ghi chú / Chia sẻ): bấm mở bảng liệt kê các công cụ chạy lỗi. Mỗi lỗi có nút “Xem trong hội thoại” và nút đổi trạng thái “đã xử lý ↔ chưa xử lý” — badge chỉ đếm lỗi CHƯA xử lý; lỗi lặp lại (lần chạy mới) tự hiện lại là chưa xử lý.',
      'Đặc tả hệ thống — tab Workflow nay NHÓM THEO BASE (gập/mở từng base) giống tab Thực thể & quan hệ.',
    ],
  },
  {
    version: '1.0.94',
    date: '2026-07-29',
    items: [
      'Sửa lỗi HAY BỊ ĐĂNG XUẤT: token đăng nhập trước đây chỉ lưu trong giao diện, mà app có lúc nạp giao diện từ máy chủ, có lúc từ bản đóng gói trong máy — hai “nơi lưu” tách biệt nên đăng nhập ở nơi này không thấy ở nơi kia → bị out. Nay token được giữ AN TOÀN ở tiến trình chính (mã hoá) và tự khôi phục dù nạp giao diện kiểu nào — không còn bị out vì lý do đó.',
      '(Đã bao gồm bản vá màn hình trắng của 1.0.93.)',
    ],
  },
  {
    version: '1.0.93',
    date: '2026-07-28',
    items: [
      'Sửa lỗi NGHIÊM TRỌNG: bản 1.0.92 mở lên bị TRẮNG MÀN — do gói cài đóng kèm nhầm bản “core” cũ (thiếu 4 kênh IPC mới của Đặc tả), khiến tiến trình chính lỗi ngay khi khởi động và không nạp được giao diện. Bản này đóng gói lại với core mới nên chạy bình thường.',
      'Gia cố khởi động: nếu về sau có một trình xử lý IPC lỗi, hoặc nạp renderer từ xa thất bại, app sẽ TỰ lùi về giao diện đóng gói sẵn + ghi log — KHÔNG bao giờ trắng màn vì lý do đó nữa.',
    ],
  },
  {
    version: '1.0.92',
    date: '2026-07-28',
    items: [
      'Màn hình "Đặc tả hệ thống Lark" nay CHẠY THẬT: bấm "Đồng bộ đặc tả" để đọc TRỰC TIẾP cấu trúc (Base → bảng → cột) và workflow từ chính Lark của bạn — không cào lại lịch sử chat, mà khớp theo ID Lark thật nên không trùng lặp.',
      'Mỗi lần đồng bộ hiện rõ KHÁC BIỆT (thêm / cập nhật / đã gỡ), và mọi thực thể đều có trạng thái tin cậy (đã kiểm chứng · cũ · chưa kiểm chứng) kèm truy nguồn (đọc lúc nào, từ công cụ nào). Cột/bảng bị xoá được gạch mờ chứ không biến mất.',
      'Có tab Thực thể & quan hệ, Workflow (vẽ cây trigger → điều kiện → hành động), Tổng quan (mô tả hệ thống của bạn + ghi nhận từ hội thoại). Đặc tả lưu RIÊNG theo tài khoản và đồng bộ giữa các thiết bị.',
      'Giá trị bản ghi KHÔNG được lưu vào đặc tả — chỉ cấu trúc + số lượng — nên an toàn khi đồng bộ lên tài khoản.',
    ],
  },
  {
    version: '1.0.91',
    date: '2026-07-28',
    items: [
      'Sidebar gọn hơn: gom thành NHÓM "Lark" — bên trong có "Lark × Agents", "Đặc tả" (mới) và "Kỹ năng". Bấm vào nhóm để mở/gập.',
      'Thêm màn hình "Đặc tả hệ thống Lark" (đang hoàn thiện): bản đặc tả sống dựng từ các hội thoại — thực thể, workflow, sơ đồ, hành động; sẽ đồng bộ phân tích mới từ hội thoại và làm nền để huấn luyện agent + nâng cấp hệ thống.',
    ],
  },
  {
    version: '1.0.90',
    date: '2026-07-26',
    items: [
      '"Kết nối Lark web" (đăng nhập bằng cookie) nay cũng RIÊNG theo tài khoản: mỗi tài khoản một phiên đăng nhập Lark web riêng, người khác đăng nhập trên cùng máy không thấy. Và GHI NHỚ đăng nhập: đã kết nối đúng thì lần sau mở lại (hoặc quay lại tài khoản đó) tự khôi phục kết nối, không phải đăng nhập lại. (Lưu ý: lần đầu sau khi cập nhật, nếu trước đây bạn đã kết nối Lark web thì cần kết nối lại MỘT lần để chuyển sang phiên riêng của tài khoản.)',
    ],
  },
  {
    version: '1.0.88',
    date: '2026-07-26',
    items: [
      'Hội thoại Lark × Agents nay lưu + đồng bộ THEO TÀI KHOẢN: đăng nhập tài khoản của bạn ở máy khác là thấy lại hội thoại (vốn đã đồng bộ qua server). Sửa lỗi trộn dữ liệu: đổi tài khoản trên CÙNG một máy không còn lẫn hội thoại của người này sang người kia — mỗi tài khoản một kho riêng, không mất dữ liệu cũ.',
    ],
  },
  {
    version: '1.0.87',
    date: '2026-07-26',
    items: [
      'Thanh "⚡ Hỏi nhanh" gọn hơn: các nút giờ TỰ XUỐNG DÒNG thay vì cuộn ngang xấu, mặc định thu gọn 1 dòng kèm nút "Xem thêm ▾ / Thu gọn ▴" khi có nhiều nút.',
    ],
  },
  {
    version: '1.0.85',
    date: '2026-07-24',
    items: [
      'Hoàn thiện khoá gửi dùng chung: tab mở GIỮA lúc một lượt đang chạy nay hiện đúng trạng thái bị khoá ngay (trước đây phải đợi lượt kết thúc mới biết).',
      'Thêm nút "Dừng" lượt AI đang chạy (trong khung chat Lark) và "Mở khoá nếu treo" trên thanh nhắc — để tự thoát khi một lượt bị treo, không phải chờ.',
    ],
  },
  {
    version: '1.0.84',
    date: '2026-07-24',
    items: [
      '🔒 KHOÁ GỬI DÙNG CHUNG GIỮA CÁC TAB: máy chỉ chạy MỘT lượt AI tại một thời điểm, nên khi một tab đang chờ AI trả lời thì các tab khác (và cả lượt từ điện thoại) tạm khoá nút Gửi — hiện rõ "đang chờ AI trả lời ở tab «…»", bạn vẫn soạn trước được, nút mở lại khi xong. Đây là bản CÀI (không phải cập nhật tự động).',
      'Thêm nút HUỶ lượt đang chạy + "mở khoá phiên AI" khi bị treo (tự dừng tiến trình AI). Thoát app cũng tự dừng lượt đang chạy, không để tiến trình mồ côi.',
    ],
  },
  {
    version: '1.0.81',
    date: '2026-07-23',
    items: [
      'Tương tự, mỗi lần app làm mới phiên đăng nhập cũng không còn phá các tab đang mở nữa.',
    ],
  },
  {
    version: '1.0.79',
    date: '2026-07-23',
    items: [
      '🤝 BẠN BÈ CHẠY ĐƯỢC CÂU HỎI qua kết nối Lark của bạn — nay đã BẬT, với chốt chặn thật ở tầng công cụ: mỗi lần gọi tool đều bị kiểm app_token, Base ngoài phạm vi bạn cấp sẽ bị TỪ CHỐI; bộ công cụ giới hạn chỉ còn Bitable (không chạm tin nhắn, Docs, Drive, danh bạ, lịch); lượt uỷ quyền luôn CHỈ ĐỌC và tự dừng sau 120 giây.',
      'Phạm vi được đọc lại từ đĩa ở MỖI lượt, nên thu hẹp hoặc thu hồi có hiệu lực ngay, không cần mời lại.',
    ],
  },
  {
    version: '1.0.78',
    date: '2026-07-23',
    items: [
      'Ghi chú & Việc cần làm cho từng hội thoại + tóm tắt câu trả lời bằng AI (chạy bằng CLI hoặc API trực tiếp tuỳ nút chuyển bạn đang bật, và lưu lại nên mở lại không tốn thêm token).',
    ],
  },
  {
    version: '1.0.77',
    date: '2026-07-23',
    items: [
      '📕 THU GỌN CÂU TRẢ LỜI: mỗi câu trả lời của agent giờ có nút "Thu gọn" — khi gấp lại, nó hiện một dòng tóm tắt (tiêu đề thật của câu trả lời, tự bỏ câu mở đầu kiểu "Được, đây là…") kèm các chip đếm: số workflow, WF1 · WF3 · WF7, số dòng bảng, số mục, số ảnh. Bấm vào là mở lại đầy đủ.',
      'Menu "Hiển thị ▾" trên thanh công cụ: Thu gọn tất cả / Mở tất cả, và tuỳ chọn tự thu gọn các câu trả lời dài khi mở hội thoại (MẶC ĐỊNH TẮT — bật khi bạn muốn).',
      'Thẻ công cụ (tool) KHÔNG bị thu gọn, nên dấu vết "agent đã làm gì" vẫn luôn nhìn thấy. Trạng thái gấp được nhớ theo từng hội thoại và không lọt vào link chia sẻ công khai.',
    ],
  },
  {
    version: '1.0.76',
    date: '2026-07-23',
    items: [
      'Sửa dark mode: thẻ "công cụ" (tool call) trong hội thoại — tên tool, JSON đầu vào, panel plugin, hộp xác nhận, modal hướng dẫn — không còn nền trắng chói; đổi màu theo chế độ tối cho dễ đọc.',
    ],
  },
  {
    version: '1.0.75',
    date: '2026-07-23',
    items: [
      '🌙 Chế độ TỐI (dark mode): thêm nút bật/tắt ngay trên thanh header (cạnh nút tin nhắn). Toàn bộ app — thanh bên, thẻ, khung chat, bảng workflow — đổi màu theo; lựa chọn được ghi nhớ (lần mở sau giữ nguyên), mặc định theo hệ điều hành.',
      'Nút CTA rõ hơn: nút "Tạo app" nay là nút gradient nổi bật để người mới biết bắt đầu từ đâu; các nút phụ có viền đậm + chữ đậm hơn nên không còn "chìm" vào nền trắng.',
    ],
  },
  {
    version: '1.0.74',
    date: '2026-07-21',
    items: [
      'Sửa tooltip xem trước WF bị che/cắt mất khi workflow nằm trong bảng: tooltip giờ nổi theo màn hình (không bị khung trả lời hay thanh cuộn ngang của bảng cắt), tự lật xuống dưới nếu sát mép trên, và hiện rõ TÊN workflow (in đậm) kèm trạng thái mờ bên dưới.',
    ],
  },
  {
    version: '1.0.73',
    date: '2026-07-21',
    items: [
      'Sửa tooltip "WF13" không hiện tên: giờ nhận diện tên workflow ở MỌI kiểu viết ("## WF-13 — tên", bảng "| WF13 | tên |", "**WF-14 — tên**", "WF13: tên") và cả cách nhắc "WF-13" có gạch nối — di chuột vào là ra tên (vd "2. Tìm Vận Đơn Còn Nợ"), bấm nhảy tới đúng chỗ.',
    ],
  },
  {
    version: '1.0.72',
    date: '2026-07-19',
    items: [
      'Nhắc "WF1", "WF2"… giờ khi DI CHUỘT vào sẽ hiện tooltip xem trước (tên + trigger của workflow đó); bấm vẫn nhảy tới như cũ. Áp dụng cả desktop lẫn trang chia sẻ web.',
    ],
  },
  {
    version: '1.0.71',
    date: '2026-07-19',
    items: [
      'Mỗi tin nhắn (cả câu hỏi lẫn câu trả lời) giờ có nút "Sao chép" và "Chỉnh sửa / hỏi lại": bấm chỉnh sửa sẽ nạp nội dung vào ô soạn để bạn sửa rồi gửi lại — dùng để hỏi sâu hơn hoặc chỉnh cho agent hiểu đúng.',
    ],
  },
  {
    version: '1.0.70',
    date: '2026-07-19',
    items: [
      'Badge "cần đồng bộ" của link chia sẻ giờ CHÍNH XÁC TUYỆT ĐỐI: so trực tiếp với số lượt đang thực sự nằm trên link (server trả về), đúng kể cả sau khi tắt/mở lại app — không còn ước lượng theo phiên.',
    ],
  },
  {
    version: '1.0.69',
    date: '2026-07-19',
    items: [
      'Chia sẻ hội thoại: nút "Đã chia sẻ" giờ có BADGE SỐ báo số lượt mới CHƯA đồng bộ lên link (khi bạn chat tiếp sau khi share). Bấm "Cập nhật nội dung mới nhất" là badge về 0.',
    ],
  },
  {
    version: '1.0.68',
    date: '2026-07-19',
    items: [
      'Chia sẻ hội thoại: sau khi hội thoại có thêm nội dung mới, bấm "Đã chia sẻ ▾ → Cập nhật nội dung mới nhất" để đẩy phần mới lên ĐÚNG link cũ (không tạo link mới).',
    ],
  },
  {
    version: '1.0.67',
    date: '2026-07-18',
    items: [
      'Workflow hiển thị TRỰC QUAN: cây trigger → điều kiện → hành động có màu + biểu tượng theo loại; tên bảng/cột «…» thành chip; nhánh ✔ ĐÚNG / ✗ NGƯỢC LẠI có màu; trạng thái bật/tắt thành pill. Áp dụng cả hội thoại CŨ (render lại nội dung đã lưu).',
      'Liên kết chéo: nhắc "WF1", "WF2"… trong câu trả lời giờ BẤM được để nhảy tới đúng workflow đó.',
    ],
  },
  {
    version: '1.0.66',
    date: '2026-07-18',
    items: [
      'Đọc workflow chi tiết hơn hẳn: liệt kê TỪNG bước theo thứ tự (loại hành động, bảng/cột tác động, giá trị), mọi nhánh Nếu/Nếu không + điều kiện, vòng lặp — dùng tên bảng/cột thật, không rút gọn.',
      'Thêm 2 chip mới trong Lark × Agents: "🔎 Soát lỗi workflow" (tìm workflow tắt/nhánh chết/xung đột/trỏ cột đã xoá…) và "🧩 Nên thêm workflow nào" (gợi ý automation base nên có, tạo trực tiếp được).',
      'Tạo workflow — chuẩn hoá draft cho đúng "luật" schema Lark: tự đặt tiền tố id bước (trig/act/branch) + sửa mọi tham chiếu, và đổi cột lựa chọn từ TÊN → option-ID (cần cài bản .dmg mới).',
      'Kiểm HỢP LỆ THẬT: tool bật thử workflow để Lark xác nhận schema (thay vì chỉ lưu nháp rồi báo "xong" giả) — cần cài bản .dmg mới.',
    ],
  },
  {
    version: '1.0.65',
    date: '2026-07-08',
    items: [
      'Tạo workflow: giờ TỰ ĐỌC LẠI để XÁC NHẬN workflow thật sự có nội dung trong Lark (trước đây chỉ tin code:0 nên báo "xong" giả). Nếu chưa tạo được thật, tool báo lỗi rõ + kèm dữ liệu gỡ lỗi (create/save/readback) để sửa nhanh.',
    ],
  },
  {
    version: '1.0.64',
    date: '2026-07-08',
    items: [
      'TẠO/XOÁ workflow Lark-native (thử nghiệm): trợ lý giờ có thể TẠO automation thật trong Lark (bitable_create_workflow) và xoá (bitable_delete_workflow) qua phiên Lark web. Luôn hỏi xác nhận trước khi ghi; mặc định tạo ở trạng thái TẮT để bạn xem lại rồi bật. Nên thử trên bảng nháp trước.',
    ],
  },
  {
    version: '1.0.63',
    date: '2026-07-08',
    items: [
      'Đọc workflow — GIỜ LẤY ĐỦ TẤT CẢ + kèm TÊN: dùng Open API chính thức (/workflows + /block_workflows) để liệt kê mọi workflow (cả automation lẫn dạng sơ đồ) kèm tên & trạng thái, rồi lấy logic chi tiết qua phiên Lark. Không cần mở tay từng cái nữa.',
      'Nếu chưa Kết nối Lark web: vẫn hiện được TÊN + trạng thái tất cả workflow (chỉ thiếu phần logic chi tiết).',
    ],
  },
  {
    version: '1.0.61',
    date: '2026-07-08',
    items: [
      'Đọc workflow — dịch đúng khối "Nếu / Nếu không" (IfElseBranch): điều kiện → nhánh ĐÚNG / NGƯỢC LẠI, và so sánh cột-với-cột (vd cột A > cột B).',
      'Workflow dạng sơ đồ: nếu bạn MỞ chúng trong cửa sổ Lark của app, app sẽ tự đọc + dịch được (kể cả khi chưa tìm ra endpoint danh sách cây-node). Tên có thể để trống vì Lark không trả tên trong phần chi tiết.',
      'Thêm chế độ gỡ lỗi (debug) để app liệt kê các endpoint nội bộ đã bắt được — giúp tìm nốt endpoint cây-node của base.',
    ],
  },
  {
    version: '1.0.60',
    date: '2026-07-08',
    items: [
      'Đọc workflow — viết lại theo API THẬT của Lark (từ dữ liệu Network bạn gửi): endpoint danh sách KHÔNG có "bizType" (trước đây app luôn ép ?bizType=2 nên gọi sai), và danh sách đã nhúng sẵn nội dung nên dịch thẳng, không cần gọi từng cái.',
      'Dịch đúng sơ đồ luồng: trigger (thêm/sửa bản ghi, bấm nút) → điều kiện trên nhánh (Nếu…) → Tìm bản ghi, Vòng lặp, Rẽ nhánh, Thêm/Cập nhật bản ghi, chạy tiện ích (DocuGenius…). Dịch cả id bảng/cột/tuỳ chọn → tên (qua extra.TableMap + Open API).',
      'Sửa lỗi nhặt nhầm "user ID của người tạo" thành workflowID (workflow get by id not found). Nay dùng đúng trường workflowID.',
      'Bộ tự-bắt endpoint mở rộng (/space/api/* và /base/api/*, ghi lại cả đường dẫn lạ) để bắt được cả loại Workflow sơ đồ khi bạn mở nó trong cửa sổ Lark của app.',
    ],
  },
  {
    version: '1.0.59',
    date: '2026-07-08',
    items: [
      'Đọc workflow — sửa lỗi "chỉ ra automations, thiếu workflows sơ đồ": Lark có 2 loại tự động hoá riêng (Automation Center vs thư mục "Workflow" dạng sơ đồ) nằm ở endpoint/bizType khác nhau. Tool trước đây lấy ĐÚNG 1 danh sách rồi dừng nên chỉ thấy automations. Nay GỘP mọi nguồn (automation + workflow), dò nhiều bizType, và tự học endpoint/bizType từ những gì bắt được trong cửa sổ Lark → đọc được cả hai loại.',
    ],
  },
  {
    version: '1.0.58',
    date: '2026-07-08',
    items: [
      'Đọc workflow: sau khi lấy được danh sách, giờ rút đúng workflowID của từng mục (dò theo chuỗi số ~19 chữ số, bất kể tên trường) → đọc + giải thích được logic từng workflow (trigger → điều kiện → hành động). Nếu list đã kèm sẵn chi tiết thì dịch thẳng.',
    ],
  },
  {
    version: '1.0.57',
    date: '2026-07-08',
    items: [
      'Sửa lỗi "đọc workflow ra rỗng": tool trước đây vô tình nhận endpoint CẤU HÌNH automation (limits/apis) tưởng là danh sách. Nay chỉ nhận response THỰC SỰ là danh sách workflow; bắt thêm cả endpoint /automation; khi chưa bắt được thì báo rõ + hướng dẫn mở tab "Tự động hoá" để app tự học endpoint.',
    ],
  },
  {
    version: '1.0.56',
    date: '2026-07-08',
    items: [
      'Đọc workflow không cần mò base_id nữa: app TỰ BẮT đúng endpoint nội bộ khi bạn mở tab "Tự động hoá" của Base trong cửa sổ Lark (Cài đặt → Kết nối Lark web → "Mở cửa sổ Lark"). Có sẵn ô dán URL request thủ công để dự phòng. Tool cũng tự thử nhiều đường dẫn.',
    ],
  },
  {
    version: '1.0.55',
    date: '2026-07-08',
    items: [
      'Thêm hiệu ứng "Trợ lý đang soạn…" khi AI đang xử lý — UI mượt hơn.',
      'Làm rõ: "Kết nối Lark web" chỉ cần 1 LẦN cho cả tài khoản, dùng được với MỌI Base (không phải chọn 1 base).',
    ],
  },
  {
    version: '1.0.54',
    date: '2026-07-08',
    items: [
      'Đọc workflow: khi lỗi giờ báo RÕ nguyên nhân (sai máy chủ / chưa đăng nhập / base_id sai) kèm HTTP status + máy chủ đang mở, thay vì chỉ "phiên hết hạn". Và bắt buộc dán URL Base khi Kết nối Lark web (để mở đúng máy chủ của bạn, không mở trang chung).',
    ],
  },
  {
    version: '1.0.53',
    date: '2026-07-08',
    items: [
      'Chip "Đọc workflow" giờ tự điền app_token của base đang áp dụng vào lệnh — khỏi bị gọi tool với app_token rỗng. Sau khi Kết nối Lark web là bấm chạy được ngay.',
    ],
  },
  {
    version: '1.0.52',
    date: '2026-07-04',
    items: [
      'Sửa banner "Tải bản cài mới" không hiện: trước đây bị chặn khi giao diện (code-push) mới hơn số bản cài — nay hiện đúng mỗi khi PHẦN LÕI trên máy cũ hơn yêu cầu.',
    ],
  },
  {
    version: '1.0.51',
    date: '2026-07-04',
    items: [
      'Thêm nút "🔧 Đọc workflow" ngay trong thanh Hỏi nhanh (khi có Base áp dụng) — bấm là đọc workflow của base đó, khỏi vào Cài đặt tìm base_id. (Vẫn cần "Kết nối Lark web" 1 lần ở Cài đặt.)',
      'Từ nay các bản có thay đổi PHẦN LÕI sẽ hiện banner "Tải bản cài mới" (bấm tắt được) để bạn biết cần cài .dmg — thay vì âm thầm bỏ qua.',
    ],
  },
  {
    version: '1.0.50',
    date: '2026-07-04',
    items: [
      'Đọc workflow dễ hơn: chỉ cần hỏi "đọc workflow của base này" — trợ lý tự dùng app_token của Base đã đăng ký (khỏi phải tìm base_id). Cũng nhận URL Base/Wiki (tự resolve). Chỉ cần base_id riêng khi hai cách trên không đúng.',
    ],
  },
  {
    version: '1.0.49',
    date: '2026-07-04',
    items: [
      'Sửa GẤP lỗi "Application error" khi mở Cài đặt trong Lark × Agents (do panel "Kết nối Lark web" mới gọi hàm chưa có trên bản cài cũ). Giờ tự ẩn panel nếu bản cài chưa hỗ trợ — mở Cài đặt bình thường trở lại.',
    ],
  },
  {
    version: '1.0.48',
    date: '2026-07-04',
    items: [
      'ĐỌC được Automation/Workflow của Lark Base (thứ Open API không cho): thêm "Kết nối Lark web (thử nghiệm)" trong Cài đặt → trợ lý dùng tool bitable_read_workflows để đọc + GIẢI THÍCH trigger → điều kiện (Nếu/Nếu không) → hành động của từng workflow, dịch id cột/tuỳ chọn sang tên. Dùng API nội bộ của Lark (có thể thay đổi bất kỳ lúc nào); cookie chỉ gửi cho Lark, lưu mã hoá.',
    ],
  },
  {
    version: '1.0.47',
    date: '2026-07-04',
    items: [
      'Sửa triệt để lỗi "chỉ tên cột mà không xong được" trên base lớn: cột lựa chọn có HÀNG TRĂM option làm phản hồi lên tới ~240KB/bảng → trợ lý cũ tràn context, đổ ra file rồi không đọc lại được nên chỉ ghép 15/26 bảng. Giờ cột lựa chọn chỉ trả về số lượng + ~20 giá trị mẫu (ĐẦY ĐỦ 100% thì đặt full=true cho từng cột) → liệt kê đủ mọi bảng, không tràn.',
      'Trả lời GỌN hơn: trình bày súc tích, không rào đón/lặp lại, không chèn cảnh báo "phản hồi quá lớn".',
    ],
  },
  {
    version: '1.0.46',
    date: '2026-07-03',
    items: [
      'Tóm tắt base "chuẩn" hơn: thêm công cụ bitable_base_overview — MỘT lần gọi trả về mọi bảng + cột (gọn) + số bản ghi thật + ~5 bản ghi MẪU mỗi bảng (giá trị đã cắt gọn). Giá trị dropdown lấy đúng "đang được chọn" từ bản ghi mẫu (không dội toàn bộ options). Chạy song song có giới hạn nên nhanh kể cả base nhiều bảng.',
    ],
  },
  {
    version: '1.0.45',
    date: '2026-07-03',
    items: [
      'Sửa lỗi liệt kê thiếu bảng: khi quét cột (bitable_list_fields), các cột dropdown trước đây trả về TOÀN BỘ options làm payload phình to → trợ lý quá tải, chỉ tóm được vài bảng. Giờ mặc định gọn (chỉ số lượng + vài options mẫu) → liệt kê ĐẦY ĐỦ mọi bảng (kể cả bảng rỗng), dù 26 hay 100+ bảng, không hỏi lại.',
      'Thêm khả năng nhận link: dán URL Lark bất kỳ (kể cả …/wiki/…) vào chat, trợ lý tự resolve ra đúng Base để thao tác (tool bitable_resolve_url).',
      'Chẩn đoán đúng khi 1 Base trả về rỗng dù đã đăng nhập: có thể Base thuộc sở hữu người khác chưa chia sẻ, hoặc app_token nhầm từ Wiki — trợ lý hướng dẫn đúng thay vì đòi "thêm app cộng tác viên".',
      'Ô "Áp dụng base cho hội thoại" có thêm thanh TÌM KIẾM (lọc theo tên khi gõ) cho nhanh khi có nhiều base.',
    ],
  },
  {
    version: '1.0.44',
    date: '2026-07-03',
    items: [
      'Sửa chẩn đoán khi đăng nhập tài khoản Lark mà đọc Base ra RỖNG: nguyên nhân thật là token cá nhân THIẾU quyền Bitable (scope bitable:app chưa bật/publish trên app) — không phải do "app chưa là cộng tác viên". Trợ lý giờ nói đúng cách sửa (bật + phát hành scope trong Developer Console rồi đăng nhập lại), và có banner cảnh báo ngay khi phát hiện thiếu quyền.',
    ],
  },
  {
    version: '1.0.42',
    date: '2026-07-03',
    items: [
      'Thanh "⚡ Hỏi nhanh" (Lark × Agents): mỗi mục có nút ℹ️ — bấm để xem modal giải thích mục đó gửi yêu cầu gì cho trợ lý (kèm nút "Chạy ngay").',
      'Thêm "Hỏi nhanh" của riêng bạn: bấm "＋ Thêm" để tạo câu hỏi hay dùng (vd "📈 Đánh giá dữ liệu tháng này") — lưu lại và hiện thành nút bấm-một-cái, khỏi gõ lại. Có thể xoá.',
      'Đổi tên nhãn "Kỹ năng" → "Hỏi nhanh" cho đúng bản chất (các câu hỏi bấm nhanh).',
    ],
  },
  {
    version: '1.0.41',
    date: '2026-07-03',
    items: [
      'Lark × Agents: thêm nút "📝 Tóm tắt hội thoại" ở thanh Kỹ năng — tóm tắt nhanh những gì đã trao đổi trong cuộc trò chuyện.',
      'Thanh Kỹ năng của Lark có thêm chip "🔐 Phân quyền" để xem nhanh vai trò + quyền của base đang chọn.',
    ],
  },
  {
    version: '1.0.40',
    date: '2026-07-03',
    items: [
      'Lark × Agents ĐỌC & SỬA được PHÂN QUYỀN Base: xem các vai trò + quyền theo bảng/bản ghi/cột, thành viên mỗi vai trò, và (chế độ Thực thi) tạo/sửa/xoá vai trò + thêm/gỡ thành viên. Cần Base đã bật "Phân quyền nâng cao" + app có scope bitable:app.',
      'Yêu cầu tính năng ngay trong app: nút Góp ý (góc dưới phải) giờ có 2 mục "🐛 Báo lỗi" / "🌟 Yêu cầu tính năng" — gửi thẳng cho đội Larkwave, không còn phải hỏi "báo cho ai".',
      'Gọn lại thanh điều khiển ở Lark: dồn về 1 dòng; chú thích "đổi agent giữa chừng" chuyển vào nút ℹ️; công tắc hiển thị rõ "Đang dùng CLI" ⇄ "Đang dùng API" kèm ℹ️ giải thích.',
      'Đổi tên "Claude Code" → "Claude CLI" cho đồng bộ (Grok/Gemini/Codex CLI); khi thu gọn sidebar, các thẻ agent hiển thị gọn (Cl/Gk/Gm/Cx) không bị tràn.',
    ],
  },
  {
    version: '1.0.39',
    date: '2026-07-03',
    items: [
      'API trực tiếp (không cần CLI): chạy AI bằng API key của nhà cung cấp — Claude, GPT, Grok, Gemini — thay vì phải cài CLI trên máy. Bật công tắc "API trực tiếp" + dán key ở Cài đặt → Trình AI / CLI.',
      'Vì phần này thay đổi lõi (main process) nên cần TẢI + CÀI LẠI bản 1.0.39 (bản cũ không tự có tính năng qua code-push).',
      'Lưu ý: đường dẫn GPT/Grok/Gemini mới hoàn thiện theo tài liệu chính thức, cần bạn test bằng key thật; Claude đã kiểm theo chuẩn API.',
    ],
  },
  {
    version: '1.0.38',
    date: '2026-07-02',
    items: [
      'Sửa thông báo cập nhật gây phiền: chỉ nhắc "tải bản cài mới" khi bản cập nhật THỰC SỰ thay đổi phần lõi. Các bản chỉ đổi giao diện sẽ tự cập nhật ngầm (code-push) mà KHÔNG bắt tải/cài lại nữa. (Trước đây mọi bản đều nhắc cài lại.)',
      'Gộp đầy đủ bản 1.0.37: "Tự động nạp Base" quét cả Wiki để không sót Base.',
    ],
  },
  {
    version: '1.0.37',
    date: '2026-07-02',
    items: [
      'Tự động nạp Base: giờ quét CẢ WIKI (không chỉ Drive) — tìm được các Base nằm trong cấu trúc Wiki (vd cây "1.1 / 1.2 …") mà trước đây bị bỏ sót. Đây là lý do trước đó "không lấy được hết Base".',
    ],
  },
  {
    version: '1.0.36',
    date: '2026-07-02',
    items: [
      'Lark × Agents: thêm nhanh Base ngay trong khung chat (ô "dán app_token/URL" ở bảng chọn Base + nút "＋ Base mới" trên thanh Base áp dụng) — khỏi phải vào Cài đặt.',
      'Chia sẻ hội thoại: sửa lỗi vỡ định dạng — bảng markdown (danh sách cột…) giờ hiển thị đúng như trong app; dùng chung bộ render với chat.',
      'Ảnh đính kèm giờ được lưu vào hội thoại và hiển thị lại (cả trong lịch sử chat lẫn khi chia sẻ), thay vì chỉ hiện tên "📎 file".',
      'Agent hiểu rõ hơn Base vs Bảng: khi bạn thấy "nhiều bảng" mà chỉ liệt kê được ít, agent sẽ giải thích (thường là nhiều BASE riêng) và gợi ý "Tự động nạp Base"/đăng nhập QR thay vì báo nhầm "chỉ có 1 bảng".',
    ],
  },
  {
    version: '1.0.35',
    date: '2026-07-02',
    items: [
      'Hiệu năng: sửa lỗi Trang chủ & Lark × Agents load quá lâu / treo — cache trạng thái agents (Claude/Grok/Gemini/Codex), gộp lần dò, không còn spawn shell lặp lại. Vào nhanh, thao tác được ngay.',
      'Lark × Agents: tự động kiểm tra & báo khi kết nối/token hết hạn (nút "Kết nối lại"), không còn im lặng đến khi chat lỗi.',
      'Lark × Agents: thêm MÔ TẢ cho từng Base — AI hiểu dữ liệu từng Base mà không cần nhắc lại.',
      'Lark × Agents: CHIA SẺ hội thoại — tạo link công khai xem trên web (app.toolswave.net/lark/s/…), copy/mở/bỏ chia sẻ.',
      'Lark × Agents: TỰ ĐỘNG HOÁ (Larkwave) — tạo quy tắc "khi bản ghi khớp điều kiện → gửi tin nhắn / cập nhật bản ghi / gọi webhook", chạy định kỳ. Giải pháp thay cho automation của Lark (Lark không cho tạo bằng API).',
    ],
  },
  {
    version: '1.0.34',
    date: '2026-06-30',
    items: [
      'Cải tiến sidebar: giữ user Larkwave chính, hiển thị danh sách tất cả agents (Claude/Grok/Gemini/Codex) bên dưới để người dùng biết agents đang có. Thêm gợi ý cài đặt & kỹ năng agents.',
      'Settings: tách riêng phần "API Keys (Quản lý API)" rõ ràng, lưu ý khác với token CLI cá nhân. Nhúng ClaudeKeyManager trực tiếp.',
      'Loading & splash: thay thế full-screen Spin bằng AppShell + overlay, splash có logo, show UI sớm thay vì chỉ loading trắng. Desktop window show ngay.',
      'Performance: tối ưu load trang chủ và cài đặt agents (giảm chặn UI, load shell sớm hơn, overlay thay vì thay thế).',
      'Website/download: cập nhật text nhất quán với "AI" thay hardcode Claude.',
    ],
  },
  {
    version: '1.0.33',
    date: '2026-06-30',
    items: [
      'Sidebar: hiển thị user Larkwave + danh sách agents (Claude/Grok/...) bên dưới để xem agents đang có. Gợi ý cài đặt & kỹ năng.',
      'Cài đặt: phần "API Keys (Quản lý API)" riêng, rõ khác với token CLI cá nhân.',
      'Splash/loading: thay Spin full bằng shell app + overlay + splash có logo, show app sớm thay vì chỉ loading.',
      'Perf: giảm chặn UI home & cài đặt agents, load sớm hơn.',
      'Sửa nhầm lẫn agents: sidebar desktop hiển thị tài khoản Larkwave (Google login) chính; khối Claude local để phụ (không còn nhầm khi login Google).',
      'Đổi nhãn "Lark × Claude" → "Lark × Agents" nhất quán khắp app + web (hỗ trợ đầy đủ Claude / Grok / Gemini / Codex).',
      'Desktop vào app không còn gate ép buộc Claude: giờ chấp nhận bất kỳ runner/AI nào sẵn sàng. Giảm khựng loading khi khởi động.',
      'Cài đặt → Trình AI / CLI: rõ ràng phần nhập + quản lý API key cho tất cả CLI (không chỉ Claude).',
    ],
  },
  {
    version: '1.0.32',
    date: '2026-06-29',
    items: [
      'Lark × AI: chọn Claude / Grok / Gemini / Codex + model trong chat; đổi agent giữa chừng trong cùng phiên (lịch sử UI giữ, transcript nối lại).',
      'Mỗi phiên Lark lưu runner/model; sidebar hiện agent; badge trên từng câu trả lời.',
      'Bot Lark: cấu hình agent trả lời (mặc định Claude, có thể Grok…). Orchestrator tool loop cho non-Claude.',
    ],
  },
  {
    version: '1.0.31',
    date: '2026-06-29',
    items: [
      'Lịch sử tách tab: Lượt (accordion) · Phiên cũ (archive) · Checkpoint (mỗi lần gửi) — không còn nhồi hết vào một ô chat.',
    ],
  },
  {
    version: '1.0.29',
    date: '2026-06-29',
    items: [
      'Grok CLI: nhận đăng nhập `grok login` (OAuth grok.com, ~/.grok/auth.json) — không còn báo nhầm "thiếu key" khi terminal đã chạy được; cũng đọc XAI_API_KEY từ shell (.zshrc).',
    ],
  },
  {
    version: '1.0.28',
    date: '2026-06-29',
    items: [
      'Cài đặt → Trình AI / CLI hiện rõ trạng thái từng gói (đã cài / sẵn sàng / thiếu key) kèm đường dẫn binary thật trên máy; khung soạn cũng báo khi thiếu cài/key.',
    ],
  },
  {
    version: '1.0.27',
    date: '2026-06-29',
    items: [
      'CHỈNH SỬA app đáng tin hơn: khi bạn yêu cầu sửa/thêm tính năng, AI chỉ đụng đúng phần cần — KHÔNG còn vô tình xoá hay viết lại những trang/tính năng không liên quan, và TỰ KIỂM TRA (thư viện đã khai báo đủ, không để code dở/“…”, đổi tên thì cập nhật mọi nơi gọi) TRƯỚC khi báo hoàn tất.',
    ],
  },
  {
    version: '1.0.26',
    date: '2026-06-28',
    items: [
      'Sửa lỗi app KẸT trạng thái “đang chạy” mãi: app bị treo/tắt giữa chừng giờ tự thoát trạng thái (mở lại app là hết quay vòng), tiến trình AI treo quá lâu (không phản hồi ~6 phút) tự dừng, và mọi lần dựng dù lỗi/huỷ/gián đoạn đều được chốt trạng thái đúng — không còn báo nhầm “hoàn tất”.',
    ],
  },
  {
    version: '1.0.25',
    date: '2026-06-27',
    items: [
      'KỸ NĂNG (Skills) chia theo từng model: mỗi skill chọn áp dụng cho Claude / Grok / Gemini / Codex (mặc định dùng chung) hoặc chỉ vài model. Trang Skills có tab lọc theo model + chip hiển thị phạm vi + sửa nhanh. Skill tự đồng bộ vào đúng từng CLI (Codex dùng AGENTS.md).',
    ],
  },
  {
    version: '1.0.24',
    date: '2026-06-26',
    items: [
      'ĐIỀU KHIỂN TỪ XA ("Máy của tôi"): từ ĐIỆN THOẠI nhắn 1 câu lệnh vào hội thoại "Máy của tôi" trên web → máy tính (đang mở app + bật "Điều khiển từ xa") tự nhận lệnh qua kênh thời gian thực, chạy, rồi báo tiến độ + kết quả ngược về điện thoại. Bật/tắt trong phần Cài đặt; có token webhook để kích hoạt từ Shortcut/bot.',
      'CHỌN TRÌNH AI / CLI: ngoài Claude, giờ chạy được nhiều CLI — Claude · Grok · Gemini · Codex. Chọn nhà cung cấp + model ngay ở khung soạn, kết nối/dán key từng trình trong Cài đặt → "Trình AI / CLI".',
    ],
  },
  {
    version: '1.0.22',
    date: '2026-06-26',
    items: [
      'Nhắn tin bạn bè NGAY TRONG APP: nút hộp thư (✉) ở thanh trên + cửa sổ chat nổi; vào "Bạn bè" → "Nhắn tin" để chat (không còn mở web). Tin nhắn cập nhật tự động.',
    ],
  },
  {
    version: '1.0.21',
    date: '2026-06-26',
    items: [
      '(Sắp tới: ô Terminal log + shell thật, và nhắn tin bạn bè ngay trong app.)',
    ],
  },
  {
    version: '1.0.19',
    date: '2026-06-26',
    items: [
      'Kéo-thả hội thoại vào danh mục mượt & chắc hơn (vùng kéo riêng cho mỗi thẻ).',
      'Lark: hướng dẫn rõ ràng — lỗi “Invalid redirect URL (20029)” nghĩa là CHƯA thêm Redirect URL https://toolswave.net/lark/callback vào app Lark (Developer Console → Security Settings → Redirect URL). Có nút mở Developer Console.',
    ],
  },
  {
    version: '1.0.18',
    date: '2026-06-26',
    items: [
      'Sửa lỗi đăng nhập Lark (quét QR) bị lỗi + modal không đóng được; nay đăng nhập chạy đúng.',
    ],
  },
  {
    version: '1.0.17',
    date: '2026-06-26',
    items: [
      'Hiện rõ ngăn xếp công nghệ mặc định (React · TypeScript · Ant Design · Tailwind · framer-motion · Node + SQLite) khi để "Tự động".',
    ],
  },
  {
    version: '1.0.16',
    date: '2026-06-25',
    items: [
      'Dựng app SẠCH + tiết kiệm hơn: Claude không còn tự chạy / hỏi duyệt "npm install" liên tục (Larkwave tự cài thư viện + xem trước) — bớt rối, đỡ tốn token.',
      'Nút "Trang/API" giờ hiện ĐÚNG các trang & endpoint THẬT của app (Claude tự khai báo khi dựng), thay vì đoán /admin, /api.',
    ],
  },
  {
    version: '1.0.11',
    date: '2026-06-25',
    items: [
      'Dựng app: thêm mục "Số trang & nội dung" — chọn "Tự động" để AI tự thiết kế các trang, hoặc "Tự chọn trang" để liệt kê + mô tả từng trang (Trang chủ, Về chúng tôi, Bài viết, Liên hệ…), thêm trang tuỳ ý.',
    ],
  },
  {
    version: '1.0.8',
    date: '2026-06-24',
    items: [
      'Banner cập nhật: nút "Tải bản cài mới" mở thẳng trang tải bản cài (.dmg/.exe) — trước đây bấm chỉ tải lại giao diện nên không cập nhật được phần lõi. Đã ẩn thì không nhắc lại mỗi lần mở.',
    ],
  },
  {
    version: '1.0.7',
    date: '2026-06-24',
    items: [
      'Sửa lỗi: đăng xuất Claude giờ HIỆN lại màn kết nối (trước bị kẹt vì token/API key chưa xoá); màn kết nối hiển thị toàn màn hình.',
    ],
  },
  {
    version: '1.0.6',
    date: '2026-06-24',
    items: [
      'Lark: đăng nhập QR giờ xin thêm quyền Lịch (Calendar) — Claude xem/tạo sự kiện được như Base/Docs/Sheets (nhớ bật scope Calendar trong Lark Console).',
    ],
  },
  {
    version: '1.0.5',
    date: '2026-06-24',
    items: [
      'Phiên bản & cập nhật: chân trang hiện đúng phiên bản GIAO DIỆN đang chạy, và app không còn tải nhầm bản giao diện cũ từ máy chủ (chống "tụt" về bản cũ) — bạn thấy ngay khi có bản mới.',
      'Lark × Claude ổn định hơn: tự thử lại khi mạng chập chờn / bị giới hạn tần suất (tôn trọng Retry-After); KHÔNG còn tự đăng xuất Lark khi chỉ là lỗi mạng tạm thời; báo lỗi tiếng Việt rõ ràng kèm "mã hỗ trợ" (log_id) khi thiếu quyền/không tìm thấy.',
      'Claude biết HỎI khi cần: thiếu thông tin (Base/bảng/ID nào), cần bạn quyết định, hoặc cần cấp quyền/cấu hình Lark — Claude hỏi bạn ngay trong khung chat thay vì đoán bừa.',
      'Quản lý API key của nhóm: thêm nhiều API key Anthropic (sk-ant-api…), kiểm tra hợp lệ + chọn key đang dùng — cách hợp lệ để nhiều người cùng chạy Claude (ở màn hình kết nối Claude và khu Quản trị).',
    ],
  },
  {
    version: '1.0.4',
    date: '2026-06-23',
    items: [
      'Lark Sheets: ĐỌC vùng dữ liệu giờ chạy đúng (sửa lỗi mã hoá range) + thêm GHI vùng dữ liệu — lưu kết quả phân tích trở lại bảng tính.',
      'Lark tin nhắn dùng được thực sự: liệt kê nhóm/chat, đọc lịch sử hội thoại, tra open_id theo email/điện thoại rồi gửi đúng người/nhóm (không còn phải tự đoán ID).',
      'Lark Base: lọc + sắp xếp bản ghi phía máy chủ khi tìm (nhanh hơn, đúng hơn).',
      'Lark bot: hiện hoạt động (số tin nhận/trả lời/lỗi + lỗi gần nhất) để biết bot có nhận tin không.',
      'Sửa lỗi: đăng xuất/ngắt kết nối Lark giờ xoá sạch phiên tài khoản cá nhân; xác nhận thao tác ghi không còn treo vô hạn; báo lỗi rõ ràng khi thiếu Claude CLI; chặn mở nhiều cửa sổ đăng nhập Lark cùng lúc.',
    ],
  },
  {
    version: '1.0.3',
    date: '2026-06-23',
    items: [
      'Lark × Claude: đăng nhập bằng tài khoản Lark (quét QR) — Claude thao tác toàn quyền như bạn (mọi Base, Docs, Sheets, Wiki, Drive, tin nhắn).',
      'Lark: "Tự động nạp Base của bạn" — không cần thêm từng Base thủ công.',
      'Báo lỗi / góp ý ngay trong app (đính kèm ảnh, tính điểm thưởng) như trên web.',
      'Kết nối Claude: dán token (API key sk-ant-api… hoặc token đăng nhập sk-ant-oat…) thay cho đăng nhập trình duyệt.',
      'Sửa: tự phục hồi khi phiên Claude trên Lark không nối lại được (hết "Phiên Claude kết thúc với lỗi").',
      'Có trang tải app trên website.',
    ],
  },
  {
    version: '1.0.2',
    date: '2026-06-23',
    items: [
      'Offline-first: server sập vẫn xem được dữ liệu account đã lưu + banner báo mất kết nối.',
      'Lark × Claude: sao lưu hội thoại/Base/cài đặt lên tài khoản (đồng bộ đa thiết bị, không mất khi mất máy).',
      'Lark × Claude: đính kèm tài liệu + dán ảnh để Claude đọc, phân tích rồi mới góp ý/thiết kế.',
      'Sửa: thêm Base mới hiện ngay trong chat (không cần reload).',
      'Có bản Windows (x64).',
    ],
  },
  {
    version: '1.0.1',
    date: '2026-06-23',
    items: [
      'Lark × Claude: hội thoại áp dụng NHIỀU Base, thanh "Kỹ năng" nhanh, "Tự động duyệt" thao tác ghi, lịch sử trò chuyện theo Base, chat full màn hình.',
      'Lark: thêm tool nhập/sửa hàng loạt + tạo view Kanban; render bảng markdown đẹp; gom cấu hình vào nút "Cài đặt".',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-06-22',
    items: [
      'Lark × Claude: hỏi đáp & chỉnh sửa dữ liệu Lark (Base, tin nhắn, tài liệu, danh bạ).',
    ],
  },
];

/** Current app version = the newest changelog entry. */
export const APP_VERSION = CHANGELOG[0].version;
