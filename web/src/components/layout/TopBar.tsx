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
    <header className="bg-primary-600 text-white h-11 flex items-center justify-between px-4 flex-shrink-0">
      <div className="flex items-center gap-3">
        <span className="font-bold text-sm tracking-tight">k999s</span>

        <select
          value={context}
          onChange={(e) => onContextChange(e.target.value)}
          className="bg-white/15 rounded-md px-2 py-1 text-[11px] border-0 outline-none cursor-pointer hover:bg-white/20"
        >
          {contexts.map((ctx) => (
            <option key={ctx} value={ctx} className="text-black">{ctx}</option>
          ))}
        </select>

        <select
          value={namespace}
          onChange={(e) => onNamespaceChange(e.target.value)}
          className="bg-white/15 rounded-md px-2 py-1 text-[11px] border-0 outline-none cursor-pointer hover:bg-white/20"
        >
          <option value="">All Namespaces</option>
          {namespaces.map((ns) => (
            <option key={ns} value={ns} className="text-black">{ns}</option>
          ))}
        </select>
      </div>
    </header>
  )
}
