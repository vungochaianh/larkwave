"use client";

import {
  CheckCircleFilled,
  CloudDownloadOutlined,
  GithubFilled,
  GitlabFilled,
  LinkOutlined,
  LockOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import {
  App,
  Button,
  Card,
  Empty,
  Grid,
  Input,
  Modal,
  Segmented,
  Skeleton,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GitProvider, GitRepo } from "@larkwave/shared";
import { useI18n } from "@larkwave/ui";
import { api, API_ORIGIN } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { CARD_SHADOW } from "@/lib/theme";

const { Title, Text, Paragraph } = Typography;

/** Estimated phases shown in the import progress modal (a big repo can take a
 *  while to download + analyze, so we surface a staged process, not a spinner). */
const IMPORT_STEPS: { key: string; vi: string }[] = [
  { key: "build.importStep1", vi: "Kết nối kho mã nguồn…" },
  { key: "build.importStep2", vi: "Tải mã nguồn về…" },
  { key: "build.importStep3", vi: "Phân tích & phân loại dự án…" },
  { key: "build.importStep4", vi: "Khởi tạo build & deploy…" },
];

const PROVIDER_META: Record<
  GitProvider,
  { label: string; icon: React.ReactNode; color: string }
> = {
  gitlab: {
    label: "GitLab",
    icon: <GitlabFilled style={{ color: "#FC6D26" }} />,
    color: "#FC6D26",
  },
  github: {
    label: "GitHub",
    icon: <GithubFilled style={{ color: "#1E2230" }} />,
    color: "#1E2230",
  },
};

export default function ImportPage() {
  // useSearchParams must live under a Suspense boundary (Next.js App Router).
  return (
    <Suspense fallback={null}>
      <ImportInner />
    </Suspense>
  );
}

function ImportInner() {
  const { t } = useI18n();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const searchParams = useSearchParams();
  const initialProvider =
    searchParams.get("provider") === "github" ? "github" : "gitlab";
  const [provider, setProvider] = useState<GitProvider>(initialProvider);

  return (
    <Space direction="vertical" size={isMobile ? 18 : 24} style={{ width: "100%" }}>
      <div>
        <Space align="center" size="middle">
          <span
            style={{
              display: "inline-flex",
              width: 38,
              height: 38,
              minWidth: 38,
              borderRadius: 10,
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(108,92,231,0.12)",
              border: "1px solid rgba(108,92,231,0.30)",
              color: "#6C5CE7",
              fontSize: 18,
            }}
          >
            <CloudDownloadOutlined />
          </span>
          <Title level={isMobile ? 3 : 2} style={{ margin: 0 }}>
            {t("build.importFromGit", "Nhập từ Git")}
          </Title>
        </Space>
        <Paragraph
          type="secondary"
          style={{ marginTop: 10, marginBottom: 0, maxWidth: 660 }}
        >
          {t(
            "build.importIntro",
            "Kết nối GitLab hoặc GitHub, chọn một repository và Larkwave sẽ tải mã nguồn, build và deploy ra liên kết công khai — sau đó bạn có thể đẩy thay đổi ngược lại repo.",
          )}
        </Paragraph>
      </div>

      <Segmented<GitProvider>
        size="large"
        value={provider}
        onChange={(v) => setProvider(v)}
        options={(["gitlab", "github"] as GitProvider[]).map((p) => ({
          value: p,
          label: (
            <Space size={8}>
              {PROVIDER_META[p].icon}
              {PROVIDER_META[p].label}
            </Space>
          ),
        }))}
      />

      {/* Remount the panel when the provider changes so its state resets. */}
      <ProviderPanel key={provider} provider={provider} />
    </Space>
  );
}

function ProviderPanel({ provider }: { provider: GitProvider }) {
  const { message } = App.useApp();
  const { t } = useI18n();
  const { token } = useAuth();
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const meta = PROVIDER_META[provider];

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [repos, setRepos] = useState<GitRepo[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState<string | null>(null);
  const [importStep, setImportStep] = useState(0);
  const importAbort = useRef<AbortController | null>(null);

  // Advance the estimated import phase while the (single, long) import request
  // runs, so a big repo shows a staged process instead of a bare spinner. Caps at
  // the last "real work" phase; the request resolving is what finishes it.
  useEffect(() => {
    if (!importing) return;
    const timer = setInterval(
      () => setImportStep((s) => Math.min(s + 1, IMPORT_STEPS.length - 1)),
      2500,
    );
    return () => clearInterval(timer);
  }, [importing]);

  const cancelImport = () => {
    importAbort.current?.abort();
    importAbort.current = null;
    setImporting(null);
    setImportStep(0);
  };
  // Map of already-imported repo fullName (lowercased) → its app id, for this
  // provider — used to mark/open/filter repos the user already brought in.
  const [imported, setImported] = useState<Map<string, string>>(new Map());
  const [filter, setFilter] = useState<"all" | "new" | "imported">("all");

  const load = useCallback(
    async (q?: string, p = 1, append = false) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const res = await api.gitRepos(provider, q, p);
        if (res.connected) {
          setConnected(true);
          setPage(p);
          setHasMore(res.hasMore);
          setRepos((prev) => (append ? [...prev, ...res.repos] : res.repos));
        } else {
          setConnected(false);
          setRepos([]);
          setHasMore(false);
        }
      } catch (e) {
        // A 401 from the provider call also means "not connected".
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 401 || status === 400) {
          setConnected(false);
          setRepos([]);
        } else {
          message.error((e as Error).message);
          setConnected(false);
        }
      } finally {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    },
    [provider, message],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Which repos the user has ALREADY imported from this provider → app id.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.listApps({ pageSize: 100 });
        if (cancelled) return;
        const m = new Map<string, string>();
        for (const a of res.items) {
          if (a.gitProvider === provider && a.gitRepo) {
            m.set(a.gitRepo.toLowerCase(), a.id);
          }
        }
        setImported(m);
      } catch {
        /* non-fatal */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [provider]);

  const isImported = (r: GitRepo) => imported.has(r.fullName.toLowerCase());
  const importedAppId = (r: GitRepo) => imported.get(r.fullName.toLowerCase());
  const shownRepos = repos.filter((r) =>
    filter === "imported" ? isImported(r) : filter === "new" ? !isImported(r) : true,
  );

  // Connect → hard-navigate to the provider OAuth entrypoint with the current
  // JWT as the `link` param so the provider links to the logged-in account.
  // Carry the current origin (app vs aapp) so OAuth returns us to THIS frontend.
  const connect = () => {
    const params = new URLSearchParams({ origin: window.location.origin });
    if (token) params.set("link", token);
    window.location.href = `${API_ORIGIN}/auth/${provider}?${params.toString()}`;
  };

  const runSearch = () => {
    const q = query.trim();
    setSearch(q);
    void load(q || undefined);
  };

  const doImport = async (repo: GitRepo) => {
    setImporting(repo.fullName);
    setImportStep(0);
    const ctrl = new AbortController();
    importAbort.current = ctrl;
    try {
      const res = await api.gitImport(
        { provider, repo: repo.fullName, branch: repo.defaultBranch },
        ctrl.signal,
      );
      // Background import: the request returns immediately; the real work (clone →
      // classify → build/deploy) runs server-side and streams live progress to the
      // build. Navigate to the workspace and watch it there.
      message.success(
        t(
          "build.importStarted",
          "Đã bắt đầu nhập — đang chạy nền, theo dõi tiến trình trong workspace…",
        ),
      );
      router.push(`/apps/${res.appId}?build=${res.buildId}`);
    } catch (e) {
      // User cancelled (aborted fetch) → close silently, no error toast.
      if ((e as Error).name !== "AbortError") message.error((e as Error).message);
      setImporting(null);
    } finally {
      importAbort.current = null;
    }
  };

  if (loading && connected === null) {
    return (
      <Card style={{ boxShadow: CARD_SHADOW }}>
        <Skeleton active paragraph={{ rows: 4 }} />
      </Card>
    );
  }

  if (connected === false) {
    return (
      <Card style={{ boxShadow: CARD_SHADOW }} styles={{ body: { padding: isMobile ? 22 : 32 } }}>
        <div style={{ textAlign: "center", maxWidth: 460, margin: "0 auto" }}>
          <span
            style={{
              display: "inline-flex",
              width: 56,
              height: 56,
              borderRadius: 16,
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              background: "#F7F8FC",
              border: `1px solid ${meta.color}33`,
              marginBottom: 16,
            }}
          >
            {meta.icon}
          </span>
          <Title level={4} style={{ margin: "0 0 8px" }}>
            {t("build.connect", "Kết nối")} {meta.label}
          </Title>
          <Paragraph type="secondary" style={{ marginBottom: 20 }}>
            {t(
              "build.connectDesc",
              "Cho phép Larkwave truy cập repositories của bạn để nhập mã nguồn và đẩy thay đổi ngược lại. Bạn sẽ được đưa tới trang xác thực",
            )}{" "}
            {meta.label}.
          </Paragraph>
          <Button
            type="primary"
            size="large"
            icon={<LinkOutlined />}
            onClick={connect}
          >
            {t("build.connect", "Kết nối")} {meta.label}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      {/* Stats + imported filter */}
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <StatChip label={t("build.reposShown", "Repo hiển thị")} value={shownRepos.length} color={meta.color} />
          <StatChip
            label={`${t("build.importedFrom", "Đã nhập từ")} ${meta.label}`}
            value={imported.size}
            color="#6C5CE7"
          />
        </div>
        <Segmented<"all" | "new" | "imported">
          value={filter}
          onChange={(v) => setFilter(v)}
          options={[
            { label: t("build.filterAll", "Tất cả"), value: "all" },
            { label: t("build.filterNew", "Chưa nhập"), value: "new" },
            { label: `${t("build.filterImported", "Đã nhập")} (${imported.size})`, value: "imported" },
          ]}
        />
      </div>

      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <Input
          size="large"
          allowClear
          prefix={<SearchOutlined style={{ color: "#9AA3B5" }} />}
          placeholder={`${t("build.searchRepoOn", "Tìm repo trên")} ${meta.label}…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onPressEnter={runSearch}
          onClear={() => {
            setQuery("");
            setSearch("");
            void load();
          }}
          // Stop browser/OS password autofill from popping on this search field.
          name="tw-repo-search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-1p-ignore=""
          data-lpignore="true"
          data-form-type="other"
          style={{ flex: "1 1 220px", minWidth: 0, maxWidth: 440 }}
        />
        <Button size="large" onClick={runSearch}>
          {t("build.search", "Tìm")}
        </Button>
        <Tooltip title={t("build.refreshList", "Làm mới danh sách")}>
          <Button
            size="large"
            icon={<ReloadOutlined />}
            onClick={() => void load(search || undefined)}
            loading={loading}
          />
        </Tooltip>
      </div>

      {loading ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(min(320px, 100%), 1fr))",
            gap: 14,
          }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} style={{ boxShadow: CARD_SHADOW }}>
              <Skeleton active paragraph={{ rows: 2 }} />
            </Card>
          ))}
        </div>
      ) : shownRepos.length === 0 ? (
        <Card style={{ boxShadow: CARD_SHADOW }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              filter === "imported"
                ? t("build.noImportedShown", "Chưa có repo nào được nhập (trong danh sách đang hiển thị)")
                : filter === "new"
                  ? t("build.allImported", "Mọi repo đang hiển thị đều đã được nhập")
                  : search
                    ? `${t("build.noRepoMatch", "Không tìm thấy repo khớp")} “${search}”`
                    : `${t("build.noReposOn", "Không có repository nào trên")} ${meta.label}`
            }
          />
        </Card>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(min(320px, 100%), 1fr))",
            gap: 14,
          }}
        >
          {shownRepos.map((repo) => (
            <Card
              key={String(repo.id)}
              className="tw-lift"
              style={{ boxShadow: CARD_SHADOW, height: "100%" }}
              styles={{ body: { padding: 16 } }}
            >
              <div style={{ display: "flex", gap: 12 }}>
                <span
                  style={{
                    display: "inline-flex",
                    width: 38,
                    height: 38,
                    minWidth: 38,
                    borderRadius: 10,
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    background: "#F7F8FC",
                    border: `1px solid ${meta.color}33`,
                  }}
                >
                  {meta.icon}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Title
                    level={5}
                    style={{ margin: 0 }}
                    ellipsis={{ rows: 1, tooltip: repo.fullName }}
                  >
                    {repo.name}
                  </Title>
                  <Text
                    type="secondary"
                    style={{ fontSize: 12.5 }}
                    ellipsis
                  >
                    {repo.fullName}
                  </Text>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 12,
                  flexWrap: "wrap",
                }}
              >
                {repo.private ? (
                  <Tag icon={<LockOutlined />} color="default">
                    {t("build.private", "Riêng tư")}
                  </Tag>
                ) : (
                  <Tag color="green">{t("build.public", "Công khai")}</Tag>
                )}
                <Tag color="purple">{repo.defaultBranch}</Tag>
                {isImported(repo) && (
                  <Tag icon={<CheckCircleFilled />} color="success">
                    {t("build.imported", "Đã nhập")}
                  </Tag>
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  flexWrap: "wrap",
                  marginTop: 12,
                  paddingTop: 12,
                  borderTop: "1px solid #F1F2F7",
                }}
              >
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {formatDate(repo.updatedAt)}
                </Text>
                {isImported(repo) ? (
                  <Space size={4}>
                    <Button
                      size="small"
                      icon={<LinkOutlined />}
                      onClick={() => router.push(`/apps/${importedAppId(repo)}`)}
                    >
                      {t("build.openApp", "Mở app")}
                    </Button>
                    <Button
                      size="small"
                      type="text"
                      icon={<CloudDownloadOutlined />}
                      loading={importing === repo.fullName}
                      disabled={!!importing && importing !== repo.fullName}
                      onClick={() => void doImport(repo)}
                    >
                      {t("build.reimport", "Nhập lại")}
                    </Button>
                  </Space>
                ) : (
                  <Button
                    type="primary"
                    size="small"
                    icon={<CloudDownloadOutlined />}
                    loading={importing === repo.fullName}
                    disabled={!!importing && importing !== repo.fullName}
                    onClick={() => void doImport(repo)}
                  >
                    {t("build.import", "Nhập")}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Load more (pagination) */}
      {!loading && hasMore && (
        <div style={{ textAlign: "center", paddingTop: 4 }}>
          <Button
            size="large"
            loading={loadingMore}
            onClick={() => void load(search || undefined, page + 1, true)}
          >
            {t("build.loadMore", "Tải thêm repo")}
          </Button>
        </div>
      )}

      {/* Import progress — the request is blocking while we download + classify. */}
      <Modal
        open={!!importing}
        closable={false}
        maskClosable={false}
        width={isMobile ? "94vw" : 520}
        title={t("build.importing", "Đang nhập từ Git")}
        footer={[
          <Button key="cancel" onClick={cancelImport}>
            {t("build.cancel", "Huỷ")}
          </Button>,
        ]}
      >
        <Space direction="vertical" size={14} style={{ width: "100%" }}>
          <Text strong style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>
            {importing}
          </Text>
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {IMPORT_STEPS.map((step, i) => {
              const label = t(step.key, step.vi);
              const done = i < importStep;
              const active = i === importStep;
              return (
                <div key={step.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {done ? (
                    <CheckCircleFilled style={{ color: "#22C55E", fontSize: 16 }} />
                  ) : active ? (
                    <Spin size="small" />
                  ) : (
                    <span
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 999,
                        border: "2px solid #E5E7EB",
                        display: "inline-block",
                      }}
                    />
                  )}
                  <Text
                    style={{
                      color: done ? "#6B7280" : active ? "#1E2230" : "#9AA3B5",
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    {label}
                  </Text>
                </div>
              );
            })}
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t(
              "build.importBigRepoNote",
              "Repo lớn (monorepo) có thể mất 1–2 phút — bạn cứ để đây chạy, hoặc bấm Huỷ.",
            )}
          </Text>
        </Space>
      </Modal>
    </Space>
  );
}

/** Small stat chip for the import header. */
function StatChip({
  label,
  value,
  color,
}: {
  label: string;
  value: React.ReactNode;
  color: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 8,
        padding: "8px 14px",
        borderRadius: 10,
        background: "#FBFBFE",
        border: "1px solid #F1F2F7",
      }}
    >
      <span style={{ fontSize: 18, fontWeight: 700, color }}>{value}</span>
      <span style={{ fontSize: 12.5, color: "#6B7280" }}>{label}</span>
    </div>
  );
}
