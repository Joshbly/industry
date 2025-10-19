import type { Card } from './types';
import { sortCards } from './deck';
import { isLegalExact } from './evaluation';

export interface ReorganizeResult {
  kept: Card[];
  leftover: Card[];
}

export function reorganizeGreedy(cards: Card[]): ReorganizeResult {
  if (cards.length === 0) {
    return { kept: [], leftover: [] };
  }
  
  const remaining = [...cards];
  const kept: Card[] = [];
  
  // Priority order: straights → quads → full houses → trips → two-pairs → pairs → flushes
  
  // 1. Find straights (including straight flushes)
  while (remaining.length >= 5) {
    const straight = findBestStraight(remaining);
    if (straight) {
      kept.push(...straight);
      straight.forEach(c => {
        const idx = remaining.findIndex(r => r.id === c.id);
        if (idx >= 0) remaining.splice(idx, 1);
      });
    } else {
      break;
    }
  }
  
  // 2. Find quads
  while (remaining.length >= 4) {
    const quads = findQuads(remaining);
    if (quads) {
      kept.push(...quads);
      quads.forEach(c => {
        const idx = remaining.findIndex(r => r.id === c.id);
        if (idx >= 0) remaining.splice(idx, 1);
      });
    } else {
      break;
    }
  }
  
  // 3. Find full houses
  while (remaining.length >= 5) {
    const fullHouse = findFullHouse(remaining);
    if (fullHouse) {
      kept.push(...fullHouse);
      fullHouse.forEach(c => {
        const idx = remaining.findIndex(r => r.id === c.id);
        if (idx >= 0) remaining.splice(idx, 1);
      });
    } else {
      break;
    }
  }
  
  // 4. Find trips
  while (remaining.length >= 3) {
    const trips = findTrips(remaining);
    if (trips) {
      kept.push(...trips);
      trips.forEach(c => {
        const idx = remaining.findIndex(r => r.id === c.id);
        if (idx >= 0) remaining.splice(idx, 1);
      });
    } else {
      break;
    }
  }
  
  // 5. Find two-pairs
  while (remaining.length >= 4) {
    const twoPair = findTwoPair(remaining);
    if (twoPair) {
      kept.push(...twoPair);
      twoPair.forEach(c => {
        const idx = remaining.findIndex(r => r.id === c.id);
        if (idx >= 0) remaining.splice(idx, 1);
      });
    } else {
      break;
    }
  }
  
  // 6. Find pairs
  while (remaining.length >= 2) {
    const pair = findPair(remaining);
    if (pair) {
      kept.push(...pair);
      pair.forEach(c => {
        const idx = remaining.findIndex(r => r.id === c.id);
        if (idx >= 0) remaining.splice(idx, 1);
      });
    } else {
      break;
    }
  }
  
  // 7. Check for flushes in remaining cards
  while (remaining.length >= 5) {
    const flush = findFlush(remaining);
    if (flush) {
      kept.push(...flush);
      flush.forEach(c => {
        const idx = remaining.findIndex(r => r.id === c.id);
        if (idx >= 0) remaining.splice(idx, 1);
      });
    } else {
      break;
    }
  }
  
  return { kept, leftover: remaining };
}

function findBestStraight(cards: Card[]): Card[] | null {
  if (cards.length < 5) return null;
  
  const sorted = sortCards(cards);
  
  // Check for regular straights
  for (let start = 0; start <= sorted.length - 5; start++) {
    const candidate: Card[] = [];
    let currentRank = sorted[start].r;
    candidate.push(sorted[start]);
    
    for (let i = start + 1; i < sorted.length && candidate.length < 5; i++) {
      if (sorted[i].r === currentRank + 1) {
        candidate.push(sorted[i]);
        currentRank = sorted[i].r;
      } else if (sorted[i].r === currentRank) {
        // Skip duplicates
        continue;
      }
    }
    
    if (candidate.length === 5 && isLegalExact(candidate)) {
      return candidate;
    }
  }
  
  // Check for A-2-3-4-5 wheel
  const hasAce = sorted.some(c => c.r === 14);
  const has2 = sorted.some(c => c.r === 2);
  const has3 = sorted.some(c => c.r === 3);
  const has4 = sorted.some(c => c.r === 4);
  const has5 = sorted.some(c => c.r === 5);
  
  if (hasAce && has2 && has3 && has4 && has5) {
    const wheel: Card[] = [];
    wheel.push(sorted.find(c => c.r === 2)!);
    wheel.push(sorted.find(c => c.r === 3)!);
    wheel.push(sorted.find(c => c.r === 4)!);
    wheel.push(sorted.find(c => c.r === 5)!);
    wheel.push(sorted.find(c => c.r === 14)!);
    if (isLegalExact(wheel)) {
      return wheel;
    }
  }
  
  return null;
}

function findQuads(cards: Card[]): Card[] | null {
  const rankCounts = new Map<number, Card[]>();
  cards.forEach(c => {
    if (!rankCounts.has(c.r)) rankCounts.set(c.r, []);
    rankCounts.get(c.r)!.push(c);
  });
  
  for (const [, group] of rankCounts) {
    if (group.length >= 4) {
      return group.slice(0, 4);
    }
  }
  
  return null;
}

function findFullHouse(cards: Card[]): Card[] | null {
  const rankCounts = new Map<number, Card[]>();
  cards.forEach(c => {
    if (!rankCounts.has(c.r)) rankCounts.set(c.r, []);
    rankCounts.get(c.r)!.push(c);
  });
  
  let trips: Card[] | null = null;
  let pair: Card[] | null = null;
  
  for (const [, group] of rankCounts) {
    if (group.length >= 3 && !trips) {
      trips = group.slice(0, 3);
    } else if (group.length >= 2 && !pair) {
      pair = group.slice(0, 2);
    }
  }
  
  if (trips && pair) {
    return [...trips, ...pair];
  }
  
  return null;
}

function findTrips(cards: Card[]): Card[] | null {
  const rankCounts = new Map<number, Card[]>();
  cards.forEach(c => {
    if (!rankCounts.has(c.r)) rankCounts.set(c.r, []);
    rankCounts.get(c.r)!.push(c);
  });
  
  for (const [, group] of rankCounts) {
    if (group.length >= 3) {
      return group.slice(0, 3);
    }
  }
  
  return null;
}

function findTwoPair(cards: Card[]): Card[] | null {
  const rankCounts = new Map<number, Card[]>();
  cards.forEach(c => {
    if (!rankCounts.has(c.r)) rankCounts.set(c.r, []);
    rankCounts.get(c.r)!.push(c);
  });
  
  const pairs: Card[][] = [];
  for (const [, group] of rankCounts) {
    if (group.length >= 2) {
      pairs.push(group.slice(0, 2));
    }
  }
  
  if (pairs.length >= 2) {
    return [...pairs[0], ...pairs[1]];
  }
  
  return null;
}

function findPair(cards: Card[]): Card[] | null {
  const rankCounts = new Map<number, Card[]>();
  cards.forEach(c => {
    if (!rankCounts.has(c.r)) rankCounts.set(c.r, []);
    rankCounts.get(c.r)!.push(c);
  });
  
  for (const [, group] of rankCounts) {
    if (group.length >= 2) {
      return group.slice(0, 2);
    }
  }
  
  return null;
}

function findFlush(cards: Card[]): Card[] | null {
  const suitCounts = new Map<string, Card[]>();
  cards.forEach(c => {
    if (!suitCounts.has(c.s)) suitCounts.set(c.s, []);
    suitCounts.get(c.s)!.push(c);
  });
  
  for (const [, group] of suitCounts) {
    if (group.length >= 5) {
      return group.slice(0, 5);
    }
  }
  
  return null;
}
