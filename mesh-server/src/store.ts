// Simple JSON file persistence for mesh messages
import { writeFileSync, readFileSync, existsSync } from 'fs';
import path from 'path';
import { MeshMessage } from './messageProtocol.js';

const STORE_PATH = path.resolve(__dirname, '../../data/mesh-data.json');

type Store = {
  messages: Record<string, MeshMessage>;
};

function loadStore(): Store {
  if (existsSync(STORE_PATH)) {
    try {
      const raw = readFileSync(STORE_PATH, 'utf-8');
      return JSON.parse(raw) as Store;
    } catch (e) {
      console.error('Failed to load store, starting empty', e);
    }
  }
  return { messages: {} };
}

function saveStore(store: Store): void {
  try {
    const dir = path.dirname(STORE_PATH);
    // Ensure directory exists
    // Note: recursive option works on Windows Node 10+
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { mkdirSync } = require('fs');
    mkdirSync(dir, { recursive: true });
    writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to save store', e);
  }
}

function addMessage(store: Store, msg: MeshMessage): void {
  store.messages[msg.messageId] = msg;
  saveStore(store);
}

function setMessageStatus(store: Store, messageId: string, status: MeshMessage['status']): void {
  const msg = store.messages[messageId];
  if (msg) {
    msg.status = status;
    saveStore(store);
  }
}

function getPendingMessages(store: Store): MeshMessage[] {
  const now = Date.now();
  return Object.values(store.messages).filter((m) => {
    // Pending if not delivered and TTL still > 0
    return m.status !== 'DELIVERED' && m.ttl * 1000 > now - m.timestamp;
  });
}

function getAllMessages(store: Store): MeshMessage[] {
  return Object.values(store.messages);
}

export { loadStore, saveStore, addMessage, getPendingMessages, getAllMessages, setMessageStatus };
