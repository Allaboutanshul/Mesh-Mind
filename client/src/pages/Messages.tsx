import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { MessageSquare, Clock } from 'lucide-react';
import { PRIORITY_LABELS } from '../types';
import type { MessagePriority } from '../types';

export default function Messages() {
  const { messages, setMessages, backendConnected } = useStore();

  useEffect(() => {
    if (!backendConnected) return;
    fetch('/api/messages')
      .then(r => r.json())
      .then(setMessages)
      .catch(() => {});
  }, [backendConnected]);

  const STATUS_STYLE: Record<string, string> = {
    QUEUED: 'text-[#f59e0b]', IN_TRANSIT: 'text-[#3b82f6]', FORWARDING: 'text-[#3b82f6]',
    STORED: 'text-[#f59e0b]', DELIVERED: 'text-[#10b981]', FAILED: 'text-[#ef4444]', EXPIRED: 'text-[#ef4444]',
  };

  const renderPriority = (p: MessagePriority) => {
    const label = PRIORITY_LABELS[p] || p;
    const className = p === 'P1' ? 'priority-p1' : p === 'P2' ? 'priority-p2' : p === 'P3' ? 'priority-p3' : 'priority-p4';
    return <span className={`${className} px-2 py-0.5 rounded-md text-xs`}>{label}</span>;
  };

  return (
    <section className="p-8 animate-fadeIn">
      <h1 className="text-2xl font-bold text-[#00d4aa] mb-6 flex items-center gap-2">
        <MessageSquare className="w-6 h-6" /> Messages Feed
      </h1>
      <div className="space-y-4">
        {messages.length === 0 && (
          <div className="mesh-card text-[#64748b] text-sm">
            No messages yet. Send an SOS or run the 90-second demo to populate the feed.
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className="mesh-card hover:shadow-lg transition-shadow">
            <div className="flex justify-between items-center mb-2">
              <span className="font-mono text-sm text-[#94a3b8]">{msg.id.slice(0,8)}</span>
              {renderPriority(msg.priority)}
            </div>
            <p className="text-[#e2e8f0] mb-2 break-all">{msg.content}</p>
            <div className="text-xs text-[#64748b] flex justify-between items-center">
              <span className="flex items-center gap-2">
                <span>{msg.type}</span>
                <span className={`${STATUS_STYLE[msg.status] || ''} font-mono`}>{msg.status}</span>
                {msg.status === 'FORWARDING' && <span className="font-mono">hop {msg.currentHop}/{msg.hopCount}</span>}
              </span>
              <span>{new Date(msg.createdAt).toLocaleTimeString()}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
