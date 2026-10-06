import '@ant-design/v5-patch-for-react-19';
import type { AppProps } from 'next/app';
import { Component, type ReactNode } from 'react';
import { RuntimeProvider, I18nProvider } from '@larkwave/ui';
import { IpcRuntimeAdapter } from '../runtime/ipcAdapter';
import '../styles/globals.css';

// One adapter for the whole renderer — the desktop runtime over IPC.
const runtime = new IpcRuntimeAdapter();

/** Shown when this renderer is opened in a plain browser (the twd-desktop-renderer.pages.dev
 *  URL) instead of inside the Larkwave desktop app — there's no Electron `window.toolswave`
 *  bridge, so a friendly notice replaces the scary generic crash. */
function BrowserNotice() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0f1115',
        color: '#e7e9ee',
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 440, textAlign: 'center', lineHeight: 1.6 }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>🖥️</div>
        <h1 style={{ fontSize: 20, margin: '0 0 10px', fontWeight: 700 }}>Trang này chạy trong ứng dụng Larkwave</h1>
        <p style={{ fontSize: 14, color: '#aab0bd', margin: '0 0 18px' }}>
          Đây là giao diện nội bộ của <b>ứng dụng máy tính Larkwave</b> — nó cần môi trường app để hoạt động, nên
          không mở được trực tiếp trên trình duyệt. Hãy mở từ chính ứng dụng.
        </p>
        <a
          href="https://toolswave.net/download"
          style={{
            display: 'inline-block',
            padding: '10px 18px',
            borderRadius: 10,
            background: '#6C5CE7',
            color: '#fff',
            fontWeight: 600,
            fontSize: 14,
            textDecoration: 'none',
          }}
        >
          Tải / mở ứng dụng Larkwave
        </a>
      </div>
    </div>
  );
}

/** Catch ANY render/lifecycle crash in the app tree so a single bad component can't turn the
 *  whole window into Next.js's generic "Application error: a client-side exception". Instead we
 *  show the REAL error message + a reload button, so the app stays recoverable (and the actual
 *  cause is visible instead of hidden). */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: unknown) {
    // eslint-disable-next-line no-console
    console.error('[toolswave] renderer crashed:', error, info);
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f1115',
          color: '#e7e9ee',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 560, width: '100%', lineHeight: 1.6 }}>
          <div style={{ fontSize: 40, marginBottom: 10, textAlign: 'center' }}>⚠️</div>
          <h1 style={{ fontSize: 19, margin: '0 0 8px', fontWeight: 700, textAlign: 'center' }}>Giao diện gặp lỗi</h1>
          <p style={{ fontSize: 13.5, color: '#aab0bd', margin: '0 0 14px', textAlign: 'center' }}>
            Một thành phần bị lỗi khi tải. Bấm <b>Tải lại</b> để thử lại. Nếu vẫn lỗi, chụp phần chi tiết bên dưới gửi
            cho hỗ trợ để sửa nhanh.
          </p>
          <pre
            style={{
              background: '#1a1d24',
              border: '1px solid #2a2e37',
              borderRadius: 10,
              padding: 12,
              fontSize: 12,
              color: '#ff9d9d',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: 260,
              overflow: 'auto',
              margin: '0 0 14px',
            }}
          >
            {String(error?.message || error)}
            {error?.stack ? '\n\n' + error.stack.split('\n').slice(0, 8).join('\n') : ''}
          </pre>
          <div style={{ textAlign: 'center' }}>
            <button
              onClick={() => {
                try {
                  location.reload();
                } catch {
                  /* ignore */
                }
              }}
              style={{
                padding: '10px 20px',
                borderRadius: 10,
                background: '#6C5CE7',
                color: '#fff',
                fontWeight: 600,
                fontSize: 14,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Tải lại
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default function App({ Component: PageComponent, pageProps }: AppProps) {
  // In a plain browser there is no Electron bridge → friendly notice instead of a crash.
  if (typeof window !== 'undefined' && !window.toolswave) {
    return <BrowserNotice />;
  }
  return (
    <ErrorBoundary>
      <I18nProvider>
        <RuntimeProvider runtime={runtime}>
          <PageComponent {...pageProps} />
        </RuntimeProvider>
      </I18nProvider>
    </ErrorBoundary>
  );
}
