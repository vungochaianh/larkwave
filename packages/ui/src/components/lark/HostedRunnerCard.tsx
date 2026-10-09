'use client';
import { useCallback, useEffect, useState } from 'react';
import { App, Alert, Button, Card, Form, Input, Popconfirm, Space, Tag, Typography } from 'antd';
import { CloudServerOutlined } from '@ant-design/icons';
import type { RuntimeAdapter } from '@larkwave/core';
import { accountApi, type LarkHostedStatus } from '../../account/api';
import { V } from '../../theme';
import { FEATURE_HOSTED_RUNNER_WRITE } from '../../features';

const { Text, Paragraph } = Typography;

/**
 * "Để Larkwave chạy lịch hộ" — bật/tắt `LarkHostedRunner`.
 *
 * Đây là chỗ DUY NHẤT trong giao diện mà app_secret của Lark đi lên máy chủ, nên thẻ này có một
 * việc ngoài việc bấm nút: nói thật cho người dùng biết họ đang đánh đổi cái gì. Câu cảnh báo
 * dưới đây KHÔNG phải chữ trang trí — bỏ nó đi là tính năng này thành cái bẫy. Đọc chú thích ở
 * model `LarkHostedRunner` trước khi sửa.
 *
 * Hai đường vào, tuỳ nền:
 *   • Desktop — `runtime.larkHostedPush()`: tiến trình chính đọc khoá đã lưu và tự đẩy. Người
 *     dùng không phải gõ lại, và renderer không bao giờ cầm app_secret.
 *   • Web — form nhập tay. Ở đây khoá BẮT BUỘC đi qua trình duyệt; không có cách nào khác.
 */
export function HostedRunnerCard({ runtime }: { runtime: RuntimeAdapter }) {
  const { message } = App.useApp();
  const [status, setStatus] = useState<LarkHostedStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm<{ appId: string; appSecret: string }>();
  const canPushFromDesktop = typeof runtime.larkHostedPush === 'function';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await accountApi.larkHostedStatus());
    } catch {
      // Không đăng nhập / mạng hỏng: để null và ẩn thẻ, đừng doạ người dùng bằng lỗi đỏ ở một
      // tính năng họ còn chưa bật.
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const enableFromDesktop = async () => {
    setBusy(true);
    try {
      const r = await runtime.larkHostedPush!();
      if (!r.ok) {
        message.error(r.error || 'Không bật được.');
        return;
      }
      message.success('Đã bật. Lịch sẽ chạy kể cả khi tắt app.');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const enableFromForm = async (v: { appId: string; appSecret: string }) => {
    setBusy(true);
    try {
      setStatus(await accountApi.larkHostedEnable({ appId: v.appId.trim(), appSecret: v.appSecret.trim() }));
      form.resetFields();
      message.success('Đã bật. Lịch sẽ chạy kể cả khi tắt app.');
    } catch (e) {
      message.error((e as Error)?.message || 'Không bật được.');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      setStatus(await accountApi.larkHostedDisable());
      message.success('Đã tắt và xoá khoá khỏi máy chủ.');
    } catch (e) {
      message.error((e as Error)?.message || 'Không tắt được.');
    } finally {
      setBusy(false);
    }
  };

  if (loading || !status) return null;

  // Máy chủ chưa đặt LARK_CREDS_KEY ⇒ không mời người dùng gửi khoá đi đâu cả.
  if (!status.available && !status.enabled) return null;

  return (
    <Card
      size="small"
      title={
        <Space>
          <CloudServerOutlined />
          <span>Để Larkwave chạy lịch hộ</span>
          {status.enabled ? <Tag color="green">đang bật</Tag> : <Tag>đang tắt</Tag>}
        </Space>
      }
      style={{ marginBottom: 12 }}
    >
      <Paragraph type="secondary" style={{ marginBottom: 10 }}>
        Bình thường lịch tự động hoá chạy trên máy này, nên tắt app là lịch dừng. Bật mục này thì
        máy chủ Larkwave chạy thay, kể cả khi bạn tắt máy.
      </Paragraph>

      {/* Cảnh báo phải đứng TRƯỚC nút bật, không phải chú thích mờ bên dưới. */}
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 12 }}
        message="Việc này gửi App Secret Lark của bạn lên máy chủ Larkwave"
        description={
          <span style={{ color: V.textSub }}>
            Máy chủ phải giải mã được khoá mà không cần bạn có mặt, nếu không nó không chạy lịch
            hộ được. Nghĩa là: ai chiếm được máy chủ thì đọc được khoá Lark của bạn. Khoá được mã
            hoá khi lưu và không bao giờ hiện lại trên giao diện, nhưng nó KHÔNG còn nằm riêng
            trên máy bạn nữa. Không muốn vậy thì có thể tự chạy trên VM của mình — xem
            <Text code style={{ marginLeft: 4 }}>tw-lark-runner</Text>.
          </span>
        }
      />

      {!FEATURE_HOSTED_RUNNER_WRITE ? (
        <Alert
          type="info"
          showIcon
          message="Cấu hình chạy hộ dùng chung với app Toolswave"
          description={
            <span style={{ color: V.textSub }}>
              Larkwave dùng chung tài khoản với Toolswave, và máy chủ chỉ giữ MỘT cấu hình chạy hộ cho mỗi
              tài khoản (chạy các lịch trong bản sao lưu của app Toolswave). Bật/tắt ở app Toolswave.
              {status.enabled && status.appIdMasked ? <> App đang dùng: <Text code>{status.appIdMasked}</Text>.</> : null}
            </span>
          }
        />
      ) : status.enabled ? (
        <Space direction="vertical" style={{ width: '100%' }} size={8}>
          <Text type="secondary">
            App đang dùng: <Text code>{status.appIdMasked}</Text>
            {status.lastSeenAt ? ` · máy chủ nạp lần cuối ${new Date(status.lastSeenAt).toLocaleString('vi-VN')}` : ' · máy chủ chưa nạp lần nào'}
          </Text>
          {status.lastError ? <Alert type="error" showIcon message={status.lastError} /> : null}
          <Space>
            {canPushFromDesktop ? (
              <Button onClick={enableFromDesktop} loading={busy}>
                Cập nhật khoá từ máy này
              </Button>
            ) : null}
            <Popconfirm
              title="Tắt và xoá khoá khỏi máy chủ?"
              description="Lịch sẽ quay về chỉ chạy khi app đang mở."
              okText="Tắt"
              cancelText="Thôi"
              onConfirm={disable}
            >
              <Button danger loading={busy}>
                Tắt
              </Button>
            </Popconfirm>
          </Space>
        </Space>
      ) : canPushFromDesktop ? (
        <Button type="primary" onClick={enableFromDesktop} loading={busy}>
          Bật — dùng khoá Lark đã kết nối trên máy này
        </Button>
      ) : (
        <Form form={form} layout="vertical" onFinish={enableFromForm} disabled={busy}>
          <Form.Item
            name="appId"
            label="App ID"
            rules={[{ required: true, message: 'Nhập App ID' }]}
            style={{ marginBottom: 10 }}
          >
            <Input placeholder="cli_xxxxxxxxxxxxxxxx" autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="appSecret"
            label="App Secret"
            rules={[{ required: true, message: 'Nhập App Secret' }]}
            style={{ marginBottom: 10 }}
          >
            {/* Input.Password: không phơi khoá ra màn hình lúc gõ, và không để trình duyệt nhớ. */}
            <Input.Password placeholder="Lấy ở Lark Developer Console" autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={busy}>
            Bật chạy hộ
          </Button>
        </Form>
      )}
    </Card>
  );
}
