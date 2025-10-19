import { describe, test, expect } from 'vitest';
import { reorganizeGreedy } from './audits';
import type { Card } from './types';

function makeCard(rank: number, suit: 'S' | 'H' | 'D' | 'C', deck = 0): Card {
  return { id: `${rank}${suit}${deck}`, r: rank as any, s: suit, d: deck as 0 | 1 };
}

describe('reorganizeGreedy', () => {
  test('keeps all cards when they form perfect legal hands', () => {
    const floor = [
      makeCard(7, 'S'), makeCard(7, 'H'), // Pair
      makeCard(9, 'D'), makeCard(9, 'C'), // Another pair
      makeCard(3, 'S'), makeCard(3, 'H'), makeCard(3, 'D') // Trips
    ];
    const result = reorganizeGreedy(floor);
    expect(result.kept.length).toBe(7);
    expect(result.leftover.length).toBe(0);
  });
  
  test('finds leftover cards that cannot form legal hands', () => {
    const floor = [
      makeCard(7, 'S'), makeCard(7, 'H'), // Pair - kept
      makeCard(9, 'D'), makeCard(10, 'C'), makeCard(11, 'S') // No legal - leftover
    ];
    const result = reorganizeGreedy(floor);
    expect(result.kept.length).toBe(2); // Just the pair
    expect(result.leftover.length).toBe(3); // The rest
  });
  
  test('prioritizes straights over individual pairs', () => {
    const floor = [
      makeCard(3, 'S'), makeCard(4, 'H'), makeCard(5, 'D'),
      makeCard(6, 'C'), makeCard(7, 'S'), // Straight
      makeCard(3, 'H'), makeCard(4, 'D') // Would be pairs but used in straight
    ];
    const result = reorganizeGreedy(floor);
    expect(result.kept.length).toBe(5); // The straight
    expect(result.leftover.length).toBe(2); // Leftover duplicates
  });
  
  test('forms multiple pairs from duplicates', () => {
    const floor = [
      makeCard(5, 'S'), makeCard(5, 'H'),
      makeCard(5, 'D'), makeCard(5, 'C'),
      makeCard(8, 'S'), makeCard(8, 'H')
    ];
    const result = reorganizeGreedy(floor);
    expect(result.kept.length).toBe(6); // All form pairs/quads
    expect(result.leftover.length).toBe(0);
  });
  
  test('forms full house correctly', () => {
    const floor = [
      makeCard(10, 'S'), makeCard(10, 'H'), makeCard(10, 'D'), // Trips
      makeCard(3, 'C'), makeCard(3, 'S'), // Pair
      makeCard(7, 'H') // Leftover
    ];
    const result = reorganizeGreedy(floor);
    expect(result.kept.length).toBe(5); // Full house
    expect(result.leftover.length).toBe(1); // Single 7
  });
  
  test('handles empty floor', () => {
    const result = reorganizeGreedy([]);
    expect(result.kept.length).toBe(0);
    expect(result.leftover.length).toBe(0);
  });
  
  test('forms flush when possible', () => {
    const floor = [
      makeCard(2, 'H'), makeCard(5, 'H'), makeCard(7, 'H'),
      makeCard(9, 'H'), makeCard(11, 'H'), // Flush
      makeCard(3, 'S'), makeCard(4, 'D')
    ];
    const result = reorganizeGreedy(floor);
    expect(result.kept.length).toBe(5); // The flush
    expect(result.leftover.length).toBe(2);
  });
  
  test('prefers quads over two pairs', () => {
    const floor = [
      makeCard(6, 'S'), makeCard(6, 'H'),
      makeCard(6, 'D'), makeCard(6, 'C')
    ];
    const result = reorganizeGreedy(floor);
    expect(result.kept.length).toBe(4); // Quads
    expect(result.leftover.length).toBe(0);
  });
  
  test('correctly handles A-2-3-4-5 wheel', () => {
    const floor = [
      makeCard(14, 'S'), makeCard(2, 'H'), makeCard(3, 'D'),
      makeCard(4, 'C'), makeCard(5, 'S'),
      makeCard(14, 'H') // Extra ace
    ];
    const result = reorganizeGreedy(floor);
    expect(result.kept.length).toBe(5); // The wheel
    expect(result.leftover.length).toBe(1); // Extra ace
  });
});
