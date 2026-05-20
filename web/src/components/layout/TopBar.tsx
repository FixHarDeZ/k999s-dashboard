import { ChevronDown, Check } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

interface DropdownProps {
  value: string
  options: { label: string; value: string }[]
  onChange: (v: string) => void
  placeholder?: string
}

function Dropdown({ value, options, onChange, placeholder }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const current = options.find((o) => o.value === value)
  const label = current?.label ?? placeholder ?? value

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium text-white border border-white/30 bg-white/10 hover:bg-white/20 transition-colors whitespace-nowrap"
      >
        {label}
        <ChevronDown size={11} className="opacity-70 flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[160px] rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className="w-full flex items-center justify-between px-3 py-2 text-[12px] text-gray-800 hover:bg-indigo-50 hover:text-indigo-700 transition-colors text-left"
            >
              <span className="truncate">{opt.label}</span>
              {opt.value === value && <Check size={12} className="text-indigo-600 flex-shrink-0 ml-2" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface TopBarProps {
  context: string
  namespace: string
  namespaces: string[]
  contexts: string[]
  onNamespaceChange: (ns: string) => void
  onContextChange: (ctx: string) => void
}

export function TopBar({ context, namespace, namespaces, contexts, onNamespaceChange, onContextChange }: TopBarProps) {
  const contextOptions = contexts.map((c) => ({ label: c, value: c }))
  const namespaceOptions = [
    { label: 'All Namespaces', value: '' },
    ...namespaces.map((ns) => ({ label: ns, value: ns })),
  ]

  return (
    <header className="h-11 flex items-center justify-between px-4 flex-shrink-0" style={{ backgroundColor: '#4f46e5' }}>
      <div className="flex items-center gap-3">
        <span className="font-bold text-sm text-white tracking-tight select-none">k999s</span>

        {contextOptions.length > 0 && (
          <Dropdown
            value={context}
            options={contextOptions}
            onChange={onContextChange}
            placeholder="No context"
          />
        )}

        <Dropdown
          value={namespace}
          options={namespaceOptions}
          onChange={onNamespaceChange}
          placeholder="All Namespaces"
        />
      </div>
    </header>
  )
}
