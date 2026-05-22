import { NavLink } from 'react-router-dom'
import { Box, Rocket, Globe, Settings, Server, FolderOpen, Telescope, LayoutDashboard, Cpu, Lock, Activity, BarChart2, GitBranch, Layers, Waypoints, Bird, Network, Package, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CRDPresence } from '@/lib/types'

interface NavItem {
  label: string
  to: string
  icon: React.ReactNode
}

interface NavGroup {
  title: string
  items: NavItem[]
}

interface SidebarProps {
  detectedCRDs?: CRDPresence
}

export function Sidebar({ detectedCRDs }: SidebarProps) {
  const navGroups: NavGroup[] = [
    {
      title: 'Overview',
      items: [
        { label: 'Cluster Overview', to: '/', icon: <LayoutDashboard size={14} /> },
        { label: 'Topology', to: '/topology', icon: <GitBranch size={14} /> },
        { label: 'Events', to: '/events', icon: <Activity size={14} /> },
        { label: 'Top', to: '/top', icon: <BarChart2 size={14} /> },
      ],
    },
    {
      title: 'Workloads',
      items: [
        { label: 'Pods', to: '/pods', icon: <Box size={14} /> },
        { label: 'Deployments', to: '/deployments', icon: <Rocket size={14} /> },
        { label: 'StatefulSets', to: '/statefulsets', icon: <Server size={14} /> },
        { label: 'DaemonSets', to: '/daemonsets', icon: <Shield size={14} /> },
      ],
    },
    {
      title: 'Network',
      items: [
        { label: 'Services', to: '/services', icon: <Globe size={14} /> },
        { label: 'Ingresses', to: '/ingress', icon: <Network size={14} /> },
        ...(detectedCRDs?.istio ? [{ label: 'Istio', to: '/istio', icon: <Layers size={14} /> }] : []),
        ...(detectedCRDs?.gatewayApi ? [{ label: 'Gateway API', to: '/gateway', icon: <Waypoints size={14} /> }] : []),
        ...(detectedCRDs?.flaggerCanary || detectedCRDs?.argoRollouts ? [{ label: 'Canary', to: '/canary', icon: <Bird size={14} /> }] : []),
      ],
    },
    {
      title: 'Config & Storage',
      items: [
        { label: 'ConfigMaps', to: '/configmaps', icon: <Settings size={14} /> },
        { label: 'Secrets', to: '/secrets', icon: <Lock size={14} /> },
      ],
    },
    {
      title: 'Cluster',
      items: [
        { label: 'Nodes', to: '/nodes', icon: <Cpu size={14} /> },
        { label: 'Helm', to: '/helm', icon: <Package size={14} /> },
        { label: 'Namespaces', to: '/namespaces', icon: <FolderOpen size={14} /> },
        { label: 'Resource Explorer', to: '/explorer', icon: <Telescope size={14} /> },
      ],
    },
  ]

  return (
    <aside className="w-48 bg-[#f8f7ff] border-r border-primary-100 flex-shrink-0 overflow-y-auto flex flex-col">
      <div className="px-3 py-4 flex-1">
        <div className="mb-6">
          <span className="text-base font-bold text-primary-600">k999s</span>
        </div>
        <div className="space-y-4">
          {navGroups.map((group) => (
            <div key={group.title}>
              <p className="text-[9px] font-bold text-primary-500/60 uppercase tracking-widest mb-1 px-2">
                {group.title}
              </p>
              <nav className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors',
                        isActive
                          ? 'bg-primary-600 text-white'
                          : 'text-primary-700 hover:bg-primary-100',
                      )
                    }
                  >
                    {item.icon}
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}
