'use client';
import { useEffect, useState, type ClipboardEvent } from 'react';
import { App, Alert, Button, Input, Modal, Segmented, Tooltip, Typography, Upload } from 'antd';
import type { UploadFile, UploadProps } from 'antd';
import { BugOutlined, StarOutlined, InboxOutlined } from '@ant-design/icons';
import { accountApi, type UploadRef } from '../account/api';
import { useAccountAuth } from '../account/auth';
import { getRecentLogs, installErrorCapture } from '../errorLog';
import { onMessengerWindows } from '../account/messenger';
import { APP_VERSION } from '../changelog';

const { Paragraph, Text, Link } = Typography;

/**
 * Floating "report a bug / feedback" button for the desktop app — the same flow
 * as the website's FeedbackButton, but submitting through the desktop account API
 * (main-process proxy) with the user's Larkwave JWT. Auto-attaches app version +
 * userAgent + the recent console-error ring buffer so admins can reproduce.
 *
 * Requires a signed-in Larkwave account (the /feedback endpoint is authed); when
 * signed out it points the user to the account login instead of a dead 401.
 */
export function FeedbackButton({ onOpenReports, page, variant = 'fab', open: openProp, onOpenChange, defaultKind }: { onOpenReports?: () => void; page?: string; variant?: 'fab' | 'header' | 'controlled'; open?: boolean; onOpenChange?: (v: boolean) => void; defaultKind?: 'bug' | 'feature' }) {
  const { message } = App.useApp();
  const { user } = useAccountAuth();
  // Controlled mode ('controlled' variant): parent owns open state → no built-in trigger, just the modal.
  const [openState, setOpenState] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? !!openProp : openState;
  const setOpen = (v: boolean) => { onOpenChange?.(v); if (!controlled) setOpenState(v); };
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  // 'bug' = báo lỗi; 'feature' = yêu cầu tính năng (khi AI/tính năng chưa có → gửi thẳng đội Larkwave).
  const [kind, setKind] = useState<'bug' | 'feature'>(defaultKind ?? 'bug');
  const isFeature = kind === 'feature';
  // Slide the FAB left past any open chat window(s) so it never covers the chat's send box.
  const [chatWindows, setChatWindows] = useState(0);

  useEffect(() => {
    installErrorCapture();
  }, []);
  useEffect(() => onMessengerWindows(setChatWindows), []);

  // Upload each picked file straight to /uploads; keep the returned ref as the
  // file's `response` so we can collect attachment ids on submit.
  const customRequest: UploadProps['customRequest'] = async ({ file, onSuccess, onError }) => {
    try {
      const ref = await accountApi.uploadFile(file as File, 'feedback');
      onSuccess?.(ref);
    } catch (e) {
      message.error((e as Error).message);
      onError?.(e as Error);
    }
  };

  // Upload one File (used by paste) + reflect its state in the file list.
  const uploadOne = async (file: File) => {
    const uid = `paste-${file.size}-${Math.random().toString(36).slice(2)}`;
    setFileList((prev) => [...prev, { uid, name: file.name, status: 'uploading' } as UploadFile]);
    try {
      const ref = await accountApi.uploadFile(file, 'feedback');
      setFileList((prev) => prev.map((f) => (f.uid === uid ? { ...f, status: 'done', response: ref } : f)));
    } catch (e) {
      setFileList((prev) => prev.map((f) => (f.uid === uid ? { ...f, status: 'error' } : f)));
      message.error((e as Error).message);
    }
  };

  // Paste a screenshot (Ctrl/Cmd+V) straight into the report.
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.type.startsWith('image/')) {
        const blob = it.getAsFile();
        if (!blob) continue;
        e.preventDefault();
        const named = new File([blob], blob.name || 'screenshot.png', { type: blob.type || 'image/png' });
        void uploadOne(named);
        message.success('Đã dán ảnh chụp màn hình.');
      }
    }
  };

  const reset = () => {
    setText('');
    setFileList([]);
    setKind(defaultKind ?? 'bug');
  };

  const submit = async () => {
    if (!text.trim()) {
      message.warning(isFeature ? 'Mô tả tính năng bạn cần giúp mình nhé.' : 'Mô tả lỗi giúp mình nhé.');
      return;
    }
    if (fileList.some((f) => f.status === 'uploading')) {
      message.warning('Đợi tệp tải lên xong nhé.');
      return;
    }
    const attachmentIds = fileList
      .map((f) => (f.response as UploadRef | undefined)?.id)
      .filter((x): x is string => !!x);
    setSending(true);
    try {
      const platform = typeof navigator !== 'undefined' ? navigator.platform : '';
      // No `kind` column server-side yet → tag the message + url so admins can filter
      // feature requests unmistakably (and it shows clearly in "Báo lỗi của tôi").
      const body = isFeature ? `🌟 [YÊU CẦU TÍNH NĂNG] ${text.trim()}` : text.trim();
      await accountApi.submitFeedback({
        message: body,
        url: `desktop ${APP_VERSION}${page ? ` · trang: ${page}` : ''}${platform ? ` · ${platform}` : ''}${isFeature ? ' · feature-request' : ''}`,
        context: {
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
          logs: getRecentLogs(),
        },
        ...(attachmentIds.length ? { attachmentIds } : {}),
      });
      message.success(isFeature ? 'Đã gửi yêu cầu tính năng. Cảm ơn bạn!' : 'Đã gửi báo lỗi. Cảm ơn bạn!');
      reset();
      setOpen(false);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {variant === 'controlled' ? null : variant === 'header' ? (
        // In the top toolbar next to the theme/message controls (UI-5).
        <Tooltip title="Báo lỗi · góp ý · yêu cầu tính năng">
          <Button
            type="text"
            icon={<BugOutlined />}
            onClick={() => setOpen(true)}
            aria-label="Báo lỗi hoặc yêu cầu tính năng"
          />
        </Tooltip>
      ) : (
        <Button
          shape="circle"
          icon={<BugOutlined style={{ color: '#fff', fontSize: 18 }} />}
          onClick={() => setOpen(true)}
          aria-label="Báo lỗi hoặc yêu cầu tính năng"
          title="Báo lỗi · góp ý · yêu cầu tính năng"
          style={{
            position: 'fixed',
            right: 20 + chatWindows * 312,
            bottom: 20,
            transition: 'right 0.2s ease',
            zIndex: 900,
            width: 44,
            height: 44,
            boxShadow: '0 6px 20px rgba(245,54,92,0.4)',
            background: '#F5365C',
            borderColor: '#F5365C',
          }}
        />
      )}
      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => void submit()}
        confirmLoading={sending}
        title={isFeature ? 'Yêu cầu tính năng' : 'Báo lỗi / góp ý'}
        okText={isFeature ? 'Gửi yêu cầu' : 'Gửi'}
        cancelText="Đóng"
        okButtonProps={{ disabled: !user }}
      >
        {!user ? (
          <Alert
            type="info"
            showIcon
            message="Cần đăng nhập tài khoản Larkwave"
            description="Hãy đăng nhập ở mục Tài khoản để gửi báo lỗi / yêu cầu tính năng (và được tính điểm thưởng cho báo lỗi hợp lệ)."
          />
        ) : (
          <>
            <Segmented
              block
              value={kind}
              onChange={(v) => setKind(v as 'bug' | 'feature')}
              options={[
                { label: (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><BugOutlined /> Báo lỗi</span>), value: 'bug' },
                { label: (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><StarOutlined /> Yêu cầu tính năng</span>), value: 'feature' },
              ]}
              style={{ marginBottom: 12 }}
            />
            <Paragraph type="secondary" style={{ fontSize: 13 }}>
              {isFeature ? (
                <>
                  Mô tả tính năng bạn muốn có (vd: "trợ lý đọc/sửa được phân quyền Base", "kết nối Zalo"…). Yêu cầu gửi
                  thẳng cho đội Larkwave; khi được bổ sung, tính năng sẽ có ngay trong app.
                </>
              ) : (
                <>
                  Mô tả lỗi bạn gặp. Hệ thống tự đính kèm phiên bản app + log gần đây để admin dễ kiểm tra và sửa. Báo
                  lỗi hợp lệ được <Text strong>tính điểm &amp; thưởng</Text>
                </>
              )}
              {onOpenReports ? (
                <>
                  {' '}— xem ở{' '}
                  <Link
                    onClick={() => {
                      setOpen(false);
                      onOpenReports();
                    }}
                  >
                    Báo lỗi của tôi
                  </Link>
                  .
                </>
              ) : (
                '.'
              )}
            </Paragraph>
            <Input.TextArea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={onPaste}
              autoSize={{ minRows: 4, maxRows: 8 }}
              maxLength={2000}
              placeholder={
                isFeature
                  ? 'Mình muốn app có thể… (mô tả tính năng + lý do cần dùng)'
                  : 'Mình gặp lỗi khi… (mẹo: chụp màn hình rồi Ctrl/Cmd+V dán ảnh vào đây)'
              }
            />
            <Upload.Dragger
              multiple
              fileList={fileList}
              customRequest={customRequest}
              onChange={({ fileList: fl }) => setFileList(fl)}
              listType="picture"
              accept="image/*,.pdf,.txt,.md,.json,.csv,.log,.docx,.xlsx,.pptx"
              style={{ marginTop: 12 }}
            >
              <p style={{ margin: 0 }}>
                <InboxOutlined style={{ color: '#6C5CE7', fontSize: 24 }} />
              </p>
              <p style={{ margin: '6px 0 0', fontSize: 13 }}>Kéo-thả hoặc bấm để đính kèm ảnh chụp màn hình / tệp</p>
              <p style={{ margin: 0, fontSize: 12, color: '#9AA3B5' }}>Ảnh, PDF, văn bản, log… (tối đa 8 tệp)</p>
            </Upload.Dragger>
          </>
        )}
      </Modal>
    </>
  );
}
