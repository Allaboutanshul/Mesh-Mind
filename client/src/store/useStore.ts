import { create } from 'zustand';
import type { MeshNode, MeshLink, MeshMessage, NetworkStats, AnalyticsSnapshot, SimulationEvent, TimelineEvent, RoutingDecision, SimulationPreset, NetworkState } from '../types';

interface MeshStore {
  nodes: MeshNode[]; links: MeshLink[]; messages: MeshMessage[];
  events: SimulationEvent[]; analytics: AnalyticsSnapshot[]; timeline: TimelineEvent[];
  stats: NetworkStats; internetAvailable: boolean; cellularAvailable: boolean; meshActive: boolean;
  simulationRunning: boolean; simulationPreset: SimulationPreset | null;
  demoMode: boolean; demoRunning: boolean; demoStep: number;
  selectedNode: string | null; selectedMessage: string | null;
  lastRoutingDecision: RoutingDecision | null; backendConnected: boolean;
  bootComplete: boolean; sidebarOpen: boolean;

  setNetworkState: (state: NetworkState) => void;
  setNodes: (nodes: MeshNode[]) => void;
  setLinks: (links: MeshLink[]) => void;
  addMessage: (msg: MeshMessage) => void;
  updateMessage: (id: string, updates: Partial<MeshMessage>) => void;
  setMessages: (msgs: MeshMessage[]) => void;
  addEvent: (event: SimulationEvent) => void;
  addAnalytics: (snap: AnalyticsSnapshot) => void;
  setAnalytics: (snaps: AnalyticsSnapshot[]) => void;
  addTimelineEvent: (event: TimelineEvent) => void;
  setTimeline: (events: TimelineEvent[]) => void;
  setLastRoutingDecision: (decision: RoutingDecision | null) => void;
  setBootComplete: (complete: boolean) => void;
  setSimulationRunning: (running: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  updateNode: (id: string, updates: Partial<MeshNode>) => void;
  updateLink: (id: string, updates: Partial<MeshLink>) => void;
}

export const useStore = create<MeshStore>((set) => ({
  nodes: [], links: [], messages: [], events: [], analytics: [], timeline: [],
  stats: {
    totalNodes: 0, onlineNodes: 0, activeLinks: 0, messagesDelivered: 0,
    messagesPending: 0, messagesFailed: 0, emergencyMessages: 0,
    averageLatency: 0, packetDeliveryRate: 100, meshHealth: 0, batteryRisk: 'LOW',
  },
  internetAvailable: false, cellularAvailable: false, meshActive: true,
  simulationRunning: false, simulationPreset: null,
  demoMode: true, demoRunning: false, demoStep: 0,
  selectedNode: null, selectedMessage: null,
  lastRoutingDecision: null, backendConnected: false, bootComplete: false, sidebarOpen: true,

  setNetworkState: (state) => set({
    nodes: state.nodes, links: state.links, stats: state.stats,
    internetAvailable: state.internetAvailable, cellularAvailable: state.cellularAvailable, meshActive: state.meshActive,
  }),
  setNodes: (nodes) => set({ nodes }),
  setLinks: (links) => set({ links }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  updateMessage: (id, updates) => set((s) => ({
    messages: s.messages.map(m => m.id === id ? { ...m, ...updates } : m),
  })),
  setMessages: (messages) => set({ messages }),
  addEvent: (event) => set((s) => ({ events: [...s.events.slice(-499), event] })),
  addAnalytics: (snap) => set((s) => ({ analytics: [...s.analytics.slice(-249), snap] })),
  setAnalytics: (analytics) => set({ analytics }),
  addTimelineEvent: (event) => set((s) => ({ timeline: [...s.timeline, event] })),
  setTimeline: (timeline) => set({ timeline }),
  setLastRoutingDecision: (lastRoutingDecision) => set({ lastRoutingDecision }),
  setBootComplete: (bootComplete) => set({ bootComplete }),
  setSimulationRunning: (running) => set({ simulationRunning: running }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  updateNode: (id, updates) => set((s) => ({
    nodes: s.nodes.map(n => n.id === id ? { ...n, ...updates } : n),
  })),
  updateLink: (id, updates) => set((s) => ({
    links: s.links.map(l => l.id === id ? { ...l, ...updates } : l),
  })),
}));
