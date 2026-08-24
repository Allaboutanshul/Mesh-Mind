import { useStore } from '../store/useStore';
import type { MeshNode, MeshLink, MeshMessage, NetworkStats, AnalyticsSnapshot, NodeType, MessagePriority } from '../types';
import { computeRoute } from './routing';
import { buildEmergencyFields, buildSOSContent } from './emergency';
import type { MeshTransport, SendMessageParams, NetworkStatusParams, SendEmergencySOSParams } from './transport';

const PRIORITY_ORDER: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };

function receiverScore(node: { type: NodeType }): number {
  if (node.type === 'COMMAND' || node.type === 'COMMAND_CENTER' || node.type === 'GATEWAY') return 4;
  if (node.type === 'MEDICAL' || node.type === 'AMBULANCE') return 3;
  if (node.type === 'RESCUE') return 2;
  return 0;
}

function hashString(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return '00000000000000000000000000000000' + (h2 >>> 0).toString(16);
}

export class SimulationTransport implements MeshTransport {
  readonly name = 'simulation';
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private queueInterval: ReturnType<typeof setInterval> | null = null;
  private messageQueue: MeshMessage[] = [];
  private recentIds = new Set<string>();
  private running = false;

  connect(): void {
    if (this.running) return;
    this.running = true;
    this.seed();
    this.tickInterval = setInterval(() => this.tick(), 1000);
    this.queueInterval = setInterval(() => this.processQueue(), 600);
  }

  disconnect(): void {
    this.running = false;
    if (this.tickInterval) { clearInterval(this.tickInterval); this.tickInterval = null; }
    if (this.queueInterval) { clearInterval(this.queueInterval); this.queueInterval = null; }
  }

  getConnectionStatus(): 'connected' | 'disconnected' {
    return this.running ? 'connected' : 'disconnected';
  }

  discoverPeers(): MeshNode[] {
    return useStore.getState().nodes;
  }

  private seed(): void {
    const nodes = this.buildSeedNodes();
    useStore.setState({ nodes, links: [], messages: [], analytics: [], timeline: [] });
    useStore.getState().setLinks(this.buildSeedLinks());
    this.pushNetwork();
    this.recentIds.clear();
  }

  private buildSeedNodes(): MeshNode[] {
    const defs: Array<[string, MeshNode['type'], number, number, number, number, number, number]> = [
      ['Command Center', 'COMMAND', 600, 60, 100, 100, 100, 10],
      ['Rescue Drone 1', 'DRONE', 450, 130, 85, 90, 95, 15],
      ['Medical Hub', 'MEDICAL', 150, 120, 92, 85, 90, 18],
      ['Ambulance', 'AMBULANCE', 60, 260, 78, 75, 85, 22],
      ['Volunteer A', 'VOLUNTEER', 280, 300, 70, 80, 88, 20],
      ['Volunteer B', 'VOLUNTEER', 480, 320, 55, 72, 82, 24],
      ['Citizen A', 'CITIZEN', 180, 430, 45, 68, 78, 28],
      ['Victim', 'VICTIM', 420, 440, 35, 60, 70, 30],
    ];
    return defs.map(([name, type, x, y, battery, signalStrength, reliability, latency]) => ({
      id: crypto.randomUUID(),
      name,
      type,
      role: type,
      x,
      y,
      battery,
      signalStrength,
      reliability,
      latency,
      bandwidth: 500 + Math.round(Math.random() * 500),
      status: 'ONLINE' as const,
      location: { lat: 0, lng: 0, sector: String.fromCharCode(65 + Math.floor(Math.random() * 5)), zone: 'Z1' },
      lastSeen: Date.now(),
      workload: 0,
      queueLength: 0,
      messagesRelayed: 0,
      messagesOriginated: 0,
      relayEligible: true,
      isGateway: type === 'GATEWAY' || type === 'COMMAND' || type === 'COMMAND_CENTER',
      isDrone: type === 'DRONE',
    }));
  }

  private buildSeedLinks(): MeshLink[] {
    const nodes = useStore.getState().nodes;
    const pairs: Array<[number, number]> = [
      [0, 1], [0, 2], [0, 4],
      [1, 2], [1, 5],
      [2, 3], [2, 4],
      [3, 6],
      [4, 5], [4, 6],
      [5, 7],
      [6, 7],
    ];
    const links: MeshLink[] = [];
    for (const [a, b] of pairs) {
      const distance = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y);
      links.push({
        id: crypto.randomUUID(),
        source: nodes[a].id,
        target: nodes[b].id,
        distance,
        latency: Math.round(10 + Math.random() * 20),
        signalStrength: Math.round(70 + Math.random() * 30),
        reliability: Math.round(80 + Math.random() * 20),
        bandwidth: Math.round(500 + Math.random() * 500),
        active: true,
        congestion: Math.round(Math.random() * 30),
      });
    }
    return links;
  }

  private computeStats(): NetworkStats {
    const { nodes, links, messages } = useStore.getState();
    const onlineNodes = nodes.filter(n => n.status === 'ONLINE').length;
    const activeLinks = links.filter(l => l.active).length;
    const messagesDelivered = messages.filter(m => m.status === 'DELIVERED').length;
    const messagesPending = messages.filter(m => m.status !== 'DELIVERED' && m.status !== 'FAILED').length;
    const messagesFailed = messages.filter(m => m.status === 'FAILED').length;
    const emergencyMessages = messages.filter(m => m.priority === 'P1' || m.type === 'SOS').length;
    const avgLatency =
      messages.reduce((sum, m) => (m.actualLatency ? sum + m.actualLatency : sum), 0) /
      Math.max(messagesDelivered, 1);
    return {
      totalNodes: nodes.length,
      onlineNodes,
      activeLinks,
      messagesDelivered,
      messagesPending,
      messagesFailed,
      emergencyMessages,
      averageLatency: Math.round(avgLatency),
      packetDeliveryRate: Math.round((messagesDelivered / Math.max(messagesDelivered + messagesFailed, 1)) * 100),
      meshHealth: Math.round((onlineNodes / Math.max(nodes.length, 1)) * 100),
      batteryRisk: 'LOW',
    };
  }

  private pushNetwork(): void {
    const store = useStore.getState();
    store.setNetworkState({
      nodes: store.nodes,
      links: store.links,
      internetAvailable: store.internetAvailable,
      cellularAvailable: store.cellularAvailable,
      meshActive: store.meshActive,
      stats: this.computeStats(),
    });
  }

  private tick(): void {
    const store = useStore.getState();
    const now = Date.now();
    for (const node of store.nodes) {
      if (node.status === 'OFFLINE') continue;
      const drain = 0.01 + Math.random() * 0.05;
      const newBattery = Math.max(0, node.battery - drain);
      const newStatus = newBattery <= 0 ? 'OFFLINE' : newBattery < 15 ? 'CRITICAL' : newBattery < 30 ? 'WARNING' : node.status;
      store.updateNode(node.id, { battery: Math.round(newBattery * 100) / 100, status: newStatus, lastSeen: now });
    }
    for (const link of store.links) {
      if (!link.active) continue;
      const fluctuation = (Math.random() - 0.5) * 4;
      const newSignal = Math.max(10, Math.min(100, link.signalStrength + fluctuation));
      store.updateLink(link.id, { signalStrength: Math.round(newSignal) });
    }
    this.pushNetwork();
    if (Math.floor(Date.now() / 1000) % 5 === 0) this.recordAnalytics();
  }

  private recordAnalytics(): void {
    const { nodes, links, stats, messages } = useStore.getState();
    const snap: AnalyticsSnapshot = {
      timestamp: Date.now(),
      messagesPerMinute: Math.round(Math.random() * 20 + stats.messagesDelivered / 10),
      deliveryRate: stats.packetDeliveryRate,
      averageLatency: stats.averageLatency || Math.round(100 + Math.random() * 100),
      nodeAvailability: (stats.onlineNodes / Math.max(stats.totalNodes, 1)) * 100,
      averageBattery: nodes.reduce((s, n) => s + n.battery, 0) / Math.max(nodes.length, 1),
      routeChanges: Math.round(Math.random() * 5),
      congestionLevel: links.reduce((s, l) => s + l.congestion, 0) / Math.max(links.length, 1),
      emergencyResponseTime: messages.some(m => m.type === 'SOS' && m.status === 'DELIVERED')
        ? 240 + Math.round(Math.random() * 120) : 0,
      activeNodes: stats.onlineNodes,
      activeLinks: stats.activeLinks,
    };
    useStore.getState().addAnalytics(snap);
  }

  async sendMessage(params: SendMessageParams): Promise<{ ok: boolean; error?: string; messageId?: string }> {
    const store = useStore.getState();
    const id = crypto.randomUUID();
    if (this.recentIds.has(id)) return { ok: false, error: 'Duplicate message dropped' };
    this.recentIds.add(id);
    if (this.recentIds.size > 500) {
      const oldest = this.recentIds.values().next().value;
      if (oldest) this.recentIds.delete(oldest);
    }

    const isEmergency = params.priority === 'P1' || params.type === 'SOS';
    const decision = computeRoute(store.nodes, store.links, params.senderId, params.receiverId, isEmergency, id);
    const route = decision ? decision.selectedRoute.path : [params.senderId, params.receiverId];
    const estimatedLatency = decision ? decision.selectedRoute.totalLatency : 999;
    const reachable = decision !== null;

    const message: MeshMessage = {
      id,
      senderId: params.senderId,
      receiverId: params.receiverId,
      type: params.type,
      priority: params.priority,
      content: params.content,
      timestamp: Date.now(),
      ttl: params.type === 'SOS' ? 20 : 10,
      route,
      currentHop: 0,
      hopCount: route.length - 1,
      status: reachable ? 'QUEUED' : 'STORED',
      deliveryAttempts: 0,
      createdAt: Date.now(),
      estimatedLatency,
      encrypted: params.encrypted || false,
      hash: hashString(`${id}:${params.senderId}:${params.content}`),
      description: params.description,
      location: params.location,
    };

    store.addMessage(message);
    const sender = store.nodes.find(n => n.id === params.senderId);
    if (sender) store.updateNode(params.senderId, { messagesOriginated: sender.messagesOriginated + 1 });
    if (decision) store.setLastRoutingDecision(decision);
    store.addEvent({ id: crypto.randomUUID(), timestamp: Date.now(), type: 'MESSAGE_SENT', description: `${params.type} message from ${params.senderId} to ${params.receiverId} [${params.priority}]`, messageId: id });
    if (reachable) {
      this.enqueue(message);
    } else {
      store.addEvent({ id: crypto.randomUUID(), timestamp: Date.now(), type: 'MESSAGE_STORED', description: `Destination unreachable - message ${id.slice(0, 8)} stored at ${params.senderId}`, messageId: id, nodeId: params.senderId });
    }
    this.pushNetwork();
    return { ok: true, messageId: id };
  }

  async sendEmergencySOS(params: SendEmergencySOSParams): Promise<{ ok: boolean; error?: string; messageId?: string; priority?: MessagePriority; summary?: string }> {
    const store = useStore.getState();
    const built = buildEmergencyFields(params);
    const sender = store.nodes.find(n => n.id === params.senderId);
    const location = params.location ?? sender?.location;

    let receiverId = params.receiverId || '';
    if (!receiverId) {
      const ranked = [...store.nodes]
        .filter(n => n.id !== params.senderId && n.status !== 'OFFLINE')
        .sort((a, b) => receiverScore(b) - receiverScore(a));
      receiverId = ranked[0]?.id || '';
    }
    if (!receiverId) return { ok: false, error: 'No emergency receiver available' };

    const content = buildSOSContent(params, built.summary, location);
    const id = crypto.randomUUID();
    if (this.recentIds.has(id)) return { ok: false, error: 'Duplicate message dropped' };
    this.recentIds.add(id);

    const isEmergency = built.priority === 'P1';
    const decision = computeRoute(store.nodes, store.links, params.senderId, receiverId, isEmergency, id);
    const route = decision ? decision.selectedRoute.path : [params.senderId, receiverId];
    const estimatedLatency = decision ? decision.selectedRoute.totalLatency : 999;
    const reachable = decision !== null;

    const now = Date.now();
    const message: MeshMessage = {
      id,
      senderId: params.senderId,
      receiverId,
      type: 'SOS',
      priority: built.priority,
      content,
      timestamp: now,
      ttl: built.priority === 'P1' ? 30 : built.priority === 'P2' ? 20 : 10,
      route,
      currentHop: 0,
      hopCount: route.length - 1,
      status: reachable ? 'QUEUED' : 'STORED',
      deliveryAttempts: 0,
      createdAt: now,
      estimatedLatency,
      encrypted: true,
      hash: hashString(`${id}:${params.senderId}:${content}`),
      description: 'Structured emergency SOS',
      location,
      expiryTime: now + (built.priority === 'P1' ? 30 : built.priority === 'P2' ? 20 : 10) * 60_000,
      retryCount: 0,
      lastAttemptedRoute: route,
      nextRetryTime: now,
      queueOwner: params.senderId,
      emergency: built.emergency,
    } as MeshMessage & Partial<import('../types').EmergencySOS>;

    store.addMessage(message as MeshMessage);
    const senderNode = store.nodes.find(n => n.id === params.senderId);
    if (senderNode) store.updateNode(params.senderId, { messagesOriginated: senderNode.messagesOriginated + 1 });
    if (decision) store.setLastRoutingDecision(decision);
    store.addEvent({ id: crypto.randomUUID(), timestamp: now, type: 'SOS_CREATED', description: `SOS created: ${built.summary} [${built.priority}] - ${built.explanation}`, messageId: id });
    if (reachable) {
      this.enqueue(message);
    } else {
      store.addEvent({ id: crypto.randomUUID(), timestamp: now, type: 'MESSAGE_STORED', description: `Destination unreachable - SOS ${id.slice(0, 8)} stored at ${params.senderId}`, messageId: id, nodeId: params.senderId });
    }
    this.pushNetwork();
    return { ok: true, messageId: id, priority: built.priority, summary: built.summary };
  }

  private enqueue(message: MeshMessage): void {
    const priority = PRIORITY_ORDER[message.priority];
    let inserted = false;
    for (let i = 0; i < this.messageQueue.length; i++) {
      if (PRIORITY_ORDER[this.messageQueue[i].priority] > priority) {
        this.messageQueue.splice(i, 0, message);
        inserted = true;
        break;
      }
    }
    if (!inserted) this.messageQueue.push(message);
  }

  private processQueue(): void {
    if (this.messageQueue.length === 0) return;
    const message = this.messageQueue.shift();
    if (message) this.deliverMessage(message);
  }

  private deliverMessage(message: MeshMessage): void {
    const store = useStore.getState();
    const current = store.messages.find(m => m.id === message.id);
    if (!current || current.status === 'DELIVERED' || current.status === 'FAILED' || current.status === 'EXPIRED') return;

    store.updateMessage(message.id, { status: 'IN_TRANSIT' });
    const route = [...current.route];
    let hop = 0;

    const step = (): void => {
      const msg = store.messages.find(m => m.id === message.id);
      if (!msg) return;
      if (hop >= route.length - 1) {
        const now = Date.now();
        store.updateMessage(message.id, { status: 'DELIVERED', currentHop: route.length - 1, deliveredAt: now, actualLatency: now - msg.createdAt });
        store.addEvent({ id: crypto.randomUUID(), timestamp: now, type: 'MESSAGE_DELIVERED', description: `Message ${message.id.slice(0, 8)} delivered to ${message.receiverId}`, messageId: message.id });
        this.pushNetwork();
        return;
      }

      const fromNode = route[hop];
      const toNode = route[hop + 1];
      const node = store.nodes.find(n => n.id === toNode);

      if (!node || node.status === 'OFFLINE') {
        const isEmergency = msg.priority === 'P1' || msg.type === 'SOS';
        const newDecision = computeRoute(store.nodes, store.links, fromNode, msg.receiverId, isEmergency, msg.id);
        if (newDecision) {
          const newRoute = [...route.slice(0, hop), ...newDecision.selectedRoute.path];
          store.updateMessage(msg.id, { route: newRoute });
          store.addEvent({ id: crypto.randomUUID(), timestamp: Date.now(), type: 'ROUTE_CHANGED', description: `Node ${toNode} offline - rerouted via ${newDecision.selectedRoute.path.join(' → ')}`, messageId: msg.id, nodeId: toNode });
          route.length = 0;
          route.push(...newRoute);
          setTimeout(step, 300);
          return;
        } else {
          store.updateMessage(msg.id, { status: 'STORED', currentHop: hop });
          store.addEvent({ id: crypto.randomUUID(), timestamp: Date.now(), type: 'MESSAGE_STORED', description: `Destination unreachable - message ${msg.id.slice(0, 8)} stored at ${fromNode}`, messageId: msg.id, nodeId: fromNode });
          this.pushNetwork();
          return;
        }
      }

      const ttl = (msg.ttl || message.ttl) - 1;
      if (ttl <= 0) {
        store.updateMessage(msg.id, { status: 'EXPIRED', ttl: 0 });
        store.addEvent({ id: crypto.randomUUID(), timestamp: Date.now(), type: 'MESSAGE_EXPIRED', description: `Message ${msg.id.slice(0, 8)} expired (TTL)`, messageId: msg.id });
        return;
      }

      hop++;
      store.updateMessage(msg.id, { status: 'FORWARDING', currentHop: hop, ttl, deliveryAttempts: (msg.deliveryAttempts || 0) + 1 });
      if (node && hop < route.length - 1) {
        store.updateNode(toNode, { messagesRelayed: node.messagesRelayed + 1 });
      }
      const link = store.links.find(l => (l.source === fromNode && l.target === toNode) || (l.source === toNode && l.target === fromNode));
      const delay = link ? Math.min(link.latency * 4 + 150, 900) : 500;
      setTimeout(step, delay);
    };

    setTimeout(step, 200);
  }

  disableNode(nodeId: string): void {
    const store = useStore.getState();
    store.updateNode(nodeId, { status: 'OFFLINE' });
    for (const link of store.links.filter(l => l.source === nodeId || l.target === nodeId)) {
      store.updateLink(link.id, { active: false });
    }
    store.addEvent({ id: crypto.randomUUID(), timestamp: Date.now(), type: 'NODE_FAILURE', description: `Node ${nodeId} went offline`, nodeId });
    this.pushNetwork();
  }

  enableNode(nodeId: string): void {
    const store = useStore.getState();
    store.updateNode(nodeId, { status: 'ONLINE', battery: 80 + Math.random() * 20 });
    for (const link of store.links.filter(l => l.source === nodeId || l.target === nodeId)) {
      store.updateLink(link.id, { active: true, signalStrength: 60 + Math.round(Math.random() * 30) });
    }
    store.addEvent({ id: crypto.randomUUID(), timestamp: Date.now(), type: 'NODE_RECOVERY', description: `Node ${nodeId} recovered`, nodeId });
    this.pushNetwork();
  }

  applyPreset(preset: string): void {
    this.seed();
    const store = useStore.getState();
    switch (preset) {
      case 'NORMAL': break;
      case 'FLOOD': {
        const nodes = store.nodes;
        for (let i = 0; i < Math.floor(nodes.length * 0.3); i++) {
          const node = nodes[Math.floor(Math.random() * nodes.length)];
          store.updateNode(node.id, { battery: Math.round(15 + Math.random() * 30), signalStrength: Math.round(20 + Math.random() * 40), status: Math.random() > 0.5 ? 'WARNING' : 'CRITICAL' });
        }
        for (let i = 0; i < Math.floor(store.links.length * 0.25); i++) {
          const link = store.links[Math.floor(Math.random() * store.links.length)];
          store.updateLink(link.id, { active: false, signalStrength: 0, reliability: Math.round(20 + Math.random() * 30) });
        }
        store.setNetworkState({ ...store, internetAvailable: false, cellularAvailable: false });
        store.addEvent({ id: crypto.randomUUID(), timestamp: Date.now(), type: 'LINK_FAILURE', description: 'Flood disaster - multiple links damaged' });
        break;
      }
      case 'EARTHQUAKE': {
        const nodes = store.nodes;
        for (let i = 0; i < Math.floor(nodes.length * 0.4); i++) {
          if (nodes[i].type !== 'COMMAND') {
            store.updateNode(nodes[i].id, { status: Math.random() > 0.3 ? 'OFFLINE' : 'CRITICAL', battery: Math.round(Math.random() * 25) });
          }
        }
        for (const link of store.links) {
          if (Math.random() > 0.5) store.updateLink(link.id, { active: false, reliability: 0 });
        }
        store.setNetworkState({ ...store, internetAvailable: false, cellularAvailable: false });
        store.addEvent({ id: crypto.randomUUID(), timestamp: Date.now(), type: 'NODE_FAILURE', description: 'Earthquake - massive infrastructure damage' });
        break;
      }
      case 'CYCLONE': {
        for (const link of store.links) {
          store.updateLink(link.id, { signalStrength: Math.round(Math.max(10, link.signalStrength - 30 - Math.random() * 20)), latency: Math.round(link.latency * (1.5 + Math.random())), reliability: Math.round(Math.max(20, link.reliability - 20 - Math.random() * 20)) });
        }
        store.setNetworkState({ ...store, internetAvailable: false, cellularAvailable: false });
        store.addEvent({ id: crypto.randomUUID(), timestamp: Date.now(), type: 'SIGNAL_DEGRADED', description: 'Cyclone - severe signal degradation' });
        break;
      }
      case 'TOWER_FAILURE':
        store.setNetworkState({ ...store, internetAvailable: false, cellularAvailable: false });
        store.addEvent({ id: crypto.randomUUID(), timestamp: Date.now(), type: 'LINK_FAILURE', description: 'All communication towers offline' });
        break;
      case 'INTERNET_BLACKOUT':
        store.setNetworkState({ ...store, internetAvailable: false, cellularAvailable: false });
        store.addEvent({ id: crypto.randomUUID(), timestamp: Date.now(), type: 'LINK_FAILURE', description: 'Complete internet blackout' });
        break;
      case 'CONGESTION': {
        for (const node of store.nodes) {
          store.updateNode(node.id, { queueLength: Math.round(50 + Math.random() * 50), workload: Math.round(80 + Math.random() * 20) });
        }
        for (const link of store.links) {
          store.updateLink(link.id, { congestion: Math.round(60 + Math.random() * 40), latency: Math.round(link.latency * 3) });
        }
        store.addEvent({ id: crypto.randomUUID(), timestamp: Date.now(), type: 'CONGESTION_HIGH', description: 'Network congestion - all nodes overloaded' });
        break;
      }
      case 'MULTI_NODE_FAILURE': {
        const nodes = store.nodes;
        const failCount = Math.floor(nodes.length * 0.5);
        for (let i = 0; i < failCount; i++) {
          const idx = Math.floor(Math.random() * nodes.length);
          store.updateNode(nodes[idx].id, { status: 'OFFLINE' });
          for (const link of store.links.filter(l => l.source === nodes[idx].id || l.target === nodes[idx].id)) {
            store.updateLink(link.id, { active: false });
          }
        }
        store.setNetworkState({ ...store, internetAvailable: false, cellularAvailable: false });
        store.addEvent({ id: crypto.randomUUID(), timestamp: Date.now(), type: 'NODE_FAILURE', description: 'Multiple node failures detected' });
        break;
      }
      case 'MASS_SOS':
        store.setNetworkState({ ...store, internetAvailable: false, cellularAvailable: false });
        store.addEvent({ id: crypto.randomUUID(), timestamp: Date.now(), type: 'SOS_GENERATED', description: 'Mass SOS event - 50 emergency requests incoming' });
        break;
    }
    this.pushNetwork();
  }

  reset(): void {
    this.seed();
    this.pushNetwork();
  }

  setNetworkStatus(status: NetworkStatusParams): void {
    const store = useStore.getState();
    const internet = typeof status.internetAvailable === 'boolean' ? status.internetAvailable : store.internetAvailable;
    const cellular = typeof status.cellularAvailable === 'boolean' ? status.cellularAvailable : store.cellularAvailable;
    store.setNetworkState({ ...store, internetAvailable: internet, cellularAvailable: cellular, meshActive: !internet || !cellular });
  }

  retryStored(): void {
    const store = useStore.getState();
    for (const msg of store.messages.filter(m => m.status === 'STORED')) {
      const currentHop = msg.currentHop;
      const fromNode = msg.route[currentHop];
      const isEmergency = msg.priority === 'P1' || msg.type === 'SOS';
      const decision = computeRoute(store.nodes, store.links, fromNode, msg.receiverId, isEmergency, msg.id);
      if (decision) {
        const newRoute = [...msg.route.slice(0, currentHop), ...decision.selectedRoute.path];
        store.updateMessage(msg.id, { route: newRoute, status: 'QUEUED' });
        store.addEvent({ id: crypto.randomUUID(), timestamp: Date.now(), type: 'ROUTE_CHANGED', description: 'Route restored - retrying stored message', messageId: msg.id });
        const updated = store.messages.find(m => m.id === msg.id);
        if (updated) this.enqueue(updated);
      }
    }
  }
}