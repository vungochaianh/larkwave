'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Tour, Button, Tooltip } from 'antd'
import { QuestionCircleOutlined } from '@ant-design/icons'
import useLang from '@/store/language'

// ── Types ────────────────────────────────────────────────────────────────────

export interface TourStep {
  title: { vi: string; en: string }
  description: { vi: string; en: string }
  target?: string | (() => HTMLElement | null)
  placement?: 'left' | 'leftTop' | 'leftBottom' | 'right' | 'rightTop' | 'rightBottom' | 'top' | 'topLeft' | 'topRight' | 'bottom' | 'bottomLeft' | 'bottomRight' | 'center'
  cover?: React.ReactNode
  /**
   * Action to perform BEFORE showing this step.
   * Use this to open modals/drawers so the tour can highlight elements inside them.
   * Return a cleanup function to close the modal/drawer when leaving this step.
   */
  beforeStep?: () => (() => void) | void
  /**
   * Delay in ms after beforeStep before showing the step (for modal animation).
   * Default: 400ms
   */
  stepDelay?: number
}

interface TourGuideProps {
  pageKey: string
  steps: TourStep[]
}

// ── Bilingual labels ─────────────────────────────────────────────────────────

const labels = {
  vi: {
    tooltip: 'Hướng dẫn sử dụng',
    prev: 'Quay lại',
    next: 'Tiếp theo',
    finish: 'Hoàn tất',
  },
  en: {
    tooltip: 'User Guide',
    prev: 'Previous',
    next: 'Next',
    finish: 'Finish',
  },
}

// ── Component ────────────────────────────────────────────────────────────────

export default function TourGuide({ pageKey, steps }: TourGuideProps) {
  const { lang } = useLang()
  const l = labels[lang as 'vi' | 'en'] || labels.vi
  const [open, setOpen] = useState(false)
  const [firstVisit, setFirstVisit] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [cleanupFn, setCleanupFn] = useState<(() => void) | null>(null)

  useEffect(() => {
    const seen = localStorage.getItem(`tour-${pageKey}`)
    if (!seen) setFirstVisit(true)
  }, [pageKey])

  // Run beforeStep when step changes
  useEffect(() => {
    if (!open) return
    const step = steps[currentStep]
    if (!step?.beforeStep) return

    const timer = setTimeout(() => {
      // Cleanup previous step's action
      if (cleanupFn) {
        cleanupFn()
        setCleanupFn(null)
      }
      const cleanup = step.beforeStep!()
      if (typeof cleanup === 'function') {
        setCleanupFn(() => cleanup)
      }
    }, 50)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentStep])

  const handleOpen = useCallback(() => {
    setCurrentStep(0)
    setOpen(true)
    setFirstVisit(false)
  }, [])

  const handleClose = useCallback(() => {
    setOpen(false)
    localStorage.setItem(`tour-${pageKey}`, '1')
    // Cleanup any open modals/drawers from beforeStep
    if (cleanupFn) {
      cleanupFn()
      setCleanupFn(null)
    }
  }, [pageKey, cleanupFn])

  const handleStepChange = useCallback((step: number) => {
    // Cleanup previous step before moving
    if (cleanupFn) {
      cleanupFn()
      setCleanupFn(null)
    }
    setCurrentStep(step)
  }, [cleanupFn])

  // Build Ant Design Tour steps with i18n + bilingual buttons
  const tourSteps = steps.map((s, idx) => ({
    title: s.title[lang as 'vi' | 'en'] || s.title.en,
    description: s.description[lang as 'vi' | 'en'] || s.description.en,
    target: typeof s.target === 'string'
      ? () => document.querySelector(s.target as string) as HTMLElement | null
      : s.target ?? undefined,
    placement: s.placement,
    cover: s.cover,
    prevButtonProps: { children: l.prev },
    nextButtonProps: { children: idx === steps.length - 1 ? l.finish : l.next },
  }))

  if (!steps.length) return null

  return (
    <>
      <Tooltip title={l.tooltip} placement="left">
        <Button
          type="primary"
          shape="circle"
          size="large"
          icon={<QuestionCircleOutlined />}
          onClick={handleOpen}
          className={firstVisit ? 'tour-guide-pulse' : ''}
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 99,
            width: 48,
            height: 48,
            fontSize: 20,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        />
      </Tooltip>
      <Tour
        open={open}
        onClose={handleClose}
        current={currentStep}
        onChange={handleStepChange}
        steps={tourSteps as any}
        indicatorsRender={(current, total) => (
          <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
            {current + 1} / {total}
          </span>
        )}
      />
    </>
  )
}
