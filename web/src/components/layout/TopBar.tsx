import { useState, useRef, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { SlidersHorizontal } from 'lucide-react'

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
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const label = options.find((o) => o.value === value)?.label ?? placeholder ?? value

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(255,255,255,0.15)',
          border: '1px solid rgba(255,255,255,0.35)',
          borderRadius: 6, padding: '4px 10px',
          fontSize: 11, fontWeight: 500,
          color: '#ffffff', cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
        <span style={{ opacity: 0.7, fontSize: 9 }}>▾</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4,
          background: '#fff', border: '1px solid #e0e7ff',
          borderRadius: 8, boxShadow: '0 4px 16px rgba(79,70,229,0.12)',
          minWidth: 180, zIndex: 1000,
          maxHeight: 280, overflowY: 'auto',
        }}>
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false) }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px', fontSize: 12, textAlign: 'left',
                background: opt.value === value ? '#eef2ff' : '#fff',
                color: opt.value === value ? '#4338ca' : '#374151',
                border: 'none', cursor: 'pointer',
                borderBottom: '1px solid #f3f4f6',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#eef2ff')}
              onMouseLeave={e => (e.currentTarget.style.background = opt.value === value ? '#eef2ff' : '#fff')}
            >
              <span>{opt.label}</span>
              {opt.value === value && <span style={{ color: '#4f46e5', fontSize: 11 }}>✓</span>}
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
  return (
    <header style={{
      backgroundColor: '#4f46e5',
      height: 44, display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', padding: '0 16px',
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: '#ffffff', letterSpacing: '-0.02em' }}>
          k999s
        </span>

        <Dropdown
          value={context}
          options={contexts.map((c) => ({ label: c, value: c }))}
          onChange={onContextChange}
          placeholder="No context"
        />

        <Dropdown
          value={namespace}
          options={[
            { label: 'All Namespaces', value: '' },
            ...namespaces.map((ns) => ({ label: ns, value: ns })),
          ]}
          onChange={onNamespaceChange}
          placeholder="All Namespaces"
        />
      </div>

      <NavLink
        to="/settings"
        style={({ isActive }) => ({
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
          color: '#ffffff', textDecoration: 'none',
          background: isActive ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.12)',
          border: '1px solid rgba(255,255,255,0.25)',
        })}
      >
        <SlidersHorizontal size={13} />
        Settings
      </NavLink>
    </header>
  )
}
