import type { MessagePriority } from '../types/index.js';

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

export const PRIORITY_RANK: Record<MessagePriority, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };

/**
 * Deterministic, offline emergency-priority engine.
 *
 * Rule table (evaluated in order, first match wins):
 *   Critical medical condition + trapped                    -> P1
 *   Any life-threatening condition (critical medical alone,
 *     or trapped with injured people)                       -> P1
 *   Medical emergency / injured people / medical required   -> P2
 *   Evacuation required (with people present)               -> P2
 *   Evacuation request without verified people              -> P3
 *   Food / water request                                    -> P3
 *   Everything else (informational)                         -> P4
 *
 * No external AI or network dependency - the decision is fully
 * deterministic and explainable.
 */
export class EmergencyPriorityEngine {
  evaluate(assessment: EmergencyAssessment): PriorityResult {
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
}