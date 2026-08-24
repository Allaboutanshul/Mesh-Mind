import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { useStore } from '../src/store/useStore';
import { SimulationTransport } from '../src/services/simulationTransport';
import { computeRoute } from '../src/services/routing';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

let transport: SimulationTransport;

before(() => {
  useStore.setState({
    backendConnected: false,
    nodes: [], links: [], messages: [], events: [], analytics: [], timeline: [],
  });
  transport = new SimulationTransport();
  transport.connect();
});

after(() => {
  transport.disconnect();
});

test('offline transport seeds the 8-node demo topology', () => {
  const s = useStore.getState();
  assert.equal(s.nodes.length, 8);
  assert.ok(s.links.length >= 12, 'links should be seeded');
  const names = s.nodes.map(n => n.name);
  assert.ok(names.includes('Victim') && names.includes('Command Center'));
});

test('offline routing produces a metric-based explanation', () => {
  const s = useStore.getState();
  const victim = s.nodes.find(n => n.name === 'Victim')!;
  const command = s.nodes.find(n => n.name === 'Command Center')!;
  const decision = computeRoute(s.nodes, s.links, victim.id, command.id, true);
  assert.ok(decision, 'route should exist');
  assert.ok(decision.selectedRoute.path.length >= 2);
  assert.ok(decision.explanation.includes(`${decision.selectedRoute.reliability}%`));
  assert.ok(decision.explanation.includes('emergency routing priorities'));
});

test('offline SOS message relays hop-by-hop and delivers', async () => {
  const s = useStore.getState();
  const victim = s.nodes.find(n => n.name === 'Victim')!;
  const command = s.nodes.find(n => n.name === 'Command Center')!;
  const res = await transport.sendMessage({ senderId: victim.id, receiverId: command.id, type: 'SOS', priority: 'P1', content: 'offline SOS test' });
  assert.ok(res.ok);
  assert.ok(res.messageId);
  await sleep(6000);
  const msg = useStore.getState().messages.find(m => m.id === res.messageId);
  assert.ok(msg, 'message should exist');
  assert.equal(msg.status, 'DELIVERED', `expected DELIVERED but got ${msg.status}`);
  assert.ok(msg.hopCount >= 1, 'SOS should traverse at least one relay hop');
});

test('offline store-and-forward: partition stores message, recovery delivers', async () => {
  const s = useStore.getState();
  const victim = s.nodes.find(n => n.name === 'Victim')!;
  const command = s.nodes.find(n => n.name === 'Command Center')!;
  const volB = s.nodes.find(n => n.name === 'Volunteer B')!;
  const citizenA = s.nodes.find(n => n.name === 'Citizen A')!;

  transport.disableNode(volB.id);
  transport.disableNode(citizenA.id);

  const res = await transport.sendMessage({ senderId: victim.id, receiverId: command.id, type: 'SOS', priority: 'P1', content: 'partitioned' });
  await sleep(2000);
  assert.equal(useStore.getState().messages.find(m => m.id === res.messageId)?.status, 'STORED', 'partitioned SOS must be stored');

  transport.enableNode(volB.id);
  transport.enableNode(citizenA.id);
  transport.retryStored();
  await sleep(6000);
  assert.equal(useStore.getState().messages.find(m => m.id === res.messageId)?.status, 'DELIVERED', 'stored SOS must be delivered after recovery');
});

test('offline node disable marks node OFFLINE and excludes it from routes', () => {
  const s = useStore.getState();
  const victim = s.nodes.find(n => n.name === 'Victim')!;
  const command = s.nodes.find(n => n.name === 'Command Center')!;
  const volB = s.nodes.find(n => n.name === 'Volunteer B')!;
  transport.enableNode(volB.id);
  transport.disableNode(volB.id);
  assert.equal(useStore.getState().nodes.find(n => n.id === volB.id)?.status, 'OFFLINE');
  const decision = computeRoute(useStore.getState().nodes, useStore.getState().links, victim.id, command.id, false);
  assert.ok(decision, 'route should still exist');
  assert.ok(!decision.selectedRoute.path.includes(volB.id), 'disabled node must not be on the route');
});