import type { MeshNode, MeshLink, RoutingDecision, NodeType } from '../types';

export interface RoutingWeights {
  distance: number;
  latency: number;
  battery: number;
  congestion: number;
  reliability: number;
}

const NORMAL_WEIGHTS: RoutingWeights = {
  distance: 0.15, latency: 0.30, battery: 0.15, congestion: 0.20, reliability: 0.20,
};
const EMERGENCY_WEIGHTS: RoutingWeights = {
  distance: 0.05, latency: 0.25, battery: 0.10, congestion: 0.15, reliability: 0.45,
};

export function nodeRole(node: MeshNode): NodeType {
  return node.role || node.type;
}

export function isVictimRole(node: MeshNode): boolean {
  const role = nodeRole(node);
  return role === 'VICTIM' || role === 'CIVILIAN' || role === 'CITIZEN';
}

export function isInfrastructureRole(node: MeshNode): boolean {
  const role = nodeRole(node);
  return ['GATEWAY', 'COMMAND', 'COMMAND_CENTER', 'RESCUE', 'MEDICAL', 'AMBULANCE'].includes(role);
}

export function batteryPenalty(node: MeshNode): number {
  if (node.battery < 10) return 1.5;
  if (node.battery < 20) return 1.1;
  if (node.battery < 50) return 0.6;
  return 0;
}

export function rolePenalty(node: MeshNode): number {
  const role = nodeRole(node);
  switch (role) {
    case 'VICTIM': return 0.7;
    case 'CIVILIAN':
    case 'CITIZEN': return 0.4;
    case 'VOLUNTEER': return 0.15;
    case 'DRONE': return 0.1;
    default: return 0;
  }
}

export function relayEligibility(node: MeshNode): boolean {
  if (node.status === 'OFFLINE') return false;
  if (isVictimRole(node) && node.battery < 15) return false;
  return true;
}

function calculateEdgeCost(link: MeshLink, targetNode: MeshNode, weights: RoutingWeights): number {
  const distanceCost = (link.distance / 1000) * weights.distance;
  const latencyCost = (link.latency / 200) * weights.latency;
  const batteryCost = batteryPenalty(targetNode) * weights.battery;
  const notEligiblePenalty = relayEligibility(targetNode) ? 0 : 2.0;
  const roleCost = (rolePenalty(targetNode) + notEligiblePenalty) * weights.battery;
  const congestionCost = (link.congestion / 100) * weights.congestion;
  const reliabilityCost = ((100 - link.reliability) / 100) * weights.reliability;
  return distanceCost + latencyCost + batteryCost + roleCost + congestionCost + reliabilityCost;
}

function findKShortestPaths(
  adj: Map<string, { neighbor: string; link: MeshLink }[]>,
  nodes: MeshNode[],
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
    if (current === dest) { paths.push(path); continue; }
    const neighbors = adj.get(current) || [];
    for (const { neighbor, link } of neighbors) {
      if (path.includes(neighbor)) continue;
      const targetNode = nodes.find(n => n.id === neighbor);
      if (!targetNode || targetNode.status === 'OFFLINE') continue;
      const edgeCost = calculateEdgeCost(link, targetNode, weights);
      pq.push([cost + edgeCost, neighbor, [...path, neighbor]]);
    }
  }
  return paths;
}

function evaluatePath(path: string[], nodes: MeshNode[], links: MeshLink[], weights: RoutingWeights) {
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
    const node = nodes.find(n => n.id === path[i + 1]);
    if (link) {
      totalLatency += link.latency;
      minReliability = Math.min(minReliability, link.reliability);
      maxCongestion = Math.max(maxCongestion, link.congestion);
      if (node) totalCost += calculateEdgeCost(link, node, weights);
    }
    if (node) minBattery = Math.min(minBattery, node.battery);
  }

  return {
    path,
    totalCost: Math.round(totalCost * 100) / 100,
    totalLatency,
    reliability: minReliability,
    batteryRisk: (minBattery > 50 ? 'LOW' : minBattery > 25 ? 'MEDIUM' : minBattery > 10 ? 'HIGH' : 'CRITICAL') as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
    congestion: (maxCongestion > 70 ? 'HIGH' : maxCongestion > 40 ? 'MEDIUM' : 'LOW') as 'LOW' | 'MEDIUM' | 'HIGH',
    hopCount: path.length - 1,
    explanation: '',
  };
}

function avoidanceReasons(altPath: string[], selectedPath: string[], nodes: MeshNode[]): string[] {
  const reasons: string[] = [];
  for (const nodeId of altPath) {
    if (selectedPath.includes(nodeId)) continue;
    const node = nodes.find(n => n.id === nodeId);
    if (!node) continue;
    const victim = isVictimRole(node);
    const batteryReason = node.battery < 10 ? 'critically low battery' : node.battery < 20 ? 'low battery' : null;
    if (batteryReason && victim) {
      reasons.push(`Relay node ${node.name} avoided because it is a ${nodeRole(node)} device with ${Math.round(node.battery)}% battery (${batteryReason})`);
    } else if (batteryReason) {
      reasons.push(`Relay node ${node.name} avoided because of ${batteryReason} (${Math.round(node.battery)}%)`);
    } else if (victim) {
      reasons.push(`Relay node ${node.name} avoided because it is a ${nodeRole(node)} device (preserve device for communication)`);
    }
  }
  return reasons;
}

function generateExplanation(
  selected: ReturnType<typeof evaluatePath>,
  alternatives: ReturnType<typeof evaluatePath>[],
  nodes: MeshNode[],
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
  for (const alt of alternatives) avoided.push(...avoidanceReasons(alt.path, selected.path, nodes));
  const uniqueAvoided = [...new Set(avoided)];
  if (uniqueAvoided.length > 0) parts.push(uniqueAvoided.slice(0, 3).join('; '));

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

export function computeRoute(
  nodes: MeshNode[],
  links: MeshLink[],
  sourceId: string,
  destId: string,
  isEmergency: boolean,
  messageId: string = ''
): RoutingDecision | null {
  const activeLinks = links.filter(l => l.active);
  const weights = isEmergency ? EMERGENCY_WEIGHTS : NORMAL_WEIGHTS;

  const adj = new Map<string, { neighbor: string; link: MeshLink }[]>();
  for (const node of nodes) {
    if (node.status === 'OFFLINE') continue;
    adj.set(node.id, []);
  }
  for (const link of activeLinks) {
    const srcNode = nodes.find(n => n.id === link.source);
    const tgtNode = nodes.find(n => n.id === link.target);
    if (!srcNode || !tgtNode) continue;
    if (srcNode.status === 'OFFLINE' || tgtNode.status === 'OFFLINE') continue;
    adj.get(link.source)?.push({ neighbor: link.target, link });
    adj.get(link.target)?.push({ neighbor: link.source, link });
  }
  if (!adj.has(sourceId) || !adj.has(destId)) return null;

  const allPaths = findKShortestPaths(adj, nodes, sourceId, destId, weights, 5);
  if (allPaths.length === 0) return null;

  const routeOptions = allPaths.map(path => evaluatePath(path, nodes, activeLinks, weights));
  routeOptions.sort((a, b) => a.totalCost - b.totalCost);

  const selected = routeOptions[0];
  const alternatives = routeOptions.slice(1);
  const explanation = generateExplanation(selected, alternatives, nodes, isEmergency);

  return {
    selectedRoute: { ...selected, explanation },
    alternatives,
    explanation,
    timestamp: Date.now(),
    messageId,
    factors: weights,
  };
}