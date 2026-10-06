"use client";

import {
  CopyOutlined,
  FileOutlined,
  FolderOpenOutlined,
} from "@ant-design/icons";
import { App, Button, Empty, Tooltip, Tree, Typography } from "antd";
import type { DataNode } from "antd/es/tree";
import { useMemo, useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { GeneratedFile } from "@larkwave/shared";
import { useI18n } from "@larkwave/ui";

const { Text } = Typography;

/** Map a file extension to a Prism language id. */
function langFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "ts":
      return "typescript";
    case "tsx":
      return "tsx";
    case "js":
    case "cjs":
    case "mjs":
      return "javascript";
    case "jsx":
      return "jsx";
    case "json":
      return "json";
    case "html":
    case "htm":
      return "markup";
    case "css":
      return "css";
    case "scss":
    case "sass":
      return "scss";
    case "md":
    case "mdx":
      return "markdown";
    case "yml":
    case "yaml":
      return "yaml";
    case "sh":
    case "bash":
      return "bash";
    case "py":
      return "python";
    case "svg":
    case "xml":
      return "markup";
    case "toml":
      return "toml";
    default:
      return "text";
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

/** Build an Ant Design Tree data structure from flat file paths. */
function buildTree(files: GeneratedFile[]): DataNode[] {
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
    // Folders first, then files, both alphabetical.
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
      return {
        title: name,
        key: child.filePath ?? key,
        isLeaf: true,
        icon: <FileOutlined />,
      } satisfies DataNode;
    });
  };

  return toNodes(root, "");
}

/** Keys of all folder nodes — used to expand the tree by default. */
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

export default function CodeBrowser({ files }: { files: GeneratedFile[] }) {
  const { t } = useI18n();
  const { message } = App.useApp();
  const treeData = useMemo(() => buildTree(files), [files]);
  const expandedDefault = useMemo(() => allDirKeys(treeData), [treeData]);
  const [selected, setSelected] = useState<string>(() => pickEntryFile(files));

  const current = files.find((f) => f.path === selected) ?? null;

  if (files.length === 0) {
    return (
      <Empty
        description={t("wcomp.cbNoFiles", "Build này chưa có file mã nguồn")}
        style={{ padding: "64px 0" }}
      />
    );
  }

  const lineCount = current ? current.content.split("\n").length : 0;

  const copyContent = async () => {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(current.content);
      message.success(t("wcomp.cbContentCopied", "Đã sao chép nội dung file"));
    } catch {
      message.error(t("wcomp.cbCopyFailed", "Không sao chép được"));
    }
  };

  return (
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

      {/* Viewer */}
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
            {current?.path ?? t("wcomp.cbSelectFile", "Chọn một file")}
          </Text>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            {current && (
              <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
                {lineCount} {t("wcomp.cbLines", "dòng")}
              </Text>
            )}
            <Tooltip title={t("wcomp.cbCopyContent", "Sao chép nội dung")}>
              <Button
                type="text"
                size="small"
                aria-label={t("wcomp.cbCopyContent", "Sao chép nội dung")}
                icon={<CopyOutlined style={{ color: "rgba(255,255,255,0.6)" }} />}
                onClick={copyContent}
              />
            </Tooltip>
          </div>
        </div>

        <div style={{ flex: 1, overflow: "auto" }}>
          {current ? (
            <SyntaxHighlighter
              language={langFromPath(current.path)}
              style={vscDarkPlus}
              showLineNumbers
              wrapLongLines={false}
              customStyle={{
                margin: 0,
                padding: "14px 16px",
                background: "#1e1e1e",
                fontSize: 13,
                minHeight: "100%",
              }}
              codeTagProps={{
                style: {
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                },
              }}
            >
              {current.content}
            </SyntaxHighlighter>
          ) : (
            <Empty
              description={t("wcomp.cbSelectToView", "Chọn một file để xem")}
              style={{ padding: "64px 0" }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
