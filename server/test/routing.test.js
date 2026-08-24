import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryStore } from '../dist/services/inMemoryStore.js';
import { RoutingEngine } from '../dist/routing/engine.js';

function buildStore() {
  const store = new InMemoryStore();
  store.seedDefaultData();
  return store;
}

// Build a small deterministic graph through the store's public API so link
// attributes are fully controlled for weighted-routing assertions.
function buildBatteryGraph() {
  const store = new InMemoryStore();
  const addNode = (id, battery) => store.addNode({
    id, name: id, type: 'VOLUNTEER', x: 0, y: 0, battery,
    signalStrength: 90, reliability: 95, latency: 15, bandwidth: 600, status: 'ONLINE',
  });
  addNode('A', 90); addNode('B', 80); addNode('C', 8); addNode('D', 90);
  const links = store.getLinks();
  const push = (source, target, distance, latency, reliability, congestion) => {
    links.push({
      id: `L-${source}-${target}`, source, target, distance, latency,
      signalStrength: 90, reliability, bandwidth: 600, active: true, congestion,
    });
  };
  push('A', 'B', 100, 20, 90, 10);
  push('B', 'D', 100, 15, 95, 10);
  push('A', 'C', 100, 80, 99, 10);
  push('C', 'D', 100, 60, 99, 10);
  return store;
}

test('routing returns a valid multi-hop decision with explanation', () => {
  const store = buildStore();
  const engine = new RoutingEngine();
  const nodes = store.getNodes();
  const victim = nodes.find(n => n.name === 'Victim');
  const command = nodes.find(n => n.name === 'Command Center');
  const decision = engine.findRoute(store, victim.id, command.id, true, 'm1');
  assert.ok(decision, 'expected a route to exist');
  assert.ok(decision.selectedRoute.path.length >= 2, 'route must have at least source and dest');
  assert.ok(decision.selectedRoute.reliability > 0 && decision.selectedRoute.reliability <= 100);
  assert.ok(decision.explanation.includes(`${decision.selectedRoute.reliability}%`), 'explanation must include actual reliability');
  assert.ok(Array.isArray(decision.alternatives));
});

test('emergency routing explains reliability-first priorities', () => {
  const store = buildStore();
  const engine = new RoutingEngine();
  const nodes = store.getNodes();
  const victim = nodes.find(n => n.name === 'Victim');
  const command = nodes.find(n => n.name === 'Command Center');
  const decision = engine.findRoute(store, victim.id, command.id, true, 'm2');
  assert.ok(decision.explanation.includes('emergency routing priorities'));
});

test('routing avoids battery-critical relay when an alternative exists', () => {
  const store = buildBatteryGraph();
  const engine = new RoutingEngine();
  const decision = engine.findRoute(store, 'A', 'D', false, 'm3');
  assert.ok(decision, 'expected a route');
  assert.ok(!decision.selectedRoute.path.includes('C'), 'battery-critical node C must be avoided');
  assert.equal(decision.selectedRoute.path[0], 'A');
  assert.equal(decision.selectedRoute.path[decision.selectedRoute.path.length - 1], 'D');
});

test('routing returns null when no path exists', () => {
  const store = buildStore();
  const engine = new RoutingEngine();
  const nodes = store.getNodes();
  const victim = nodes.find(n => n.name === 'Victim');
  // Isolate the victim by disabling both of its neighbours.
  const victimLinks = store.getLinksForNode(victim.id);
  for (const link of victimLinks) {
    const other = link.source === victim.id ? link.target : link.source;
    store.updateNode(other, { status: 'OFFLINE' });
  }
  const command = nodes.find(n => n.name === 'Command Center');
  const decision = engine.findRoute(store, victim.id, command.id, true, 'm4');
  assert.equal(decision, null);
});

test('route changes when a relay node goes offline', () => {
  const store = buildStore();
  const engine = new RoutingEngine();
  const nodes = store.getNodes();
  const victim = nodes.find(n => n.name === 'Victim');
  const command = nodes.find(n => n.name === 'Command Center');
  const before = engine.findRoute(store, victim.id, command.id, true, 'm5').selectedRoute.path;
  const mid = before[1];
  store.updateNode(mid, { status: 'OFFLINE' });
  const after = engine.findRoute(store, victim.id, command.id, true, 'm6').selectedRoute.path;
  assert.notDeepEqual(before, after, 'route should change after a relay fails');
});
