'use client'

import { useState, useRef } from 'react'
import { Card, Upload, Button, Select, Spin, Typography, Space, message, Tag, Radio, Divider, Empty } from 'antd'
import { InboxOutlined, CopyOutlined, EyeOutlined, FileTextOutlined, TableOutlined, AimOutlined, CameraOutlined, DeleteOutlined } from '@ant-design/icons'
import useLang from '@/store/language'
import TourGuide from '@/components/TourGuide'
import { tourSteps } from '@/lib/tourSteps'

const { Dragger } = Upload
const { Title, Paragraph, Text } = Typography

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'https://apihoanam.toolswave.net/api'
const API_ORIGIN = API_BASE.replace(/\/api$/, '')

const MODES = [
  { key: 'describe', icon: <EyeOutlined />, label: { vi: 'M\u00f4 t\u1ea3 h\u00ecnh \u1ea3nh', en: 'Describe Image' }, prompt: 'Describe this image in detail. What do you see? Include colors, objects, text, layout, and any notable features.' },
  { key: 'ocr', icon: <FileTextOutlined />, label: { vi: 'Tr\u00edch xu\u1ea5t v\u0103n b\u1ea3n (OCR)', en: 'Extract Text (OCR)' }, prompt: 'Extract ALL text from this image. Preserve the layout and formatting as much as possible. Output the text exactly as it appears.' },
  { key: 'data', icon: <TableOutlined />, label: { vi: 'Tr\u00edch xu\u1ea5t d\u1eef li\u1ec7u', en: 'Extract Data' }, prompt: 'Extract structured data from this image. If it contains a table, form, receipt, or document, convert it to a markdown table or structured format. Include all fields and values.' },
  { key: 'objects', icon: <AimOutlined />, label: { vi: 'Nh\u1eadn di\u1ec7n \u0111\u1ed1i t\u01b0\u1ee3ng', en: 'Identify Objects' }, prompt: 'Identify and list all objects, people, text, logos, and notable elements in this image. For each, describe its position, size, and any relevant details.' },
]

export default function ImageAnalyzerPage() {
  const { lang } = useLang()
  const [imageData, setImageData] = useState<string | null>(null)
  const [mimeType, setMimeType] = useState<string>('image/jpeg')
  const [fileName, setFileName] = useState<string>('')
  const [mode, setMode] = useState('describe')
  const [output, setOutput] = useState('')
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  function handleUpload(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1]
      setImageData(base64)
      setMimeType(file.type || 'image/jpeg')
      setFileName(file.name)
      setOutput('')
    }
    reader.readAsDataURL(file)
    return false // prevent auto upload
  }

  async function handleAnalyze() {
    if (!imageData) {
      message.warning(lang === 'vi' ? 'Vui lòng tải ảnh lên' : 'Please upload an image')
      return
    }

    setLoading(true)
    setOutput('')

    try {
      // Check if AI is configured via backend proxy
      const cfgRes = await fetch(`${API_ORIGIN}/api/demo/config`)
      const cfgData = await cfgRes.json()
      if (!cfgData.configured) {
        message.error(lang === 'vi' ? 'Chưa cấu hình AI. Vào Settings → AI API Keys.' : 'No AI configured. Go to Settings → AI API Keys.')
        setLoading(false)
        return
      }

      const selectedMode = MODES.find(m => m.key === mode)!
      abortRef.current = new AbortController()

      const res = await fetch(`${API_ORIGIN}/api/demo/vision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: selectedMode.prompt,
          imageBase64: imageData,
          mimeType,
        }),
        signal: abortRef.current.signal,
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || `HTTP ${res.status}`)
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      while (reader) {
        const { done, value } = await reader.read()
        if (done) break
        setOutput(prev => prev + decoder.decode(value, { stream: true }))
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        message.error(err.message || 'Error analyzing image')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <Title level={3} className="!mb-0">
        <CameraOutlined className="mr-2" />
        {lang === 'vi' ? 'Ph\u00e2n t\u00edch H\u00ecnh \u1ea3nh AI' : 'AI Image Analyzer'}
      </Title>
      <Paragraph type="secondary">
        {lang === 'vi'
          ? 'T\u1ea3i \u1ea3nh l\u00ean v\u00e0 ch\u1ecdn ch\u1ebf \u0111\u1ed9 ph\u00e2n t\u00edch. AI s\u1ebd m\u00f4 t\u1ea3, tr\u00edch xu\u1ea5t v\u0103n b\u1ea3n, d\u1eef li\u1ec7u, ho\u1eb7c nh\u1eadn di\u1ec7n \u0111\u1ed1i t\u01b0\u1ee3ng.'
          : 'Upload an image and select analysis mode. AI will describe, extract text, data, or identify objects.'}
      </Paragraph>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Left: Upload + Preview */}
        <div className="space-y-3">
          <Card size="small" title={lang === 'vi' ? 'T\u1ea3i \u1ea3nh l\u00ean' : 'Upload Image'}>
            {!imageData ? (
              <Dragger
                accept="image/*"
                showUploadList={false}
                beforeUpload={handleUpload}
                style={{ padding: 20 }}
              >
                <p className="ant-upload-drag-icon"><InboxOutlined style={{ fontSize: 40, color: 'var(--accent-color)' }} /></p>
                <p>{lang === 'vi' ? 'K\u00e9o th\u1ea3 ho\u1eb7c nh\u1ea5n \u0111\u1ec3 ch\u1ecdn \u1ea3nh' : 'Drag & drop or click to select image'}</p>
                <p style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>PNG, JPG, WEBP, GIF</p>
              </Dragger>
            ) : (
              <div className="space-y-3">
                <div style={{ textAlign: 'center', background: 'var(--bg-secondary)', borderRadius: 8, padding: 8 }}>
                  <img
                    src={`data:${mimeType};base64,${imageData}`}
                    alt="preview"
                    style={{ maxHeight: 300, maxWidth: '100%', borderRadius: 6, objectFit: 'contain' }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Tag>{fileName}</Tag>
                  <Button size="small" danger icon={<DeleteOutlined />} onClick={() => { setImageData(null); setOutput('') }}>
                    {lang === 'vi' ? 'Xo\u00e1 \u1ea3nh' : 'Remove'}
                  </Button>
                </div>
              </div>
            )}
          </Card>

          <Card size="small" title={lang === 'vi' ? 'Ch\u1ebf \u0111\u1ed9 ph\u00e2n t\u00edch' : 'Analysis Mode'}>
            <Radio.Group value={mode} onChange={e => { setMode(e.target.value); setOutput('') }} className="space-y-2" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {MODES.map(m => (
                <Radio key={m.key} value={m.key}>
                  <Space>{m.icon} {m.label[lang as 'vi' | 'en'] || m.label.en}</Space>
                </Radio>
              ))}
            </Radio.Group>
            <Divider style={{ margin: '12px 0' }} />
            <Button
              type="primary"
              block
              icon={loading ? <Spin size="small" /> : <EyeOutlined />}
              onClick={loading ? () => abortRef.current?.abort() : handleAnalyze}
              danger={loading}
              disabled={!imageData}
            >
              {loading ? (lang === 'vi' ? '\u0110ang ph\u00e2n t\u00edch... (nh\u1ea5n \u0111\u1ec3 d\u1eebng)' : 'Analyzing... (click to stop)') : (lang === 'vi' ? 'Ph\u00e2n t\u00edch' : 'Analyze')}
            </Button>
          </Card>
        </div>

        {/* Right: Results */}
        <Card
          size="small"
          title={lang === 'vi' ? 'K\u1ebft qu\u1ea3 ph\u00e2n t\u00edch' : 'Analysis Results'}
          extra={
            <Button size="small" icon={<CopyOutlined />} onClick={() => { navigator.clipboard.writeText(output); message.success('Copied!') }} disabled={!output}>
              Copy
            </Button>
          }
        >
          {output ? (
            <pre style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily: 'inherit',
              fontSize: 14,
              lineHeight: 1.6,
              minHeight: 400,
              margin: 0,
              color: 'var(--text-color)',
            }}>
              {output}
              {loading && <span className="animate-pulse">|</span>}
            </pre>
          ) : (
            <Empty
              description={lang === 'vi' ? 'T\u1ea3i \u1ea3nh v\u00e0 nh\u1ea5n "Ph\u00e2n t\u00edch" \u0111\u1ec3 b\u1eaft \u0111\u1ea7u' : 'Upload image and click "Analyze" to start'}
              style={{ minHeight: 400, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
            />
          )}
        </Card>
      </div>

      <TourGuide pageKey="demo-image-analyzer" steps={tourSteps['demo-image-analyzer'] || []} />
    </div>
  )
}
