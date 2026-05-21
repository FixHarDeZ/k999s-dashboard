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
      await onRefresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={cn(
        'text-xs px-2 py-1 rounded border transition-all',
        loading
          ? 'text-primary-400 border-primary-100 cursor-not-allowed'
          : 'text-primary-600 hover:bg-primary-50 border-primary-200 cursor-pointer',
        className,
      )}
    >
      <span style={{ display: 'inline-block', transition: 'transform 0.5s', transform: loading ? 'rotate(360deg)' : 'none' }}>
        ↻
      </span>
      {' '}{loading ? 'Refreshing...' : 'Refresh'}
    </button>
  )
}
