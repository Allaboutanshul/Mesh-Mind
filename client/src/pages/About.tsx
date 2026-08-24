import { Info, Cpu, Route, Radio, Database, Lock } from 'lucide-react';

export default function About() {
  return (
    <section className="p-8 animate-fadeIn max-w-3xl">
      <h1 className="text-2xl font-bold text-[#00d4aa] mb-6 flex items-center gap-2">
        <Info className="w-6 h-6" /> About MeshMind
      </h1>
      <p className="text-[#94a3b8] mb-6">
        MeshMind is an internet-independent emergency communication platform featuring intelligent mesh
        routing, real-time analytics, and disaster-scenario simulations. The frontend runs 100% in the
        browser with a local simulation transport when no backend is available.
      </p>

      <div className="space-y-4">
        <div className="mesh-card">
          <h2 className="text-lg font-semibold text-[#00d4aa] mb-2 flex items-center gap-2"><Route className="w-5 h-5" /> Routing Engine</h2>
          <p className="text-[#94a3b8] text-sm">
            Multi-factor weighted routing across distance, latency, battery risk, congestion and
            reliability. Emergency (P1/SOS) traffic uses reliability-first weights. The engine returns
            the selected route plus alternatives with a deterministic metric-based explanation.
          </p>
        </div>
        <div className="mesh-card">
          <h2 className="text-lg font-semibold text-[#00d4aa] mb-2 flex items-center gap-2"><Cpu className="w-5 h-5" /> Message System</h2>
          <p className="text-[#94a3b8] text-sm">
            Priority message queue (P1 SOS to P4 Low), TTL expiry, duplicate dropping, store-and-forward
            for unreachable destinations, automatic rerouting on node/link failure, and hop-by-hop
            relay with delivery acknowledgement.
          </p>
        </div>
        <div className="mesh-card">
          <h2 className="text-lg font-semibold text-[#00d4aa] mb-2 flex items-center gap-2"><Radio className="w-5 h-5" /> Transport Abstraction</h2>
          <p className="text-[#94a3b8] text-sm">
            Application and routing logic are decoupled from the physical medium via a MeshTransport
            interface (connect, discoverPeers, sendMessage, receiveMessage, getConnectionStatus).
            The browser demo uses SimulationTransport; a WebSocketTransport bridges to the unified
            backend. Future transports (Bluetooth, Wi-Fi Direct, LoRa) implement the same interface.
            Browsers cannot access raw Bluetooth/Wi-Fi Direct mesh networking, so those are simulated.
          </p>
        </div>
        <div className="mesh-card">
          <h2 className="text-lg font-semibold text-[#00d4aa] mb-2 flex items-center gap-2"><Database className="w-5 h-5" /> Backend</h2>
          <p className="text-[#94a3b8] text-sm">
            A single unified backend (port 5000) provides the REST API, Socket.IO events, the mesh
            simulation engine, message service and analytics. No database is required for local demo
            mode - the frontend falls back to its in-browser simulation transport automatically.
          </p>
        </div>
        <div className="mesh-card">
          <h2 className="text-lg font-semibold text-[#00d4aa] mb-2 flex items-center gap-2"><Lock className="w-5 h-5" /> Integrity</h2>
          <p className="text-[#94a3b8] text-sm">
            Every message carries a content hash for integrity verification and a unique ID for
            duplicate detection. Encryption is prototyped per-message (encrypted flag).
          </p>
        </div>
      </div>
    </section>
  );
}