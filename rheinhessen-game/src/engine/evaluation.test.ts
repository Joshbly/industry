import { describe, test, expect } from 'vitest';
import { isLegalExact, bestLegalGreedy, bestSafeIllegalGreedy } from './evaluation';
import type { Card } from './types';

function makeCard(rank: number, suit: 'S' | 'H' | 'D' | 'C', deck = 0): Card {
  return { id: `${rank}${suit}${deck}`, r: rank as any, s: suit, d: deck as 0 | 1 };
}

describe('isLegalExact', () => {
  test('recognizes pairs', () => {
    const pair = [makeCard(7, 'S'), makeCard(7, 'H')];
    expect(isLegalExact(pair)).toBe(true);
  });
  
  test('rejects non-pairs', () => {
    const notPair = [makeCard(7, 'S'), makeCard(8, 'H')];
    expect(isLegalExact(notPair)).toBe(false);
  });
  
  test('recognizes two-pair', () => {
    const twoPair = [
      makeCard(7, 'S'), makeCard(7, 'H'),
      makeCard(9, 'D'), makeCard(9, 'C')
    ];
    expect(isLegalExact(twoPair)).toBe(true);
  });
  
  test('recognizes trips', () => {
    const trips = [makeCard(5, 'S'), makeCard(5, 'H'), makeCard(5, 'D')];
    expect(isLegalExact(trips)).toBe(true);
  });
  
  test('recognizes quads', () => {
    const quads = [
      makeCard(10, 'S'), makeCard(10, 'H'),
      makeCard(10, 'D'), makeCard(10, 'C')
    ];
    expect(isLegalExact(quads)).toBe(true);
  });
  
  test('recognizes straight', () => {
    const straight = [
      makeCard(3, 'S'), makeCard(4, 'H'),
      makeCard(5, 'D'), makeCard(6, 'C'), makeCard(7, 'S')
    ];
    expect(isLegalExact(straight)).toBe(true);
  });
  
  test('recognizes A-2-3-4-5 wheel straight', () => {
    const wheel = [
      makeCard(14, 'S'), makeCard(2, 'H'),
      makeCard(3, 'D'), makeCard(4, 'C'), makeCard(5, 'S')
    ];
    expect(isLegalExact(wheel)).toBe(true);
  });
  
  test('recognizes flush', () => {
    const flush = [
      makeCard(2, 'H'), makeCard(5, 'H'),
      makeCard(7, 'H'), makeCard(9, 'H'), makeCard(11, 'H')
    ];
    expect(isLegalExact(flush)).toBe(true);
  });
  
  test('recognizes full house', () => {
    const fullHouse = [
      makeCard(8, 'S'), makeCard(8, 'H'), makeCard(8, 'D'),
      makeCard(3, 'C'), makeCard(3, 'S')
    ];
    expect(isLegalExact(fullHouse)).toBe(true);
  });
  
  test('recognizes straight flush', () => {
    const straightFlush = [
      makeCard(4, 'D'), makeCard(5, 'D'),
      makeCard(6, 'D'), makeCard(7, 'D'), makeCard(8, 'D')
    ];
    expect(isLegalExact(straightFlush)).toBe(true);
  });
  
  test('rejects broken straight', () => {
    const broken = [
      makeCard(3, 'S'), makeCard(4, 'H'),
      makeCard(5, 'D'), makeCard(7, 'C'), makeCard(8, 'S')
    ];
    expect(isLegalExact(broken)).toBe(false);
  });
  
  test('rejects 5 of a kind as illegal', () => {
    const fiveKind = [
      makeCard(6, 'S'), makeCard(6, 'H'),
      makeCard(6, 'D'), makeCard(6, 'C'), makeCard(6, 'S', 1)
    ];
    expect(isLegalExact(fiveKind)).toBe(false);
  });
});

describe('bestLegalGreedy', () => {
  test('finds best pair from hand', () => {
    const hand = [
      makeCard(14, 'S'), // A = 11 points
      makeCard(14, 'H'), // A = 11 points  
      makeCard(2, 'D'),
      makeCard(3, 'C'),
      makeCard(4, 'S')
    ];
    const result = bestLegalGreedy(hand);
    expect(result).not.toBeNull();
    expect(result!.cards.length).toBe(2);
    expect(result!.raw).toBe(22); // Two aces
  });
  
  test('finds straight over pairs when higher value', () => {
    const hand = [
      makeCard(3, 'S'), makeCard(4, 'H'), makeCard(5, 'D'),
      makeCard(6, 'C'), makeCard(7, 'S'),
      makeCard(3, 'H'), makeCard(4, 'D')
    ];
    const result = bestLegalGreedy(hand);
    expect(result).not.toBeNull();
    expect(result!.cards.length).toBe(5); // Straight not pairs
    expect(result!.raw).toBe(25); // 3+4+5+6+7
  });
  
  test('returns null when no legal hand possible', () => {
    const hand = [makeCard(2, 'S'), makeCard(3, 'H'), makeCard(5, 'D')];
    const result = bestLegalGreedy(hand);
    expect(result).toBeNull();
  });
});

describe('bestSafeIllegalGreedy', () => {
  test('finds best illegal under threshold', () => {
    const hand = [
      makeCard(10, 'S'), makeCard(10, 'H'), // Would be pair (legal)
      makeCard(8, 'D'), makeCard(7, 'C')
    ];
    const result = bestSafeIllegalGreedy(hand, 26);
    expect(result).not.toBeNull();
    expect(!isLegalExact(result.cards)).toBe(true); // Must be illegal
    expect(result.raw).toBeLessThanOrEqual(26);
  });
  
  test('avoids creating legal patterns', () => {
    const hand = [
      makeCard(5, 'S'), makeCard(5, 'H'),
      makeCard(3, 'D'), makeCard(2, 'C')
    ];
    const result = bestSafeIllegalGreedy(hand, 20);
    const isLegal = isLegalExact(result.cards);
    expect(isLegal).toBe(false);
  });
  
  test('returns single card if no safe combination exists', () => {
    const hand = [
      makeCard(14, 'S'), // A = 11
      makeCard(14, 'H'), // A = 11
      makeCard(13, 'D'), // K = 10
      makeCard(12, 'C')  // Q = 10
    ];
    const result = bestSafeIllegalGreedy(hand, 15);
    expect(result.cards.length).toBeGreaterThan(0);
    expect(result.raw).toBeLessThanOrEqual(15);
  });
});
