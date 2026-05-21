import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { useState, useEffect } from 'react'
import { fetchNamespaces, fetchContexts, fetchDetectedCRDs, switchContext } from '@/lib/api'
import type { ContextInfo, CRDPresence } from '@/lib/types'

export function AppLayout() {
  const [namespace, setNamespace] = useState('')
  const [namespaces, setNamespaces] = useState<string[]>([])
  const [contexts, setContexts] = useState<ContextInfo[]>([])
  const [currentContext, setCurrentContext] = useState('')
  const [detectedCRDs, setDetectedCRDs] = useState<CRDPresence>({ istio: false, gatewayApi: false, flaggerCanary: false, argoRollouts: false })

  const reloadClusterData = () => {
    setNamespace('')
    fetchNamespaces().then(setNamespaces).catch(console.error)
    fetchDetectedCRDs().then(setDetectedCRDs).catch(console.error)
  }

  useEffect(() => {
    fetchNamespaces().then(setNamespaces).catch(console.error)
    fetchContexts().then((ctxs) => {
      setContexts(ctxs)
      const current = ctxs.find((c) => c.current)
      if (current) setCurrentContext(current.name)
    }).catch(console.error)
    fetchDetectedCRDs().then(setDetectedCRDs).catch(console.error)
  }, [])

  const handleContextChange = async (ctx: string) => {
    if (ctx === currentContext) return
    const prev = currentContext
    setCurrentContext(ctx) // update dropdown immediately (optimistic)
    try {
      await switchContext(ctx)
      reloadClusterData()
    } catch (e) {
      setCurrentContext(prev) // rollback on error
      console.error('Failed to switch context:', e)
    }
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-white">
      <TopBar
        context={currentContext}
        namespace={namespace}
        namespaces={namespaces}
        contexts={contexts.map((c) => c.name)}
        onNamespaceChange={setNamespace}
        onContextChange={handleContextChange}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar detectedCRDs={detectedCRDs} />
        <main className="flex-1 overflow-auto p-4">
          <Outlet context={{ namespace, context: currentContext }} />
        </main>
      </div>
    </div>
  )
}
