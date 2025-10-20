import { describe, test, expect } from 'vitest';
import { scoreLegal, scoreIllegal, calculateTaxedValue } from './scoring';

describe('scoreLegal', () => {
  test('calculates 50% + 8 bonus correctly', () => {
    expect(scoreLegal(20)).toBe(18); // 20 * 0.5 + 8 = 18
    expect(scoreLegal(30)).toBe(23); // 30 * 0.5 + 8 = 23
    expect(scoreLegal(50)).toBe(33); // 50 * 0.5 + 8 = 33
  });
  
  test('rounds correctly', () => {
    expect(scoreLegal(25)).toBe(21); // 25 * 0.5 + 8 = 20.5 → 21
    expect(scoreLegal(15)).toBe(16); // 15 * 0.5 + 8 = 15.5 → 16
  });
});

describe('scoreIllegal', () => {
  test('calculates 60% for non-spike values', () => {
    const result = scoreIllegal(20, 0);
    expect(result.points).toBe(12); // 20 * 0.6 = 12
    expect(result.ticksAdded).toBe(0);
    expect(result.kickback).toBe(0);
  });
  
  test('applies kickback and single tick for spike (raw >= 27)', () => {
    const result = scoreIllegal(30, 0);
    expect(result.points).toBe(13); // 30 * 0.6 - 5 = 13
    expect(result.ticksAdded).toBe(1);
    expect(result.kickback).toBe(5);
  });
  
  test('applies escalating +2 when track >= 3 and raw >= 25', () => {
    const result = scoreIllegal(27, 3);
    expect(result.points).toBe(11); // 27 * 0.6 - 5 = 11.2 → 11
    expect(result.ticksAdded).toBe(2); // Escalating rule
    expect(result.kickback).toBe(5);
  });
  
  test('only +1 tick at track >= 3 if raw < 25', () => {
    // This shouldn't happen since spike threshold is 27, but testing edge case
    const result = scoreIllegal(24, 3);
    expect(result.ticksAdded).toBe(0); // No spike, no ticks
  });
  
  test('handles exactly raw = 27 threshold', () => {
    const result = scoreIllegal(27, 0);
    expect(result.points).toBe(11); // 27 * 0.6 - 5 = 11.2 → 11
    expect(result.ticksAdded).toBe(1);
    expect(result.kickback).toBe(5);
  });
  
  test('rounds points correctly', () => {
    const result = scoreIllegal(25, 0);
    expect(result.points).toBe(15); // 25 * 0.6 = 15
  });
});

describe('calculateTaxedValue', () => {
  test('matches legal scoring formula', () => {
    expect(calculateTaxedValue(20)).toBe(18); // Same as legal score
    expect(calculateTaxedValue(12)).toBe(14); // 12 * 0.5 + 8 = 14
    expect(calculateTaxedValue(10)).toBe(13); // 10 * 0.5 + 8 = 13
  });
  
  test('meets minimum 12 threshold for internal audit', () => {
    // Find minimum raw value that produces taxed >= 12
    expect(calculateTaxedValue(8)).toBe(12); // 8 * 0.5 + 8 = 12
    expect(calculateTaxedValue(7)).toBe(12); // 7 * 0.5 + 8 = 11.5 → 12 (rounds up)
  });
});
