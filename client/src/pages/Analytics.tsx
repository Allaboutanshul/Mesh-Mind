import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { BarChart3, Clock } from 'lucide-react';
import { api } from '../services/api';

export default function Analytics() {
  const { analytics, addAnalytics, backendConnected } = useStore();

  useEffect(() => {
    if (!backendConnected) return;
    api.getAnalytics(100).then((data) => { data.forEach(addAnalytics); }).catch(() => {});
    const interval = setInterval(() => {
      api.getAnalytics(1).then((newSnap) => {
        if (newSnap.length) addAnalytics(newSnap[0]);
      }).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [addAnalytics, backendConnected]);

  return (
    <section className="p-8 animate-fadeIn">
      <h1 className="text-2xl font-bold text-[#00d4aa] mb-6 flex items-center gap-2">
        <BarChart3 className="w-6 h-6" /> Real‑time Analytics
      </h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {analytics.slice(-6).reverse().map((snap) => (
          <div key={snap.timestamp} className="mesh-card p-4">
            <p className="text-[#94a3b8] text-sm">{new Date(snap.timestamp).toLocaleTimeString()}</p>
            <p className="text-[#00d4aa] text-lg font-bold">Msgs/min: {snap.messagesPerMinute}</p>
            <p className="text-[#e2e8f0]">Latency: {snap.averageLatency} ms</p>
            <p className="text-[#e2e8f0]">Delivery: {snap.deliveryRate}%</p>
            <p className="text-[#e2e8f0]">Battery: {snap.averageBattery.toFixed(1)}%</p>
          </div>
        ))}
      </div>
      <div className="mt-8 text-[#64748b] text-sm flex items-center gap-2">
        <Clock className="w-5 h-5" /> Updated every 5 seconds
      </div>
    </section>
  );
}
