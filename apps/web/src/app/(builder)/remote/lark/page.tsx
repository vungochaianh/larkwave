"use client";

import { PlayCircleOutlined, ReloadOutlined } from "@ant-design/icons";
import { App, Button, Card, Checkbox, Empty, Space, Spin, Tag, Typography } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RemoteTask } from "@larkwave/shared";
import { useI18n } from "@larkwave/ui";
import { api, streamCmsSync, type RemoteCmsJob } from "@/lib/api";
import { fromNow } from "@/lib/format";
import LarkRelogin from "@/components/LarkRelogin";

const { Title, Text, Paragraph } = Typography;

const jobKey = (j: RemoteCmsJob) => String(j._id || j.id);

/** Small status hint mirroring the desktop: an error is red; a "still syncing" note is a benign
 *  "đang đồng bộ" (a large table still running), NOT an error. */
function jobStatusTag(
  j: RemoteCmsJob,
): { color: string; labelKey: string; label: string } | null {
  const status = String(j.lastSyncStatus || "");
  const err = String(j.lastSyncError || "");
  if (/error|fail|lỗi/i.test(status))
    return { color: "red", labelKey: "web.remote.lark.tagError", label: "lỗi" };
  if (err && /skipp|still syncing|syncing|đang đồng bộ/i.test(err))
    return { color: "blue", labelKey: "web.remote.lark.tagSyncing", label: "đang đồng bộ" };
  return null;
}

/**
 * "Điều khiển từ xa → Lark": re-login the desktop's Lark session from the phone (QR handoff), RUN
 * the CMS Bitable sync jobs through the desktop's live session (relay), + a report of recent failed
 * remote runs.
 */
export default function RemoteLarkPage() {
  const { t } = useI18n();
  const { message } = App.useApp();
  const [errors, setErrors] = useState<RemoteTask[]>([]);
  const [loading, setLoading] = useState(true);

  // ── CMS Bitable sync (list from CMS backend, RUN through the desktop relay) ──
  const [jobs, setJobs] = useState<RemoteCmsJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; name: string } | null>(null);
  const [resultLines, setResultLines] = useState<string[]>([]);
  const reqRef = useRef<string | null>(null);
  const gotRef = useRef(false);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearWatchdog = () => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const t = await api.listRemoteTasks();
      setErrors(t.filter((x) => x.status === "error"));
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [message]);

  const loadJobs = useCallback(async () => {
    setJobsLoading(true);
    try {
      const r = await api.cmsSyncListJobs();
      setJobs(Array.isArray(r.jobs) ? r.jobs : []);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setJobsLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void load();
    void loadJobs();
  }, [load, loadJobs]);

  // Live progress from the desktop while a relayed sync runs.
  useEffect(() => {
    const stop = streamCmsSync((ev) => {
      if (reqRef.current && ev.requestId !== reqRef.current) return;
      gotRef.current = true;
      clearWatchdog();
      if (ev.kind === "progress") {
        setProgress({ done: ev.done ?? 0, total: ev.total ?? 0, name: ev.name ?? "" });
      } else {
        setSyncing(false);
        setProgress(null);
        setResultLines(ev.lines ?? []);
        if (ev.failed)
          message.warning(
            t("web.remote.lark.doneWithErrors", "Xong: {ok} OK, {failed} lỗi.", {
              ok: ev.ok ?? 0,
              failed: ev.failed,
            }),
          );
        else
          message.success(
            t("web.remote.lark.doneAllOk", "Đã chạy {total} job — tất cả OK.", {
              total: ev.total ?? 0,
            }),
          );
        void loadJobs();
      }
    });
    return () => {
      stop();
      clearWatchdog();
    };
  }, [message, loadJobs, t]);

  const runSync = useCallback(
    async (ids: string[], isAll: boolean) => {
      if (!ids.length) {
        message.info(
          t("web.remote.lark.pickAtLeastOne", 'Chọn ít nhất một job, hoặc bấm "Chạy tất cả".'),
        );
        return;
      }
      setSyncing(true);
      setResultLines([]);
      setProgress({ done: 0, total: ids.length, name: "" });
      gotRef.current = false;
      clearWatchdog();
      // If the desktop never responds (offline / not signed in / remote-control off), fail clearly.
      watchdogRef.current = setTimeout(() => {
        if (!gotRef.current) {
          setSyncing(false);
          setProgress(null);
          message.error(
            t(
              "web.remote.lark.noResponse",
              'Máy tính không phản hồi — kiểm tra máy đã bật, đăng nhập cùng tài khoản và bật "Điều khiển từ xa".',
            ),
          );
        }
      }, 30000);
      try {
        const { requestId } = await api.cmsSyncRun(ids);
        reqRef.current = requestId;
      } catch (e) {
        clearWatchdog();
        setSyncing(false);
        setProgress(null);
        message.error((e as Error).message);
      }
      void isAll;
    },
    [message, t],
  );

  const allKeys = jobs.map(jobKey);
  const allChecked = allKeys.length > 0 && selected.length === allKeys.length;

  return (
    <div style={{ maxWidth: 880, margin: "0 auto" }}>
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <div>
          <Title level={4} style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 22 }}>🟦</span>{" "}
            {t("web.remote.lark.title", "Lark (Điều khiển từ xa)")}
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {t(
              "web.remote.lark.subtitle",
              "Đăng nhập lại Lark cho máy + chạy đồng bộ Bitable (CMS) qua máy đang bật + xem lỗi gần đây.",
            )}
          </Text>
        </div>

        <Card size="small" title={t("web.remote.lark.reloginTitle", "Đăng nhập lại Lark cho máy")}>
          <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 12 }}>
            {t(
              "web.remote.lark.reloginDesc1",
              "Khi phiên Lark trên máy hết hạn (đồng bộ CMS bắt đầu lỗi), bấm nút dưới — máy sẽ mở màn đăng nhập Lark và ",
            )}
            <b>{t("web.remote.lark.reloginPushQr", "đẩy QR sang đây")}</b>
            {t("web.remote.lark.reloginDesc2", ", bạn quét bằng ")}
            <b>{t("web.remote.lark.reloginLarkApp", "app Lark")}</b>
            {t(
              "web.remote.lark.reloginDesc3",
              " là xong, máy tự làm mới session CMS. Cần máy đang mở app + đăng nhập cùng tài khoản.",
            )}
          </Paragraph>
          <LarkRelogin />
        </Card>

        <Card
          size="small"
          title={t("web.remote.lark.cmsSyncTitle", "Đồng bộ Bitable (CMS)")}
          extra={
            <Button size="small" icon={<ReloadOutlined />} onClick={() => void loadJobs()} disabled={syncing}>
              {t("web.remote.lark.refresh", "Làm mới")}
            </Button>
          }
        >
          <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 12 }}>
            {t(
              "web.remote.lark.cmsSyncDesc1",
              "Chọn job rồi bấm chạy — lệnh được gửi ",
            )}
            <b>{t("web.remote.lark.cmsSyncViaMachine", "qua máy tính đang bật")}</b>
            {t(
              "web.remote.lark.cmsSyncDesc2",
              " (dùng phiên Lark sống trên máy). Cần máy đang mở app + đăng nhập cùng tài khoản + bật ",
            )}
            <b>{t("web.remote.lark.remoteControl", "“Điều khiển từ xa”")}</b>
            {t("web.remote.lark.cmsSyncDesc3", ".")}
          </Paragraph>

          {jobsLoading ? (
            <div style={{ textAlign: "center", padding: 24 }}>
              <Spin />
            </div>
          ) : jobs.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t("web.remote.lark.noJobs", "Chưa có job đồng bộ nào.")}
            />
          ) : (
            <>
              <Space wrap style={{ marginBottom: 10 }}>
                <Checkbox
                  checked={allChecked}
                  indeterminate={selected.length > 0 && !allChecked}
                  onChange={(e) => setSelected(e.target.checked ? allKeys : [])}
                  disabled={syncing}
                >
                  {t("web.remote.lark.selectAll", "Chọn tất cả ({count})", { count: jobs.length })}
                </Checkbox>
                <Button
                  size="small"
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  loading={syncing}
                  disabled={selected.length === 0}
                  onClick={() => void runSync([...selected], false)}
                >
                  {t("web.remote.lark.runSync", "Chạy đồng bộ ({count})", { count: selected.length })}
                </Button>
                <Button
                  size="small"
                  icon={<PlayCircleOutlined />}
                  loading={syncing}
                  onClick={() => void runSync(allKeys, true)}
                >
                  {t("web.remote.lark.runAll", "Chạy tất cả")}
                </Button>
                {progress && (
                  <Text style={{ fontSize: 12, color: "#2F80ED" }}>
                    {t("web.remote.lark.running", "Đang chạy {done}/{total}", {
                      done: Math.min(progress.done + 1, progress.total),
                      total: progress.total,
                    })}
                    {progress.name ? `: ${progress.name}` : ""}…
                  </Text>
                )}
              </Space>

              <Checkbox.Group
                value={selected}
                onChange={(vals) => setSelected(vals.map(String))}
                style={{ width: "100%" }}
              >
                <Space direction="vertical" size={6} style={{ width: "100%" }}>
                  {jobs.map((j) => {
                    const st = jobStatusTag(j);
                    return (
                      <div key={jobKey(j)} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                        <Checkbox value={jobKey(j)} disabled={syncing} />
                        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {j.name || jobKey(j)}
                        </span>
                        {j.enabled === false && <Tag>{t("web.remote.lark.tagOff", "tắt")}</Tag>}
                        {st && <Tag color={st.color}>{t(st.labelKey, st.label)}</Tag>}
                        {j.lastSyncAt && (
                          <Text type="secondary" style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                            {fromNow(j.lastSyncAt)}
                          </Text>
                        )}
                      </div>
                    );
                  })}
                </Space>
              </Checkbox.Group>

              {resultLines.length > 0 && (
                <pre
                  style={{
                    marginTop: 12,
                    marginBottom: 0,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    fontSize: 12,
                    background: "rgba(0,0,0,0.03)",
                    padding: 10,
                    borderRadius: 8,
                  }}
                >
                  {resultLines.join("\n")}
                </pre>
              )}
            </>
          )}
        </Card>

        <Card
          size="small"
          title={t("web.remote.lark.recentErrorsTitle", "Báo lỗi chạy gần đây")}
          extra={
            <Button size="small" icon={<ReloadOutlined />} onClick={() => void load()}>
              {t("web.remote.lark.refresh", "Làm mới")}
            </Button>
          }
        >
          {loading ? (
            <div style={{ textAlign: "center", padding: 24 }}>
              <Spin />
            </div>
          ) : errors.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t("web.remote.lark.noRecentErrors", "Không có lỗi nào gần đây.")}
            />
          ) : (
            <Space direction="vertical" size={8} style={{ width: "100%" }}>
              {errors.map((task) => (
                <div key={task.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
                  <Tag color="red">{t("web.remote.lark.tagError", "lỗi")}</Tag>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text ellipsis style={{ display: "block", maxWidth: "100%" }}>
                      {task.prompt}
                    </Text>
                    {task.error && (
                      <Text type="secondary" style={{ fontSize: 12, color: "#B4231C", wordBreak: "break-word" }}>
                        {task.error}
                      </Text>
                    )}
                  </div>
                  <Text type="secondary" style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                    {fromNow(task.updatedAt)}
                  </Text>
                </div>
              ))}
            </Space>
          )}
          <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
            {t(
              "web.remote.lark.detailHint1",
              "Chi tiết đồng bộ CMS theo từng job (thời điểm, số bản ghi, lỗi) xem trong app trên máy → ",
            )}
            <b>{t("web.remote.lark.cmsSyncTitle", "Đồng bộ Bitable (CMS)")}</b>
            {" → "}
            <b>{t("web.remote.lark.logsAndReports", "Nhật ký & báo cáo")}</b>
            {t("web.remote.lark.detailHint2", ".")}
          </Paragraph>
        </Card>
      </Space>
    </div>
  );
}
