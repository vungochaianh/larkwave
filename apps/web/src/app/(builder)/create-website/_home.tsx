"use client";

import {
  ArrowRightOutlined,
  ChromeOutlined,
  CompassOutlined,
  DesktopOutlined,
  GlobalOutlined,
  MobileOutlined,
  RocketOutlined,
} from "@ant-design/icons";
import { Button, Card, Empty, Grid, Skeleton, Space, Typography } from "antd";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { type App as AppEntity, type Track } from "@larkwave/shared";
import { api, getToken, API_BASE } from "@/lib/api";
import { RuntimeProvider, Composer, WebRuntimeAdapter, useI18n, V } from "@larkwave/ui";
import { useAuth } from "@/lib/auth";
import { BRAND, CARD_SHADOW } from "@/lib/theme";
import AppPreviewCard from "@/components/AppPreviewCard";
import ExploreBrowser, { ExploreStyles } from "@/components/ExploreBrowser";

const { Title, Text, Paragraph } = Typography;

type TrackChoice = Track | "auto";
const VALID_TRACKS = ["web", "mobile", "desktop", "game", "extension", "auto"];

/**
 * Những loại app chỉ làm được trên APP DESKTOP.
 *
 * Website dựng rồi deploy thẳng lên hạ tầng của Larkwave, nên chỉ có nghĩa với thứ CHẠY TRONG
 * TRÌNH DUYỆT — website và game HTML5 nằm trong đó, và "tự động" thì để AI chọn trong số đó.
 * App mobile / desktop / tiện ích thì sản phẩm cuối là một thư mục mã nguồn phải cài phụ thuộc,
 * chạy và đóng gói trên máy bạn: làm ở đây chỉ ra một tệp nén để tải về, còn app desktop dựng
 * thẳng trên máy, mở sẵn thư mục dự án và tự nhận trình quản lý gói để chạy.
 */
const DESKTOP_ONLY_TRACKS: TrackChoice[] = ["mobile", "desktop", "extension"];


const TRACK_OPTIONS: { label: string; labelKey: string; value: TrackChoice; icon: ReactNode }[] = [
  { label: "Website", labelKey: "web.home.trackWeb", value: "web", icon: <GlobalOutlined /> },
  { label: "App mobile", labelKey: "web.home.trackMobile", value: "mobile", icon: <MobileOutlined /> },
  { label: "App desktop", labelKey: "web.home.trackDesktop", value: "desktop", icon: <DesktopOutlined /> },
  { label: "Tiện ích", labelKey: "web.home.trackExtension", value: "extension", icon: <ChromeOutlined /> },
];

const TRACK_HINTS: Record<TrackChoice, string> = {
  web:
    "Website chạy thẳng trên trình duyệt — Larkwave tự build, deploy và cho xem preview live ngay, kèm khả năng cài như app điện thoại (PWA).",
  mobile:
    "Dự án Expo (React Native + TypeScript). Tải code về, chạy “npx expo start”, quét mã QR bằng Expo Go để xem trên iOS/Android.",
  extension:
    "Tiện ích Chrome/Edge (Manifest V3). Tải code về → chrome://extensions → bật “Developer mode” → “Load unpacked”.",
  desktop:
    "App desktop (Electron + React). Tải code về, chạy “npm start” để mở; “npm run dist” để đóng gói cho Windows/macOS/Linux.",
  game:
    "Game HTML5 (Canvas/Phaser) — chạy thẳng trên trình duyệt, Larkwave tự build + deploy + preview live như website.",
  auto:
    "AI tự đọc mô tả và chọn loại app phù hợp nhất. Muốn deploy & preview ngay thì chọn Website.",
};
const TRACK_HINT_KEYS: Record<TrackChoice, string> = {
  web: "web.home.trackHintWeb",
  mobile: "web.home.trackHintMobile",
  extension: "web.home.trackHintExtension",
  desktop: "web.home.trackHintDesktop",
  game: "web.home.trackHintGame",
  auto: "web.home.trackHintAuto",
};

const TEMPLATE_CHIPS: { label: string; labelKey: string; prompt: string; track: Track }[] = [
  { label: "Landing quán cà phê", labelKey: "home.tplCoffee", prompt: "Trang landing cho quán cà phê với menu và form đặt bàn", track: "web" },
  { label: "Bảng Kanban công việc", labelKey: "home.tplKanban", prompt: "Dashboard quản lý công việc dạng Kanban kéo thả", track: "web" },
  { label: "App ghi chú", labelKey: "home.tplNotes", prompt: "App ghi chú nhanh có tìm kiếm và tag", track: "web" },
  { label: "Extension Pomodoro", labelKey: "home.tplPomodoro", prompt: "Extension Chrome đếm ngược thời gian tập trung", track: "extension" },
  { label: "App mobile ghi chi tiêu", labelKey: "home.tplMobileExpense", prompt: "App mobile ghi chi tiêu cá nhân: nhập khoản chi theo danh mục, xem tổng theo tháng + biểu đồ", track: "mobile" },
  { label: "App desktop quản lý ghi chú", labelKey: "home.tplDesktopNotes", prompt: "App desktop quản lý ghi chú: danh sách bên trái, soạn thảo bên phải, tạo/sửa/xoá, lưu trên máy", track: "desktop" },
  { label: "Game bắn gạch (Breakout)", labelKey: "home.tplGameBreakout", prompt: "Game bắn gạch: bóng nảy phá các viên gạch, thanh đỡ điều khiển bằng chuột/phím, điểm số + thắng/thua + chơi lại", track: "game" },
  { label: "Game rắn săn mồi", labelKey: "home.tplGameSnake", prompt: "Game rắn săn mồi (snake) cổ điển trên canvas: điều khiển bằng phím mũi tên, ăn mồi dài ra, điểm cao nhất", track: "game" },
];

export default function BuilderHomePage() {
  // useSearchParams must live under a Suspense boundary (Next.js App Router).
  return (
    <Suspense fallback={null}>
      <BuilderHome />
    </Suspense>
  );
}

function BuilderHome() {
  const { user } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const runtime = useMemo(() => new WebRuntimeAdapter(API_BASE, getToken), []);
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  const trackParam = searchParams.get("track");
  const [track, setTrack] = useState<TrackChoice>(
    VALID_TRACKS.includes(trackParam || "") ? (trackParam as TrackChoice) : "web",
  );
  const gated = DESKTOP_ONLY_TRACKS.includes(track);
  useEffect(() => {
    if (trackParam && VALID_TRACKS.includes(trackParam)) setTrack(trackParam as TrackChoice);
  }, [trackParam]);

  // Controlled composer prompt — driven by ?prompt= and the starter chips.
  const [prompt, setPrompt] = useState(searchParams.get("prompt") ?? "");
  useEffect(() => {
    const p = searchParams.get("prompt");
    if (p) setPrompt(p);
  }, [searchParams]);

  const greetingName = user?.name?.trim() || t("home.greetingGuest", "bạn");
  const activeOpt = TRACK_OPTIONS.find((o) => o.value === track) ?? TRACK_OPTIONS[0];

  const pick = (p: string) => {
    setPrompt(p);
    setTimeout(
      () => document.getElementById("tw-create-bar")?.scrollIntoView({ behavior: "smooth", block: "start" }),
      50,
    );
  };

  return (
    <div style={{ width: "100%" }}>
      {/* Create block — centered at a comfortable form width. */}
      {/* Ô soạn dùng hết bề ngang màn hình (chỉ chặn ở 1280px để dòng chữ không dài quá tầm
          mắt trên màn siêu rộng). Trước đó bị bó trong 880px nên bảng tuỳ chọn hai cột chật
          cứng, mà chỗ trống hai bên thì bỏ không. */}
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <Space direction="vertical" size={isMobile ? 16 : 20} style={{ width: "100%" }}>
          {/* Heading */}
          <div style={{ textAlign: "center", paddingTop: isMobile ? 4 : 12 }}>
            <Title level={2} style={{ margin: 0, fontSize: isMobile ? 24 : 32, fontWeight: 800, letterSpacing: -0.5 }}>
              {t("home.buildTitle", "Bạn muốn tạo gì hôm nay")}, {greetingName}?
            </Title>
            <Text type="secondary" style={{ fontSize: isMobile ? 13.5 : 15 }}>
              {t("home.buildSubtitle", "Mô tả ý tưởng — Larkwave dựng, build & preview ngay.")}
            </Text>
          </div>

          {/* KHÔNG còn hàng tab chọn loại.
              Web chỉ tạo được website, nên một hàng 6 tab là bày ra 5 thứ bấm vào không dùng
              được — mà nó còn tràn ngang, đẻ ra một thanh cuộn nằm chắn ngang giữa trang. Ba
              loại chỉ làm được trên máy lui về sau một dòng chữ nhỏ ở dưới: vẫn tìm ra, nhưng
              không chiếm chỗ của việc chính. */}
          {!gated && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", justifyContent: "center", maxWidth: 720, margin: "0 auto" }}>
              <span style={{ fontSize: 14, color: "#6C5CE7", marginTop: 1 }}>{activeOpt.icon}</span>
              <Text type="secondary" style={{ fontSize: 12.5, lineHeight: 1.5, textAlign: "center" }}>
                {t(TRACK_HINT_KEYS.web, TRACK_HINTS.web)}
              </Text>
            </div>
          )}

          {/* Loại app chỉ làm được trên máy: thay ô soạn bằng lối đi tiếp, chứ không để người ta
              gõ xong mô tả rồi mới biết là không tạo được. */}
          {gated ? (
            <DesktopOnlyNotice onBack={() => setTrack("web")} />
          ) : (
          <div id="tw-create-bar">
            <RuntimeProvider runtime={runtime}>
              <Composer
                initialTrack={track}
                hideTrackSelector
                promptValue={prompt}
                onPromptChange={setPrompt}
                onBrowseTemplates={() => router.push("/templates")}
                onResult={(appId, buildId) =>
                  router.push(`/apps/${appId}${buildId ? `?build=${buildId}` : ""}`)
                }
                onQuota={() => router.push("/pricing")}
              />
            </RuntimeProvider>
          </div>
          )}

          {/* Starter prompts for the chosen type. */}
          {!gated && <StarterChips track={track} onPick={pick} />}

          {/* Lối sang các loại app khác. Là một DÒNG THÔNG TIN có viền, không phải cái link chữ
              nhỏ trôi giữa trang: đây là câu trả lời cho "sao không thấy chỗ làm app mobile?",
              nên phải đọc được mà không cần đi tìm — nhưng vẫn đứng dưới ô soạn để không tranh
              chỗ với việc chính là tạo website. */}
          {!gated && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                justifyContent: "center",
                maxWidth: 640,
                margin: "0 auto",
                padding: "10px 16px",
                border: `1px solid ${V.border}`,
                borderRadius: 12,
                background: V.surfaceAlt,
              }}
            >
              <DesktopOutlined style={{ color: "#6C5CE7", fontSize: 16 }} />
              <Text type="secondary" style={{ fontSize: 13, flex: "1 1 260px", minWidth: 0 }}>
                {t(
                  "home.otherTypesInfo",
                  "App mobile, app desktop và tiện ích trình duyệt làm trên app Larkwave cho máy tính.",
                )}
              </Text>
              <Button size="small" onClick={() => setTrack("desktop")}>
                {t("home.otherTypesCta", "Xem cách làm")}
              </Button>
            </div>
          )}
        </Space>
      </div>

      {/* Your apps of this type — FULL WIDTH (was cramped inside the 920 form column). */}
      <div style={{ marginTop: isMobile ? 26 : 40 }}>
        <AppsOfType track={track} />
      </div>
    </div>
  );
}

/**
 * Thẻ thay cho ô soạn khi loại app chỉ làm được trên máy.
 *
 * Nói THẲNG lý do rồi mới tới nút tải: "không làm được ở đây" mà không kèm vì sao thì người ta
 * tưởng hỏng hoặc tưởng bị khoá vì gói cước. Các bước bên dưới cố ý ngắn và chỉ nêu thứ chắc
 * chắn đúng — app desktop nhận trình quản lý gói của dự án và chạy được nó, chứ KHÔNG tự cài
 * Node cho bạn.
 */
function DesktopOnlyNotice({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();

  const steps = [
    t("home.desktopOnlyStep1", "Tải và cài app Larkwave cho máy tính."),
    t("home.desktopOnlyStep2", "Đăng nhập bằng chính tài khoản này — app và web dùng chung dữ liệu."),
    t("home.desktopOnlyStep3", "Vào “Làm app” rồi chọn đúng loại bạn cần."),
    t(
      "home.desktopOnlyStep4",
      "App dựng thẳng trên máy bạn, mở sẵn thư mục dự án và tự nhận trình quản lý gói (npm/pnpm/yarn/bun) để chạy thử.",
    ),
  ];

  return (
    <Card
      style={{ maxWidth: 720, margin: "0 auto", borderRadius: 16 }}
      styles={{ body: { padding: 22 } }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 20, color: "#6C5CE7", display: "inline-flex" }}><DesktopOutlined /></span>
        <Text strong style={{ fontSize: 16 }}>
          {t("home.desktopOnlyTitle", "Loại app này làm trên app desktop")}
        </Text>
      </div>

      <Paragraph type="secondary" style={{ fontSize: 13.5, marginBottom: 14 }}>
        {t(
          "home.desktopOnlyWhy",
          "Trang web dựng xong rồi deploy thẳng lên hạ tầng Larkwave, nên chỉ hợp với thứ chạy trong trình duyệt. Loại app này thì sản phẩm cuối là một thư mục mã nguồn cần cài phụ thuộc, chạy và đóng gói ngay trên máy bạn — app desktop làm trọn việc đó, sạch sẽ và không phải tải lên tải xuống.",
        )}
      </Paragraph>

      <ol style={{ margin: "0 0 18px", paddingLeft: 20, fontSize: 13.5, lineHeight: 1.85, color: "inherit" }}>
        {steps.map((st) => (
          <li key={st}>{st}</li>
        ))}
      </ol>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link href="/download">
          <Button type="primary" icon={<DesktopOutlined />}>
            {t("home.desktopOnlyCta", "Tải app desktop")}
          </Button>
        </Link>
        <Button onClick={onBack} type="text">
          {t("home.desktopOnlyBack", "Hoặc chọn Website để tạo ngay tại đây")}
        </Button>
      </div>
    </Card>
  );
}

/** Compact starter-prompt chips filtered to the active type. */
function StarterChips({ track, onPick }: { track: TrackChoice; onPick: (prompt: string) => void }) {
  const { t } = useI18n();
  const filter = track !== "auto" ? track : undefined;
  const chips = filter ? TEMPLATE_CHIPS.filter((c) => c.track === filter) : TEMPLATE_CHIPS;
  if (!chips.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", alignItems: "center" }}>
      <Text type="secondary" style={{ fontSize: 12.5 }}>
        {t("home.starters", "Gợi ý nhanh:")}
      </Text>
      {chips.map((c) => (
        <button
          key={c.label}
          type="button"
          title={c.prompt}
          onClick={() => onPick(c.prompt)}
          style={{
            cursor: "pointer",
            fontSize: 12.5,
            color: "#5B4FC2",
            background: "rgba(108,92,231,0.08)",
            border: "1px solid rgba(108,92,231,0.20)",
            borderRadius: 999,
            padding: "5px 13px",
            lineHeight: 1.3,
          }}
        >
          {t(c.labelKey, c.label)}
        </button>
      ))}
      <Link href="/templates" style={{ fontSize: 12.5, fontWeight: 600 }}>
        {t("home.allTemplates", "Tất cả mẫu")} <ArrowRightOutlined style={{ fontSize: 10 }} />
      </Link>
    </div>
  );
}

/** "App của bạn · <type>" — the user's apps of the chosen type (uses the backend
 *  track filter). Keeps the builder page focused: create above, your work below. */
function AppsOfType({ track }: { track: TrackChoice }) {
  const { t } = useI18n();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [apps, setApps] = useState<AppEntity[] | null>(null);
  const filter = track !== "auto" ? track : undefined;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.listApps({ pageSize: 12, ...(filter ? { track: filter } : {}) });
        if (!cancelled) setApps(res.items);
      } catch {
        if (!cancelled) setApps([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filter]);

  const handleDeleted = (id: string) => setApps((prev) => (prev ? prev.filter((a) => a.id !== id) : prev));

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <Title level={5} style={{ margin: 0 }}>
          {/* Không còn hậu tố "· <loại>": web chỉ tạo website nên nó lặp lại điều đã biết. */}
          {t("home.yourApps", "Website của bạn")}
        </Title>
        <Link href={filter ? `/apps?track=${filter}` : "/apps"} style={{ fontWeight: 600 }}>
          {t("home.viewAll", "Xem tất cả")} <ArrowRightOutlined style={{ fontSize: 11 }} />
        </Link>
      </div>

      {apps === null ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 260px), 1fr))", gap: isMobile ? 12 : 16 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} style={{ boxShadow: CARD_SHADOW, borderRadius: 14 }}>
              <Skeleton active paragraph={{ rows: 2 }} />
            </Card>
          ))}
        </div>
      ) : apps.length === 0 ? (
        <Card style={{ boxShadow: CARD_SHADOW, borderRadius: 14 }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              // "Mô tả ý tưởng ở trên" là lời khuyên sai khi loại app này bị giới hạn — ở trên
              // không còn ô nào để mô tả.
              DESKTOP_ONLY_TRACKS.includes(track)
                ? t("home.emptyAppsTypeDesktop", "Chưa có app loại này — tạo bằng app desktop.")
                : t("home.emptyAppsType", "Chưa có website nào — mô tả ý tưởng ở trên để tạo!")
            }
          >
            <Link href="/templates">
              <Button icon={<RocketOutlined />}>{t("home.exploreTemplates", "Khám phá mẫu")}</Button>
            </Link>
          </Empty>
        </Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 260px), 1fr))", gap: isMobile ? 12 : 16 }}>
          {apps.map((a) => (
            <AppPreviewCard key={a.id} app={a} onDeleted={handleDeleted} />
          ))}
        </div>
      )}

      {/*
        Khối "Khám phá app cộng đồng", đặt DƯỚI CÙNG.
        Thứ tự này có lý do: phần trên là việc của người dùng — ô mô tả ý tưởng và những app họ đã
        dựng. App của người khác là thứ để tham khảo, nên nó đứng sau, không chen vào giữa.
        Cùng một khối với trang /explore (components/ExploreBrowser), nên sửa một chỗ là cả hai
        cùng đổi — không có bản chép tay nào phải nhớ đồng bộ.
      */}
      <div style={{ marginTop: isMobile ? 36 : 52, paddingTop: isMobile ? 24 : 32, borderTop: `1px solid ${V.border}` }}>
        <ExploreStyles />
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <CompassOutlined style={{ color: BRAND, fontSize: 18 }} />
            <span style={{ fontSize: isMobile ? 17 : 19, fontWeight: 700, color: V.text }}>
              {t("web.pubc.exTitle", "Khám phá app cộng đồng")}
            </span>
          </div>
          <div style={{ marginTop: 4, fontSize: 13.5, lineHeight: 1.6, color: V.textSub }}>
            {t(
              "web.pubc.exSubIn",
              "App được tạo bằng AI trên Larkwave. Mở chạy thử, lấy cảm hứng, rồi dựng app của riêng bạn.",
            )}
          </div>
        </div>
        <ExploreBrowser />
      </div>
    </div>
  );
}
