'use client'

import React, { useEffect, useState } from 'react'

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'https://apihoanam.toolswave.net/api'
import { RobotOutlined, UserOutlined, CopyOutlined } from '@ant-design/icons'
import { Spin, message } from 'antd'

interface SharedMsg {
  role: 'user' | 'assistant'
  content: string
  hasImage?: boolean
  timestamp?: string
}

interface SharedConv {
  _id: string
  title: string
  createdAt: string
  messages: SharedMsg[]
}

function timeStr(ts?: string) {
  if (!ts) return ''
  return new Date(ts).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
}

function renderText(text: string) {
  return text.split('\n').map((line, i) => (
    <p key={i} style={{ margin: '2px 0', lineHeight: 1.75, fontSize: 14, wordBreak: 'break-word' }}>{line || '\u00a0'}</p>
  ))
}

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const [conv, setConv]     = useState<SharedConv | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')
  const [token, setToken]   = useState('')

  useEffect(() => {
    params.then(p => setToken(p.token))
  }, [params])

  useEffect(() => {
    if (!token) return
    fetch(`${API_BASE}/chat-conversations/share/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) setConv(d.data)
        else setError(d.error || 'Cuộc trò chuyện không tồn tại hoặc chưa được chia sẻ công khai.')
      })
      .catch(() => setError('Không thể tải cuộc trò chuyện.'))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-secondary)' }}>
      <Spin size="large" />
    </div>
  )

  if (error || !conv) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-secondary)', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 48 }}>🔒</div>
      <div style={{ fontSize: 16, color: 'var(--accent-color)', fontWeight: 600 }}>{error || 'Không tìm thấy'}</div>
      <a href="/" style={{ color: 'var(--accent-color)', fontSize: 13 }}>← Về trang chủ</a>
    </div>
  )

  const shareUrl = typeof window !== 'undefined' ? window.location.href : ''

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-secondary)', fontFamily: '"Inter","Segoe UI",sans-serif' }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'var(--bg-color)', borderBottom: '1px solid var(--border-color)',
        padding: '0 20px', height: 56,
        display: 'flex', alignItems: 'center', gap: 12,
        boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9,
          background: 'var(--accent-color)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <RobotOutlined style={{ color: 'var(--text-inverse)', fontSize: 16 }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-color)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {conv.title}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            Cuộc trò chuyện được chia sẻ · {new Date(conv.createdAt).toLocaleDateString('vi-VN')}
          </div>
        </div>
        <button
          onClick={() => { navigator.clipboard.writeText(shareUrl); message.success('Đã copy link!') }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 99,
            background: 'var(--accent-color)',
            border: 'none', cursor: 'pointer', color: 'var(--text-inverse)',
            fontSize: 12, fontWeight: 600,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <CopyOutlined /> Copy link
        </button>
      </div>

      {/* Messages */}
      <div style={{ maxWidth: 780, margin: '0 auto', padding: '32px 16px 64px' }}>
        {conv.messages.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 60, fontSize: 14 }}>
            Chưa có tin nhắn nào.
          </div>
        )}
        {conv.messages.map((m, i) => {
          const isUser = m.role === 'user'
          return (
            <div key={i} style={{
              display: 'flex', flexDirection: isUser ? 'row-reverse' : 'row',
              gap: 10, marginBottom: 22, alignItems: 'flex-end',
            }}>
              {/* Avatar */}
              <div style={{
                width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isUser ? 'var(--accent-color)' : 'var(--avatar-bg)',
                fontSize: 15, color: 'var(--text-inverse)',
                boxShadow: 'var(--shadow-sm)',
              }}>
                {isUser ? <UserOutlined /> : <RobotOutlined />}
              </div>

              {/* Bubble */}
              <div style={{ maxWidth: '72%' }}>
                <div style={{
                  background: isUser ? 'var(--chat-user-bg)' : 'var(--bg-color)',
                  color: isUser ? 'var(--chat-user-text)' : 'var(--text-color)',
                  padding: '11px 16px',
                  borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                  boxShadow: 'var(--shadow-sm)',
                  border: isUser ? 'none' : '1px solid var(--border-color)',
                }}>
                  {m.hasImage && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
                      padding: '5px 10px', borderRadius: 8,
                      background: 'var(--bg-secondary)',
                      fontSize: 12, color: 'var(--text-secondary)',
                    }}>
                      🖼️ Đã gửi ảnh
                    </div>
                  )}
                  {renderText(m.content)}
                </div>
                {m.timestamp && (
                  <div style={{
                    fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4,
                    textAlign: isUser ? 'right' : 'left',
                  }}>
                    {timeStr(m.timestamp)}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'linear-gradient(0deg, var(--bg-secondary) 60%, transparent)',
        padding: '20px 0 16px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          Powered by <span style={{ color: 'var(--accent-color)', fontWeight: 700 }}>CMS Hoa Nam AI</span>
        </div>
      </div>
    </div>
  )
}
