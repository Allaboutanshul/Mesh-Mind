import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import dgram from 'dgram';
import { MeshMessage, AckMessage, Packet } from './messageProtocol.js';
import { loadStore, addMessage, getPendingMessages, getAllMessages, saveStore, setMessageStatus } from './store.js';

const SERVER_NODE_ID = 'SERVER';

const HTTP_PORT = 4001;
const UDP_PORT = 50001;

// In-memory storage for nodes and messages
interface NodeInfo {
  address: string;
  port: number;
  lastSeen: number;
}

const nodes = new Map<string, NodeInfo>();
const recentMessageIds = new Set<string>(); // duplicate detection
const DUPLICATE_CACHE_SIZE = 1000;

// Simple message store (in-memory, persisted to file)
const store = loadStore();

// UDP socket for mesh communication
const udpSocket = dgram.createSocket('udp4');

udpSocket.on('listening', () => {
  const address = udpSocket.address();
  console.log(`UDP mesh listening on ${address.address}:${address.port}`);
});

udpSocket.on('message', (msg, rinfo) => {
  try {
    const packet = JSON.parse(msg.toString());
    if (packet.type === 'HELLO') {
      const nodeId = packet.nodeId;
      nodes.set(nodeId, { address: rinfo.address, port: rinfo.port, lastSeen: Date.now() });
      // send ACK back to node
      const ack = Buffer.from(JSON.stringify({ type: 'ACK', nodeId }));
      udpSocket.send(ack, rinfo.port, rinfo.address);
    } else if (packet.type === 'MESSAGE') {
      const { messageId, payload } = packet;
      // Duplicate detection
      if (recentMessageIds.has(messageId)) {
        // Already processed, ignore
        return;
      }
      recentMessageIds.add(messageId);
      if (recentMessageIds.size > DUPLICATE_CACHE_SIZE) {
        // Remove oldest entry (simple FIFO by converting to array)
        const oldest = recentMessageIds.values().next().value;
        recentMessageIds.delete(oldest);
      }
      // Decrement TTL
      payload.ttl -= 1;
      if (payload.ttl <= 0) {
        // Expired, mark and do not forward
        setMessageStatus(store, messageId, 'EXPIRED');
        return;
      }
      // Persist the message (initial status PENDING)
      addMessage(store, payload);
      // Forward to all known nodes except the one we received from (if known)
      for (const [nodeId, nodeInfo] of nodes.entries()) {
        if (nodeInfo.address === rinfo.address && nodeInfo.port === rinfo.port) continue;
        const forwardPacket = Buffer.from(JSON.stringify({ type: 'MESSAGE', messageId, payload }));
        udpSocket.send(forwardPacket, nodeInfo.port, nodeInfo.address);
      }
      // Update status to FORWARDED
      setMessageStatus(store, messageId, 'FORWARDED');
      // Send ACK back to original source if we know it
      const sourceInfo = nodes.get(payload.sourceId);
      if (sourceInfo) {
        const ackPacket = Buffer.from(JSON.stringify({ type: 'ACK', ackId: messageId, fromId: SERVER_NODE_ID }));
        udpSocket.send(ackPacket, sourceInfo.port, sourceInfo.address);
      }
    } else if (packet.type === 'ACK') {
      // ACK received: mark corresponding message as DELIVERED if we have it
      const { ackId, fromId } = packet;
      setMessageStatus(store, ackId, 'DELIVERED');
      console.log('ACK received for', ackId, 'from', fromId);
    }
  } catch (e) {
    console.error('Failed to parse UDP packet', e);
  }
});

udpSocket.bind(UDP_PORT);

// HTTP server for Socket.io UI clients
const httpServer = createServer();
const io = new SocketIOServer(httpServer, {
  cors: { origin: '*' },
});

io.on('connection', (socket) => {
  console.log('UI client connected', socket.id);
  // Send current mesh state
  socket.emit('mesh:updated', Array.from(nodes.entries()).map(([id, info]) => ({ id, ...info })));
   // Emit stored messages list
   const allMsgs = getAllMessages(store);
   socket.emit('messages:list', allMsgs);

   // Expose pending messages via HTTP endpoint
   httpServer.on('request', (req, res) => {
     if (req.method === 'GET' && req.url === '/api/pending') {
       const pending = getPendingMessages(store);
       res.writeHead(200, { 'Content-Type': 'application/json' });
       res.end(JSON.stringify(pending));
       return;
     }
     // fall through to other handlers (health endpoint handled later)
   });

  // Forward UI‑initiated broadcasts to the UDP mesh
  socket.on('mesh:broadcast', (msg) => {
    const packet = Buffer.from(JSON.stringify({ type: 'MESSAGE', ...msg }));
    for (const node of nodes.values()) {
      udpSocket.send(packet, node.port, node.address);
    }
  });

  // Allow a UI client to announce a new node (e.g., an Android device)
  socket.on('node:hello', ({ nodeId, address }) => {
    const packet = Buffer.from(JSON.stringify({ type: 'HELLO', nodeId }));
    udpSocket.send(packet, UDP_PORT, address);
  });

  socket.on('disconnect', () => {
    console.log('UI client disconnected', socket.id);
  });
});
// Health endpoint for monitoring
httpServer.on('request', (req, res) => {
  if (req.method === 'GET' && req.url === '/api/health') {
    const health = {
      status: 'ok',
      timestamp: Date.now(),
      nodes: nodes.size,
      messages: Object.keys(store.messages).length,
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health));
    return;
  }
  // fallback to other handlers (e.g., socket.io upgrades)
});
httpServer.listen(HTTP_PORT, () => {
  console.log(`Mesh server listening on http://localhost:${HTTP_PORT}`);
});
