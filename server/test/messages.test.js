import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryStore } from '../dist/services/inMemoryStore.js';
import { RoutingEngine } from '../dist/routing/engine.js';
import { MessageService } from '../dist/services/messageService.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

class FakeIO {
  constructor() { this.events = {}; }
  emit(ev, data) {
    (this.events[ev] = this.events[ev] || []).push(data);
  }
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

test('priority queue processes P1 before P4 from the same sender', async () => {
  const { svc, io, byName } = setup();
  const victim = byName('Victim');
  const command = byName('Command Center');
  const m4 = await svc.createMessage({ senderId: victim.id, receiverId: command.id, type: 'TEXT', priority: 'P4', content: 'low priority' });
  await sleep(50);
  const m1 = await svc.createMessage({ senderId: victim.id, receiverId: command.id, type: 'TEXT', priority: 'P1', content: 'high priority' });
  await sleep(6000);

  const delivered = (io.events['message:delivered'] || []).map(d => d.messageId);
  const idx4 = delivered.indexOf(m4.message.id);
  const idx1 = delivered.indexOf(m1.message.id);
  assert.ok(idx4 !== -1, 'P4 should be delivered');
  assert.ok(idx1 !== -1, 'P1 should be delivered');
  assert.ok(idx1 < idx4, 'P1 must be delivered before P4 (priority ordering)');
  svc.stop();
});

test('duplicate detection rejects an already-seen message id', () => {
  const { store, svc } = setup();
  const msg = {
    id: 'dup-1', senderId: 'A', receiverId: 'B', type: 'TEXT', priority: 'P3',
    content: 'x', timestamp: Date.now(), ttl: 10, route: ['A', 'B'], currentHop: 0,
    hopCount: 1, status: 'QUEUED', deliveryAttempts: 0, createdAt: Date.now(),
    estimatedLatency: 10, encrypted: false, hash: 'h',
  };
  assert.equal(store.isDuplicate('dup-1'), false);
  store.addMessage(msg);
  assert.equal(store.isDuplicate('dup-1'), true);
  assert.equal(store.isDuplicate('unknown'), false);
  svc.stop();
});

test('TTL expiry marks a message EXPIRED', async () => {
  const { store, io, svc, byName } = setup();
  const nodes = store.getNodes();
  const msg = {
    id: 'ttl-1', senderId: 'A', receiverId: 'H', type: 'TEXT', priority: 'P3',
    content: 'ttl', timestamp: Date.now(), ttl: 1,
    route: nodes.map(n => n.id), currentHop: 0, hopCount: nodes.length - 1,
    status: 'QUEUED', deliveryAttempts: 0, createdAt: Date.now(),
    estimatedLatency: 10, encrypted: false, hash: 'h',
  };
  store.addMessage(msg);
  svc['enqueue'](msg);
  await sleep(3000);
  assert.equal(store.getMessage('ttl-1').status, 'EXPIRED');
  const failed = (io.events['message:failed'] || []).some(d => d.messageId === 'ttl-1');
  assert.ok(failed, 'message:failed should be emitted on TTL expiry');
  svc.stop();
});

test('store-and-forward: message stored when partition, delivered after recovery', async () => {
  const { store, io, svc, byName } = setup();
  const victim = byName('Victim');
  const command = byName('Command Center');
  const volB = byName('Volunteer B');
  const citizenA = byName('Citizen A');

  // Partition: isolate the victim.
  store.updateNode(volB.id, { status: 'OFFLINE' });
  store.updateNode(citizenA.id, { status: 'OFFLINE' });

  const result = await svc.createMessage({ senderId: victim.id, receiverId: command.id, type: 'SOS', priority: 'P1', content: 'trapped' });
  await sleep(2000);
  assert.equal(store.getMessage(result.message.id).status, 'STORED', 'unreachable SOS must be stored');

  // Recovery: restore connectivity and retry stored messages.
  store.updateNode(volB.id, { status: 'ONLINE' });
  store.updateNode(citizenA.id, { status: 'ONLINE' });
  svc.retryStoredMessages();
  await sleep(6000);
  assert.equal(store.getMessage(result.message.id).status, 'DELIVERED', 'stored message must be delivered after recovery');
  const delivered = (io.events['message:delivered'] || []).some(d => d.messageId === result.message.id);
  assert.ok(delivered, 'message:delivered should be emitted after recovery');
  svc.stop();
});

test('SOS delivery completes with acknowledgement event', async () => {
  const { io, svc, byName } = setup();
  const victim = byName('Victim');
  const command = byName('Command Center');
  const result = await svc.createMessage({ senderId: victim.id, receiverId: command.id, type: 'SOS', priority: 'P1', content: 'emergency' });
  await sleep(6000);
  const msg = result.message;
  assert.equal(msg.priority, 'P1');
  assert.ok(msg.hopCount >= 1, 'SOS should traverse at least one relay hop');
  const stored = (io.events['message:stored'] || []).filter(d => d.messageId === msg.id);
  assert.equal(stored.length, 0, 'reachable SOS should not be stored');
  const delivered = (io.events['message:delivered'] || []).some(d => d.messageId === msg.id);
  assert.ok(delivered, 'SOS should be delivered');
  svc.stop();
});
