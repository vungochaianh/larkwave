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
    version: '0.1.17',
    date: '2026-10-18',
    items: [
      "Sửa lỗi \"zalo_web_read: Script failed to execute\": phần đọc chạy một mạch cả trăm vòng cuộn và quét lại toàn bộ nội dung mỗi vòng nên trang quá tải và chết giữa chừng — chưa kịp cuộn tới ngày cần. Nay cuộn theo từng đợt ngắn do app điều phối, có trần thời gian, và một đợt lỗi cũng không làm hỏng cả lượt đọc.",
      "Báo cáo rõ hơn sau mỗi lần đọc: đã cuộn bao nhiêu đợt, ngày cũ nhất chạm tới, đã lên tới đầu hội thoại chưa.",
    ],
  },
  {
    version: '0.1.16',
    date: '2026-10-18',
    items: [
      "Đọc lịch sử Zalo theo KHOẢNG THỜI GIAN: hỏi \"tóm tắt nhóm X tháng 10\" thì app tự cuộn lên tới đúng ngày 1/10 rồi dừng, thay vì đoán số lần cuộn. Cách dừng cuộn cũng chặt hơn — trước đây hay dừng sớm giữa lúc Zalo đang tải thêm.",
      "Nói lại cho đúng: dòng \"dùng Zalo PC để tìm tin nhắn trước ngày …\" của Zalo chỉ giới hạn Ô TÌM KIẾM, không phải giới hạn nội dung. Cuộn lên trong hội thoại vẫn lấy được tin cũ hơn, và trợ lý không còn nói nhầm là \"Zalo Web không có tin cũ\".",
    ],
  },
  {
    version: '0.1.15',
    date: '2026-10-18',
    items: [
      "Sửa lỗi KHÔNG mở được nhóm trong cửa sổ Zalo Web: trước đây app bấm bằng sự kiện giả lập nên Zalo bỏ qua — ô tìm ra đúng nhóm nhưng bên phải vẫn là màn hình chào mừng, và vì thế đọc ra rỗng. Nay app gửi CÚ CLICK CHUỘT THẬT vào đúng toạ độ, rồi kiểm chứng đã mở được hội thoại chưa.",
      "Nói thật về giới hạn của Zalo Web: trang này chỉ giữ tin từ một mốc ngày nhất định (Zalo tự ghi trong ô tìm, ví dụ \"trước ngày 04/10\" phải dùng Zalo PC). Trợ lý sẽ báo đúng mốc đó thay vì hứa lấy được rồi thử đi thử lại.",
    ],
  },
  {
    version: '0.1.14',
    date: '2026-10-18',
    items: [
      "Sửa lỗi đọc cửa sổ Zalo Web ra rỗng: cách dò vùng tin nhắn cũ không khớp với giao diện Zalo nên không lấy được gì, kể cả khi màn hình đang hiện đầy tin. Nay dò theo ba cách chắc dần (từ đúng điểm giữa khung chat, quét toàn trang, cuối cùng đọc cả trang) và cuộn bằng cả hai kiểu để nạp thêm tin cũ.",
      "Nếu vẫn đọc ra rỗng, trợ lý sẽ nói thẳng là lỗi bộ đọc của Larkwave (không phải nhóm không có tin) và kèm thông tin chẩn đoán, thay vì bắt bạn bấm/đồng bộ lại.",
    ],
  },
  {
    version: '0.1.13',
    date: '2026-10-18',
    items: [
      "Cửa sổ Zalo Web GIỮ ĐĂNG NHẬP qua lần tắt app: quét QR một lần là dùng mãi, không phải quét lại mỗi lần mở Larkwave. Phiên được lưu mã hoá bằng kho khoá của máy (máy không có kho khoá thì không lưu), tự xoá sau 30 ngày, và bấm \"Đóng hẳn\" là xoá ngay.",
    ],
  },
  {
    version: '0.1.12',
    date: '2026-10-18',
    items: [
      "Trợ lý TỰ MỞ nhóm/hội thoại trong cửa sổ Zalo Web rồi đọc — không còn bắt bạn bấm vào nhóm rồi nhắn \"đọc tiếp\". Chỉ còn hai việc cần bạn: quét QR trong cửa sổ và bấm Đồng ý đồng bộ trên điện thoại.",
      "Hết vòng lặp \"Tự chạy tiếp\": lượt đang chờ bạn thao tác nay được coi là đã kết luận, app không tự chạy lại và in y hệt nữa. Ngày tháng kiểu Việt (1/10, 16/10) không còn bị đọc nhầm thành tiến độ \"1 trên 10\".",
    ],
  },
  {
    version: '0.1.11',
    date: '2026-10-18',
    items: [
      "Gộp phiên Zalo: dùng ĐÚNG mã thiết bị mà cửa sổ Zalo Web đã đăng nhập, thay vì tạo mã mới. Đo trên máy thật cho thấy cookie đã đủ (zpsid, zpw_sek) nhưng Zalo vẫn từ chối vì phiên gắn với thiết bị — đây là mảnh còn thiếu để một đăng nhập dùng được cho cả đọc lẫn gửi.",
      "Câu báo lỗi gộp phiên nói thêm có tìm thấy mã thiết bị của cửa sổ hay không, để biết chính xác còn kẹt ở đâu.",
    ],
  },
  {
    version: '0.1.10',
    date: '2026-10-18',
    items: [
      "Sửa gộp phiên Zalo lỗi \"Đăng nhập thất bại\": cookie đăng nhập của cửa sổ Zalo Web chỉ gắn chat.zalo.me nên không tới được các máy chủ con của Zalo khi gộp — nay cấp cookie cho cả tên miền .zalo.me. Nếu vẫn lỗi, câu báo lỗi giờ cho biết có những cookie phiên nào để dò tiếp.",
    ],
  },
  {
    version: '0.1.9',
    date: '2026-10-17',
    items: [
      "Zalo giờ chỉ cần MỘT lần đăng nhập: đăng nhập trong cửa sổ Zalo Web (quét QR trong đó) là xong — Larkwave dùng chung phiên đó cho cả ĐỌC lịch sử lẫn GỬI tin / lấy nhóm từ máy chủ, không phải quét QR riêng ở thanh bên nữa (Zalo chỉ cho một phiên web một lúc).",
      "Thêm nút «Bật gửi tin bằng phiên này» ở Cài đặt → Đồng bộ tin Zalo (tự bật sẵn sau khi bạn đăng nhập cửa sổ). Sửa lời mô tả cho đúng: cửa sổ Zalo Web là nơi đăng nhập Zalo chính.",
      "Lưu ý: phần gộp phiên để gửi tin là mới, cần thử trên tài khoản Zalo thật; nếu gửi chưa được thì bấm lại nút gộp phiên, hoặc báo mình.",
    ],
  },
  {
    version: '0.1.8',
    date: '2026-10-17',
    items: [
      "Sửa cửa sổ Zalo Web: nay nhận đúng việc bạn đã đăng nhập trong cửa sổ (trước đây kiểm tra quá sớm nên lúc báo đã đăng nhập, lúc lại báo chưa, khiến trợ lý hỏi tới hỏi lui). Chờ trang ổn định rồi mới kết luận.",
      "Đăng nhập cửa sổ Zalo Web là RIÊNG, làm NGAY TRONG CỬA SỔ đó (không dùng nút «Kết nối Zalo» ở thanh bên — đó là phiên khác, quét ở đó sẽ đá văng đăng nhập của cửa sổ). Trợ lý được hướng dẫn lại để không còn bắt bạn quét QR lòng vòng.",
      "Đọc tin cũ qua cửa sổ Zalo Web không cần phiên quét-QR còn sống; đăng nhập trong cửa sổ một lần là đọc được. Giữ cửa sổ mở trong lúc dùng.",
    ],
  },
  {
    version: '0.1.7',
    date: '2026-10-17',
    items: [
      "Đọc được nhiều tin nhóm Zalo hơn: sửa lỗi chỉ ra vài tin — nay lấy lịch sử nhóm từ kho tin đám mây của Zalo (tự lật nhiều trang).",
      "Lấy thêm tin Zalo cũ từ máy chủ (không cần điện thoại): nút «Lấy thêm tin cũ từ máy chủ» ở Cài đặt → Đồng bộ tin Zalo, và trợ lý tự làm khi bạn hỏi tới tin cũ.",
      "Cửa sổ Zalo Web ngay trong Larkwave: mở trang Zalo chính thức bằng chính phiên đã đăng nhập (khỏi quét QR lại). Bạn mở đúng hội thoại, bấm Đồng ý đồng bộ trên điện thoại nếu được hỏi — trợ lý đọc được lịch sử hiển thị ở đó (kể cả chat 1-1 cũ). Quản lý cửa sổ (mở/ẩn/tải lại/đóng) ở Cài đặt → Đồng bộ tin Zalo.",
      "Lưu tin Zalo trên máy (mã hoá, tuỳ chọn): tắt app mở lại vẫn còn; chọn giữ bao nhiêu ngày / tối đa mỗi hội thoại; có nút xoá. Máy không có kho khoá thì không lưu dạng thường.",
      "Trợ lý tìm tin Zalo theo từ khoá và theo khoảng thời gian, đọc lùi về quá khứ; kèm mục Hỏi đáp về đồng bộ ngay trong Cài đặt.",
    ],
  },
  {
    version: '0.1.6',
    date: '2026-10-17',
    items: [
      "Công tắc \"Tự động\" làm đúng tên gọi: bật lên thì mọi thao tác chạy luôn không hỏi — thêm, sửa, ghi đè, gửi tin Lark/Zalo/Gmail, tạo lịch. Chỉ thao tác XOÁ còn hỏi. Áp cho mọi cách chạy (Claude/Gemini trên máy, API key riêng, gói Larkwave).",
      "Gửi tin Zalo / thư Gmail không còn bị chặn số lượng: bỏ trần 30 tin Zalo/giờ và 40 thư/giờ, Gmail tới 100 người nhận/thư. App chỉ CẢNH BÁO rủi ro (Zalo có thể hạn chế/khoá tài khoản cá nhân gửi dày) — gửi thế nào là quyền của bạn.",
      "Lịch tự động gửi được Zalo/Gmail: nói \"cứ 1 phút gửi giờ hiện tại vào nhóm Zalo X, 30 lần thì dừng\" là agent tạo lịch chạy luôn, không cần bấm duyệt. Lịch mới có \"chạy N lần rồi tự tắt\", nhịp tính từ lúc bắt đầu mỗi lần chạy (đúng 1 phút một lần).",
      "Agent biết giờ hiện tại (giờ Việt Nam) ở mỗi lượt chat và mỗi lần lịch chạy — không còn trả lời \"mình không có đồng hồ\".",
      "Chỉ lịch do chính bạn tạo từ cuộc trò chuyện của mình mới dùng được Zalo/Gmail; bot Lark trong nhóm và lượt chia sẻ cho bạn bè vẫn không chạm được.",
    ],
  },
  {
    version: '0.1.5',
    date: '2026-10-17',
    items: [
      "Kỹ năng Zalo & Gmail: kết nối Zalo cá nhân (quét QR) và Gmail (mật khẩu ứng dụng) ở Kỹ năng → Kết nối. Bộ kỹ năng dựng sẵn mới: Đọc & tóm tắt tin Zalo, Gửi tin Zalo, Đọc & tìm thư Gmail, Gửi thư Gmail — gọi bằng /zalo-doc-tin, /zalo-gui-tin, /gmail-doc-thu, /gmail-gui-thu hoặc hỏi tự nhiên.",
      "Agent KHÔNG tự thao tác Zalo/Gmail: chỉ dùng trong kỹ năng có dùng đúng công cụ đó (dựng sẵn hoặc kỹ năng bạn tự soạn), chỉ trong cuộc trò chuyện của bạn — không chạy ở lịch tự động hay bot Lark trong nhóm. Lần gửi nào cũng hỏi bạn trước, kể cả khi bật Tự động duyệt.",
      "An toàn khi gửi: Zalo tối thiểu 8 giây giữa hai tin, tối đa 30 tin/giờ; Gmail tối đa 10 người nhận/thư, 40 thư/giờ. Đọc thư không đánh dấu đã đọc; tin Zalo chỉ giữ trong bộ nhớ, không ghi ra đĩa.",
      "Trợ lý kiểm tra (miễn phí, không dùng AI): nút khiên \"Kiểm tra\" trên thanh đầu tự kiểm Claude/Gemini đã cài + đăng nhập chưa, API key, Zalo, Gmail — thiếu thứ cần thiết thì báo ngay kèm nút \"Sửa ngay\" mở thẳng chỗ sửa (đăng nhập, dán key, quét QR Zalo, nhập Gmail), không phải vào Cài đặt.",
      "Sửa một chạm ở chỗ gặp lỗi: thẻ lỗi Claude có nút \"Đăng nhập lại Claude\" / \"Dùng API key\"; công cụ Zalo/Gmail báo chưa kết nối có nút kết nối; gõ /zalo-… hay /gmail-… khi chưa kết nối thì mở luôn bảng quét QR / Gmail.",
      "Kiểm API key Claude nói đúng nguyên nhân thay vì \"HTTP 400\": key mới tạo mà tài khoản Anthropic chưa nạp credit giờ được báo là key ĐÚNG kèm lời nhắc nạp tiền ở console.anthropic.com → Billing.",
    ],
  },
  {
    version: '0.1.4',
    date: '2026-10-15',
    items: [
      "Lark × Agents chạy đầy đủ bằng Gemini (Gemini CLI): gọi thẳng công cụ Lark như Claude, chữ hiện dần khi đang trả lời, nhớ hội thoại giữa các lượt. Thao tác ghi vẫn hỏi bạn qua hộp xác nhận.",
      "Thêm model Gemini 3.1 Pro, 3 Pro, 3 Flash và \"Tự chọn\" (Gemini tự chọn model theo độ khó của câu hỏi).",
      "An toàn hơn khi dùng Gemini: Gemini không còn được tự chạy lệnh trên máy hay ghi tệp; chỉ dùng công cụ Lark của app (và đọc tệp bạn đính kèm).",
      "Gemini chưa đăng nhập hoặc hết hạn mức thì báo rõ cách xử lý (chạy `gemini` → Login with Google) thay vì một lỗi khó hiểu.",
      "Sửa lỗi không thêm được API key Claude dạng mới (sk-ant-usr-…) mà Anthropic Console đang cấp: app nhận mọi API key Anthropic và kiểm trực tiếp với API, chỉ từ chối token đăng nhập / admin key kèm câu giải thích.",
      "Máy còn bản cài cũ mà thêm API key dạng mới (sk-ant-usr-…): app không báo lỗi khó hiểu nữa mà đề nghị dùng key ngay làm khoá Claude của máy (không cần cài lại), kèm lời nhắc cài bản mới để quản lý key trong danh sách.",
      "Thanh trên màn chat không còn báo nhầm \"Chưa có API key\" khi key đã thêm (tự làm mới ngay khi thêm/xoá key). Chọn \"API trực tiếp\" mà chưa kết nối Lark Bot (App ID) thì app nói rõ: lượt chat chạy bằng CLI trên máy, vẫn dùng API key của bạn.",
    ],
  },
  {
    version: '0.1.3',
    date: '2026-10-11',
    items: [
      "Mỗi tab (hội thoại) có TRANG Lark riêng trong khung: hai tab làm hai Base khác nhau chạy song song không còn giẫm lên nhau; đổi tab là khung đổi sang Base của tab đó.",
      "Tab khác đang chạy không còn khoá nút Gửi; mở tab mới gửi câu hỏi không còn tự từ chối hộp xác nhận đang chờ ở tab kia.",
      "Tài khoản Lark trên thanh khung Lark: xem ai đang đăng nhập, chuyển nhanh giữa nhiều tài khoản (không phải quét lại), Thêm tài khoản Lark, Đăng xuất.",
      "Đăng nhập lần đầu / thêm tài khoản mở thẳng trang đăng nhập Lark có mã QR, không còn dừng ở trang giới thiệu.",
    ],
  },
  {
    version: '0.1.2',
    date: '2026-10-10',
    items: [
      "Lark × Agents XOÁ được bảng, automation và khối Workflow khi bạn yêu cầu — một hộp xác nhận liệt kê đủ từng thứ (kèm số bản ghi), bảng và workflow vào thùng rác của Base nên khôi phục được; xoá xong tự đọc lại để kiểm.",
      "Sửa lỗi hội thoại cũ (nhất là hội thoại chép từ Toolswave) cứ nói \"đang ở chế độ Hỏi đáp\" và không dùng được công cụ mới: khi luật hay công cụ của app đổi, hội thoại tự chuyển sang phiên mới mà vẫn giữ lịch sử.",
      "Model bạn chọn (vd Haiku) giờ được dùng thật cho Lark × Agents — trước đây luôn chạy model mặc định.",
      "Chế độ Tự động không hỏi lại trong chat nữa: xoá/sửa/ghi đè chỉ hỏi đúng một lần qua hộp xác nhận.",
    ],
  },
  {
    version: '0.1.1',
    date: '2026-10-10',
    items: [
      "Đăng nhập Lark mặc định hiện MÃ QR để quét bằng app Lark trên điện thoại — kể cả trong khung Lark hẹp cạnh màn chat, nơi trang của Lark tự giấu nút quét mã.",
      "Nút \"Quét mã QR\" / \"Email / SSO\" trên thanh của khung Lark để đổi cách đăng nhập (email, số điện thoại, SSO, Google, Apple).",
      "\"Đăng nhập lại từ điện thoại\" giờ gửi lên đúng mã QR thay vì ảnh ô nhập email.",
    ],
  },
  {
    version: '0.1.0',
    date: '2026-10-07',
    items: [
      "Larkwave 0.1.0 — bản đầu tiên. Trợ lý AI làm việc thật trong Lark: kết nối tài khoản Lark, giao việc bằng một câu tiếng Việt hoặc tiếng Anh.",
      "Lark × Agents đọc và ghi Bitable, Docs, Sheets, Wiki, Drive, Lịch và tin nhắn — mọi thao tác ghi đều hỏi bạn trước, có tuỳ chọn \"nhớ lựa chọn\" cho lần sau.",
      "Nhận về tệp thật: Excel nhiều sheet có công thức và gộp ô, điền thẳng vào mẫu .xlsx có sẵn, Word và PDF.",
      "Đặc tả hệ thống: đọc cấu trúc Base và workflow trực tiếp từ Lark, mỗi lần đồng bộ hiện rõ phần thêm/đổi/gỡ.",
      "Tự động hoá theo lịch: gửi tin nhắn, cập nhật bản ghi, gọi webhook hoặc chạy AI agent theo giờ bạn đặt.",
      "Đồng bộ Bitable (CMS): giữ phiên Lark web luôn sống để các job đồng bộ tự chạy; theo dõi trạng thái, lỗi và nhật ký ngay trong app.",
      "Kỹ năng và Kỹ năng chéo (nhiều bước, kiểm chéo kết quả), chia sẻ hội thoại qua link công khai, điều khiển từ xa từ điện thoại.",
      "Giao diện gọn cho màn hình rộng: thanh bên chỉ còn chức năng Lark, mục tài khoản nằm trong menu ở ảnh đại diện; mặc định tiếng Việt.",
    ],
  },
];

/** Current app version = the newest changelog entry. */
export const APP_VERSION = CHANGELOG[0].version;
