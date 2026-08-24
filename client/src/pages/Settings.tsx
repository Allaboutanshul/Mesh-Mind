import { useStore } from '../store/useStore';
import { Plug, Radio, RefreshCw, Database, Server } from 'lucide-react';
import { getTransport } from '../services/transport';
import { SimulationTransport } from '../services/simulationTransport';
import { setActiveTransport } from '../services/transport';

export default function Settings() {
  const { backendConnected, internetAvailable, cellularAvailable, meshActive } = useStore();

  const resetNetwork = () => {
    const transport = getTransport();
    if (transport) transport.reset();
  };

  const startLocalSimulation = () => {
    const sim = new SimulationTransport();
    setActiveTransport(sim);
    sim.connect();
    useStore.setState({ backendConnected: false });
  };

  return (
    <section className="p-8 animate-fadeIn max-w-3xl">
      <h1 className="text-2xl font-bold text-[#00d4aa] mb-6 flex items-center gap-2">
        <Plug className="w-6 h-6" /> Settings
      </h1>

      <div className="space-y-6">
        <div className="mesh-card">
          <h2 className="text-lg font-semibold text-[#00d4aa] mb-3 flex items-center gap-2">
            <Server className="w-5 h-5" /> Backend Connection
          </h2>
          <div className="flex items-center gap-2 mb-3">
            <span className={`text-sm font-mono ${backendConnected ? 'text-[#10b981]' : 'text-[#f59e0b]'}`}>
              {backendConnected ? '● Connected to unified mesh backend' : '● Local simulation mode (backend offline)'}
            </span>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              className="px-4 py-2 rounded bg-[#00d4aa] hover:bg-[#00b896] text-black font-mono text-sm font-bold transition-colors"
              onClick={() => window.location.reload()}
            >
              Reconnect to Backend
            </button>
            <button
              className="px-4 py-2 rounded bg-[#111827] border border-[#1e2d3d] hover:border-[#00d4aa]/40 text-[#e2e8f0] font-mono text-sm font-bold transition-colors"
              onClick={resetNetwork}
            >
              Reset Network
            </button>
          </div>
        </div>

        <div className="mesh-card">
          <h2 className="text-lg font-semibold text-[#00d4aa] mb-3 flex items-center gap-2">
            <Radio className="w-5 h-5" /> Local Simulation Mode
          </h2>
          <p className="text-[#94a3b8] text-sm mb-3">
            Run the entire mesh simulation inside the browser with zero infrastructure. Uses the
            SimulationTransport with simulated peer discovery, weighted routing and message relays.
          </p>
          <button
            className="px-4 py-2 rounded bg-[#ef4444] hover:bg-[#c0392b] text-white font-mono text-sm font-bold transition-colors"
            onClick={startLocalSimulation}
          >
            Start Local Simulation
          </button>
        </div>

        <div className="mesh-card">
          <h2 className="text-lg font-semibold text-[#00d4aa] mb-3 flex items-center gap-2">
            <Database className="w-5 h-5" /> Network State
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div className="flex items-center justify-between px-3 py-2 bg-[#111827] rounded-lg">
              <span className="text-[#64748b]">Internet</span>
              <span className={internetAvailable ? 'text-[#10b981] font-mono' : 'text-[#ef4444] font-mono'}>{internetAvailable ? 'ON' : 'OFF'}</span>
            </div>
            <div className="flex items-center justify-between px-3 py-2 bg-[#111827] rounded-lg">
              <span className="text-[#64748b]">Cellular</span>
              <span className={cellularAvailable ? 'text-[#10b981] font-mono' : 'text-[#ef4444] font-mono'}>{cellularAvailable ? 'ON' : 'OFF'}</span>
            </div>
            <div className="flex items-center justify-between px-3 py-2 bg-[#111827] rounded-lg">
              <span className="text-[#64748b]">Mesh</span>
              <span className={meshActive ? 'text-[#00d4aa] font-mono' : 'text-[#64748b] font-mono'}>{meshActive ? 'ACTIVE' : 'INACTIVE'}</span>
            </div>
          </div>
          <p className="text-[#64748b] text-xs mt-3 flex items-center gap-2">
            <RefreshCw className="w-3 h-3" /> Transport abstraction: the app logic never depends on the physical medium.
          </p>
        </div>
      </div>
    </section>
  );
}