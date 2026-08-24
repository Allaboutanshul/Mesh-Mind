// Mesh Message Protocol definitions
export interface MeshMessage {
  protocolVersion: number;
  messageId: string;
  originId: string; // original sender
  sourceId: string; // last hop
  destinationId: string;
  ttl: number;
  priority: number; // lower number = higher priority
  type: string; // e.g., 'TEXT','SOS'
  payload: any;
  timestamp: number;
  route: string[]; // hops traversed
  status: 'PENDING' | 'FORWARDED' | 'DELIVERED' | 'FAILED' | 'EXPIRED';
  attempts: number;
}

export interface AckMessage {
  protocolVersion: number;
  ackId: string; // messageId being acked
  fromId: string;
  timestamp: number;
}

export type Packet =
  | { type: 'HELLO'; nodeId: string }
  | { type: 'MESSAGE'; message: MeshMessage }
  | { type: 'ACK'; ack: AckMessage };
