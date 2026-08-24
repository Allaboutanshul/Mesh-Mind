import { useCallback, useMemo, useEffect } from 'react';
import { ReactFlow, Background, MiniMap, Controls, useEdgesState, useNodesState, Handle, Position } from '@xyflow/react';
import { useStore } from '../store/useStore';
import { NODE_TYPE_ICONS } from '../types';
import type { NodeProps } from '@xyflow/react';
import type { Node as RFNode, Edge as RFEdge } from '@xyflow/react';
import type { MeshNode } from '../types';
import { getTransport } from '../services/transport';

const STATUS_COLOR: Record<string, string> = {
  ONLINE: '#00d4aa', WARNING: '#f59e0b', CRITICAL: '#ef4444', OFFLINE: '#64748b',
};

function MeshNodeView({ data, selected }: NodeProps) {
  const node = (data as { node: MeshNode }).node;
  const Icon = NODE_TYPE_ICONS[node.type] || '📡';
  return (
    <div
      className={`rounded-lg px-3 py-2 min-w-[120px] border text-center cursor-pointer transition-all ${
        node.status === 'OFFLINE' ? 'bg-[#1a2332] border-[#64748b] opacity-60' : 'bg-[#111827] border-[#00d4aa]/40'
      } ${selected ? 'ring-2 ring-[#00d4aa]' : ''}`}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div className="text-xl">{Icon}</div>
      <div className="text-xs font-semibold text-[#e2e8f0] mt-1">{node.name}</div>
      <div className="text-[10px] text-[#64748b]">{node.type}</div>
      <div className="mt-1 h-1.5 w-full bg-[#1e2d3d] rounded overflow-hidden">
        <div
          className="h-full rounded"
          style={{ width: `${node.battery}%`, background: node.battery < 20 ? '#ef4444' : node.battery < 40 ? '#f59e0b' : '#00d4aa' }}
        />
      </div>
      <div className={`text-[10px] mt-0.5 font-mono ${STATUS_COLOR[node.status]}`}>{node.status} · {node.battery}%</div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
}

export default function MeshNetwork() {
  const { nodes, links, messages } = useStore();
  const [rfNodes, setNodes, onNodesChange] = useNodesState<RFNode>([]);
  const [rfEdges, setEdges, onEdgesChange] = useEdgesState<RFEdge>([]);

  const activeRouteNodeIds = useMemo(() => {
    const inFlight = messages.filter(m => ['QUEUED', 'IN_TRANSIT', 'FORWARDING', 'STORED'].includes(m.status));
    const ids = new Set<string>();
    for (const m of inFlight) m.route.forEach(id => ids.add(id));
    return ids;
  }, [messages]);

  const nodeTypes = useMemo(() => ({ mesh: MeshNodeView }), []);

  const convert = useCallback(() => {
    const n: RFNode[] = nodes.map(node => ({
      id: node.id,
      type: 'mesh',
      data: { node },
      position: { x: node.x, y: node.y },
    }));
    const e: RFEdge[] = links.filter(l => l.active).map(link => {
      const inRoute = activeRouteNodeIds.has(link.source) && activeRouteNodeIds.has(link.target);
      return {
        id: link.id,
        source: link.source,
        target: link.target,
        animated: inRoute || link.congestion > 60,
        style: {
          stroke: inRoute ? '#00d4aa' : link.reliability > 80 ? '#2d3f50' : '#f59e0b',
          strokeWidth: inRoute ? 3 : 1.5,
        },
        label: `${link.latency}ms`,
      };
    });
    setNodes(n);
    setEdges(e);
  }, [nodes, links, activeRouteNodeIds, setNodes, setEdges]);

  useEffect(() => { convert(); }, [convert]);

  const onNodeClick = useCallback((_: any, node: RFNode) => {
    const transport = getTransport();
    if (!transport) return;
    const current = nodes.find(n => n.id === node.id);
    if (!current) return;
    if (current.status === 'OFFLINE') transport.enableNode(node.id);
    else transport.disableNode(node.id);
  }, [nodes]);

  return (
    <section className="p-8 animate-fadeIn h-[calc(100vh-4rem)] flex flex-col">
      <h1 className="text-2xl font-bold text-[#00d4aa] mb-4 flex items-center gap-2">
        Mesh Network Visualization
      </h1>
      <p className="text-[#94a3b8] text-sm mb-4">
        Click a node to toggle it online/offline. Animated edges show active message routes and congested links.
      </p>
      <div className="flex-1 border border-[#1e2d3d] rounded-lg overflow-hidden">
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
        >
          <Background color="#1e2d3d" gap={12} />
          <MiniMap nodeColor={(n: any) => (n.data?.node?.status === 'ONLINE' ? '#00d4aa' : n.data?.node?.status === 'OFFLINE' ? '#64748b' : '#f59e0b')} />
          <Controls />
        </ReactFlow>
      </div>
    </section>
  );
}