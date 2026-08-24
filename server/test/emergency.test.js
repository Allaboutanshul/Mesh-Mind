import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryStore } from '../dist/services/inMemoryStore.js';
import { RoutingEngine } from '../dist/routing/engine.js';
import { MessageService } from '../dist/services/messageService.js';
import { EmergencyPriorityEngine } from '../dist/emergency/priorityEngine.js';
import { buildEmergencyFields, generateEmergencySummary } from '../dist/emergency/sosFactory.js';

class FakeIO {
  constructor() { this.events = {}; }
  emit(ev, data) { (this.events[ev] = this.events[ev] || []).push(data); }
  on() {}
}

function setup() {
  const store = new InMemoryStore();
  store.seedDefaultData();
  const routing = new RoutingEngine();
  const io = new FakeIO();
  const svc = new MessageService(store, routing, io);
  const nodes = store.getNodes();
  const byName = (name) => nodes.find(n => n.name === name);
  return { store, io, svc, byName };
}

// ---------------------------------------------------------------------------
// FEATURE 2 - Emergency priority engine
// ---------------------------------------------------------------------------
test('priority engine: critical medical + trapped -> P1 with explanation', () => {
  const engine = new EmergencyPriorityEngine();
  const result = engine.evaluate({ criticalMedical: true, trapped: true, injuredCount: 1, peopleCount: 4 });
  assert.equal(result.priority, 'P1');
  assert.ok(result.reasons.includes('critical medical condition + trapped'));
  assert.ok(result.explanation.includes('P1 assigned because: critical medical condition + trapped'));
});

test('priority engine: medical emergency -> P2, food/water -> P3, info -> P4', () => {
  const engine = new EmergencyPriorityEngine();
  assert.equal(engine.evaluate({ injuredCount: 2, medicalRequired: true }).priority, 'P2');
  assert.equal(engine.evaluate({ trapped: true }).priority, 'P2');
  assert.equal(engine.evaluate({ evacuationRequired: true, peopleCount: 0 }).priority, 'P3');
  assert.equal(engine.evaluate({ foodRequired: true }).priority, 'P3');
  assert.equal(engine.evaluate({}).priority, 'P4');
});

// ---------------------------------------------------------------------------
// FEATURE 1 - Structured SOS creation
// ---------------------------------------------------------------------------
test('structured SOS: fields -> summary, auto P1, emergency data attached', async () => {
  const { store, svc, byName } = setup();
  try {
    const victim = byName('Victim');
    const result = await svc.createEmergencySOS({
      senderId: victim.id,
      peopleCount: 4,
      injuredCount: 1,
      criticalMedical: true,
      trapped: true,
      waterRequired: true,
      batteryLevel: 12,
    });
    assert.ok(result, 'SOS should be created');
    const msg = result.message;
    assert.equal(msg.type, 'SOS');
    assert.equal(msg.priority, 'P1', 'critical + trapped must auto-assign P1');
    assert.ok(msg.emergency, 'structured emergency fields must be attached');
    assert.equal(msg.emergency.peopleCount, 4);
    assert.equal(msg.emergency.criticalMedical, true);
    assert.equal(msg.peopleCount, 4, 'fields surfaced on message top-level');
    assert.ok(msg.summary, 'summary should be generated');
    assert.ok(msg.summary.includes('4 people'), 'summary mentions people count');
    assert.ok(msg.summary.includes('Immediate assistance'), 'summary reflects severity');
    assert.ok(store.getMessage(msg.id), 'message persisted in store');
  } finally {
    svc.stop();
  }
});

test('structured SOS summary is human-readable', () => {
  const summary = generateEmergencySummary({ peopleCount: 4, injuredCount: 1, criticalMedical: true, trapped: true });
  assert.ok(summary.includes('4 people'));
  assert.ok(summary.includes('1 injured person'));
  assert.ok(summary.includes('critically injured'));
  assert.ok(summary.includes('Immediate assistance required'));
});

test('structured SOS: minimal input still works (defaults)', async () => {
  const { svc, byName } = setup();
  try {
    const citizen = byName('Citizen A');
    const result = await svc.createEmergencySOS({ senderId: citizen.id, waterRequired: true });
    assert.ok(result, 'minimal SOS should still create');
    assert.equal(result.message.emergency.peopleCount, 1, 'people count defaults to 1');
    assert.equal(result.message.priority, 'P3', 'water request maps to P3');
  } finally {
    svc.stop();
  }
});

// ---------------------------------------------------------------------------
// FEATURE 5/6 - Role-based + battery-aware humanitarian routing
// ---------------------------------------------------------------------------
test('role-based routing: victim with low battery is avoided as relay', () => {
  const store = new InMemoryStore();
  // Deterministic graph: source -> Victim(8% battery) -> dest  AND source -> Gate -> dest
  const gate = store.addNode({ id: 'GATE', name: 'Gateway', type: 'GATEWAY', x: 100, y: 100, battery: 100, status: 'ONLINE' });
  const victimRelay = store.addNode({ id: 'VR', name: 'Victim Relay', type: 'VICTIM', x: 200, y: 100, battery: 8, status: 'ONLINE' });
  const src = store.addNode({ id: 'SRC', name: 'Source', type: 'VICTIM', x: 0, y: 100, battery: 60, status: 'ONLINE' });
  const dst = store.addNode({ id: 'DST', name: 'Command', type: 'COMMAND_CENTER', x: 300, y: 100, battery: 100, status: 'ONLINE' });
  const links = store.getLinks();
  const push = (s, t, distance, latency, reliability, congestion) => {
    links.push({ id: `L-${s}-${t}`, source: s, target: t, distance, latency, signalStrength: 90, reliability, bandwidth: 600, active: true, congestion });
  };
  push('SRC', 'VR', 100, 10, 99, 5);
  push('VR', 'DST', 100, 10, 99, 5);
  push('SRC', 'GATE', 100, 20, 90, 5);
  push('GATE', 'DST', 100, 20, 90, 5);
  for (const n of [gate, victimRelay, src, dst]) {
    store.updateNode(n.id, { role: n.type, isGateway: ['GATEWAY', 'COMMAND', 'COMMAND_CENTER'].includes(n.type), relayEligible: !((n.type === 'VICTIM') && n.battery < 15) });
  }
  const engine = new RoutingEngine();
  const decision = engine.findRoute(store, 'SRC', 'DST', true, 'r1');
  assert.ok(decision, 'route must exist');
  assert.ok(!decision.selectedRoute.path.includes('VR'), 'victim relay with 8% battery must be avoided');
  assert.ok(decision.selectedRoute.path.includes('GATE'), 'infrastructure gateway preferred');
  assert.ok(decision.explanation.includes('Victim Relay'), 'explanation names the avoided node');
  assert.ok(decision.explanation.includes('battery'), 'explanation mentions battery');
});

test('role-based routing: infrastructure nodes get relay preference', () => {
  const store = new InMemoryStore();
  const cmd = store.addNode({ id: 'CC', name: 'Command Center', type: 'COMMAND_CENTER', x: 100, y: 100, battery: 100, status: 'ONLINE' });
  const med = store.addNode({ id: 'MED', name: 'Medical', type: 'MEDICAL', x: 200, y: 100, battery: 100, status: 'ONLINE' });
  const civ = store.addNode({ id: 'CV', name: 'Civilian', type: 'CIVILIAN', x: 200, y: 200, battery: 80, status: 'ONLINE' });
  const src = store.addNode({ id: 'SRC', name: 'Source', type: 'VOLUNTEER', x: 0, y: 150, battery: 90, status: 'ONLINE' });
  const dst = store.addNode({ id: 'DST', name: 'Medical Hub', type: 'MEDICAL', x: 300, y: 100, battery: 100, status: 'ONLINE' });
  const links = store.getLinks();
  const push = (s, t, distance, latency, reliability, congestion) => {
    links.push({ id: `L-${s}-${t}`, source: s, target: t, distance, latency, signalStrength: 90, reliability, bandwidth: 600, active: true, congestion });
  };
  push('SRC', 'MED', 100, 15, 92, 5);
  push('SRC', 'CV', 100, 15, 92, 5);
  push('MED', 'DST', 100, 15, 92, 5);
  push('CV', 'DST', 100, 15, 92, 5);
  for (const n of [cmd, med, civ, src, dst]) {
    store.updateNode(n.id, { role: n.type, relayEligible: true });
  }
  const engine = new RoutingEngine();
  const decision = engine.findRoute(store, 'SRC', 'DST', false, 'r2');
  assert.ok(decision, 'route must exist');
  assert.ok(decision.selectedRoute.path.includes('MED'), 'medical (infrastructure) relay preferred over civilian');
});