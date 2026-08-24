import { useStore } from '../store/useStore';
import { BarChart3, Clock, ShieldAlert, MessageSquare, Activity, Server, Zap } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function Dashboard() {
  const { stats, analytics } = useStore();

  const chartData = analytics.slice(-30).map(a => ({
    time: new Date(a.timestamp).toLocaleTimeString(),
    deliveryRate: Math.round(a.deliveryRate),
    latency: a.averageLatency,
    congestion: Math.round(a.congestionLevel),
  }));

  return (
    <section className="p-8 animate-fadeIn">
      <h1 className="text-2xl font-bold text-[#00d4aa] mb-6 flex items-center gap-2">
        <BarChart3 className="w-6 h-6" /> Dashboard Overview
      </h1>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mb-8">
        <div className="mesh-card">
          <h2 className="text-lg font-medium text-[#94a3b8] flex items-center gap-2"><Server className="w-4 h-4" /> Total Nodes</h2>
          <p className="text-3xl font-bold text-[#00d4aa] mt-1">{stats.totalNodes}</p>
        </div>
        <div className="mesh-card">
          <h2 className="text-lg font-medium text-[#94a3b8] flex items-center gap-2"><Activity className="w-4 h-4" /> Online Nodes</h2>
          <p className="text-3xl font-bold text-[#00d4aa] mt-1">{stats.onlineNodes}</p>
        </div>
        <div className="mesh-card">
          <h2 className="text-lg font-medium text-[#94a3b8] flex items-center gap-2"><Zap className="w-4 h-4" /> Active Links</h2>
          <p className="text-3xl font-bold text-[#00d4aa] mt-1">{stats.activeLinks}</p>
        </div>
        <div className="mesh-card">
          <h2 className="text-lg font-medium text-[#94a3b8] flex items-center gap-2"><ShieldAlert className="w-4 h-4" /> Mesh Health</h2>
          <p className="text-3xl font-bold text-[#00d4aa] mt-1">{stats.meshHealth}%</p>
        </div>
        <div className="mesh-card">
          <h2 className="text-lg font-medium text-[#94a3b8] flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Delivered</h2>
          <p className="text-3xl font-bold text-[#00d4aa] mt-1">{stats.messagesDelivered}</p>
        </div>
        <div className="mesh-card">
          <h2 className="text-lg font-medium text-[#94a3b8] flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Pending</h2>
          <p className="text-3xl font-bold text-[#f59e0b] mt-1">{stats.messagesPending}</p>
        </div>
        <div className="mesh-card">
          <h2 className="text-lg font-medium text-[#94a3b8] flex items-center gap-2"><Clock className="w-4 h-4" /> Avg Latency</h2>
          <p className="text-3xl font-bold text-[#00d4aa] mt-1">{stats.averageLatency}ms</p>
        </div>
        <div className="mesh-card">
          <h2 className="text-lg font-medium text-[#94a3b8] flex items-center gap-2"><Zap className="w-4 h-4" /> Delivery Rate</h2>
          <p className="text-3xl font-bold text-[#00d4aa] mt-1">{stats.packetDeliveryRate}%</p>
        </div>
      </div>

      <div className="mesh-card">
        <h2 className="text-xl font-semibold text-[#00d4aa] mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5" /> Real-time Analytics
        </h2>
        {chartData.length > 1 ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData}>
              <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={11} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1e2d3d', borderRadius: 8 }} labelStyle={{ color: '#94a3b8' }} />
              <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
              <Line type="monotone" dataKey="deliveryRate" name="Delivery %" stroke="#00d4aa" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="latency" name="Latency ms" stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="congestion" name="Congestion" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-48 flex items-center justify-center text-[#64748b]">
            Collecting analytics data — run a simulation or the 90-second demo to see live charts.
          </div>
        )}
      </div>
    </section>
  );
}