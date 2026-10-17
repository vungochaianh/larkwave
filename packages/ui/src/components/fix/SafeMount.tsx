'use client';
import { Component, type ReactNode } from 'react';

/**
 * Chặn lỗi vẽ của một khối PHỤ (FixCenter, FixBadge) để nó không kéo sập cả AppShell. Hai khối này đi tới
 * mọi máy qua code-push và chạy trên mọi đời lõi — lỗi ở đây chỉ được làm mất nút "Kiểm tra", không được
 * làm trắng màn hình app.
 */
export class SafeMount extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn('[fix] khối phụ lỗi, đã tắt:', (err as Error)?.message);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
