import type { MessagePriority, MeshMessage, EmergencySOS } from '../types';

export interface EmergencyAssessment {
  peopleCount?: number;
  injuredCount?: number;
  criticalMedical?: boolean;
  medicalRequired?: boolean;
  trapped?: boolean;
  waterRequired?: boolean;
  foodRequired?: boolean;
  evacuationRequired?: boolean;
  batteryLevel?: number;
}

export interface PriorityResult {
  priority: MessagePriority;
  reasons: string[];
  explanation: string;
}

export type EmergencyFields = Omit<EmergencySOS, keyof MeshMessage>;

export interface SOSBuildResult {
  priority: MessagePriority;
  summary: string;
  explanation: string;
  emergency: EmergencyFields;
}

/**
 * Deterministic, offline emergency-priority engine (mirrors the server engine).
 * No AI/network dependency. First matching rule wins.
 */
export function evaluateEmergencyPriority(assessment: EmergencyAssessment): PriorityResult {
  const injured = assessment.injuredCount ?? 0;
  const critical = !!assessment.criticalMedical;
  const medicalRequired = !!assessment.medicalRequired;
  const trapped = !!assessment.trapped;
  const evacuation = !!assessment.evacuationRequired;
  const people = assessment.peopleCount ?? 0;
  const water = !!assessment.waterRequired;
  const food = !!assessment.foodRequired;

  const reasons: string[] = [];
  const addReason = (text: string) => { if (!reasons.includes(text)) reasons.push(text); };

  let priority: MessagePriority;

  if (critical && trapped) {
    priority = 'P1';
    addReason('critical medical condition + trapped');
  } else if (critical) {
    priority = 'P1';
    addReason('critical medical condition (life-threatening)');
  } else if (trapped && injured > 0) {
    priority = 'P1';
    addReason('trapped with injured people');
  } else if (injured > 0 || medicalRequired) {
    priority = 'P2';
    addReason(medicalRequired ? 'medical assistance required' : `${injured} injured`);
  } else if (trapped) {
    priority = 'P2';
    addReason('people trapped');
  } else if (evacuation && people > 0) {
    priority = 'P2';
    addReason('evacuation required for people on site');
  } else if (evacuation) {
    priority = 'P3';
    addReason('evacuation request');
  } else if (water || food) {
    priority = 'P3';
    addReason(water && food ? 'water and food required' : water ? 'water required' : 'food required');
  } else {
    priority = 'P4';
    addReason('no immediate life-safety condition reported');
  }

  const explanation = `P${priority.slice(1)} assigned because: ${reasons.join(' + ')}.`;
  return { priority, reasons, explanation };
}

export function generateEmergencySummary(assessment: EmergencyAssessment): string {
  const parts: string[] = [];
  const people = assessment.peopleCount ?? 1;
  const injured = assessment.injuredCount ?? 0;
  const critical = !!assessment.criticalMedical;
  const trapped = !!assessment.trapped;
  const medical = !!assessment.medicalRequired;
  const evacuation = !!assessment.evacuationRequired;
  const water = !!assessment.waterRequired;
  const food = !!assessment.foodRequired;

  parts.push(`${people} ${people === 1 ? 'person' : 'people'}`);
  if (trapped) parts.push('trapped');
  if (injured > 0) parts.push(`${injured} ${injured === 1 ? 'injured person' : 'injured people'}`);
  if (critical) parts.push('critically injured');
  if (medical) parts.push('medical assistance required');
  if (evacuation) parts.push('evacuation required');
  if (water) parts.push('water required');
  if (food) parts.push('food required');

  let summary = parts.join(', ') + '.';
  if (critical || medical || (trapped && injured > 0)) summary += ' Immediate assistance required.';
  return summary.charAt(0).toUpperCase() + summary.slice(1);
}

export function buildEmergencyFields(assessment: EmergencyAssessment): SOSBuildResult {
  const { priority, explanation } = evaluateEmergencyPriority(assessment);
  const summary = generateEmergencySummary(assessment);
  const emergency: EmergencyFields = {
    peopleCount: assessment.peopleCount ?? 1,
    injuredCount: assessment.injuredCount ?? 0,
    criticalMedical: assessment.criticalMedical ?? false,
    medicalRequired: assessment.medicalRequired ?? false,
    trapped: assessment.trapped ?? false,
    waterRequired: assessment.waterRequired ?? false,
    foodRequired: assessment.foodRequired ?? false,
    evacuationRequired: assessment.evacuationRequired ?? false,
    batteryLevel: assessment.batteryLevel,
    lastKnownConnection: Date.now(),
    summary,
  };
  return { priority, summary, explanation, emergency };
}

export function buildSOSContent(assessment: EmergencyAssessment, summary: string, location?: { lat: number; lng: number; sector: string; zone: string }): string {
  const locationStr = location ? `sector ${location.sector}/${location.zone}` : 'unknown location';
  return `SOS: ${summary} [${locationStr}]`;
}