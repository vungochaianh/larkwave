'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Layout, Menu, Button } from 'antd'
import {
  ApiOutlined,
  FileTextOutlined,
  RobotOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons'

const { Sider, Content } = Layout

const MENU_ITEMS = [
  {
    key: 'jobs',
    icon: <ApiOutlined />,
    label: <Link href="/jobs">Jobs</Link>,
  },
  {
    key: 'logs',
    icon: <FileTextOutlined />,
    label: <Link href="/logs">Logs</Link>,
  },
  {
    key: 'chatbot',
    icon: <RobotOutlined />,
    label: <Link href="/chatbot">Chat Bot</Link>,
  },
]

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  const selectedKey = (() => {
    if (pathname.startsWith('/jobs')) return 'jobs'
    if (pathname.startsWith('/logs')) return 'logs'
    if (pathname.startsWith('/chatbot')) return 'chatbot'
    return 'jobs'
  })()

  return (
    <Layout className="min-h-screen">
      <Sider
        collapsible
        collapsed={collapsed}
        trigger={null}
        width={240}
        theme="light"
      >
        {/* Logo */}
        <div className="flex h-14 items-center justify-between px-4 ">
          {/* {!collapsed && (
            <span className="text-base font-semibold">
              Curl Automation
            </span>
          )} */}

          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
          />
        </div>

        {/* Menu */}
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={MENU_ITEMS}
          className="border-r-0"
        />
      </Sider>

      <Layout>
        <Content className="p-6 bg-gray-50 min-h-screen">
          {children}
        </Content>
      </Layout>
    </Layout>
  )
}
