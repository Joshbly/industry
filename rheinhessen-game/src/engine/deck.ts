import seedrandom from 'seedrandom';
import type { Card, Rank, Suit } from './types';

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export function makeDoubleDeck(): Card[] {
  // Creates 4 standard decks (208 cards total)
  const cards: Card[] = [];
  for (let deckIdx = 0; deckIdx < 4; deckIdx++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({
          id: `${rank}${suit}${deckIdx}`,
          r: rank,
          s: suit,
          d: deckIdx as 0 | 1 | 2 | 3
        });
      }
    }
  }
  return cards;
}

export function shuffle(cards: Card[], seed?: string): Card[] {
  const rng = seed ? seedrandom(seed) : Math.random;
  const shuffled = [...cards];
  
  // Fisher-Yates shuffle
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  return shuffled;
}

export function rawValue(cards: Card[]): number {
  return cards.reduce((sum, card) => {
    const value = card.r <= 10 ? card.r : card.r === 14 ? 11 : 10;
    return sum + value;
  }, 0);
}

export function cardValue(card: Card): number {
  if (card.r <= 10) return card.r;
  if (card.r === 14) return 11; // Ace
  return 10; // J, Q, K
}

export function sortCards(cards: Card[]): Card[] {
  return [...cards].sort((a, b) => {
    if (a.r !== b.r) return a.r - b.r;
    return SUITS.indexOf(a.s) - SUITS.indexOf(b.s);
  });
}

export function cardsEqual(a: Card, b: Card): boolean {
  return a.id === b.id;
}

export function findCard(cards: Card[], card: Card): number {
  return cards.findIndex(c => cardsEqual(c, card));
}
