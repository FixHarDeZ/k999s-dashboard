import { Routes, Route } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Pods } from '@/pages/Pods'
import { Deployments } from '@/pages/Deployments'

function Placeholder({ title }: { title: string }) {
  return <div className="text-primary-700 font-medium">{title} — coming soon</div>
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Placeholder title="Cluster Overview" />} />
        <Route path="/pods" element={<Pods />} />
        <Route path="/deployments" element={<Deployments />} />
        <Route path="/statefulsets" element={<Placeholder title="StatefulSets" />} />
        <Route path="/services" element={<Placeholder title="Services" />} />
        <Route path="/configmaps" element={<Placeholder title="ConfigMaps" />} />
        <Route path="/nodes" element={<Placeholder title="Nodes" />} />
        <Route path="/namespaces" element={<Placeholder title="Namespaces" />} />
        <Route path="/explorer" element={<Placeholder title="Resource Explorer" />} />
      </Route>
    </Routes>
  )
}
