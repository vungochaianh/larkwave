'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, Tabs, Input, Button, Select, Space, Spin, Typography, Tag, message, Segmented, Tooltip } from 'antd'
import { CopyOutlined, ThunderboltOutlined, TranslationOutlined, EditOutlined, CheckCircleOutlined, ClearOutlined, SwapOutlined } from '@ant-design/icons'
import useLang from '@/store/language'
import TourGuide from '@/components/TourGuide'
import { tourSteps } from '@/lib/tourSteps'

const { TextArea } = Input
const { Title, Text } = Typography

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || 'https://apihoanam.toolswave.net/api')

// Tool definitions with prompts
const TOOLS = {
  summarize: {
    icon: <ThunderboltOutlined />,
    label: { vi: 'Tóm tắt', en: 'Summarize' },
    prompt: (text: string, opt: string) =>
      `Summarize the following text${opt ? ` in ${opt} sentences` : ''}. Keep the key points and important details:\n\n${text}`,
    options: [
      { value: '2', label: { vi: '2 câu', en: '2 sentences' } },
      { value: '3', label: { vi: '3 câu', en: '3 sentences' } },
      { value: '5', label: { vi: '5 câu', en: '5 sentences' } },
      { value: '', label: { vi: 'Tự động', en: 'Auto' } },
    ],
  },
  translate: {
    icon: <TranslationOutlined />,
    label: { vi: 'Dịch thuật', en: 'Translate' },
    prompt: (text: string, opt: string) =>
      `Translate the following text to ${opt}. Only output the translation, no explanations:\n\n${text}`,
    options: [
      { value: 'Vietnamese', label: { vi: 'Tiếng Việt', en: 'Vietnamese' } },
      { value: 'English', label: { vi: 'Tiếng Anh', en: 'English' } },
      { value: 'Japanese', label: { vi: 'Tiếng Nhật', en: 'Japanese' } },
      { value: 'Korean', label: { vi: 'Tiếng Hàn', en: 'Korean' } },
      { value: 'Chinese', label: { vi: 'Tiếng Trung', en: 'Chinese' } },
      { value: 'French', label: { vi: 'Tiếng Pháp', en: 'French' } },
    ],
  },
  rewrite: {
    icon: <EditOutlined />,
    label: { vi: 'Viết lại', en: 'Rewrite' },
    prompt: (text: string, opt: string) =>
      `Rewrite the following text in a ${opt} tone. Keep the same meaning but change the style:\n\n${text}`,
    options: [
      { value: 'professional', label: { vi: 'Chuyên nghiệp', en: 'Professional' } },
      { value: 'casual', label: { vi: 'Thân thiện', en: 'Casual' } },
      { value: 'creative', label: { vi: 'Sáng tạo', en: 'Creative' } },
      { value: 'simplified', label: { vi: 'Đơn giản', en: 'Simplified' } },
      { value: 'formal', label: { vi: 'Trang trọng', en: 'Formal' } },
    ],
  },
  grammar: {
    icon: <CheckCircleOutlined />,
    label: { vi: 'Kiểm tra ngữ pháp', en: 'Grammar Check' },
    prompt: (text: string, _opt: string) =>
      `Check the following text for grammar, spelling, and punctuation errors. First show the corrected version, then list each correction with explanation:\n\n${text}`,
    options: [],
  },
}

type ToolKey = keyof typeof TOOLS

export default function AIToolsPage() {
  const { lang } = useLang()
  const l = (lang as 'vi' | 'en') || 'en'

  const [activeTool, setActiveTool] = useState<ToolKey>('summarize')
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [loading, setLoading] = useState(false)
  const [option, setOption] = useState('')
  const [wordCount, setWordCount] = useState({ input: 0, output: 0 })
  const abortRef = useRef<AbortController | null>(null)

  const tool = TOOLS[activeTool]

  useEffect(() => {
    // Set default option when tool changes
    if (tool.options.length > 0) {
      setOption(tool.options[0].value)
    } else {
      setOption('')
    }
    setOutput('')
  }, [activeTool, tool.options])

  useEffect(() => {
    setWordCount({
      input: input.trim() ? input.trim().split(/\s+/).length : 0,
      output: output.trim() ? output.trim().split(/\s+/).length : 0,
    })
  }, [input, output])

  async function handleProcess() {
    if (!input.trim()) {
      message.warning(l === 'vi' ? 'Vui lòng nhập văn bản' : 'Please enter text')
      return
    }
    setLoading(true)
    setOutput('')

    try {
      const API_ORIGIN = API_BASE.replace(/\/api$/, '')

      // Check if AI is configured
      const cfgRes = await fetch(`${API_ORIGIN}/api/demo/config`)
      const cfgData = await cfgRes.json()
      if (!cfgData.configured) {
        message.error(l === 'vi' ? 'Chưa cấu hình AI. Vào Settings → AI API Keys.' : 'No AI configured. Go to Settings → AI API Keys.')
        setLoading(false)
        return
      }

      const prompt = tool.prompt(input, option)
      abortRef.current = new AbortController()

      const res = await fetch(`${API_ORIGIN}/api/demo/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
        signal: abortRef.current.signal,
      })

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      while (reader) {
        const { done, value } = await reader.read()
        if (done) break
        setOutput(prev => prev + decoder.decode(value, { stream: true }))
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        message.error(err.message || 'Error processing text')
      }
    } finally {
      setLoading(false)
    }
  }

  function handleStop() {
    abortRef.current?.abort()
    setLoading(false)
  }

  function handleCopy() {
    navigator.clipboard.writeText(output)
    message.success(l === 'vi' ? 'Đã copy!' : 'Copied!')
  }

  function handleSwap() {
    setInput(output)
    setOutput('')
  }

  const tabItems = (Object.entries(TOOLS) as [ToolKey, (typeof TOOLS)[ToolKey]][]).map(([key, t]) => ({
    key,
    label: (
      <span>{t.icon} {t.label[l] || t.label.en}</span>
    ),
  }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Title level={3} className="!mb-0">
          <ThunderboltOutlined className="mr-2" />
          {l === 'vi' ? 'Công cụ AI Văn bản' : 'AI Text Tools'}
        </Title>
        <Space>
          <Tag color="blue">{wordCount.input} {l === 'vi' ? 'từ nhập' : 'words in'}</Tag>
          <Tag color="green">{wordCount.output} {l === 'vi' ? 'từ xuất' : 'words out'}</Tag>
        </Space>
      </div>

      <Tabs
        activeKey={activeTool}
        onChange={(k) => setActiveTool(k as ToolKey)}
        items={tabItems}
        className="ai-tools-tabs"
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'start' }}>
        {/* Input */}
        <Card
          title={<Text strong>{l === 'vi' ? 'Văn bản gốc' : 'Input Text'}</Text>}
          size="small"
          extra={
            <Button
              size="small"
              icon={<ClearOutlined />}
              onClick={() => { setInput(''); setOutput('') }}
            >
              {l === 'vi' ? 'Xoá' : 'Clear'}
            </Button>
          }
        >
          <TextArea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={l === 'vi' ? 'Dán văn bản cần xử lý vào đây...' : 'Paste text to process here...'}
            rows={12}
            style={{ fontFamily: 'inherit', fontSize: 14 }}
          />
        </Card>

        {/* Middle controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 48 }}>
          {tool.options.length > 0 && (
            <Select
              value={option}
              onChange={setOption}
              style={{ width: 140 }}
              options={tool.options.map(o => ({
                value: o.value,
                label: o.label[l] || o.label.en,
              }))}
            />
          )}
          <Tooltip title={loading ? (l === 'vi' ? 'Dừng' : 'Stop') : (l === 'vi' ? 'Xử lý' : 'Process')}>
            <Button
              type="primary"
              size="large"
              icon={loading ? <Spin size="small" /> : tool.icon}
              onClick={loading ? handleStop : handleProcess}
              danger={loading}
              style={{ width: 140 }}
            >
              {loading
                ? (l === 'vi' ? 'Dừng' : 'Stop')
                : (l === 'vi' ? 'Xử lý' : 'Process')
              }
            </Button>
          </Tooltip>
          <Tooltip title={l === 'vi' ? 'Hoán đổi kết quả → nhập' : 'Swap output → input'}>
            <Button
              icon={<SwapOutlined />}
              onClick={handleSwap}
              disabled={!output}
              style={{ width: 140 }}
            >
              {l === 'vi' ? 'Hoán đổi' : 'Swap'}
            </Button>
          </Tooltip>
        </div>

        {/* Output */}
        <Card
          title={<Text strong>{l === 'vi' ? 'Kết quả' : 'Output'}</Text>}
          size="small"
          extra={
            <Button
              size="small"
              icon={<CopyOutlined />}
              onClick={handleCopy}
              disabled={!output}
            >
              Copy
            </Button>
          }
        >
          <TextArea
            value={output}
            readOnly
            rows={12}
            placeholder={l === 'vi' ? 'Kết quả sẽ hiện ở đây...' : 'Results will appear here...'}
            style={{ fontFamily: 'inherit', fontSize: 14, background: 'var(--bg-secondary)' }}
          />
        </Card>
      </div>

      <TourGuide pageKey="demo-ai-tools" steps={tourSteps['demo-ai-tools'] || []} />
    </div>
  )
}
