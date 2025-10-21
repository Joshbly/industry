import { describe, test, expect } from 'vitest';
import { scoreLegal, scoreIllegal, calculateTaxedValue } from './scoring';

describe('scoreLegal', () => {
  test('calculates 30% with heavy tax', () => {
    expect(scoreLegal(20)).toBe(6); // 20 * 0.3 = 6
    expect(scoreLegal(30)).toBe(9); // 30 * 0.3 = 9
    expect(scoreLegal(50)).toBe(15); // 50 * 0.3 = 15
  });
  
  test('rounds correctly', () => {
    expect(scoreLegal(25)).toBe(8); // 25 * 0.3 = 7.5 → 8
    expect(scoreLegal(15)).toBe(5); // 15 * 0.3 = 4.5 → 5
  });
});

describe('scoreIllegal', () => {
  test('calculates 100% for non-spike values', () => {
    const result = scoreIllegal(20);
    expect(result.points).toBe(20); // 100% of raw value
    expect(result.ticksAdded).toBe(0);
    expect(result.kickback).toBe(0);
  });
  
  test('graduated tick system: 1 tick per 26 raw, starting at 27', () => {
    const result1 = scoreIllegal(26);
    expect(result1.points).toBe(26);
    expect(result1.ticksAdded).toBe(0); // 0-26 = no tick
    
    const result2 = scoreIllegal(27);
    expect(result2.points).toBe(27);
    expect(result2.ticksAdded).toBe(1); // 27-52 = 1 tick
    
    const result3 = scoreIllegal(52);
    expect(result3.points).toBe(52);
    expect(result3.ticksAdded).toBe(1); // Still 1 tick
    
    const result4 = scoreIllegal(53);
    expect(result4.points).toBe(53);
    expect(result4.ticksAdded).toBe(2); // 53-78 = 2 ticks
    
    const result5 = scoreIllegal(79);
    expect(result5.points).toBe(79);
    expect(result5.ticksAdded).toBe(3); // 79-104 = 3 ticks
  });
  
  test('handles edge cases at tick boundaries', () => {
    const result1 = scoreIllegal(26);
    expect(result1.ticksAdded).toBe(0); // 26 = no tick
    
    const result2 = scoreIllegal(27);
    expect(result2.ticksAdded).toBe(1); // 27 = first tick
    
    const result3 = scoreIllegal(52);
    expect(result3.ticksAdded).toBe(1); // 52 still = 1 tick
    
    const result4 = scoreIllegal(53);
    expect(result4.ticksAdded).toBe(2); // 53 = 2 ticks
  });
  
  test('handles exactly raw = 27 threshold', () => {
    const result = scoreIllegal(27);
    expect(result.points).toBe(27); // 100% value, no kickback
    expect(result.ticksAdded).toBe(1); // First tick starts at 27
    expect(result.kickback).toBe(0);
  });
  
  test('returns full value', () => {
    const result = scoreIllegal(25);
    expect(result.points).toBe(25); // 100% value
  });
});

describe('calculateTaxedValue', () => {
  test('matches legal scoring formula', () => {
    expect(calculateTaxedValue(20)).toBe(6); // 20 * 0.3 = 6
    expect(calculateTaxedValue(30)).toBe(9); // 30 * 0.3 = 9
    expect(calculateTaxedValue(10)).toBe(3); // 10 * 0.3 = 3
  });
  
  test('meets minimum 12 threshold for internal audit', () => {
    // Find minimum raw value that produces taxed >= 12
    expect(calculateTaxedValue(40)).toBe(12); // 40 * 0.3 = 12
    expect(calculateTaxedValue(39)).toBe(12); // 39 * 0.3 = 11.7 → 12 (rounds up)
  });
});
