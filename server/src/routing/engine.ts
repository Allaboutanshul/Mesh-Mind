import type { InMemoryStore, MeshNode, MeshLink, NodeType } from '../services/inMemoryStore.js';

export interface RouteOption {
  path: string[];
  totalCost: number;
  totalLatency: number;
  reliability: number;
  batteryRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  congestion: 'LOW' | 'MEDIUM' | 'HIGH';
  hopCount: number;
  explanation: string;
}

export interface RoutingWeights {
  distance: number;
  latency: number;
  battery: number;
  congestion: number;
  reliability: number;
}

export interface RoutingDecision {
  selectedRoute: RouteOption;
  alternatives: RouteOption[];
  explanation: string;
  timestamp: number;
  messageId: string;
  factors: RoutingWeights;
}

export interface NodeRoleInfo {
  role: NodeType;
  isVictim: boolean;
  isInfrastructure: boolean;
  relayEligible: boolean;
  relayPenalty: number;
  battery: number;
}

export function nodeRole(node: MeshNode): NodeType {
  return node.role || node.type;
}

export function isVictimRole(node: MeshNode): boolean {
  return nodeRole(node) === 'VICTIM' || nodeRole(node) === 'CIVILIAN' || nodeRole(node) === 'CITIZEN';
}

export function isInfrastructureRole(node: MeshNode): boolean {
  const role = nodeRole(node);
  return ['GATEWAY', 'COMMAND', 'COMMAND_CENTER', 'RESCUE', 'MEDICAL', 'AMBULANCE'].includes(role);
}

/**
 * Humanitarian battery tiers:
 *   > 50%  -> normal relay
 *   20-50% -> moderate penalty
 *   10-20% -> high penalty
 *   < 10%  -> avoid unless absolutely necessary
 */
export function batteryPenalty(node: MeshNode): number {
  if (node.battery < 10) return 1.5;
  if (node.battery < 20) return 1.1;
  if (node.battery < 50) return 0.6;
  return 0;
}

/**
 * Role-based relay preference. Infrastructure and rescue nodes are preferred
 * relays; victim devices are preserved (their battery is their lifeline) and
 * thus carry an extra penalty.
 */
export function rolePenalty(node: MeshNode): number {
  const role = nodeRole(node);
  switch (role) {
    case 'VICTIM': return 0.7;
    case 'CIVILIAN':
    case 'CITIZEN': return 0.4;
    case 'VOLUNTEER': return 0.15;
    case 'DRONE': return 0.1;
    default: return 0; // RESCUE / MEDICAL / AMBULANCE / GATEWAY / COMMAND / COMMAND_CENTER
  }
}

export function relayEligibility(node: MeshNode): boolean {
  if (node.status === 'OFFLINE') return false;
  if (isVictimRole(node) && node.battery < 15) return false; // preserve victim battery
  return true;
}

export function nodeRelayInfo(node: MeshNode): NodeRoleInfo {
  const role = nodeRole(node);
  return {
    role,
    isVictim: isVictimRole(node),
    isInfrastructure: isInfrastructureRole(node),
    relayEligible: relayEligibility(node),
    relayPenalty: rolePenalty(node),
    battery: node.battery,
  };
}

export class RoutingEngine {
  private readonly NORMAL_WEIGHTS: RoutingWeights = {
    distance: 0.15, latency: 0.30, battery: 0.15, congestion: 0.20, reliability: 0.20,
  };

  private readonly EMERGENCY_WEIGHTS: RoutingWeights = {
    distance: 0.05, latency: 0.25, battery: 0.10, congestion: 0.15, reliability: 0.45,
  };

  findRoute(
    store: InMemoryStore,
    sourceId: string,
    destId: string,
    isEmergency: boolean,
    messageId: string = ''
  ): RoutingDecision | null {
    const nodes = store.getNodes();
    const links = store.getLinks().filter(l => l.active);
    const weights = isEmergency ? this.EMERGENCY_WEIGHTS : this.NORMAL_WEIGHTS;

    const adj = new Map<string, { neighbor: string; link: MeshLink }[]>();
    for (const node of nodes) {
      if (node.status === 'OFFLINE') continue;
      adj.set(node.id, []);
    }
    for (const link of links) {
      const srcNode = store.getNode(link.source);
      const tgtNode = store.getNode(link.target);
      if (!srcNode || !tgtNode) continue;
      if (srcNode.status === 'OFFLINE' || tgtNode.status === 'OFFLINE') continue;
      adj.get(link.source)?.push({ neighbor: link.target, link });
      adj.get(link.target)?.push({ neighbor: link.source, link });
    }

    if (!adj.has(sourceId) || !adj.has(destId)) return null;

    const allPaths = this.findKShortestPaths(adj, store, sourceId, destId, weights, 5);
    if (allPaths.length === 0) return null;

    const routeOptions = allPaths.map(path => this.evaluatePath(path, store, links, weights));
    routeOptions.sort((a, b) => a.totalCost - b.totalCost);

    const selected = routeOptions[0];
    const alternatives = routeOptions.slice(1);
    const explanation = this.generateExplanation(selected, alternatives, store, weights, isEmergency);

    return {
      selectedRoute: { ...selected, explanation },
      alternatives,
      explanation,
      timestamp: Date.now(),
      messageId,
      factors: weights,
    };
  }

  private calculateEdgeCost(link: MeshLink, targetNode: MeshNode, weights: RoutingWeights): number {
    const distanceCost = (link.distance / 1000) * weights.distance;
    const latencyCost = (link.latency / 200) * weights.latency;
    const batteryCost = batteryPenalty(targetNode) * weights.battery;
    // A relay-ineligible node (e.g. a victim with critically low battery) is
    // heavily penalized but still usable as an absolute last resort.
    const notEligiblePenalty = relayEligibility(targetNode) ? 0 : 2.0;
    const roleCost = (rolePenalty(targetNode) + notEligiblePenalty) * weights.battery;
    const congestionCost = (link.congestion / 100) * weights.congestion;
    const reliabilityCost = ((100 - link.reliability) / 100) * weights.reliability;
    return distanceCost + latencyCost + batteryCost + roleCost + congestionCost + reliabilityCost;
  }

  private findKShortestPaths(
    adj: Map<string, { neighbor: string; link: MeshLink }[]>,
    store: InMemoryStore,
    source: string,
    dest: string,
    weights: RoutingWeights,
    k: number
  ): string[][] {
    const paths: string[][] = [];
    const pq: [number, string, string[]][] = [[0, source, [source]]];
    const visitCounts = new Map<string, number>();

    while (pq.length > 0 && paths.length < k) {
      let minIdx = 0;
      for (let i = 1; i < pq.length; i++) {
        if (pq[i][0] < pq[minIdx][0]) minIdx = i;
      }
      const [cost, current, path] = pq.splice(minIdx, 1)[0];

      const count = visitCounts.get(current) || 0;
      if (count >= k) continue;
      visitCounts.set(current, count + 1);

      if (current === dest) {
        paths.push(path);
        continue;
      }

      const neighbors = adj.get(current) || [];
      for (const { neighbor, link } of neighbors) {
        if (path.includes(neighbor)) continue;
        const targetNode = store.getNode(neighbor);
        if (!targetNode || targetNode.status === 'OFFLINE') continue;
        const edgeCost = this.calculateEdgeCost(link, targetNode, weights);
        pq.push([cost + edgeCost, neighbor, [...path, neighbor]]);
      }
    }

    return paths;
  }

  private evaluatePath(path: string[], store: InMemoryStore, links: MeshLink[], weights: RoutingWeights): RouteOption {
    let totalLatency = 0;
    let totalCost = 0;
    let minReliability = 100;
    let minBattery = 100;
    let maxCongestion = 0;

    for (let i = 0; i < path.length - 1; i++) {
      const link = links.find(l =>
        (l.source === path[i] && l.target === path[i + 1]) ||
        (l.source === path[i + 1] && l.target === path[i])
      );
      const node = store.getNode(path[i + 1]);
      if (link) {
        totalLatency += link.latency;
        minReliability = Math.min(minReliability, link.reliability);
        maxCongestion = Math.max(maxCongestion, link.congestion);
        // Use the same weighted cost as the path search so the final ranking
        // honours battery and role penalties.
        if (node) totalCost += this.calculateEdgeCost(link, node, weights);
      }
      if (node) minBattery = Math.min(minBattery, node.battery);
    }

    return {
      path,
      totalCost: Math.round(totalCost * 100) / 100,
      totalLatency,
      reliability: minReliability,
      batteryRisk: minBattery > 50 ? 'LOW' : minBattery > 25 ? 'MEDIUM' : minBattery > 10 ? 'HIGH' : 'CRITICAL',
      congestion: maxCongestion > 70 ? 'HIGH' : maxCongestion > 40 ? 'MEDIUM' : 'LOW',
      hopCount: path.length - 1,
      explanation: '',
    };
  }

  private avoidanceReasons(altPath: string[], selectedPath: string[], store: InMemoryStore): string[] {
    const reasons: string[] = [];
    for (const nodeId of altPath) {
      if (selectedPath.includes(nodeId)) continue;
      const node = store.getNode(nodeId);
      if (!node) continue;
      const info = nodeRelayInfo(node);
      const batteryReason =
        node.battery < 10 ? 'critically low battery' :
        node.battery < 20 ? 'low battery' : null;
      const victimReason = info.isVictim ? `a ${info.role} device` : null;
      if (batteryReason && victimReason) {
        reasons.push(`Relay node ${node.name} avoided because it is ${victimReason} with ${Math.round(node.battery)}% battery (${batteryReason})`);
      } else if (batteryReason) {
        reasons.push(`Relay node ${node.name} avoided because of ${batteryReason} (${Math.round(node.battery)}%)`);
      } else if (victimReason) {
        reasons.push(`Relay node ${node.name} avoided because it is ${victimReason} (preserve device for communication)`);
      } else if (!info.relayEligible) {
        reasons.push(`Relay node ${node.name} avoided because it is not relay-eligible`);
      }
    }
    return reasons;
  }

  private generateExplanation(
    selected: RouteOption,
    alternatives: RouteOption[],
    store: InMemoryStore,
    _weights: RoutingWeights,
    isEmergency: boolean
  ): string {
    const routeStr = selected.path.join(' → ');
    const parts: string[] = [];
    parts.push(`Route ${routeStr} was selected`);
    if (isEmergency) parts.push('using emergency routing priorities (reliability-first)');
    parts.push(`because it provides ${selected.reliability}% link reliability`);
    parts.push(`${selected.totalLatency}ms estimated latency`);
    if (selected.batteryRisk === 'LOW') {
      parts.push('and all relay nodes have sufficient battery');
    } else if (selected.batteryRisk === 'HIGH' || selected.batteryRisk === 'CRITICAL') {
      parts.push('despite battery concerns at some relay nodes (no better alternative available)');
    }
    if (selected.congestion === 'LOW') parts.push('with low network congestion along the path');

    const avoided: string[] = [];
    for (const alt of alternatives) {
      avoided.push(...this.avoidanceReasons(alt.path, selected.path, store));
    }
    const uniqueAvoided = [...new Set(avoided)];
    if (uniqueAvoided.length > 0) {
      parts.push(uniqueAvoided.slice(0, 3).join('; '));
    }

    if (alternatives.length > 0) {
      const alt = alternatives[0];
      if (alt.reliability < selected.reliability) {
        parts.push(`Alternative route via ${alt.path.join(' → ')} was rejected due to lower reliability (${alt.reliability}%)`);
      } else if (alt.totalLatency > selected.totalLatency) {
        parts.push(`Alternative route via ${alt.path.join(' → ')} had higher latency (${alt.totalLatency}ms)`);
      }
    }
    return parts.join(', ') + '.';
  }
}