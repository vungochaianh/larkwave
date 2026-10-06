'use client'

import { Card, Typography, Divider, Tag, Alert, Table, Steps, Space, Tabs } from 'antd'
import {
  RocketOutlined, SettingOutlined, SafetyOutlined, CodeOutlined,
  CloudServerOutlined, CheckCircleOutlined, BranchesOutlined,
  DeploymentUnitOutlined,
} from '@ant-design/icons'
import useLang from '@/store/language'
import TourGuide from '@/components/TourGuide'
import { tourSteps } from '@/lib/tourSteps'

const { Title, Paragraph, Text } = Typography

const i = {
  vi: {
    title: 'CI/CD Pipeline — Hướng dẫn triển khai tự động',
    desc: 'Hướng dẫn cấu hình GitLab CI/CD để tự động test, build Docker image, và deploy lên production server.',
    overview: 'Tổng quan',
    overviewDesc: 'Hệ thống sử dụng GitLab CI/CD với 3 stages: Test → Build → Deploy. Mỗi push lên nhánh main sẽ tự động chạy test và build. Deploy cần bấm manual.',
    prereq: 'Yêu cầu trước khi bắt đầu',
    prereqList: [
      'GitLab repository cho mỗi project (api-lark-all, cms-lark-sync)',
      'Docker đã cài trên runner (hoặc dùng GitLab shared runners)',
      'SSH key pair để truy cập production server',
      'Các biến CI/CD đã cấu hình trong GitLab (Settings > CI/CD > Variables)',
    ],
    variables: 'Biến CI/CD cần cấu hình',
    variablesDesc: 'Vào GitLab → Settings → CI/CD → Variables, thêm các biến sau:',
    stages: 'Các giai đoạn pipeline',
    stageTest: 'Test — Kiểm tra code',
    stageTestApi: 'API: Chạy node -c kiểm tra syntax tất cả file .js. Nếu có lỗi cú pháp, pipeline dừng ngay.',
    stageTestCms: 'CMS: Chạy npx tsc --noEmit --skipLibCheck kiểm tra TypeScript. Nếu có lỗi type, pipeline dừng.',
    stageBuild: 'Build — Tạo Docker image',
    stageBuildDesc: 'Docker build tạo image từ Dockerfile, tag bằng commit SHA và latest. Image được lưu dưới dạng .tar.gz artifact.',
    stageDeploy: 'Deploy — Đẩy lên server',
    stageDeployDesc: 'Chuyển .tar.gz qua rsync, docker load và restart container. Deploy là manual — phải bấm nút trong GitLab UI.',
    setup: 'Hướng dẫn cài đặt từng bước',
    step1: 'Tạo SSH key pair',
    step1Desc: 'Tạo key pair riêng cho CI/CD (không dùng key cá nhân):',
    step2: 'Thêm public key vào server',
    step2Desc: 'Copy public key vào server production:',
    step3: 'Cấu hình GitLab Variables',
    step3Desc: 'Vào Settings > CI/CD > Variables trên GitLab, thêm:',
    step4: 'Push .gitlab-ci.yml',
    step4Desc: 'File đã có sẵn trong mỗi project. Push lên nhánh main để kích hoạt pipeline.',
    step5: 'Kiểm tra pipeline',
    step5Desc: 'Vào CI/CD > Pipelines trên GitLab để theo dõi. Click "Deploy" khi build xong để deploy.',
    manual: 'Deploy thủ công (không qua CI/CD)',
    manualDesc: 'Nếu cần deploy nhanh mà không qua pipeline:',
    security: 'Lưu ý bảo mật',
    securityList: [
      'KHÔNG lưu password trong .gitlab-ci.yml — dùng SSH key + CI/CD Variables',
      'SSH_PRIVATE_KEY phải để type "File" và masked trong GitLab',
      'Đổi password server định kỳ — không chia sẻ qua chat/email',
      'Sử dụng "Protected" variables cho production credentials',
      'Deploy manual (when: manual) — tránh deploy tự động khi push nhầm',
    ],
  },
  en: {
    title: 'CI/CD Pipeline — Automated Deployment Guide',
    desc: 'Guide to configure GitLab CI/CD for automated testing, Docker image building, and production deployment.',
    overview: 'Overview',
    overviewDesc: 'The system uses GitLab CI/CD with 3 stages: Test → Build → Deploy. Each push to main auto-runs test and build. Deploy requires manual trigger.',
    prereq: 'Prerequisites',
    prereqList: [
      'GitLab repository for each project (api-lark-all, cms-lark-sync)',
      'Docker installed on runner (or use GitLab shared runners)',
      'SSH key pair for production server access',
      'CI/CD variables configured in GitLab (Settings > CI/CD > Variables)',
    ],
    variables: 'Required CI/CD Variables',
    variablesDesc: 'Go to GitLab → Settings → CI/CD → Variables, add:',
    stages: 'Pipeline Stages',
    stageTest: 'Test — Code validation',
    stageTestApi: 'API: Runs node -c syntax check on all .js files. Fails pipeline on syntax errors.',
    stageTestCms: 'CMS: Runs npx tsc --noEmit --skipLibCheck for TypeScript validation. Fails on type errors.',
    stageBuild: 'Build — Create Docker image',
    stageBuildDesc: 'Docker build creates image from Dockerfile, tags with commit SHA and latest. Saved as .tar.gz artifact.',
    stageDeploy: 'Deploy — Push to server',
    stageDeployDesc: 'Transfers .tar.gz via rsync, docker load and restart container. Deploy is manual — must click button in GitLab UI.',
    setup: 'Step-by-Step Setup Guide',
    step1: 'Generate SSH key pair',
    step1Desc: 'Create a dedicated key pair for CI/CD (do not use personal keys):',
    step2: 'Add public key to server',
    step2Desc: 'Copy public key to production server:',
    step3: 'Configure GitLab Variables',
    step3Desc: 'Go to Settings > CI/CD > Variables on GitLab, add:',
    step4: 'Push .gitlab-ci.yml',
    step4Desc: 'The file already exists in each project. Push to main branch to activate pipeline.',
    step5: 'Monitor pipeline',
    step5Desc: 'Go to CI/CD > Pipelines on GitLab to monitor. Click "Deploy" when build succeeds.',
    manual: 'Manual Deploy (without CI/CD)',
    manualDesc: 'For quick deploys without pipeline:',
    security: 'Security Notes',
    securityList: [
      'NEVER store passwords in .gitlab-ci.yml — use SSH keys + CI/CD Variables',
      'SSH_PRIVATE_KEY must be "File" type and masked in GitLab',
      'Rotate server passwords regularly — never share via chat/email',
      'Use "Protected" variables for production credentials',
      'Manual deploy (when: manual) — prevents accidental deploys on push',
    ],
  },
}

const ciVars = [
  { key: 'SSH_PRIVATE_KEY', desc: 'Private key nội dung (type: File, masked, protected)', required: true },
  { key: 'SSH_KNOWN_HOSTS', desc: 'Output của ssh-keyscan server', required: true },
  { key: 'NEXT_PUBLIC_API_BASE', desc: 'URL backend API (CMS only)', required: false },
  { key: 'NEXT_PUBLIC_APP_URL', desc: 'URL frontend (CMS only)', required: false },
]

export default function CICDPage() {
  const { lang } = useLang()
  const l = (lang as 'vi' | 'en') || 'vi'
  const c = i[l]

  return (
    <div className="space-y-5" style={{ maxWidth: 900 }}>
      <div>
        <Title level={3}><RocketOutlined style={{ color: 'var(--accent-color)' }} /> {c.title}</Title>
        <Paragraph type="secondary">{c.desc}</Paragraph>
      </div>

      {/* Overview */}
      <Card size="small">
        <Title level={5}><DeploymentUnitOutlined /> {c.overview}</Title>
        <Paragraph>{c.overviewDesc}</Paragraph>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
          <Steps size="small" direction="horizontal" current={-1} items={[
            { title: 'Test', description: 'Syntax / TS', icon: <CheckCircleOutlined style={{ color: 'var(--success-text)' }} /> },
            { title: 'Build', description: 'Docker image', icon: <CodeOutlined style={{ color: 'var(--accent-color)' }} /> },
            { title: 'Deploy', description: 'Manual trigger', icon: <CloudServerOutlined style={{ color: 'var(--warning-text)' }} /> },
          ]} />
        </div>
      </Card>

      {/* Prerequisites */}
      <Card size="small">
        <Title level={5}><SettingOutlined /> {c.prereq}</Title>
        <ul style={{ paddingLeft: 20 }}>
          {c.prereqList.map((item, idx) => <li key={idx} style={{ marginBottom: 6, color: 'var(--text-secondary)' }}>{item}</li>)}
        </ul>
      </Card>

      {/* CI/CD Variables */}
      <Card size="small">
        <Title level={5}>{c.variables}</Title>
        <Paragraph type="secondary">{c.variablesDesc}</Paragraph>
        <Table size="small" pagination={false} dataSource={ciVars.map((v, i) => ({ ...v, key: i }))} columns={[
          { title: 'Variable', dataIndex: 'key', render: (v: string) => <Tag color="blue" style={{ fontFamily: 'monospace' }}>{v}</Tag> },
          { title: 'Description', dataIndex: 'desc' },
          { title: '', dataIndex: 'required', width: 80, render: (v: boolean) => v ? <Tag color="red">Required</Tag> : <Tag>Optional</Tag> },
        ]} />
      </Card>

      {/* Pipeline Stages */}
      <Card size="small">
        <Title level={5}><BranchesOutlined /> {c.stages}</Title>
        <Tabs items={[
          { key: 'api', label: <span><Tag color="orange">API</Tag> api-lark-all</span>, children: (
            <div className="space-y-3">
              <div><Text strong>{c.stageTest}</Text><Paragraph type="secondary" className="!mb-1">{c.stageTestApi}</Paragraph>
                <pre style={{ background: 'var(--code-bg)', border: '1px solid var(--code-border)', borderRadius: 6, padding: 10, fontSize: 12, overflow: 'auto' }}>
{`# .gitlab-ci.yml (api-lark-all)
test:
  stage: test
  image: node:18-alpine
  script:
    - find . -name "*.js" -not -path "./node_modules/*" -exec node -c {} \\;`}
                </pre>
              </div>
              <Divider dashed style={{ margin: '12px 0' }} />
              <div><Text strong>{c.stageBuild}</Text><Paragraph type="secondary" className="!mb-1">{c.stageBuildDesc}</Paragraph>
                <pre style={{ background: 'var(--code-bg)', border: '1px solid var(--code-border)', borderRadius: 6, padding: 10, fontSize: 12, overflow: 'auto' }}>
{`build:
  stage: build
  image: docker:24.0
  script:
    - docker build -t apihoanam:latest .
    - docker save apihoanam:latest | gzip > /tmp/apihoanam.tar.gz`}
                </pre>
              </div>
            </div>
          )},
          { key: 'cms', label: <span><Tag color="blue">CMS</Tag> cms-lark-sync</span>, children: (
            <div className="space-y-3">
              <div><Text strong>{c.stageTest}</Text><Paragraph type="secondary" className="!mb-1">{c.stageTestCms}</Paragraph>
                <pre style={{ background: 'var(--code-bg)', border: '1px solid var(--code-border)', borderRadius: 6, padding: 10, fontSize: 12, overflow: 'auto' }}>
{`test:
  stage: test
  image: node:18-alpine
  script:
    - npm ci --prefer-offline
    - npx tsc --noEmit --skipLibCheck`}
                </pre>
              </div>
              <Divider dashed style={{ margin: '12px 0' }} />
              <div><Text strong>{c.stageBuild}</Text><Paragraph type="secondary" className="!mb-1">{c.stageBuildDesc}</Paragraph>
                <pre style={{ background: 'var(--code-bg)', border: '1px solid var(--code-border)', borderRadius: 6, padding: 10, fontSize: 12, overflow: 'auto' }}>
{`build:
  stage: build
  image: docker:24.0
  script:
    - docker build --build-arg NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE -t cmshoanam:latest .
    - docker save cmshoanam:latest | gzip > /tmp/cmshoanam.tar.gz`}
                </pre>
              </div>
            </div>
          )},
        ]} />
      </Card>

      {/* Setup Steps */}
      <Card size="small">
        <Title level={5}>{c.setup}</Title>
        <Steps direction="vertical" size="small" current={-1} items={[
          { title: c.step1, description: (<div><Paragraph type="secondary" className="!mb-1">{c.step1Desc}</Paragraph>
            <pre style={{ background: 'var(--code-bg)', border: '1px solid var(--code-border)', borderRadius: 6, padding: 10, fontSize: 12 }}>
{`ssh-keygen -t ed25519 -C "gitlab-cicd" -f ~/.ssh/gitlab_cicd
# -> Tạo 2 file: gitlab_cicd (private) và gitlab_cicd.pub (public)`}
            </pre></div>)},
          { title: c.step2, description: (<div><Paragraph type="secondary" className="!mb-1">{c.step2Desc}</Paragraph>
            <pre style={{ background: 'var(--code-bg)', border: '1px solid var(--code-border)', borderRadius: 6, padding: 10, fontSize: 12 }}>
{`ssh-copy-id -i ~/.ssh/gitlab_cicd.pub root@100.100.164.92
# Hoặc thêm thủ công vào ~/.ssh/authorized_keys trên server`}
            </pre></div>)},
          { title: c.step3, description: (<div><Paragraph type="secondary" className="!mb-1">{c.step3Desc}</Paragraph>
            <pre style={{ background: 'var(--code-bg)', border: '1px solid var(--code-border)', borderRadius: 6, padding: 10, fontSize: 12 }}>
{`SSH_PRIVATE_KEY  → paste nội dung file ~/.ssh/gitlab_cicd (type: File, Masked, Protected)
SSH_KNOWN_HOSTS  → chạy: ssh-keyscan 100.100.164.92 (paste output)`}
            </pre></div>)},
          { title: c.step4, description: <Paragraph type="secondary">{c.step4Desc}</Paragraph> },
          { title: c.step5, description: <Paragraph type="secondary">{c.step5Desc}</Paragraph> },
        ]} />
      </Card>

      {/* Manual deploy */}
      <Card size="small">
        <Title level={5}><CloudServerOutlined /> {c.manual}</Title>
        <Paragraph type="secondary">{c.manualDesc}</Paragraph>
        <pre style={{ background: 'var(--code-bg)', border: '1px solid var(--code-border)', borderRadius: 6, padding: 12, fontSize: 12, overflow: 'auto' }}>
{`# === API ===
cd api-lark-all
docker build -t apihoanam .
docker save apihoanam | gzip > /tmp/apihoanam.tar.gz
rsync -az /tmp/apihoanam.tar.gz root@100.100.164.92:~/
ssh root@100.100.164.92 "docker load < ~/apihoanam.tar.gz && docker restart apihoanam"

# === CMS ===
cd cms-lark-sync
docker build -t cmshoanam .
docker save cmshoanam | gzip > /tmp/cmshoanam.tar.gz
rsync -az /tmp/cmshoanam.tar.gz root@100.100.164.92:~/
ssh root@100.100.164.92 "docker load < ~/cmshoanam.tar.gz && docker restart cmshoanam"`}
        </pre>
      </Card>

      {/* Security */}
      <Alert type="warning" showIcon icon={<SafetyOutlined />}
        message={<Text strong>{c.security}</Text>}
        description={
          <ul style={{ paddingLeft: 20, marginTop: 8, marginBottom: 0 }}>
            {c.securityList.map((item, idx) => <li key={idx} style={{ marginBottom: 4 }}>{item}</li>)}
          </ul>
        }
        style={{ borderRadius: 8 }}
      />

      <TourGuide pageKey="docs-cicd" steps={tourSteps['docs-cicd'] || []} />
    </div>
  )
}
