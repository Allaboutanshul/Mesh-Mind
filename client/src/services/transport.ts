import type { MeshMessage, MeshNode, MeshLink, MessageType, MessagePriority } from '../types';
import type { EmergencyAssessment } from './emergency';

export interface SendMessageParams {
  senderId: string;
  receiverId: string;
  type: MessageType;
  priority: MessagePriority;
  content: string;
  description?: string;
  location?: MeshMessage['location'];
  encrypted?: boolean;
}

export interface SendEmergencySOSParams extends EmergencyAssessment {
  senderId: string;
  receiverId?: string;
  location?: MeshMessage['location'];
  additionalMessage?: string;
}

export interface NetworkStatusParams {
  internetAvailable?: boolean;
  cellularAvailable?: boolean;
}

/**
 * Transport abstraction. The application logic talks to a MeshTransport so it
 * never depends on a specific physical medium. The browser demo uses the
 * SimulationTransport; when a real backend socket is available the
 * WebSocketTransport proxies to the server's mesh engine.
 *
 * Future physical transports (Bluetooth, Wi-Fi Direct, LoRa, Nearby
 * Connections) can implement the same interface without touching app logic.
 */
export interface MeshTransport {
  readonly name: string;
  connect(): void;
  disconnect(): void;
  discoverPeers(): MeshNode[];
  sendMessage(params: SendMessageParams): Promise<{ ok: boolean; error?: string; messageId?: string }>;
  sendEmergencySOS(params: SendEmergencySOSParams): Promise<{ ok: boolean; error?: string; messageId?: string; priority?: MessagePriority; summary?: string }>;
  disableNode(nodeId: string): void;
  enableNode(nodeId: string): void;
  applyPreset(preset: string): void;
  reset(): void;
  setNetworkStatus(status: NetworkStatusParams): void;
  retryStored(): void;
  getConnectionStatus(): 'connected' | 'disconnected';
}

let activeTransport: MeshTransport | null = null;

export function getTransport(): MeshTransport | null {
  return activeTransport;
}

export function setActiveTransport(transport: MeshTransport | null): void {
  activeTransport = transport;
}

export { MeshMessage, MeshLink, MeshNode };