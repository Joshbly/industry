import type { Card, HandType } from './types';
import { rawValue, sortCards } from './deck';

export function isLegalExact(cards: Card[]): boolean {
  const sorted = sortCards(cards);
  const len = sorted.length;
  
  if (len === 2) return isPair(sorted);
  if (len === 4) return isTwoPair(sorted) || isQuads(sorted);
  if (len === 3) return isTrips(sorted);
  if (len === 5) {
    return isStraight(sorted) || isFlush(sorted) || 
           isFullHouse(sorted) || isStraightFlush(sorted);
  }
  
  return false;
}

function isPair(cards: Card[]): boolean {
  return cards.length === 2 && cards[0].r === cards[1].r;
}

function isTwoPair(cards: Card[]): boolean {
  if (cards.length !== 4) return false;
  const ranks = cards.map(c => c.r);
  ranks.sort((a, b) => a - b);
  return ranks[0] === ranks[1] && ranks[2] === ranks[3] && ranks[0] !== ranks[2];
}

function isTrips(cards: Card[]): boolean {
  if (cards.length !== 3) return false;
  return cards[0].r === cards[1].r && cards[1].r === cards[2].r;
}

function isQuads(cards: Card[]): boolean {
  if (cards.length !== 4) return false;
  return cards.every(c => c.r === cards[0].r);
}

function isStraight(cards: Card[]): boolean {
  if (cards.length !== 5) return false;
  const sorted = sortCards(cards);
  
  // Check regular straight
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].r !== sorted[i - 1].r + 1) {
      // Check for A-2-3-4-5 (wheel)
      if (i === 4 && sorted[4].r === 14 && 
          sorted[0].r === 2 && sorted[1].r === 3 && 
          sorted[2].r === 4 && sorted[3].r === 5) {
        return true;
      }
      return false;
    }
  }
  return true;
}

function isFlush(cards: Card[]): boolean {
  if (cards.length !== 5) return false;
  const suit = cards[0].s;
  return cards.every(c => c.s === suit);
}

function isFullHouse(cards: Card[]): boolean {
  if (cards.length !== 5) return false;
  const rankCounts = new Map<number, number>();
  cards.forEach(c => rankCounts.set(c.r, (rankCounts.get(c.r) || 0) + 1));
  const counts = Array.from(rankCounts.values()).sort();
  return counts.length === 2 && counts[0] === 2 && counts[1] === 3;
}

function isStraightFlush(cards: Card[]): boolean {
  return isStraight(cards) && isFlush(cards);
}

export function getHandType(cards: Card[]): HandType | 'illegal' {
  const sorted = sortCards(cards);
  const len = sorted.length;
  
  if (len === 2 && isPair(sorted)) return 'pair';
  if (len === 3 && isTrips(sorted)) return 'trips';
  if (len === 4) {
    if (isTwoPair(sorted)) return 'two-pair';
    if (isQuads(sorted)) return 'quads';
  }
  if (len === 5) {
    if (isStraightFlush(sorted)) return 'straight-flush';
    if (isFullHouse(sorted)) return 'full-house';
    if (isFlush(sorted)) return 'flush';
    if (isStraight(sorted)) return 'straight';
  }
  
  return 'illegal';
}

export function bestLegalGreedy(hand: Card[]): { cards: Card[]; raw: number } | null {
  let bestCards: Card[] = [];
  let bestRaw = 0;
  
  // Try all subsets for legal hands
  const tryLegal = (subset: Card[]) => {
    if (isLegalExact(subset)) {
      const raw = rawValue(subset);
      if (raw > bestRaw) {
        bestRaw = raw;
        bestCards = subset;
      }
    }
  };
  
  // Check pairs
  for (let i = 0; i < hand.length; i++) {
    for (let j = i + 1; j < hand.length; j++) {
      if (hand[i].r === hand[j].r) {
        tryLegal([hand[i], hand[j]]);
      }
    }
  }
  
  // Check trips
  for (let i = 0; i < hand.length; i++) {
    for (let j = i + 1; j < hand.length; j++) {
      for (let k = j + 1; k < hand.length; k++) {
        if (hand[i].r === hand[j].r && hand[j].r === hand[k].r) {
          tryLegal([hand[i], hand[j], hand[k]]);
        }
      }
    }
  }
  
  // Check quads and two-pair
  for (let i = 0; i < hand.length; i++) {
    for (let j = i + 1; j < hand.length; j++) {
      for (let k = j + 1; k < hand.length; k++) {
        for (let l = k + 1; l < hand.length; l++) {
          const fourCards = [hand[i], hand[j], hand[k], hand[l]];
          tryLegal(fourCards);
        }
      }
    }
  }
  
  // Check 5-card combinations
  if (hand.length >= 5) {
    for (let i = 0; i < hand.length; i++) {
      for (let j = i + 1; j < hand.length; j++) {
        for (let k = j + 1; k < hand.length; k++) {
          for (let l = k + 1; l < hand.length; l++) {
            for (let m = l + 1; m < hand.length; m++) {
              const fiveCards = [hand[i], hand[j], hand[k], hand[l], hand[m]];
              tryLegal(fiveCards);
            }
          }
        }
      }
    }
  }
  
  return bestCards.length > 0 ? { cards: bestCards, raw: bestRaw } : null;
}

export function bestSafeIllegalGreedy(hand: Card[], threshold = 26): { cards: Card[]; raw: number } {
  // Find combination that maximizes value while staying <= threshold and avoiding legal patterns
  let bestCards: Card[] = [];
  let bestRaw = 0;
  
  // Try all subsets
  const trySubset = (subset: Card[]) => {
    if (!isLegalExact(subset)) {
      const raw = rawValue(subset);
      if (raw <= threshold && raw > bestRaw) {
        bestRaw = raw;
        bestCards = subset;
      }
    }
  };
  
  // Generate all possible subsets
  for (let mask = 1; mask < (1 << hand.length); mask++) {
    const subset: Card[] = [];
    for (let i = 0; i < hand.length; i++) {
      if (mask & (1 << i)) {
        subset.push(hand[i]);
      }
    }
    trySubset(subset);
  }
  
  // If no safe illegal found, return single lowest card
  if (bestCards.length === 0 && hand.length > 0) {
    const sorted = sortCards(hand);
    bestCards = [sorted[0]];
    bestRaw = rawValue(bestCards);
  }
  
  return { cards: bestCards, raw: bestRaw };
}
