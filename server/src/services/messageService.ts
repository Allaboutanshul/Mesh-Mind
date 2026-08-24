import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import type { Server as SocketServer } from 'socket.io';
import type { InMemoryStore, MeshMessage, EmergencySOS } from './inMemoryStore.js';
import type { RoutingEngine } from '../routing/engine.js';
import { buildEmergencyFields, buildSOSContent } from '../emergency/sosFactory.js';
import type { SOSInput } from '../emergency/sosFactory.js';

export class MessageService {
  private store: InMemoryStore;
  private routingEngine: RoutingEngine;
  private io: SocketServer;
  private messageQueue: MeshMessage[] = [];
  private processingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(store: InMemoryStore, routingEngine: RoutingEngine, io: SocketServer) {
    this.store = store;
    this.routingEngine = routingEngine;
    this.io = io;
    this.startProcessing();
  }

  private startProcessing(): void {
    this.processingInterval = setInterval(() => this.processQueue(), 500);
  }

  async createMessage(params: {
    senderId: string;
    receiverId: string;
    type: MeshMessage['type'];
    priority: MeshMessage['priority'];
    content: string;
    description?: string;
    location?: MeshMessage['location'];
    encrypted?: boolean;
    ttl?: number;
    signature?: string;
    nonce?: string;
    expiryTime?: number;
    emergency?: EmergencySOS['emergency'];
  }): Promise<{ message: MeshMessage; routingDecision: any } | null> {
    const id = uuidv4();
    const timestamp = Date.now();
    const hash = createHash('sha256').update(`${id}:${params.senderId}:${timestamp}:${params.content}`).digest('hex');

    if (this.store.isDuplicate(id)) return null;

    const isEmergency = params.priority === 'P1' || params.type === 'SOS';
    const routingDecision = this.routingEngine.findRoute(
      this.store, params.senderId, params.receiverId, isEmergency, id
    );

    const route = routingDecision ? routingDecision.selectedRoute.path : [params.senderId, params.receiverId];
    const estimatedLatency = routingDecision ? routingDecision.selectedRoute.totalLatency : 999;
    const reachable = routingDecision !== null;

    const message: MeshMessage = {
      id,
      senderId: params.senderId,
      receiverId: params.receiverId,
      type: params.type,
      priority: params.priority,
      content: params.content,
      timestamp,
      ttl: params.ttl ?? (params.type === 'SOS' ? 20 : 10),
      route,
      currentHop: 0,
      hopCount: route.length - 1,
      status: reachable ? 'QUEUED' : 'STORED',
      deliveryAttempts: 0,
      createdAt: timestamp,
      estimatedLatency,
      encrypted: params.encrypted || false,
      hash,
      signature: params.signature,
      nonce: params.nonce,
      description: params.description,
      location: params.location,
      expiryTime: params.expiryTime ?? timestamp + (params.ttl ?? (params.type === 'SOS' ? 20 : 10)) * 60_000,
      retryCount: 0,
      lastAttemptedRoute: route,
      nextRetryTime: timestamp,
      queueOwner: params.senderId,
      emergency: params.emergency,
    };

    this.store.addMessage(message);

    const sender = this.store.getNode(params.senderId);
    if (sender) {
      this.store.updateNode(params.senderId, { messagesOriginated: sender.messagesOriginated + 1 });
    }

    if (reachable) {
      this.enqueue(message);
    } else {
      this.io.emit('message:stored', { messageId: id, storedAt: params.senderId });
      this.store.addEvent({
        id: uuidv4(), timestamp: Date.now(), type: 'MESSAGE_STORED',
        description: `Destination unreachable - message ${id.slice(0, 8)} stored at ${params.senderId}`,
        messageId: id,
      });
    }
    this.io.emit('message:created', { message, routingDecision });

    this.store.addEvent({
      id: uuidv4(), timestamp: Date.now(), type: 'MESSAGE_SENT',
      description: `${params.type} message from ${params.senderId} to ${params.receiverId} [${params.priority}]`,
      messageId: id,
    });

    return { message, routingDecision };
  }

  /**
   * Create a structured emergency SOS. Priority is assigned automatically by
   * the deterministic priority engine; a human-readable summary is generated
   * from the structured fields. Only minimal user input is required.
   */
  async createEmergencySOS(input: SOSInput & { senderId: string; receiverId?: string }): Promise<{ message: EmergencySOS; routingDecision: any } | null> {
    const built = buildEmergencyFields(input);
    const sender = this.store.getNode(input.senderId);
    const location = input.location ?? sender?.location;

    const receiverId = input.receiverId || this.pickEmergencyReceiver(input.senderId);
    if (!receiverId) return null;

    const content = buildSOSContent(input, built.summary);
    const ttl = built.priority === 'P1' ? 30 : built.priority === 'P2' ? 20 : 10;
    const timestamp = Date.now();

    const result = await this.createMessage({
      senderId: input.senderId,
      receiverId,
      type: 'SOS',
      priority: built.priority,
      content,
      description: 'Structured emergency SOS',
      location,
      encrypted: true,
      ttl,
      emergency: built.emergency,
    });
    if (!result) return null;

    const message = result.message as EmergencySOS;
    // Surface the structured emergency fields on the message itself so the
    // EmergencySOS model is directly usable by consumers.
    message.peopleCount = built.emergency.peopleCount;
    message.injuredCount = built.emergency.injuredCount;
    message.criticalMedical = built.emergency.criticalMedical;
    message.medicalRequired = built.emergency.medicalRequired;
    message.trapped = built.emergency.trapped;
    message.waterRequired = built.emergency.waterRequired;
    message.foodRequired = built.emergency.foodRequired;
    message.evacuationRequired = built.emergency.evacuationRequired;
    message.batteryLevel = built.emergency.batteryLevel;
    message.lastKnownConnection = built.emergency.lastKnownConnection;
    message.locationAccuracy = built.emergency.locationAccuracy;
    message.additionalMessage = built.emergency.additionalMessage;
    message.summary = built.summary;

    this.io.emit('sos:created', {
      sosId: message.id,
      summary: built.summary,
      explanation: built.explanation,
      priority: built.priority,
    });
    this.store.addEvent({
      id: uuidv4(), timestamp, type: 'SOS_CREATED',
      description: `SOS created: ${built.summary} [${built.priority}] - ${built.explanation}`,
      messageId: message.id,
    });

    return { message, routingDecision: result.routingDecision };
  }

  private pickEmergencyReceiver(senderId: string): string {
    const preferred = this.store.getNodes()
      .filter(n => n.id !== senderId && n.status !== 'OFFLINE')
      .sort((a, b) => this.receiverScore(b) - this.receiverScore(a));
    return preferred[0]?.id || '';
  }

  private receiverScore(node: { type: string }): number {
    if (node.type === 'COMMAND' || node.type === 'COMMAND_CENTER' || node.type === 'GATEWAY') return 4;
    if (node.type === 'MEDICAL' || node.type === 'AMBULANCE') return 3;
    if (node.type === 'RESCUE') return 2;
    return 0;
  }

  private enqueue(message: MeshMessage): void {
    const priorityOrder: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };
    const msgPriority = priorityOrder[message.priority];
    let inserted = false;
    for (let i = 0; i < this.messageQueue.length; i++) {
      if (priorityOrder[this.messageQueue[i].priority] > msgPriority) {
        this.messageQueue.splice(i, 0, message);
        inserted = true;
        break;
      }
    }
    if (!inserted) this.messageQueue.push(message);
  }

  private async processQueue(): Promise<void> {
    if (this.messageQueue.length === 0) return;
    const message = this.messageQueue.shift();
    if (!message) return;
    await this.deliverMessage(message);
  }

  private async deliverMessage(message: MeshMessage): Promise<void> {
    const route = [...message.route];
    const currentMsg = this.store.getMessage(message.id);
    if (!currentMsg || currentMsg.status === 'DELIVERED' || currentMsg.status === 'FAILED') return;

    this.store.updateMessage(message.id, { status: 'IN_TRANSIT' });
    this.io.emit('message:routed', { messageId: message.id, route });

    let currentHop = 0;

    const deliverHop = () => {
      if (currentHop >= route.length - 1) {
        const now = Date.now();
        this.store.updateMessage(message.id, {
          status: 'DELIVERED', currentHop: route.length - 1,
          deliveredAt: now, actualLatency: now - message.createdAt,
        });
        this.io.emit('message:delivered', { messageId: message.id, deliveredAt: now });
        this.store.addEvent({
          id: uuidv4(), timestamp: now, type: 'MESSAGE_DELIVERED',
          description: `Message ${message.id.slice(0, 8)} delivered to ${message.receiverId}`,
          messageId: message.id,
        });
        return;
      }

      const fromNode = route[currentHop];
      const toNode = route[currentHop + 1];
      const node = this.store.getNode(toNode);

      if (!node || node.status === 'OFFLINE') {
        const isEmergency = message.priority === 'P1' || message.type === 'SOS';
        const newDecision = this.routingEngine.findRoute(
          this.store, fromNode, message.receiverId, isEmergency, message.id
        );

        if (newDecision) {
          const newRoute = [...route.slice(0, currentHop), ...newDecision.selectedRoute.path];
          this.store.updateMessage(message.id, { route: newRoute });
          this.io.emit('route:changed', {
            messageId: message.id, oldRoute: route, newRoute,
            reason: `Node ${toNode} offline - rerouted via ${newDecision.selectedRoute.path.join(' → ')}`,
          });
          this.store.addEvent({
            id: uuidv4(), timestamp: Date.now(), type: 'ROUTE_CHANGED',
            description: `Route recalculated for message ${message.id.slice(0, 8)} - ${toNode} offline`,
            messageId: message.id, nodeId: toNode,
          });
          route.length = 0;
          route.push(...newRoute);
          setTimeout(deliverHop, 200);
          return;
        } else {
          this.store.updateMessage(message.id, { status: 'STORED', currentHop });
          this.io.emit('message:stored', { messageId: message.id, storedAt: fromNode });
          return;
        }
      }

      const curMsg = this.store.getMessage(message.id);
      const currentTtl = (curMsg?.ttl || message.ttl) - 1;
      if (currentTtl <= 0) {
        this.store.updateMessage(message.id, { status: 'EXPIRED', ttl: 0 });
        this.io.emit('message:failed', { messageId: message.id, reason: 'TTL expired' });
        return;
      }

      currentHop++;
      this.store.updateMessage(message.id, {
        currentHop, ttl: currentTtl, status: 'FORWARDING',
        deliveryAttempts: (curMsg?.deliveryAttempts || 0) + 1,
      });

      if (node && currentHop < route.length - 1) {
        this.store.updateNode(toNode, { messagesRelayed: node.messagesRelayed + 1 });
      }

      this.io.emit('message:forwarded', {
        messageId: message.id, from: fromNode, to: toNode,
        hop: currentHop, totalHops: route.length - 1,
      });

      const link = this.store.getLinksBetween(fromNode, toNode);
      const delay = link ? Math.min(link.latency * 2, 500) : 200;
      setTimeout(deliverHop, delay);
    };

    setTimeout(deliverHop, 100);
  }

  retryStoredMessages(): void {
    const stored = this.store.getMessages().filter(m => m.status === 'STORED');
    for (const msg of stored) {
      const currentHop = msg.currentHop;
      const fromNode = msg.route[currentHop];
      const isEmergency = msg.priority === 'P1' || msg.type === 'SOS';
      const decision = this.routingEngine.findRoute(
        this.store, fromNode, msg.receiverId, isEmergency, msg.id
      );
      if (decision) {
        const newRoute = [...msg.route.slice(0, currentHop), ...decision.selectedRoute.path];
        this.store.updateMessage(msg.id, { route: newRoute, status: 'QUEUED' });
        const updated = this.store.getMessage(msg.id);
        if (updated) this.enqueue(updated);
        this.io.emit('route:changed', {
          messageId: msg.id, oldRoute: msg.route, newRoute,
          reason: 'Route restored - retrying stored message',
        });
      }
    }
  }

  stop(): void {
    if (this.processingInterval) clearInterval(this.processingInterval);
  }
}
