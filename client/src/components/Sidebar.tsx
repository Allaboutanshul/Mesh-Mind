import { NavLink, useLocation } from 'react-router-dom';
import { useStore } from '../store/useStore';
import {
  Shield, LayoutDashboard, Network, MessageSquare, AlertTriangle,
  Server, Brain, BarChart3, FlaskConical, Settings, Info, ChevronLeft, ChevronRight, Wifi, WifiOff
} from 'lucide-react';

const NAV_ITEMS = [
  { path: '/', icon: Shield, label: 'Home' },
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/network', icon: Network, label: 'Mesh Network' },
  { path: '/messages', icon: MessageSquare, label: 'Messages' },
  { path: '/sos', icon: AlertTriangle, label: 'Emergency SOS' },
  { path: '/nodes', icon: Server, label: 'Nodes' },
  { path: '/routing', icon: Brain, label: 'Routing AI' },
  { path: '/analytics', icon: BarChart3, label: 'Analytics' },
  { path: '/simulation', icon: FlaskConical, label: 'Simulation Lab' },
  { path: '/settings', icon: Settings, label: 'Settings' },
  { path: '/about', icon: Info, label: 'About' },
];

export default function Sidebar() {
  const { sidebarOpen, setSidebarOpen, backendConnected, meshActive } = useStore();
  const location = useLocation();

  return (
    <aside className={`fixed left-0 top-0 h-full bg-[#111827] border-r border-[#1e2d3d] z-40 transition-all duration-300 flex flex-col ${
      sidebarOpen ? 'w-64' : 'w-16'
    }`}>
      {/* Header */}
      <div className="p-4 border-b border-[#1e2d3d] flex items-center gap-3">
        <Shield className="w-7 h-7 text-[#00d4aa] flex-shrink-0" />
        {sidebarOpen && (
          <div className="animate-slideIn">
            <h1 className="text-lg font-bold text-white tracking-wider font-mono">MESHMIND</h1>
            <p className="text-[10px] text-[#64748b] tracking-wider">EMERGENCY MESH v1.0</p>
          </div>
        )}
      </div>

      {/* Status */}
      {sidebarOpen && (
        <div className="px-4 py-3 border-b border-[#1e2d3d] space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#64748b]">Backend</span>
            <span className={backendConnected ? 'text-[#10b981]' : 'text-[#f59e0b]'}>
              {backendConnected ? '● Connected' : '● Local Mode'}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#64748b]">Mesh</span>
            <span className={meshActive ? 'text-[#00d4aa]' : 'text-[#ef4444]'}>
              {meshActive ? '● Active' : '● Inactive'}
            </span>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2" role="navigation" aria-label="Main navigation">
        {NAV_ITEMS.map(({ path, icon: Icon, label }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm transition-all duration-200 ${
                isActive
                  ? 'bg-[#00d4aa]/10 text-[#00d4aa] border border-[#00d4aa]/20'
                  : 'text-[#94a3b8] hover:bg-[#1a2332] hover:text-white border border-transparent'
              }`
            }
            aria-current={location.pathname === path ? 'page' : undefined}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {sidebarOpen && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="p-3 border-t border-[#1e2d3d] text-[#64748b] hover:text-white transition-colors flex items-center justify-center"
        aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
    </aside>
  );
}
