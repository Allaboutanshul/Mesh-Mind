import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { FlaskConical, Play, Square, RefreshCw, AlertTriangle, Radio } from 'lucide-react';
import { getTransport } from '../services/transport';
import { startDemo, stopDemo, isDemoRunning } from '../services/demo';

const PRESETS = [
  ['NORMAL', 'Normal'],
  ['FLOOD', 'Flood'],
  ['EARTHQUAKE', 'Earthquake'],
  ['CYCLONE', 'Cyclone'],
  ['TOWER_FAILURE', 'Tower Failure'],
  ['INTERNET_BLACKOUT', 'Internet Blackout'],
  ['CONGESTION', 'Congestion'],
  ['MULTI_NODE_FAILURE', 'Multi-Node Failure'],
  ['MASS_SOS', 'Mass SOS'],
];

export default function SimulationLab() {
  const { simulationRunning, setSimulationRunning, timeline } = useStore();
  const [preset, setPreset] = useState<string>('NORMAL');
  const [demoRunning, setDemoRunning] = useState(false);

  useEffect(() => {
    const check = setInterval(() => setDemoRunning(isDemoRunning()), 500);
    return () => clearInterval(check);
  }, []);

  const transport = () => getTransport();

  const start = () => {
    const t = transport();
    if (t) t.applyPreset(preset);
    setSimulationRunning(true);
  };
  const stop = () => {
    const t = transport();
    if (t) t.reset();
    setSimulationRunning(false);
  };
  const apply = () => {
    const t = transport();
    if (t) t.applyPreset(preset);
  };
  const reset = () => {
    const t = transport();
    if (t) t.reset();
    setSimulationRunning(false);
  };
  const runDemo = () => {
    startDemo();
    setDemoRunning(true);
  };

  return (
    <section className="p-8 animate-fadeIn">
      <h1 className="text-2xl font-bold text-[#00d4aa] mb-6 flex items-center gap-2">
        <FlaskConical className="w-6 h-6" /> Simulation Lab
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl mb-6">
        <label className="flex flex-col">
          <span className="text-[#94a3b8] mb-1">Preset</span>
          <select
            className="px-3 py-2 bg-[#111827] border border-[#1e2d3d] rounded text-[#e2e8f0] focus:outline-none focus:ring-2 focus:ring-[#00d4aa]"
            value={preset}
            onChange={e => setPreset(e.target.value)}
          >
            {PRESETS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>

        <div className="flex items-end space-x-4">
          <button
            className={`px-4 py-2 rounded font-mono font-bold ${simulationRunning ? 'bg-[#64748b]' : 'bg-[#00d4aa] hover:bg-[#00b896]'} text-black transition-colors`}
            onClick={start}
            disabled={simulationRunning}
          >
            <Play className="inline w-4 h-4 mr-1" /> Start
          </button>
          <button
            className={`px-4 py-2 rounded font-mono font-bold ${!simulationRunning ? 'bg-[#64748b]' : 'bg-[#ef4444] hover:bg-[#c0392b]'} text-white transition-colors`}
            onClick={stop}
            disabled={!simulationRunning}
          >
            <Square className="inline w-4 h-4 mr-1" /> Stop
          </button>
        </div>

        <div className="flex items-end space-x-4">
          <button
            className="px-4 py-2 rounded bg-[#00d4aa] hover:bg-[#00b896] text-black font-mono font-bold transition-colors"
            onClick={apply}
          >
            <RefreshCw className="inline w-4 h-4 mr-1" /> Apply Preset
          </button>
          <button
            className="px-4 py-2 rounded bg-[#ef4444] hover:bg-[#c0392b] text-white font-mono font-bold transition-colors"
            onClick={reset}
          >
            <AlertTriangle className="inline w-4 h-4 mr-1" /> Reset
          </button>
        </div>
      </div>

      <div className="mesh-card max-w-xl">
        <h2 className="text-lg font-semibold text-[#00d4aa] mb-2 flex items-center gap-2">
          <Radio className="w-5 h-5" /> Automated 90-Second Demo
        </h2>
        <p className="text-[#94a3b8] text-sm mb-3">
          Internet cut → cellular cut → mesh activation → node failure → SOS → rerouting →
          network partition → recovery → emergency delivery.
        </p>
        {!demoRunning ? (
          <button
            className="px-4 py-2 rounded bg-[#ef4444] hover:bg-[#c0392b] text-white font-mono text-sm font-bold transition-colors"
            onClick={runDemo}
          >
            Run 90-Second Demo
          </button>
        ) : (
          <button
            className="px-4 py-2 rounded bg-[#64748b] hover:bg-[#475569] text-white font-mono text-sm font-bold transition-colors"
            onClick={() => { stopDemo(); setDemoRunning(false); }}
          >
            Stop Demo
          </button>
        )}
        {demoRunning && (
          <div className="mt-4 space-y-1.5">
            {timeline.map(t => (
              <div key={t.id} className={`flex items-center gap-2 text-sm ${t.status === 'pending' ? 'text-[#64748b]' : 'text-[#e2e8f0]'}`}>
                <span className="font-mono text-xs w-4">{t.status === 'completed' ? '✓' : '○'}</span>
                <span>{t.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}