import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Route } from 'lucide-react';
import { api } from '../services/api';
import { computeRoute } from '../services/routing';

export default function RoutingAI() {
  const { nodes, setLastRoutingDecision, backendConnected } = useStore();
  const [sourceId, setSourceId] = useState('');
  const [destId, setDestId] = useState('');
  const [isEmergency, setIsEmergency] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (nodes.length >= 2 && !sourceId) { setSourceId(nodes[0].id); setDestId(nodes[1].id); }
  }, [nodes, sourceId]);

  const findRoute = async () => {
    if (!sourceId || !destId || sourceId === destId) return;
    setLoading(true);
    setError(null);
    try {
      if (backendConnected) {
        const decision = await api.findRoute({ sourceId, destId, isEmergency });
        setResult(decision);
        setLastRoutingDecision(decision);
      } else {
        const decision = computeRoute(nodes, useStore.getState().links, sourceId, destId, isEmergency);
        if (!decision) setError('No route found between the selected nodes.');
        setResult(decision);
        setLastRoutingDecision(decision);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to compute route');
    } finally {
      setLoading(false);
    }
  };

  const nodeName = (id: string) => nodes.find(n => n.id === id)?.name || id.slice(0, 8);

  return (
    <section className="p-8 animate-fadeIn">
      <h1 className="text-2xl font-bold text-[#00d4aa] mb-6 flex items-center gap-2">
        <Route className="w-6 h-6" /> Routing Intelligence
      </h1>
      <p className="text-[#94a3b8] text-sm mb-4 max-w-2xl">
        Multi-factor weighted routing across latency, battery risk, congestion and reliability.
        Emergency routing prioritizes reliability and stable relays.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl">
        <label className="flex flex-col">
          <span className="text-[#94a3b8] mb-1">Source Node</span>
          <select
            className="px-3 py-2 bg-[#111827] border border-[#1e2d3d] rounded text-[#e2e8f0] focus:outline-none focus:ring-2 focus:ring-[#00d4aa]"
            value={sourceId}
            onChange={e => setSourceId(e.target.value)}
          >
            {nodes.map(n => <option key={n.id} value={n.id}>{n.name} ({n.type})</option>)}
          </select>
        </label>
        <label className="flex flex-col">
          <span className="text-[#94a3b8] mb-1">Destination Node</span>
          <select
            className="px-3 py-2 bg-[#111827] border border-[#1e2d3d] rounded text-[#e2e8f0] focus:outline-none focus:ring-2 focus:ring-[#00d4aa]"
            value={destId}
            onChange={e => setDestId(e.target.value)}
          >
            {nodes.map(n => <option key={n.id} value={n.id}>{n.name} ({n.type})</option>)}
          </select>
        </label>
      </div>
      <div className="flex items-center mt-4">
        <label className="flex items-center space-x-2 text-[#94a3b8]">
          <input type="checkbox" checked={isEmergency} onChange={e => setIsEmergency(e.target.checked)} />
          <span>Emergency priority (reliability-first)</span>
        </label>
      </div>
      <button
        className={`mt-4 px-4 py-2 rounded font-mono font-bold ${loading ? 'bg-[#64748b]' : 'bg-[#00d4aa] hover:bg-[#00b896]'} text-black transition-colors`}
        onClick={findRoute}
        disabled={loading || !sourceId || !destId}
      >
        {loading ? 'Calculating…' : 'Find Route'}
      </button>
      {error && <p className="text-[#ef4444] mt-3 text-sm">{error}</p>}

      {result && (
        <div className="mt-6 space-y-4 max-w-2xl">
          <div className="mesh-card">
            <h2 className="text-lg font-semibold text-[#00d4aa] mb-2">Selected Route</h2>
            <p className="text-[#e2e8f0] mb-2 flex flex-wrap items-center gap-2">
              {result.selectedRoute.path.map((id: string, i: number) => (
                <span key={id + i} className="flex items-center gap-2">
                  {i > 0 && <span className="text-[#00d4aa]">→</span>}
                  <span className="px-2 py-1 bg-[#111827] border border-[#00d4aa]/30 rounded text-xs font-mono">{nodeName(id)}</span>
                </span>
              ))}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div><p className="text-xs text-[#64748b]">Total Cost</p><p className="font-mono">{result.selectedRoute.totalCost}</p></div>
              <div><p className="text-xs text-[#64748b]">Latency</p><p className="font-mono">{result.selectedRoute.totalLatency} ms</p></div>
              <div><p className="text-xs text-[#64748b]">Reliability</p><p className="font-mono">{result.selectedRoute.reliability}%</p></div>
              <div><p className="text-xs text-[#64748b]">Battery Risk</p><p className="font-mono">{result.selectedRoute.batteryRisk}</p></div>
            </div>
          </div>
          <div className="mesh-card">
            <h2 className="text-sm font-semibold text-[#94a3b8] mb-1">Why this route?</h2>
            <p className="text-[#e2e8f0] text-sm">{result.explanation}</p>
          </div>
        </div>
      )}
    </section>
  );
}