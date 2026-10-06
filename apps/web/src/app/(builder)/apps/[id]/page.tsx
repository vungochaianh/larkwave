"use client";

import {
  ApartmentOutlined,
  ApiOutlined,
  ArrowLeftOutlined,
  BugOutlined,
  CheckOutlined,
  CloseOutlined,
  CloseCircleOutlined,
  CodeOutlined,
  CloudServerOutlined,
  CloudUploadOutlined,
  CopyOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  DeploymentUnitOutlined,
  DesktopOutlined,
  DownloadOutlined,
  EditOutlined,
  ExpandAltOutlined,
  EyeOutlined,
  FileTextOutlined,
  GithubFilled,
  GlobalOutlined,
  GlobalOutlined as DomainOutlined,
  GitlabFilled,
  GitlabOutlined,
  HistoryOutlined,
  LinkOutlined,
  LineChartOutlined,
  MessageOutlined,
  RiseOutlined,
  LockOutlined,
  MoreOutlined,
  PushpinFilled,
  PushpinOutlined,
  ReloadOutlined,
  RobotOutlined,
  SaveOutlined,
  SendOutlined,
  ShareAltOutlined,
  ShrinkOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import {
  App,
  Avatar,
  Button,
  Alert,
  Card,
  Drawer,
  Dropdown,
  Empty,
  Grid,
  Image as AntImage,
  Input,
  Modal,
  Popconfirm,
  Segmented,
  Skeleton,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { MenuProps } from "antd";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  App as AppEntity,
  AssistantMessage,
  Build,
  Deployment,
  DetectedService,
  GeneratedFile,
  LogLine,
  ServerDeployStatusResponse,
  UploadRef,
} from "@larkwave/shared";
import { useI18n } from "@larkwave/ui";
import { api, saveBlob, streamAssistant } from "@/lib/api";
import { emitAppsChanged } from "@/lib/appEvents";
import { handleQuotaError } from "@/lib/billing";
import { formatDate } from "@/lib/format";
import { CARD_SHADOW } from "@/lib/theme";
import { FullPageSpinner } from "@/components/AuthGuard";
import MarkdownLite from "@/components/MarkdownLite";
import BuildConversation from "@/components/BuildConversation";
import BuildDetail from "@/components/BuildDetail";
import BuildProgress from "@/components/BuildProgress";
import BuildTurn from "@/components/BuildThread";
import CodeEditor from "@/components/CodeEditor";
import LogConsole from "@/components/LogConsole";
import PreviewPane, { type PickedElement } from "@/components/PreviewPane";
import DbBrowser from "@/components/DbBrowser";
import ApiBrowser from "@/components/ApiBrowser";
import RuntimeConsole from "@/components/RuntimeConsole";
import PromptComposer from "@/components/PromptComposer";
import {
  AppStatusTag,
  BuildStatusTag,
  DeploymentStatusTag,
  TrackTag,
} from "@/components/StatusTags";
import { useBuildStream } from "@/lib/useBuildStream";
import LocalGuideSection from "./LocalGuideSection";
import MembersSection from "./MembersSection";
import SeoPanel from "./SeoPanel";
import AnalyticsPanel from "./AnalyticsPanel";
import SecurityPanel from "./SecurityPanel";
import AutomationsPanel from "./AutomationsPanel";

const { Title, Text, Paragraph } = Typography;

/**
 * The right pane is a Base44-style canvas with a top "Preview / Dashboard"
 * toggle. Preview = the live app. Dashboard = a single-level left-nav of every
 * management section (rendered inline, no drawer).
 */
type DashKey =
  | "overview"
  | "code"
  | "console"
  | "api"
  | "db"
  | "analytics"
  | "seo"
  | "security"
  | "automations"
  | "domains"
  | "deployments"
  | "builds"
  | "members"
  | "services"
  | "suite"
  | "local-guide"
  | "logs";

type View = "preview" | DashKey;

/** Every valid canvas view = a URL segment under /apps/<id>/<view>. */
const ALL_VIEWS = new Set<View>([
  "preview", "overview", "code", "console", "api", "db", "analytics", "seo",
  "security", "automations", "domains", "deployments", "builds", "members",
  "services", "suite", "local-guide", "logs",
]);

type DashNavItem = {
  key: DashKey;
  label: string;
  icon: ReactNode;
  /** Optional capability gate — hidden from the nav when it returns false. */
  show?: (a: AppEntity) => boolean;
};

/** The dashboard left-nav, in display order. */
const DASH_NAV: DashNavItem[] = [
  { key: "overview", label: "Tổng quan", icon: <DashboardOutlined /> },
  { key: "code", label: "Code", icon: <CodeOutlined /> },
  { key: "console", label: "Console", icon: <BugOutlined />, show: (a) => a.track === "web" },
  { key: "api", label: "API", icon: <ApiOutlined />, show: (a) => a.backendKind === "fullstack" },
  { key: "db", label: "Dữ liệu", icon: <DatabaseOutlined />, show: (a) => a.backendKind === "fullstack" },
  { key: "analytics", label: "Analytics", icon: <LineChartOutlined />, show: (a) => a.track === "web" },
  { key: "seo", label: "SEO & GEO", icon: <RiseOutlined />, show: (a) => a.track === "web" },
  { key: "security", label: "Bảo mật", icon: <LockOutlined />, show: (a) => a.track === "web" },
  { key: "automations", label: "Automations", icon: <ThunderboltOutlined />, show: (a) => a.track === "web" },
  { key: "domains", label: "Tên miền", icon: <DomainOutlined /> },
  { key: "deployments", label: "Deployments", icon: <DeploymentUnitOutlined /> },
  { key: "builds", label: "Phiên bản", icon: <HistoryOutlined /> },
  { key: "members", label: "Cộng tác", icon: <TeamOutlined /> },
  { key: "services", label: "Cấu trúc dự án", icon: <ApartmentOutlined />, show: (a) => !!a.gitImported },
  // "Bộ site": chỉ hiện khi app này thuộc một bộ. Đặt cạnh "Cấu trúc dự án" vì cùng trả lời một
  // câu hỏi — hệ thống này gồm những phần nào — chỉ khác ở chỗ các phần là site riêng biệt.
  { key: "suite", label: "Các site trong bộ", icon: <ApartmentOutlined />, show: (a) => !!a.suiteId },
  { key: "local-guide", label: "Chạy local", icon: <DesktopOutlined />, show: (a) => !!a.gitImported },
  { key: "logs", label: "Logs", icon: <FileTextOutlined /> },
];

const DASH_META = Object.fromEntries(DASH_NAV.map((n) => [n.key, n])) as Record<DashKey, DashNavItem>;

/** i18n key per dashboard section — labels live in DASH_NAV (module scope) so we
 * translate at render via this map (like the nav pattern). Fallback = the VI label. */
const DASH_I18N: Record<DashKey, string> = {
  overview: "build.navOverview",
  code: "build.navCode",
  console: "build.navConsole",
  api: "build.navApi",
  db: "build.navDb",
  analytics: "build.navAnalytics",
  seo: "build.navSeo",
  security: "build.navSecurity",
  automations: "build.navAutomations",
  domains: "build.navDomains",
  deployments: "build.navDeployments",
  builds: "build.navBuilds",
  members: "build.navMembers",
  services: "build.navServices",
  suite: "build.navSuite",
  "local-guide": "build.navLocalGuide",
  logs: "build.navLogs",
};

/** Sections that own their full-height layout/scroll (editors/browsers) — no
 * card padding wrapper, no section header. */
const DASH_FULL_BLEED = new Set<DashKey>(["code", "console", "api", "db"]);

export default function AppDetailPage() {
  const { t } = useI18n();
  // useSearchParams must live under a Suspense boundary (Next.js App Router).
  return (
    <Suspense fallback={<FullPageSpinner tip={t("build.loadingApp", "Đang tải app…")} />}>
      <AppDetail />
    </Suspense>
  );
}

function AppDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const searchParams = useSearchParams();
  const buildParam = searchParams.get("build");
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  // Below md (~phones) the dashboard's fixed 212px left-nav is too wide, so we
  // flip it into a horizontal scrolling tab strip with the panels stacked below.
  const screens = Grid.useBreakpoint();
  const dashStack = !screens.md;

  const [app, setApp] = useState<AppEntity | null>(null);
  const [loading, setLoading] = useState(true);

  // The active canvas view: "preview" (live app) or a dashboard section. Synced to the
  // URL (?view=<view>) so it's shareable, survives reload, and shows in error reports.
  // Initial value comes from ?view= on load.
  const initialView = searchParams.get("view");
  const [view, setView] = useState<View>(
    initialView && ALL_VIEWS.has(initialView as View) ? (initialView as View) : "preview",
  );
  // Reflect the active view in the URL (?view=) without a full navigation — preserving
  // other params (e.g. ?build=). Shallow replaceState avoids re-fetching/re-streaming.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (view === "preview") sp.delete("view");
    else sp.set("view", view);
    const qs = sp.toString();
    const url = `/apps/${id}${qs ? `?${qs}` : ""}`;
    if (`${window.location.pathname}${window.location.search}` !== url) {
      window.history.replaceState(window.history.state, "", url);
    }
  }, [view, id]);
  // The conversation panel is a floating, chatbot-style overlay. Open by default on
  // entering the workspace (so the user can prompt changes right away); a mount
  // effect closes it on mobile, where it's a full-screen drawer. FAB/top-bar toggle.
  const [chatOpen, setChatOpen] = useState(true);
  // Vừa đóng khung trò chuyện thì bung nhãn + nhấp nháy vài nhịp ở nút tròn: cái nút
  // trơ trọi không nói nó mở ra cái gì, nên đóng một lần là mất luôn đường sửa app.
  // Tự thu về sau vài giây (vẫn hiện lại khi rê chuột) để không thành đèn nháy vĩnh viễn.
  // The floating chat does two things in one box: "build" = iterate the app,
  // "help" = general AI assistant (context-aware to this app).
  const [chatMode, setChatMode] = useState<"build" | "help">("build");
  // Expand the floating chat to a large/near-fullscreen panel.
  const [chatExpanded, setChatExpanded] = useState(false);
  const [helpMsgs, setHelpMsgs] = useState<AssistantMessage[]>([]);
  const [helpText, setHelpText] = useState("");
  const [helpLoading, setHelpLoading] = useState(false);
  const helpEndRef = useRef<HTMLDivElement>(null);

  // On entering the workspace (desktop): open the chat AND expand it to the large
  // panel so the conversation is comfortable to read/use right away. On mobile
  // (≤1000px) keep it closed (it's a full-screen drawer there; the FAB opens it).
  // Runs once on mount → no SSR/hydration mismatch (first render matches on both).
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth <= 1000) setChatOpen(false);
    else setChatExpanded(true);
  }, []);

  // Keep the help thread scrolled to the latest message.
  useEffect(() => {
    if (chatMode === "help") helpEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [helpMsgs, chatMode, chatOpen]);

  // The historical thread of completed builds (oldest → newest) shown above the
  // live/active turn in the left conversation pane.
  const [history, setHistory] = useState<Build[]>([]);

  // The active / streaming build (the latest assistant turn), plus its prompt + attachments.
  const [activeBuildId, setActiveBuildId] = useState<string | null>(null);
  const [activePrompt, setActivePrompt] = useState<string | null>(null);
  const [activeAttachments, setActiveAttachments] = useState<UploadRef[]>([]);
  // Whether we've already auto-switched to Preview after success.
  const [autoSwitched, setAutoSwitched] = useState(false);

  // Preview "select element" picker → targeted edit text dropped into the composer.
  const [pickPrefill, setPickPrefill] = useState<{ text: string; nonce: number }>();

  const [drawerBuildId, setDrawerBuildId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  // Bumped whenever a build finishes — forces Preview + Code to re-fetch/reload.
  const [refreshSignal, setRefreshSignal] = useState(0);

  // Scroll anchor pinned to the bottom of the conversation.
  const threadEndRef = useRef<HTMLDivElement | null>(null);

  // Tracks a build we've already begun streaming locally (iterate / re-run), so
  // the ?build=-resolution effect doesn't re-fetch + re-stream it on URL change.
  const startedLocallyRef = useRef<string | null>(null);

  const {
    state: iterState,
    start: startIterate,
    loadDetail: loadIterDetail,
  } = useBuildStream();

  const loadApp = useCallback(async () => {
    try {
      const res = await api.getApp(id);
      setApp(res);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id, message]);

  // Load the full build history (for the chat thread). Excludes whichever build
  // is currently being streamed live (it's rendered as the active turn).
  const loadHistory = useCallback(
    async (excludeId?: string | null) => {
      try {
        const res = await api.appBuilds(id, { page: 1, pageSize: 50 });
        // API returns newest-first; the thread shows oldest → newest.
        const ordered = [...res.items].reverse();
        setHistory(
          excludeId ? ordered.filter((b) => b.id !== excludeId) : ordered,
        );
      } catch {
        // Non-fatal — thread simply shows what it has.
      }
    },
    [id],
  );

  useEffect(() => {
    void loadApp();
  }, [loadApp]);

  // For apps with no live deploy (e.g. import-only monorepos), default the canvas
  // to Code so the user immediately sees their full imported source. Runs once.
  const didDefaultTabRef = useRef(false);
  useEffect(() => {
    if (app && !didDefaultTabRef.current) {
      didDefaultTabRef.current = true;
      if (!app.currentUrl) setView("code");
    }
  }, [app]);

  // Resolve the active build on load: explicit ?build= wins, else the most
  // recent queued/running build for this app. Stream it as the latest turn.
  useEffect(() => {
    // If this ?build= is one we just started locally, the stream is already
    // attached — don't re-resolve/re-stream it.
    if (buildParam && buildParam === startedLocallyRef.current) {
      void loadHistory(buildParam);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        let targetId: string | null = buildParam ?? null;
        let prompt: string | null = null;
        let attach: UploadRef[] = [];

        if (targetId) {
          const b = await api.getBuild(targetId);
          if (cancelled) return;
          prompt = b.prompt;
          attach = b.attachments ?? [];
        } else {
          const res = await api.appBuilds(id, { page: 1, pageSize: 1 });
          if (cancelled) return;
          const latest = res.items[0];
          if (
            latest &&
            (latest.status === "queued" ||
              latest.status === "running" ||
              latest.status === "awaiting_approval")
          ) {
            targetId = latest.id;
            prompt = latest.prompt;
            attach = latest.attachments ?? [];
          }
        }

        if (cancelled) return;

        if (targetId) {
          setActiveBuildId(targetId);
          setActivePrompt(prompt);
          setActiveAttachments(attach);
          setAutoSwitched(false);
          loadIterDetail(targetId);
          void loadHistory(targetId);
        } else {
          // No active build → show full history, default canvas to Preview.
          setActiveBuildId(null);
          setActivePrompt(null);
          setActiveAttachments([]);
          void loadHistory(null);
        }
      } catch {
        void loadHistory(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Re-run when the app id or explicit build param changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, buildParam]);

  // When the streamed build reaches a terminal succeeded state, refresh
  // everything and auto-switch to Preview so the user sees the result.
  useEffect(() => {
    if (iterState.status === "succeeded") {
      void loadApp();
      void loadHistory(activeBuildId);
      setRefreshSignal((n) => n + 1);
      if (!autoSwitched) {
        setAutoSwitched(true);
        const timer = setTimeout(() => setView("preview"), 1200);
        return () => clearTimeout(timer);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iterState.status]);

  // Keep the conversation pinned to the newest turn.
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [history.length, activeBuildId, iterState.logs.length, iterState.status]);

  const copy = useCallback(
    async (v: string) => {
      try {
        await navigator.clipboard.writeText(v);
        message.success(t("build.copied", "Đã sao chép"));
      } catch {
        message.error(t("build.copyFailed", "Không sao chép được"));
      }
    },
    [message, t],
  );

  const downloadZip = useCallback(async () => {
    if (!app) return;
    setDownloading(true);
    try {
      const res = await api.appBuilds(id, { page: 1, pageSize: 50 });
      const build =
        res.items.find((b) => b.status === "succeeded") ?? res.items[0];
      if (!build) {
        message.warning(t("build.noBuildToDownload", "Chưa có build nào để tải"));
        return;
      }
      const blob = await api.downloadBuildZip(build.id);
      saveBlob(blob, `${app.slug || "app"}.zip`);
      message.success(t("build.zipStarted", "Đã bắt đầu tải ZIP"));
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setDownloading(false);
    }
  }, [app, id, message, t]);

  // Kick off an iterate build that streams as the latest turn in the thread.
  const beginIterate = useCallback(
    (bid: string, prompt: string) => {
      // Fold the previously-active build into history before swapping in the new one.
      void loadHistory(bid);
      setActiveBuildId(bid);
      setActivePrompt(prompt || null);
      setActiveAttachments([]);
      setAutoSwitched(false);
      startIterate(bid);
      startedLocallyRef.current = bid;
      // Reflect the active build in the URL so a reload resumes it.
      router.replace(`/apps/${id}?build=${bid}`, { scroll: false });
      // Pull the build's attachments (and prompt, if not passed) so the active
      // turn shows the files the user just attached.
      api
        .getBuild(bid)
        .then((b) => {
          if (!prompt) setActivePrompt(b.prompt);
          setActiveAttachments(b.attachments ?? []);
        })
        .catch(() => {});
    },
    [startIterate, router, id, loadHistory],
  );

  // Preview "select element" → drop a targeted edit instruction into the composer
  // (referencing the clicked element) so the user just appends what to change.
  const handlePickElement = useCallback(
    (el: PickedElement) => {
      const tag = el.tag || t("build.element", "phần tử");
      const text = el.text ? ` “${el.text.slice(0, 60)}”` : "";
      const where = el.selector ? ` (${t("build.position", "vị trí")}: ${el.selector})` : "";
      const msg = `${t("build.atElement", "Ở phần tử")} <${tag}>${text}${where}, ${t("build.iWant", "tôi muốn")}: `;
      setPickPrefill((p) => ({ text: msg, nonce: (p?.nonce ?? 0) + 1 }));
      message.success(t("build.elementPicked", "Đã chọn phần tử — mô tả thay đổi/lỗi rồi bấm Gửi yêu cầu."));
    },
    [message, t],
  );

  // Re-deploy a build's ALREADY-generated source as a free edit build (no AI
  // codegen / credit). For a build that built OK but failed only at the deploy
  // step (e.g. a transient Cloudflare error) — no regeneration, no cost.
  const redeployFrom = useCallback(
    async (buildId: string) => {
      try {
        const res = await api.redeployBuild(buildId);
        beginIterate(res.buildId, t("build.redeployPrompt", "Triển khai lại mã nguồn đã tạo"));
      } catch (e) {
        if (!handleQuotaError(e, modal, () => router.push("/pricing"))) {
          message.error((e as Error).message);
        }
      }
    },
    [beginIterate, modal, message, router, t],
  );

  // "Chạy trên Server" from a build error. The chat panel is EXPANDED over the canvas
  // on desktop, so merely switching the view shows nothing. Collapse/close the chat
  // first, then open the server-deploy view so the user actually SEES the Docker card.
  const goServerDeploy = useCallback(() => {
    setChatExpanded(false);
    if (typeof window !== "undefined" && window.innerWidth <= 1000) setChatOpen(false);
    setView(app?.gitImported ? "services" : "overview");
  }, [app?.gitImported]);

  // Upgrade a frontend-only app to full-stack (real DB + API) and/or add a CMS —
  // an iterate that converts localStorage→/api in the SAME app/URL/workspace.
  const upgradeApp = useCallback(
    async (cms: boolean) => {
      // It's a full AI codegen build → confirm before running, since the user
      // clicks a single button. Usage is metered as a % of the monthly plan.
      const ok = await new Promise<boolean>((resolve) => {
        modal.confirm({
          title: cms
            ? t("build.upgradeCmsTitle", "Nâng cấp full-stack + CMS?")
            : t("build.upgradeDbTitle", "Thêm cơ sở dữ liệu (full-stack)?"),
          content: `${t("build.upgradeContentA", "AI sẽ dựng lại backend thật (cơ sở dữ liệu + API)")}${
            cms ? t("build.upgradeContentCms", " và trang quản trị (CMS)") : ""
          }${t("build.upgradeContentB", ", chuyển dữ liệu sang /api. Lần build này dùng một phần % gói của bạn theo token thực tế.")}`,
          okText: t("build.upgrade", "Nâng cấp"),
          cancelText: t("build.cancel", "Huỷ"),
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });
      if (!ok) return;
      try {
        const prompt = cms
          ? "Nâng cấp app này thành full-stack: thêm CƠ SỞ DỮ LIỆU thật + API, và thêm TRANG QUẢN TRỊ (CMS) để quản lý dữ liệu. Chuyển dữ liệu từ localStorage sang /api, giữ nguyên giao diện & tính năng."
          : "Nâng cấp app này thành full-stack: thêm CƠ SỞ DỮ LIỆU thật + API. Chuyển dữ liệu từ localStorage sang /api, giữ nguyên giao diện & tính năng.";
        const { buildId } = await api.createBuild({ appId: id, prompt, backend: "fullstack", cms });
        beginIterate(buildId, prompt);
        void loadApp();
      } catch (e) {
        if (!handleQuotaError(e, modal, () => router.push("/pricing"))) {
          message.error((e as Error).message);
        }
      }
    },
    [id, beginIterate, modal, message, router, loadApp, t],
  );

  // Re-run the same prompt as a brand-new build, streamed in this same view.
  // Carry over the failed build's attachments so "Chạy lại" rebuilds with the
  // SAME reference files (image mockups / PDF / Office specs) the user attached —
  // otherwise a retry silently loses them and regenerates from the prompt alone.
  const rerunBuild = useCallback(
    async (prompt: string, buildId?: string) => {
      try {
        // Có id bản dựng thì để máy chủ tự đọc yêu cầu gốc (xem rebuildFrom để biết vì sao).
        // Không có thì mới gửi prompt — đó là câu người dùng vừa gõ, luôn trong giới hạn.
        const attachmentIds = activeAttachments.map((a) => a.id);
        const res = buildId
          ? await api.rerunBuild(buildId)
          : await api.createBuild({
              appId: id,
              prompt,
              ...(attachmentIds.length ? { attachmentIds } : {}),
            });
        beginIterate(res.buildId, prompt);
      } catch (e) {
        if (!handleQuotaError(e, modal, () => router.push("/pricing"))) {
          throw e;
        }
      }
    },
    [id, beginIterate, modal, router, activeAttachments],
  );

  // Rebuild ANY past turn from the thread: reuse its exact prompt + attachments
  // (still stored on the server) + model/màu/kiểu — so a failed build is one
  // click to retry, with no need to re-upload the reference files.
  const rebuildFrom = useCallback(
    async (b: Build) => {
      try {
        // KHÔNG gửi lại b.prompt: prompt đã lưu có thể dài hơn trần 4000 ký tự của DTO (bối cảnh
        // hệ thống từng bị nhồi vào đó), và lúc ấy nút này chết ngay ở cổng kiểm tra với một câu
        // người dùng không làm gì được. Máy chủ tự đọc yêu cầu gốc + đính kèm + màu/kiểu.
        const { buildId } = await api.rerunBuild(b.id);
        beginIterate(buildId, b.prompt);
      } catch (e) {
        if (!handleQuotaError(e, modal, () => router.push("/pricing"))) {
          message.error((e as Error).message);
        }
      }
    },
    [id, beginIterate, modal, message, router],
  );

  if (loading) return <FullPageSpinner tip={t("build.loadingApp", "Đang tải app…")} />;
  if (!app) {
    return (
      <Empty description={t("build.appNotFound", "Không tìm thấy app")}>
        <Button type="primary" onClick={() => router.push("/apps")}>
          {t("build.backToList", "Về danh sách")}
        </Button>
      </Empty>
    );
  }

  const hasActiveTurn = !!activeBuildId && !!iterState.buildId;
  const emptyThread = history.length === 0 && !hasActiveTurn;

  // Pinned recovery for the LATEST failed build of an imported app — surfaced right
  // at the composer (not buried up the thread) so "Chạy trên Server" / free rebuild
  // are always one click away. A freshly-failed build stays as the active turn (the
  // failed-stream isn't moved to history), so read it from iterState; otherwise fall
  // back to the last completed turn.
  const activeFailed =
    hasActiveTurn && (iterState.status === "failed" || iterState.status === "canceled");
  const lastTurn = history.length ? history[history.length - 1] : null;
  const recovery: { buildId: string; error: string } | null = app?.gitImported
    ? activeFailed && iterState.buildId
      ? { buildId: iterState.buildId, error: iterState.error ?? "" }
      : !hasActiveTurn &&
          lastTurn &&
          (lastTurn.status === "failed" || lastTurn.status === "canceled")
        ? { buildId: lastTurn.id, error: lastTurn.error ?? "" }
        : null
    : null;
  const recoverySsr =
    !!recovery &&
    /xuất.{0,6}trang tĩnh|Static worker|Export encountered|cần SSR|cần.{0,4}máy chủ|Chạy trên Server/i.test(
      recovery.error,
    );

  // Floating-chat "Trợ giúp" tab → general AI assistant, aware of this app (streamed).
  const sendHelp = () => {
    const content = helpText.trim();
    if (!content || helpLoading || !app) return;
    const next: AssistantMessage[] = [...helpMsgs, { role: "user", content }];
    setHelpMsgs([...next, { role: "assistant", content: "" }]);
    setHelpText("");
    setHelpLoading(true);
    let acc = "";
    const setLast = (c: string) =>
      setHelpMsgs((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: "assistant", content: c };
        return copy;
      });
    streamAssistant(
      {
        messages: next,
        context: `Người dùng đang xem app "${app.name}" (loại ${app.track}, trạng thái ${app.status}). URL: ${app.currentUrl ?? "chưa deploy"}.`,
      },
      {
        onDelta: (d) => {
          acc += d;
          setLast(acc);
        },
        onDone: (reply) => {
          setLast(reply || acc || t("build.assistantNoReply", "Xin lỗi, mình chưa trả lời được. Bạn thử lại nhé."));
          setHelpLoading(false);
        },
        onError: (e) => {
          message.error(e.message);
          setHelpMsgs((prev) => prev.slice(0, -1));
          setHelpLoading(false);
        },
      },
    );
  };

  // Render the body of a dashboard section. `app` is non-null here (guarded above).
  const renderSection = (k: DashKey): ReactNode => {
    switch (k) {
      case "overview":
        return (
          <OverviewSection
            app={app}
            refreshSignal={refreshSignal}
            downloading={downloading}
            onCopy={copy}
            onDownload={downloadZip}
            onChanged={() => loadApp()}
            onDeleted={() => router.push("/apps")}
            onGoPreview={() => setView("preview")}
            onGoDomains={() => setView("domains")}
          />
        );
      case "code":
        return (
          <CodeSection
            appId={id}
            track={app.track}
            refreshSignal={refreshSignal}
            onRefreshed={() => {
              void loadApp();
              void loadHistory(activeBuildId);
              setRefreshSignal((n) => n + 1);
            }}
          />
        );
      case "console":
        return <RuntimeConsole url={app.currentUrl} />;
      case "api":
        return <ApiBrowser appId={id} appUrl={app.currentUrl} />;
      case "db":
        return <DbBrowser appId={id} />;
      case "analytics":
        return <AnalyticsPanel appId={id} />;
      case "seo":
        return <SeoPanel app={app} onChanged={() => loadApp()} />;
      case "security":
        return <SecurityPanel app={app} onChanged={() => loadApp()} />;
      case "automations":
        return <AutomationsPanel app={app} />;
      case "services":
        return <ServicesTab appId={id} onViewCode={() => setView("code")} />;
      case "suite":
        return <SuiteTab app={app} />;
      case "builds":
        return (
          <BuildsTab
            appId={id}
            refreshSignal={refreshSignal}
            onOpen={(bid) => setDrawerBuildId(bid)}
            onRollback={(bid) => beginIterate(bid, t("build.restoreVersionPrompt", "Khôi phục phiên bản"))}
          />
        );
      case "deployments":
        return <DeploymentsTab appId={id} refreshSignal={refreshSignal} />;
      case "domains":
        return <DomainsSection app={app} onCopy={copy} />;
      case "members":
        return <MembersSection app={app} onChanged={() => void loadApp()} />;
      case "local-guide":
        return <LocalGuideSection app={app} onCopy={copy} />;
      case "logs":
        return <LogsSection appId={id} refreshSignal={refreshSignal} />;
      default:
        return null;
    }
  };

  return (
    <Space direction="vertical" size={14} style={{ width: "100%" }}>
      <Link href="/apps" style={{ color: "#6B7280", fontSize: 13 }}>
        <ArrowLeftOutlined /> {t("build.allApps", "Tất cả apps")}
      </Link>

      {/* App console header — identity + top actions + secondary-sections menu. */}
      <AppHeader
        app={app}
        downloading={downloading}
        onCopy={copy}
        onDownload={downloadZip}
        onReload={() => loadApp()}
        onRenamed={() => loadApp()}
        onResync={(bid) => beginIterate(bid, t("build.resyncPrompt", "Đồng bộ lại code mới nhất từ Git"))}
        onOpenSecondary={(k) => setView(k)}
      />

      {/* Base44/Lovable editor: LEFT conversation + RIGHT canvas. Chat is
          collapsible (toggle in the canvas top bar); on mobile it's an overlay. */}
      <div className="tw-editor-grid" data-chat={chatOpen ? "open" : "closed"}>
        {/* Mobile-only dim backdrop behind the slide-in chat. */}
        <div
          className="tw-chat-backdrop"
          onClick={() => setChatOpen(false)}
          aria-hidden
        />
        {/* ── Floating chat panel: "Sửa app" (iterate) + "Trợ giúp" (AI) ── */}
        <div className="tw-chat-col" data-expanded={chatExpanded ? "true" : "false"}>
          <div className="tw-chat-head">
            <Avatar
              size={26}
              icon={<RobotOutlined />}
              style={{ background: "linear-gradient(135deg,#6c5ce7,#8b7bf0)", flexShrink: 0 }}
            />
            <Segmented<"build" | "help">
              size="small"
              value={chatMode}
              onChange={(v) => setChatMode(v)}
              options={[
                { label: t("build.chatBuild", "Sửa app"), value: "build" },
                { label: t("build.chatHelp", "Trợ giúp"), value: "help" },
              ]}
            />
            <span style={{ flex: 1 }} />
            <Tooltip title={chatExpanded ? t("build.collapse", "Thu nhỏ") : t("build.expand", "Mở rộng")}>
              <Button
                type="text"
                size="small"
                icon={chatExpanded ? <ShrinkOutlined /> : <ExpandAltOutlined />}
                onClick={() => setChatExpanded((v) => !v)}
                aria-label={chatExpanded ? t("build.collapseChat", "Thu nhỏ trò chuyện") : t("build.expandChat", "Mở rộng trò chuyện")}
              />
            </Tooltip>
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined />}
              onClick={() => setChatOpen(false)}
              aria-label={t("build.closeChat", "Đóng trò chuyện")}
            />
          </div>

          {chatMode === "build" ? (
            <>
              <div className="tw-chat-scroll">
                {emptyThread ? (
                  <div style={{ padding: "40px 8px", textAlign: "center" }}>
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description={t("build.noRequestsYet", "Chưa có yêu cầu nào — mô tả thay đổi bên dưới để bắt đầu.")}
                    />
                  </div>
                ) : (
                  <Space direction="vertical" size={18} style={{ width: "100%" }}>
                    {/* Static history of completed builds (oldest → newest). */}
                    {history.map((b) => (
                      <BuildTurn
                        key={b.id}
                        build={b}
                        appTrack={app.track}
                        onOpenUrl={() => setView("preview")}
                        onRebuild={rebuildFrom}
                        onRedeploy={redeployFrom}
                        onServerDeploy={goServerDeploy}
                      />
                    ))}

                    {/* The live / active build as the latest assistant turn. */}
                    {hasActiveTurn && (
                      <BuildConversation
                        prompt={activePrompt}
                        attachments={activeAttachments}
                        state={iterState}
                        track={app.track}
                        appId={id}
                        imported={!!app.gitImported}
                        onServerDeploy={goServerDeploy}
                        onOpenPreview={() => setView("preview")}
                        onNewIteration={() => {
                          /* composer is always visible below */
                        }}
                        onRerun={rerunBuild}
                        onRedeploy={redeployFrom}
                        onDeleted={() => router.push("/apps")}
                      />
                    )}
                  </Space>
                )}
                <div ref={threadEndRef} />
              </div>

              {/* Bottom composer — iterate mode (màu / kiểu / model). */}
              <div className="tw-chat-composer">
                {/* Pinned recovery for a failed imported build — always visible here. */}
                {recovery && (
                  <ImportRecoveryBar
                    ssrFail={recoverySsr}
                    onServerDeploy={goServerDeploy}
                    onRedeploy={() => redeployFrom(recovery.buildId)}
                  />
                )}
                {app.track === "web" && (app.backendKind === "static" || !app.cms) && (
                  <UpgradeBar app={app} onUpgrade={upgradeApp} />
                )}
                <IteratePrompt
                  appId={id}
                  imported={!!app.gitImported}
                  onStarted={beginIterate}
                  prefill={pickPrefill}
                />
              </div>
            </>
          ) : (
            <>
              <div className="tw-chat-scroll" style={{ background: "#F7F8FC" }}>
                {helpMsgs.length === 0 && (
                  <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                    {t(
                      "build.helpGreeting",
                      "Chào bạn 👋 Mình là trợ lý Larkwave. Hỏi mình về cách sửa app, deploy, tên miền, lỗi build…",
                    )}
                  </Typography.Text>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {helpMsgs.map((m, i) => (
                    <div
                      key={i}
                      style={{
                        alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                        maxWidth: "85%",
                        background: m.role === "user" ? "#6C5CE7" : "#fff",
                        color: m.role === "user" ? "#fff" : "#1E2230",
                        padding: "8px 12px",
                        borderRadius: 12,
                        border: m.role === "user" ? "none" : "1px solid #ECEDF3",
                        fontSize: 13.5,
                        lineHeight: 1.5,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {m.role === "assistant" ? (
                        m.content ? (
                          <MarkdownLite text={m.content} />
                        ) : (
                          <Spin size="small" />
                        )
                      ) : (
                        m.content
                      )}
                    </div>
                  ))}
                  <div ref={helpEndRef} />
                </div>
              </div>
              <div className="tw-chat-composer">
                <div style={{ display: "flex", gap: 8 }}>
                  <Input.TextArea
                    value={helpText}
                    onChange={(e) => setHelpText(e.target.value)}
                    autoSize={{ minRows: 1, maxRows: 4 }}
                    placeholder={t("build.askAssistant", "Hỏi trợ lý…")}
                    onPressEnter={(e) => {
                      if (!e.shiftKey) {
                        e.preventDefault();
                        void sendHelp();
                      }
                    }}
                  />
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    loading={helpLoading}
                    onClick={() => void sendHelp()}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── RIGHT: canvas — Preview (live app) / Dashboard (management nav) ── */}
        <div className="tw-canvas-col">
          {/* flexWrap so the "Mở app" button drops to a second line instead of
              being clipped by the canvas overflow:hidden on a narrow phone. */}
          <div className="tw-canvas-topbar" style={{ flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Tooltip title={chatOpen ? t("build.hideChat", "Ẩn trò chuyện") : t("build.showChat", "Hiện trò chuyện")}>
                <Button
                  type="text"
                  size="small"
                  icon={<MessageOutlined />}
                  onClick={() => setChatOpen((v) => !v)}
                  aria-label={t("build.toggleChat", "Bật/tắt trò chuyện")}
                />
              </Tooltip>
              <Segmented<"preview" | "dashboard">
                value={view === "preview" ? "preview" : "dashboard"}
                onChange={(v) =>
                  setView(v === "preview" ? "preview" : view === "preview" ? "overview" : view)
                }
                options={[
                  { label: "Preview", value: "preview", icon: <EyeOutlined /> },
                  { label: "Dashboard", value: "dashboard", icon: <DashboardOutlined /> },
                ]}
              />
            </div>
            {app.currentUrl && (
              <Button
                type="text"
                size="small"
                icon={<LinkOutlined />}
                href={app.currentUrl}
                target="_blank"
                rel="noreferrer"
              >
                {t("build.openApp", "Mở app")}
              </Button>
            )}
          </div>

          <div className="tw-canvas-body">
            {view === "preview" ? (
              <div className="tw-canvas-pad">
                <PreviewPane
                  url={app.currentUrl}
                  reloadSignal={refreshSignal}
                  onPickElement={handlePickElement}
                />
              </div>
            ) : (
              <div
                className="tw-dash"
                style={dashStack ? { flexDirection: "column" } : undefined}
              >
                <nav
                  className="tw-dash-nav"
                  style={
                    dashStack
                      ? {
                          width: "100%",
                          display: "flex",
                          flexDirection: "row",
                          overflowX: "auto",
                          overflowY: "hidden",
                          gap: 6,
                          padding: "8px 10px",
                          borderRight: "none",
                          borderBottom: "1px solid #f1f2f7",
                          WebkitOverflowScrolling: "touch",
                        }
                      : undefined
                  }
                >
                  {DASH_NAV.filter((n) => !n.show || n.show(app)).map((n) => (
                    <button
                      key={n.key}
                      type="button"
                      className="tw-dash-navitem"
                      data-active={view === n.key}
                      onClick={() => setView(n.key)}
                      style={
                        dashStack
                          ? { width: "auto", flexShrink: 0, whiteSpace: "nowrap", marginBottom: 0 }
                          : undefined
                      }
                    >
                      <span className="tw-dash-navicon">{n.icon}</span>
                      <span>{t(DASH_I18N[n.key], n.label)}</span>
                    </button>
                  ))}
                </nav>
                <div className="tw-dash-content">
                  {DASH_FULL_BLEED.has(view as DashKey) ? (
                    <div className="tw-dash-full">{renderSection(view as DashKey)}</div>
                  ) : (
                    <div
                      className="tw-dash-scroll"
                      style={dashStack ? { padding: "14px 14px" } : undefined}
                    >
                      <div className="tw-dash-head">
                        <span className="tw-dash-head-icon">
                          {DASH_META[view as DashKey].icon}
                        </span>
                        <Title level={4} style={{ margin: 0 }}>
                          {t(DASH_I18N[view as DashKey], DASH_META[view as DashKey].label)}
                        </Title>
                      </div>
                      {renderSection(view as DashKey)}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>


      {/* Build detail drawer (from the Builds list). */}
      <Drawer
        title={t("build.buildDetail", "Chi tiết build")}
        width={Math.min(
          720,
          typeof window !== "undefined" ? window.innerWidth - 40 : 720,
        )}
        open={!!drawerBuildId}
        onClose={() => setDrawerBuildId(null)}
        destroyOnClose
      >
        {drawerBuildId && (
          <BuildDetail buildId={drawerBuildId} track={app.track} />
        )}
      </Drawer>

    </Space>
  );
}

/**
 * Slim banner above the iterate composer offering to UPGRADE a frontend-only web
 * app to full-stack (real DB + API) and/or add an admin/CMS area — all within the
 * same app / URL / workspace. Shown only while the app is missing one of those.
 */
/**
 * Pinned recovery bar shown right above the composer when the latest build of an
 * IMPORTED app failed — so the fix is always one click away instead of buried up the
 * thread. SSR/static-export failures lead with "Chạy trên Server"; otherwise the free
 * rebuild (re-run the user's own code via the saved .toolswave config, no AI/credit).
 */
function ImportRecoveryBar({
  ssrFail,
  onServerDeploy,
  onRedeploy,
}: {
  ssrFail: boolean;
  onServerDeploy: () => void;
  onRedeploy: () => void | Promise<void>;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const redeploy = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onRedeploy();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 8,
        padding: "6px 10px",
        borderRadius: 9,
        border: "1px solid rgba(239,68,68,0.25)",
        background: "rgba(239,68,68,0.06)",
      }}
    >
      <Text style={{ fontSize: 12, color: "#9B2C2C", minWidth: 0, flex: 1 }} ellipsis>
        <CloseCircleOutlined style={{ marginRight: 6 }} />
        {ssrFail
          ? t("build.recoverySsr", "App cần SSR/máy chủ — KHÔNG deploy tĩnh được. Hãy dùng Chạy trên Server (Docker).")
          : t("build.recoveryFree", "Build lỗi — chạy lại bằng chính mã nguồn của bạn (miễn phí).")}
      </Text>
      <Space wrap size={6}>
        {ssrFail ? (
          // Static build is futile for an SSR app — only offer the path that works.
          <Button
            size="small"
            type="primary"
            icon={<DeploymentUnitOutlined />}
            onClick={onServerDeploy}
          >
            {t("build.runOnServer", "Chạy trên Server")}
          </Button>
        ) : (
          <Button
            size="small"
            type="primary"
            icon={<CloudUploadOutlined />}
            loading={busy}
            onClick={() => void redeploy()}
          >
            {t("build.rebuildFree", "Build lại (miễn phí)")}
          </Button>
        )}
      </Space>
    </div>
  );
}

function UpgradeBar({
  app,
  onUpgrade,
}: {
  app: AppEntity;
  onUpgrade: (cms: boolean) => void | Promise<void>;
}) {
  const { t } = useI18n();
  const isStatic = app.backendKind === "static";
  const noCms = !app.cms;
  const [busy, setBusy] = useState<null | "db" | "cms">(null);
  const run = async (cms: boolean) => {
    setBusy(cms ? "cms" : "db");
    try {
      await onUpgrade(cms);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 8,
        padding: "5px 10px",
        borderRadius: 9,
        border: "1px solid rgba(108,92,231,0.20)",
        background: "rgba(108,92,231,0.06)",
      }}
    >
      <Text
        style={{ fontSize: 12, color: "#5B4FC2", minWidth: 0 }}
        ellipsis
        title={
          isStatic
            ? t("build.upgradeTipStaticA", "App đang là frontend tĩnh (dữ liệu chỉ lưu trên trình duyệt). Nâng cấp để lưu dữ liệu thật + API") +
              (noCms ? t("build.upgradeTipCmsPart", " và thêm trang quản trị (CMS)") : "") +
              t("build.upgradeTipStaticB", " — vẫn cùng một app & đường dẫn.")
            : t("build.upgradeTipCmsOnly", "Thêm trang quản trị (CMS) để quản lý dữ liệu — vẫn cùng một app & đường dẫn.")
        }
      >
        <DatabaseOutlined /> {isStatic ? t("build.upgradeStaticLabel", "App tĩnh — nâng cấp lưu dữ liệu thật?") : t("build.upgradeCmsLabel", "Thêm CMS quản trị?")}
      </Text>
      <Space wrap size={6}>
        {isStatic && (
          <Button
            size="small"
            icon={<CloudServerOutlined />}
            loading={busy === "db"}
            disabled={busy !== null}
            onClick={() => run(false)}
          >
            {t("build.addData", "+ Dữ liệu")}
          </Button>
        )}
        {noCms && (
          <Button
            size="small"
            type="primary"
            icon={<DatabaseOutlined />}
            loading={busy === "cms"}
            disabled={busy !== null}
            onClick={() => run(true)}
          >
            {isStatic ? t("build.fullstackCms", "Full-stack + CMS") : t("build.addCms", "+ CMS")}
          </Button>
        )}
      </Space>
    </div>
  );
}

/**
 * Iterate prompt: wraps PromptComposer (iterate mode, with màu/kiểu/model) to
 * capture the typed prompt so the caller can show it as the user message bubble.
 */
function IteratePrompt({
  appId,
  imported,
  onStarted,
  prefill,
}: {
  appId: string;
  imported: boolean;
  onStarted: (buildId: string, prompt: string) => void;
  /** Targeted edit text dropped in by the preview element-picker (keyed by nonce). */
  prefill?: { text: string; nonce: number };
}) {
  const { modal } = App.useApp();
  const { t } = useI18n();
  const [lastPrompt, setLastPrompt] = useState("");
  // Imported (mono)repos: warn that a free-form prompt runs the single-web-app
  // pipeline (not a multi-service deploy) before proceeding.
  const confirmBeforeSubmit = () =>
    new Promise<boolean>((resolve) => {
      if (!imported) {
        resolve(true);
        return;
      }
      modal.confirm({
        title: t("build.gitProjectConfirmTitle", "Dự án nhập từ Git — chạy AI sinh/sửa code?"),
        content: t(
          "build.gitProjectConfirmContent",
          "Đây là dự án nhiều phần (monorepo). Gửi mô tả sẽ chạy AI và cố build thành MỘT web app đơn — không phù hợp với hệ thống nhiều service. Để build & deploy đúng từng phần (frontend/backend), hãy dùng “Thêm → Cấu trúc dự án”. Vẫn tiếp tục?",
        ),
        okText: t("build.continueAnyway", "Vẫn tiếp tục"),
        cancelText: t("build.cancel", "Huỷ"),
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  return (
    <div
      onInput={(e) => {
        const t = e.target as HTMLElement;
        if (t instanceof HTMLTextAreaElement) setLastPrompt(t.value);
      }}
    >
      <PromptComposer
        appId={appId}
        showName={false}
        compact
        submitLabel={t("build.sendRequest", "Gửi yêu cầu")}
        placeholder={t("build.iteratePlaceholder", "Mô tả thay đổi / tính năng mới bạn muốn thêm…")}
        onCreated={(bid) => onStarted(bid, lastPrompt.trim())}
        prefill={prefill}
        confirmBeforeSubmit={confirmBeforeSubmit}
      />
    </div>
  );
}

/** Slim card with a light header used to frame the secondary sections. */
function SectionCard({
  title,
  icon,
  extra,
  children,
}: {
  title: string;
  icon?: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card
      styles={{ body: { padding: 18 } }}
      style={{ boxShadow: CARD_SHADOW }}
      title={
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          {icon && <span style={{ color: "#6C5CE7" }}>{icon}</span>}
          {title}
        </span>
      }
      extra={extra}
    >
      {children}
    </Card>
  );
}

function AppHeader({
  app,
  downloading,
  onCopy,
  onDownload,
  onReload,
  onRenamed,
  onResync,
  onOpenSecondary,
}: {
  app: AppEntity;
  downloading: boolean;
  onCopy: (v: string) => void;
  onDownload: () => void;
  onReload: () => void;
  onRenamed: () => void | Promise<void>;
  onResync?: (buildId: string) => void;
  onOpenSecondary: (key: DashKey) => void;
}) {
  const { message } = App.useApp();
  const { t } = useI18n();
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(app.name);
  const [saving, setSaving] = useState(false);
  const [repoUrl, setRepoUrl] = useState<string | null>(null);
  // Collaborators (editor/viewer) can't rename / publish / pin / delete.
  const isOwner = !app.role || app.role === "owner";

  useEffect(() => {
    setName(app.name);
  }, [app.name]);

  // Pull the GitLab repo URL from the latest succeeded build for the header link.
  // Resilient to a transient API outage (the ~30–60s the backend restarts during
  // a deploy): a FAILED fetch keeps the last-known repoUrl on screen and retries
  // with backoff, so the "Mã nguồn GitLab" button never vanishes mid-deploy. We
  // only clear the link when a SUCCESSFUL response confirms there's no repo.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const delays = [1500, 3000, 6000, 10000]; // backoff while the API is down (deploy)
    let attempt = 0;
    // Returns true once the backend answered (so we can stop retrying).
    const run = async (): Promise<boolean> => {
      let res;
      try {
        res = await api.appBuilds(app.id, { page: 1, pageSize: 20 });
      } catch {
        return false; // transient — keep last-known repoUrl, retry below
      }
      const succeeded =
        res.items.find((x) => x.status === "succeeded") ?? res.items[0];
      if (!succeeded) return true; // answered: no builds → nothing to link
      let url = succeeded.result?.repoUrl ?? null;
      if (!url) {
        const detail = await api.getBuild(succeeded.id).catch(() => null);
        url = detail?.result?.repoUrl ?? null;
      }
      if (!cancelled) setRepoUrl(url);
      return true;
    };
    const tick = () => {
      void run().then((answered) => {
        if (cancelled || answered) return;
        if (attempt < delays.length) {
          timer = setTimeout(tick, delays[attempt]);
          attempt += 1;
        }
      });
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [app.id]);

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      message.warning(t("build.nameEmpty", "Tên app không được để trống"));
      return;
    }
    if (trimmed === app.name) {
      setEditingName(false);
      return;
    }
    setSaving(true);
    try {
      await api.updateApp(app.id, { name: trimmed });
      message.success(t("build.nameChanged", "Đã đổi tên app"));
      setEditingName(false);
      await onRenamed();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Header quick-jump → any dashboard section (capability-filtered, same as the nav).
  const secondaryMenu: MenuProps["items"] = DASH_NAV.filter(
    (n) => !n.show || n.show(app),
  ).map((n) => ({ key: n.key, label: t(DASH_I18N[n.key], n.label), icon: n.icon }));

  return (
    <Card styles={{ body: { padding: 16 } }} style={{ boxShadow: CARD_SHADOW }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* Identity */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            minWidth: 0,
            flex: "1 1 320px",
          }}
        >
          <span
            className="tw-logo-mark"
            style={{
              display: "inline-flex",
              width: 48,
              height: 48,
              minWidth: 48,
              borderRadius: 14,
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
            }}
          >
            <AppstoreLetter name={app.name} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              {editingName ? (
                <Space.Compact>
                  <Input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={60}
                    onPressEnter={() => void saveName()}
                    name="tw-app-name"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    data-1p-ignore=""
                    data-lpignore="true"
                    data-form-type="other"
                    style={{ width: 240 }}
                  />
                  <Button
                    type="primary"
                    icon={<CheckOutlined />}
                    loading={saving}
                    onClick={() => void saveName()}
                  />
                </Space.Compact>
              ) : (
                <>
                  <Title
                    level={4}
                    style={{ margin: 0, maxWidth: 420 }}
                    ellipsis={{ rows: 1 }}
                  >
                    {app.name}
                  </Title>
                  {isOwner && (
                    <Tooltip title={t("build.rename", "Đổi tên")}>
                      <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => setEditingName(true)}
                        style={{ color: "#9AA3B5" }}
                      />
                    </Tooltip>
                  )}
                </>
              )}
              <AppStatusTag status={app.status} />
              <TrackTag track={app.track} />
              {app.shared && (
                <Tag color="cyan" bordered={false}>
                  {t("build.shared", "Được chia sẻ")}
                </Tag>
              )}
            </div>
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              {t("build.updated", "Cập nhật")} {formatDate(app.updatedAt)}
            </Text>
          </div>
        </div>

        {/* Actions */}
        <Space wrap size={8}>
          {app.currentUrl ? (
            <>
              <Button
                type="primary"
                icon={<LinkOutlined />}
                href={app.currentUrl}
                target="_blank"
                rel="noreferrer"
              >
                {t("build.openApp", "Mở app")}
              </Button>
              <Tooltip title={t("build.copyShareLink", "Sao chép liên kết chia sẻ")}>
                <Button
                  icon={<ShareAltOutlined />}
                  onClick={() => onCopy(app.currentUrl!)}
                >
                  {t("build.share", "Chia sẻ")}
                </Button>
              </Tooltip>
            </>
          ) : (
            <Tag>{t("build.noDeploy", "Chưa có bản deploy")}</Tag>
          )}
          <Tooltip title={t("build.downloadZipTip", "Tải mã nguồn (ZIP)")}>
            <Button
              icon={<DownloadOutlined />}
              loading={downloading}
              onClick={onDownload}
            />
          </Tooltip>
          {repoUrl && (
            <Tooltip title={t("build.gitlabSource", "Mã nguồn GitLab")}>
              <Button
                icon={<GitlabOutlined />}
                href={repoUrl}
                target="_blank"
                rel="noreferrer"
              />
            </Tooltip>
          )}
          {isOwner && app.currentUrl && (
            <Tooltip
              title={
                app.published
                  ? t("build.showcaseOnTip", "Đang công khai trên showcase — bấm để gỡ")
                  : t("build.showcaseOffTip", "Đăng app lên showcase công khai (chia sẻ cho mọi người)")
              }
            >
              <Button
                icon={
                  <GlobalOutlined style={app.published ? { color: "#16B98D" } : undefined} />
                }
                onClick={async () => {
                  try {
                    const next = !app.published;
                    await api.setAppPublished(app.id, next);
                    if (next) {
                      const link = `${window.location.origin}/app/${app.slug}`;
                      await navigator.clipboard.writeText(link).catch(() => {});
                      message.success(t("build.publishedShowcase", "Đã đăng công khai — đã sao chép link showcase"));
                    } else {
                      message.success(t("build.unpublishedShowcase", "Đã gỡ khỏi showcase công khai"));
                    }
                    onReload();
                  } catch (e) {
                    message.error((e as Error).message);
                  }
                }}
              >
                {app.published ? t("build.publicLabel", "Công khai") : t("build.publishLabel", "Đăng")}
              </Button>
            </Tooltip>
          )}
          {isOwner && (
            <Tooltip title={app.pinned ? t("build.unpin", "Bỏ ghim khỏi sidebar") : t("build.pin", "Ghim vào sidebar")}>
              <Button
                icon={
                  app.pinned ? (
                    <PushpinFilled style={{ color: "#6C5CE7" }} />
                  ) : (
                    <PushpinOutlined />
                  )
                }
                onClick={async () => {
                  try {
                    await api.setAppPinned(app.id, !app.pinned);
                    onReload();
                    emitAppsChanged(); // refresh the sidebar pinned strip immediately
                  } catch (e) {
                    message.error((e as Error).message);
                  }
                }}
              />
            </Tooltip>
          )}
          <Tooltip title={t("build.refresh", "Làm mới")}>
            <Button icon={<ReloadOutlined />} onClick={onReload} />
          </Tooltip>
          {/* Git-imported apps: pull latest repo code in, and push local changes out. */}
          <GitResyncButton app={app} onStarted={onResync} />
          <GitPushButton app={app} />
          {/* Secondary sections live behind this "..." menu. */}
          <Dropdown
            menu={{
              items: secondaryMenu,
              onClick: ({ key }) => onOpenSecondary(key as DashKey),
            }}
            trigger={["click"]}
          >
            <Button icon={<MoreOutlined />}>{t("build.more", "Thêm")}</Button>
          </Dropdown>
        </Space>
      </div>
    </Card>
  );
}

/**
 * "Đẩy lên {GitLab|GitHub}" — for git-imported apps only. Opens a small modal
 * for an optional commit message, then commits the app's latest build files back
 * to the linked repo@branch and toasts the commit link on success.
 */
/**
 * "Cập nhật từ Git" — re-pull the latest repo code INTO this same app (keeps id/URL).
 * Streams the refresh as a build turn via onStarted. For picking up repo fixes without
 * re-importing (which would create a new app).
 */
function GitResyncButton({
  app,
  onStarted,
}: {
  app: AppEntity;
  onStarted?: (buildId: string) => void;
}) {
  const { message } = App.useApp();
  const { t } = useI18n();
  const provider = app.gitProvider ?? null;
  const isGit = !!app.gitImported && !!provider && !!app.gitRepo;
  const [busy, setBusy] = useState(false);
  if (!isGit) return null;
  const providerLabel = provider === "github" ? "GitHub" : "GitLab";
  const icon =
    provider === "github" ? (
      <GithubFilled style={{ color: "#1E2230" }} />
    ) : (
      <GitlabFilled style={{ color: "#FC6D26" }} />
    );
  const resync = async () => {
    setBusy(true);
    try {
      const res = await api.gitResync(app.id);
      message.success(`${t("build.resyncPullingA", "Đang kéo code mới nhất từ")} ${providerLabel} ${t("build.resyncPullingB", "vào app này…")}`);
      onStarted?.(res.buildId);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Tooltip title={`${t("build.resyncTipA", "Kéo lại code mới nhất từ")} ${app.gitRepo} ${t("build.resyncTipB", "vào app này (giữ nguyên URL/app)")}`}>
      <Button icon={icon} loading={busy} onClick={() => void resync()}>
        {t("build.updateFrom", "Cập nhật từ")} {providerLabel}
      </Button>
    </Tooltip>
  );
}

function GitPushButton({ app }: { app: AppEntity }) {
  const { message } = App.useApp();
  const { t } = useI18n();
  const provider = app.gitProvider ?? null;
  // Surface the button only when the app actually originated from a Git import.
  const isGit = !!app.gitImported && !!provider && !!app.gitRepo;

  const [open, setOpen] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [pushing, setPushing] = useState(false);

  if (!isGit) return null;

  const providerLabel = provider === "github" ? "GitHub" : "GitLab";
  const icon =
    provider === "github" ? (
      <GithubFilled style={{ color: "#1E2230" }} />
    ) : (
      <GitlabFilled style={{ color: "#FC6D26" }} />
    );

  const push = async () => {
    setPushing(true);
    try {
      const res = await api.gitPush(app.id, commitMsg.trim() || undefined);
      setOpen(false);
      setCommitMsg("");
      if (res.commitUrl) {
        message.success({
          content: (
            <span>
              {t("build.pushedTo", "Đã đẩy lên")} {providerLabel} ·{" "}
              <a href={res.commitUrl} target="_blank" rel="noreferrer">
                {t("build.viewCommit", "Xem commit")}
              </a>
            </span>
          ),
          duration: 6,
        });
      } else {
        message.success(`${t("build.pushedChanges", "Đã đẩy thay đổi lên")} ${providerLabel}`);
      }
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setPushing(false);
    }
  };

  return (
    <>
      <Tooltip title={`${t("build.pushCodeTo", "Đẩy code lên")} ${app.gitRepo}`}>
        <Button icon={icon} onClick={() => setOpen(true)}>
          {t("build.push", "Đẩy lên")} {providerLabel}
        </Button>
      </Tooltip>
      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        title={
          <Space>
            {icon}
            <span>{t("build.push", "Đẩy lên")} {providerLabel}</span>
          </Space>
        }
        okText={t("build.push", "Đẩy lên")}
        okButtonProps={{ icon, loading: pushing }}
        cancelText={t("build.cancel", "Huỷ")}
        onOk={() => void push()}
        confirmLoading={pushing}
      >
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {t("build.commitLatestInto", "Commit mã nguồn bản build mới nhất vào")}{" "}
            <Text code>{app.gitRepo}</Text>
            {app.gitBranch ? (
              <>
                {" "}
                @ <Text code>{app.gitBranch}</Text>
              </>
            ) : null}
            .
          </Text>
          <div>
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              {t("build.commitMsgLabel", "Thông điệp commit (tuỳ chọn)")}
            </Text>
            <Input.TextArea
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              placeholder={t("build.commitMsgPlaceholder", "Cập nhật từ Larkwave")}
              autoSize={{ minRows: 2, maxRows: 4 }}
              maxLength={500}
              style={{ marginTop: 6 }}
            />
          </div>
        </Space>
      </Modal>
    </>
  );
}

/** First letter avatar fallback used inside the gradient app mark. */
function AppstoreLetter({ name }: { name: string }) {
  const letter = (name.trim()[0] ?? "A").toUpperCase();
  return <span style={{ fontWeight: 800 }}>{letter}</span>;
}

function StatTile({
  label,
  value,
  icon,
  color,
  bg,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  color: string;
  bg: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: 16,
        borderRadius: 14,
        border: "1px solid #F1F2F7",
        background: "#FBFBFE",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          width: 44,
          height: 44,
          minWidth: 44,
          borderRadius: 12,
          alignItems: "center",
          justifyContent: "center",
          fontSize: 19,
          background: bg,
          color,
        }}
      >
        {icon}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: "#6B7280" }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#1E2230" }}>
          {value}
        </div>
      </div>
    </div>
  );
}

function OverviewSection({
  app,
  refreshSignal,
  downloading,
  onCopy,
  onDownload,
  onChanged,
  onDeleted,
  onGoPreview,
  onGoDomains,
}: {
  app: AppEntity;
  refreshSignal: number;
  downloading: boolean;
  onCopy: (v: string) => void;
  onDownload: () => void;
  onChanged: () => void | Promise<void>;
  onDeleted: () => void;
  onGoPreview: () => void;
  onGoDomains: () => void;
}) {
  const { message } = App.useApp();
  const { t } = useI18n();
  const [buildsCount, setBuildsCount] = useState<number | null>(null);
  const [deploymentsCount, setDeploymentsCount] = useState<number | null>(null);
  const [repoUrl, setRepoUrl] = useState<string | null>(null);
  const [togglingArchive, setTogglingArchive] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [b, d] = await Promise.all([
          api.appBuilds(app.id, { page: 1, pageSize: 50 }),
          api.appDeployments(app.id, { page: 1, pageSize: 1 }),
        ]);
        if (cancelled) return;
        setBuildsCount(b.total);
        setDeploymentsCount(d.total);

        const succeeded =
          b.items.find((x) => x.status === "succeeded") ?? b.items[0];
        if (succeeded) {
          let url = succeeded.result?.repoUrl ?? null;
          if (!url) {
            try {
              const detail = await api.getBuild(succeeded.id);
              if (cancelled) return;
              url = detail.result?.repoUrl ?? null;
            } catch {
              /* non-fatal */
            }
          }
          if (!cancelled) setRepoUrl(url);
        }
      } catch {
        // Non-fatal — counts simply stay unknown.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [app.id, refreshSignal]);

  const toggleArchive = async (archive: boolean) => {
    setTogglingArchive(true);
    try {
      await api.updateApp(app.id, { status: archive ? "archived" : "live" });
      message.success(archive ? t("build.archived", "Đã lưu trữ app") : t("build.unarchived", "Đã khôi phục app"));
      await onChanged();
      emitAppsChanged();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setTogglingArchive(false);
    }
  };


  const remove = async () => {
    setDeleting(true);
    try {
      await api.deleteApp(app.id);
      message.success(t("build.appDeleted", "Đã xoá app"));
      emitAppsChanged();
      onDeleted();
    } catch (e) {
      message.error((e as Error).message);
      setDeleting(false);
    }
  };

  const pagesUrl = app.currentUrl;
  const fmt = (n: number | null) => (n === null ? "—" : n);

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      {/* Meta + action row */}
      <SectionCard title={t("build.navOverview", "Tổng quan")} icon={<DashboardOutlined />}>
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          {/* Quick actions row */}
          <Space wrap size={8}>
            <Button
              type="primary"
              icon={<LinkOutlined />}
              href={pagesUrl ?? undefined}
              target="_blank"
              rel="noreferrer"
              disabled={!pagesUrl}
            >
              {t("build.openApp", "Mở app")}
            </Button>
            <Button
              icon={<ShareAltOutlined />}
              onClick={() => pagesUrl && onCopy(pagesUrl)}
              disabled={!pagesUrl}
            >
              {t("build.share", "Chia sẻ")}
            </Button>
            <Button
              icon={<DownloadOutlined />}
              loading={downloading}
              onClick={onDownload}
            >
              {t("build.downloadZip", "Tải ZIP")}
            </Button>
            <Button
              icon={<GitlabOutlined />}
              href={repoUrl ?? undefined}
              target="_blank"
              rel="noreferrer"
              disabled={!repoUrl}
            >
              {t("build.gitlabSource", "Mã nguồn GitLab")}
            </Button>
          </Space>

          {/* Stat tiles */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: 12,
            }}
          >
            <StatTile
              label={t("build.numBuilds", "Số builds")}
              value={fmt(buildsCount)}
              icon={<HistoryOutlined />}
              color="#F59E0B"
              bg="rgba(245,158,11,0.14)"
            />
            <StatTile
              label={t("build.numDeployments", "Số deployments")}
              value={fmt(deploymentsCount)}
              icon={<DeploymentUnitOutlined />}
              color="#6C5CE7"
              bg="rgba(108,92,231,0.12)"
            />
            <StatTile
              label={t("build.status", "Trạng thái")}
              value={<AppStatusTag status={app.status} />}
              icon={<DashboardOutlined />}
              color="#16B98D"
              bg="rgba(22,185,141,0.14)"
            />
            <StatTile
              label={t("build.appType", "Loại app")}
              value={<TrackTag track={app.track} />}
              icon={<GlobalOutlined />}
              color="#4FB6FF"
              bg="rgba(79,182,255,0.14)"
            />
          </div>

          <div>
            <Paragraph
              type="secondary"
              style={{ margin: "0 0 4px", fontSize: 13.5 }}
            >
              {app.description || t("build.noDescription", "Không có mô tả.")}
            </Paragraph>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {t("build.createdAt", "Tạo lúc")} {formatDate(app.createdAt)} · {t("build.updated", "Cập nhật")}{" "}
              {formatDate(app.updatedAt)}
            </Text>
          </div>
        </Space>
      </SectionCard>

      {/* Deploy lên Server (Docker) — auto-hides unless configured + full-stack */}
      <ServerDeployCard appId={app.id} />

      {/* Share */}
      <SectionCard
        title={t("build.shareAndLinks", "Chia sẻ & liên kết")}
        icon={<LinkOutlined />}
        extra={
          pagesUrl ? (
            <Button size="small" type="link" onClick={onGoPreview}>
              {t("build.viewPreview", "Xem preview")}
            </Button>
          ) : undefined
        }
      >
        {pagesUrl ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 24,
              alignItems: "center",
            }}
          >
            <Space
              direction="vertical"
              size="middle"
              style={{ flex: "1 1 280px", minWidth: 240 }}
            >
              <div>
                <Text type="secondary" style={{ fontSize: 12.5 }}>
                  Live URL
                </Text>
                <Input
                  readOnly
                  value={pagesUrl}
                  style={{ marginTop: 6 }}
                  addonAfter={
                    <CopyOutlined
                      onClick={() => onCopy(pagesUrl)}
                      style={{ cursor: "pointer" }}
                    />
                  }
                />
              </div>
              <Space wrap>
                <Button
                  type="primary"
                  icon={<LinkOutlined />}
                  href={pagesUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("build.openApp", "Mở app")}
                </Button>
                <Button icon={<CopyOutlined />} onClick={() => onCopy(pagesUrl)}>
                  {t("build.copyLink", "Sao chép liên kết")}
                </Button>
                {repoUrl && (
                  <Button
                    icon={<GitlabOutlined />}
                    href={repoUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("build.gitlabSource", "Mã nguồn GitLab")}
                  </Button>
                )}
              </Space>
            </Space>
            <QrPreview url={pagesUrl} />
          </div>
        ) : (
          <Empty description={t("build.noPublicDeploy", "App chưa có bản deploy công khai để chia sẻ")} />
        )}
      </SectionCard>

      {/* Domains note */}
      <SectionCard
        title={t("build.navDomains", "Tên miền")}
        icon={<DomainOutlined />}
        extra={
          <Button size="small" type="link" onClick={onGoDomains}>
            {t("build.manage", "Quản lý")}
          </Button>
        }
      >
        <Text type="secondary" style={{ fontSize: 13 }}>
          {t("build.currentDomainLabel", "Tên miền hiện tại")}:{" "}
          <Text code>{pagesUrl ?? t("build.none", "Chưa có")}</Text>.{" "}
          {t("build.customDomainSoon", "Tên miền tuỳ chỉnh *.toolswave.net sắp ra mắt — xem mục “Tên miền”.")}
        </Text>
      </SectionCard>

      {/* Settings */}
      <SectionCard title={t("build.settings", "Cài đặt")} icon={<SaveOutlined />}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <Text>{t("build.archiveApp", "Lưu trữ app")}</Text>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t("build.archiveDesc", "App đã lưu trữ sẽ ẩn khỏi danh sách hoạt động.")}
              </Text>
            </div>
          </div>
          <Switch
            checked={app.status === "archived"}
            loading={togglingArchive}
            onChange={(checked) => void toggleArchive(checked)}
          />
        </div>
      </SectionCard>

      {/* Danger zone */}
      <Card
        title={<span style={{ color: "#EF4444" }}>{t("build.dangerZone", "Vùng nguy hiểm")}</span>}
        styles={{
          header: { borderBottom: "1px solid rgba(239,68,68,0.20)" },
          body: { padding: 18 },
        }}
        style={{ border: "1px solid rgba(239,68,68,0.30)" }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <Text>{t("build.deleteApp", "Xoá app")}</Text>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t("build.deleteAppDesc", "Hành động này không thể hoàn tác. Toàn bộ builds và deployments sẽ bị xoá.")}
              </Text>
            </div>
          </div>
          <Popconfirm
            title={t("build.deleteAppConfirm", "Xoá app này?")}
            description={t("build.deleteAppConfirmDesc", "Bạn có chắc chắn? Không thể hoàn tác.")}
            okText={t("build.delete", "Xoá")}
            okButtonProps={{ danger: true }}
            cancelText={t("build.cancel", "Huỷ")}
            onConfirm={() => remove()}
          >
            <Button danger icon={<DeleteOutlined />} loading={deleting}>
              {t("build.deleteApp", "Xoá app")}
            </Button>
          </Popconfirm>
        </div>
      </Card>
    </Space>
  );
}

function QrPreview({ url }: { url: string }) {
  const { t } = useI18n();
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
    url,
  )}`;
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          padding: 10,
          background: "#fff",
          border: "1px solid #ECEDF3",
          borderRadius: 12,
          display: "inline-block",
        }}
      >
        <AntImage
          src={qrSrc}
          alt="QR"
          width={140}
          height={140}
          preview={false}
          fallback="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4="
        />
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: "#6B7280" }}>
        {t("build.scanToOpen", "Quét để mở")}
      </div>
    </div>
  );
}

function DomainsSection({
  app,
  onCopy,
}: {
  app: AppEntity;
  onCopy: (v: string) => void;
}) {
  const { t } = useI18n();
  const pagesUrl = app.currentUrl;
  return (
    <SectionCard title={t("build.navDomains", "Tên miền")} icon={<DomainOutlined />}>
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <div>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {t("build.currentDomainCf", "Tên miền hiện tại (Cloudflare Pages)")}
          </Text>
          <Input
            readOnly
            value={pagesUrl ?? t("build.none", "Chưa có")}
            style={{ marginTop: 6 }}
            addonAfter={
              pagesUrl ? (
                <CopyOutlined
                  onClick={() => onCopy(pagesUrl)}
                  style={{ cursor: "pointer" }}
                />
              ) : undefined
            }
          />
        </div>
        <div>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {t("build.customDomain", "Tên miền tuỳ chỉnh")}
          </Text>
          <Input
            disabled
            addonAfter=".toolswave.net"
            placeholder={t("build.customDomainPlaceholder", "ten-app-cua-ban")}
            style={{ marginTop: 6 }}
          />
          <Text
            type="secondary"
            style={{ fontSize: 12, marginTop: 6, display: "block" }}
          >
            {t("build.customDomainNote", "Custom domain *.toolswave.net cần token Cloudflare có quyền DNS-write — sắp có.")}
          </Text>
        </div>
      </Space>
    </SectionCard>
  );
}

function LogsSection({
  appId,
  refreshSignal,
}: {
  appId: string;
  refreshSignal: number;
}) {
  const { message } = App.useApp();
  const { t } = useI18n();
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [buildLabel, setBuildLabel] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.appBuilds(appId, { page: 1, pageSize: 10 });
      const target =
        res.items.find((b) => b.status === "succeeded") ?? res.items[0];
      if (!target) {
        setLogs([]);
        setBuildLabel(null);
        return;
      }
      const detail = await api.getBuild(target.id);
      setLogs(detail.logs ?? []);
      setBuildLabel(detail.prompt);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [appId, message]);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  return (
    <SectionCard
      title={t("build.latestBuildLogs", "Logs build gần nhất")}
      icon={<FileTextOutlined />}
      extra={
        <Button size="small" icon={<ReloadOutlined />} onClick={() => void load()}>
          {t("build.refresh", "Làm mới")}
        </Button>
      }
    >
      {loading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : logs.length === 0 ? (
        <Empty description={t("build.noLogs", "Chưa có log nào — app chưa có build")} />
      ) : (
        <Space direction="vertical" size={10} style={{ width: "100%" }}>
          {buildLabel && (
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              Build: {buildLabel}
            </Text>
          )}
          <LogConsole logs={logs} />
        </Space>
      )}
    </SectionCard>
  );
}

function CodeSection({
  appId,
  track,
  refreshSignal,
  onRefreshed,
}: {
  appId: string;
  track: AppEntity["track"];
  refreshSignal: number;
  onRefreshed: () => void;
}) {
  const { message } = App.useApp();
  const { t } = useI18n();
  const [files, setFiles] = useState<GeneratedFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);

  // Local stream for the manual "Lưu & Deploy lại" build.
  const { state: editState, start: startEdit, reset: resetEdit } =
    useBuildStream();

  // When the edit build succeeds, refresh files locally and bubble up so the
  // Preview iframe + app header reload.
  useEffect(() => {
    if (editState.status === "succeeded") {
      onRefreshed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editState.status]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setEmpty(false);
      try {
        const res = await api.appBuilds(appId, { page: 1, pageSize: 50 });
        const succeeded = res.items.find((b) => b.status === "succeeded");
        const target = succeeded ?? res.items[0];
        if (!target) {
          if (!cancelled) setEmpty(true);
          return;
        }
        const detail = await api.getBuild(target.id);
        if (cancelled) return;
        const list = detail.files ?? [];
        if (list.length === 0) {
          for (const b of res.items) {
            if (b.id === target.id) continue;
            const d = await api.getBuild(b.id);
            if (cancelled) return;
            if (d.files && d.files.length) {
              setFiles(d.files);
              return;
            }
          }
          setEmpty(true);
          return;
        }
        setFiles(list);
      } catch (e) {
        if (!cancelled) message.error((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appId, refreshSignal, message]);

  if (loading) {
    return (
      <div
        style={{
          minHeight: "50vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Spin tip={t("build.loadingCode", "Đang tải mã nguồn...")} />
      </div>
    );
  }
  if (empty || files.length === 0) {
    return (
      <div style={{ padding: "64px 24px", textAlign: "center" }}>
        <div
          style={{
            width: 72,
            height: 72,
            margin: "0 auto 18px",
            borderRadius: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 30,
            color: "#6C5CE7",
            background: "rgba(108,92,231,0.10)",
          }}
        >
          <ThunderboltOutlined />
        </div>
        <Title level={5} style={{ margin: "0 0 6px" }}>
          {t("build.noCode", "Chưa có mã nguồn")}
        </Title>
        <Text type="secondary" style={{ display: "block", maxWidth: 360, margin: "0 auto" }}>
          {t(
            "build.noCodeDesc",
            "App chưa có bản build thành công nào. Mô tả ý tưởng ở khung chat bên trái để Larkwave dựng app — mã nguồn sẽ hiện ở đây.",
          )}
        </Text>
      </div>
    );
  }

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <CodeEditor
        appId={appId}
        files={files}
        onBuildStarted={(bid) => startEdit(bid)}
      />
      {editState.buildId && (
        <BuildProgress
          state={editState}
          track={track}
          onReset={() => {
            resetEdit();
            onRefreshed();
          }}
        />
      )}
    </Space>
  );
}

/**
 * "Deploy lên Server (Docker)" — auto-hides unless the platform has the server
 * target configured AND the app carries a docker-compose.yml (full-stack). Runs
 * the app's compose on a real host and exposes each service at a subdomain.
 */
function ServerDeployCard({ appId }: { appId: string }) {
  const { message } = App.useApp();
  const { t } = useI18n();
  const [st, setSt] = useState<ServerDeployStatusResponse | null>(null);
  // True once a SUCCESSFUL status response has arrived — lets us tell "not
  // answered yet / API restarting mid-deploy" apart from "server said this app
  // is ineligible". We only hide the card in the latter case.
  const [loaded, setLoaded] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [preparing, setPreparing] = useState(false);

  // Returns true when the backend answered. On a transient failure (the API
  // restarting during a deploy) we KEEP the last-known `st` — never null it —
  // so the "Chạy trên Server (Docker)" section + Deploy CTA stay on screen.
  const load = useCallback(async (): Promise<boolean> => {
    try {
      const res = await api.serverDeployStatus(appId);
      setSt(res);
      setLoaded(true);
      return true;
    } catch {
      return false;
    }
  }, [appId]);

  // First load: retry with bounded backoff so a first-visit-DURING-a-deploy
  // self-heals the moment the API comes back, instead of staying hidden for
  // the whole restart window.
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const delays = [1500, 3000, 6000, 10000]; // backoff while the API is down (deploy)
    let attempt = 0;
    const tick = () => {
      void load().then((ok) => {
        if (!active || ok) return;
        if (attempt < delays.length) {
          timer = setTimeout(tick, delays[attempt]);
          attempt += 1;
        }
      });
    };
    tick();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [load]);

  // While a deploy runs in the background, poll so the UI shows live progress + log.
  useEffect(() => {
    if (st?.deploy?.status !== "deploying") return;
    const t = setInterval(() => void load(), 2500);
    return () => clearInterval(t);
  }, [st?.deploy?.status, load]);

  // Announce the OUTCOME (live URL / failure) when a background deploy finishes — so
  // the user gets a clear result even if they aren't watching the log.
  const prevStatus = useRef<string | null>(null);
  useEffect(() => {
    const cur = st?.deploy?.status ?? null;
    if (prevStatus.current === "deploying" && cur === "live") {
      const url = st?.deploy?.services?.find((s) => s.url)?.url;
      message.success(url ? `${t("build.serverLiveUrl", "Website đã chạy trên server")}: ${url}` : t("build.serverLive", "Đã chạy trên server thành công."), 8);
    } else if (prevStatus.current === "deploying" && cur === "failed") {
      message.error(t("build.serverDeployFailed", "Deploy lên server thất bại — xem nhật ký trong thẻ bên dưới."), 8);
    }
    prevStatus.current = cur;
  }, [st?.deploy?.status, st?.deploy?.services, message, t]);

  const deploy = async () => {
    setDeploying(true);
    try {
      // Returns immediately with status 'deploying'; the polling effect streams
      // progress + log, and the effect above announces the final URL / failure.
      const info = await api.deployServer(appId);
      setSt((s) => (s ? { ...s, deploy: info } : s));
      message.loading(t("build.serverDeploying", "Đang triển khai lên server — theo dõi nhật ký bên dưới (vài phút)…"), 3);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setDeploying(false);
    }
  };

  const prepare = async () => {
    setPreparing(true);
    try {
      const res = await api.prepareServer(appId);
      await load();
      message.success(
        res.created > 0
          ? `${t("build.dockerBuiltA", "Đã dựng")} ${res.created} ${t("build.dockerBuiltB", "file hạ tầng Docker — đang khởi chạy trên server…")}`
          : t("build.dockerExists", "Đã có docker-compose — đang khởi chạy trên server…"),
      );
      // ONE action: prepare THEN deploy. The old two-step flow stopped after prepare
      // with a success toast that read as "done" — but nothing was running yet.
      await deploy();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setPreparing(false);
    }
  };

  // Show for any app that's server-deployable OR a multi-service import we can
  // synthesize Docker infra for. The deploy button itself stays gated on the
  // platform having the server target configured (st.enabled).
  //
  // Only hide once a SUCCESSFUL response CONFIRMS this app is ineligible — never
  // collapse "not answered yet / API restarting mid-deploy" into hidden, or the
  // whole section would vanish for ~30–60s during every deploy.
  if (loaded && st && !st.canDeploy && !st.multiService) return null;
  if (!st) return null;
  const d = st.deploy;
  const needsPrepare = !st.canDeploy && st.multiService;

  return (
    <SectionCard title={t("build.runOnServerDocker", "Chạy trên Server (Docker)")} icon={<DeploymentUnitOutlined />}>
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Text type="secondary" style={{ fontSize: 13 }}>
          {needsPrepare ? (
            <>
              {t("build.multiServiceA", "Workspace nhiều service (API / CMS / landing / Python AI…). Bấm")}{" "}
              <Text strong>{t("build.prepare", "Chuẩn bị")}</Text> {t("build.multiServiceB", "để AI dựng")} <Text code>docker-compose.yml</Text> {t("build.multiServiceC", "+ Dockerfile cho từng phần — chạy được cả Python, mỗi service ra một subdomain.")}
            </>
          ) : (
            <>
              {t("build.dockerHasA", "App có")} <Text code>docker-compose.yml</Text> {t("build.dockerHasB", "→ chạy full-stack (backend + DB, kể cả Python) trên server thật, mỗi service ra một subdomain.")}
            </>
          )}
        </Text>
        {!st.enabled && (
          <Text type="warning" style={{ fontSize: 12.5 }}>
            {t("build.serverNotEnabled", "Deploy lên server chưa được bật trên nền tảng — bạn vẫn có thể tạo & tải hạ tầng Docker (xem tab Code / “Tải ZIP”) để tự chạy hoặc đẩy về repo.")}
          </Text>
        )}
        {d && (
          <div>
            <div style={{ marginBottom: 6 }}>
              {d.status === "deploying" ? (
                <Tag icon={<Spin size="small" style={{ marginRight: 6 }} />} color="processing">
                  {t("build.deployingTag", "Đang triển khai… (theo dõi nhật ký bên dưới)")}
                </Tag>
              ) : d.status === "live" ? (
                <Tag color="success">✓ {t("build.running", "Đang chạy")} ({d.services.length} service)</Tag>
              ) : (
                <Tag color="error">{t("build.deployError", "Lỗi triển khai — xem nhật ký bên dưới")}</Tag>
              )}
            </div>
            {/* Live → a prominent "open website" CTA so the user immediately knows the URL. */}
            {d.status === "live" && d.services.find((s) => s.url) && (
              <Button
                type="primary"
                icon={<LinkOutlined />}
                href={d.services.find((s) => s.url)!.url}
                target="_blank"
                style={{ marginBottom: 8 }}
              >
                {t("build.openWebsite", "Mở website")}
              </Button>
            )}
            {d.services.map((s) => (
              <div key={s.subdomain} style={{ fontSize: 13 }}>
                <Text strong>{s.name}</Text>{" "}
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.url}
                </a>
              </div>
            ))}
            {/* Deploy log — live progress while deploying + full history (incl. the
                real docker-compose output) afterwards. */}
            {d.log && (
              <div
                className="tw-log-console"
                style={{ maxHeight: "34vh", marginTop: 8, fontSize: 12 }}
              >
                {d.log}
              </div>
            )}
          </div>
        )}
        {!st.planAllowed ? (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(108,92,231,0.25)",
              background: "rgba(108,92,231,0.06)",
            }}
          >
            <Text style={{ fontSize: 12.5, color: "#5B4FC2" }}>
              ★ <Text strong>{t("build.runOnServerDocker", "Chạy trên Server (Docker)")}</Text> {t("build.planGateA", "— backend/DB/Python thật, mỗi service một subdomain — thuộc gói")} <Text strong>{t("build.planPro", "Chuyên nghiệp")}</Text> {t("build.planGateB", "trở lên.")}
            </Text>
            <Button type="primary" href="/pricing">
              {t("build.upgradePlanServer", "Nâng gói để chạy trên Server")}
            </Button>
          </div>
        ) : (
          <Space wrap>
            {needsPrepare && (
              <Tooltip
                title={st.enabled ? "" : t("build.serverFeatureOff", "Tính năng deploy server chưa được bật trên nền tảng")}
              >
                <Button
                  type="primary"
                  icon={<ThunderboltOutlined />}
                  loading={preparing || deploying || d?.status === "deploying"}
                  disabled={!st.enabled}
                  onClick={() => void prepare()}
                >
                  {t("build.runOnServerPrepare", "Chạy trên Server (dựng Docker + deploy)")}
                </Button>
              </Tooltip>
            )}
            {st.canDeploy && (
              <Tooltip
                title={st.enabled ? "" : t("build.serverFeatureOff", "Tính năng deploy server chưa được bật trên nền tảng")}
              >
                <Button
                  type="primary"
                  icon={<DeploymentUnitOutlined />}
                  loading={deploying || d?.status === "deploying"}
                  disabled={!st.enabled}
                  onClick={() => void deploy()}
                >
                  {d ? t("build.redeployServer", "Deploy lại lên server") : t("build.deployServer", "Deploy lên server")}
                </Button>
              </Tooltip>
            )}
          </Space>
        )}
      </Space>
    </SectionCard>
  );
}

/**
 * "Các site trong bộ" — màn quản lý một hệ thống được tách thành nhiều site độc lập.
 *
 * Khác "Cấu trúc dự án" ở một điểm quyết định cách trình bày: ở đó các phần là THƯ MỤC trong
 * cùng một app, còn ở đây mỗi phần là một APP RIÊNG có địa chỉ riêng, deploy riêng, sửa riêng.
 * Nên mỗi hàng phải mở được sang chính app đó, chứ không phải chỉ xem cho biết.
 *
 * Site API tách riêng lên đầu và nói rõ vai trò: nó là nơi DUY NHẤT giữ dữ liệu, nên khi có gì
 * sai về dữ liệu thì đó là chỗ phải mở ra sửa — nếu không, người dùng sẽ đi sửa ở backoffice và
 * không hiểu vì sao trang công khai vẫn như cũ.
 */
function SuiteTab({ app }: { app: AppEntity }) {
  const router = useRouter();
  const { t } = useI18n();
  const { message, modal } = App.useApp();
  const [rebuilding, setRebuilding] = useState(false);
  const rebuildAll = () => {
    modal.confirm({
      title: t("build.suiteRebuildTitle", "Dựng lại cả bộ?"),
      content: t(
        "build.suiteRebuildBody",
        "Mọi site trong bộ sẽ được dựng lại theo đúng thứ tự phụ thuộc: API trước (nó chốt cấu trúc dữ liệu), rồi website mặt tiền (chốt bản sắc giao diện), rồi backoffice và cổng khách hàng. Mỗi site là một lượt build riêng.",
      ),
      okText: t("build.suiteRebuildOk", "Dựng lại"),
      cancelText: t("common.cancel", "Huỷ"),
      onOk: async () => {
        setRebuilding(true);
        try {
          const r = await api.rebuildSuite(app.id);
          message.success(`${t("build.suiteRebuildStarted", "Đã xếp hàng")} ${r.builds} ${t("build.suiteRebuildBuilds", "lượt dựng")}`);
        } catch (e) {
          message.error((e as Error).message);
        } finally {
          setRebuilding(false);
        }
      },
    });
  };
  const members = [...(app.suiteMembers ?? [])].sort(
    (a, b) => SUITE_ORDER.indexOf(a.surface) - SUITE_ORDER.indexOf(b.surface),
  );
  if (!members.length) {
    return <Empty description={t("build.suiteEmpty", "App này không thuộc bộ site nào.")} />;
  }
  const apiMember = members.find((m) => m.surface === "api");
  return (
    <Space direction="vertical" size={14} style={{ width: "100%" }}>
      <Alert
        type="info"
        showIcon
        message={t("build.suiteTitle", `Hệ thống gồm ${members.length} site độc lập`)}
        description={
          apiMember
            ? t(
                "build.suiteDesc",
                "Mỗi site có địa chỉ riêng và deploy riêng. Dữ liệu nằm ở MỘT chỗ duy nhất — site API — nên muốn sửa cấu trúc dữ liệu hay thêm endpoint thì mở site API, không phải các site kia.",
              )
            : t("build.suiteDescNoApi", "Mỗi site có địa chỉ riêng và deploy riêng.")
        }
      />
      <div>
        <Button type="primary" loading={rebuilding} onClick={rebuildAll} icon={<ReloadOutlined />}>
          {t("build.suiteRebuild", "Dựng lại cả bộ (đúng thứ tự)")}
        </Button>
      </div>
      {members.map((m) => {
        const live = m.status === "live" && !!m.currentUrl;
        const here = m.id === app.id;
        return (
          <Card key={m.id} size="small" styles={{ body: { padding: 14 } }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <Tag bordered={false} color={m.surface === "api" ? "geekblue" : "purple"}>
                {SUITE_LABEL[m.surface]}
              </Tag>
              <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                <Text strong ellipsis style={{ display: "block" }}>
                  {m.name}
                  {here && (
                    <Text type="secondary" style={{ fontWeight: 400 }}>
                      {" "}
                      · {t("build.suiteHere", "đang xem")}
                    </Text>
                  )}
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {live ? m.currentUrl!.replace(/^https?:\/\//, "") : t("build.suiteNotLive", "chưa chạy được")}
                  {" — "}
                  {SUITE_ROLE[m.surface]}
                </Text>
              </div>
              <Space size={6}>
                {live && (
                  <Button
                    size="small"
                    icon={<LinkOutlined />}
                    href={m.currentUrl!}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("build.suiteOpen", "Mở")}
                  </Button>
                )}
                <Button size="small" type={here ? "default" : "primary"} disabled={here} onClick={() => router.push(`/apps/${m.id}`)}>
                  {t("build.suiteManage", "Sửa site này")}
                </Button>
              </Space>
            </div>
          </Card>
        );
      })}
    </Space>
  );
}

const SUITE_ORDER = ["site", "cms", "portal", "api"] as const;
const SUITE_LABEL: Record<string, string> = {
  site: "Website",
  cms: "Backoffice",
  portal: "Cổng khách hàng",
  api: "API",
};
const SUITE_ROLE: Record<string, string> = {
  site: "mặt tiền công khai, khách xem không cần đăng nhập",
  cms: "khu quản trị nội bộ, phải đăng nhập",
  portal: "khách hàng đăng nhập xem dữ liệu của chính họ",
  api: "nơi DUY NHẤT giữ dữ liệu của cả bộ",
};

/**
 * "Cấu trúc dự án" — the management view for an imported multi-service workspace.
 * Everything lives in THIS ONE app: the detected sub-projects are shown as PARTS
 * (read-only structure + jump to their code), and the whole system runs together
 * via the "Chạy trên Server (Docker)" card (each part → its own subdomain). We no
 * longer split a project into separate child apps.
 */
function ServicesTab({
  appId,
  onViewCode,
}: {
  appId: string;
  onViewCode: () => void;
}) {
  const { message } = App.useApp();
  const { t } = useI18n();
  const [services, setServices] = useState<DetectedService[] | null>(null);

  const load = useCallback(async () => {
    try {
      const svc = await api.appServices(appId);
      setServices(svc.services);
    } catch (e) {
      message.error((e as Error).message);
      setServices([]);
    }
  }, [appId, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const TYPE_META: Record<
    DetectedService["type"],
    { label: string; color: string }
  > = {
    frontend: { label: "Frontend", color: "green" },
    static: { label: t("build.typeStatic", "Tĩnh"), color: "cyan" },
    backend: { label: "Backend", color: "orange" },
    other: { label: t("build.typeOther", "Khác"), color: "default" },
  };

  if (services === null) return <Skeleton active paragraph={{ rows: 6 }} />;

  return (
    <Space direction="vertical" size={14} style={{ width: "100%" }}>
      {/* The whole workspace runs together on Docker — each part → a subdomain. */}
      <ServerDeployCard appId={appId} />
      <Text type="secondary" style={{ fontSize: 12.5 }}>
        {t("build.projectHasA", "Dự án có")} <Text strong>{services.length}</Text> {t("build.projectHasParts", "phần — tất cả nằm trong")}{" "}
        <Text strong>{t("build.sameApp", "CÙNG một app")}</Text> {t("build.projectHasB", "này. Bấm")} <Text strong>{t("build.deployToServerQuoted", "“Deploy lên server”")}</Text>{" "}
        {t("build.projectHasC", "ở trên để chạy tất cả cùng nhau (mỗi phần ra một subdomain riêng). Danh sách dưới là cấu trúc mã nguồn — bấm “Xem mã nguồn” để mở trong tab Code.")}
      </Text>
      {services.length === 0 ? (
        <Empty description={t("build.noServices", "Không phát hiện phần dự án rõ ràng (repo thiếu package.json / cấu trúc).")} />
      ) : (
        <Space direction="vertical" size={10} style={{ width: "100%" }}>
          {services.map((svc) => {
            const meta = TYPE_META[svc.type];
            return (
              <Card
                key={svc.path || "root"}
                size="small"
                styles={{ body: { padding: 14 } }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ color: "#6C5CE7", fontSize: 18 }}>
                    <ApartmentOutlined />
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <Text strong>{svc.name}</Text>
                      <Tag color={meta.color} bordered={false}>
                        {meta.label}
                      </Tag>
                      {svc.framework && <Tag bordered={false}>{svc.framework}</Tag>}
                    </div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {svc.path || t("build.repoRoot", "(gốc repo)")} · {svc.fileCount} file
                    </Text>
                  </div>
                  <Button size="small" icon={<CodeOutlined />} onClick={onViewCode}>
                    {t("build.viewCode", "Xem mã nguồn")}
                  </Button>
                </div>
              </Card>
            );
          })}
        </Space>
      )}
    </Space>
  );
}

function BuildsTab({
  appId,
  refreshSignal,
  onOpen,
  onRollback,
}: {
  appId: string;
  refreshSignal: number;
  onOpen: (buildId: string) => void;
  onRollback: (buildId: string) => void;
}) {
  const { message } = App.useApp();
  const { t } = useI18n();
  const [builds, setBuilds] = useState<Build[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [rollingBack, setRollingBack] = useState<string | null>(null);

  const load = useCallback(
    async (p = 1) => {
      setLoading(true);
      try {
        const res = await api.appBuilds(appId, { page: p, pageSize: 10 });
        setBuilds(res.items);
        setTotal(res.total);
      } catch (e) {
        message.error((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [appId, message],
  );

  useEffect(() => {
    void load(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, refreshSignal]);

  const rollback = async (buildId: string) => {
    setRollingBack(buildId);
    try {
      const res = await api.rollbackBuild(buildId);
      message.success(t("build.restoring", "Đang khôi phục — build mới đang chạy…"));
      onRollback(res.buildId);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setRollingBack(null);
    }
  };

  const columns: ColumnsType<Build> = [
    {
      title: t("build.version", "Phiên bản"),
      key: "version",
      width: 92,
      render: (_, __, index) => {
        const v = total - ((page - 1) * 10 + index);
        return <Tag color="purple">v{v > 0 ? v : "?"}</Tag>;
      },
    },
    {
      title: t("build.request", "Yêu cầu"),
      dataIndex: "prompt",
      key: "prompt",
      ellipsis: true,
      render: (v: string) => <Text>{v}</Text>,
    },
    {
      title: t("build.status", "Trạng thái"),
      dataIndex: "status",
      key: "status",
      width: 140,
      render: (_, r) => <BuildStatusTag status={r.status} />,
    },
    {
      title: t("build.createdAt", "Tạo lúc"),
      dataIndex: "createdAt",
      key: "createdAt",
      width: 150,
      render: (v) => <Text type="secondary">{formatDate(v)}</Text>,
    },
    {
      title: "",
      key: "action",
      width: 120,
      render: (_, r) => (
        <Popconfirm
          title={t("build.restoreVersionConfirm", "Khôi phục phiên bản này?")}
          description={t("build.restoreVersionDesc", "Tạo build mới từ mã nguồn của phiên bản này và deploy lại (không tốn credit).")}
          okText={t("build.restore", "Khôi phục")}
          cancelText={t("build.cancel", "Huỷ")}
          onConfirm={() => void rollback(r.id)}
        >
          <Button
            size="small"
            icon={<HistoryOutlined />}
            loading={rollingBack === r.id}
            disabled={r.status !== "succeeded"}
            onClick={(e) => e.stopPropagation()}
          >
            {t("build.restore", "Khôi phục")}
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Text type="secondary" style={{ fontSize: 12.5 }}>
        {t("build.versionsIntro", "Mỗi lần tạo/sửa app là một phiên bản. Nhấn “Khôi phục” để đưa app về đúng mã nguồn của một phiên bản trước rồi deploy lại.")}
      </Text>
      <Table<Build>
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={builds}
        scroll={{ x: "max-content" }}
        onRow={(r) => ({
          onClick: () => onOpen(r.id),
          style: { cursor: "pointer" },
        })}
        locale={{ emptyText: <Empty description={t("build.noVersions", "Chưa có phiên bản nào")} /> }}
        pagination={{
          current: page,
          pageSize: 10,
          total,
          showSizeChanger: false,
          onChange: (p) => {
            setPage(p);
            void load(p);
          },
        }}
      />
    </Space>
  );
}

function DeploymentsTab({
  appId,
  refreshSignal,
}: {
  appId: string;
  refreshSignal: number;
}) {
  const { message } = App.useApp();
  const { t } = useI18n();
  const [items, setItems] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await api.appDeployments(appId, { pageSize: 50 });
        if (!cancelled) setItems(res.items);
      } catch (e) {
        if (!cancelled) message.error((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appId, refreshSignal, message]);

  if (loading) return <Skeleton active />;

  const columns: ColumnsType<Deployment> = [
    {
      title: "URL",
      dataIndex: "url",
      key: "url",
      render: (v: string) => (
        <a href={v} target="_blank" rel="noreferrer">
          {v}
        </a>
      ),
    },
    {
      title: t("build.status", "Trạng thái"),
      dataIndex: "status",
      key: "status",
      width: 140,
      render: (_, r) => <DeploymentStatusTag status={r.status} />,
    },
    {
      title: t("build.createdAt", "Tạo lúc"),
      dataIndex: "createdAt",
      key: "createdAt",
      width: 170,
      render: (v) => <Text type="secondary">{formatDate(v)}</Text>,
    },
  ];

  return (
    <Table<Deployment>
      rowKey="id"
      columns={columns}
      dataSource={items}
      pagination={false}
      scroll={{ x: "max-content" }}
      locale={{ emptyText: <Empty description={t("build.noDeployments", "Chưa có deployment nào")} /> }}
    />
  );
}
