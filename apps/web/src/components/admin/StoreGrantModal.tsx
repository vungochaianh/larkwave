"use client";

import { CheckCircleFilled, InfoCircleFilled } from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Descriptions,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Tag,
  Typography,
} from "antd";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatVnd } from "@/lib/billing";
import { formatDate } from "@/lib/format";
import { V } from "@larkwave/ui";
import {
  KIND_LABEL,
  type AdminStoreGrantResult,
  type AdminStoreRow,
} from "@/app/admin/store/_types";

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * Món đã chọn sẵn, khi hộp thoại mở từ trang chi tiết một sản phẩm. Khoá luôn ô chọn: người
   * đang đứng ở trang của món A mà cấp nhầm món B là lỗi không ai phát hiện ra cho tới khi khách
   * gọi lại.
   */
  listing?: Pick<AdminStoreRow, "id" | "name" | "kind"> | null;
}

interface Values {
  email: string;
  listingId: string;
  note?: string;
}

/** Ô chọn món chỉ cần ba trường — giữ đúng ba, để món chọn sẵn không phải giả vờ là cả một dòng. */
type ListingOption = Pick<AdminStoreRow, "id" | "name" | "kind">;

/**
 * CẤP DỰ ÁN CHO KHÁCH — đường bán hàng tay của hôm nay.
 *
 * Khách chốt qua điện thoại hoặc Zalo, chuyển khoản, nhân viên mở hộp thoại này và cấp. Trước
 * giờ việc đó làm bằng cách sửa thẳng cơ sở dữ liệu; tuyến `POST /admin/store/grants` tồn tại để
 * nó để lại giấy tờ (đơn 0đ + quyền + việc bàn giao ở trạng thái chờ) thay vì biến mất.
 *
 * Thứ đáng quan tâm nhất ở đây KHÔNG phải cái biểu mẫu mà là cách hiện KẾT QUẢ.
 *
 * Tuyến cấp là idempotent theo (người nhận, món): gọi lại không tạo đơn thứ hai, chỉ trả về đơn
 * cũ kèm `created=false`. Nhân viên bấm hai lần vì mạng chậm là chuyện xảy ra hằng tuần, nên câu
 * trả lời cho lần bấm thứ hai phải nói thẳng "người này đã có quyền từ trước" — chứ không phải
 * một dòng "Đã cấp thành công" nhìn y hệt lần đầu. Hai câu đó dẫn tới hai hành động khác nhau
 * của người đang cầm điện thoại nói chuyện với khách.
 *
 * Vì vậy kết quả THAY CHỖ biểu mẫu thay vì hiện thành một dòng toast: toast trôi mất sau vài
 * giây, còn mã đơn thì nhân viên cần đọc cho khách nghe.
 */
export default function StoreGrantModal({ open, onClose, listing }: Props) {
  const { message } = App.useApp();
  const [form] = Form.useForm<Values>();
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AdminStoreGrantResult | null>(null);

  // Danh sách món để chọn. Tìm theo tên/slug ở MÁY CHỦ chứ không lọc tại chỗ: danh mục mã nguồn
  // đã hơn 200 dòng và còn tăng, kéo hết về rồi lọc trong trình duyệt là thứ chạy nhanh hôm nay
  // và chậm dần mà không ai nhận ra ngày nó bắt đầu chậm.
  const [options, setOptions] = useState<ListingOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [term, setTerm] = useState("");

  /**
   * Món chọn sẵn được TÁCH RA BA GIÁ TRỊ NGUYÊN THUỶ, và các hiệu ứng bên dưới bám vào chúng chứ
   * không bám vào chính object.
   *
   * Lý do rất cụ thể: trang chi tiết truyền `listing={{ id, name, kind }}` viết thẳng trong JSX,
   * nên mỗi lần trang đó vẽ lại là một object MỚI dù nội dung y hệt. Hiệu ứng dọn biểu mẫu mà
   * phụ thuộc object đó sẽ chạy lại giữa chừng và xoá sạch email nhân viên vừa gõ — một lỗi chỉ
   * xuất hiện khi có thứ khác trên trang đổi đúng lúc, tức là lỗi không tái hiện được khi đi
   * tìm. Bắt nơi gọi phải nhớ `useMemo` cũng sửa được, nhưng thứ bảo vệ tốt nhất là thứ không
   * cần ai nhớ.
   */
  const presetId = listing?.id ?? null;
  const presetName = listing?.name ?? null;
  const presetKind = listing?.kind ?? null;

  const search = useCallback(
    async (q: string) => {
      setSearching(true);
      try {
        const res = await api.adminStoreListings({ q: q || undefined, pageSize: 20 });
        setOptions(res.items);
      } catch (e) {
        // Không chặn cả hộp thoại vì một lần tìm hỏng — người dùng vẫn gõ lại được.
        message.error((e as Error).message);
      } finally {
        setSearching(false);
      }
    },
    [message],
  );

  // Mở hộp thoại thì dọn sạch mọi thứ của lần trước: biểu mẫu, kết quả, danh sách gợi ý. Một
  // email còn sót lại từ khách trước là cách cấp nhầm hàng cho đúng người.
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    setResult(null);
    setTerm("");
    if (presetId) {
      form.setFieldsValue({ listingId: presetId });
      setOptions([{ id: presetId, name: presetName ?? presetId, kind: presetKind ?? "service" }]);
    } else {
      void search("");
    }
  }, [open, presetId, presetName, presetKind, form, search]);

  // Gõ tới đâu tìm tới đó, nhưng chờ 300ms: mỗi phím một lượt gọi là một lượt truy vấn cơ sở dữ
  // liệu, và ô tìm kiếm này nằm sau `@Roles('admin')` nên không có ai chặn lưu lượng hộ.
  useEffect(() => {
    if (!open || presetId) return;
    const id = setTimeout(() => void search(term), 300);
    return () => clearTimeout(id);
  }, [term, open, presetId, search]);

  const submit = async () => {
    let values: Values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.adminGrantStoreListing({
        email: values.email.trim(),
        listingId: values.listingId,
        note: values.note?.trim() || undefined,
      });
      setResult(res);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const again = () => {
    setResult(null);
    form.resetFields(["email", "note"]);
    if (!presetId) form.resetFields(["listingId"]);
  };

  return (
    <Modal
      title="Cấp dự án cho khách"
      open={open}
      onCancel={onClose}
      destroyOnHidden
      width={620}
      footer={
        result ? (
          <Space>
            <Button onClick={again}>Cấp tiếp cho người khác</Button>
            <Button type="primary" onClick={onClose}>
              Xong
            </Button>
          </Space>
        ) : (
          <Space>
            <Button onClick={onClose}>Huỷ</Button>
            <Button type="primary" loading={submitting} onClick={() => void submit()}>
              Cấp quyền
            </Button>
          </Space>
        )
      }
    >
      {result ? (
        <GrantOutcome result={result} />
      ) : (
        <Form form={form} layout="vertical" requiredMark="optional">
          <Form.Item
            name="email"
            label="Email khách"
            extra="Phải là email của một tài khoản ĐÃ CÓ. Tuyến này không tạo tài khoản hộ — một tài khoản sinh ra từ email gõ sai thì không ai nhận và cũng không ai dọn."
            rules={[
              { required: true, message: "Nhập email khách" },
              { type: "email", message: "Email không hợp lệ" },
            ]}
          >
            <Input placeholder="khach@example.com" autoComplete="off" />
          </Form.Item>

          <Form.Item
            name="listingId"
            label="Sản phẩm"
            rules={[{ required: true, message: "Chọn sản phẩm cần cấp" }]}
          >
            <Select
              showSearch
              disabled={!!presetId}
              loading={searching}
              filterOption={false}
              onSearch={setTerm}
              notFoundContent={searching ? "Đang tìm…" : "Không có món nào khớp"}
              placeholder="Gõ tên hoặc slug để tìm…"
              options={options.map((o) => ({
                value: o.id,
                label: `${o.name} · ${KIND_LABEL[o.kind] ?? o.kind}`,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="note"
            label="Ghi chú — vì sao cấp"
            extra="Đi vào đơn. Sáu tháng sau đây là thứ duy nhất giải thích một đơn 0đ: khách chuyển khoản tay, đền bù một lần giao hỏng, hay mua ngoài sàn."
          >
            <TextArea rows={3} maxLength={2000} showCount placeholder="Khách chuyển khoản 2.000.000đ ngày 24/09, ảnh giao dịch trong phiếu #…" />
          </Form.Item>

          <Alert
            type="info"
            showIcon
            icon={<InfoCircleFilled />}
            message="Lời gọi này mới ghi nhận QUYỀN"
            description="Đơn 0đ, quyền sở hữu và một việc bàn giao ở trạng thái chờ sẽ được tạo. Phần bàn giao thật — mời vào repo GitLab, nhân bản app sang tài khoản người mua — chưa chạy ở giai đoạn này."
          />
        </Form>
      )}
    </Modal>
  );
}

/**
 * Kết quả một lần cấp. Hai trường hợp, hai màu, hai câu khác hẳn nhau — đó là toàn bộ lý do
 * khối này tồn tại thay vì một dòng `message.success`.
 */
function GrantOutcome({ result }: { result: AdminStoreGrantResult }) {
  const { created, order, message: text } = result;
  return (
    <Space direction="vertical" size={14} style={{ width: "100%" }}>
      <Alert
        type={created ? "success" : "warning"}
        showIcon
        icon={created ? <CheckCircleFilled /> : <InfoCircleFilled />}
        message={created ? "Đã cấp xong" : "Khách này ĐÃ được cấp trước đó"}
        description={
          <>
            <Paragraph style={{ marginBottom: created ? 0 : 6 }}>{text}</Paragraph>
            {!created && (
              <Text type="secondary" style={{ fontSize: 12.5 }}>
                Không có đơn thứ hai nào được tạo. Nếu khách nói chưa nhận được hàng thì vấn đề
                nằm ở khâu bàn giao, không phải ở quyền — cấp lại lần nữa cũng không đổi gì.
              </Text>
            )}
          </>
        }
      />

      {order ? (
        <Descriptions
          size="small"
          column={1}
          bordered
          styles={{ label: { width: 150 } }}
          items={[
            {
              key: "code",
              label: "Mã đơn",
              children: <Text code copyable>{order.code}</Text>,
            },
            { key: "user", label: "Tài khoản", children: order.userEmail },
            {
              key: "listing",
              label: "Sản phẩm",
              children: (
                <Space size={6} wrap>
                  <Text strong>{order.listingName}</Text>
                  <Tag bordered={false}>{KIND_LABEL[order.kind] ?? order.kind}</Tag>
                </Space>
              ),
            },
            {
              key: "price",
              label: "Giá ghi trên đơn",
              children: (
                <Space size={6}>
                  <Text>{formatVnd(order.priceVnd)}</Text>
                  <Text type="secondary" style={{ fontSize: 12.5 }}>
                    (bản chụp lúc cấp — món đổi giá sau này không làm đổi đơn)
                  </Text>
                </Space>
              ),
            },
            {
              key: "ff",
              label: "Bàn giao",
              children: order.fulfillmentId ? (
                <Space size={6} wrap>
                  <Tag color="processing" bordered={false}>
                    Đang chờ
                  </Tag>
                  <Text type="secondary" style={{ fontSize: 12.5 }}>
                    cách giao: {order.fulfillmentMethod ?? "—"}
                  </Text>
                </Space>
              ) : (
                <Text type="secondary">Không có bản ghi bàn giao</Text>
              ),
            },
            { key: "at", label: "Thời điểm", children: formatDate(order.createdAt) },
          ]}
        />
      ) : (
        // `order = null` là trường hợp thật, không phải lỗi: quyền cũ do hệ B cấp tay không kèm
        // đơn nào. Máy chủ cố ý KHÔNG dựng một đơn "paid" ghi ngày hôm nay để vá vào đó — làm
        // sai sổ sách cho giao diện đẹp là cái giá không đáng trả.
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: `1px dashed ${V.border}`,
            background: V.surfaceAlt,
          }}
        >
          <Text type="secondary" style={{ fontSize: 12.5 }}>
            Quyền này không kèm đơn hàng nào — nó có từ trước khi tuyến cấp tồn tại (hoặc do bản
            nhập từ hệ B). Mã quyền: <Text code>{result.entitlementId}</Text>
          </Text>
        </div>
      )}
    </Space>
  );
}
