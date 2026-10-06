"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
} from "react";
import { useSearchParams } from "next/navigation";
import type { TextAreaRef } from "antd/es/input/TextArea";
import {
  App,
  Avatar,
  Button,
  Card,
  Empty,
  Image,
  Input,
  Progress,
  Skeleton,
  Space,
  Tooltip,
  Typography,
} from "antd";
import {
  CloseOutlined,
  CommentOutlined,
  DeleteOutlined,
  DownloadOutlined,
  FileOutlined,
  HeartFilled,
  HeartOutlined,
  PaperClipOutlined,
  ReloadOutlined,
  SearchOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { BRAND, ERR, V, WARN, tint, useI18n } from "@larkwave/ui";
import { api, type CommunityAttachment, type CommunityComment, type CommunityPost } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const { Title, Text, Paragraph } = Typography;

const MAX_POST = 2_000;
const MAX_COMMENT = 1_000;
/** Trùng với máy chủ: readAttachments cắt ở 8, FileInterceptor chặn ở 20MB. */
const MAX_FILES = 8;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
/** Gõ xong chờ chừng này mới gọi máy chủ — đủ để một cụm phím liền nhau chỉ thành một lượt tìm. */
const SEARCH_DEBOUNCE_MS = 400;

/** "2 phút trước" — mốc thời gian tương đối, vì dòng thời gian đọc theo độ mới chứ không theo ngày. */
function ago(iso: string, t: (k: string, d: string) => string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return t("community.justNow", "vừa xong");
  const units: [number, string, string][] = [
    [60, "community.minutesAgo", "{n} phút trước"],
    [3600, "community.hoursAgo", "{n} giờ trước"],
    [86400, "community.daysAgo", "{n} ngày trước"],
  ];
  for (const [div, key, def] of units) {
    const next = div * 60;
    if (s < next || div === 86400) {
      const n = Math.floor(s / div);
      if (div === 86400 && n > 30) return new Date(iso).toLocaleDateString("vi-VN");
      return t(key, def).replace("{n}", String(n));
    }
  }
  return new Date(iso).toLocaleDateString("vi-VN");
}

/** "1,2 MB" — dung lượng cho thẻ tải về. */
function fmtSize(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

const isImage = (mime: string) => /^image\//i.test(mime);

function Who({ author, when }: { author: CommunityPost["author"]; when: string }) {
  const { t } = useI18n();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
      <Avatar src={author.avatarUrl || undefined} size={36} style={{ flexShrink: 0 }}>
        {author.name.slice(0, 1).toUpperCase()}
      </Avatar>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.3 }}>{author.name}</div>
        <div style={{ fontSize: 12, color: V.textFaint }}>{ago(when, t)}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Đính kèm trên bài đã đăng
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lưới ảnh với Ô CÓ TỈ LỆ CỐ ĐỊNH (`aspect-ratio` + `object-fit: cover`).
 *
 * Nếu để ảnh tự quyết chiều cao thì một ảnh chụp màn hình dọc dài 6000px sẽ chiếm trọn ba màn
 * hình và đẩy cả dòng thời gian đi. Ô cố định cắt bớt ảnh ở thẻ, còn bấm vào thì xem trọn.
 */
function ImageGrid({ images }: { images: CommunityAttachment[] }) {
  const n = images.length;
  // Một ảnh thì cho rộng (16:10), nhiều ảnh thì vuông để lưới đều nhau; hai ảnh chia đôi, còn lại
  // ba cột — ở 380px ba cột vẫn ~110px mỗi ô, đủ nhận ra ảnh.
  const cols = n === 1 ? 1 : n === 2 || n === 4 ? 2 : 3;
  const ratio = n === 1 ? "16 / 10" : "1 / 1";
  return (
    <Image.PreviewGroup>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gap: 4,
          borderRadius: 12,
          overflow: "hidden",
          marginTop: 4,
        }}
      >
        {images.map((img, i) => (
          <div
            key={`${img.url}-${i}`}
            style={{ aspectRatio: ratio, overflow: "hidden", background: V.surfaceAlt, minWidth: 0 }}
          >
            <Image
              src={img.url}
              alt={img.name}
              width="100%"
              height="100%"
              style={{ objectFit: "cover", display: "block" }}
              wrapperStyle={{ width: "100%", height: "100%", display: "block" }}
            />
          </div>
        ))}
      </div>
    </Image.PreviewGroup>
  );
}

/** Tệp không phải ảnh: thẻ tải về có tên + dung lượng. */
function FileCard({ file }: { file: CommunityAttachment }) {
  const { t } = useI18n();
  return (
    <a
      href={file.url}
      target="_blank"
      rel="noopener noreferrer"
      download={file.name}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        borderRadius: 10,
        border: `1px solid ${V.borderSub}`,
        background: V.surfaceAlt,
        color: V.text,
        minWidth: 0,
        textDecoration: "none",
      }}
    >
      <FileOutlined style={{ fontSize: 20, color: BRAND, flexShrink: 0 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {file.name}
        </div>
        <div style={{ fontSize: 12, color: V.textFaint }}>{fmtSize(file.size)}</div>
      </div>
      <Tooltip title={t("community.download", "Tải về")}>
        <DownloadOutlined style={{ color: V.textSub, flexShrink: 0 }} />
      </Tooltip>
    </a>
  );
}

function Attachments({ items }: { items: CommunityAttachment[] }) {
  const images = items.filter((a) => isImage(a.mime));
  const files = items.filter((a) => !isImage(a.mime));
  if (!items.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
      {images.length > 0 && <ImageGrid images={images} />}
      {files.map((f, i) => (
        <FileCard key={`${f.url}-${i}`} file={f} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bình luận lồng một cấp
// ─────────────────────────────────────────────────────────────────────────────

function CommentRow({
  c,
  small,
  onReply,
  onDelete,
}: {
  c: CommunityComment;
  small?: boolean;
  onReply: (c: CommunityComment) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
      <Avatar src={c.author.avatarUrl || undefined} size={small ? 24 : 28} style={{ flexShrink: 0, marginTop: 2 }}>
        {c.author.name.slice(0, 1).toUpperCase()}
      </Avatar>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ background: V.surfaceAlt, borderRadius: 12, padding: "8px 12px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
            <span style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {c.author.name}
            </span>
            <span style={{ fontSize: 11.5, color: V.textFaint, flexShrink: 0 }}>{ago(c.createdAt, t)}</span>
            {c.canDelete && (
              <Button
                type="text"
                size="small"
                icon={<DeleteOutlined />}
                onClick={() => onDelete(c.id)}
                style={{ marginLeft: "auto", color: V.textFaint }}
                aria-label={t("common.delete", "Xoá")}
              />
            )}
          </div>
          <div style={{ fontSize: 13.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{c.content}</div>
        </div>
        <Button
          type="link"
          size="small"
          onClick={() => onReply(c)}
          style={{ padding: "0 4px", height: 22, fontSize: 12, color: V.textSub }}
        >
          {t("community.reply", "Trả lời")}
        </Button>
      </div>
    </div>
  );
}

/**
 * Khối bình luận của một bài — chỉ tải khi người dùng mở ra.
 *
 * Máy chủ trả DANH SÁCH PHẲNG có `parentId`; cây gom ở đây. Chỉ một cấp: trả lời một trả lời thì
 * máy chủ đã gắn lên cha, nên giao diện cũng nhắm sẵn vào cha để chip "Đang trả lời" nói đúng
 * chỗ bình luận sẽ hiện ra.
 */
function Comments({ postId, onCountChange }: { postId: string; onCountChange: (n: number) => void }) {
  const { t } = useI18n();
  const { message } = App.useApp();
  const [items, setItems] = useState<CommunityComment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const inputRef = useRef<TextAreaRef | null>(null);

  useEffect(() => {
    let alive = true;
    void api
      .communityComments(postId)
      .then((r) => alive && setItems(r))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [postId]);

  const tree = useMemo(() => {
    const list = items ?? [];
    const ids = new Set(list.map((c) => c.id));
    // Cha không còn trong danh sách (dữ liệu lệch) thì coi như gốc — thà hiện sai chỗ còn hơn mất.
    const roots = list.filter((c) => !c.parentId || !ids.has(c.parentId));
    const replies = new Map<string, CommunityComment[]>();
    for (const c of list) {
      if (c.parentId && ids.has(c.parentId)) {
        const arr = replies.get(c.parentId) ?? [];
        arr.push(c);
        replies.set(c.parentId, arr);
      }
    }
    return { roots, replies };
  }, [items]);

  const startReply = (c: CommunityComment) => {
    setReplyTo({ id: c.parentId ?? c.id, name: c.author.name });
    inputRef.current?.focus();
  };

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    try {
      const c = await api.communityAddComment(postId, text, replyTo?.id ?? null);
      setItems((prev) => {
        const next = [...(prev ?? []), c];
        onCountChange(next.length);
        return next;
      });
      setDraft("");
      setReplyTo(null);
    } catch (e) {
      message.error((e as Error)?.message || t("community.commentFailed", "Chưa gửi được bình luận."));
    } finally {
      setSending(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await api.communityDeleteComment(id);
      setItems((prev) => {
        // Máy chủ xoá cả nhánh trả lời (onDelete: Cascade) — giao diện cũng phải bỏ chúng đi.
        const next = (prev ?? []).filter((c) => c.id !== id && c.parentId !== id);
        onCountChange(next.length);
        return next;
      });
      if (replyTo?.id === id) setReplyTo(null);
    } catch (e) {
      message.error((e as Error)?.message || t("community.deleteFailed", "Chưa xoá được."));
    }
  };

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${V.borderSub}` }}>
      {items === null ? (
        <Skeleton active paragraph={{ rows: 1 }} />
      ) : (
        tree.roots.map((root) => (
          <div key={root.id}>
            <CommentRow c={root} onReply={startReply} onDelete={(id) => void remove(id)} />
            {(tree.replies.get(root.id) ?? []).length > 0 && (
              // Thụt đúng một bậc (rộng avatar + khoảng cách), có vạch dọc để mắt bám vào nhánh.
              <div style={{ marginLeft: 38, paddingLeft: 10, borderLeft: `2px solid ${V.borderSub}` }}>
                {(tree.replies.get(root.id) ?? []).map((r) => (
                  <CommentRow key={r.id} c={r} small onReply={startReply} onDelete={(id) => void remove(id)} />
                ))}
              </div>
            )}
          </div>
        ))
      )}

      {replyTo && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: BRAND,
            background: tint(BRAND),
            borderRadius: 999,
            padding: "2px 6px 2px 10px",
            marginBottom: 6,
            maxWidth: "100%",
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {t("community.replyingTo", "Đang trả lời {name}", { name: replyTo.name })}
          </span>
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined style={{ fontSize: 10 }} />}
            onClick={() => setReplyTo(null)}
            style={{ width: 20, height: 20, minWidth: 20, color: BRAND }}
            aria-label={t("common.cancel", "Huỷ")}
          />
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <Input.TextArea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            replyTo
              ? t("community.replyPlaceholder", "Viết trả lời…")
              : t("community.commentPlaceholder", "Viết bình luận…")
          }
          autoSize={{ minRows: 1, maxRows: 4 }}
          maxLength={MAX_COMMENT}
          onPressEnter={(e) => {
            // Enter gửi, Shift+Enter xuống dòng — thói quen của mọi ô bình luận.
            if (!e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <Button type="primary" loading={sending} onClick={() => void send()} disabled={!draft.trim()}>
          {t("community.send", "Gửi")}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Thẻ bài đăng
// ─────────────────────────────────────────────────────────────────────────────

function PostCard({
  post,
  onDeleted,
}: {
  post: CommunityPost;
  onDeleted: (id: string) => void;
}) {
  const { t } = useI18n();
  const { message, modal } = App.useApp();
  const [liked, setLiked] = useState(post.likedByMe);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const [open, setOpen] = useState(false);

  const like = async () => {
    // Đổi ngay trên giao diện rồi mới gọi máy chủ: một lượt thích không đáng để chờ mạng. Hỏng
    // thì trả về đúng số của máy chủ chứ không đoán.
    const before = { liked, likeCount };
    setLiked(!liked);
    setLikeCount(likeCount + (liked ? -1 : 1));
    try {
      const r = await api.communityLike(post.id);
      setLiked(r.liked);
      setLikeCount(r.likeCount);
    } catch {
      setLiked(before.liked);
      setLikeCount(before.likeCount);
    }
  };

  const remove = () => {
    modal.confirm({
      title: t("community.deletePostTitle", "Xoá bài đăng này?"),
      content: t("community.deletePostBody", "Bài và toàn bộ bình luận sẽ mất hẳn."),
      okText: t("common.delete", "Xoá"),
      okButtonProps: { danger: true },
      cancelText: t("common.cancel", "Huỷ"),
      onOk: async () => {
        try {
          await api.communityDelete(post.id);
          onDeleted(post.id);
        } catch (e) {
          message.error((e as Error)?.message || t("community.deleteFailed", "Chưa xoá được."));
        }
      },
    });
  };

  return (
    <Card style={{ borderRadius: 14, marginBottom: 12 }} styles={{ body: { padding: 16 } }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <Who author={post.author} when={post.createdAt} />
        {post.canDelete && (
          <Button
            type="text"
            size="small"
            icon={<DeleteOutlined />}
            onClick={remove}
            style={{ marginLeft: "auto", color: V.textFaint }}
            aria-label={t("common.delete", "Xoá")}
          />
        )}
      </div>

      {post.content && (
        <Paragraph
          style={{ margin: "10px 0 8px", fontSize: 14.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}
        >
          {post.content}
        </Paragraph>
      )}
      {/* Bài chỉ có ảnh: không có đoạn chữ thì tự chừa khoảng cách với phần tên. */}
      {!post.content && <div style={{ height: 10 }} />}

      <Attachments items={post.attachments ?? []} />

      <Space size={4}>
        <Tooltip title={liked ? t("community.unlike", "Bỏ thích") : t("community.like", "Thích")}>
          <Button
            type="text"
            size="small"
            onClick={() => void like()}
            icon={liked ? <HeartFilled style={{ color: ERR }} /> : <HeartOutlined />}
            style={{ color: liked ? ERR : V.textSub }}
          >
            {likeCount || ""}
          </Button>
        </Tooltip>
        <Button
          type="text"
          size="small"
          icon={<CommentOutlined />}
          onClick={() => setOpen((o) => !o)}
          style={{ color: V.textSub }}
        >
          {commentCount || ""}
        </Button>
      </Space>

      {open && <Comments postId={post.id} onCountChange={setCommentCount} />}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Ô soạn bài + đính kèm
// ─────────────────────────────────────────────────────────────────────────────

type PendingStatus = "uploading" | "done" | "error";

/** Một tệp đang trên đường lên máy chủ (hoặc đã lên / đã hỏng). */
interface Pending {
  key: string;
  file: File;
  /** Object URL để xem trước ảnh — phải revoke khi bỏ, nếu không rò bộ nhớ mỗi lần chọn ảnh. */
  previewUrl: string | null;
  progress: number;
  status: PendingStatus;
  error?: string;
  result?: CommunityAttachment;
  abort?: AbortController;
}

let pendingSeq = 0;

function Composer({ onPosted }: { onPosted: (p: CommunityPost) => void }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { message } = App.useApp();
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  // Đếm lồng dragenter/dragleave: rời sang phần tử con cũng bắn dragleave, đếm để không nháy viền.
  const dragDepth = useRef(0);
  // Bản sao mới nhất của `pending` cho các callback (addFiles, dọn khi unmount) — cập nhật trong
  // effect chứ không phải lúc render, vì ref không phải thứ để render đọc.
  const pendingRef = useRef<Pending[]>([]);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  // Revoke mọi object URL khi rời trang — chúng sống theo document, không theo React.
  useEffect(
    () => () => {
      for (const p of pendingRef.current) if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
    },
    [],
  );

  const patch = (key: string, upd: Partial<Pending>) =>
    setPending((prev) => prev.map((p) => (p.key === key ? { ...p, ...upd } : p)));

  /** Tải một mục; gọi lại được khi bấm "Thử lại". */
  const upload = useCallback(
    async (entry: Pending) => {
      const abort = new AbortController();
      patch(entry.key, { status: "uploading", progress: 0, error: undefined, abort });
      try {
        const result = await api.communityUpload(
          entry.file,
          (f) => patch(entry.key, { progress: Math.round(f * 100) }),
          abort.signal,
        );
        patch(entry.key, { status: "done", progress: 100, result, abort: undefined });
      } catch (e) {
        // Hỏng thì GIỮ mục lại với lý do — người dùng chọn thử lại hay gỡ; các tệp khác không
        // bị liên luỵ.
        if (abort.signal.aborted) return;
        patch(entry.key, {
          status: "error",
          error: (e as Error)?.message || t("community.uploadFailed", "Tải lên hỏng"),
          abort: undefined,
        });
      }
    },
    [t],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      if (!files.length) return;
      const room = MAX_FILES - pendingRef.current.length;
      if (room <= 0) {
        message.warning(t("community.attachLimit", "Tối đa {n} tệp một bài.", { n: MAX_FILES }));
        return;
      }
      const accepted: Pending[] = [];
      for (const f of files) {
        if (accepted.length >= room) {
          message.warning(t("community.attachLimit", "Tối đa {n} tệp một bài.", { n: MAX_FILES }));
          break;
        }
        if (f.size > MAX_FILE_BYTES) {
          message.warning(t("community.attachTooBig", "{name} quá 20MB.", { name: f.name }));
          continue;
        }
        accepted.push({
          key: `f${++pendingSeq}`,
          file: f,
          previewUrl: isImage(f.type) ? URL.createObjectURL(f) : null,
          progress: 0,
          status: "uploading",
        });
      }
      if (!accepted.length) return;
      setPending((prev) => [...prev, ...accepted]);
      for (const p of accepted) void upload(p);
    },
    [message, t, upload],
  );

  const removePending = (key: string) => {
    setPending((prev) => {
      const hit = prev.find((p) => p.key === key);
      hit?.abort?.abort();
      if (hit?.previewUrl) URL.revokeObjectURL(hit.previewUrl);
      return prev.filter((p) => p.key !== key);
    });
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    addFiles(Array.from(e.dataTransfer?.files ?? []));
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    // Dán ảnh chụp màn hình: clipboard có item kind=file. Dán chữ thường thì để mặc định.
    const files = Array.from(e.clipboardData?.items ?? [])
      .filter((it) => it.kind === "file")
      .map((it) => it.getAsFile())
      .filter((f): f is File => !!f);
    if (files.length) {
      e.preventDefault();
      addFiles(files);
    }
  };

  const uploading = pending.some((p) => p.status === "uploading");
  const failed = pending.some((p) => p.status === "error");
  const ready = pending.filter((p) => p.status === "done" && p.result).map((p) => p.result!);
  const canPost = !posting && !uploading && !failed && (draft.trim().length > 0 || ready.length > 0);

  const publish = async () => {
    if (!canPost) return;
    setPosting(true);
    try {
      const p = await api.communityCreate(draft.trim(), ready);
      onPosted(p);
      setDraft("");
      for (const it of pending) if (it.previewUrl) URL.revokeObjectURL(it.previewUrl);
      setPending([]);
    } catch (e) {
      message.error((e as Error)?.message || t("community.postFailed", "Chưa đăng được bài."));
    } finally {
      setPosting(false);
    }
  };

  return (
    <Card
      style={{
        borderRadius: 14,
        marginBottom: 18,
        // Viền đổi màu khi đang kéo tệp vào — không có tín hiệu này thì người ta không biết thả
        // ở đâu.
        borderColor: dragging ? BRAND : undefined,
        background: dragging ? tint(BRAND, "0d") : undefined,
        transition: "border-color .15s, background .15s",
      }}
      styles={{ body: { padding: 16 } }}
      onDragEnter={(e) => {
        e.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <div style={{ display: "flex", gap: 10 }}>
        <Avatar src={user?.avatarUrl || undefined} size={36} style={{ flexShrink: 0 }}>
          {(user?.name || user?.email || "?").slice(0, 1).toUpperCase()}
        </Avatar>
        <Input.TextArea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPaste={onPaste}
          placeholder={t("community.placeholder", "Bạn đang nghĩ gì?")}
          autoSize={{ minRows: 2, maxRows: 8 }}
          maxLength={MAX_POST}
          variant="borderless"
          style={{ fontSize: 15, padding: "4px 0" }}
        />
      </div>

      {pending.length > 0 && (
        <div
          style={{
            display: "grid",
            // Ô ~96px, tự xuống hàng: ở 380px được 3 ô một hàng, đủ thấy 8 ô trong 3 hàng.
            gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))",
            gap: 8,
            marginTop: 10,
          }}
        >
          {pending.map((p) => (
            <div
              key={p.key}
              title={p.error || p.file.name}
              style={{
                position: "relative",
                aspectRatio: "1 / 1",
                borderRadius: 10,
                overflow: "hidden",
                background: V.surfaceAlt,
                border: `1px solid ${p.status === "error" ? ERR : V.borderSub}`,
              }}
            >
              {p.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- object URL cục bộ, không qua tối ưu ảnh
                <img
                  src={p.previewUrl}
                  alt={p.file.name}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                    opacity: p.status === "done" ? 1 : 0.55,
                  }}
                />
              ) : (
                <div
                  style={{
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    padding: 8,
                    color: V.textSub,
                  }}
                >
                  <FileOutlined style={{ fontSize: 22, color: BRAND }} />
                  <div
                    style={{
                      fontSize: 11,
                      width: "100%",
                      textAlign: "center",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.file.name}
                  </div>
                  <div style={{ fontSize: 10.5, color: V.textFaint }}>{fmtSize(p.file.size)}</div>
                </div>
              )}

              {p.status === "uploading" && (
                <div style={{ position: "absolute", left: 8, right: 8, bottom: 6 }}>
                  <Progress percent={p.progress} size="small" showInfo={false} strokeColor={BRAND} />
                </div>
              )}
              {p.status === "error" && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    background: tint(ERR, "22"),
                    color: ERR,
                    fontSize: 11,
                    fontWeight: 600,
                    textAlign: "center",
                    padding: 6,
                  }}
                >
                  <span>{t("community.uploadFailed", "Tải lên hỏng")}</span>
                  <Button size="small" icon={<ReloadOutlined />} onClick={() => void upload(p)}>
                    {t("community.uploadRetry", "Thử lại")}
                  </Button>
                </div>
              )}
              <Button
                size="small"
                shape="circle"
                icon={<CloseOutlined style={{ fontSize: 10 }} />}
                onClick={() => removePending(p.key)}
                aria-label={t("common.delete", "Xoá")}
                style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  width: 22,
                  height: 22,
                  minWidth: 22,
                  background: V.surface,
                  borderColor: V.border,
                  color: V.textSub,
                }}
              />
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 8,
          flexWrap: "wrap",
        }}
      >
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []));
            // Xoá giá trị để chọn lại CÙNG một tệp vẫn bắn onChange.
            e.target.value = "";
          }}
        />
        <Tooltip title={t("community.attachHint", "Kéo thả, dán ảnh, hoặc bấm để chọn — tối đa {n} tệp, 20MB mỗi tệp.", { n: MAX_FILES })}>
          <Button
            icon={<PaperClipOutlined />}
            onClick={() => fileInput.current?.click()}
            disabled={pending.length >= MAX_FILES}
            style={{ color: V.textSub }}
          >
            {t("community.attach", "Đính kèm")}
            {pending.length > 0 && ` ${pending.length}/${MAX_FILES}`}
          </Button>
        </Tooltip>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          <Text style={{ fontSize: 12, color: draft.length > MAX_POST - 100 ? WARN : V.textFaint }}>
            {draft.length}/{MAX_POST}
          </Text>
          <Button type="primary" loading={posting} disabled={!canPost} onClick={() => void publish()}>
            {uploading ? t("community.uploading", "Đang tải…") : t("community.post", "Đăng")}
          </Button>
        </div>
      </div>
      {(uploading || failed) && (
        <Text style={{ fontSize: 12, color: failed ? ERR : V.textFaint, display: "block", marginTop: 6 }}>
          {t("community.waitUploads", "Chờ tải xong hoặc gỡ tệp lỗi rồi mới đăng được.")}
        </Text>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Trang
// ─────────────────────────────────────────────────────────────────────────────

/**
 * "Cộng đồng" — dòng thời gian bài đăng ngắn kiểu Threads: viết, thích, bình luận.
 *
 * Phân trang bằng CON TRỎ chứ không phải số trang: dòng thời gian luôn có bài mới chèn lên đầu,
 * nên trang-số-2 tính theo offset sẽ lặp lại hoặc bỏ sót bài mỗi khi có người đăng giữa chừng.
 *
 * Từ khoá tìm kiếm sống trong URL (`?q=`) chứ không trong state: dán link là người kia thấy đúng
 * kết quả, và Back/Forward đi qua các lượt tìm như đi qua các trang. Ô nhập chỉ là bản nháp của
 * URL — gõ xong một nhịp mới đẩy vào URL, và URL đổi mới gọi máy chủ.
 */
function CommunityPageInner() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const q = (searchParams.get("q") ?? "").trim();
  /**
   * Kết quả gắn với TỪ KHOÁ đã tải nó. "Đang tải" không phải một cờ riêng mà suy ra từ
   * `feed.q !== q`: URL vừa đổi thì kết quả cũ tự thành lỗi thời, không cần effect nào xoá nó —
   * và một phản hồi chậm của từ khoá cũ về sau cũng bị bỏ vì không khớp `q` hiện tại.
   */
  const [feed, setFeed] = useState<{ q: string; items: CommunityPost[] | null; cursor: string | null }>({
    q,
    items: null,
    cursor: null,
  });
  const posts = feed.q === q ? feed.items : null;
  const cursor = feed.q === q ? feed.cursor : null;
  const [loadingMore, setLoadingMore] = useState(false);
  const [qInput, setQInput] = useState(q);
  // Từ khoá ta tự đẩy vào URL gần nhất — để debounce không đẩy lại thứ đã có.
  const committed = useRef(q);

  useEffect(() => {
    let alive = true;
    void api
      .communityFeed(undefined, q || undefined)
      .then((r) => alive && setFeed({ q, items: r.items, cursor: r.nextCursor }))
      .catch(() => alive && setFeed({ q, items: [], cursor: null }));
    return () => {
      alive = false;
    };
  }, [q]);

  // Back/Forward đổi URL từ bên ngoài → đọc lại `?q=` vào ô nhập. Lắng nghe popstate trực tiếp
  // thay vì "khi searchParams đổi thì setState": đây là đăng ký một hệ thống ngoài, đúng việc của
  // effect. (Next tự đồng bộ useSearchParams với cùng sự kiện này, nên dòng thời gian tải lại.)
  useEffect(() => {
    const onPop = () => {
      const fromUrl = (new URL(window.location.href).searchParams.get("q") ?? "").trim();
      committed.current = fromUrl;
      setQInput(fromUrl);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Gõ xong chờ một nhịp rồi mới ghi vào URL. pushState (không phải replace) để mỗi lượt tìm là
  // một mục lịch sử — Back về đúng lượt trước. Next đồng bộ useSearchParams với history gốc.
  useEffect(() => {
    const next = qInput.trim();
    if (next === committed.current) return;
    const h = setTimeout(() => {
      committed.current = next;
      const url = new URL(window.location.href);
      if (next) url.searchParams.set("q", next);
      else url.searchParams.delete("q");
      window.history.pushState(null, "", url.toString());
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(h);
  }, [qInput]);

  const more = async () => {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const r = await api.communityFeed(cursor, q || undefined);
      setFeed((prev) =>
        // Đổi từ khoá giữa chừng thì trang này thuộc về kết quả cũ — bỏ.
        prev.q !== q ? prev : { ...prev, items: [...(prev.items ?? []), ...r.items], cursor: r.nextCursor },
      );
    } catch {
      /* im lặng: còn bài cũ vẫn đọc được */
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "4px 0 32px" }}>
      <Space align="center" style={{ marginBottom: 4 }}>
        <TeamOutlined style={{ fontSize: 22, color: BRAND }} />
        <Title level={3} style={{ margin: 0 }}>
          {t("community.title", "Cộng đồng")}
        </Title>
      </Space>
      <Text type="secondary" style={{ fontSize: 13.5, display: "block", marginBottom: 18 }}>
        {t("community.subtitle", "Chia sẻ điều bạn đang làm, hỏi han và góp ý cho nhau.")}
      </Text>

      <Composer onPosted={(p) => setFeed((prev) => ({ ...prev, items: [p, ...(prev.items ?? [])] }))} />

      <Input
        value={qInput}
        onChange={(e) => setQInput(e.target.value)}
        allowClear
        prefix={<SearchOutlined style={{ color: V.textFaint }} />}
        placeholder={t("community.searchPlaceholder", "Tìm bài hoặc người đăng…")}
        maxLength={100}
        style={{ borderRadius: 999, marginBottom: 12 }}
        aria-label={t("community.searchPlaceholder", "Tìm bài hoặc người đăng…")}
      />

      {posts === null ? (
        [0, 1, 2].map((i) => (
          <Card key={i} style={{ borderRadius: 14, marginBottom: 12 }}>
            <Skeleton active avatar paragraph={{ rows: 2 }} />
          </Card>
        ))
      ) : posts.length === 0 ? (
        <Card style={{ borderRadius: 14 }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              q
                ? t("community.searchEmpty", 'Không có bài nào khớp "{q}".', { q })
                : t("community.empty", "Chưa có bài nào — viết bài đầu tiên đi!")
            }
          >
            {q && (
              <Button onClick={() => setQInput("")}>{t("community.clearSearch", "Xoá tìm kiếm")}</Button>
            )}
          </Empty>
        </Card>
      ) : (
        <>
          {posts.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              onDeleted={(id) =>
                setFeed((prev) => ({ ...prev, items: (prev.items ?? []).filter((x) => x.id !== id) }))
              }
            />
          ))}
          {cursor && (
            <div style={{ textAlign: "center", marginTop: 8 }}>
              <Button loading={loadingMore} onClick={() => void more()}>
                {t("community.loadMore", "Xem thêm")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** useSearchParams phải nằm dưới một Suspense (App Router) — không thì build tĩnh từ chối. */
export default function CommunityPage() {
  return (
    <Suspense fallback={null}>
      <CommunityPageInner />
    </Suspense>
  );
}
