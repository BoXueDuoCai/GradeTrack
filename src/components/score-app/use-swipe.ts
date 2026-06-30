'use client'

import { useEffect, useRef, useState } from 'react'

interface SwipeNavigationOptions {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  threshold?: number
}

export function useSwipeNavigation({ onSwipeLeft, onSwipeRight, threshold = 80 }: SwipeNavigationOptions) {
  const startX = useRef<number | null>(null)
  const startY = useRef<number | null>(null)
  const [showLeftIndicator, setShowLeftIndicator] = useState(false)
  const [showRightIndicator, setShowRightIndicator] = useState(false)

  useEffect(() => {
    if (window.innerWidth > 768) return

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, select, [contenteditable]')) return
      startX.current = e.touches[0].clientX
      startY.current = e.touches[0].clientY
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (startX.current === null || startY.current === null) return
      const dx = e.touches[0].clientX - startX.current
      const dy = e.touches[0].clientY - startY.current
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 30) {
        if (dx > 0) { setShowRightIndicator(true); setShowLeftIndicator(false) }
        else { setShowLeftIndicator(true); setShowRightIndicator(false) }
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (startX.current === null) return
      const endX = e.changedTouches[0].clientX
      const dx = endX - startX.current
      const dy = e.changedTouches[0].clientY - (startY.current ?? 0)
      if (Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy)) {
        if (dx > 0) onSwipeRight?.()
        else onSwipeLeft?.()
      }
      startX.current = null
      startY.current = null
      setShowLeftIndicator(false)
      setShowRightIndicator(false)
    }

    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchmove', handleTouchMove, { passive: true })
    document.addEventListener('touchend', handleTouchEnd, { passive: true })
    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [onSwipeLeft, onSwipeRight, threshold])

  return { showLeftIndicator, showRightIndicator }
}
