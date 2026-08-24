import type { Server as SocketServer, Socket } from 'socket.io';
import type { InMemoryStore } from '../services/inMemoryStore.js';
import type { MeshSimulationEngine } from '../simulation/engine.js';
import type { RoutingEngine } from '../routing/engine.js';
import type { MessageService } from '../services/messageService.js';

export function setupSocketHandlers(
  io: SocketServer,
  store: InMemoryStore,
  simulation: MeshSimulationEngine,
  _routing: RoutingEngine,
  messageService: MessageService
): void {
  io.on('connection', (socket: Socket) => {
    console.log(`[SOCKET] Client connected: ${socket.id}`);
    socket.emit('mesh:updated', store.getNetworkState());

    socket.on('request:network', () => { socket.emit('mesh:updated', store.getNetworkState()); });
    socket.on('request:messages', () => { socket.emit('messages:list', store.getMessages()); });

    socket.on('send:message', async (data) => {
      try {
        const result = await messageService.createMessage(data);
        if (result) io.emit('mesh:updated', store.getNetworkState());
      } catch (err) { console.error('[SOCKET] Message error:', err); }
    });

    socket.on('send:sos', async (data) => {
      try {
        const result = await messageService.createEmergencySOS(data);
        if (result) io.emit('mesh:updated', store.getNetworkState());
      } catch (err) { console.error('[SOCKET] SOS error:', err); }
    });

    socket.on('simulation:start', (data) => {
      simulation.start(data?.preset);
      io.emit('simulation:started', { preset: data?.preset });
    });
    socket.on('simulation:stop', () => {
      simulation.stop();
      io.emit('simulation:stopped', {});
    });
    socket.on('simulation:reset', () => {
      store.reset();
      io.emit('simulation:stopped', {});
      io.emit('mesh:updated', store.getNetworkState());
    });
    socket.on('node:disable', (data) => {
      simulation.disableNode(data.nodeId);
      io.emit('node:disconnected', { nodeId: data.nodeId });
      io.emit('mesh:updated', store.getNetworkState());
    });
    socket.on('node:enable', (data) => {
      simulation.enableNode(data.nodeId);
      io.emit('node:connected', store.getNode(data.nodeId));
      io.emit('mesh:updated', store.getNetworkState());
    });
    socket.on('retry:stored', () => { messageService.retryStoredMessages(); });
    socket.on('network:set', (data) => {
      store.setAvailability(
        typeof data?.internetAvailable === 'boolean' ? data.internetAvailable : store.internetAvailable,
        typeof data?.cellularAvailable === 'boolean' ? data.cellularAvailable : store.cellularAvailable
      );
      io.emit('mesh:updated', store.getNetworkState());
    });
    socket.on('disconnect', () => { console.log(`[SOCKET] Client disconnected: ${socket.id}`); });
  });

  setInterval(() => { io.emit('mesh:updated', store.getNetworkState()); }, 3000);
}
