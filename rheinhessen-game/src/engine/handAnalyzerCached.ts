import type { Card } from './types';
import { rawValue, sortCards } from './deck';
import { isLegalExact } from './evaluation';

// Super simple, ultra-fast hand analyzer
// Key optimizations:
// 1. No strategic evaluation (AI will learn this)
// 2. Pre-compute common patterns
// 3. Minimal object creation
// 4. Use indices directly

export interface FastPlayOption {
  indices: number[];  // Which cards to play (by index)
  isLegal: boolean;
  rawValue: number;
}

export class HandAnalyzerCached {
  private hand: Card[];
  private sortedHand: Card[];
  private cachedOptions: FastPlayOption[] | null = null;
  
  constructor(hand: Card[]) {
    this.hand = hand;
    this.sortedHand = sortCards([...hand]);
  }
  
  // Get hand encoding for state
  static encodeHand(hand: Card[]): string {
    const sorted = sortCards([...hand]);
    // Just first 5 cards, simpler encoding
    return sorted.slice(0, 5).map(c => c.r).join(',');
  }
  
  // Get fast play options - MUCH simpler!
  getFastOptions(): FastPlayOption[] {
    // Cache the options for this hand
    if (this.cachedOptions) return this.cachedOptions;
    
    const options: FastPlayOption[] = [];
    const n = this.hand.length;
    
    // Skip if no cards
    if (n === 0) {
      this.cachedOptions = options;
      return options;
    }
    
    // 1. Single cards (just first occurrence of each rank)
    const seenRanks = new Set<number>();
    for (let i = 0; i < n; i++) {
      const rank = this.sortedHand[i].r;
      if (!seenRanks.has(rank)) {
        seenRanks.add(rank);
        options.push(this.createOption([i]));
      }
    }
    
    // 2. Pairs (if we have them)
    const rankGroups = new Map<number, number[]>();
    this.sortedHand.forEach((card, idx) => {
      if (!rankGroups.has(card.r)) rankGroups.set(card.r, []);
      rankGroups.get(card.r)!.push(idx);
    });
    
    for (const indices of rankGroups.values()) {
      if (indices.length >= 2) {
        options.push(this.createOption([indices[0], indices[1]]));
      }
      if (indices.length >= 3) {
        options.push(this.createOption([indices[0], indices[1], indices[2]]));
      }
      if (indices.length === 4) {
        options.push(this.createOption(indices));
      }
    }
    
    // 3. Small illegal plays (2-3 mixed cards)
    if (n >= 2) {
      // Low 2
      options.push(this.createOption([0, 1]));
      // High 2
      if (n > 2) {
        options.push(this.createOption([n-2, n-1]));
      }
    }
    
    if (n >= 3) {
      // Low 3
      options.push(this.createOption([0, 1, 2]));
      // High 3
      if (n > 3) {
        options.push(this.createOption([n-3, n-2, n-1]));
      }
    }
    
    // 4. Medium dumps (half hand)
    if (n >= 4) {
      const halfSize = Math.floor(n / 2);
      const halfIndices = [];
      for (let i = 0; i < halfSize; i++) halfIndices.push(i);
      options.push(this.createOption(halfIndices));
    }
    
    // 5. Large dump (all but one)
    if (n >= 3) {
      const mostIndices = [];
      for (let i = 0; i < n - 1; i++) mostIndices.push(i);
      options.push(this.createOption(mostIndices));
    }
    
    // 6. Full dump
    const allIndices = [];
    for (let i = 0; i < n; i++) allIndices.push(i);
    options.push(this.createOption(allIndices));
    
    this.cachedOptions = options;
    return options;
  }
  
  private createOption(indices: number[]): FastPlayOption {
    const cards = indices.map(i => this.sortedHand[i]);
    return {
      indices,
      isLegal: isLegalExact(cards),
      rawValue: rawValue(cards)
    };
  }
  
  // Convert option to action string (simpler)
  static optionToAction(option: FastPlayOption): string {
    return `p-${option.indices.join('')}`;
  }
  
  // Get cards for indices
  getCardsForIndices(indices: number[]): Card[] {
    return indices.map(i => this.sortedHand[i]);
  }
}
