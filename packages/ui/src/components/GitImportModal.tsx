'use client';
import { useEffect, useState } from 'react';
import { Alert, App, Button, Divider, Input, List, Modal, Segmented, Space, Spin, Tag, Typography } from 'antd';
import {
  CloudDownloadOutlined,
  GithubFilled,
  GitlabFilled,
  LockOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useRuntime } from '../RuntimeProvider';
import { useAccountAuth } from '../account/auth';
import { accountApi, type GitProvider, type GitRepo } from '../account/api';

const { Text, Paragraph } = Typography;

/**
 * Native "Nhập từ Git": clone a GitHub/GitLab repo into a LOCAL app (editable with
 * Claude + preview + deploy) instead of bouncing to the website. Two ways in:
 *  1. Browse the user's repos from a linked provider (api.gitRepos), or
 *  2. Paste any clone URL (always works; private repos use the machine's git creds).
 * The actual clone runs in the main process via runtime.gitImportLocal.
 */
export function GitImportModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: (app: { id: string; name: string }) => void;
}) {
  const runtime = useRuntime();
  const { message } = App.useApp();
  const { token } = useAccountAuth();
  const [provider, setProvider] = useState<GitProvider>('github');
  const [q, setQ] = useState('');
  const [repos, setRepos] = useState<GitRepo[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [url, setUrl] = useState('');
  const [branch, setBranch] = useState('');
  const [importing, setImporting] = useState<string | null>(null);

  const loadRepos = async () => {
    if (!token) {
      setConnected(false);
      return;
    }
    setLoadingRepos(true);
    try {
      const r = await accountApi.gitRepos(provider, q.trim() || undefined);
      if (r.connected) {
        setRepos(r.repos);
        setConnected(true);
      } else {
        setRepos([]);
        setConnected(false);
      }
    } catch {
      setConnected(false);
      setRepos([]);
    } finally {
      setLoadingRepos(false);
    }
  };

  // (re)load the repo list when the modal opens or the provider changes
  useEffect(() => {
    if (open) void loadRepos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, provider]);

  const doImport = async (cloneUrl: string, name?: string, br?: string) => {
    if (!runtime.gitImportLocal || importing) return;
    setImporting(cloneUrl);
    try {
      const res = await runtime.gitImportLocal({ url: cloneUrl, name, branch: br });
      message.success(`Đã nhập "${res.name}" — mở để chỉnh sửa`);
      onImported({ id: res.appId, name: res.name });
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setImporting(null);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={620}
      title={
        <Space>
          <CloudDownloadOutlined style={{ color: '#6C5CE7' }} />
          <span>Nhập từ Git</span>
        </Space>
      }
    >
      <Paragraph type="secondary" style={{ marginTop: 0 }}>
        Clone một repo GitHub/GitLab về thành app trong máy — sửa bằng Claude, xem trước và xuất bản như app thường.
      </Paragraph>

      {/* 1) Browse linked repos */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <Segmented
          value={provider}
          onChange={(v) => setProvider(v as GitProvider)}
          options={[
            { value: 'github', label: (<span><GithubFilled /> GitHub</span>) as unknown as string },
            { value: 'gitlab', label: (<span><GitlabFilled style={{ color: '#FC6D26' }} /> GitLab</span>) as unknown as string },
          ]}
        />
        <Input
          allowClear
          prefix={<SearchOutlined style={{ color: '#9AA3B5' }} />}
          placeholder="Tìm repo…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onPressEnter={() => void loadRepos()}
          style={{ flex: 1, minWidth: 180 }}
        />
        <Button onClick={() => void loadRepos()} loading={loadingRepos}>Tìm</Button>
      </div>

      {connected === false ? (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 8 }}
          message={`Chưa kết nối ${provider === 'github' ? 'GitHub' : 'GitLab'}`}
          description="Kết nối ở mục Integrations để duyệt repo, hoặc dán URL repo bên dưới (vẫn hoạt động cho repo công khai)."
        />
      ) : (
        <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid #ECEDF3', borderRadius: 8 }}>
          {loadingRepos ? (
            <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
          ) : (
            <List
              size="small"
              dataSource={repos}
              locale={{ emptyText: 'Không có repo' }}
              renderItem={(r) => (
                <List.Item
                  style={{ padding: '8px 12px' }}
                  actions={[
                    <Button
                      key="imp"
                      size="small"
                      type="primary"
                      icon={<CloudDownloadOutlined />}
                      loading={importing === r.webUrl}
                      disabled={!!importing}
                      onClick={() => void doImport(r.webUrl, r.name, r.defaultBranch)}
                    >
                      Tải về
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <Space size={6}>
                        <Text strong style={{ fontSize: 13 }}>{r.fullName}</Text>
                        {r.private && <Tag icon={<LockOutlined />} color="default" style={{ margin: 0 }}>riêng tư</Tag>}
                      </Space>
                    }
                    description={<Text type="secondary" style={{ fontSize: 12 }}>nhánh {r.defaultBranch}</Text>}
                  />
                </List.Item>
              )}
            />
          )}
        </div>
      )}

      <Divider plain style={{ margin: '14px 0' }}><Text type="secondary" style={{ fontSize: 12 }}>hoặc dán URL repo</Text></Divider>

      {/* 2) Paste a clone URL */}
      <Space.Compact style={{ width: '100%', marginBottom: 8 }}>
        <Input
          placeholder="https://github.com/owner/repo  hoặc  git@gitlab.com:owner/repo.git"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onPressEnter={() => url.trim() && void doImport(url.trim(), undefined, branch.trim() || undefined)}
        />
        <Input
          placeholder="nhánh (tuỳ chọn)"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          style={{ maxWidth: 150 }}
        />
        <Button
          type="primary"
          icon={<CloudDownloadOutlined />}
          loading={importing === url.trim()}
          disabled={!url.trim() || !!importing}
          onClick={() => void doImport(url.trim(), undefined, branch.trim() || undefined)}
        >
          Tải về & mở
        </Button>
      </Space.Compact>
      <Text type="secondary" style={{ fontSize: 11.5 }}>
        Repo riêng tư cần <code>git</code> đã đăng nhập trên máy (credential helper hoặc SSH key).
      </Text>
    </Modal>
  );
}
