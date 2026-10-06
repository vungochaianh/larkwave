"use client";

import {
  CheckCircleFilled,
  CopyOutlined,
  DownloadOutlined,
  LinkOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  Collapse,
  Image as AntImage,
  Space,
  Tag,
  Typography,
} from "antd";
import type { BuildResult, Track } from "@larkwave/shared";
import { useI18n } from "@larkwave/ui";

const { Paragraph, Text, Title } = Typography;

export default function ResultCard({
  result,
  track,
}: {
  result: BuildResult;
  track?: Track | null;
}) {
  const { t } = useI18n();
  const { message } = App.useApp();
  const url = result.url || result.previewUrl;

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      message.success(t("wcomp.rsLinkCopied", "Đã sao chép liên kết"));
    } catch {
      message.error(t("wcomp.rsCopyFailed", "Không sao chép được"));
    }
  };

  return (
    <Card
      style={{
        borderColor: "rgba(22,185,141,0.35)",
        background:
          "linear-gradient(180deg, rgba(22,185,141,0.07), rgba(255,255,255,0))",
      }}
    >
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <Space align="center">
          <CheckCircleFilled style={{ color: "#16B98D", fontSize: 26 }} />
          <Title level={4} style={{ margin: 0 }}>
            {t("wcomp.rsAppReady", "App của bạn đã sẵn sàng!")}
          </Title>
        </Space>

        {/* Bản sao từ URL: nói thẳng độ giống. Không có dòng này thì một bản sao 40% trông vẫn
            "được", và người dùng chỉ phát hiện khi tự mở hai tab ra so — phần lớn sẽ không làm. */}
        {!!result.fidelity && (
          <Alert
            type={result.fidelity.score >= 75 ? "success" : "warning"}
            showIcon
            style={{ borderRadius: 12 }}
            message={t("wcomp.rsFidelity", "Độ giống trang gốc ~{n}%", {
              n: String(result.fidelity.score),
            })}
            description={
              <div style={{ fontSize: 12.5 }}>
                {(() => {
                  const f = result.fidelity!;
                  const bits: string[] = [];
                  if (f.contentPct < 100)
                    bits.push(t("wcomp.rsFidHeadings", "giữ được {n}% nội dung", { n: String(f.contentPct) }));
                  if (f.dstTables < f.srcTables)
                    bits.push(t("wcomp.rsFidTables", "thiếu {n}/{m} bảng", { n: String(f.srcTables - f.dstTables), m: String(f.srcTables) }));
                  if (f.heightPct < 80)
                    bits.push(t("wcomp.rsFidShort", "nội dung ngắn hơn bản gốc ({n}%)", { n: String(f.heightPct) }));
                  if (f.invented.length)
                    bits.push(t("wcomp.rsFidInvented", "thừa mục không có ở trang gốc: {list}", { list: f.invented.slice(0, 4).join(", ") }));
                  return bits.length
                    ? `${bits.join(" · ")}. ${t("wcomp.rsFidHint", "Nhắn cho AI phần còn thiếu để nó bổ sung.")}`
                    : t("wcomp.rsFidOk", "Đủ mục, đủ bảng, không thừa menu.");
                })()}
              </div>
            }
          />
        )}

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 24,
            alignItems: "flex-start",
          }}
        >
          <div style={{ flex: "1 1 320px", minWidth: 0 }}>
            {url ? (
              <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                <div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {t("wcomp.rsDirectLink", "Liên kết trực tiếp")}
                  </Text>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginTop: 4,
                    }}
                  >
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        fontSize: 16,
                        fontWeight: 600,
                        wordBreak: "break-all",
                      }}
                    >
                      {url}
                    </a>
                  </div>
                </div>
                <Space wrap>
                  <Button
                    type="primary"
                    icon={<LinkOutlined />}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("wcomp.rsOpenApp", "Mở app")}
                  </Button>
                  <Button
                    icon={<CopyOutlined />}
                    onClick={() => copy(url)}
                  >
                    {t("wcomp.rsCopyLink", "Sao chép liên kết")}
                  </Button>
                  {result.repoUrl && (
                    <Button
                      icon={<LinkOutlined />}
                      href={result.repoUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t("wcomp.rsSourceCode", "Mã nguồn")}
                    </Button>
                  )}
                  {result.artifactPath && (
                    <Tag icon={<DownloadOutlined />} color="purple">
                      Artifact: {result.artifactPath}
                    </Tag>
                  )}
                </Space>
              </Space>
            ) : (
              <Text type="secondary">
                {t("wcomp.rsBuildDoneGuide", "Build hoàn tất. Xem hướng dẫn / artifact bên dưới.")}
              </Text>
            )}

            {(track === "mobile" || track === "extension") && (
              <Paragraph
                type="secondary"
                style={{ marginTop: 16, marginBottom: 0, fontSize: 13 }}
              >
                {track === "mobile"
                  ? t("wcomp.rsMobileHint", "Quét mã QR bằng ứng dụng Expo Go để chạy bản preview trên iOS/Android.")
                  : t("wcomp.rsExtHint", "Tải artifact ZIP và làm theo HUONG-DAN-CAI-DAT.md để cài đặt extension.")}
              </Paragraph>
            )}
          </div>

          {result.qr && (
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  padding: 10,
                  background: "#fff",
                  borderRadius: 12,
                  display: "inline-block",
                }}
              >
                <AntImage
                  src={result.qr}
                  alt="QR"
                  width={160}
                  height={160}
                  preview={false}
                />
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontSize: 12,
                  color: "#6B7280",
                }}
              >
                {t("wcomp.rsScanToOpen", "Quét để mở / cài đặt")}
              </div>
            </div>
          )}
        </div>

        {result.guide && (
          <Collapse
            ghost
            items={[
              {
                key: "guide",
                label: t("wcomp.rsGuideLabel", "Hướng dẫn cài đặt & cấu hình"),
                children: (
                  <pre
                    style={{
                      whiteSpace: "pre-wrap",
                      fontSize: 13,
                      color: "#374151",
                      background: "#F7F8FC",
                      border: "1px solid #ECEDF3",
                      borderRadius: 10,
                      padding: 14,
                      margin: 0,
                    }}
                  >
                    {result.guide}
                  </pre>
                ),
              },
            ]}
          />
        )}
      </Space>
    </Card>
  );
}
