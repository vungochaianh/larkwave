Khảo sát App Desktop có các lỗi sau

Lỗi UIUX ở các phần
- Lỗi 1: Modal Phiên bản & thay đổi bị lỗi darkmode, gây trắng màn.
  Chính là phần này trong file VersionFooter.tsx
  <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: '#F6F5FE' }}>
            <div style={{ fontSize: 13 }}>
              Giao diện đang chạy: <strong>v{uiVersion}</strong>
              {nativeVersion ? <span style={{ color: '#9AA3B5' }}> · bản cài (native) v{nativeVersion}</span> : ''}
              {info?.latest && nativeVersion && info.latest !== nativeVersion ? ` · mới nhất v${info.latest}` : ''}
            </div>
            <div style={{ fontSize: 12.5, marginTop: 6, color: '#3A4256' }}>
              Giao diện:{' '}
              {remote ? <Tag color="success">Code-push từ xa ✓</Tag> : <Tag>Bản đóng gói</Tag>}
              {remote ? ' — đã nhận bản giao diện mới nhất qua mạng.' : ' — đang dùng bản kèm theo lúc cài.'}
            </div>
            {info?.reinstall && (
              <div style={{ marginTop: 8, fontSize: 12.5 }}>
                <Tag color="warning">Có bản cài mới (v{info.latest})</Tag> phần lõi đổi — hãy tải lại bản .dmg mới.
              </div>
            )}
            {info?.reinstall ? (
              // MAIN changed → unsigned app can't self-update; open the download page.
              <Button
                size="small"
                type="primary"
                icon={<DownloadOutlined />}
                style={{ marginTop: 10 }}
                onClick={() =>
                  runtime.openExternal
                    ? runtime.openExternal('https://app.toolswave.net/download')
                    : window.open('https://app.toolswave.net/download', '_blank')
                }
              >
                Tải bản cài mới (.dmg/.exe)
              </Button>
            ) : (
              runtime.applyUpdate && (
                <Button
                  size="small"
                  icon={<ReloadOutlined />}
                  loading={applying}
                  style={{ marginTop: 10 }}
                  onClick={async () => {
                    setApplying(true);
                    try {
                      await runtime.applyUpdate!();
                    } catch {
                      setApplying(false);
                    }
                  }}
                >
                  Kiểm tra & tải lại bản mới nhất
                </Button>
              )
            )}
          </div>
- Lỗi 2: Sửa lại AppShell.tsx tôi nghĩ các phần Trang chủ ( file HomeScreen.tsx ), App của tôi ( file AppsGrid.tsx ), Khám phá ( file ExploreView.tsx), Mẫu ( file HomeScreen.tsx trong function TemplateGallery ), Integrations ( file IntegrationsView.tsx) đây chính là các item menu nên nằm trong 1 group về Vibe Coding 
- Lỗi 3: Về trang chủ ( thay thế cái trang chủ hiện tại, sẽ báo cáo tổng quan các stats như về Lark và về các app vibe coding ) và 1 vài báo cáo thống kê để thay thể trang chủ hiện tại, trang chủ hiện tại hãy gộp với App của tôi và Mẫu => tạo thành item menu tên App của tôi 
- Lỗi 4: Trang cài đặt (file SettingsScreen.tsx) sao không thiết kế giao diện cho các content full width, và các card đó hãy thiết kế grid sao cho 1 hàng ngang có thể có 2 cột, 1 hàng dọc có thể có 2 có 1 xen kẽ nhau ( grid ) để tạo tính nghệ thuật nhưng vẫn chuyên nghiệp 
- Lỗi 5: Về nút icon báo lỗi FeedbackButton.tsx hãy để nó lên cùng với vị trí 
- Lỗi 6: Về phần bạn bè nên add vào phần hồ sơ, chia ra những người đã kết bạn
- Lỗi 7: Về trang khám phá (file ExploreView.tsx) thêm phần Khám phá người dùng ( FriendsViews ) và Xếp hạng (LeaderboardView.tsx) gộp lại thành 1 hoặc làm thành 1 group
- Lỗi 8: Hồ sơ và gói thanh toán (PricingView) nên là 1 trang thôi, lịch sử thì có thể mở bằng việc show modal 
- Lỗi 9: Trang Quản trị không cần, để tránh làm app build, deploy lâu hơn. Đã có trang cms rồi nên bỏ hết phần của trang quản trị ở app desktop đi
- Lỗi 10: Giới hạn hội thoại ở sidebar là 5, các hội thoại được ghim sẽ có icon ghim nhé
- Lỗi 11: Về trang Integrations ( file IntegrationsView.tsx) các card đang lệch nhau về content ở bên trong
Lỗi logic các phần
- Lỗi 1: Chức năng nhập từ thư mục ( file HomeScreen.tsx ) phần
{runtime.importLocalFolder && (
              <Button icon={<FolderOpenOutlined />} loading={importingFolder} onClick={() => void importFolder()}>
                Nhập từ thư mục
              </Button>
            )} 
=>  không có mở cửa sổ dự án thư mục hiện tại và import được
- Lỗi 2: Group lark có phần Kỹ năng => Về phần group vibe coding cũng phải có skills chứ để riêng biệt ra giữa lark và vibe coding
- Lỗi 3: Về trang Integrations ( file IntegrationsView.tsx) chưa có tài liệu kết nối và add dần nghĩa là phải làm chính sách tích hợp là nó add ở vào server mình ( mã hoá ) sau mình làm sao hỏi bên agents rồi sau làm sao mà agents add xong cũng không biết, và sau mình decode chạy được phía mình. Thì đấy mới là tích hợp chuẩn. Vể UIUX có nên để cả trang cài đặt và trang Integrations làm 1 không vì cài đặt hiện tại chỉ có views là config thôi chưa có group