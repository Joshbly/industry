import type { Card } from './types';
import { rawValue, sortCards } from './deck';
import { isLegalExact } from './evaluation';

// Pattern-based play representation
export interface PlayPattern {
  type: 'single' | 'pair' | 'trips' | 'quads' | 'run' | 'multi' | 'dump';
  indices: number[];  // Which cards to play from sorted hand
  count: number;      // Number of cards
}

export interface PlayOption {
  cards: Card[];
  pattern: PlayPattern;
  type: 'legal' | 'illegal';
  rawValue: number;
  strategic: {
    keepsTrips: boolean;
    buildsPotential: boolean;
  };
}

export class HandAnalyzerOptimized {
  private hand: Card[];
  private rankCounts: Map<number, number[]> = new Map(); // rank -> indices
  
  constructor(hand: Card[]) {
    this.hand = sortCards([...hand]);
    this.buildRankMap();
  }
  
  private buildRankMap() {
    this.hand.forEach((card, idx) => {
      if (!this.rankCounts.has(card.r)) {
        this.rankCounts.set(card.r, []);
      }
      this.rankCounts.get(card.r)!.push(idx);
    });
  }
  
  // Get hand encoding for state representation
  static encodeHand(hand: Card[]): string {
    const sorted = sortCards([...hand]);
    // Encode as comma-separated ranks (max 10 cards to keep state space reasonable)
    const ranks = sorted.slice(0, 10).map(c => c.r);
    // Pad with zeros for consistent length
    while (ranks.length < 10) ranks.push(0 as any);
    return ranks.join(',');
  }
  
  // Generate smart patterns instead of all combinations
  getPatternOptions(): PlayOption[] {
    const options: PlayOption[] = [];
    
    // 1. Singles (limit to distinct ranks to avoid explosion)
    const addedSingles = new Set<number>();
    for (const [rank, indices] of this.rankCounts) {
      if (!addedSingles.has(rank)) {
        addedSingles.add(rank);
        const pattern: PlayPattern = { type: 'single', indices: [indices[0]], count: 1 };
        options.push(this.evaluatePattern(pattern));
      }
    }
    
    // 2. Pairs
    for (const [, indices] of this.rankCounts) {
      if (indices.length >= 2) {
        const pattern: PlayPattern = { type: 'pair', indices: [indices[0], indices[1]], count: 2 };
        options.push(this.evaluatePattern(pattern));
      }
    }
    
    // 3. Trips
    for (const [, indices] of this.rankCounts) {
      if (indices.length >= 3) {
        const pattern: PlayPattern = { type: 'trips', indices: indices.slice(0, 3), count: 3 };
        options.push(this.evaluatePattern(pattern));
      }
    }
    
    // 4. Quads
    for (const [, indices] of this.rankCounts) {
      if (indices.length === 4) {
        const pattern: PlayPattern = { type: 'quads', indices, count: 4 };
        options.push(this.evaluatePattern(pattern));
      }
    }
    
    // 5. Small dumps (2-3 cards of mixed ranks, <27 total)
    this.addSmallDumps(options, 2);
    this.addSmallDumps(options, 3);
    
    // 6. Medium dumps (4-5 cards)
    if (this.hand.length >= 4) {
      this.addMediumDumps(options, 4);
    }
    if (this.hand.length >= 5) {
      this.addMediumDumps(options, 5);
    }
    
    // 7. Large dumps (6+ cards, including full hand)
    if (this.hand.length >= 6) {
      // Half hand
      const halfSize = Math.floor(this.hand.length / 2);
      const halfIndices = Array.from({ length: halfSize }, (_, i) => i);
      const halfPattern: PlayPattern = { type: 'dump', indices: halfIndices, count: halfSize };
      options.push(this.evaluatePattern(halfPattern));
      
      // Most of hand (keep 1-2 cards)
      if (this.hand.length > 3) {
        const mostIndices = Array.from({ length: this.hand.length - 2 }, (_, i) => i);
        const mostPattern: PlayPattern = { type: 'dump', indices: mostIndices, count: mostIndices.length };
        options.push(this.evaluatePattern(mostPattern));
      }
    }
    
    // 8. Full dump (all cards)
    if (this.hand.length > 0) {
      const allIndices = Array.from({ length: this.hand.length }, (_, i) => i);
      const fullPattern: PlayPattern = { type: 'dump', indices: allIndices, count: this.hand.length };
      options.push(this.evaluatePattern(fullPattern));
    }
    
    // 9. Two-pair combinations
    const pairs: [number, number[]][] = [];
    for (const [rank, indices] of this.rankCounts) {
      if (indices.length >= 2) {
        pairs.push([rank, indices]);
      }
    }
    
    for (let i = 0; i < pairs.length; i++) {
      for (let j = i + 1; j < pairs.length; j++) {
        const indices = [...pairs[i][1].slice(0, 2), ...pairs[j][1].slice(0, 2)];
        const pattern: PlayPattern = { type: 'multi', indices, count: 4 };
        options.push(this.evaluatePattern(pattern));
      }
    }
    
    // 10. Straights (simplified - just check 5-card runs)
    this.addStraights(options);
    
    return options;
  }
  
  private addSmallDumps(options: PlayOption[], size: number) {
    if (this.hand.length < size) return;
    
    // Try a few strategic small combinations
    // Low cards
    const lowIndices = Array.from({ length: size }, (_, i) => i);
    const lowPattern: PlayPattern = { type: 'dump', indices: lowIndices, count: size };
    const lowOption = this.evaluatePattern(lowPattern);
    if (lowOption.rawValue <= 26) { // Safe zone
      options.push(lowOption);
    }
    
    // High cards
    const highIndices = Array.from({ length: size }, (_, i) => this.hand.length - size + i);
    const highPattern: PlayPattern = { type: 'dump', indices: highIndices, count: size };
    options.push(this.evaluatePattern(highPattern));
  }
  
  private addMediumDumps(options: PlayOption[], size: number) {
    if (this.hand.length < size) return;
    
    // Sample a few medium-sized combinations
    const indices = Array.from({ length: size }, (_, i) => i);
    const pattern: PlayPattern = { type: 'dump', indices, count: size };
    options.push(this.evaluatePattern(pattern));
    
    // Also try from the end
    const endIndices = Array.from({ length: size }, (_, i) => this.hand.length - size + i);
    const endPattern: PlayPattern = { type: 'dump', indices: endIndices, count: size };
    options.push(this.evaluatePattern(endPattern));
  }
  
  private addStraights(options: PlayOption[]) {
    if (this.hand.length < 5) return;
    
    // Check for 5-card straights
    const ranks = new Set(this.hand.map(c => c.r));
    
    for (let startRank = 1; startRank <= 9; startRank++) {
      const neededRanks = [startRank, startRank + 1, startRank + 2, startRank + 3, startRank + 4];
      if (neededRanks.every(r => ranks.has(r as any))) {
        // Found a straight, get the indices
        const indices: number[] = [];
        for (const rank of neededRanks) {
          const idx = this.hand.findIndex(c => c.r === rank && !indices.includes(this.hand.indexOf(c)));
          if (idx !== -1) indices.push(idx);
        }
        
        if (indices.length === 5) {
          const pattern: PlayPattern = { type: 'run', indices, count: 5 };
          options.push(this.evaluatePattern(pattern));
        }
      }
    }
  }
  
  private evaluatePattern(pattern: PlayPattern): PlayOption {
    const cards = pattern.indices.map(i => this.hand[i]);
    const isLegal = isLegalExact(cards);
    const raw = rawValue(cards);
    
    // Check strategic value
    const remaining = this.hand.filter((_, i) => !pattern.indices.includes(i));
    const keepsTrips = this.hasTrips(remaining);
    const buildsPotential = this.hasPotential(remaining);
    
    return {
      cards,
      pattern,
      type: isLegal ? 'legal' : 'illegal',
      rawValue: raw,
      strategic: {
        keepsTrips,
        buildsPotential
      }
    };
  }
  
  private hasTrips(cards: Card[]): boolean {
    const counts = new Map<number, number>();
    for (const card of cards) {
      counts.set(card.r, (counts.get(card.r) || 0) + 1);
    }
    return Array.from(counts.values()).some(c => c >= 3);
  }
  
  private hasPotential(cards: Card[]): boolean {
    const counts = new Map<number, number>();
    for (const card of cards) {
      counts.set(card.r, (counts.get(card.r) || 0) + 1);
    }
    // Has pairs that could become trips
    return Array.from(counts.values()).some(c => c === 2);
  }
  
  // Convert pattern to action string
  static patternToAction(pattern: PlayPattern): string {
    // Encode as pattern type and indices
    return `play-${pattern.type}-${pattern.indices.join('')}`;
  }
  
  // Get all options (for compatibility)
  getAllOptions(): PlayOption[] {
    return this.getPatternOptions();
  }
}
