'use client'

import React, { useEffect, useState } from 'react'
import {
  Alert, Avatar, Badge, Button, Card, Form, Input, Modal,
  Popconfirm, Select, Space, Table, Tag, Typography, message,
} from 'antd'
import {
  EditOutlined, PlusOutlined, ReloadOutlined,
  TeamOutlined, UserAddOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import TourGuide from '@/components/TourGuide'
import { tourSteps } from '@/lib/tourSteps'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

const { Text, Title } = Typography

const _base = (process.env.NEXT_PUBLIC_API_BASE || 'https://apihoanam.toolswave.net/api')
const API   = `${_base}/system-users`

type SystemUser = {
  _id:          string
  name:         string
  email:        string
  avatar:       string
  status:       'active' | 'inactive'
  notes:        string
  lastLoginAt?: string
  createdAt:    string
}

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${API}${path}`, { cache: 'no-store', ...opts })
  return r.json()
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

export default function SystemUsersPage() {
  const [users,   setUsers]   = useState<SystemUser[]>([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState<{ open: boolean; editing?: SystemUser }>({ open: false })
  const [form]  = Form.useForm()
  const [saving,  setSaving]  = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const res = await apiFetch('/')
      if (res.success) setUsers(res.data ?? [])
    } catch { message.error('Không thể tải danh sách người dùng') }
    finally  { setLoading(false) }
  }

  function openCreate() {
    form.resetFields()
    form.setFieldsValue({ status: 'active' })
    setModal({ open: true })
  }

  function openEdit(user: SystemUser) {
    form.setFieldsValue({ ...user, password: '' })
    setModal({ open: true, editing: user })
  }

  async function handleSave() {
    const values = await form.validateFields()
    if (!modal.editing && !values.password?.trim()) {
      message.error('Mật khẩu là bắt buộc khi tạo người dùng mới')
      return
    }
    setSaving(true)
    try {
      const res = modal.editing
        ? await apiFetch(`/${modal.editing._id}`, { method: 'PUT',  headers: {'Content-Type':'application/json'}, body: JSON.stringify(values) })
        : await apiFetch('/',                     { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(values) })
      if (!res.success) throw new Error(res.error)
      message.success(modal.editing ? 'Đã cập nhật' : 'Đã thêm người dùng')
      setModal({ open: false })
      load()
    } catch (e: any) { message.error(e.message) }
    finally { setSaving(false) }
  }

  async function handleDelete(id: string) {
    await apiFetch(`/${id}`, { method: 'DELETE' })
    message.success('Đã xoá')
    load()
  }

  async function handleToggleStatus(user: SystemUser) {
    const next = user.status === 'active' ? 'inactive' : 'active'
    const res  = await apiFetch(`/${user._id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ status: next }) })
    if (res.success) load()
    else message.error(res.error)
  }

  const columns: ColumnsType<SystemUser> = [
    {
      title: 'Người dùng',
      key:   'user',
      render: (_, u) => (
        <div className="flex items-center gap-3">
          <Avatar style={{ background: 'var(--avatar-bg)', flexShrink: 0 }}>
            {u.avatar ? <img src={u.avatar} alt="" /> : getInitials(u.name)}
          </Avatar>
          <div>
            <div className="font-medium text-sm">{u.name}</div>
            <div className="text-xs text-neutral-400">{u.email}</div>
            {u.notes && <div className="text-xs text-neutral-300">{u.notes}</div>}
          </div>
        </div>
      ),
    },
    {
      title:  'Trạng thái',
      key:    'status',
      width:  110,
      render: (_, u) => (
        <Badge
          status={u.status === 'active' ? 'success' : 'default'}
          text={u.status === 'active' ? 'Active' : 'Inactive'}
        />
      ),
    },
    {
      title:  'Đăng nhập cuối',
      key:    'lastLogin',
      width:  150,
      render: (_, u) => u.lastLoginAt
        ? <Text className="text-xs text-neutral-400">{dayjs(u.lastLoginAt).fromNow()}</Text>
        : <span className="text-neutral-300 text-xs">Chưa đăng nhập</span>,
    },
    {
      title:  'Tạo lúc',
      key:    'created',
      width:  130,
      render: (_, u) => <Text className="text-xs text-neutral-400">{dayjs(u.createdAt).fromNow()}</Text>,
    },
    {
      title: '',
      key:   'actions',
      width: 180,
      render: (_, u) => (
        <Space wrap size={4}>
          <Button
            size="small"
            onClick={() => handleToggleStatus(u)}
          >
            {u.status === 'active' ? 'Vô hiệu' : 'Kích hoạt'}
          </Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(u)}>Sửa</Button>
          <Popconfirm
            title="Xoá người dùng này?"
            okText="Xoá" cancelText="Huỷ" okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(u._id)}
          >
            <Button size="small" danger>Xoá</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TeamOutlined className="text-xl text-blue-500" />
          <div>
            <Title level={4} className="!mb-0">Người dùng hệ thống</Title>
            <Text className="text-neutral-400 text-xs">Quản lý tài khoản đăng nhập CMS</Text>
          </div>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading} />
          <Button type="primary" icon={<UserAddOutlined />} onClick={openCreate}>Thêm người dùng</Button>
        </Space>
      </div>

      <Alert
        type="info" showIcon className="mb-4"
        message="Tài khoản ở đây dùng để đăng nhập vào CMS. Mật khẩu được mã hoá SHA-256 phía server."
      />

      <Card>
        <Table
          dataSource={users}
          columns={columns}
          rowKey="_id"
          loading={loading}
          pagination={{ pageSize: 15, showTotal: t => `${t} người dùng` }}
          locale={{ emptyText: 'Chưa có người dùng. Nhấn "Thêm người dùng" để bắt đầu.' }}
        />
      </Card>

      <Modal
        title={modal.editing ? `Sửa: ${modal.editing.name}` : 'Thêm người dùng'}
        open={modal.open}
        onCancel={() => setModal({ open: false })}
        onOk={handleSave}
        okText={modal.editing ? 'Cập nhật' : 'Thêm'}
        confirmLoading={saving}
        forceRender
      >
        <Form form={form} layout="vertical" size="small" className="mt-4">
          <Form.Item name="name" label="Họ tên" rules={[{ required: true, message: 'Nhập tên' }]}>
            <Input placeholder="Nguyễn Văn A" />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Nhập email hợp lệ' }]}>
            <Input placeholder="user@company.com" />
          </Form.Item>
          <Form.Item
            name="password"
            label={modal.editing ? 'Mật khẩu mới (để trống = không đổi)' : 'Mật khẩu'}
            rules={modal.editing ? [] : [{ required: true, min: 6, message: 'Tối thiểu 6 ký tự' }]}
          >
            <Input.Password placeholder={modal.editing ? '(không thay đổi nếu để trống)' : 'Tối thiểu 6 ký tự'} />
          </Form.Item>
          <Form.Item name="status" label="Trạng thái">
            <Select options={[{ label: 'Active', value: 'active' }, { label: 'Inactive', value: 'inactive' }]} />
          </Form.Item>
          <Form.Item name="notes" label="Ghi chú">
            <Input.TextArea rows={2} placeholder="Phòng ban, mô tả…" />
          </Form.Item>
        </Form>
      </Modal>
      <TourGuide pageKey="settings-users" steps={tourSteps['settings-users']} />
    </div>
  )
}
