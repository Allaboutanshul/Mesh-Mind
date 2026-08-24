import { v4 as uuidv4 } from 'uuid';
import type {
  MeshNode,
  MeshLink,
  MeshMessage,
  NetworkState,
  AnalyticsSnapshot,
  SimulationEvent,
} from '../types/index.js';

export type { MeshNode, MeshLink, MeshMessage, NetworkState, AnalyticsSnapshot, SimulationEvent, NodeType, EmergencySOS, RescueTask, EmergencyBroadcast, NetworkHealth } from '../types/index.js';

/**
 * Simple in‑memory store for the MeshMind server.
 * It holds nodes, links, messages, analytics snapshots and events.
 * All methods are synchronous for simplicity – the server runs in a single process.
 */
export class InMemoryStore {
  private nodes: MeshNode[] = [];
  private links: MeshLink[] = [];
  private messages: MeshMessage[] = [];
  private analytics: AnalyticsSnapshot[] = [];
  private events: SimulationEvent[] = [];
  internetAvailable = true;
  cellularAvailable = true;
  meshActive = true;

  setAvailability(internet: boolean, cellular: boolean): void {
    this.internetAvailable = internet;
    this.cellularAvailable = cellular;
    this.meshActive = !internet || !cellular;
  }

  /**
   * Seed the store with a small default topology.
   * This provides a demo mesh with a few nodes and bi‑directional links.
   */
  seedDefaultData(): void {
    // Clear any existing data first.
    this.nodes = [];
    this.links = [];
    this.messages = [];
    this.analytics = [];
    this.events = [];
    this.internetAvailable = true;
    this.cellularAvailable = true;
    this.meshActive = true;

    // Create 8 demo nodes across an emergency response area.
    const demoNodes: MeshNode[] = [
      {
        id: uuidv4(), name: 'Command Center', type: 'COMMAND', x: 600, y: 60,
        battery: 100, signalStrength: 100, reliability: 100, latency: 10, bandwidth: 1000,
        status: 'ONLINE', location: { lat: 0, lng: 0, sector: 'A', zone: 'Z1' },
        lastSeen: Date.now(), workload: 0, queueLength: 0, messagesRelayed: 0, messagesOriginated: 0,
      },
      {
        id: uuidv4(), name: 'Rescue Drone 1', type: 'DRONE', x: 450, y: 130,
        battery: 85, signalStrength: 90, reliability: 95, latency: 15, bandwidth: 800,
        status: 'ONLINE', location: { lat: 0, lng: 0, sector: 'B', zone: 'Z1' },
        lastSeen: Date.now(), workload: 0, queueLength: 0, messagesRelayed: 0, messagesOriginated: 0,
      },
      {
        id: uuidv4(), name: 'Medical Hub', type: 'MEDICAL', x: 150, y: 120,
        battery: 92, signalStrength: 85, reliability: 90, latency: 18, bandwidth: 700,
        status: 'ONLINE', location: { lat: 0, lng: 0, sector: 'C', zone: 'Z2' },
        lastSeen: Date.now(), workload: 0, queueLength: 0, messagesRelayed: 0, messagesOriginated: 0,
      },
      {
        id: uuidv4(), name: 'Ambulance', type: 'AMBULANCE', x: 60, y: 260,
        battery: 78, signalStrength: 75, reliability: 85, latency: 22, bandwidth: 650,
        status: 'ONLINE', location: { lat: 0, lng: 0, sector: 'D', zone: 'Z2' },
        lastSeen: Date.now(), workload: 0, queueLength: 0, messagesRelayed: 0, messagesOriginated: 0,
      },
      {
        id: uuidv4(), name: 'Volunteer A', type: 'VOLUNTEER', x: 280, y: 300,
        battery: 70, signalStrength: 80, reliability: 88, latency: 20, bandwidth: 600,
        status: 'ONLINE', location: { lat: 0, lng: 0, sector: 'E', zone: 'Z3' },
        lastSeen: Date.now(), workload: 0, queueLength: 0, messagesRelayed: 0, messagesOriginated: 0,
      },
      {
        id: uuidv4(), name: 'Volunteer B', type: 'VOLUNTEER', x: 480, y: 320,
        battery: 55, signalStrength: 72, reliability: 82, latency: 24, bandwidth: 550,
        status: 'ONLINE', location: { lat: 0, lng: 0, sector: 'F', zone: 'Z3' },
        lastSeen: Date.now(), workload: 0, queueLength: 0, messagesRelayed: 0, messagesOriginated: 0,
      },
      {
        id: uuidv4(), name: 'Citizen A', type: 'CITIZEN', x: 180, y: 430,
        battery: 45, signalStrength: 68, reliability: 78, latency: 28, bandwidth: 500,
        status: 'ONLINE', location: { lat: 0, lng: 0, sector: 'G', zone: 'Z4' },
        lastSeen: Date.now(), workload: 0, queueLength: 0, messagesRelayed: 0, messagesOriginated: 0,
      },
      {
        id: uuidv4(), name: 'Victim', type: 'VICTIM', x: 420, y: 440,
        battery: 35, signalStrength: 60, reliability: 70, latency: 30, bandwidth: 450,
        status: 'ONLINE', location: { lat: 0, lng: 0, sector: 'H', zone: 'Z4' },
        lastSeen: Date.now(), workload: 0, queueLength: 0, messagesRelayed: 0, messagesOriginated: 0,
      },
    ];

    // Build a sparse neighbor mesh (not fully connected) so multi-hop routes
    // and alternative paths are genuinely exercised by the routing engine.
    const pairs: Array<[number, number]> = [
      [0, 1], [0, 2], [0, 4],
      [1, 2], [1, 5],
      [2, 3], [2, 4],
      [3, 6],
      [4, 5], [4, 6],
      [5, 7],
      [6, 7],
    ];

    const demoLinks: MeshLink[] = [];
    for (const [a, b] of pairs) {
      const distance = Math.hypot(demoNodes[a].x - demoNodes[b].x, demoNodes[a].y - demoNodes[b].y);
      const link: MeshLink = {
        id: uuidv4(),
        source: demoNodes[a].id,
        target: demoNodes[b].id,
        distance,
        latency: Math.round(10 + Math.random() * 20),
        signalStrength: Math.round(70 + Math.random() * 30),
        reliability: Math.round(80 + Math.random() * 20),
        bandwidth: Math.round(500 + Math.random() * 500),
        active: true,
        congestion: Math.round(Math.random() * 30),
      };
      demoLinks.push(link);
    }

    this.nodes = demoNodes;
    this.links = demoLinks;

    // Attach role/relay metadata derived from the node type.
    for (const node of this.nodes) {
      node.role = node.role || node.type;
      node.relayEligible = !(node.status === 'OFFLINE') && !((node.role === 'VICTIM' || node.role === 'CIVILIAN' || node.role === 'CITIZEN') && node.battery < 15);
      node.isGateway = node.role === 'GATEWAY' || node.role === 'COMMAND' || node.role === 'COMMAND_CENTER';
      node.isDrone = node.role === 'DRONE';
    }
  }

  // ---------- Node utilities ----------
  getNodes(): MeshNode[] {
    return this.nodes;
  }
  getNode(id: string): MeshNode | undefined {
    return this.nodes.find((n) => n.id === id);
  }
  addNode(node: Partial<MeshNode> & { name: string; type: MeshNode['type'] }): MeshNode {
    const full: MeshNode = {
      id: node.id || uuidv4(),
      name: node.name,
      type: node.type,
      role: node.role || node.type,
      x: node.x ?? 50 + Math.random() * 400,
      y: node.y ?? 50 + Math.random() * 400,
      battery: node.battery ?? 100,
      signalStrength: node.signalStrength ?? 80,
      reliability: node.reliability ?? 90,
      latency: node.latency ?? 15,
      bandwidth: node.bandwidth ?? 600,
      status: node.status ?? 'ONLINE',
      location: node.location ?? { lat: 0, lng: 0, sector: 'F', zone: 'Z5' },
      lastSeen: node.lastSeen ?? Date.now(),
      workload: node.workload ?? 0,
      queueLength: node.queueLength ?? 0,
      messagesRelayed: node.messagesRelayed ?? 0,
      messagesOriginated: node.messagesOriginated ?? 0,
      relayEligible: node.relayEligible ?? (!(node.status === 'OFFLINE') && !((node.role || node.type) === 'VICTIM' && (node.battery ?? 100) < 15)),
      isGateway: node.isGateway ?? (node.role === 'GATEWAY' || node.type === 'GATEWAY' || node.role === 'COMMAND' || node.role === 'COMMAND_CENTER' || node.type === 'COMMAND' || node.type === 'COMMAND_CENTER'),
      isDrone: node.isDrone ?? (node.role === 'DRONE' || node.type === 'DRONE'),
    };
    this.nodes.push(full);
    return full;
  }
  updateNode(id: string, updates: Partial<MeshNode>): MeshNode | undefined {
    const idx = this.nodes.findIndex((n) => n.id === id);
    if (idx === -1) return undefined;
    this.nodes[idx] = { ...this.nodes[idx], ...updates } as MeshNode;
    return this.nodes[idx];
  }

  // ---------- Link utilities ----------
  getLinks(): MeshLink[] {
    return this.links;
  }
  getLink(id: string): MeshLink | undefined {
    return this.links.find((l) => l.id === id);
  }
  getLinksBetween(a: string, b: string): MeshLink | undefined {
    return this.links.find(
      (l) => (l.source === a && l.target === b) || (l.source === b && l.target === a)
    );
  }
  getLinksForNode(nodeId: string): MeshLink[] {
    return this.links.filter((l) => l.source === nodeId || l.target === nodeId);
  }
  updateLink(id: string, updates: Partial<MeshLink>): MeshLink | undefined {
    const idx = this.links.findIndex((l) => l.id === id);
    if (idx === -1) return undefined;
    this.links[idx] = { ...this.links[idx], ...updates } as MeshLink;
    return this.links[idx];
  }

  // ---------- Message utilities ----------
  getMessages(): MeshMessage[] {
    return this.messages;
  }
  getMessage(id: string): MeshMessage | undefined {
    return this.messages.find((m) => m.id === id);
  }
  addMessage(msg: MeshMessage): void {
    this.messages.push(msg);
    // Keep only the most recent 500 messages to avoid unbounded growth.
    if (this.messages.length > 500) this.messages.shift();
  }
  updateMessage(id: string, updates: Partial<MeshMessage>): MeshMessage | undefined {
    const idx = this.messages.findIndex((m) => m.id === id);
    if (idx === -1) return undefined;
    this.messages[idx] = { ...this.messages[idx], ...updates } as MeshMessage;
    return this.messages[idx];
  }
  isDuplicate(id: string): boolean {
    return this.messages.some((m) => m.id === id);
  }

  // ---------- Analytics utilities ----------
  addAnalyticsSnapshot(snap: AnalyticsSnapshot): void {
    this.analytics.push(snap);
    if (this.analytics.length > 500) this.analytics.shift();
  }
  getAnalytics(limit: number = 100): AnalyticsSnapshot[] {
    return this.analytics.slice(-limit).reverse();
  }

  // ---------- Event utilities ----------
  addEvent(event: SimulationEvent): void {
    this.events.push(event);
    if (this.events.length > 500) this.events.shift();
  }
  getEvents(limit: number = 100): SimulationEvent[] {
    return this.events.slice(-limit).reverse();
  }

  // ---------- Network state ----------
  getNetworkState(): NetworkState {
    const totalNodes = this.nodes.length;
    const onlineNodes = this.nodes.filter((n) => n.status === 'ONLINE').length;
    const activeLinks = this.links.filter((l) => l.active).length;
    const messagesDelivered = this.messages.filter((m) => m.status === 'DELIVERED').length;
    const messagesPending = this.messages.filter((m) => m.status !== 'DELIVERED' && m.status !== 'FAILED').length;
    const messagesFailed = this.messages.filter((m) => m.status === 'FAILED').length;
    const emergencyMessages = this.messages.filter((m) => m.priority === 'P1' || m.type === 'SOS').length;
    const avgLatency =
      this.messages.reduce((sum, m) => (m.actualLatency ? sum + m.actualLatency : sum), 0) /
      Math.max(messagesDelivered, 1);
    const packetDeliveryRate = Math.round((messagesDelivered / Math.max(messagesDelivered + messagesFailed, 1)) * 100);
    const meshHealth = Math.round((onlineNodes / totalNodes) * 100);
    const batteryRisk = this.nodes.reduce((risk, n) => {
      if (n.battery < 10) return 'CRITICAL';
      if (n.battery < 25) return risk === 'CRITICAL' ? risk : 'HIGH';
      if (n.battery < 50) return risk === 'CRITICAL' || risk === 'HIGH' ? risk : 'MEDIUM';
      return risk;
    }, 'LOW' as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL');

    return {
      nodes: this.nodes,
      links: this.links,
      internetAvailable: this.internetAvailable,
      cellularAvailable: this.cellularAvailable,
      meshActive: this.meshActive,
      stats: {
        totalNodes,
        onlineNodes,
        activeLinks,
        messagesDelivered,
        messagesPending,
        messagesFailed,
        emergencyMessages,
        averageLatency: Math.round(avgLatency),
        packetDeliveryRate,
        meshHealth,
        batteryRisk,
      },
    };
  }

  // ---------- Reset ----------
  reset(): void {
    this.seedDefaultData();
  }
}
