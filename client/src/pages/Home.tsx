import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { Shield, Wifi, WifiOff, Radio, TowerControl, Play, Square } from 'lucide-react';
import { startDemo, stopDemo, isDemoRunning } from '../services/demo';

const TYPE_STYLES: Record<string, string> = {
  success: 'text-[#10b981] border-[#10b981]/30 bg-[#10b981]/10',
  warning: 'text-[#f59e0b] border-[#f59e0b]/30 bg-[#f59e0b]/10',
  critical: 'text-[#ef4444] border-[#ef4444]/30 bg-[#ef4444]/10',
  info: 'text-[#3b82f6] border-[#3b82f6]/30 bg-[#3b82f6]/10',
};

export default function Home() {
  const { stats, timeline, internetAvailable, cellularAvailable, meshActive, setBootComplete, bootComplete } = useStore();
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!bootComplete) setBootComplete(true);
  }, []);

  useEffect(() => {
    const check = setInterval(() => setRunning(isDemoRunning()), 500);
    return () => clearInterval(check);
  }, []);

  const run = () => {
    startDemo();
    setRunning(true);
  };

  return (
    <section className="p-8 animate-fadeIn">
      <h1 className="text-3xl font-bold text-[#00d4aa] mb-4 flex items-center gap-2">
        <Shield className="w-6 h-6" /> MeshMind Command Center
      </h1>
      <p className="text-[#94a3b8] mb-6 max-w-2xl">
        Welcome to the MeshMind emergency communication platform. The network operates fully offline,
        using a resilient mesh of devices to route critical SOS messages, medical alerts, and situational
        updates. Explore the dashboard, visualize the mesh, and run simulations to see how the system
        reacts to disasters.
      </p>

      <div className="flex flex-wrap gap-3 mb-6">
        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${internetAvailable ? 'border-[#10b981]/30 bg-[#10b981]/10 text-[#10b981]' : 'border-[#ef4444]/30 bg-[#ef4444]/10 text-[#ef4444]'}`}>
          {internetAvailable ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
          <span className="font-mono text-sm">INTERNET: {internetAvailable ? 'ONLINE' : 'OFFLINE'}</span>
        </div>
        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${cellularAvailable ? 'border-[#10b981]/30 bg-[#10b981]/10 text-[#10b981]' : 'border-[#ef4444]/30 bg-[#ef4444]/10 text-[#ef4444]'}`}>
          <TowerControl className="w-4 h-4" />
          <span className="font-mono text-sm">CELLULAR: {cellularAvailable ? 'ONLINE' : 'OFFLINE'}</span>
        </div>
        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${meshActive ? 'border-[#00d4aa]/30 bg-[#00d4aa]/10 text-[#00d4aa]' : 'border-[#64748b]/30 bg-[#64748b]/10 text-[#64748b]'}`}>
          <Radio className="w-4 h-4" />
          <span className="font-mono text-sm">MESH: {meshActive ? 'ACTIVE' : 'INACTIVE'}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="mesh-card p-6">
          <h2 className="text-xl font-semibold text-[#00d4aa] mb-3">Current Network</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-[#64748b]">Nodes</span><p className="text-lg font-bold text-[#e2e8f0]">{stats.totalNodes}</p></div>
            <div><span className="text-[#64748b]">Online</span><p className="text-lg font-bold text-[#00d4aa]">{stats.onlineNodes}</p></div>
            <div><span className="text-[#64748b]">Active Links</span><p className="text-lg font-bold text-[#e2e8f0]">{stats.activeLinks}</p></div>
            <div><span className="text-[#64748b]">Delivered</span><p className="text-lg font-bold text-[#e2e8f0]">{stats.messagesDelivered}</p></div>
          </div>
        </div>

        <div className="mesh-card p-6">
          <h2 className="text-xl font-semibold text-[#00d4aa] mb-2">Run a Demo</h2>
          <p className="text-[#94a3b8] text-sm mb-2">
            Trigger a scripted 90-second disaster scenario: internet cut, cellular cut, mesh activation,
            node failure, SOS, rerouting, partition, recovery and delivery.
          </p>
          {!running ? (
            <button
              className="mt-2 px-4 py-2 bg-[#00d4aa] hover:bg-[#00b896] text-black rounded-lg font-mono text-sm font-bold transition-colors flex items-center gap-2"
              onClick={run}
            >
              <Play className="w-4 h-4" /> Run 90-Second Demo
            </button>
          ) : (
            <button
              className="mt-2 px-4 py-2 bg-[#ef4444] hover:bg-[#c0392b] text-white rounded-lg font-mono text-sm font-bold transition-colors flex items-center gap-2"
              onClick={() => { stopDemo(); setRunning(false); }}
            >
              <Square className="w-4 h-4" /> Stop Demo
            </button>
          )}
        </div>
      </div>

      {timeline.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xl font-semibold text-[#00d4aa] mb-4">Emergency Timeline</h2>
          <div className="space-y-2 max-w-2xl">
            {timeline.map((event) => (
              <div
                key={event.id}
                className={`flex items-center gap-3 px-4 py-2 rounded-lg border ${TYPE_STYLES[event.type] || TYPE_STYLES.info} ${event.status === 'pending' ? 'opacity-50' : ''}`}
              >
                <span className="font-mono text-xs w-6">{event.status === 'completed' ? '✓' : event.status === 'active' ? '⟳' : '○'}</span>
                <div>
                  <p className="font-medium text-sm">{event.title}</p>
                  <p className="text-xs opacity-80">{event.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}