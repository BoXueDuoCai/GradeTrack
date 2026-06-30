'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { ScoreApp } from '@/components/score-app/score-app'

export default function Home() {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { refetchOnWindowFocus: false, retry: 1 },
    },
  }))

  return (
    <QueryClientProvider client={client}>
      <ScoreApp />
    </QueryClientProvider>
  )
}
