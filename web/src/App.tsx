import { Routes, Route } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Overview } from '@/pages/Overview'
import { Pods } from '@/pages/Pods'
import { Deployments } from '@/pages/Deployments'
import { Services } from '@/pages/Services'
import { Nodes } from '@/pages/Nodes'
import { Namespaces } from '@/pages/Namespaces'
import { ConfigMaps } from '@/pages/ConfigMaps'
import { Secrets } from '@/pages/Secrets'
import { Events } from '@/pages/Events'
import { Top } from '@/pages/Top'
import { Topology } from '@/pages/Topology'
import { ResourceExplorer } from '@/pages/ResourceExplorer'
import { Settings } from '@/pages/Settings'

function Placeholder({ title }: { title: string }) {
  return <div className="text-primary-700 font-medium">{title} — coming soon</div>
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Overview />} />
        <Route path="/topology" element={<Topology />} />
        <Route path="/events" element={<Events />} />
        <Route path="/top" element={<Top />} />
        <Route path="/pods" element={<Pods />} />
        <Route path="/deployments" element={<Deployments />} />
        <Route path="/statefulsets" element={<Placeholder title="StatefulSets" />} />
        <Route path="/services" element={<Services />} />
        <Route path="/configmaps" element={<ConfigMaps />} />
        <Route path="/secrets" element={<Secrets />} />
        <Route path="/nodes" element={<Nodes />} />
        <Route path="/namespaces" element={<Namespaces />} />
        <Route path="/explorer" element={<ResourceExplorer />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}
