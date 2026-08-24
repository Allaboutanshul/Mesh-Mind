import { useEffect, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import BootScreen from './components/BootScreen';
import { useStore } from './store/useStore';
import { initSocket } from './services/socket';

// Lazy-loaded pages for code-splitting
const Home = lazy(() => import('./pages/Home'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const MeshNetwork = lazy(() => import('./pages/MeshNetwork'));
const Messages = lazy(() => import('./pages/Messages'));
const SOS = lazy(() => import('./pages/SOS'));
const Nodes = lazy(() => import('./pages/Nodes'));
const RoutingAI = lazy(() => import('./pages/RoutingAI'));
const Analytics = lazy(() => import('./pages/Analytics'));
const SimulationLab = lazy(() => import('./pages/SimulationLab'));
const Settings = lazy(() => import('./pages/Settings'));
const About = lazy(() => import('./pages/About'));

export default function App() {

  const { bootComplete, setBootComplete } = useStore();
  const location = useLocation();

  // Initialise socket once on mount
  useEffect(() => {
    initSocket();
  }, []);

  // Simulate boot workflow – normally we would await backend health check
  useEffect(() => {
    // Dummy check after 2 secs
    const timer = setTimeout(() => {
      setBootComplete(true);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  // If boot hasn't completed yet, show boot screen
  if (!bootComplete) {
    return <BootScreen onComplete={() => setBootComplete(true)} initDone={bootComplete} />;
  }

  return (
    <div className="flex min-h-screen text-[#e2e8f0] font-sans">
      <Sidebar />
      <main className="flex-1 overflow-y-auto ml-0 md:ml-16">
        <Suspense fallback={<div className="p-8 text-center text-[#94a3b8]">Loading…</div>}>
          <Routes location={location}>
            <Route path="/" element={<Home />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/network" element={<MeshNetwork />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/sos" element={<SOS />} />
            <Route path="/nodes" element={<Nodes />} />
            <Route path="/routing" element={<RoutingAI />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/simulation" element={<SimulationLab />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/about" element={<About />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}
