import { useState } from 'react'
import { cn } from '@/lib/utils'

interface RefreshButtonProps {
  onRefresh: () => Promise<void> | void
  className?: string
}

export function RefreshButton({ onRefresh, className }: RefreshButtonProps) {
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    if (loading) return
    setLoading(true)
    try {
      // Wrap in Promise.resolve so both void and Promise<void> work
      await Promise.all([
        Promise.resolve(onRefresh()),
        // Minimum 400ms so the loading state is always visible
        new Promise<void>((r) => setTimeout(r, 400)),
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={cn(
        'text-xs px-2 py-1 rounded border transition-all select-none',
        loading
          ? 'text-primary-400 border-primary-100 cursor-not-allowed'
          : 'text-primary-600 hover:bg-primary-50 border-primary-200 cursor-pointer',
        className,
      )}
    >
      <span
        style={{
          display: 'inline-block',
          animation: loading ? 'spin 0.6s linear infinite' : 'none',
        }}
      >
        ↻
      </span>
      {' '}{loading ? 'Refreshing...' : 'Refresh'}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </button>
  )
}
