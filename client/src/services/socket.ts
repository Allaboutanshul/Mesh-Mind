import { io, Socket } from 'socket.io-client';
import { useStore } from '../store/useStore';
import { SimulationTransport } from './simulationTransport';
import { setActiveTransport } from './transport';
import type { MeshTransport, SendMessageParams, NetworkStatusParams } from './transport';
import type { MeshNode } from '../types';

let socket: Socket | null = null;
let simTransport: SimulationTransport | null = null;

function ensureSimTransport(): SimulationTransport {
  if (!simTransport) simTransport = new SimulationTransport();
  return simTransport;
}

function switchToSimulation(): void {
  const sim = ensureSimTransport();
  setActiveTransport(sim);
  sim.connect();
  useStore.setState({ backendConnected: false });
}

function switchToSocket(): void {
  if (simTransport) simTransport.disconnect();
  setActiveTransport(webSocketTransport);
  useStore.setState({ backendConnected: true });
}

const webSocketTransport: MeshTransport = {
  name: 'websocket',
  connect: () => { /* managed by initSocket lifecycle */ },
  disconnect: () => { socket?.disconnect(); },
  discoverPeers: (): MeshNode[] => useStore.getState().nodes,
  sendMessage: async (params: SendMessageParams) => {
    if (!socket?.connected) return { ok: false, error: 'Backend disconnected' };
    return new Promise((resolve) => {
      const emit = () => {
        socket!.emit('send:message', params);
        resolve({ ok: true });
      };
      if (socket!.connected) emit(); else resolve({ ok: false, error: 'Backend disconnected' });
    });
  },
  sendEmergencySOS: async (params) => {
    if (!socket?.connected) return { ok: false, error: 'Backend disconnected' };
    return new Promise((resolve) => {
      const emit = () => {
        socket!.emit('send:sos', params);
        resolve({ ok: true });
      };
      if (socket!.connected) emit(); else resolve({ ok: false, error: 'Backend disconnected' });
    });
  },
  disableNode: (nodeId: string) => { socket?.emit('node:disable', { nodeId }); },
  enableNode: (nodeId: string) => { socket?.emit('node:enable', { nodeId }); },
  applyPreset: (preset: string) => { socket?.emit('simulation:start', { preset }); },
  reset: () => { socket?.emit('simulation:reset'); },
  setNetworkStatus: (status: NetworkStatusParams) => { socket?.emit('network:set', status); },
  retryStored: () => { socket?.emit('retry:stored'); },
  getConnectionStatus: () => (socket?.connected ? 'connected' : 'disconnected'),
};

export function initSocket(): Socket {
  if (socket) return socket;

  // Same-origin connection — in dev this goes through the Vite proxy to the
  // unified backend (server, port 5000). No hardcoded backend URL needed.
  socket = io({
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
  });

  socket.on('connect', () => {
    switchToSocket();
    socket!.emit('request:network');
    socket!.emit('request:messages');
  });
  socket.on('disconnect', () => switchToSimulation());
  socket.on('connect_error', () => switchToSimulation());

  socket.on('mesh:updated', (data) => {
    useStore.getState().setNetworkState(data);
  });
  socket.on('message:created', (data) => {
    useStore.getState().addMessage(data.message);
    if (data.routingDecision) useStore.getState().setLastRoutingDecision(data.routingDecision);
  });
  socket.on('message:delivered', (data) => {
    useStore.getState().updateMessage(data.messageId, { status: 'DELIVERED', deliveredAt: data.deliveredAt });
  });
  socket.on('message:forwarded', (data) => {
    useStore.getState().updateMessage(data.messageId, { status: 'FORWARDING', currentHop: data.hop });
  });
  socket.on('message:failed', (data) => { useStore.getState().updateMessage(data.messageId, { status: 'FAILED' }); });
  socket.on('message:stored', (data) => { useStore.getState().updateMessage(data.messageId, { status: 'STORED' }); });
  socket.on('route:changed', (data) => {
    useStore.getState().addEvent({
      id: crypto.randomUUID(), timestamp: Date.now(), type: 'ROUTE_CHANGED',
      description: data.reason, messageId: data.messageId,
    });
  });
  socket.on('simulation:started', () => { useStore.setState({ simulationRunning: true }); });
  socket.on('simulation:stopped', () => { useStore.setState({ simulationRunning: false }); });
  socket.on('node:disconnected', (data) => { useStore.getState().updateNode(data.nodeId, { status: 'OFFLINE' }); });
  socket.on('node:connected', (data) => { if (data) useStore.getState().updateNode(data.id, data); });
  socket.on('messages:list', (data) => { useStore.getState().setMessages(data); });
  socket.on('analytics:snapshot', (data) => { useStore.getState().addAnalytics(data); });

  // If the backend never connects, drop into offline simulation mode after a
  // short grace period so the app is usable with zero infrastructure.
  setTimeout(() => {
    if (socket && !socket.connected) switchToSimulation();
  }, 1500);

  return socket;
}

export function getSocket(): Socket | null { return socket; }

export function getActiveTransport(): MeshTransport {
  return (useStore.getState().backendConnected ? webSocketTransport : ensureSimTransport());
}