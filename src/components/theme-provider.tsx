'use client'

import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'dark' | 'light'

interface ThemeContextType {
  theme: Theme
  toggleTheme: () => void
  setTheme: (t: Theme) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // 首次渲染固定为 dark，避免 SSR/CSR hydration mismatch
  // 真正的主题在 layout.tsx 的内联脚本里已经同步设置到 <html> 上
  const [theme, setThemeState] = useState<Theme>('dark')

  // 客户端 mount 后，读取 localStorage 同步到 React state
  useEffect(() => {
    const stored = localStorage.getItem('theme')
    if (stored === 'light' || stored === 'dark') {
      // 这是首次挂载时的必要同步：把外部 localStorage 的值读取到 React state
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setThemeState(stored)
    }
    // 监听跨标签页同步
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'theme' && (e.newValue === 'dark' || e.newValue === 'light')) {
        setThemeState(e.newValue)
        const root = document.documentElement
        root.classList.remove('dark', 'light')
        root.classList.add(e.newValue)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setTheme = (t: Theme) => {
    setThemeState(t)
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme', t)
      const root = document.documentElement
      root.classList.remove('dark', 'light')
      root.classList.add(t)
    }
  }

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark')

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
