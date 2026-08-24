import { useMemo, useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { AlertTriangle, Send, MapPin, Battery, Clock, Route, ShieldCheck, CheckCircle2, Loader, ChevronDown, ChevronUp } from 'lucide-react';
import type { MeshMessage } from '../types';
import { getTransport } from '../services/transport';
import { evaluateEmergencyPriority } from '../services/emergency';
import type { EmergencyAssessment } from '../services/emergency';

const DELIVERY_STATUS_COLOR: Record<string, string> = {
  QUEUED: 'text-[#f59e0b]', IN_TRANSIT: 'text-[#3b82f6]', FORWARDING: 'text-[#3b82f6]',
  STORED: 'text-[#f59e0b]', DELIVERED: 'text-[#10b981]', FAILED: 'text-[#ef4444]', EXPIRED: 'text-[#ef4444]',
};

const PRIORITY_COLOR: Record<string, string> = {
  P1: 'bg-[#ef4444]/20 text-[#ef4444] border-[#ef4444]/40',
  P2: 'bg-[#f59e0b]/20 text-[#f59e0b] border-[#f59e0b]/40',
  P3: 'bg-[#3b82f6]/20 text-[#3b82f6] border-[#3b82f6]/40',
  P4: 'bg-[#64748b]/20 text-[#94a3b8] border-[#64748b]/40',
};

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-[#94a3b8] cursor-pointer select-none">
      <input
        type="checkbox"
        className="w-4 h-4 accent-[#ef4444]"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

export default function SOS() {
  const { nodes, lastRoutingDecision } = useStore();
  const [content, setContent] = useState('EMERGENCY: Victim trapped - immediate assistance required.');
  const [senderId, setSenderId] = useState('');
  const [receiverId, setReceiverId] = useState('');
  const [sending, setSending] = useState(false);
  const [messageId, setMessageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sosResult, setSosResult] = useState<{ priority: string; summary: string; explanation: string } | null>(null);
  const [structuredOpen, setStructuredOpen] = useState(true);
  const [assessment, setAssessment] = useState<EmergencyAssessment>({
    peopleCount: 1, injuredCount: 0, criticalMedical: false, medicalRequired: false,
    trapped: false, waterRequired: false, foodRequired: false, evacuationRequired: false,
  });
  const [additionalMessage, setAdditionalMessage] = useState('');

  const senders = useMemo(() => nodes.filter(n => ['VICTIM', 'CIVILIAN', 'CITIZEN', 'VOLUNTEER'].includes(n.type) && n.status !== 'OFFLINE'), [nodes]);
  const receivers = useMemo(() => nodes.filter(n => ['COMMAND', 'COMMAND_CENTER', 'MEDICAL', 'AMBULANCE', 'RESCUE'].includes(n.type) && n.status !== 'OFFLINE'), [nodes]);

  useEffect(() => {
    if (!senderId && senders.length) setSenderId(senders[0].id);
  }, [senders, senderId]);
  useEffect(() => {
    if (!receiverId && receivers.length) setReceiverId(receivers[0].id);
  }, [receivers, receiverId]);

  const sender = nodes.find(n => n.id === senderId);
  const receiver = nodes.find(n => n.id === receiverId);
  const sosMessage: MeshMessage | undefined = useStore(s => s.messages.find(m => m.id === messageId));
  const decision = lastRoutingDecision?.messageId === messageId ? lastRoutingDecision : null;

  const setAssessmentField = (field: keyof EmergencyAssessment, value: number | boolean) => {
    setAssessment(a => ({ ...a, [field]: value }));
  };

  const priorityPreview = useMemo(() => evaluateEmergencyPriority(assessment), [assessment]);

  const sendSOS = async () => {
    if (!senderId || !receiverId) return;
    setSending(true);
    setError(null);
    setMessageId(null);
    setSosResult(null);
    try {
      const transport = getTransport();
      if (!transport) throw new Error('Transport not ready');
      const result = await transport.sendEmergencySOS({
        senderId,
        receiverId,
        ...assessment,
        additionalMessage: additionalMessage || undefined,
        location: sender?.location,
        batteryLevel: sender?.battery,
      });
      if (!result.ok) throw new Error(result.error || 'Failed to send SOS');
      setMessageId(result.messageId || null);
      if (result.priority) {
        const preview = evaluateEmergencyPriority(assessment);
        setSosResult({ priority: result.priority, summary: result.summary || preview.explanation, explanation: preview.explanation });
      }
    } catch (e: any) {
      setError(e.message || 'Failed to send SOS');
    } finally {
      setSending(false);
    }
  };

  const sendManualSOS = async () => {
    if (!senderId || !receiverId) return;
    setSending(true);
    setError(null);
    setMessageId(null);
    setSosResult(null);
    try {
      const transport = getTransport();
      if (!transport) throw new Error('Transport not ready');
      const result = await transport.sendMessage({
        senderId,
        receiverId,
        type: 'SOS',
        priority: 'P1',
        content,
        description: 'Emergency SOS triggered from dedicated view',
        location: sender?.location,
        encrypted: true,
      });
      if (!result.ok) throw new Error(result.error || 'Failed to send SOS');
      setMessageId(result.messageId || null);
    } catch (e: any) {
      setError(e.message || 'Failed to send SOS');
    } finally {
      setSending(false);
    }
  };

  const currentHop = sosMessage?.currentHop ?? 0;
  const route = sosMessage?.route ?? (decision ? decision.selectedRoute.path : []);

  const statusLabel = (msg: MeshMessage | undefined) => {
    if (!msg) return 'NOT_SENT';
    const map: Record<string, string> = {
      QUEUED: 'QUEUED - in priority queue', IN_TRANSIT: 'ROUTING', FORWARDING: `RELAYING HOP ${msg.currentHop}/${msg.hopCount}`,
      STORED: 'WAITING FOR ROUTE (store-and-forward)', DELIVERED: 'DELIVERED', FAILED: 'DELIVERY FAILED', EXPIRED: 'EXPIRED (TTL)',
    };
    return map[msg.status] || msg.status;
  };

  const hasSent = !!messageId;

  return (
    <section className="p-8 animate-fadeIn max-w-4xl">
      <h1 className="text-2xl font-bold text-[#ef4444] mb-2 flex items-center gap-2">
        <AlertTriangle className="w-6 h-6" /> Emergency SOS
      </h1>
      <p className="text-[#94a3b8] mb-6">Send an emergency message through the mesh. Structured SOS auto-assigns priority offline; the system computes a reliability-first route and relays it hop by hop.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <label className="flex flex-col">
          <span className="text-[#94a3b8] mb-1">Sender (victim/citizen)</span>
          <select
            className="px-3 py-2 bg-[#111827] border border-[#1e2d3d] rounded text-[#e2e8f0] focus:outline-none focus:ring-2 focus:ring-[#ef4444]"
            value={senderId}
            onChange={e => setSenderId(e.target.value)}
          >
            {senders.map(n => <option key={n.id} value={n.id}>{n.name} ({n.type}) - battery {n.battery}%</option>)}
          </select>
        </label>
        <label className="flex flex-col">
          <span className="text-[#94a3b8] mb-1">Destination (rescue/command)</span>
          <select
            className="px-3 py-2 bg-[#111827] border border-[#1e2d3d] rounded text-[#e2e8f0] focus:outline-none focus:ring-2 focus:ring-[#ef4444]"
            value={receiverId}
            onChange={e => setReceiverId(e.target.value)}
          >
            {receivers.map(n => <option key={n.id} value={n.id}>{n.name} ({n.type})</option>)}
          </select>
        </label>
      </div>

      <div className="mesh-card mb-6 border-[#ef4444]/30">
        <button
          className="w-full flex items-center justify-between text-left"
          onClick={() => setStructuredOpen(o => !o)}
        >
          <span className="text-lg font-semibold text-[#ef4444] flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" /> Structured SOS
          </span>
          {structuredOpen ? <ChevronUp className="w-5 h-5 text-[#94a3b8]" /> : <ChevronDown className="w-5 h-5 text-[#94a3b8]" />}
        </button>
        {structuredOpen && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <label className="flex flex-col">
                <span className="text-[#94a3b8] text-xs mb-1">People</span>
                <input
                  type="number" min={0} max={999}
                  className="px-3 py-2 bg-[#111827] border border-[#1e2d3d] rounded text-[#e2e8f0] focus:outline-none focus:ring-2 focus:ring-[#ef4444]"
                  value={assessment.peopleCount ?? 0}
                  onChange={e => setAssessmentField('peopleCount', parseInt(e.target.value) || 0)}
                />
              </label>
              <label className="flex flex-col">
                <span className="text-[#94a3b8] text-xs mb-1">Injured</span>
                <input
                  type="number" min={0} max={999}
                  className="px-3 py-2 bg-[#111827] border border-[#1e2d3d] rounded text-[#e2e8f0] focus:outline-none focus:ring-2 focus:ring-[#ef4444]"
                  value={assessment.injuredCount ?? 0}
                  onChange={e => setAssessmentField('injuredCount', parseInt(e.target.value) || 0)}
                />
              </label>
              <label className="flex flex-col">
                <span className="text-[#94a3b8] text-xs mb-1">Battery %</span>
                <input
                  type="number" min={0} max={100}
                  className="px-3 py-2 bg-[#111827] border border-[#1e2d3d] rounded text-[#e2e8f0] focus:outline-none focus:ring-2 focus:ring-[#ef4444]"
                  value={sender?.battery ?? assessment.batteryLevel ?? 0}
                  disabled
                />
              </label>
              <label className="flex flex-col">
                <span className="text-[#94a3b8] text-xs mb-1">Location</span>
                <span className="px-3 py-2 bg-[#111827] border border-[#1e2d3d] rounded text-[#e2e8f0] text-sm">
                  {sender ? `Sector ${sender.location.sector} / ${sender.location.zone}` : '—'}
                </span>
              </label>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Toggle label="Critical medical" checked={!!assessment.criticalMedical} onChange={v => setAssessmentField('criticalMedical', v)} />
              <Toggle label="Medical required" checked={!!assessment.medicalRequired} onChange={v => setAssessmentField('medicalRequired', v)} />
              <Toggle label="Trapped" checked={!!assessment.trapped} onChange={v => setAssessmentField('trapped', v)} />
              <Toggle label="Evacuation required" checked={!!assessment.evacuationRequired} onChange={v => setAssessmentField('evacuationRequired', v)} />
              <Toggle label="Water required" checked={!!assessment.waterRequired} onChange={v => setAssessmentField('waterRequired', v)} />
              <Toggle label="Food required" checked={!!assessment.foodRequired} onChange={v => setAssessmentField('foodRequired', v)} />
            </div>

            <textarea
              className="w-full h-16 p-3 bg-[#111827] border border-[#1e2d3d] rounded-lg text-[#e2e8f0] placeholder-[#64748b] focus:outline-none focus:ring-2 focus:ring-[#ef4444]"
              placeholder="Additional message (optional)..."
              value={additionalMessage}
              onChange={e => setAdditionalMessage(e.target.value)}
              disabled={sending}
            />

            <div className="flex flex-wrap items-center gap-3">
              <button
                className="px-6 py-2 rounded font-mono font-bold sos-pulse bg-[#ef4444] hover:bg-[#c0392b] text-white transition-colors flex items-center gap-2"
                onClick={sendSOS}
                disabled={sending || !senderId || !receiverId}
              >
                {sending ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {sending ? 'SENDING…' : 'Send Structured SOS'}
              </button>
              <span className={`px-3 py-1 rounded-md border text-sm font-mono font-bold ${PRIORITY_COLOR[priorityPreview.priority]}`}>
                {priorityPreview.priority} · AUTO PRIORITY
              </span>
            </div>
            <p className="text-[#94a3b8] text-xs">
              Offline priority engine: {priorityPreview.explanation}
            </p>
            {sosResult && (
              <div className="border border-[#10b981]/40 rounded-lg p-3 bg-[#10b981]/5">
                <p className="text-[#10b981] font-mono font-bold text-sm">{sosResult.priority} · {sosResult.summary}</p>
                <p className="text-[#94a3b8] text-xs mt-1">Reasoning: {sosResult.explanation}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mesh-card mb-6">
        <button
          className="w-full flex items-center justify-between text-left"
          onClick={() => setStructuredOpen(o => !o)}
        >
          <span className="text-lg font-semibold text-[#94a3b8] flex items-center gap-2">
            Manual SOS (free text)
          </span>
        </button>
        <textarea
          className="w-full h-24 p-3 mt-3 bg-[#111827] border border-[#1e2d3d] rounded-lg text-[#e2e8f0] placeholder-[#64748b] focus:outline-none focus:ring-2 focus:ring-[#ef4444]"
          placeholder="Enter emergency description..."
          value={content}
          onChange={e => setContent(e.target.value)}
          disabled={sending}
        />
        <button
          className="mt-3 px-6 py-2 rounded font-mono font-bold bg-[#111827] border border-[#ef4444]/40 hover:bg-[#ef4444]/10 text-[#ef4444] transition-colors flex items-center gap-2"
          onClick={sendManualSOS}
          disabled={sending || !senderId || !receiverId}
        >
          {sending ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send Manual SOS
        </button>
      </div>
      {error && <p className="text-[#ef4444] mt-3 text-sm">{error}</p>}

      {sender && (
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="mesh-card flex items-center gap-3">
            <MapPin className="w-5 h-5 text-[#00d4aa]" />
            <div><p className="text-xs text-[#64748b]">Location</p><p className="font-mono text-sm">Sector {sender.location.sector} / {sender.location.zone}</p></div>
          </div>
          <div className="mesh-card flex items-center gap-3">
            <Battery className="w-5 h-5 text-[#00d4aa]" />
            <div><p className="text-xs text-[#64748b]">Sender battery</p><p className="font-mono text-sm">{sender.battery}%</p></div>
          </div>
          <div className="mesh-card flex items-center gap-3">
            <Clock className="w-5 h-5 text-[#00d4aa]" />
            <div><p className="text-xs text-[#64748b]">Timestamp</p><p className="font-mono text-sm">{new Date().toLocaleTimeString()}</p></div>
          </div>
        </div>
      )}

      {hasSent && sosMessage && (
        <div className="mt-8 space-y-4">
          <div className="mesh-card">
            <h2 className="text-lg font-semibold text-[#ef4444] mb-3 flex items-center gap-2">
              <Route className="w-5 h-5" /> SOS Route &amp; Delivery
            </h2>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {route.map((nodeId, i) => {
                const node = nodes.find(n => n.id === nodeId);
                const isPast = i <= currentHop;
                const isCurrent = i === currentHop && sosMessage.status === 'FORWARDING';
                return (
                  <span key={`${nodeId}-${i}`} className="flex items-center gap-2">
                    {i > 0 && <span className={`text-lg ${isPast ? 'text-[#00d4aa]' : 'text-[#64748b]'}`}>→</span>}
                    <span className={`px-3 py-1 rounded-md text-sm font-mono border ${
                      isCurrent ? 'border-[#00d4aa] bg-[#00d4aa]/10 text-[#00d4aa] animate-pulse'
                      : isPast ? 'border-[#00d4aa]/40 bg-[#00d4aa]/5 text-[#e2e8f0]'
                      : 'border-[#1e2d3d] text-[#64748b]'
                    }`}>
                      {node ? node.name : nodeId.slice(0, 8)}
                    </span>
                  </span>
                );
              })}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div><p className="text-xs text-[#64748b]">Status</p><p className={`font-mono font-semibold ${DELIVERY_STATUS_COLOR[sosMessage.status] || 'text-[#e2e8f0]'}`}>{statusLabel(sosMessage)}</p></div>
              <div><p className="text-xs text-[#64748b]">Hops</p><p className="font-mono">{sosMessage.currentHop}/{sosMessage.hopCount}</p></div>
              <div><p className="text-xs text-[#64748b]">Est. Latency</p><p className="font-mono">{sosMessage.estimatedLatency}ms</p></div>
              <div><p className="text-xs text-[#64748b]">Reliability</p><p className="font-mono">{decision ? decision.selectedRoute.reliability : '—'}%</p></div>
            </div>
          </div>

          {sosMessage.status === 'DELIVERED' && (
            <div className="mesh-card border-[#10b981]/40 flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-[#10b981] mt-0.5" />
              <div>
                <p className="text-[#10b981] font-semibold">SOS DELIVERED</p>
                <p className="text-[#94a3b8] text-sm mt-1">
                  Delivered to {receiver?.name || sosMessage.receiverId} in {(sosMessage.actualLatency ?? 0) / 1000}s over {sosMessage.hopCount} hops.
                </p>
              </div>
            </div>
          )}

          {sosMessage.status === 'STORED' && (
            <div className="mesh-card border-[#f59e0b]/40 flex items-start gap-3">
              <ShieldCheck className="w-6 h-6 text-[#f59e0b] mt-0.5" />
              <div>
                <p className="text-[#f59e0b] font-semibold">WAITING FOR ROUTE</p>
                <p className="text-[#94a3b8] text-sm mt-1">Destination unreachable - message stored on a relay node. It will be forwarded automatically when connectivity is restored.</p>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}