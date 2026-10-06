"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { type Locale } from "@larkwave/ui";
import { useLangT } from "@/lib/useLangT";
import { useAuth } from "@/lib/auth";
import { apiFetch, ApiError } from "@/lib/api";

/** Bộ dịch truyền xuống các hàm ngoài component (timeAgo, describeError). */
type Tr = (k: string, f?: string, v?: Record<string, string | number>) => string;

/** Hình dạng `/v1/blog/:slug/comments` trả về (BlogCommentDto phía API — chưa nằm trong @larkwave/shared). */
interface BlogComment {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  parentId: string | null;
  createdAt: string;
  mine: boolean;
}

/**
 * Kho nháp bình luận gốc, lưu localStorage theo slug. Lý do tồn tại: khách gõ xong mới bị mời
 * đăng nhập, đăng nhập xong quay lại mà mất chữ thì không ai gõ lại lần hai. Là một "store ngoài"
 * đọc qua useSyncExternalStore (snapshot server = "") thay vì setState trong effect — HTML server
 * và client không lệch nhau, và React tự re-render khi có bản nháp.
 */
const draftKey = (slug: string) => `tw_blog_draft:${slug}`;
const draftCache = new Map<string, string>();
const draftListeners = new Set<() => void>();
function readDraft(slug: string): string {
  let v = draftCache.get(slug);
  if (v === undefined) {
    try {
      v = window.localStorage.getItem(draftKey(slug)) ?? "";
    } catch {
      v = ""; // private mode / bị chặn: coi như không có nháp
    }
    draftCache.set(slug, v);
  }
  return v;
}
function writeDraft(slug: string, v: string): void {
  draftCache.set(slug, v);
  try {
    if (v) window.localStorage.setItem(draftKey(slug), v);
    else window.localStorage.removeItem(draftKey(slug));
  } catch {
    /* private mode: nháp chỉ sống trong phiên này */
  }
  draftListeners.forEach((l) => l());
}
function subscribeDraft(l: () => void): () => void {
  draftListeners.add(l);
  return () => {
    draftListeners.delete(l);
  };
}
const emptyDraft = () => "";

function timeAgo(iso: string, t: Tr): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return t("blog.time.now", "vừa xong");
  if (s < 3600) return t("blog.time.min", "{n} phút trước", { n: Math.floor(s / 60) });
  if (s < 86400) return t("blog.time.hour", "{n} giờ trước", { n: Math.floor(s / 3600) });
  if (s < 86400 * 7) return t("blog.time.day", "{n} ngày trước", { n: Math.floor(s / 86400) });
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

/** Màu avatar theo tên: cùng người → cùng màu ở mọi bài, không cần lưu gì. */
function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h} 55% 46%)`;
}

/** Đổi lỗi thành câu người đọc hiểu được và biết làm gì tiếp. */
function describeError(e: unknown, t: Tr): string {
  if (e instanceof ApiError) {
    if (e.statusCode === 401) return t("blog.cmt.err401", "Phiên đăng nhập đã hết hạn. Đăng nhập lại rồi bấm Gửi — nội dung bạn gõ vẫn còn ở đây.");
    if (e.statusCode === 429) return t("blog.cmt.err429", "Bạn gửi hơi nhanh, chờ một chút rồi thử lại.");
    return e.message || t("blog.cmt.errServer", "Máy chủ từ chối yêu cầu.");
  }
  // fetch ném TypeError khi mất mạng / CORS / máy chủ không với tới được.
  return t("blog.cmt.errNet", "Không gửi được — kiểm tra mạng rồi bấm Gửi lại. Nội dung bạn gõ vẫn được giữ.");
}

/**
 * Ô nhập dùng chung cho bình luận gốc và trả lời. `value` do cha giữ: gửi hỏng thì cha KHÔNG xoá,
 * chỉ hiện lỗi — người dùng không mất chữ. Chưa đăng nhập vẫn gõ được (nháp lưu localStorage,
 * đăng nhập xong quay lại còn nguyên); nút Gửi đổi thành lời mời đăng nhập.
 */
function CommentForm({
  value,
  onChange,
  onSubmit,
  onCancel,
  sending,
  error,
  onClearError,
  placeholder,
  autoFocus,
  canWrite,
  authPending,
  loginHref,
  t,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  sending: boolean;
  error: string | null;
  onClearError: () => void;
  placeholder: string;
  autoFocus?: boolean;
  canWrite: boolean;
  authPending: boolean;
  loginHref: string;
  t: Tr;
}) {
  const [focused, setFocused] = useState(false);
  const empty = value.trim().length === 0;
  // Mời đăng nhập khi người ta CHẠM vào ô (focus hoặc đã gõ) — không hiện sẵn cho khách chỉ đọc,
  // và không hiện trong lúc auth còn đang kiểm tra token (tránh nháy "đăng nhập" với người đã vào).
  const askLogin = !canWrite && !authPending && (focused || !empty);

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canWrite && !empty && !sending) onSubmit();
  };

  return (
    <div className="tw-bl-cmt-form">
      <textarea
        className="tw-bl-ta"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={onKey}
        placeholder={placeholder}
        maxLength={4000}
        autoFocus={autoFocus}
        disabled={sending}
        aria-label={placeholder}
      />
      {askLogin && (
        <div className="tw-bl-note">
          <span>{t("blog.cmt.loginNote", "Đăng nhập để gửi bình luận. Nội dung bạn đang gõ sẽ được giữ lại.")}</span>
          <Link href={loginHref}>{t("blog.cmt.login", "Đăng nhập →")}</Link>
        </div>
      )}
      {error && (
        <div className="tw-bl-err" role="alert">
          <span>{error}</span>
          <button type="button" className="tw-bl-link-btn" onClick={onClearError}>
            {t("blog.cmt.close", "Đóng")}
          </button>
        </div>
      )}
      <div className="tw-bl-form-row">
        <span>{value.length > 3500 ? `${value.length}/4000` : t("blog.cmt.hint", "Ctrl + Enter để gửi")}</span>
        <span style={{ display: "flex", gap: 8 }}>
          {onCancel && (
            <button type="button" className="tw-bl-btn tw-bl-btn-ghost" onClick={onCancel} disabled={sending}>
              {t("blog.cmt.cancel", "Huỷ")}
            </button>
          )}
          {canWrite ? (
            <button type="button" className="tw-bl-btn" onClick={onSubmit} disabled={sending || empty}>
              {sending ? t("blog.cmt.sending", "Đang gửi…") : t("blog.cmt.send", "Gửi")}
            </button>
          ) : (
            <Link href={loginHref} className="tw-bl-btn">
              {t("blog.cmt.loginToSend", "Đăng nhập để gửi")}
            </Link>
          )}
        </span>
      </div>
    </div>
  );
}

/**
 * Khối bình luận dưới bài. Đọc công khai (API `GET` là @Public), viết phải đăng nhập, trả lời MỘT
 * cấp (nút "Trả lời" chỉ có ở bình luận gốc; trả lời một trả lời thì gắn vào gốc đó), tự xoá được
 * bình luận của mình.
 *
 * Quyền xoá: API trả cờ `mine`, nhưng GET là route công khai nên guard bỏ qua và `mine` thường là
 * false kể cả với chính chủ — vì vậy client còn so `authorId === user.id`. Chỉ để hiện/ẩn nút;
 * xoá thật vẫn do server kiểm.
 */
export default function BlogComments({ slug, lang }: { slug: string; lang?: Locale }) {
  const t = useLangT(lang);
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<BlogComment[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const draft = useSyncExternalStore(subscribeDraft, () => readDraft(slug), emptyDraft);
  const setDraft = (v: string) => writeDraft(slug, v);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [sending, setSending] = useState<"root" | "reply" | null>(null);
  const [sendErr, setSendErr] = useState<{ where: "root" | "reply"; msg: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [delErr, setDelErr] = useState<string | null>(null);

  const base = `/blog/${encodeURIComponent(slug)}/comments`;
  const loginHref = `/login?next=${encodeURIComponent(`/blog/${slug}#binh-luan`)}`;
  const canWrite = !!user;

  // Tải danh sách. Có token thì gửi kèm (apiFetch tự làm) — vô hại với route công khai.
  useEffect(() => {
    let alive = true;
    apiFetch<BlogComment[]>(base)
      .then((list) => {
        if (alive) setItems(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (alive) setLoadErr(t("blog.cmt.loadErr", "Chưa tải được bình luận."));
      });
    return () => {
      alive = false;
    };
  }, [base, reloadKey]);

  const submit = async (where: "root" | "reply") => {
    const content = (where === "root" ? draft : replyDraft).trim();
    if (!content || sending) return;
    setSending(where);
    setSendErr(null);
    try {
      const c = await apiFetch<BlogComment>(base, {
        method: "POST",
        body: { content, parentId: where === "reply" ? replyTo : null },
      });
      setItems((prev) => [...(prev ?? []), { ...c, mine: true }]);
      // Chỉ xoá ô khi server đã nhận — thất bại thì chữ còn nguyên, chỉ thêm dòng lỗi.
      if (where === "root") setDraft("");
      else {
        setReplyDraft("");
        setReplyTo(null);
      }
    } catch (e) {
      setSendErr({ where, msg: describeError(e, t) });
    } finally {
      setSending(null);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm(t("blog.cmt.confirmDelete", "Xoá bình luận này? Trả lời bên dưới (nếu có) cũng bị xoá."))) return;
    setDeleting(id);
    setDelErr(null);
    try {
      await apiFetch<{ ok: true }>(`${base}/${encodeURIComponent(id)}`, { method: "DELETE" });
      setItems((prev) => (prev ?? []).filter((c) => c.id !== id && c.parentId !== id));
    } catch (e) {
      setDelErr(describeError(e, t));
    } finally {
      setDeleting(null);
    }
  };

  const isMine = (c: BlogComment) => c.mine || (!!user && (c.authorId === user.id || user.role === "admin"));

  const { roots, children } = useMemo(() => {
    const list = [...(items ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const kids = new Map<string, BlogComment[]>();
    const rootList: BlogComment[] = [];
    for (const c of list) {
      if (c.parentId) {
        const arr = kids.get(c.parentId) ?? [];
        arr.push(c);
        kids.set(c.parentId, arr);
      } else rootList.push(c);
    }
    return { roots: rootList, children: kids };
  }, [items]);

  const renderOne = (c: BlogComment, isReply: boolean) => (
    <div key={c.id} className={`tw-bl-cmt${isReply ? " is-reply" : ""}`}>
      <div className="tw-bl-avatar" style={{ background: avatarColor(c.authorName) }} aria-hidden="true">
        {(c.authorName || "?").slice(0, 1).toUpperCase()}
      </div>
      <div className="tw-bl-cmt-main">
        <div className="tw-bl-cmt-head">
          <span className="tw-bl-cmt-name">{c.authorName}</span>
          <time dateTime={c.createdAt}>{timeAgo(c.createdAt, t)}</time>
        </div>
        <p className="tw-bl-cmt-text">{c.content}</p>
        <div className="tw-bl-cmt-acts">
          {!isReply && (
            <button
              type="button"
              className="tw-bl-link-btn"
              onClick={() => {
                setReplyTo(replyTo === c.id ? null : c.id);
                setSendErr(null);
              }}
            >
              {replyTo === c.id ? t("blog.cmt.close", "Đóng") : t("blog.cmt.reply", "Trả lời")}
            </button>
          )}
          {isMine(c) && (
            <button
              type="button"
              className="tw-bl-link-btn is-danger"
              onClick={() => remove(c.id)}
              disabled={deleting === c.id}
            >
              {deleting === c.id ? t("blog.cmt.deleting", "Đang xoá…") : t("blog.cmt.delete", "Xoá")}
            </button>
          )}
        </div>
        {!isReply && replyTo === c.id && (
          <div className="tw-bl-reply-form">
            <CommentForm
              value={replyDraft}
              onChange={setReplyDraft}
              onSubmit={() => submit("reply")}
              onCancel={() => {
                setReplyTo(null);
                setSendErr(null);
              }}
              sending={sending === "reply"}
              error={sendErr?.where === "reply" ? sendErr.msg : null}
              onClearError={() => setSendErr(null)}
              placeholder={t("blog.cmt.replyTo", "Trả lời {name}…", { name: c.authorName })}
              autoFocus
              canWrite={canWrite}
              authPending={authLoading}
              loginHref={loginHref}
              t={t}
            />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <section id="binh-luan" className="tw-bl-cmts" aria-label={t("blog.cmt.title", "Bình luận")}>
      <h2 className="tw-bl-h2">
        {t("blog.cmt.title", "Bình luận")}
        {items && items.length > 0 ? ` (${items.length})` : ""}
      </h2>

      <CommentForm
        value={draft}
        onChange={setDraft}
        onSubmit={() => submit("root")}
        sending={sending === "root"}
        error={sendErr?.where === "root" ? sendErr.msg : null}
        onClearError={() => setSendErr(null)}
        placeholder={t("blog.cmt.placeholder", "Chia sẻ suy nghĩ của bạn về bài viết…")}
        canWrite={canWrite}
        authPending={authLoading}
        loginHref={loginHref}
        t={t}
      />

      {delErr && (
        <div className="tw-bl-err" role="alert" style={{ marginTop: 12 }}>
          <span>{delErr}</span>
          <button type="button" className="tw-bl-link-btn" onClick={() => setDelErr(null)}>
            {t("blog.cmt.close", "Đóng")}
          </button>
        </div>
      )}

      <div className="tw-bl-cmt-list">
        {items === null && !loadErr && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 0" }} aria-busy="true">
            <div className="tw-bl-skel" style={{ width: "40%" }} />
            <div className="tw-bl-skel" style={{ width: "90%" }} />
            <div className="tw-bl-skel" style={{ width: "70%" }} />
          </div>
        )}
        {loadErr && (
          <div className="tw-bl-err">
            <span>{loadErr}</span>
            <button
              type="button"
              className="tw-bl-link-btn"
              onClick={() => {
                // Xoá lỗi Ở ĐÂY (khi người dùng bấm) chứ không trong effect tải lại.
                setLoadErr(null);
                setReloadKey((k) => k + 1);
              }}
            >
              {t("blog.cmt.retry", "Thử lại")}
            </button>
          </div>
        )}
        {items && items.length === 0 && (
          <div className="tw-bl-empty">{t("blog.cmt.empty", "Chưa có bình luận nào. Hãy là người đầu tiên!")}</div>
        )}
        {roots.map((r) => (
          <div key={r.id}>
            {renderOne(r, false)}
            {(children.get(r.id) ?? []).map((k) => renderOne(k, true))}
          </div>
        ))}
      </div>
    </section>
  );
}
