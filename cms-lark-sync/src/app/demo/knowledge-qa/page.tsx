'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, Select, Input, Button, Space, Spin, Typography, Tag, message, Avatar, Empty, Divider, List } from 'antd'
import { RobotOutlined, SendOutlined, UserOutlined, ClearOutlined, DatabaseOutlined, QuestionCircleOutlined } from '@ant-design/icons'
import useLang from '@/store/language'
import TourGuide from '@/components/TourGuide'
import { tourSteps } from '@/lib/tourSteps'

const { Title, Text, Paragraph } = Typography
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'https://apihoanam.toolswave.net/api'

interface Agent {
  _id: string
  name: string
  description: string
  welcomeMessage: string
  knowledgeIds: { _id: string; title: string; sourceType: string }[]
  stats: { totalChats: number }
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export default function KnowledgeQAPage() {
  const { lang } = useLang()
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgent, setSelectedAgent] = useState<string>('')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [agentLoading, setAgentLoading] = useState(true)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    loadAgents()
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadAgents() {
    try {
      const res = await fetch(`${API_BASE}/ai-agents`)
      const data = await res.json()
      setAgents(data.data || [])
      if (data.data?.length) setSelectedAgent(data.data[0]._id)
    } catch (err: any) {
      message.error(err.message)
    } finally {
      setAgentLoading(false)
    }
  }

  const currentAgent = agents.find(a => a._id === selectedAgent)

  function handleAgentChange(id: string) {
    setSelectedAgent(id)
    setMessages([])
  }

  async function handleSend() {
    if (!input.trim() || !selectedAgent) return
    const userMsg: Message = { role: 'user', content: input.trim() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      abortRef.current = new AbortController()
      const res = await fetch(`${API_BASE}/ai-agents/${selectedAgent}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg.content,
          history: messages.slice(-8),
        }),
        signal: abortRef.current.signal,
      })

      // Streaming text response
      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      setMessages(prev => [...prev, { role: 'assistant', content: '' }])

      while (reader) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setMessages(prev => {
          const copy = [...prev]
          copy[copy.length - 1] = { role: 'assistant', content: accumulated }
          return copy
        })
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }])
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Title level={3} className="!mb-0">
          <DatabaseOutlined className="mr-2" />
          {lang === 'vi' ? 'Hỏi đáp Knowledge Base' : 'Knowledge Base Q&A'}
        </Title>
        <Space>
          <Select
            value={selectedAgent}
            onChange={handleAgentChange}
            loading={agentLoading}
            style={{ width: 250 }}
            placeholder={lang === 'vi' ? 'Chọn AI Agent' : 'Select AI Agent'}
            options={agents.map(a => ({ value: a._id, label: `${a.name} (${a.knowledgeIds?.length || 0} docs)` }))}
          />
          <Button icon={<ClearOutlined />} onClick={() => setMessages([])}>
            {lang === 'vi' ? 'Xoá chat' : 'Clear'}
          </Button>
        </Space>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>
        {/* Chat area */}
        <Card
          size="small"
          style={{ height: 'calc(100vh - 220px)', display: 'flex', flexDirection: 'column' }}
          styles={{ body: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 } }}
        >
          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            {currentAgent?.welcomeMessage && messages.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-tertiary)' }}>
                <RobotOutlined style={{ fontSize: 48, marginBottom: 12, opacity: 0.3 }} />
                <Paragraph type="secondary">{currentAgent.welcomeMessage}</Paragraph>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 16, flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
                <Avatar size={32} icon={msg.role === 'user' ? <UserOutlined /> : <RobotOutlined />}
                  style={{ background: msg.role === 'user' ? 'var(--accent-color)' : 'var(--primary-color)', flexShrink: 0 }} />
                <div style={{
                  maxWidth: '75%',
                  padding: '10px 14px',
                  borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: msg.role === 'user' ? 'var(--chat-user-bg)' : 'var(--chat-bot-bg)',
                  color: msg.role === 'user' ? 'var(--chat-user-text)' : 'var(--chat-bot-text)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontSize: 14,
                  lineHeight: 1.6,
                }}>
                  {msg.content}
                  {loading && i === messages.length - 1 && msg.role === 'assistant' && <span className="animate-pulse">|</span>}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: 8 }}>
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              onPressEnter={handleSend}
              placeholder={lang === 'vi' ? 'Nhập câu hỏi...' : 'Ask a question...'}
              disabled={loading || !selectedAgent}
              style={{ flex: 1 }}
              suffix={loading ? <Spin size="small" /> : null}
            />
            <Button type="primary" icon={<SendOutlined />} onClick={handleSend} disabled={!input.trim() || loading}>
              {lang === 'vi' ? 'Gửi' : 'Send'}
            </Button>
          </div>
        </Card>

        {/* Right sidebar: Agent info + Knowledge */}
        <div className="space-y-3">
          {currentAgent && (
            <>
              <Card size="small" title={<Space><RobotOutlined />{currentAgent.name}</Space>}>
                <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>{currentAgent.description || (lang === 'vi' ? 'Không có mô tả' : 'No description')}</Paragraph>
                <Space>
                  <Tag color="blue">{currentAgent.stats?.totalChats || 0} chats</Tag>
                  <Tag>{currentAgent.knowledgeIds?.length || 0} docs</Tag>
                </Space>
              </Card>

              <Card size="small" title={<Space><DatabaseOutlined />{lang === 'vi' ? 'Knowledge Base' : 'Knowledge Base'}</Space>}>
                {currentAgent.knowledgeIds?.length ? (
                  <List
                    size="small"
                    dataSource={currentAgent.knowledgeIds}
                    renderItem={(k: any) => (
                      <List.Item style={{ padding: '4px 0', border: 'none' }}>
                        <Tag color={k.sourceType === 'doc' ? 'blue' : k.sourceType === 'bitable' ? 'orange' : k.sourceType === 'wiki' ? 'purple' : 'default'} style={{ fontSize: 10 }}>
                          {k.sourceType}
                        </Tag>
                        <Text ellipsis style={{ flex: 1, fontSize: 12 }}>{k.title}</Text>
                      </List.Item>
                    )}
                  />
                ) : (
                  <Empty description={lang === 'vi' ? 'Chưa có tài liệu' : 'No documents'} image={Empty.PRESENTED_IMAGE_SIMPLE} />
                )}
              </Card>

              <Card size="small" title={<Space><QuestionCircleOutlined />{lang === 'vi' ? 'Gợi ý câu hỏi' : 'Suggested Questions'}</Space>}>
                <div className="space-y-1">
                  {[
                    lang === 'vi' ? 'Bạn có thể giúp gì cho tôi?' : 'What can you help me with?',
                    lang === 'vi' ? 'Tóm tắt kiến thức bạn có' : 'Summarize your knowledge',
                    lang === 'vi' ? 'Liệt kê các tài liệu bạn biết' : 'List the documents you know',
                  ].map((q, i) => (
                    <Button key={i} type="dashed" size="small" block style={{ textAlign: 'left', height: 'auto', whiteSpace: 'normal', padding: '4px 8px' }}
                      onClick={() => { setInput(q); }}>
                      {q}
                    </Button>
                  ))}
                </div>
              </Card>
            </>
          )}
        </div>
      </div>

      <TourGuide pageKey="demo-knowledge-qa" steps={tourSteps['demo-knowledge-qa'] || []} />
    </div>
  )
}
