import { Router, Request, Response } from 'express';
import type { Server as SocketServer } from 'socket.io';
import type { InMemoryStore } from '../services/inMemoryStore.js';
import type { MeshSimulationEngine } from '../simulation/engine.js';
import type { RoutingEngine } from '../routing/engine.js';
import type { MessageService } from '../services/messageService.js';
import { EmergencyPriorityEngine } from '../emergency/priorityEngine.js';

export function createRoutes(
  store: InMemoryStore,
  simulation: MeshSimulationEngine,
  routing: RoutingEngine,
  messageService: MessageService,
  io: SocketServer
): Router {
  const router = Router();

  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', uptime: process.uptime(), timestamp: Date.now() });
  });

  // Nodes
  router.get('/nodes', (_req: Request, res: Response) => { res.json(store.getNodes()); });
  router.get('/nodes/:id', (req: Request, res: Response) => {
    const node = store.getNode(req.params.id);
    if (!node) { res.status(404).json({ error: 'Node not found' }); return; }
    res.json(node);
  });
  router.post('/nodes', (req: Request, res: Response) => {
    const node = store.addNode({ ...req.body, lastSeen: Date.now() });
    io.emit('node:connected', node);
    res.status(201).json(node);
  });
  router.patch('/nodes/:id', (req: Request, res: Response) => {
    const node = store.updateNode(req.params.id, req.body);
    if (!node) { res.status(404).json({ error: 'Node not found' }); return; }
    io.emit('node:updated', node);
    res.json(node);
  });

  // Links
  router.get('/links', (_req: Request, res: Response) => { res.json(store.getLinks()); });

  // Messages
  router.get('/messages', (_req: Request, res: Response) => { res.json(store.getMessages()); });
  router.get('/messages/:id', (req: Request, res: Response) => {
    const msg = store.getMessage(req.params.id);
    if (!msg) { res.status(404).json({ error: 'Message not found' }); return; }
    res.json(msg);
  });
  router.post('/messages', async (req: Request, res: Response) => {
    try {
      const result = await messageService.createMessage(req.body);
      if (!result) { res.status(400).json({ error: 'Message creation failed' }); return; }
      res.status(201).json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Structured emergency SOS (priority auto-assigned)
  router.post('/sos', async (req: Request, res: Response) => {
    try {
      const result = await messageService.createEmergencySOS(req.body);
      if (!result) { res.status(400).json({ error: 'SOS creation failed' }); return; }
      res.status(201).json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Emergency priority engine (offline, explainable)
  router.post('/priority', (req: Request, res: Response) => {
    const engine = new EmergencyPriorityEngine();
    res.json(engine.evaluate(req.body || {}));
  });

  // Network
  router.get('/network', (_req: Request, res: Response) => { res.json(store.getNetworkState()); });
  router.post('/network/status', (req: Request, res: Response) => {
    const internet = typeof req.body.internetAvailable === 'boolean' ? req.body.internetAvailable : store.internetAvailable;
    const cellular = typeof req.body.cellularAvailable === 'boolean' ? req.body.cellularAvailable : store.cellularAvailable;
    store.setAvailability(internet, cellular);
    io.emit('mesh:updated', store.getNetworkState());
    res.json({ status: 'updated', network: store.getNetworkState() });
  });

  // Routing
  router.post('/route', (req: Request, res: Response) => {
    const { sourceId, destId, isEmergency, messageId } = req.body;
    if (!sourceId || !destId) { res.status(400).json({ error: 'sourceId and destId required' }); return; }
    const decision = routing.findRoute(store, sourceId, destId, isEmergency || false, messageId || '');
    if (!decision) { res.status(404).json({ error: 'No route found' }); return; }
    res.json(decision);
  });

  // Simulation
  router.get('/simulation', (_req: Request, res: Response) => { res.json(simulation.getState()); });
  router.post('/simulation/start', (req: Request, res: Response) => {
    simulation.start(req.body.preset);
    io.emit('simulation:started', { preset: req.body.preset });
    res.json({ status: 'started', preset: req.body.preset });
  });
  router.post('/simulation/stop', (_req: Request, res: Response) => {
    simulation.stop();
    io.emit('simulation:stopped', {});
    res.json({ status: 'stopped' });
  });
  router.post('/simulation/preset', (req: Request, res: Response) => {
    const { preset } = req.body;
    if (!preset) { res.status(400).json({ error: 'Preset required' }); return; }
    simulation.applyPreset(preset);
    io.emit('mesh:updated', store.getNetworkState());
    res.json({ status: 'applied', preset, network: store.getNetworkState() });
  });
  router.post('/simulation/node/:id/disable', (req: Request, res: Response) => {
    simulation.disableNode(req.params.id);
    io.emit('node:disconnected', { nodeId: req.params.id });
    io.emit('mesh:updated', store.getNetworkState());
    res.json({ status: 'disabled', nodeId: req.params.id });
  });
  router.post('/simulation/node/:id/enable', (req: Request, res: Response) => {
    simulation.enableNode(req.params.id);
    io.emit('node:connected', store.getNode(req.params.id));
    io.emit('mesh:updated', store.getNetworkState());
    res.json({ status: 'enabled', nodeId: req.params.id });
  });
  router.post('/simulation/reset', (_req: Request, res: Response) => {
    store.reset();
    io.emit('mesh:updated', store.getNetworkState());
    res.json({ status: 'reset', network: store.getNetworkState() });
  });

  // Analytics
  router.get('/analytics', (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 100;
    res.json(store.getAnalytics(limit));
  });

  // Events
  router.get('/events', (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 100;
    res.json(store.getEvents(limit));
  });

  return router;
}
