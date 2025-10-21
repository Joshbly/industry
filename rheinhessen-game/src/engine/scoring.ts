import type { ProductionResult } from './types';

export function scoreLegal(raw: number): number {
  // 30% of raw value - heavily taxed
  return Math.round(raw * 0.30);
}

export function scoreIllegal(raw: number): ProductionResult {
  let points = raw; // 100% of raw value - full points!
  let ticksAdded = 0;
  let kickback = 0; // No kickback penalty anymore
  
  // Graduated tick system: 1 tick per 26 raw value, starting at 27
  if (raw >= 27) {
    ticksAdded = Math.ceil((raw - 26) / 26);
    // Examples:
    // 0-26 raw = 0 ticks (safe zone)
    // 27-52 raw = 1 tick
    // 53-78 raw = 2 ticks
    // 79-104 raw = 3 ticks
    // etc.
  }
  
  return {
    points: Math.round(points),
    ticksAdded,
    kickback
  };
}

export function calculateTaxedValue(raw: number): number {
  // Taxed value for internal audit requirement (30% of raw, matching legal scoring)
  return Math.round(raw * 0.30);
}
