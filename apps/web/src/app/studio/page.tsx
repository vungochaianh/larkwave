"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { RuntimeProvider, Composer, WebRuntimeAdapter } from "@larkwave/ui";
import { getToken, API_BASE } from "@/lib/api";

/**
 * The web genuinely SHARES the desktop's UI: the same `<Composer/>` from
 * @larkwave/ui, wired to a WebRuntimeAdapter (server codegen via apia) instead
 * of the desktop's local Claude runtime. Same component, two runtimes.
 */
export default function StudioPage() {
  const router = useRouter();
  const runtime = useMemo(() => new WebRuntimeAdapter(API_BASE, getToken), []);
  return (
    <RuntimeProvider runtime={runtime}>
      <div style={{ padding: "32px 16px" }}>
        {/* Web CHỈ tạo website. Game bỏ vì website đã làm được game (game HTML5 là một website);
            "tự động" bỏ vì còn mỗi một loại thì không có gì để chọn giữa; mobile/desktop/tiện ích
            phải cài phụ thuộc và đóng gói trên máy nên thuộc app desktop. Trang tạo app chính
            (`/`) áp cùng luật này kèm hướng dẫn tải app. */}
        <Composer
          allowedTracks={["web"]}
          onResult={(appId, buildId) =>
            router.push(`/apps/${appId}${buildId ? `?build=${buildId}` : ""}`)
          }
          onQuota={() => router.push("/pricing")}
        />
      </div>
    </RuntimeProvider>
  );
}
