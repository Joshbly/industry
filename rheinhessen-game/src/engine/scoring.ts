import type { ProductionResult } from './types';

export function scoreLegal(raw: number): number {
  // 70% of raw + 8 compliance bonus
  return Math.round(raw * 0.70 + 8);
}

export function scoreIllegal(raw: number, auditTrack: number): ProductionResult {
  let points = raw * 0.60;
  let ticksAdded = 0;
  let kickback = 0;
  
  if (raw >= 27) {
    kickback = 5;
    points -= kickback;
    
    // Escalating +2: if Audit Track ≥3 and raw ≥25, add +2 ticks; else +1 tick
    if (auditTrack >= 3 && raw >= 25) {
      ticksAdded = 2;
    } else {
      ticksAdded = 1;
    }
  }
  
  return {
    points: Math.round(points),
    ticksAdded,
    kickback
  };
}

export function calculateTaxedValue(raw: number): number {
  // Taxed value for internal audit requirement
  return Math.round(raw * 0.70 + 8);
}
