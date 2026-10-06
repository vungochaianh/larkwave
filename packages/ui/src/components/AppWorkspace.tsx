'use client';
import { useEffect, useRef, useState } from 'react';
import { notifyAppsChanged } from '../appEvents';
import { V } from '../theme';
import { useAgentBusy } from '../useAgentBusy';
import { Alert, App, Button, Dropdown, Input, Modal, QRCode, Space, Tag, Tooltip, Typography } from 'antd';
import {
  ApartmentOutlined,
  ArrowLeftOutlined,
  CloudServerOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  DownloadOutlined,
  FolderOpenOutlined,
  LinkOutlined,
  LoadingOutlined,
  MoreOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import type {
  AppMode,
  BuildEvent,
  ConvMessage,
  CreateBuildInput,
  EnvVarSpec,
  RunnerPromptPreview,
  RuntimeAdapter,
} from '@larkwave/core';
import { useRuntime } from '../RuntimeProvider';
import { useAccountAuth } from '../account/auth';
import { WorkspacePanes } from './WorkspacePanes';
import { WorkspaceDock } from './WorkspaceDock';
import type { PromptOverrides } from './PromptInspector';
import { EnvSetupModal } from './EnvSetupModal';
import { desktopRunnerPrefs } from '../runnerPrefs';

const { Title, Text } = Typography;

/**
 * The per-app workspace: the persisted iterate CONVERSATION on the left (chat
 * bubbles + a follow-up composer that re-runs Claude on the same app dir) and the
 * live PREVIEW on the right. This is what makes "tạo app → có hội thoại để chỉnh
 * tiếp" — each turn is saved and the app is edited in place.
 */
export function AppWorkspace({
  appId,
  name,
  status,
  deployedUrl,
  initialBuild,
  onBack,
  onDeleted,
}: {
  appId: string;
  name?: string;
  /** The app's persisted status at open. 'error' → show a proactive "chẩn đoán & sửa" banner. */
  status?: string;
  /** Last public URL this app was published to (shows the share/QR bar). */
  deployedUrl?: string;
  /** When set, run this build immediately on mount + stream it INTO this workspace — so
   *  "Tạo app" from the composer lands straight in the app's tab (chat + preview) instead of
   *  building on the home screen first. */
  initialBuild?: CreateBuildInput;
  onBack?: () => void;
  /** Called after the app is deleted (parent should drop it + refresh the list). */
  onDeleted?: () => void;
}) {
  const runtime: RuntimeAdapter = useRuntime();
  const { message, modal } = App.useApp();
  const { token } = useAccountAuth();
  const [conv, setConv] = useState<ConvMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<AppMode>('build');
  const [events, setEvents] = useState<BuildEvent[]>([]);
  // Start "running" when we'll kick off a build on mount, so the preview pane shows a
  // "đang dựng" state from the very first render instead of flashing a "thiếu package.json"
  // error before the first build has written any files.
  const [running, setRunning] = useState(!!initialBuild);
  // Shared AI lock: another tab/turn mid-answer blocks this workspace's Send too.
  const agentOwner = useAgentBusy();
  // Keep the last build's stage log on screen when it FAILED (so the user sees which step broke,
  // instead of the progress vanishing the moment `running` flips off and looking like success).
  const [buildFailed, setBuildFailed] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  // Proactive error banner: dismissed for this session once the user acts / hides it.
  const [errorDismissed, setErrorDismissed] = useState(false);
  const [envOpen, setEnvOpen] = useState(false);
  const [envKeys, setEnvKeys] = useState<EnvVarSpec[]>([]);
  // The dock's mode: build (iterate) vs hỏi (read-only Q&A) — folds the old "Trợ giúp" tab in.
  const [chatMode, setChatMode] = useState<'build' | 'help'>('build');
  const [shareUrl, setShareUrl] = useState(deployedUrl);
  // "Trợ giúp" (read-only Q&A) — ephemeral, kept only in this session.
  const [helpMsgs, setHelpMsgs] = useState<ConvMessage[]>([]);
  const [runnerLabel, setRunnerLabel] = useState('AI');
  const [helpPrompt, setHelpPrompt] = useState('');
  const [helpRunning, setHelpRunning] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  // The lock is held but THIS tab isn't the one running it → offer the "Mở khoá" recovery. Covers
  // another tab/relay/lark AND our OWN turn orphaned by an app reload (before this, same-app was
  // excluded, so after a reload a still-running turn for THIS app showed nothing + couldn't cancel).
  const localRunning = running || helpRunning;
  const blockedByOther = !!agentOwner && !localRunning;
  const blockedSameApp = blockedByOther && agentOwner!.appId === appId;
  const [promptPreview, setPromptPreview] = useState<RunnerPromptPreview | null>(null);
  const [promptPreviewLoading, setPromptPreviewLoading] = useState(false);
  const [promptOverrides, setPromptOverrides] = useState<PromptOverrides>({});
  const aliveRef = useRef(true);

  const runnerBuildExtras = (overrides: PromptOverrides = promptOverrides) => ({
    ...desktopRunnerPrefs(),
    ...(overrides.system !== undefined && { systemPromptOverride: overrides.system }),
    ...(overrides.user !== undefined && { userPromptOverride: overrides.user }),
    ...(overrides.full !== undefined && { fullPromptOverride: overrides.full }),
  });

  const refreshPromptPreview = async (draft?: string) => {
    if (!runtime.composeRunnerPrompt) return;
    const p = (draft ?? prompt).trim();
    if (!p) {
      setPromptPreview(null);
      return;
    }
    setPromptPreviewLoading(true);
    try {
      const prev = await runtime.composeRunnerPrompt({
        prompt: p,
        mode,
        appId,
        ...runnerBuildExtras(),
      });
      setPromptPreview(prev);
    } catch {
      /* offline / web runtime */
    } finally {
      setPromptPreviewLoading(false);
    }
  };
  // "Chạy trên Server" (Docker) — synth infra + upload + poll status.
  const [serverOpen, setServerOpen] = useState(false);
  const [serverBusy, setServerBusy] = useState(false);
  const [serverLog, setServerLog] = useState('');
  const [serverStatus, setServerStatus] = useState<string>('');
  const [serverUrls, setServerUrls] = useState<string[]>([]);
  const [serverErr, setServerErr] = useState<string | undefined>(undefined);
  // Own the dev server's lifecycle: stop it when the whole workspace unmounts (PreviewPane no
  // longer does this, so multiple preview panes can share one server). eslint-disable for appId.
  useEffect(
    () => () => {
      aliveRef.current = false;
      runtime.stopPreview?.(appId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  // The docked chat panel — auto-open on enter, collapsible to a rail, drag-resizable.
  const [chatOpen, setChatOpen] = useState(true);
  const [chatW, setChatW] = useState(() => {
    if (typeof window === 'undefined') return 400;
    const v = Number(localStorage.getItem('tw_chat_w'));
    return v >= 320 && v <= 640 ? v : 400;
  });
  const [draggingChat, setDraggingChat] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem('tw_chat_w', String(chatW));
    } catch {
      /* ignore */
    }
  }, [chatW]);
  // Drag the 6px handle to resize the chat column (clamped 320–600). A transparent overlay during
  // the drag keeps pointer capture over the preview iframes (which would otherwise swallow it).
  const startChatDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = chatW;
    setDraggingChat(true);
    const onMove = (ev: PointerEvent) => setChatW(Math.min(640, Math.max(320, startW - (ev.clientX - startX))));
    const onUp = () => {
      setDraggingChat(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // ── App actions (mirror the website's per-app header) ──────────────────────
  const openFolder = () => {
    runtime.openAppFolder?.(appId).catch((e) => message.error((e as Error).message));
  };
  const downloadZip = async () => {
    try {
      const path = await runtime.downloadAppZip?.(appId);
      if (path) message.success('Đã lưu .zip');
    } catch (e) {
      message.error((e as Error).message);
    }
  };
  const removeApp = () => {
    modal.confirm({
      title: 'Xoá app này?',
      content: 'Toàn bộ mã nguồn & hội thoại trong máy sẽ bị xoá. Không thể hoàn tác.',
      okText: 'Xoá',
      okButtonProps: { danger: true },
      cancelText: 'Huỷ',
      onOk: async () => {
        try {
          await runtime.deleteApp?.(appId);
          message.success('Đã xoá app');
          (onDeleted ?? onBack)?.();
        } catch (e) {
          message.error((e as Error).message);
        }
      },
    });
  };

  // "Cập nhật cấu trúc thư mục": restructure an OLD flat app into {slug}-workspace/{slug}-home
  // (backs up first, reversible). Only meaningful for apps created before the named-workspace layout.
  const doMigrate = () => {
    if (!runtime.migrateApp || running || migrating) return;
    let nameVal = (name || appId).slice(0, 30); // prefilled short name (user can edit)
    modal.confirm({
      title: 'Cập nhật cấu trúc thư mục',
      width: 460,
      content: (
        <div>
          <Typography.Paragraph type="secondary" style={{ fontSize: 13, marginTop: 4 }}>
            Đặt một <b>tên ngắn</b> (≤30 ký tự — dấu cách sẽ thành “-”). App sẽ thành “<b>{'{tên}-workspace / {tên}-home'}</b>”, mã nguồn
            chuyển vào thư mục con. Bản gốc được <b>SAO LƯU</b> trước nên khôi phục được; preview đang mở sẽ dừng để sắp xếp.
          </Typography.Paragraph>
          <Input
            defaultValue={nameVal}
            maxLength={30}
            placeholder="Tên ngắn cho dự án"
            onChange={(e) => {
              nameVal = e.target.value;
            }}
          />
        </div>
      ),
      okText: 'Cập nhật',
      cancelText: 'Huỷ',
      onOk: async () => {
        setMigrating(true);
        const hide = message.loading('Đang sao lưu & sắp xếp lại thư mục…', 0);
        try {
          const r = await runtime.migrateApp!(appId, nameVal.trim().slice(0, 30));
          hide();
          if (r.skipped) {
            message.info('App đã ở cấu trúc mới rồi.');
            return;
          }
          if (!r.ok) {
            message.error(r.error || 'Cập nhật cấu trúc thất bại.');
            return;
          }
          message.success(`Đã cập nhật cấu trúc: ${r.newName || 'workspace'}${r.backup ? ' · đã sao lưu bản gốc' : ''}`);
          setPreviewKey((k) => k + 1);
          notifyAppsChanged();
        } catch (e) {
          hide();
          message.error((e as Error).message);
        } finally {
          setMigrating(false);
        }
      },
    });
  };

  // "Tóm tắt & phiên mới": Claude summarizes the chat, archives it, and seeds a fresh session
  // that inherits the summary — for when a conversation gets long/messy.
  const doHandoff = () => {
    if (!runtime.appHandoffSession || running) return;
    modal.confirm({
      title: 'Tóm tắt & bắt đầu phiên mới?',
      content:
        'Claude sẽ tóm tắt hội thoại hiện tại, lưu lại bản cũ, và mở phiên mới kế thừa tóm tắt đó (app + mã nguồn giữ nguyên). Phù hợp khi hội thoại đã quá dài.',
      okText: 'Tóm tắt',
      cancelText: 'Huỷ',
      onOk: async () => {
        const hide = message.loading('Đang tóm tắt hội thoại…', 0);
        try {
          await runtime.appHandoffSession!(appId);
          hide();
          message.success('Đã tạo phiên mới với tóm tắt.');
          load(); // reload the conversation → now the summary bubble
        } catch (e) {
          hide();
          message.error((e as Error).message);
        }
      },
    });
  };

  // "Tóm tắt hội thoại": a READ-ONLY summary of the current build chat. Non-destructive —
  // an ephemeral plan turn never writes code; since an ephemeral turn doesn't load the saved
  // conversation, we pass the transcript IN the prompt (from the already-loaded `conv`) and
  // show the result in the "Trợ giúp" pane.
  const summarize = async () => {
    if (running || helpRunning) return;
    const msgs = conv.filter((m) => m.content?.trim());
    if (!msgs.length) {
      message.info('Chưa có hội thoại để tóm tắt.');
      return;
    }
    const transcript = msgs
      .map((m) => `${m.role === 'user' ? 'Người dùng' : 'AI'}: ${m.content}`)
      .join('\n')
      .slice(-16000);
    const q =
      'Tóm tắt NGẮN GỌN cuộc hội thoại xây dựng app dưới đây: các yêu cầu/thay đổi chính đã trao đổi, kết quả và trạng thái hiện tại. Gạch đầu dòng, tiếng Việt. CHỈ tóm tắt — không sửa code.\n\n--- HỘI THOẠI ---\n' +
      transcript;
    setChatMode('help');
    setHelpMsgs((m) => [
      ...m,
      { role: 'user', content: '📝 Tóm tắt hội thoại', at: new Date().toISOString() },
      { role: 'assistant', content: '', at: new Date().toISOString() },
    ]);
    setHelpRunning(true);
    let answer = '';
    const paint = () =>
      setHelpMsgs((m) => {
        const c = [...m];
        if (c.length) c[c.length - 1] = { ...c[c.length - 1], content: answer || '…' };
        return c;
      });
    try {
      for await (const ev of runtime.createBuild({ prompt: q, mode: 'plan', appId, ephemeral: true, ...runnerBuildExtras({}) })) {
        if (ev.type === 'log' && ev.level === 'info') {
          answer += (answer ? '\n' : '') + ev.message;
          paint();
        } else if (ev.type === 'error') {
          message.error(ev.message.replace(/^402:/, ''));
        }
      }
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      if (!answer) {
        answer = 'Chưa tóm tắt được — thử lại nhé.';
        paint();
      }
      setHelpRunning(false);
    }
  };

  // Publish the app to a public URL: the desktop builds it locally, then the
  // server deploys the static output to Cloudflare Pages and returns the URL.
  const deploy = async () => {
    if (!runtime.deploy || deploying) return;
    setDeploying(true);
    const hide = message.loading('Đang build & xuất bản… (có thể mất 30–60 giây)', 0);
    try {
      const res = await runtime.deploy(appId);
      hide();
      setShareUrl(res.url);
      setPublishOpen(true); // controlled Modal below — has an X + "Đóng" (the old modal.success had no close)
      notifyAppsChanged(); // now live → refresh app cards' URL/live badge everywhere
    } catch (e) {
      hide();
      message.error((e as Error).message);
    } finally {
      setDeploying(false);
    }
  };

  const load = () => {
    runtime
      .appConversation?.(appId)
      .then((c) => setConv(c))
      .catch(() => setConv([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, runtime]);

  // Resolve the active CLI label for error/fix copy (matches Composer's tw_runner choice).
  useEffect(() => {
    if (!runtime.runners) return;
    const prefs = desktopRunnerPrefs();
    runtime.runners
      .list()
      .then((list) => {
        const r = list.find((x) => x.id === prefs.runner) ?? list.find((x) => x.id === 'claude');
        if (r) setRunnerLabel(r.label);
      })
      .catch(() => {});
  }, [runtime]);

  // Live prompt inspector — debounced as the user types in the iterate box.
  useEffect(() => {
    if (!runtime.composeRunnerPrompt) return;
    const p = prompt.trim();
    if (!p) {
      if (!initialBuild?.prompt) setPromptPreview(null);
      return;
    }
    const t = setTimeout(() => void refreshPromptPreview(p), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, mode, appId, promptOverrides.system, promptOverrides.user, promptOverrides.full]);

  useEffect(() => {
    setPromptOverrides({});
  }, [prompt]);

  // First build from the composer: run it HERE so the user lands in the app's tab immediately
  // and watches the build (📸 chụp trang, Write, Bash…) stream into this workspace + preview.
  const ranInitialRef = useRef(false);
  useEffect(() => {
    if (!initialBuild || ranInitialRef.current) return;
    ranInitialRef.current = true;
    if (runtime.composeRunnerPrompt && initialBuild.prompt) {
      void runtime.composeRunnerPrompt(initialBuild).then(setPromptPreview).catch(() => {});
    }
    void (async () => {
      setEvents([]);
      setBuildFailed(false);
      setRunning(true);
      let ok = true;
      try {
        for await (const ev of runtime.createBuild(initialBuild)) {
          if (!aliveRef.current) return;
          setEvents((prev) => [...prev, ev]);
          if (ev.type === 'error') {
            ok = false;
            message.error(ev.message.replace(/^402:/, ''));
          }
          if (ev.type === 'status' && ev.status === 'failed') ok = false;
        }
      } catch (e) {
        ok = false;
        if (aliveRef.current) message.error((e as Error).message);
      } finally {
        if (aliveRef.current) {
          setRunning(false);
          setBuildFailed(!ok);
          if (ok) setEvents([]);
          load();
          notifyAppsChanged(); // build settled disk state → refresh every other tab's list
          setPreviewKey((k) => k + 1);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const iterate = async () => {
    const p = prompt.trim();
    if (!p || running) return;
    setPrompt('');
    setEvents([]);
    setBuildFailed(false);
    setRunning(true);
    setConv((c) => [...c, { role: 'user', content: p, at: new Date().toISOString() }]); // optimistic
    let ok = true;
    try {
      for await (const ev of runtime.createBuild({ prompt: p, mode, appId, ...runnerBuildExtras() })) {
        setEvents((prev) => [...prev, ev]);
        if (ev.type === 'error') {
          ok = false;
          message.error(ev.message.replace(/^402:/, ''));
        }
        if (ev.type === 'status' && ev.status === 'failed') ok = false;
      }
    } catch (e) {
      ok = false;
      message.error((e as Error).message);
    } finally {
      setRunning(false);
      setBuildFailed(!ok);
      if (ok) setEvents([]); // keep the stage log visible when it failed
      load(); // reload persisted conversation (now incl. Claude's turn)
      notifyAppsChanged();
      setPreviewKey((k) => k + 1); // RELOAD the preview so new views show immediately (no exit/reenter)
    }
  };

  // "Nhờ AI sửa lỗi" from the preview pane: hand the preview error to the active CLI
  // and force a write-capable mode so it repairs the app, then re-attempt preview.
  const fixError = async (errorMessage: string) => {
    if (running) return;
    const p = `Preview báo lỗi: "${errorMessage}". Hãy sửa để app chạy được local: đảm bảo package.json có script "dev" và đủ dependencies, đủ file để khởi động (ví dụ Vite cần index.html + src/…). Nếu lỗi do thiếu biến môi trường, hãy tạo .env.example liệt kê các biến cần thiết.`;
    setEvents([]);
    setBuildFailed(false);
    setRunning(true);
    setConv((c) => [...c, { role: 'user', content: `Nhờ ${runnerLabel} sửa lỗi preview`, at: new Date().toISOString() }]);
    let ok = true;
    try {
      for await (const ev of runtime.createBuild({ prompt: p, mode: 'build', appId, ...runnerBuildExtras() })) {
        setEvents((prev) => [...prev, ev]);
        if (ev.type === 'error') {
          ok = false;
          message.error(ev.message.replace(/^402:/, ''));
        }
        if (ev.type === 'status' && ev.status === 'failed') ok = false;
      }
    } catch (e) {
      ok = false;
      message.error((e as Error).message);
    } finally {
      setRunning(false);
      setBuildFailed(!ok);
      if (ok) setEvents([]);
      load();
      notifyAppsChanged();
      setPreviewKey((k) => k + 1); // re-attempt preview after the repair (shows the real error if still broken)
    }
  };

  // Proactive "App đang lỗi" banner → CHẨN ĐOÁN & sửa on open (the app's last build failed or was
  // interrupted). Claude checks the app runs local + repairs anything missing; a clean run persists
  // status:'ready' so the card's "Lỗi" tag clears. If the app was already fine, it just confirms.
  const diagnoseAndFix = async () => {
    if (localRunning || blockedByOther) return;
    const p =
      'App này đang bị đánh dấu LỖI (lần dựng trước có thể bị GIÁN ĐOẠN hoặc thiếu file). Hãy CHẨN ĐOÁN rồi SỬA: ' +
      'kiểm tra app chạy được local — package.json có script "dev" + đủ dependencies; đủ file khởi động (Vite cần index.html + src/main + src/App + src/index.css); ' +
      'không còn import mồ côi. Nếu thiếu/hỏng thì SỬA cho chạy được; nếu app đã ổn thì xác nhận và KHÔNG đổi gì thừa.';
    setEvents([]);
    setBuildFailed(false);
    setRunning(true);
    setConv((c) => [...c, { role: 'user', content: `Nhờ ${runnerLabel} chẩn đoán & sửa lỗi`, at: new Date().toISOString() }]);
    let ok = true;
    try {
      for await (const ev of runtime.createBuild({ prompt: p, mode: 'build', appId, ...runnerBuildExtras() })) {
        setEvents((prev) => [...prev, ev]);
        if (ev.type === 'error') {
          ok = false;
          message.error(ev.message.replace(/^402:/, ''));
        }
        if (ev.type === 'status' && ev.status === 'failed') ok = false;
      }
    } catch (e) {
      ok = false;
      message.error((e as Error).message);
    } finally {
      setRunning(false);
      setBuildFailed(!ok);
      if (ok) setEvents([]);
      setErrorDismissed(true); // acted on it → don't keep nagging this session
      load();
      notifyAppsChanged();
      setPreviewKey((k) => k + 1);
    }
  };

  /** Open the ".env" config form — fetch the vars the app expects, then show the modal. */
  const openEnvSetup = async () => {
    try {
      const spec = await runtime.readAppEnvSpec?.(appId);
      setEnvKeys(spec?.keys ?? []);
    } catch {
      setEnvKeys([]);
    }
    setEnvOpen(true);
  };

  // "Trợ giúp": a read-only Q&A turn — Claude reads the app + answers, writing
  // nothing (plan mode + ephemeral so it never touches files or the saved chat).
  const askHelp = async () => {
    const q = helpPrompt.trim();
    if (!q || helpRunning) return;
    setHelpPrompt('');
    setHelpMsgs((m) => [
      ...m,
      { role: 'user', content: q, at: new Date().toISOString() },
      { role: 'assistant', content: '', at: new Date().toISOString() },
    ]);
    setHelpRunning(true);
    let answer = '';
    const paint = () =>
      setHelpMsgs((m) => {
        const c = [...m];
        if (c.length) c[c.length - 1] = { ...c[c.length - 1], content: answer || '…' };
        return c;
      });
    try {
      for await (const ev of runtime.createBuild({ prompt: q, mode: 'plan', appId, ephemeral: true, ...runnerBuildExtras({}) })) {
        if (ev.type === 'log' && ev.level === 'info') {
          answer += (answer ? '\n' : '') + ev.message;
          paint();
        } else if (ev.type === 'error') {
          message.error(ev.message.replace(/^402:/, ''));
        }
      }
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      if (!answer) {
        answer = 'Mình chưa có câu trả lời — thử hỏi lại cụ thể hơn nhé.';
        paint();
      }
      setHelpRunning(false);
    }
  };
  // Deploy the app's BACKEND to the Docker server: the main process synthesizes
  // docker-compose with the local Claude (if missing), uploads the source, and we
  // poll status until it's live or fails.
  const runServerDeploy = async () => {
    if (!runtime.deployServer || serverBusy) return;
    setServerOpen(true);
    setServerBusy(true);
    setServerStatus('deploying');
    setServerUrls([]);
    setServerErr(undefined);
    setServerLog('▸ Đang dựng hạ tầng Docker + tải nguồn lên… (có thể vài phút)');
    try {
      const { deployId } = await runtime.deployServer(appId);
      for (let i = 0; i < 260 && aliveRef.current; i += 1) {
        await new Promise((r) => setTimeout(r, 2500));
        if (!aliveRef.current) return;
        const s = await runtime.deployServerStatus!(deployId);
        setServerLog(s.log || '');
        setServerStatus(s.status);
        setServerUrls(s.urls || []);
        if (s.status === 'live' || s.status === 'failed') {
          if (s.status === 'failed') setServerErr(s.error);
          else {
            if (s.urls?.[0]) setShareUrl(s.urls[0]);
            message.success('App đã chạy trên server 🎉');
            notifyAppsChanged(); // live on server → refresh app cards everywhere
          }
          break;
        }
      }
    } catch (e) {
      setServerStatus('failed');
      setServerErr((e as Error).message);
    } finally {
      setServerBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        {onBack && <Button size="small" icon={<ArrowLeftOutlined />} onClick={onBack}>Quay lại</Button>}
        <Title level={5} style={{ margin: 0, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name || appId}
        </Title>
        {shareUrl && (
          <Tag
            color="green"
            style={{ cursor: 'pointer', margin: 0 }}
            onClick={() => (runtime.openExternal ? runtime.openExternal(shareUrl) : window.open(shareUrl, '_blank'))}
            title={shareUrl}
          >
            <LinkOutlined /> Đã xuất bản
          </Tag>
        )}
        <div style={{ flex: 1 }} />
        {runtime.deployServer && (
          <Tooltip title={token ? 'Chạy backend full-stack trên server (Docker) — cần gói Pro+' : 'Đăng nhập tài khoản Larkwave để chạy trên server'}>
            <Button
              icon={<CloudServerOutlined />}
              loading={serverBusy}
              disabled={!token || running || serverBusy}
              onClick={() => void runServerDeploy()}
            >
              Chạy trên Server
            </Button>
          </Tooltip>
        )}
        {runtime.deploy && (
          <Tooltip title={token ? 'Build & xuất bản app lên một URL công khai' : 'Đăng nhập tài khoản Larkwave để xuất bản'}>
            <Button
              type="primary"
              icon={<CloudUploadOutlined />}
              loading={deploying}
              disabled={!token || running}
              onClick={() => void deploy()}
            >
              Xuất bản
            </Button>
          </Tooltip>
        )}
        {(runtime.openAppFolder || runtime.downloadAppZip || runtime.deleteApp || runtime.appHandoffSession) && (
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'summary', icon: <FileTextOutlined />, label: 'Tóm tắt hội thoại', disabled: running || helpRunning, onClick: () => void summarize() },
                ...(runtime.appHandoffSession
                  ? [{ key: 'handoff', icon: <FileTextOutlined />, label: 'Tóm tắt & phiên mới', disabled: running, onClick: () => void doHandoff() }]
                  : []),
                ...(runtime.openAppFolder ? [{ key: 'folder', icon: <FolderOpenOutlined />, label: 'Mở thư mục', onClick: openFolder }] : []),
                ...(runtime.migrateApp
                  ? [{ key: 'migrate', icon: <ApartmentOutlined />, label: 'Cập nhật cấu trúc thư mục', disabled: running || migrating, onClick: doMigrate }]
                  : []),
                ...(runtime.downloadAppZip ? [{ key: 'zip', icon: <DownloadOutlined />, label: 'Tải về .zip', onClick: () => void downloadZip() }] : []),
                ...(runtime.deleteApp ? [{ type: 'divider' as const }, { key: 'del', icon: <DeleteOutlined />, danger: true, label: 'Xoá app', onClick: removeApp }] : []),
              ],
            }}
          >
            <Button icon={<MoreOutlined />} />
          </Dropdown>
        )}
      </div>
      {status === 'error' && !localRunning && !buildFailed && !errorDismissed && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 10, borderRadius: 12 }}
          message="App này đang được đánh dấu LỖI"
          description="Lần dựng trước chưa hoàn tất (thất bại hoặc bị gián đoạn). Bấm để AI tự chẩn đoán và sửa cho chạy được — xong sẽ tự bỏ nhãn “Lỗi”."
          action={
            <Space direction="vertical" size={6}>
              <Button
                size="small"
                type="primary"
                loading={running}
                disabled={blockedByOther}
                onClick={() => void diagnoseAndFix()}
              >
                Chẩn đoán & sửa
              </Button>
              <Button size="small" type="text" onClick={() => setErrorDismissed(true)}>
                Bỏ qua
              </Button>
            </Space>
          }
        />
      )}
      <div
        style={{
          display: 'flex',
          height: '76vh',
          minHeight: 460,
          border: `1px solid ${V.border}`,
          borderRadius: 14,
          overflow: 'hidden',
          background: V.surface,
          position: 'relative',
        }}
      >
        {/* Canvas — up to 4 panes, fills the frame height. */}
        <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 14 }}>
          <WorkspacePanes
            appId={appId}
            refreshKey={previewKey}
            onFix={fixError}
            busy={running}
            onEditEnv={runtime.readAppEnvSpec ? openEnvSetup : undefined}
            runnerLabel={runnerLabel}
            promptPreview={promptPreview}
            promptPreviewLoading={promptPreviewLoading}
            promptDraftHint={prompt.trim() || initialBuild?.prompt?.slice(0, 40)}
            promptOverrides={promptOverrides}
            onPromptOverridesChange={setPromptOverrides}
            onRefreshPromptPreview={() => void refreshPromptPreview()}
            onCodeSaved={() => setPreviewKey((k) => k + 1)}
          />
        </div>
        <WorkspaceDock
          conv={conv}
          loading={loading}
          running={running}
          blockedByOther={blockedByOther}
          blockedLabel={
            blockedSameApp
              ? 'app này (lượt trước chưa xong — bấm Mở khoá nếu treo)'
              : agentOwner?.label || (agentOwner?.kind === 'relay' ? 'một lượt từ điện thoại' : 'tab khác')
          }
          onUnlock={() => void runtime.agentUnlock?.()}
          buildFailed={buildFailed}
          events={events}
          mode={mode}
          onModeChange={setMode}
          prompt={prompt}
          onPromptChange={setPrompt}
          onSend={() => void iterate()}
          onCancel={() => void runtime.cancelBuild?.(appId)}
          chatMode={chatMode}
          onChatModeChange={setChatMode}
          helpMsgs={helpMsgs}
          helpPrompt={helpPrompt}
          onHelpPromptChange={setHelpPrompt}
          onHelpSend={() => void askHelp()}
          helpRunning={helpRunning}
          runnerLabel={runnerLabel}
          onRunnerChange={() => {
            const prefs = desktopRunnerPrefs();
            runtime.runners
              ?.list()
              .then((list) => {
                const r = list.find((x) => x.id === prefs.runner);
                if (r) setRunnerLabel(r.label);
              })
              .catch(() => {});
          }}
          loadSessions={runtime.appSessions ? () => runtime.appSessions!(appId) : undefined}
          loadCheckpoints={runtime.appCheckpoints ? () => runtime.appCheckpoints!(appId) : undefined}
          chatOpen={chatOpen}
          onChatOpenChange={setChatOpen}
          chatW={chatW}
          onChatWChange={setChatW}
          onStartDrag={startChatDrag}
          dragging={draggingChat}
        />
      </div>

      {/* Server (Docker) deploy progress */}
      <Modal
        open={serverOpen}
        onCancel={() => setServerOpen(false)}
        title="Chạy trên Server (Docker)"
        width={640}
        maskClosable={!serverBusy}
        footer={[
          <Button key="close" onClick={() => setServerOpen(false)}>
            Đóng
          </Button>,
        ]}
      >
        <div style={{ marginBottom: 10 }}>
          {serverStatus === 'deploying' && <Tag icon={<LoadingOutlined />} color="processing">Đang triển khai…</Tag>}
          {serverStatus === 'live' && <Tag color="success">✓ Đang chạy</Tag>}
          {serverStatus === 'failed' && <Tag color="error">Lỗi</Tag>}
          <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
            App full-stack được build Docker + chạy thật trên server, có tên miền riêng.
          </Text>
        </div>
        {serverUrls.length > 0 && (
          <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {serverUrls.map((u) => (
              <Typography.Paragraph key={u} copyable={{ text: u }} style={{ margin: 0, fontSize: 13 }}>
                <a onClick={() => (runtime.openExternal ? runtime.openExternal(u) : window.open(u, '_blank'))}>{u}</a>
              </Typography.Paragraph>
            ))}
          </div>
        )}
        {serverErr && (
          <Text type="danger" style={{ fontSize: 12.5, display: 'block', marginBottom: 8 }}>
            {serverErr}
          </Text>
        )}
        <pre
          style={{
            background: '#0F1117',
            color: '#D7DCE5',
            fontSize: 11.5,
            lineHeight: 1.5,
            padding: 12,
            borderRadius: 8,
            maxHeight: 320,
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            margin: 0,
          }}
        >
          {serverLog || 'Đang chuẩn bị…'}
        </pre>
      </Modal>

      {/* Đã xuất bản — controlled Modal (X + Đóng; the old modal.success had no close) */}
      <Modal
        open={publishOpen}
        onCancel={() => setPublishOpen(false)}
        title="Đã xuất bản 🎉"
        width={520}
        footer={[
          <Button key="close" onClick={() => setPublishOpen(false)}>
            Đóng
          </Button>,
          <Button
            key="copy"
            onClick={() => {
              if (shareUrl) {
                try {
                  navigator.clipboard?.writeText(shareUrl);
                  message.success('Đã sao chép liên kết');
                } catch {
                  /* ignore */
                }
              }
            }}
          >
            Sao chép link
          </Button>,
          <Button
            key="open"
            type="primary"
            onClick={() => shareUrl && (runtime.openExternal ? runtime.openExternal(shareUrl) : window.open(shareUrl, '_blank'))}
          >
            Mở trang
          </Button>,
        ]}
      >
        <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
          <div style={{ background: '#fff', padding: 12, borderRadius: 12, boxShadow: '0 6px 20px rgba(17,24,39,0.10)' }}>
            <QRCode value={shareUrl || ''} size={196} bordered={false} />
          </div>
          <div style={{ minWidth: 200, flex: 1 }}>
            <Text type="secondary" style={{ fontSize: 12.5 }}>Quét QR bằng điện thoại, hoặc mở/sao chép liên kết:</Text>
            <Typography.Paragraph copyable={{ text: shareUrl || '' }} style={{ margin: '8px 0 0', wordBreak: 'break-all', fontSize: 13 }}>
              {shareUrl}
            </Typography.Paragraph>
          </div>
        </div>
      </Modal>

      <EnvSetupModal
        open={envOpen}
        appId={appId}
        keys={envKeys}
        onClose={() => setEnvOpen(false)}
        onSaved={() => setPreviewKey((k) => k + 1)}
      />
    </div>
  );
}
