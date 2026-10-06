'use client'

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import {
  ApartmentOutlined,
  ApiOutlined,
  BarChartOutlined,
  BellOutlined,
  BookOutlined,
  BranchesOutlined,
  BugOutlined,
  CheckCircleOutlined,
  CloudServerOutlined,
  CodeOutlined,
  ContactsOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  FolderOutlined,
  FundProjectionScreenOutlined,
  GlobalOutlined,
  HistoryOutlined,
  LinkOutlined,
  LogoutOutlined,
  MenuOutlined,
  MessageOutlined,
  MoonOutlined,
  NodeIndexOutlined,
  PlayCircleOutlined,
  RobotOutlined,
  RocketOutlined,
  SafetyOutlined,
  SettingOutlined,
  SunOutlined,
  SwapOutlined,
  SyncOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  TranslationOutlined,
  WalletOutlined,
} from '@ant-design/icons'
import { Drawer, Layout, Menu, Popconfirm, Tooltip, Button } from 'antd'
import type { ItemType, MenuItemType } from 'antd/es/menu/interface'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import useStaff from '@/store/staff'
import useLang from '@/store/language'
import useTheme from '@/store/theme'
import { t } from '@/lib/i18n'
import RootLayout from '@/components/layout'
import './globals.css'
import Image from 'next/image'

const { Sider } = Layout

// ── Menu definition ───────────────────────────────────────────────────────────
const buildMenuItems = (
  tr: ReturnType<typeof t>,
  onLogout: () => void,
): ItemType<MenuItemType>[] => [
  {
    key: 'lark',
    icon: <PlayCircleOutlined />,
    label: tr.menu.lark,
    children: [
      {
        key: '/lark/accounts',
        icon: <DatabaseOutlined />,
        label: <Link href="/lark/accounts">{tr.menu.larkAccounts}</Link>,
      },
      {
        key: '/lark/automation',
        icon: <ThunderboltOutlined />,
        label: <Link href="/lark/automation">{tr.menu.automationAPI}</Link>,
      },
    ],
  },
  {
    key: 'base-designer',
    icon: <BranchesOutlined />,
    label: tr.menu.baseDesigner,
    children: [
      {
        key: '/lark/base-designer',
        icon: <EditOutlined />,
        label: <Link href="/lark/base-designer">{tr.menu.designExisting}</Link>,
      },
      {
        key: '/lark/base-designer/compose',
        icon: <RobotOutlined />,
        label: <Link href="/lark/base-designer/compose">{tr.menu.composeNew}</Link>,
      },
      {
        key: '/lark/base-designer/extract',
        icon: <DatabaseOutlined />,
        label: <Link href="/lark/base-designer/extract">{tr.menu.extractAI}</Link>,
      },
      {
        key: '/lark/base-designer/history',
        icon: <FileTextOutlined />,
        label: <Link href="/lark/base-designer/history">{tr.menu.aiHistory}</Link>,
      },
      {
        key: '/lark/base-designer/workflows',
        icon: <ApartmentOutlined />,
        label: <Link href="/lark/base-designer/workflows">{tr.menu.workflows}</Link>,
      },
    ],
  },
  {
    key: 'sync',
    icon: <SyncOutlined />,
    label: tr.menu.sync,
    children: [
      {
        key: '/sync/bitable',
        icon: <DatabaseOutlined />,
        label: <Link href="/sync/bitable">{tr.menu.syncBitable}</Link>,
      },
      {
        key: '/sync/jobs',
        icon: <ClockCircleOutlined />,
        label: <Link href="/sync/jobs">{tr.menu.syncJobs}</Link>,
      },
      {
        key: '/sync/logs',
        icon: <HistoryOutlined />,
        label: <Link href="/sync/logs">{tr.menu.syncLogs}</Link>,
      },
      {
        key: '/sync/notify',
        icon: <BellOutlined />,
        label: <Link href="/sync/notify">{tr.menu.syncNotify}</Link>,
      },
    ],
  },
  {
    key: 'ai-agent',
    icon: <RobotOutlined />,
    label: tr.menu.aiAgent,
    children: [
      {
        key: '/lark/agent?tab=agents',
        icon: <RobotOutlined />,
        label: <Link href="/lark/agent?tab=agents">{tr.menu.agentList}</Link>,
      },
      {
        key: '/lark/agent?tab=knowledge',
        icon: <BookOutlined />,
        label: <Link href="/lark/agent?tab=knowledge">{tr.menu.agentKnowledge}</Link>,
      },
      {
        key: '/lark/agent?tab=training',
        icon: EditOutlined ? <EditOutlined /> : <BookOutlined />,
        label: <Link href="/lark/agent?tab=training">{tr.menu.agentTraining}</Link>,
      },
      {
        key: '/lark/agent?tab=test',
        icon: <ContactsOutlined />,
        label: <Link href="/lark/agent?tab=test">{tr.menu.agentChat}</Link>,
      },
      {
        key: '/lark/agent?tab=deploy',
        icon: <GlobalOutlined />,
        label: <Link href="/lark/agent?tab=deploy">{tr.menu.agentDeploy}</Link>,
      },
      {
        key: '/lark/agent/trainer',
        icon: <ThunderboltOutlined />,
        label: <Link href="/lark/agent/trainer">Auto Trainer</Link>,
      },
      {
        key: '/lark/agent/cskh',
        icon: <MessageOutlined />,
        label: <Link href="/lark/agent/cskh">{tr.menu.cskhInbox ?? 'CSKH Inbox'}</Link>,
      },
    ],
  },
  {
    key: 'bots',
    icon: <RobotOutlined />,
    label: tr.menu.bots,
    children: [
      {
        key: '/bots',
        icon: <RobotOutlined />,
        label: <Link href="/bots">{tr.menu.botsDashboard}</Link>,
      },
      {
        key: '/bots/commands',
        icon: <ApiOutlined />,
        label: <Link href="/bots/commands">{tr.menu.botsCommands}</Link>,
      },
      {
        key: '/bots/conversations',
        icon: <ContactsOutlined />,
        label: <Link href="/bots/conversations">Hội thoại & KH</Link>,
      },
    ],
  },
  {
    key: 'n8n',
    icon: <NodeIndexOutlined />,
    label: 'N8N Webhooks',
    children: [
      {
        key: '/n8n',
        icon: <FundProjectionScreenOutlined />,
        label: <Link href="/n8n">Dashboard</Link>,
      },
      {
        key: '/n8n/connections',
        icon: <LinkOutlined />,
        label: <Link href="/n8n/connections">Connections</Link>,
      },
      {
        key: '/n8n/templates',
        icon: <FileTextOutlined />,
        label: <Link href="/n8n/templates">Templates</Link>,
      },
      {
        key: '/n8n/mappings',
        icon: <SwapOutlined />,
        label: <Link href="/n8n/mappings">Mappings</Link>,
      },
      {
        key: '/n8n/rules',
        icon: <ThunderboltOutlined />,
        label: <Link href="/n8n/rules">Rules</Link>,
      },
      {
        key: '/n8n/executions',
        icon: <HistoryOutlined />,
        label: <Link href="/n8n/executions">Executions</Link>,
      },
      {
        key: '/n8n/files',
        icon: <FolderOutlined />,
        label: <Link href="/n8n/files">Files</Link>,
      },
      {
        key: '/n8n/docs',
        icon: <BookOutlined />,
        label: <Link href="/n8n/docs">Docs</Link>,
      },
    ],
  },
  {
    key: 'ba',
    icon: <BarChartOutlined />,
    label: 'BA - Schema Analysis',
    children: [
      {
        key: '/ba',
        icon: <FundProjectionScreenOutlined />,
        label: <Link href="/ba">Dashboard</Link>,
      },
      {
        key: '/ba/bases',
        icon: <DatabaseOutlined />,
        label: <Link href="/ba/bases">Bases</Link>,
      },
      {
        key: '/ba/docs',
        icon: <BookOutlined />,
        label: <Link href="/ba/docs">Documents</Link>,
      },
      {
        key: '/ba/issues',
        icon: <ExclamationCircleOutlined />,
        label: <Link href="/ba/issues">Issues</Link>,
      },
      {
        key: '/ba/analyst',
        icon: <CheckCircleOutlined />,
        label: <Link href="/ba/analyst">Analyst Manual</Link>,
      },
    ],
  },
  {
    key: 'docs',
    icon: <BookOutlined />,
    label: tr.menu.docs,
    children: [
      {
        key: '/docs/sync',
        icon: <FileTextOutlined />,
        label: <Link href="/docs/sync">{tr.menu.docsSync}</Link>,
      },
      {
        key: '/docs/backup-strategy',
        icon: <SafetyOutlined />,
        label: <Link href="/docs/backup-strategy">Backup Strategy</Link>,
      },
      {
        key: '/docs/bitable-ideas',
        icon: <ApiOutlined />,
        label: <Link href="/docs/bitable-ideas">{tr.menu.docsBitable}</Link>,
      },
      {
        key: '/docs/base-extensions',
        icon: <CodeOutlined />,
        label: <Link href="/docs/base-extensions">{tr.menu.docsExtensions}</Link>,
      },
      {
        key: '/docs/agent-guide',
        icon: <RobotOutlined />,
        label: <Link href="/docs/agent-guide">{tr.menu.docsAgent}</Link>,
      },
      {
        key: '/docs/agents-lark',
        icon: <RobotOutlined />,
        label: <Link href="/docs/agents-lark">Lark Agents</Link>,
      },
      {
        key: '/docs/lark-crawler',
        icon: <BugOutlined />,
        label: <Link href="/docs/lark-crawler">Lark Crawler</Link>,
      },
      {
        key: '/docs/platform-guide',
        icon: <GlobalOutlined />,
        label: <Link href="/docs/platform-guide">{tr.menu.docsGuide}</Link>,
      },
      {
        key: '/docs/demo-guide',
        icon: <ThunderboltOutlined />,
        label: <Link href="/docs/demo-guide">{tr.menu.docsDemoGuide}</Link>,
      },
      {
        key: '/docs/cicd',
        icon: <RocketOutlined />,
        label: <Link href="/docs/cicd">{tr.menu.docsCICD}</Link>,
      },
      {
        key: '/docs/changelog',
        icon: <ClockCircleOutlined />,
        label: <Link href="/docs/changelog">{tr.menu.docsChangelog}</Link>,
      },
      {
        key: '/docs/roadmap',
        icon: <RocketOutlined />,
        label: <Link href="/docs/roadmap">{tr.menu.docsRoadmap}</Link>,
      },
    ],
  },
  {
    key: 'dev',
    icon: <CodeOutlined />,
    label: tr.menu.dev,
    children: [
      {
        key: '/dev/features',
        icon: <BookOutlined />,
        label: <Link href="/dev/features">{tr.menu.devFeatures}</Link>,
      },
      {
        key: '/dev/api',
        icon: <ApiOutlined />,
        label: <Link href="/dev/api">{tr.menu.devApi}</Link>,
      },
      {
        key: '/ba/analyses',
        icon: <FileSearchOutlined />,
        label: <Link href="/ba/analyses">BA Analyses</Link>,
      },
      {
        key: '/dev/status',
        icon: <CheckCircleOutlined />,
        label: <Link href="/dev/status">Page Status</Link>,
      },
      {
        key: '/ocr-review',
        icon: <FileSearchOutlined />,
        label: <Link href="/ocr-review">{tr.menu.ocrReview}</Link>,
      },
    ],
  },
  {
    key: 'demo',
    icon: <ThunderboltOutlined />,
    label: tr.menu.demo,
    children: [
      {
        key: '/chatbot',
        icon: <RobotOutlined />,
        label: <Link href="/chatbot">{tr.menu.chatbot}</Link>,
      },
      {
        key: '/demo/ai-tools',
        icon: <EditOutlined />,
        label: <Link href="/demo/ai-tools">{tr.menu.demoAiTools}</Link>,
      },
      {
        key: '/demo/image-analyzer',
        icon: <FileTextOutlined />,
        label: <Link href="/demo/image-analyzer">{tr.menu.demoImageAnalyzer}</Link>,
      },
      {
        key: '/demo/knowledge-qa',
        icon: <DatabaseOutlined />,
        label: <Link href="/demo/knowledge-qa">{tr.menu.demoKnowledgeQA}</Link>,
      },
      {
        key: '/demo/webhook-tester',
        icon: <ApiOutlined />,
        label: <Link href="/demo/webhook-tester">{tr.menu.demoWebhookTester}</Link>,
      },
    ],
  },
  {
    key: 'settings',
    icon: <SettingOutlined />,
    label: tr.menu.settings,
    children: [
      {
        key: '/settings/ai',
        icon: <ApiOutlined />,
        label: <Link href="/settings/ai">{tr.menu.aiKeys}</Link>,
      },
      {
        key: '/settings/integrations',
        icon: <CodeOutlined />,
        label: <Link href="/settings/integrations">{tr.menu.integrations}</Link>,
      },
      {
        key: '/settings/users',
        icon: <TeamOutlined />,
        label: <Link href="/settings/users">{tr.menu.users}</Link>,
      },
      {
        key: '/settings/credits',
        icon: <WalletOutlined />,
        label: <Link href="/settings/credits">{tr.menu.credits}</Link>,
      },
    ],
  },
  {
    key: 'contact',
    icon: <ContactsOutlined />,
    label: tr.menu.contact,
    children: [
      {
        key: 'facebook',
        label: (
          <a href="https://www.facebook.com/am.deveris" target="_blank" rel="noopener noreferrer">
            Facebook
          </a>
        ),
      },
      {
        key: 'hotline',
        label: <a href="tel:0335824450">033 582 4450</a>,
      },
    ],
  },
  {
    key: 'logout',
    icon: <LogoutOutlined />,
    label: (
      <Popconfirm
        title={tr.logoutTitle}
        description={tr.logoutDesc}
        okText={tr.logoutOk}
        cancelText={tr.logoutCancel}
        onConfirm={onLogout}
      >
        <span>{tr.menu.logout}</span>
      </Popconfirm>
    ),
  },
]

function getOpenKeys(pathname: string): string[] {
  if (pathname.startsWith('/lark/base-designer')) return ['base-designer']
  if (pathname.startsWith('/lark/agent'))         return ['ai-agent']
  if (pathname.startsWith('/lark'))               return ['lark']
  if (pathname.startsWith('/ba'))                 return ['ba']
  if (pathname.startsWith('/docs'))               return ['docs']
  if (pathname.startsWith('/sync'))               return ['sync']
  if (pathname.startsWith('/settings'))           return ['settings']
  if (pathname.startsWith('/contact'))            return ['contact']
  if (pathname.startsWith('/ocr-review'))          return ['dev']
  if (pathname.startsWith('/dev'))                return ['dev']
  if (pathname.startsWith('/demo') || pathname === '/chatbot') return ['demo']
  return []
}

// Build the selectedKey for the menu — includes query param for agent sub-tabs
function getSelectedKey(pathname: string, search: string): string {
  if (pathname === '/lark/agent') {
    const params = new URLSearchParams(search)
    const tab = params.get('tab') || 'agents'
    return `/lark/agent?tab=${tab}`
  }
  return pathname
}

// ── Shared sidebar menu content ───────────────────────────────────────────────
function SidebarMenu({
  menuItems, selectedKey, openKeys, setOpenKeys, isDark,
  collapsed, setCollapsed, toggleTheme, toggleLang, lang, tr,
  onNavigate,
}: {
  menuItems: ItemType<MenuItemType>[]
  selectedKey: string
  openKeys: string[]
  setOpenKeys: (k: string[]) => void
  isDark: boolean
  collapsed: boolean
  setCollapsed: (v: boolean) => void
  toggleTheme: () => void
  toggleLang: () => void
  lang: string
  tr: ReturnType<typeof t>
  onNavigate?: () => void
}) {
  return (
    <>
      {/* Logo / brand */}
      <div style={{
        height: 56,
        padding: collapsed ? '0 8px' : '0 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        borderBottom: '1px solid var(--border-color)',
        flexShrink: 0,
      }}>
        {!collapsed && (
          <div className="flex gap-2 items-center min-w-0">
            <Image src="/logo.png" alt="" width={22} height={22} className="object-contain flex-shrink-0" />
            <span className="font-bold text-[var(--primary-color)] truncate text-sm tracking-wide">
              Hoa Nam
            </span>
          </div>
        )}
        <div className="flex items-center gap-1">
          <Tooltip title={isDark ? tr.lightMode : tr.darkMode} placement="right">
            <Button type="text" size="small" icon={isDark ? <SunOutlined /> : <MoonOutlined />} onClick={toggleTheme} style={{ flexShrink: 0 }} />
          </Tooltip>
          {!collapsed && (
            <Tooltip title={tr.switchLang} placement="right">
              <Button type="text" size="small" icon={<TranslationOutlined />} onClick={toggleLang} style={{ flexShrink: 0 }}>
                {lang === 'vi' ? 'EN' : 'VI'}
              </Button>
            </Tooltip>
          )}
        </div>
      </div>

      <Menu
        mode="inline"
        selectedKeys={[selectedKey]}
        openKeys={openKeys}
        onOpenChange={setOpenKeys}
        items={menuItems}
        style={{ borderRight: 0, flex: 1, overflowY: 'auto' }}
        theme={isDark ? 'dark' : 'light'}
        onClick={onNavigate}
      />
    </>
  )
}

// ── Layout wrapper ────────────────────────────────────────────────────────────
const AdminPageLayout = ({ children }: React.PropsWithChildren) => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { staff } = useStaff()
  const { lang, toggle: toggleLang } = useLang()
  const { theme, toggle: toggleTheme } = useTheme()
  const tr = t(lang)
  const isDark = theme === 'dark'

  const noLayoutPaths = ['/login', '/']
  const isNoLayout = noLayoutPaths.includes(pathname)
    || pathname.startsWith('/lark/oauth')
    || pathname.startsWith('/share/')

  const [collapsed,   setCollapsed]   = useState(false)
  const [openKeys,    setOpenKeys]    = useState<string[]>(getOpenKeys(pathname))
  const [isMobile,    setIsMobile]    = useState(false)
  const [drawerOpen,  setDrawerOpen]  = useState(false)

  useEffect(() => {
    const required = getOpenKeys(pathname)
    setOpenKeys(prev => {
      const merged = new Set([...prev, ...required])
      return [...merged]
    })
  }, [pathname])

  useEffect(() => {
    function check() { setIsMobile(window.innerWidth < 768) }
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const logout = () => {
    localStorage.clear()
    router.replace('/login')
  }

  // Page status tracking
  const [pageStatuses, setPageStatuses] = useState<Record<string, { status: string; note: string }>>({})
  const STATUS_LIST = [
    { value: 'untested', color: 'var(--text-tertiary)', label: 'Chưa test' },
    { value: 'testing', color: '#1677ff', label: 'Đang test' },
    { value: 'needFix', color: '#ff4d4f', label: 'Cần sửa' },
    { value: 'ready', color: '#52c41a', label: 'Sẵn sàng' },
    { value: 'notNeeded', color: '#8c8c8c', label: 'Không cần' },
  ]
  const loadPageStatuses = useCallback(() => {
    const API = process.env.NEXT_PUBLIC_API_BASE?.replace(/\/api$/, '') || 'http://localhost:6100'
    fetch(`${API}/api/page-status`).then(r => r.json()).then(d => {
      if (d.success) {
        const map: Record<string, { status: string; note: string }> = {}
        for (const s of d.data) map[s.path] = { status: s.status, note: s.note }
        setPageStatuses(map)
      }
    }).catch(() => {})
  }, [])
  useEffect(() => { loadPageStatuses() }, [loadPageStatuses])

  const cycleStatus = useCallback(async (path: string) => {
    const order = ['untested', 'testing', 'needFix', 'ready', 'notNeeded']
    const current = pageStatuses[path]?.status || 'untested'
    const next = order[(order.indexOf(current) + 1) % order.length]
    const API = process.env.NEXT_PUBLIC_API_BASE?.replace(/\/api$/, '') || 'http://localhost:6100'
    try {
      await fetch(`${API}/api/page-status${path}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      setPageStatuses(prev => ({ ...prev, [path]: { ...prev[path], status: next, note: prev[path]?.note || '' } }))
    } catch {}
  }, [pageStatuses])

  // Inject status dots + hide notNeeded items from sidebar
  const injectStatus = useCallback((items: ItemType<MenuItemType>[]): ItemType<MenuItemType>[] => {
    return items.map(item => {
      if (!item || !('key' in item)) return item
      const it = item as MenuItemType & { children?: ItemType<MenuItemType>[] }
      if (it.children) {
        const filtered = injectStatus(it.children).filter(Boolean)
        if (filtered.length === 0) return null
        return { ...it, children: filtered }
      }
      const key = it.key as string
      const ps = pageStatuses[key]
      // Hide notNeeded from sidebar
      if (ps?.status === 'notNeeded') return null
      const st = STATUS_LIST.find(s => s.value === (ps?.status || 'untested')) || STATUS_LIST[0]
      return {
        ...it,
        label: (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {it.label}
            <span
              title={`${st.label} — click đổi`}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); cycleStatus(key) }}
              style={{ width: 7, height: 7, borderRadius: '50%', background: st.color, flexShrink: 0, cursor: 'pointer', border: '1px solid rgba(0,0,0,0.1)' }}
            />
          </span>
        ),
      }
    })
  }, [pageStatuses, cycleStatus])

  const rawMenuItems = useMemo(() => buildMenuItems(tr, logout), [lang])
  const menuItems = useMemo(() => injectStatus(rawMenuItems).filter(Boolean), [rawMenuItems, injectStatus])
  const selectedKey = getSelectedKey(pathname, searchParams.toString())

  if (isNoLayout) {
    return <RootLayout>{children}</RootLayout>
  }

  // ── Agent page: full-height, no outer padding, manages its own layout ─────
  const isAgentPage = pathname === '/lark/agent'

  return (
    <RootLayout>
      <Layout className="h-screen overflow-hidden">

        {/* ── Mobile: top bar with hamburger ──────────────────────────── */}
        {isMobile && (
          <div style={{
            height: 52, flexShrink: 0, padding: '0 16px',
            display: 'flex', alignItems: 'center', gap: 12,
            background: 'var(--bg-color)',
            borderBottom: '1px solid var(--border-color)',
            position: 'fixed', top: 0, left: 0, right: 0,
            zIndex: 100,
            boxShadow: '0 1px 4px rgba(0,0,0,.08)',
          }}>
            <Button
              type="text" size="small"
              icon={<MenuOutlined style={{ fontSize: 18 }} />}
              onClick={() => setDrawerOpen(true)}
            />
            <div className="flex gap-2 items-center min-w-0">
              <Image src="/logo.png" alt="" width={20} height={20} className="object-contain flex-shrink-0" />
              <span className="font-bold text-[var(--primary-color)] text-sm tracking-wide">CMS Hoa Nam</span>
            </div>
            <div style={{ flex: 1 }} />
            <Button type="text" size="small" icon={isDark ? <SunOutlined /> : <MoonOutlined />} onClick={toggleTheme} />
          </div>
        )}

        {/* ── Mobile: navigation Drawer ───────────────────────────────── */}
        {isMobile && (
          <Drawer
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            placement="left"
            width={260}
            styles={{
              body: {
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--bg-color)',
                height: '100%',
              },
              header: { display: 'none' },
            }}
          >
            <SidebarMenu
              menuItems={menuItems} selectedKey={selectedKey}
              openKeys={openKeys} setOpenKeys={setOpenKeys}
              isDark={isDark} collapsed={false} setCollapsed={setCollapsed}
              toggleTheme={toggleTheme} toggleLang={toggleLang} lang={lang} tr={tr}
              onNavigate={() => setDrawerOpen(false)}
            />
          </Drawer>
        )}

        {/* ── Desktop: fixed Sider ────────────────────────────────────── */}
        {!isMobile && (
          <Sider
            style={{
              overflow: 'auto',
              height: '100vh',
              position: 'fixed',
              left: 0, top: 0, bottom: 0,
              boxShadow: '2px 0 8px var(--shadow-color)',
              display: 'flex',
              flexDirection: 'column',
            }}
            collapsible
            collapsed={collapsed}
            onCollapse={setCollapsed}
            theme={isDark ? 'dark' : 'light'}
            width={220}
            collapsedWidth={64}
          >
            <SidebarMenu
              menuItems={menuItems} selectedKey={selectedKey}
              openKeys={openKeys} setOpenKeys={setOpenKeys}
              isDark={isDark} collapsed={collapsed} setCollapsed={setCollapsed}
              toggleTheme={toggleTheme} toggleLang={toggleLang} lang={lang} tr={tr}
            />
          </Sider>
        )}

        {/* ── Main content ────────────────────────────────────────────── */}
        <Layout
          style={{
            marginLeft: isMobile ? 0 : (collapsed ? 64 : 220),
            marginTop: isMobile ? 52 : 0,
            transition: 'margin-left 0.2s',
            overflow: isAgentPage ? 'hidden' : 'auto',
            minHeight: '100vh',
            background: 'var(--bg-secondary)',
          }}
        >
          {/* Page status bar */}
          {!isAgentPage && !isNoLayout && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', padding: '4px 16px 0', gap: 6 }}>
              {STATUS_LIST.map(s => {
                const active = (pageStatuses[pathname]?.status || 'untested') === s.value
                return (
                  <Tooltip key={s.value} title={s.label}>
                    <span
                      onClick={() => cycleStatus(pathname)}
                      style={{
                        width: active ? 10 : 7, height: active ? 10 : 7,
                        borderRadius: '50%', background: s.color, cursor: 'pointer',
                        border: active ? '2px solid var(--text-color)' : '1px solid rgba(0,0,0,0.1)',
                        transition: 'all 0.15s',
                      }}
                    />
                  </Tooltip>
                )
              })}
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 2 }}>
                {STATUS_LIST.find(s => s.value === (pageStatuses[pathname]?.status || 'untested'))?.label}
              </span>
            </div>
          )}
          <div className="page-content" style={{
            padding: isAgentPage ? 0 : 16,
            height: isAgentPage ? '100%' : undefined,
          }}>
            {children}
          </div>
        </Layout>
      </Layout>
    </RootLayout>
  )
}

function AdminPageLayoutWrapper(props: React.PropsWithChildren) {
  return (
    <Suspense fallback={null}>
      <AdminPageLayout {...props} />
    </Suspense>
  )
}

export default AdminPageLayoutWrapper
