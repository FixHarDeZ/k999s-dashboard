import { ChevronDown } from 'lucide-react'

interface TopBarProps {
  context: string
  namespace: string
  namespaces: string[]
  contexts: string[]
  onNamespaceChange: (ns: string) => void
  onContextChange: (ctx: string) => void
}

function TopBarSelect({
  value,
  onChange,
  children,
}: {
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
}) {
  return (
    <div className="relative flex items-center">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ color: '#fff', backgroundColor: 'rgba(255,255,255,0.15)' }}
        className="appearance-none rounded-md pl-2 pr-6 py-1 text-[11px] border border-white/20 outline-none cursor-pointer hover:bg-white/25 transition-colors"
      >
        {children}
      </select>
      <ChevronDown size={11} className="absolute right-1.5 pointer-events-none text-white/70" />
    </div>
  )
}

export function TopBar({ context, namespace, namespaces, contexts, onNamespaceChange, onContextChange }: TopBarProps) {
  return (
    <header style={{ backgroundColor: '#4f46e5' }} className="text-white h-11 flex items-center justify-between px-4 flex-shrink-0">
      <div className="flex items-center gap-3">
        <span className="font-bold text-sm tracking-tight text-white">k999s</span>

        <TopBarSelect value={context} onChange={onContextChange}>
          {contexts.map((ctx) => (
            <option key={ctx} value={ctx} style={{ color: '#000', backgroundColor: '#fff' }}>{ctx}</option>
          ))}
        </TopBarSelect>

        <TopBarSelect value={namespace} onChange={onNamespaceChange}>
          <option value="" style={{ color: '#000', backgroundColor: '#fff' }}>All Namespaces</option>
          {namespaces.map((ns) => (
            <option key={ns} value={ns} style={{ color: '#000', backgroundColor: '#fff' }}>{ns}</option>
          ))}
        </TopBarSelect>
      </div>
    </header>
  )
}
