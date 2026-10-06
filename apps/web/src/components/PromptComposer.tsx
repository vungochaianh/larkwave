"use client";

import { BgColorsOutlined, DownOutlined, LayoutOutlined, ThunderboltOutlined } from "@ant-design/icons";
import {
  App,
  Button,
  ColorPicker,
  type GetRef,
  Input,
  Segmented,
  Select,
  Space,
  Typography,
} from "antd";
import type { Color } from "antd/es/color-picker";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DEFAULT_MODEL, type ModelChoice, type Track, type UploadRef } from "@larkwave/shared";
import { useI18n } from "@larkwave/ui";
import { api } from "@/lib/api";
import { handleQuotaError } from "@/lib/billing";
import { handlePromptPaste } from "@/lib/pasteToFile";
import { BRAND } from "@/lib/theme";
import AttachFiles, { type AttachFilesHandle } from "@/components/AttachFiles";
import ModelSelector from "@/components/ModelSelector";

const { Text } = Typography;

const { TextArea } = Input;

type TrackChoice = Track | "auto";

const TRACK_OPTIONS: { label: string; value: TrackChoice }[] = [
  { label: "Tự động", value: "auto" },
  { label: "Web", value: "web" },
  { label: "Mobile", value: "mobile" },
  { label: "Extension", value: "extension" },
];

/** Layout/canvas style hints sent to codegen as `style`. 'auto' = unset. */
export const STYLE_OPTIONS: { label: string; value: string }[] = [
  { label: "Tự động", value: "auto" },
  { label: "Dashboard", value: "dashboard" },
  { label: "Landing", value: "landing" },
  { label: "Biểu mẫu", value: "form" },
  { label: "Cửa hàng", value: "store" },
  { label: "Tối giản", value: "minimal" },
];

export default function PromptComposer({
  appId,
  showName = true,
  submitLabel,
  placeholder,
  onCreated,
  compact = false,
  initialPrompt,
  prefill,
  confirmBeforeSubmit,
}: {
  appId?: string;
  showName?: boolean;
  submitLabel?: string;
  placeholder?: string;
  onCreated: (buildId: string, appId: string) => void;
  compact?: boolean;
  /** Prefilled prompt (e.g. from a template via ?prompt= query param). */
  initialPrompt?: string;
  /**
   * Replace the prompt + focus the box whenever `nonce` changes — used by the
   * preview "select element" picker to drop a targeted edit instruction in.
   */
  prefill?: { text: string; nonce: number };
  /**
   * Optional gate run before creating a build. Return false to abort (e.g. an
   * imported app warns that a free-form prompt REGENERATES code from scratch
   * rather than using the imported source).
   */
  confirmBeforeSubmit?: () => Promise<boolean>;
}) {
  const { t } = useI18n();
  const { message, modal } = App.useApp();
  const router = useRouter();
  const finalSubmitLabel = submitLabel ?? t("wcomp.pcCreateApp", "Tạo app");
  const finalPlaceholder =
    placeholder ??
    t(
      "wcomp.pcPlaceholder",
      "Mô tả app bạn muốn tạo… ví dụ: 'Trang quản lý công việc với danh sách, kéo thả và thống kê'",
    );
  const trackOptions = TRACK_OPTIONS.map((o) => ({
    ...o,
    label: t(`wcomp.track.${o.value}`, o.label),
  }));
  const [prompt, setPrompt] = useState(initialPrompt ?? "");
  const [name, setName] = useState("");
  const [track, setTrack] = useState<TrackChoice>("auto");
  const [model, setModel] = useState<ModelChoice>(DEFAULT_MODEL);
  // Optional design options (collapsed by default).
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [primaryColor, setPrimaryColor] = useState<string>(BRAND);
  const [style, setStyle] = useState<string>("auto");
  const [attachments, setAttachments] = useState<UploadRef[]>([]);
  const attachRef = useRef<AttachFilesHandle>(null);
  const taRef = useRef<GetRef<typeof Input.TextArea>>(null);
  const [loading, setLoading] = useState(false);

  // Sync when the incoming initialPrompt changes (e.g. navigating between
  // templates without remounting the composer).
  useEffect(() => {
    if (initialPrompt) setPrompt(initialPrompt);
  }, [initialPrompt]);

  // Element-picker prefill: drop the targeted instruction in + focus so the user
  // just appends what they want changed. Keyed on nonce so repeated picks re-fire.
  useEffect(() => {
    if (!prefill) return;
    setPrompt(prefill.text);
    const ta = taRef.current;
    if (ta) {
      ta.focus();
      // Put the caret at the end (after the templated prefix).
      const el = ta.resizableTextArea?.textArea;
      if (el) el.setSelectionRange(el.value.length, el.value.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.nonce]);

  const submit = async () => {
    const trimmed = prompt.trim();
    if (trimmed.length < 4) {
      message.warning(t("wcomp.pcDescribeMore", "Vui lòng mô tả app chi tiết hơn (tối thiểu 4 ký tự)."));
      return;
    }
    if (confirmBeforeSubmit && !(await confirmBeforeSubmit())) return;
    setLoading(true);
    try {
      const res = await api.createBuild({
        prompt: trimmed,
        ...(showName && name.trim() ? { name: name.trim() } : {}),
        ...(track !== "auto" ? { track } : {}),
        ...(appId ? { appId } : {}),
        model,
        // Only send design hints when the user actually customised them.
        ...(primaryColor.toLowerCase() !== BRAND.toLowerCase()
          ? { primaryColor: primaryColor.toLowerCase() }
          : {}),
        ...(style !== "auto" ? { style } : {}),
        ...(attachments.length ? { attachmentIds: attachments.map((a) => a.id) } : {}),
      });
      message.success(t("wcomp.pcBuildStarted", "Đã khởi tạo build, đang chạy…"));
      setPrompt("");
      setAttachments([]);
      onCreated(res.buildId, res.appId);
    } catch (e) {
      // 402 quota exhausted → warn + link to /pricing; keep composer state.
      if (!handleQuotaError(e, modal, () => router.push("/pricing"))) {
        message.error((e as Error).message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      {showName && (
        <Input
          size="large"
          placeholder={t("wcomp.pcAppName", "Tên app (tuỳ chọn)")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          allowClear
        />
      )}
      <TextArea
        ref={taRef}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={finalPlaceholder}
        // Prevent macOS/Safari password-manager autofill on this prompt field.
        name="tw-app-prompt"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        data-1p-ignore=""
        data-lpignore="true"
        data-form-type="other"
        autoSize={{ minRows: compact ? 3 : 5, maxRows: 12 }}
        style={{ fontSize: 15 }}
        onPaste={(e) => handlePromptPaste(e, (files) => attachRef.current?.addFiles(files))}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void submit();
        }}
      />

      {/* Attach reference files (image mockups, PDF/Office docs, code/spec) for the
          AI. Pasting a screenshot, a file, or a big block of text adds a chip here too. */}
      <AttachFiles ref={attachRef} value={attachments} onChange={setAttachments} disabled={loading} />

      {/* Collapsible "Tùy chọn" — color + layout design hints. */}
      <DesignOptions
        open={optionsOpen}
        onToggle={() => setOptionsOpen((v) => !v)}
        primaryColor={primaryColor}
        onColor={setPrimaryColor}
        style={style}
        onStyle={setStyle}
      />

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 14,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Space direction="vertical" size={10}>
          {/* Loại app is only asked when CREATING a new app — inside an existing
              app (iterate mode) the track is already fixed, so we hide it. */}
          {!appId && (
            <div>
              <span
                style={{
                  fontSize: 12,
                  color: "#6B7280",
                  marginRight: 10,
                }}
              >
                {t("wcomp.pcAppType", "Loại app")}
              </span>
              <Segmented
                options={trackOptions}
                value={track}
                onChange={(v) => setTrack(v as TrackChoice)}
              />
            </div>
          )}
          <ModelSelector value={model} onChange={setModel} />
        </Space>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Button
            type="primary"
            size="large"
            icon={<ThunderboltOutlined />}
            loading={loading}
            onClick={submit}
          >
            {finalSubmitLabel}
          </Button>
        </div>
      </div>
    </Space>
  );
}

/**
 * Compact, collapsible design-options row reused by both the full composer and
 * the slim home CreateBar. Surfaces:
 *   • Màu chủ đạo — AntD ColorPicker (default violet) → `primaryColor`
 *   • Kiểu giao diện — AntD Select → `style`
 */
export function DesignOptions({
  open,
  onToggle,
  primaryColor,
  onColor,
  style,
  onStyle,
  size = "middle",
  hideStyle = false,
}: {
  open: boolean;
  onToggle: () => void;
  primaryColor: string;
  onColor: (hex: string) => void;
  style: string;
  onStyle: (style: string) => void;
  size?: "small" | "middle";
  /** Hide the "Kiểu giao diện" select (when a prominent TemplatePicker is shown). */
  hideStyle?: boolean;
}) {
  const { t } = useI18n();
  const styleOptions = STYLE_OPTIONS.map((o) => ({
    ...o,
    label: t(`wcomp.style.${o.value}`, o.label),
  }));
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "#6B7280",
          fontSize: 12.5,
          fontWeight: 500,
          padding: "2px 0",
        }}
      >
        <BgColorsOutlined style={{ color: "#6C5CE7" }} />
        {t("wcomp.pcOptions", "Tùy chọn")}
        {/* Inline swatch so the chosen accent is visible while collapsed. */}
        <span
          style={{
            display: "inline-block",
            width: 14,
            height: 14,
            borderRadius: 4,
            background: primaryColor,
            border: "1px solid rgba(0,0,0,0.10)",
            verticalAlign: "middle",
          }}
        />
        <DownOutlined
          style={{
            fontSize: 10,
            transition: "transform .15s ease",
            transform: open ? "rotate(180deg)" : "none",
          }}
        />
      </button>

      {open && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 18,
            alignItems: "center",
            marginTop: 12,
            padding: 14,
            borderRadius: 12,
            border: "1px solid #F1F2F7",
            background: "#FBFBFE",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Text type="secondary" style={{ fontSize: 12.5 }}>
              <BgColorsOutlined /> {t("wcomp.pcPrimaryColor", "Màu chủ đạo")}
            </Text>
            <ColorPicker
              value={primaryColor}
              onChange={(c: Color) => onColor(c.toHexString())}
              size={size === "small" ? "small" : "middle"}
              showText={(color) => (
                <span style={{ fontSize: 12 }}>{color.toHexString()}</span>
              )}
              presets={[
                {
                  label: t("wcomp.pcSuggested", "Gợi ý"),
                  colors: [
                    "#6C5CE7",
                    "#16B98D",
                    "#F59E0B",
                    "#EF4444",
                    "#4FB6FF",
                    "#FF7AB6",
                    "#1E2230",
                  ],
                },
              ]}
            />
          </div>

          {!hideStyle && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Text type="secondary" style={{ fontSize: 12.5 }}>
                <LayoutOutlined /> {t("wcomp.pcInterfaceStyle", "Kiểu giao diện")}
              </Text>
              <Select
                size={size === "small" ? "small" : "middle"}
                value={style}
                onChange={onStyle}
                options={styleOptions}
                style={{ minWidth: 150 }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
