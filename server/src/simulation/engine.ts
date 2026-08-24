import { v4 as uuidv4 } from 'uuid';
import type { InMemoryStore } from '../services/inMemoryStore.js';

export type SimulationPreset = 'NORMAL' | 'FLOOD' | 'EARTHQUAKE' | 'CYCLONE' | 'TOWER_FAILURE' | 'INTERNET_BLACKOUT' | 'CONGESTION' | 'MULTI_NODE_FAILURE' | 'MASS_SOS';

export class MeshSimulationEngine {
  private store: InMemoryStore;
  private running = false;
  private interval: ReturnType<typeof setInterval> | null = null;
  private currentPreset: SimulationPreset | null = null;
  private elapsed = 0;
  private speed = 1;

  constructor(store: InMemoryStore) {
    this.store = store;
  }

  getState() {
    return { running: this.running, preset: this.currentPreset, elapsed: this.elapsed, speed: this.speed };
  }

  start(preset?: SimulationPreset): void {
    if (this.running) this.stop();
    this.running = true;
    this.elapsed = 0;
    this.currentPreset = preset || null;
    if (preset) this.applyPreset(preset);
    this.interval = setInterval(() => { this.elapsed += 1000; this.tick(); }, 1000 / this.speed);
  }

  stop(): void {
    this.running = false;
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
  }

  setSpeed(speed: number): void {
    this.speed = Math.max(0.5, Math.min(5, speed));
    if (this.running) {
      if (this.interval) clearInterval(this.interval);
      this.interval = setInterval(() => { this.elapsed += 1000; this.tick(); }, 1000 / this.speed);
    }
  }

  private tick(): void {
    const nodes = this.store.getNodes();
    for (const node of nodes) {
      if (node.status === 'OFFLINE') continue;
      const drain = 0.01 + Math.random() * 0.05;
      const newBattery = Math.max(0, node.battery - drain);
      const newStatus = newBattery <= 0 ? 'OFFLINE' as const :
                       newBattery < 15 ? 'CRITICAL' as const :
                       newBattery < 30 ? 'WARNING' as const : node.status;
      this.store.updateNode(node.id, { battery: Math.round(newBattery * 100) / 100, status: newStatus });
    }
    const links = this.store.getLinks();
    for (const link of links) {
      if (!link.active) continue;
      const fluctuation = (Math.random() - 0.5) * 4;
      const newSignal = Math.max(10, Math.min(100, link.signalStrength + fluctuation));
      this.store.updateLink(link.id, { signalStrength: Math.round(newSignal) });
    }
    if (this.elapsed % 5000 === 0) this.recordAnalytics();
  }

  private recordAnalytics(): void {
    const state = this.store.getNetworkState();
    const nodes = state.nodes;
    this.store.addAnalyticsSnapshot({
      timestamp: Date.now(),
      messagesPerMinute: Math.round(Math.random() * 20 + state.stats.messagesDelivered / 10),
      deliveryRate: state.stats.packetDeliveryRate,
      averageLatency: state.stats.averageLatency || Math.round(100 + Math.random() * 100),
      nodeAvailability: (state.stats.onlineNodes / Math.max(state.stats.totalNodes, 1)) * 100,
      averageBattery: nodes.reduce((s, n) => s + n.battery, 0) / Math.max(nodes.length, 1),
      routeChanges: Math.round(Math.random() * 5),
      congestionLevel: state.links.reduce((s, l) => s + l.congestion, 0) / Math.max(state.links.length, 1),
      emergencyResponseTime: Math.round(200 + Math.random() * 300),
      activeNodes: state.stats.onlineNodes,
      activeLinks: state.stats.activeLinks,
    });
  }

  applyPreset(preset: SimulationPreset): void {
    this.store.reset();
    this.currentPreset = preset;

    switch (preset) {
      case 'NORMAL': break;
      case 'FLOOD': {
        const nodes = this.store.getNodes();
        for (let i = 0; i < Math.floor(nodes.length * 0.3); i++) {
          const node = nodes[Math.floor(Math.random() * nodes.length)];
          this.store.updateNode(node.id, {
            battery: Math.round(15 + Math.random() * 30),
            signalStrength: Math.round(20 + Math.random() * 40),
            status: Math.random() > 0.5 ? 'WARNING' : 'CRITICAL',
          });
        }
        const links = this.store.getLinks();
        for (let i = 0; i < Math.floor(links.length * 0.25); i++) {
          const link = links[Math.floor(Math.random() * links.length)];
          this.store.updateLink(link.id, { active: false, signalStrength: 0, reliability: Math.round(20 + Math.random() * 30) });
        }
        this.store.internetAvailable = false;
        this.store.cellularAvailable = false;
        this.store.addEvent({ id: uuidv4(), timestamp: Date.now(), type: 'LINK_FAILURE', description: 'Flood disaster - multiple links damaged' });
        break;
      }
      case 'EARTHQUAKE': {
        const nodes = this.store.getNodes();
        for (let i = 0; i < Math.floor(nodes.length * 0.4); i++) {
          if (nodes[i].type !== 'COMMAND') {
            this.store.updateNode(nodes[i].id, { status: Math.random() > 0.3 ? 'OFFLINE' : 'CRITICAL', battery: Math.round(Math.random() * 25) });
          }
        }
        const links = this.store.getLinks();
        for (const link of links) {
          if (Math.random() > 0.5) this.store.updateLink(link.id, { active: false, reliability: 0 });
        }
        this.store.internetAvailable = false;
        this.store.cellularAvailable = false;
        this.store.addEvent({ id: uuidv4(), timestamp: Date.now(), type: 'NODE_FAILURE', description: 'Earthquake - massive infrastructure damage' });
        break;
      }
      case 'CYCLONE': {
        const links = this.store.getLinks();
        for (const link of links) {
          this.store.updateLink(link.id, {
            signalStrength: Math.round(Math.max(10, link.signalStrength - 30 - Math.random() * 20)),
            latency: Math.round(link.latency * (1.5 + Math.random())),
            reliability: Math.round(Math.max(20, link.reliability - 20 - Math.random() * 20)),
          });
        }
        this.store.internetAvailable = false;
        this.store.cellularAvailable = false;
        this.store.addEvent({ id: uuidv4(), timestamp: Date.now(), type: 'SIGNAL_DEGRADED', description: 'Cyclone - severe signal degradation' });
        break;
      }
      case 'TOWER_FAILURE':
        this.store.internetAvailable = false;
        this.store.cellularAvailable = false;
        this.store.addEvent({ id: uuidv4(), timestamp: Date.now(), type: 'LINK_FAILURE', description: 'All communication towers offline' });
        break;
      case 'INTERNET_BLACKOUT':
        this.store.internetAvailable = false;
        this.store.cellularAvailable = false;
        this.store.addEvent({ id: uuidv4(), timestamp: Date.now(), type: 'LINK_FAILURE', description: 'Complete internet blackout' });
        break;
      case 'CONGESTION': {
        const nodes = this.store.getNodes();
        for (const node of nodes) {
          this.store.updateNode(node.id, { queueLength: Math.round(50 + Math.random() * 50), workload: Math.round(80 + Math.random() * 20) });
        }
        const links = this.store.getLinks();
        for (const link of links) {
          this.store.updateLink(link.id, { congestion: Math.round(60 + Math.random() * 40), latency: Math.round(link.latency * 3) });
        }
        this.store.addEvent({ id: uuidv4(), timestamp: Date.now(), type: 'CONGESTION_HIGH', description: 'Network congestion - all nodes overloaded' });
        break;
      }
      case 'MULTI_NODE_FAILURE': {
        const nodes = this.store.getNodes();
        const failCount = Math.floor(nodes.length * 0.5);
        for (let i = 0; i < failCount; i++) {
          const idx = Math.floor(Math.random() * nodes.length);
          this.store.updateNode(nodes[idx].id, { status: 'OFFLINE' });
          const nodeLinks = this.store.getLinksForNode(nodes[idx].id);
          for (const link of nodeLinks) this.store.updateLink(link.id, { active: false });
        }
        this.store.internetAvailable = false;
        this.store.cellularAvailable = false;
        this.store.addEvent({ id: uuidv4(), timestamp: Date.now(), type: 'NODE_FAILURE', description: 'Multiple node failures detected' });
        break;
      }
      case 'MASS_SOS':
        this.store.internetAvailable = false;
        this.store.cellularAvailable = false;
        this.store.addEvent({ id: uuidv4(), timestamp: Date.now(), type: 'SOS_GENERATED', description: 'Mass SOS event - 50 emergency requests incoming' });
        break;
    }
  }

  disableNode(nodeId: string): void {
    this.store.updateNode(nodeId, { status: 'OFFLINE' });
    for (const link of this.store.getLinksForNode(nodeId)) this.store.updateLink(link.id, { active: false });
    this.store.addEvent({ id: uuidv4(), timestamp: Date.now(), type: 'NODE_FAILURE', description: `Node ${nodeId} went offline`, nodeId });
  }

  enableNode(nodeId: string): void {
    this.store.updateNode(nodeId, { status: 'ONLINE', battery: 80 + Math.random() * 20 });
    for (const link of this.store.getLinksForNode(nodeId)) this.store.updateLink(link.id, { active: true, signalStrength: 60 + Math.round(Math.random() * 30) });
    this.store.addEvent({ id: uuidv4(), timestamp: Date.now(), type: 'NODE_RECOVERY', description: `Node ${nodeId} recovered`, nodeId });
  }
}
