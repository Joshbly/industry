import type { Card } from './types';

// ULTRA FAST hand analyzer - just indices, no evaluation!
export class HandAnalyzerUltraFast {
  private hand: Card[];
  
  constructor(hand: Card[]) {
    // Don't even sort! Just use as-is for speed
    this.hand = hand;
  }
  
  // Get hand encoding for state
  static encodeHand(hand: Card[]): string {
    // Just first 3 card ranks, no sorting
    return hand.slice(0, 3).map(c => c.r || 0).join(',');
  }
  
  // Get MINIMAL set of play indices - no evaluation!
  getMinimalOptions(): number[][] {
    const n = this.hand.length;
    if (n === 0) return [];
    
    const options: number[][] = [];
    
    // 1. Single cards (max 3 different ones)
    const added = new Set<number>();
    for (let i = 0; i < Math.min(n, 3); i++) {
      const rank = this.hand[i].r;
      if (!added.has(rank)) {
        added.add(rank);
        options.push([i]);
      }
    }
    
    // 2. Small plays (2-3 cards)
    if (n >= 2) {
      options.push([0, 1]); // First 2
      if (n > 2) {
        options.push([n-2, n-1]); // Last 2
      }
    }
    
    if (n >= 3) {
      options.push([0, 1, 2]); // First 3
    }
    
    // 3. Medium play (half)
    if (n >= 4) {
      const half = Math.floor(n / 2);
      const halfIndices = [];
      for (let i = 0; i < half; i++) halfIndices.push(i);
      options.push(halfIndices);
    }
    
    // 4. Large play (all but 1)
    if (n >= 3) {
      const most = [];
      for (let i = 0; i < n - 1; i++) most.push(i);
      options.push(most);
    }
    
    // 5. Full dump
    const all = [];
    for (let i = 0; i < n; i++) all.push(i);
    options.push(all);
    
    // MAX 10 OPTIONS!
    return options.slice(0, 10);
  }
  
  // Get cards for indices
  getCards(indices: number[]): Card[] {
    return indices.map(i => this.hand[i]);
  }
  
  // Simple action encoding
  static toAction(indices: number[]): string {
    return 'p' + indices.join('');
  }
}
