"use client";

import {
  CloudUploadOutlined,
  FileOutlined,
  FolderOpenOutlined,
  ReloadOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import { App, Badge, Button, Empty, Space, Tooltip, Tree, Typography } from "antd";
import type { DataNode } from "antd/es/tree";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { GeneratedFile } from "@larkwave/shared";
import { useI18n } from "@larkwave/ui";
import { api } from "@/lib/api";
import { handleQuotaError } from "@/lib/billing";

const { Text } = Typography;

/**
 * Monaco is browser-only. Lazy-load it with `next/dynamic({ ssr: false })` so it
 * never runs during the production prerender. A lightweight placeholder is shown
 * while the editor chunk loads in the browser.
 */
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "rgba(255,255,255,0.55)",
        background: "#1e1e1e",
      }}
    >
      Đang tải trình soạn thảo…
    </div>
  ),
});

/** Map a file extension to a Monaco language id. */
function monacoLang(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "ts":
      return "typescript";
    case "tsx":
      return "typescript";
    case "js":
    case "cjs":
    case "mjs":
      return "javascript";
    case "jsx":
      return "javascript";
    case "json":
      return "json";
    case "html":
    case "htm":
      return "html";
    case "css":
      return "css";
    case "scss":
    case "sass":
      return "scss";
    case "less":
      return "less";
    case "md":
    case "mdx":
      return "markdown";
    case "yml":
    case "yaml":
      return "yaml";
    case "sh":
    case "bash":
      return "shell";
    case "py":
      return "python";
    case "svg":
    case "xml":
      return "xml";
    case "toml":
      return "ini";
    default:
      return "plaintext";
  }
}

/** Pick a sensible default entry file to show first. */
function pickEntryFile(files: GeneratedFile[]): string {
  const byName = (needle: string) =>
    files.find((f) => f.path.toLowerCase().endsWith(needle.toLowerCase()));
  const candidate =
    byName("src/App.tsx") ||
    byName("App.tsx") ||
    byName("src/main.tsx") ||
    byName("main.tsx") ||
    byName("index.html") ||
    byName("src/index.tsx") ||
    byName("index.tsx") ||
    files[0];
  return candidate?.path ?? "";
}

interface TreeBuildNode {
  children: Map<string, TreeBuildNode>;
  filePath?: string;
}

/** Build an Ant Design Tree from flat paths; mark changed leaves. */
function buildTree(
  files: GeneratedFile[],
  changed: Set<string>,
  changedLabel: string,
): DataNode[] {
  const root: TreeBuildNode = { children: new Map() };

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let cursor = root;
    parts.forEach((part, idx) => {
      let next = cursor.children.get(part);
      if (!next) {
        next = { children: new Map() };
        cursor.children.set(part, next);
      }
      if (idx === parts.length - 1) next.filePath = file.path;
      cursor = next;
    });
  }

  const toNodes = (node: TreeBuildNode, prefix: string): DataNode[] => {
    const entries = Array.from(node.children.entries());
    entries.sort((a, b) => {
      const aIsFolder = a[1].children.size > 0;
      const bIsFolder = b[1].children.size > 0;
      if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1;
      return a[0].localeCompare(b[0]);
    });

    return entries.map(([name, child]) => {
      const key = prefix ? `${prefix}/${name}` : name;
      const isFolder = child.children.size > 0;
      if (isFolder) {
        return {
          title: name,
          key: `dir:${key}`,
          selectable: false,
          icon: <FolderOpenOutlined />,
          children: toNodes(child, key),
        } satisfies DataNode;
      }
      const path = child.filePath ?? key;
      const isChanged = changed.has(path);
      return {
        title: (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span>{name}</span>
            {isChanged && (
              <Badge
                color="#6C5CE7"
                text={
                  <span style={{ fontSize: 10, color: "#6C5CE7" }}>{changedLabel}</span>
                }
              />
            )}
          </span>
        ),
        key: path,
        isLeaf: true,
        icon: <FileOutlined />,
      } satisfies DataNode;
    });
  };

  return toNodes(root, "");
}

function allDirKeys(nodes: DataNode[]): string[] {
  const keys: string[] = [];
  const walk = (ns: DataNode[]) => {
    for (const n of ns) {
      if (n.children?.length) {
        keys.push(String(n.key));
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return keys;
}

export default function CodeEditor({
  appId,
  files,
  onBuildStarted,
}: {
  appId: string;
  files: GeneratedFile[];
  /** Called with the new buildId after a successful "Lưu & Deploy lại". */
  onBuildStarted: (buildId: string) => void;
}) {
  const { t } = useI18n();
  const { message, modal } = App.useApp();
  const router = useRouter();

  // Working copy seeded from the loaded build files. Editing mutates this map.
  const [contents, setContents] = useState<Map<string, string>>(
    () => new Map(files.map((f) => [f.path, f.content])),
  );
  // Original content, used to detect changes + offer "hoàn tác".
  const original = useMemo(
    () => new Map(files.map((f) => [f.path, f.content])),
    [files],
  );

  // Re-seed when the upstream files change (e.g. after a redeploy reloads them).
  useEffect(() => {
    setContents(new Map(files.map((f) => [f.path, f.content])));
  }, [files]);

  const [selected, setSelected] = useState<string>(() => pickEntryFile(files));
  const [saving, setSaving] = useState(false);

  const changed = useMemo(() => {
    const set = new Set<string>();
    for (const [path, content] of contents) {
      if (original.get(path) !== content) set.add(path);
    }
    return set;
  }, [contents, original]);

  const changedBadge = t("comp.misc.ceChangedBadge", "đã sửa");
  const treeData = useMemo(
    () => buildTree(files, changed, changedBadge),
    [files, changed, changedBadge],
  );
  const expandedDefault = useMemo(() => allDirKeys(treeData), [treeData]);

  if (files.length === 0) {
    return (
      <Empty
        description={t("wcomp.ceNoFiles", "Build này chưa có file mã nguồn")}
        style={{ padding: "64px 0" }}
      />
    );
  }

  const currentValue = contents.get(selected) ?? "";
  const isCurrentChanged = changed.has(selected);
  const lineCount = currentValue.split("\n").length;

  const updateCurrent = (value: string) => {
    setContents((prev) => {
      const next = new Map(prev);
      next.set(selected, value);
      return next;
    });
  };

  const revertCurrent = () => {
    const orig = original.get(selected);
    if (orig === undefined) return;
    setContents((prev) => {
      const next = new Map(prev);
      next.set(selected, orig);
      return next;
    });
    message.success(t("wcomp.ceReverted", "Đã hoàn tác file này"));
  };

  const saveAndRedeploy = async () => {
    if (changed.size === 0) return;
    setSaving(true);
    try {
      // Collect ALL files (edited + unchanged) in their original order.
      const payload: GeneratedFile[] = files.map((f) => ({
        path: f.path,
        content: contents.get(f.path) ?? f.content,
      }));
      const res = await api.redeployFiles(appId, payload);
      message.success(t("wcomp.ceSavedBuilding", "Đã lưu — đang build lại…"));
      onBuildStarted(res.buildId);
    } catch (e) {
      // 402 quota exhausted → warn + link to /pricing; keep edited state.
      if (!handleQuotaError(e, modal, () => router.push("/pricing"))) {
        message.error((e as Error).message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text type="secondary" style={{ fontSize: 13 }}>
          {changed.size > 0 ? (
            <>
              <span style={{ color: "#6C5CE7", fontWeight: 600 }}>
                {changed.size}
              </span>{" "}
              {t("wcomp.ceFilesEdited", "file đã chỉnh sửa — chưa deploy")}
            </>
          ) : (
            t("wcomp.ceNoChanges", "Chưa có thay đổi nào")
          )}
        </Text>
        <Button
          type="primary"
          icon={<CloudUploadOutlined />}
          loading={saving}
          disabled={changed.size === 0}
          onClick={saveAndRedeploy}
        >
          {t("wcomp.ceSaveRedeploy", "Lưu & Deploy lại")}
        </Button>
      </div>

      <div
        style={{
          display: "flex",
          gap: 0,
          height: "72vh",
          minHeight: 420,
          border: "1px solid #E5E7F0",
          borderRadius: 12,
          overflow: "hidden",
          background: "#1e1e1e",
          boxShadow: "0 1px 3px rgba(17,24,39,0.06)",
        }}
      >
        {/* File tree (dark IDE panel) */}
        <div
          className="tw-code-tree"
          style={{
            width: "clamp(160px, 32vw, 260px)",
            flexShrink: 0,
            borderRight: "1px solid rgba(255,255,255,0.08)",
            overflow: "auto",
            padding: "10px 8px",
            background: "#15181e",
          }}
        >
          <Text
            style={{
              fontSize: 11,
              padding: "0 8px",
              letterSpacing: 0.5,
              color: "rgba(255,255,255,0.5)",
            }}
          >
            {files.length} FILE
          </Text>
          <Tree
            showIcon
            blockNode
            defaultExpandedKeys={expandedDefault}
            selectedKeys={selected ? [selected] : []}
            treeData={treeData}
            style={{ marginTop: 8, background: "transparent" }}
            onSelect={(keys) => {
              const k = keys[0];
              if (typeof k === "string" && !k.startsWith("dir:")) setSelected(k);
            }}
          />
        </div>

        {/* Editor */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            background: "#1e1e1e",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "8px 14px",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              background: "#15181e",
            }}
          >
            <Text
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 13,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                color: "rgba(255,255,255,0.85)",
              }}
            >
              {selected || t("wcomp.ceSelectFile", "Chọn một file")}
              {isCurrentChanged && (
                <span style={{ color: "#A99BFF", marginLeft: 8, fontSize: 11 }}>
                  {t("wcomp.ceChangedDot", "● đã sửa")}
                </span>
              )}
            </Text>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                flexShrink: 0,
              }}
            >
              <Text
                style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}
              >
                {lineCount} {t("wcomp.ceLines", "dòng")}
              </Text>
              {isCurrentChanged && (
                <Tooltip title={t("wcomp.ceRevertTip", "Hoàn tác file này về bản gốc")}>
                  <Button
                    type="text"
                    size="small"
                    aria-label={t("wcomp.ceRevertTip", "Hoàn tác file này về bản gốc")}
                    icon={<UndoOutlined style={{ color: "rgba(255,255,255,0.6)" }} />}
                    onClick={revertCurrent}
                  />
                </Tooltip>
              )}
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0 }}>
            {selected ? (
              <MonacoEditor
                key={selected}
                height="100%"
                theme="vs-dark"
                language={monacoLang(selected)}
                value={currentValue}
                onChange={(v) => updateCurrent(v ?? "")}
                options={{
                  fontSize: 13,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 2,
                  wordWrap: "off",
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                }}
              />
            ) : (
              <Empty
                description={t("wcomp.ceSelectToEdit", "Chọn một file để chỉnh sửa")}
                style={{ padding: "64px 0" }}
              />
            )}
          </div>
        </div>
      </div>

      <Text type="secondary" style={{ fontSize: 12 }}>
        <ReloadOutlined /> {t("wcomp.ceRefreshHint", "Sau khi build thành công, Preview và mã nguồn sẽ tự làm mới.")}
      </Text>
    </Space>
  );
}
