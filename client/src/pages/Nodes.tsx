import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Server, Activity, Battery, Wifi } from 'lucide-react';
import { api } from '../services/api';
import { getTransport } from '../services/transport';

export default function Nodes() {
  const { nodes, setNodes } = useStore();

  // Load nodes on mount if backend is reachable; otherwise the local
  // simulation transport already populated the store.
  useEffect(() => {
    if (useStore.getState().backendConnected) api.getNodes().then(setNodes).catch(() => {});
  }, []);

  const toggleNode = async (nodeId: string, enable: boolean) => {
    const transport = getTransport();
    if (!transport) return;
    if (enable) transport.enableNode(nodeId);
    else transport.disableNode(nodeId);
  };

  return (
    <section className="p-8 animate-fadeIn">
      <h1 className="text-2xl font-bold text-[#00d4aa] mb-6 flex items-center gap-2">
        <Server className="w-6 h-6" /> Nodes Management
      </h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {nodes.map((node) => (
          <div key={node.id} className="mesh-card">
            <div className="flex justify-between items-start mb-2">
              <h2 className="text-lg font-medium text-[#94a3b8]">{node.name}</h2>
              <span className={`text-xs font-semibold ${
                node.status === 'ONLINE' ? 'text-[#00d4aa]' : node.status === 'WARNING' ? 'text-[#f59e0b]' : 'text-[#ef4444]'
              }`}>{node.status}</span>
            </div>
            <p className="text-[#64748b] text-sm mb-2">Type: {node.type}</p>
            <p className="text-[#64748b] text-sm mb-2 flex items-center gap-1.5"><Battery className="w-3.5 h-3.5" /> {node.battery}%</p>
            <p className="text-[#64748b] text-sm mb-2 flex items-center gap-1.5"><Wifi className="w-3.5 h-3.5" /> {node.signalStrength}</p>
            <button
              className={`mt-2 w-full px-3 py-1 rounded text-sm font-medium ${
                node.status === 'OFFLINE' ? 'bg-[#00d4aa] hover:bg-[#00b896]' : 'bg-[#ef4444] hover:bg-[#c0392b]'
              } transition-colors`}
              onClick={() => toggleNode(node.id, node.status === 'OFFLINE')}
            >
              {node.status === 'OFFLINE' ? 'Enable Node' : 'Disable Node'}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
