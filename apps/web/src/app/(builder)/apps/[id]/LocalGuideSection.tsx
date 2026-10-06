"use client";

import {
  CheckCircleFilled,
  CopyOutlined,
  DesktopOutlined,
  LinkOutlined,
} from "@ant-design/icons";
import { Alert, Button, Tag, Tooltip, Typography } from "antd";
import type { ReactNode } from "react";
import type { App as AppEntity, Track } from "@larkwave/shared";
import { useI18n } from "@larkwave/ui";
import { BRAND } from "@/lib/theme";
import { V } from "@larkwave/ui";

const { Title, Paragraph, Text } = Typography;

interface Step {
  label: string;
  /** Shell command (renders a copyable code block). Omit for manual UI steps. */
  code?: string;
  hint?: string;
}

interface Guide {
  badge: string;
  intro: string;
  prereq: ReactNode;
  steps: Step[];
  note?: string;
}

type TFn = (key: string, fallback?: string) => string;

/** Build the per-track guides, translated via t() (called from inside a component). */
function buildGuides(t: TFn): Record<Track, Guide> {
  return {
    web: {
      badge: t("web.appp.guideWebBadge", "Website · React + Vite"),
      intro: t(
        "web.appp.guideWebIntro",
        "Tải mã nguồn về (nút “Tải mã nguồn” ở thanh trên), giải nén rồi mở terminal trong thư mục đó và chạy:",
      ),
      prereq: (
        <>
          <a href="https://nodejs.org" target="_blank" rel="noreferrer">
            Node.js
          </a>{" "}
          {t("web.appp.guideWebPrereqVer", "phiên bản")}{" "}
          <Text strong>{t("web.appp.guideWebPrereq20", "20 trở lên")}</Text>{" "}
          {t("web.appp.guideWebPrereqNpm", "(đã kèm npm)")}
        </>
      ),
      steps: [
        { label: t("web.appp.guideWebStep1", "Cài thư viện (chạy 1 lần)"), code: "npm install" },
        {
          label: t("web.appp.guideWebStep2", "Khởi động dev server"),
          code: "npm run dev",
          hint: t("web.appp.guideWebStep2Hint", "Mở http://localhost:5173 — sửa code trong src/ là trang tự cập nhật."),
        },
        {
          label: t("web.appp.guideWebStep3", "Build bản production"),
          code: "npm run build",
          hint: t("web.appp.guideWebStep3Hint", "Xuất site tĩnh ra thư mục dist/ (deploy được lên mọi static host)."),
        },
        { label: t("web.appp.guideWebStep4", "Xem thử bản build"), code: "npm run preview" },
      ],
      note: t("web.appp.guideWebNote", "Cổng 5173 bận? Chạy: npm run dev -- --port 5174"),
    },
    mobile: {
      badge: t("web.appp.guideMobileBadge", "Mobile · Expo (React Native)"),
      intro: t(
        "web.appp.guideMobileIntro",
        "Tải mã nguồn về, giải nén, mở terminal trong thư mục và cài app Expo Go trên điện thoại để xem trực tiếp:",
      ),
      prereq: (
        <>
          <a href="https://nodejs.org" target="_blank" rel="noreferrer">
            Node.js
          </a>{" "}
          <Text strong>20+</Text> {t("web.appp.guideMobilePrereqAnd", "và app")}{" "}
          <a
            href="https://expo.dev/go"
            target="_blank"
            rel="noreferrer"
          >
            Expo Go
          </a>{" "}
          {t("web.appp.guideMobilePrereqPhone", "trên điện thoại")}
        </>
      ),
      steps: [
        { label: t("web.appp.guideMobileStep1", "Cài thư viện"), code: "npm install" },
        {
          label: t("web.appp.guideMobileStep2", "Khởi động Expo"),
          code: "npx expo start",
          hint: t("web.appp.guideMobileStep2Hint", "Một mã QR hiện ở terminal — mở Expo Go trên điện thoại và quét để chạy app."),
        },
        {
          label: t("web.appp.guideMobileStep3", "Đóng gói APK/IPA (tuỳ chọn)"),
          code: "npx eas build --platform android",
          hint: t("web.appp.guideMobileStep3Hint", "Cần cài eas-cli và tài khoản Expo miễn phí."),
        },
      ],
      note: t("web.appp.guideMobileNote", "Không quét được QR? Đảm bảo cùng mạng Wi-Fi, hoặc chạy: npx expo start --tunnel"),
    },
    extension: {
      badge: t("web.appp.guideExtBadge", "Extension · Chrome/Edge (MV3)"),
      intro: t(
        "web.appp.guideExtIntro",
        "Tải mã nguồn về và giải nén. Tiện ích KHÔNG cần build — nạp trực tiếp vào trình duyệt:",
      ),
      prereq: <>{t("web.appp.guideExtPrereq", "Trình duyệt Chrome hoặc Edge")}</>,
      steps: [
        { label: t("web.appp.guideExtStep1", "Mở trang tiện ích"), code: "chrome://extensions" },
        { label: t("web.appp.guideExtStep2", "Bật “Developer mode” (góc trên bên phải)") },
        { label: t("web.appp.guideExtStep3", "Bấm “Load unpacked” và chọn thư mục mã nguồn vừa giải nén") },
        {
          label: t("web.appp.guideExtStep4", "Ghim tiện ích trên thanh công cụ để dùng"),
          hint: t("web.appp.guideExtStep4Hint", "Sau khi sửa code, bấm nút tải lại (↻) trên thẻ tiện ích để áp dụng."),
        },
      ],
    },
    desktop: {
      badge: t("web.appp.guideDesktopBadge", "Desktop · Electron"),
      intro: t("web.appp.guideDesktopIntro", "Tải mã nguồn về, giải nén, mở terminal trong thư mục và chạy:"),
      prereq: (
        <>
          <a href="https://nodejs.org" target="_blank" rel="noreferrer">Node.js</a>{" "}
          <Text strong>{t("web.appp.guideWebPrereq20", "20 trở lên")}</Text>
        </>
      ),
      steps: [
        { label: t("web.appp.guideDesktopStep1", "Cài thư viện (chạy 1 lần)"), code: "npm install" },
        { label: t("web.appp.guideDesktopStep2", "Mở app desktop"), code: "npm start" },
        {
          label: t("web.appp.guideDesktopStep3", "Đóng gói app cài đặt"),
          code: "npm run dist",
          hint: t("web.appp.guideDesktopStep3Hint", "Xuất bản cài đặt (Windows/macOS/Linux) ra thư mục dist/."),
        },
      ],
    },
    game: {
      badge: t("web.appp.guideGameBadge", "Game · HTML5 (Vite)"),
      intro: t("web.appp.guideGameIntro", "Game chạy trên trình duyệt như website — Larkwave đã build + preview live. Muốn chạy local:"),
      prereq: (
        <>
          <a href="https://nodejs.org" target="_blank" rel="noreferrer">Node.js</a>{" "}
          <Text strong>{t("web.appp.guideWebPrereq20", "20 trở lên")}</Text>
        </>
      ),
      steps: [
        { label: t("web.appp.guideGameStep1", "Cài thư viện (chạy 1 lần)"), code: "npm install" },
        { label: t("web.appp.guideGameStep2", "Chơi thử (dev)"), code: "npm run dev", hint: t("web.appp.guideGameStep2Hint", "Mở http://localhost:5173.") },
        { label: t("web.appp.guideGameStep3", "Build bản production"), code: "npm run build" },
      ],
    },
  };
}

function CodeBlock({ code, onCopy }: { code: string; onCopy: (t: string) => void }) {
  const { t } = useI18n();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        background: V.codeBg,
        color: V.codeText,
        border: `1px solid ${V.codeBorder}`,
        borderRadius: 8,
        padding: "8px 12px",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 13,
        marginTop: 6,
      }}
    >
      <span style={{ flex: 1, minWidth: 0, overflowX: "auto", whiteSpace: "pre" }}>
        <span style={{ color: "#6C7A93", userSelect: "none" }}>$ </span>
        {code}
      </span>
      <Tooltip title={t("build.copy", "Sao chép")}>
        <Button
          type="text"
          size="small"
          icon={<CopyOutlined style={{ color: "#9AA8C2" }} />}
          onClick={() => onCopy(code)}
        />
      </Tooltip>
    </div>
  );
}

/**
 * "Hướng dẫn chạy local" — a deterministic, per-app-type guide for running the
 * downloaded code locally. Pure client-side (no fetch) so it works for every app
 * type and even before a successful build. Mirrors the generated README.md.
 */
export default function LocalGuideSection({
  app,
  onCopy,
}: {
  app: AppEntity;
  onCopy: (text: string) => void;
}) {
  const { t } = useI18n();
  const guides = buildGuides(t);
  const track: Track = (app.track as Track) ?? "web";
  const g = guides[track] ?? guides.web;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <Title level={4} style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <DesktopOutlined style={{ color: BRAND }} />
          {t("build.runAppLocally", "Chạy app trên máy của bạn")}
        </Title>
        <Tag color="purple" bordered={false} style={{ marginTop: 8 }}>
          {g.badge}
        </Tag>
        <Paragraph type="secondary" style={{ margin: "10px 0 0" }}>
          {g.intro}
        </Paragraph>
      </div>

      <Alert
        type="info"
        showIcon
        message={t("build.requirements", "Yêu cầu")}
        description={g.prereq}
        style={{ borderRadius: 10 }}
      />

      {app.currentUrl && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #ECEDF3",
            background: "#FAFAFE",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <LinkOutlined style={{ color: "#16B98D" }} />
            <Text ellipsis style={{ maxWidth: 320 }}>
              {app.currentUrl}
            </Text>
          </span>
          <Button size="small" icon={<CopyOutlined />} onClick={() => onCopy(app.currentUrl!)}>
            {t("build.copyLink", "Sao chép link")}
          </Button>
        </div>
      )}

      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 14 }}>
        {g.steps.map((s, i) => (
          <li key={i} style={{ display: "flex", gap: 12 }}>
            <span
              style={{
                flexShrink: 0,
                width: 26,
                height: 26,
                borderRadius: "50%",
                background: "rgba(108,92,231,0.12)",
                color: BRAND,
                fontWeight: 700,
                fontSize: 13,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {i + 1}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <Text style={{ fontWeight: 500 }}>{s.label}</Text>
              {s.code && <CodeBlock code={s.code} onCopy={onCopy} />}
              {s.hint && (
                <Paragraph type="secondary" style={{ margin: "6px 0 0", fontSize: 12.5 }}>
                  {s.hint}
                </Paragraph>
              )}
            </div>
          </li>
        ))}
      </ol>

      {g.note && (
        <Paragraph type="secondary" style={{ margin: 0, fontSize: 12.5 }}>
          <CheckCircleFilled style={{ color: "#16B98D", marginInlineEnd: 6 }} />
          {g.note}
        </Paragraph>
      )}

      <Paragraph type="secondary" style={{ margin: 0, fontSize: 12 }}>
        {t("build.guideReadmeA", "Hướng dẫn này cũng nằm trong file")} <Text code>README.md</Text> {t("build.guideReadmeB", "kèm mã nguồn khi bạn tải về.")}
      </Paragraph>
    </div>
  );
}
