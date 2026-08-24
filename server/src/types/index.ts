export type NodeType =
  | 'VICTIM'
  | 'CIVILIAN'
  | 'CITIZEN'
  | 'VOLUNTEER'
  | 'AMBULANCE'
  | 'MEDICAL'
  | 'RESCUE'
  | 'GATEWAY'
  | 'COMMAND'
  | 'COMMAND_CENTER'
  | 'DRONE';
export type NodeStatus = 'ONLINE' | 'WARNING' | 'CRITICAL' | 'OFFLINE';
export type MessageType =
  | 'TEXT'
  | 'SOS'
  | 'MEDICAL'
  | 'LOCATION'
  | 'EVACUATION'
  | 'FIRE'
  | 'FLOOD'
  | 'RESCUE'
  | 'BROADCAST'
  | 'SYSTEM';
export type MessagePriority = 'P1' | 'P2' | 'P3' | 'P4';
export type MessageStatus =
  | 'CREATED'
  | 'QUEUED'
  | 'ROUTING'
  | 'IN_TRANSIT'
  | 'FORWARDING'
  | 'DELIVERED'
  | 'FAILED'
  | 'STORED'
  | 'EXPIRED'
  | 'ACKNOWLEDGED';
export type SimulationPreset =
  | 'NORMAL'
  | 'FLOOD'
  | 'EARTHQUAKE'
  | 'CYCLONE'
  | 'TOWER_FAILURE'
  | 'INTERNET_BLACKOUT'
  | 'CONGESTION'
  | 'MULTI_NODE_FAILURE'
  | 'MASS_SOS';

export type EmergencyBroadcastType =
  | 'EVACUATION_ORDER'
  | 'FLOOD_WARNING'
  | 'EARTHQUAKE_WARNING'
  | 'MEDICAL_INSTRUCTION'
  | 'SEARCH_OPERATION'
  | 'SAFE_ZONE'
  | 'MISSING_PERSON'
  | 'GENERAL';

export type RescueTaskStatus = 'NEW' | 'ACKNOWLEDGED' | 'ASSIGNED' | 'EN_ROUTE' | 'RESCUED' | 'CLOSED';
export type RescueTeamType = 'RESCUE' | 'MEDICAL' | 'EVACUATION';

export interface RescueTask {
  id: string;
  sosId: string;
  status: RescueTaskStatus;
  teamType: RescueTeamType;
  teamNodeId?: string;
  assignedAt?: number;
  assignedBy?: string;
  notes?: string;
  updatedAt: number;
}

export interface EmergencySOS extends MeshMessage {
  peopleCount?: number;
  injuredCount?: number;
  criticalMedical?: boolean;
  medicalRequired?: boolean;
  trapped?: boolean;
  waterRequired?: boolean;
  foodRequired?: boolean;
  evacuationRequired?: boolean;
  batteryLevel?: number;
  lastKnownConnection?: number;
  locationAccuracy?: number;
  additionalMessage?: string;
  summary?: string;
  acknowledgement?: {
    acknowledgedBy: string;
    acknowledgedAt: number;
    message: string;
  };
  rescueTask?: RescueTask;
}

export interface MeshNode {
  id: string;
  name: string;
  type: NodeType;
  role?: NodeType;
  x: number;
  y: number;
  battery: number;
  signalStrength: number;
  reliability: number;
  latency: number;
  bandwidth: number;
  status: NodeStatus;
  location: { lat: number; lng: number; sector: string; zone: string };
  lastSeen: number;
  workload: number;
  queueLength: number;
  messagesRelayed: number;
  messagesOriginated: number;
  relayEligible?: boolean;
  isGateway?: boolean;
  isDrone?: boolean;
}

export interface MeshLink {
  id: string;
  source: string;
  target: string;
  distance: number;
  latency: number;
  signalStrength: number;
  reliability: number;
  bandwidth: number;
  active: boolean;
  congestion: number;
}

export interface MeshMessage {
  id: string;
  senderId: string;
  receiverId: string;
  type: MessageType;
  priority: MessagePriority;
  content: string;
  timestamp: number;
  ttl: number;
  route: string[];
  currentHop: number;
  hopCount: number;
  status: MessageStatus;
  deliveryAttempts: number;
  createdAt: number;
  deliveredAt?: number;
  estimatedLatency: number;
  actualLatency?: number;
  encrypted: boolean;
  hash: string;
  nonce?: string;
  signature?: string;
  description?: string;
  location?: { lat: number; lng: number; sector: string; zone: string };

  // Store-and-forward queue metadata
  expiryTime?: number;
  retryCount?: number;
  lastAttemptedRoute?: string[];
  nextRetryTime?: number;
  reasonForFailure?: string;
  queueOwner?: string;

  // Broadcast metadata
  broadcastType?: EmergencyBroadcastType;
  broadcastHops?: number;
  visitedNodeIds?: string[];

  // Emergency content (structured SOS)
  emergency?: Omit<EmergencySOS, keyof MeshMessage>;
}

export interface NetworkStats {
  totalNodes: number;
  onlineNodes: number;
  activeLinks: number;
  messagesDelivered: number;
  messagesPending: number;
  messagesFailed: number;
  emergencyMessages: number;
  averageLatency: number;
  packetDeliveryRate: number;
  meshHealth: number;
  batteryRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface NetworkState {
  nodes: MeshNode[];
  links: MeshLink[];
  internetAvailable: boolean;
  cellularAvailable: boolean;
  meshActive: boolean;
  stats: NetworkStats;
}

export interface NetworkPartition {
  id: string;
  component: string[];
  leader: string;
  isolated: boolean;
}

export interface NetworkHealth {
  connectedNodes: number;
  offlineNodes: number;
  partitions: NetworkPartition[];
  availableRoutes: number;
  failedRoutes: number;
  gatewayAvailable: boolean;
  gateways: string[];
  queueSize: number;
  p1Pending: number;
  deliveryRate: number;
  averageLatency: number;
  averageHopCount: number;
  batteryRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  partitionDetected: boolean;
  partitionChangedAt?: number;
}

export interface EmergencyBroadcast {
  id: string;
  type: EmergencyBroadcastType;
  senderId: string;
  senderRole: NodeType;
  message: string;
  priority: MessagePriority;
  ttl: number;
  createdAt: number;
  hops: number;
  status: MessageStatus;
  reachedNodeIds: string[];
  hash: string;
  signature?: string;
  nonce: string;
}

export interface AnalyticsSnapshot {
  timestamp: number;
  messagesPerMinute: number;
  deliveryRate: number;
  averageLatency: number;
  nodeAvailability: number;
  averageBattery: number;
  routeChanges: number;
  congestionLevel: number;
  emergencyResponseTime: number;
  activeNodes: number;
  activeLinks: number;
}

export interface SimulationEvent {
  id: string;
  timestamp: number;
  type: string;
  description: string;
  nodeId?: string;
  linkId?: string;
  messageId?: string;
}
