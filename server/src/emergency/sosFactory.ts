import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { EmergencyPriorityEngine, EmergencyAssessment } from './priorityEngine.js';
import type { EmergencySOS, MessagePriority, MeshNode } from '../types/index.js';

export interface SOSInput extends EmergencyAssessment {
  senderId: string;
  receiverId: string;
  location?: EmergencySOS['location'];
  locationAccuracy?: number;
  additionalMessage?: string;
  batteryLevel?: number;
  lastKnownConnection?: number;
  ttl?: number;
}

export interface SOSCreationResult {
  priority: MessagePriority;
  summary: string;
  explanation: string;
  emergency: Omit<EmergencySOS, keyof import('../types/index.js').MeshMessage>;
}

/**
 * Generate a deterministic, human-readable emergency summary from the
 * structured fields, e.g.
 *   "4 people trapped, 1 critically injured, immediate medical assistance required."
 */
export function generateEmergencySummary(input: SOSInput): string {
  const parts: string[] = [];
  const people = input.peopleCount ?? 1;
  const injured = input.injuredCount ?? 0;
  const critical = !!input.criticalMedical;
  const trapped = !!input.trapped;
  const medical = !!input.medicalRequired;
  const evacuation = !!input.evacuationRequired;
  const water = !!input.waterRequired;
  const food = !!input.foodRequired;

  parts.push(`${people} ${people === 1 ? 'person' : 'people'}`);
  if (trapped) parts.push('trapped');
  if (injured > 0) parts.push(`${injured} ${injured === 1 ? 'injured person' : 'injured people'}`);
  if (critical) parts.push('critically injured');
  if (medical) parts.push('medical assistance required');
  if (evacuation) parts.push('evacuation required');
  if (water) parts.push('water required');
  if (food) parts.push('food required');

  let summary = parts.join(', ') + '.';
  if (critical || medical || (trapped && injured > 0)) {
    summary += ' Immediate assistance required.';
  }
  return summary.charAt(0).toUpperCase() + summary.slice(1);
}

export function buildEmergencyFields(input: SOSInput): SOSCreationResult {
  const engine = new EmergencyPriorityEngine();
  const result = engine.evaluate(input);
  const summary = generateEmergencySummary(input);

  const emergency: Omit<EmergencySOS, keyof import('../types/index.js').MeshMessage> = {
    peopleCount: input.peopleCount ?? 1,
    injuredCount: input.injuredCount ?? 0,
    criticalMedical: input.criticalMedical ?? false,
    medicalRequired: input.medicalRequired ?? false,
    trapped: input.trapped ?? false,
    waterRequired: input.waterRequired ?? false,
    foodRequired: input.foodRequired ?? false,
    evacuationRequired: input.evacuationRequired ?? false,
    batteryLevel: input.batteryLevel,
    lastKnownConnection: input.lastKnownConnection ?? Date.now(),
    locationAccuracy: input.locationAccuracy,
    additionalMessage: input.additionalMessage,
    summary,
  };

  return { priority: result.priority, summary, explanation: result.explanation, emergency };
}

export function buildSOSContent(input: SOSInput, summary: string): string {
  const locationStr = input.location ? `sector ${input.location.sector}/${input.location.zone}` : 'unknown location';
  return `SOS: ${summary} [${locationStr}]${input.additionalMessage ? ' - ' + input.additionalMessage : ''}`;
}

export function sosHash(senderId: string, timestamp: number, content: string): string {
  return createHash('sha256').update(`${senderId}:${timestamp}:${content}`).digest('hex');
}

export function defaultSOSFromNode(node: MeshNode): SOSInput {
  return {
    senderId: node.id,
    receiverId: '',
    location: node.location,
    locationAccuracy: 50,
    batteryLevel: node.battery,
    lastKnownConnection: Date.now(),
    peopleCount: 1,
    injuredCount: 0,
  };
}

export function freshSOSId(): string {
  return uuidv4();
}