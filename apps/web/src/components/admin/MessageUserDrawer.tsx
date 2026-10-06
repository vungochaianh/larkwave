"use client";

import { useEffect, useState } from "react";
import { App, Button, Card, Checkbox, Drawer, Form, Input, Space, Tag, Typography } from "antd";
import { SendOutlined } from "@ant-design/icons";
import { V } from "@larkwave/ui";
import { api } from "@/lib/api";

const { TextArea } = Input;
const { Text } = Typography;

/** `notify()` cắt tiêu đề ở 200 và thân ở 1000 — ô soạn phải nói ra hai con số đó. */
const TRAN_TIEU_DE = 200;
const TRAN_THAN = 4000;
const TRAN_THONG_BAO = 1000;

/**
 * Soạn và gửi một tin nhắn cho MỘT người dùng: thư và/hoặc thông báo trong app.
 *
 * VÌ SAO CÓ MÀN NÀY
 *
 * Nền tảng có người dùng thật nhưng không có đường nào nói với họ khi xảy ra sự cố. Mọi
 * `notify()` trong kho đều là thông báo tự động (tặng gói, tin nhắn bạn bè), và không có màn nào
 * soạn thư. Đo ngày 24/09/2026: một người dùng mất bốn site vì một lỗi của hệ thống; lỗi đã sửa
 * xong mà không có cách nào báo cho họ — phải đi soạn thư tay ngoài sản phẩm.
 *
 * BA ĐIỀU Ở ĐÂY KHÁC VỚI MÀN SOẠN BÀI VIẾT (và cố ý khác)
 *
 *  1. XEM TRƯỚC LÀ VĂN BẢN TRƠN, không phải Markdown. Máy chủ escape toàn bộ HTML rồi chỉ đổi
 *     xuống dòng thành <br>; thông báo trong app cũng hiện thân như chữ trơn. Cắm bộ render
 *     Markdown vào đây là để người vận hành thấy chữ đậm và danh sách, trong khi thư thật hiện
 *     ra `**đậm**` nguyên xi — một ô xem trước nói dối còn tệ hơn không có ô nào.
 *  2. NÓI RA GIỚI HẠN. Thông báo trong app bị cắt ở 1000 ký tự; thư thì không. Một bức dài gửi
 *     cả hai kênh sẽ tới nơi theo hai hình dạng khác nhau, nên chỗ này cảnh báo trước khi gửi.
 *  3. BÁO KẾT QUẢ TỪNG KÊNH. `sendNotice` trả false khi SMTP hỏng và `notify` nuốt lỗi của chính
 *     nó — một câu "Đã gửi" chung chung sẽ nói dối đúng vào lúc cần biết sự thật nhất.
 */
export default function MessageUserDrawer({
  open,
  userId,
  email,
  name,
  onClose,
}: {
  open: boolean;
  userId: string;
  /** Chỉ để HIỂN THỊ. Máy chủ tự đọc địa chỉ từ CSDL — thân yêu cầu không mang địa chỉ nào. */
  email: string;
  name?: string | null;
  onClose: () => void;
}) {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm();
  const [dangGui, setDangGui] = useState(false);
  const than = Form.useWatch<string>("body", form) ?? "";
  const tieuDe = Form.useWatch<string>("subject", form) ?? "";
  const guiEmail = Form.useWatch<boolean>("email", form) ?? true;
  const guiTrongApp = Form.useWatch<boolean>("inApp", form) ?? true;

  // Mở lại thì trả ô soạn về trạng thái sạch: một bức thư cũ còn sót lại trong ô là cách dễ nhất
  // để gửi nhầm nội dung của người này cho người khác.
  useEffect(() => {
    if (open) form.resetFields();
  }, [open, form]);

  const gui = async () => {
    const v = await form.validateFields();
    if (!v.email && !v.inApp) {
      message.warning("Chọn ít nhất một kênh: email hoặc thông báo trong app.");
      return;
    }
    modal.confirm({
      title: "Gửi cho người dùng này?",
      content: (
        <div style={{ fontSize: 13 }}>
          <div>
            Người nhận: <strong>{email}</strong>
          </div>
          <div style={{ marginTop: 6, color: V.textSub }}>
            Kênh: {[v.email ? "email" : null, v.inApp ? "thông báo trong app" : null].filter(Boolean).join(" + ")}
          </div>
        </div>
      ),
      okText: "Gửi",
      cancelText: "Huỷ",
      onOk: async () => {
        setDangGui(true);
        try {
          const kq = await api.messageUser(userId, {
            subject: v.subject,
            body: v.body,
            email: !!v.email,
            inApp: !!v.inApp,
            ...(v.link ? { link: v.link } : {}),
          });
          // Nói đúng cái gì đã tới nơi. Hai kênh hỏng theo hai kiểu và cả hai đều im lặng.
          const xong: string[] = [];
          const hong: string[] = [];
          if (v.email) (kq.emailSent ? xong : hong).push("email");
          if (v.inApp) (kq.notified ? xong : hong).push("thông báo trong app");
          if (!hong.length) {
            message.success(`Đã gửi tới ${kq.to} (${xong.join(" + ")}).`);
            if (kq.notifiedTruncated) {
              message.warning(`Thông báo trong app bị cắt còn ${TRAN_THONG_BAO} ký tự; bản email thì đủ.`);
            }
            onClose();
          } else if (xong.length) {
            message.warning(`Chỉ ${xong.join(" + ")} đi được. ${hong.join(" + ")} KHÔNG gửi được.`);
          } else {
            message.error(
              v.email && !kq.emailConfigured
                ? "Không gửi được: máy chủ chưa cấu hình SMTP."
                : "Không gửi được kênh nào. Xem log máy chủ.",
            );
          }
        } catch (e) {
          message.error((e as Error).message);
        } finally {
          setDangGui(false);
        }
      },
    });
  };

  const canhBaoCat = guiTrongApp && than.length > TRAN_THONG_BAO;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`Nhắn cho ${name || email}`}
      width={Math.min(880, typeof window === "undefined" ? 880 : window.innerWidth - 40)}
      destroyOnHidden
      extra={
        <Space>
          <Button onClick={onClose}>Huỷ</Button>
          <Button type="primary" icon={<SendOutlined />} loading={dangGui} onClick={() => void gui()}>
            Gửi
          </Button>
        </Space>
      }
    >
      <div style={{ marginBottom: 12, fontSize: 13, color: V.textSub }}>
        Người nhận: <Tag style={{ margin: 0 }}>{email}</Tag>{" "}
        <span style={{ color: V.textFaint }}>— địa chỉ lấy từ hồ sơ, không sửa được ở đây.</span>
      </div>

      <Form form={form} layout="vertical" initialValues={{ email: true, inApp: true, link: "/overview" }}>
        <Form.Item
          name="subject"
          label="Tiêu đề"
          rules={[{ required: true, message: "Nhập tiêu đề" }, { min: 3, max: TRAN_TIEU_DE }]}
        >
          <Input maxLength={TRAN_TIEU_DE} showCount placeholder="Ví dụ: Về lỗi bản dựng hôm 23/09" />
        </Form.Item>

        <Form.Item
          name="body"
          label="Nội dung"
          extra="Văn bản thuần. Xuống dòng được giữ nguyên; Markdown và HTML sẽ hiện ra nguyên xi chứ không thành định dạng."
          rules={[{ required: true, message: "Nhập nội dung" }, { min: 3, max: TRAN_THAN }]}
        >
          <TextArea rows={12} maxLength={TRAN_THAN} showCount placeholder="Chào bạn,&#10;&#10;..." />
        </Form.Item>

        <Space size="large" wrap style={{ marginBottom: 8 }}>
          <Form.Item name="email" valuePropName="checked" noStyle>
            <Checkbox>Gửi email</Checkbox>
          </Form.Item>
          <Form.Item name="inApp" valuePropName="checked" noStyle>
            <Checkbox>Thông báo trong app</Checkbox>
          </Form.Item>
        </Space>

        <Form.Item
          name="link"
          label="Đường dẫn đính kèm"
          extra="Đường dẫn nội bộ, bắt đầu bằng /. Dùng cho nút trong thư và cho chỗ thông báo trỏ tới. Để trống thì không có nút."
          rules={[{ pattern: /^\//, message: "Phải bắt đầu bằng /", warningOnly: false }]}
        >
          <Input placeholder="/overview" maxLength={300} />
        </Form.Item>
      </Form>

      {canhBaoCat && (
        <div
          style={{
            margin: "4px 0 12px",
            padding: "8px 11px",
            borderRadius: 8,
            border: "1px solid #F59E0B",
            background: "rgba(245,158,11,0.08)",
            fontSize: 12.5,
          }}
        >
          Nội dung dài {than.length} ký tự. Thông báo trong app chỉ giữ {TRAN_THONG_BAO} ký tự đầu —
          bản email vẫn đủ.
        </div>
      )}

      {/* Xem trước: ĐÚNG hình dạng thư thật — chữ trơn, giữ nguyên ngắt dòng. */}
      <Card size="small" title="Xem trước (giống thư thật)" style={{ marginTop: 4 }}>
        <div style={{ maxHeight: 320, overflowY: "auto" }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 10, color: V.text }}>
            {tieuDe || <Text type="secondary">(chưa có tiêu đề)</Text>}
          </div>
          <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.7, color: V.text }}>
            {than || <Text type="secondary">(chưa có nội dung)</Text>}
          </div>
          {guiEmail && (
            <div style={{ marginTop: 14, fontSize: 12, color: V.textFaint }}>
              Thư sẽ gửi từ hộp thư Larkwave đang cấu hình trên máy chủ.
            </div>
          )}
        </div>
      </Card>
    </Drawer>
  );
}
