'use client';

import { useEffect, useState } from 'react';
import type { DesktopUpdateInfo } from '@larkwave/core';
import { useRuntime } from './RuntimeProvider';

/**
 * Manifest phát hành của CHÍNH app này: route trên toolswave.net đọc registry công khai (gói
 * larkwave-desktop), cùng giá trị với manifestUrl() phía main. TUYỆT ĐỐI không trỏ về manifest của
 * Toolswave: bản 1.0.x bên đó luôn "mới hơn" 0.x ở đây, và nút tải sẽ tải bộ cài của sản phẩm khác.
 */
export const RELEASE_URL: string = 'https://toolswave.net/api/apps-release/larkwave';

/** So sánh phiên bản kiểu semver rút gọn (so SỐ, để 1.0.9 < 1.0.10). */
export function cmpVer(a: string, b: string): number {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

export interface UpdateStatus {
  info: DesktopUpdateInfo | null;
  /**
   * Cần CÀI LẠI mới nhận được bản sửa: hoặc renderer mới không chạy nổi trên lõi cũ
   * (`reinstall`), hoặc có bản cài mới hơn mang thay đổi phần LÕI (`mainFixPending`).
   */
  needsReinstall: boolean;
  /** Bản CÀI (phần lõi) đang chạy — khác số hiện ở footer, vốn là bản GIAO DIỆN. */
  nativeVersion?: string;
  latest?: string;
  notice?: string;
}

/**
 * Trạng thái cập nhật của bản cài desktop, dùng chung cho footer phiên bản lẫn khung chat.
 *
 * `mainFixPending` do MAIN tính, nghĩa là chính những người đang chạy bản cài CŨ — đúng nhóm cần
 * biết phải cài lại — sẽ không bao giờ nhận được nó, vì bản vá lõi chỉ tới qua bản cài. Nên khi
 * main không cung cấp, giao diện TỰ đọc manifest và tự tính; phần này đi bằng code-push nên tới
 * được ngay cả người chưa cài lại.
 *
 * Không đọc được manifest thì IM LẶNG — thà không nói còn hơn nói sai.
 */
export function useUpdateStatus(): UpdateStatus {
  const runtime = useRuntime();
  const [info, setInfo] = useState<DesktopUpdateInfo | null>(null);
  const [manifestFix, setManifestFix] = useState(false);

  useEffect(() => {
    if (!runtime.checkUpdate) return;
    let dead = false;
    runtime
      .checkUpdate()
      .then(async (i) => {
        if (dead) return;
        setInfo(i);
        if (i?.mainFixPending !== undefined || !i?.current) return;
        if (!RELEASE_URL) return;
        try {
          const r = await fetch(RELEASE_URL, { cache: 'no-store' });
          const m = (await r.json()) as { latestVersion?: string; mainChangedAt?: string };
          if (dead) return;
          // Manifest cũ không có mainChangedAt → lùi về latestVersion (script phát hành chỉ nâng
          // latestVersion khi có --main-change, nên bản cài mới hơn theo định nghĩa là có đổi lõi).
          const mainChanged = m.mainChangedAt || m.latestVersion;
          setManifestFix(
            !!m.latestVersion &&
              cmpVer(m.latestVersion, i.current) > 0 &&
              !!mainChanged &&
              cmpVer(mainChanged, i.current) > 0,
          );
        } catch {
          /* im lặng */
        }
      })
      .catch(() => undefined);
    return () => {
      dead = true;
    };
  }, [runtime]);

  return {
    info,
    needsReinstall: !!info?.reinstall || (info?.mainFixPending ?? manifestFix),
    nativeVersion: info?.current,
    latest: info?.latest,
    notice: info?.notice,
  };
}
