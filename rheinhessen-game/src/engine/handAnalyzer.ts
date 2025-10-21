import type { Card } from './types';
import { rawValue, sortCards } from './deck';
import { isLegalExact } from './evaluation';
import { scoreLegal, scoreIllegal } from './scoring';

export interface PlayOption {
  cards: Card[];
  indices: number[];  // Which cards from hand
  type: 'legal' | 'illegal';
  handType?: string;  // pair, trips, straight, etc.
  immediateValue: number;  // Points from this play
  rawValue: number;
  remainingCards: Card[];  // What's left in hand
  futureValue: number;  // Estimated value of remaining cards
  auditRisk: number;  // Risk if audited (for illegal plays)
  strategic: {
    keepsTrips: boolean;  // Preserves trips for audit
    buildsPotential: boolean;  // Keeps cards that could build better hand
    dumpsJunk: boolean;  // Gets rid of low-value singles
    savesHighCards: boolean;  // Keeps aces/kings
  };
}

export class HandAnalyzer {
  private hand: Card[];
  
  constructor(hand: Card[]) {
    this.hand = sortCards([...hand]);
  }
  
  // Get ALL possible plays (legal and illegal combinations)
  getAllOptions(): PlayOption[] {
    const options: PlayOption[] = [];
    const n = this.hand.length;
    
    // Generate all non-empty subsets
    for (let mask = 1; mask < (1 << n); mask++) {
      const indices: number[] = [];
      const subset: Card[] = [];
      
      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) {
          indices.push(i);
          subset.push(this.hand[i]);
        }
      }
      
      // Evaluate this subset as a play option
      const option = this.evaluatePlay(subset, indices);
      if (option) {
        options.push(option);
      }
    }
    
    return options;
  }
  
  // Get only legal play options
  getLegalOptions(): PlayOption[] {
    return this.getAllOptions().filter(opt => opt.type === 'legal');
  }
  
  // Get safe illegal options (under spike threshold)
  getSafeIllegalOptions(threshold = 26): PlayOption[] {
    return this.getAllOptions().filter(opt => 
      opt.type === 'illegal' && opt.rawValue <= threshold
    );
  }
  
  // Get audit-worthy hands (trips or better with value >= 24)
  getAuditOptions(): PlayOption[] {
    const options: PlayOption[] = [];
    
    // Check for trips
    const rankCounts = new Map<number, Card[]>();
    for (const card of this.hand) {
      const cards = rankCounts.get(card.r) || [];
      cards.push(card);
      rankCounts.set(card.r, cards);
    }
    
    // Find all trips combinations
    for (const [, cards] of rankCounts) {
      if (cards.length >= 3) {
        // Can make trips with these
        for (let i = 0; i < cards.length - 2; i++) {
          for (let j = i + 1; j < cards.length - 1; j++) {
            for (let k = j + 1; k < cards.length; k++) {
              const tripCards = [cards[i], cards[j], cards[k]];
              const indices = tripCards.map(c => this.hand.indexOf(c));
              const option = this.evaluatePlay(tripCards, indices);
              if (option && option.rawValue >= 24) {
                option.strategic.keepsTrips = false; // Used for audit
                options.push(option);
              }
            }
          }
        }
        
        // Check for quads too
        if (cards.length === 4) {
          const indices = cards.map(c => this.hand.indexOf(c));
          const option = this.evaluatePlay(cards, indices);
          if (option && option.rawValue >= 24) {
            options.push(option);
          }
        }
      }
    }
    
    return options;
  }
  
  private evaluatePlay(cards: Card[], indices: number[]): PlayOption | null {
    if (cards.length === 0) return null;
    
    const isLegal = isLegalExact(cards);
    const raw = rawValue(cards);
    
    // Calculate immediate value
    let immediateValue: number;
    if (isLegal) {
      immediateValue = scoreLegal(raw);
    } else {
      const result = scoreIllegal(raw);
      immediateValue = result.points;
    }
    
    // Get remaining cards
    const remainingCards = this.hand.filter((_, i) => !indices.includes(i));
    
    // Estimate future value of remaining cards
    const futureValue = this.estimateFutureValue(remainingCards);
    
    // Calculate audit risk for illegal plays
    const auditRisk = isLegal ? 0 : raw * 0.3; // Cost if audited (matches legal scoring)
    
    // Determine hand type for legal plays
    let handType: string | undefined;
    if (isLegal) {
      handType = this.identifyHandType(cards);
    }
    
    // Strategic analysis
    const strategic = this.analyzeStrategicValue(cards, remainingCards);
    
    return {
      cards,
      indices,
      type: isLegal ? 'legal' : 'illegal',
      handType,
      immediateValue,
      rawValue: raw,
      remainingCards,
      futureValue,
      auditRisk,
      strategic
    };
  }
  
  private identifyHandType(cards: Card[]): string {
    const sorted = sortCards(cards);
    const len = sorted.length;
    
    if (len === 2) {
      return 'pair';
    } else if (len === 3) {
      return 'trips';
    } else if (len === 4) {
      const ranks = sorted.map(c => c.r);
      if (ranks.every(r => r === ranks[0])) return 'quads';
      return 'two-pair';
    } else if (len === 5) {
      // Check for various 5-card hands
      if (this.isStraightFlush(sorted)) return 'straight-flush';
      if (this.isFullHouse(sorted)) return 'full-house';
      if (this.isFlush(sorted)) return 'flush';
      if (this.isStraight(sorted)) return 'straight';
    }
    
    return 'unknown';
  }
  
  private isStraight(cards: Card[]): boolean {
    if (cards.length !== 5) return false;
    for (let i = 1; i < cards.length; i++) {
      if (cards[i].r !== cards[i - 1].r + 1) {
        // Check for wheel
        if (i === 4 && cards[4].r === 14 && 
            cards[0].r === 2 && cards[1].r === 3 && 
            cards[2].r === 4 && cards[3].r === 5) {
          return true;
        }
        return false;
      }
    }
    return true;
  }
  
  private isFlush(cards: Card[]): boolean {
    if (cards.length !== 5) return false;
    return cards.every(c => c.s === cards[0].s);
  }
  
  private isStraightFlush(cards: Card[]): boolean {
    return this.isStraight(cards) && this.isFlush(cards);
  }
  
  private isFullHouse(cards: Card[]): boolean {
    if (cards.length !== 5) return false;
    const ranks = cards.map(c => c.r);
    const counts = new Map<number, number>();
    for (const r of ranks) {
      counts.set(r, (counts.get(r) || 0) + 1);
    }
    const values = Array.from(counts.values()).sort();
    return values.length === 2 && values[0] === 2 && values[1] === 3;
  }
  
  private estimateFutureValue(cards: Card[]): number {
    if (cards.length === 0) return 0;
    
    // Quick heuristic: check for potential legal hands
    let value = 0;
    
    // Check for pairs
    const rankCounts = new Map<number, number>();
    for (const card of cards) {
      rankCounts.set(card.r, (rankCounts.get(card.r) || 0) + 1);
    }
    
    // Value pairs and trips potential
    for (const [rank, count] of rankCounts) {
      if (count >= 2) {
        value += rank * 2 * 0.5; // Pair value
      }
      if (count >= 3) {
        value += rank * 3 * 0.5; // Trips value (audit potential)
      }
    }
    
    // Check for straight potential
    const sortedRanks = Array.from(new Set(cards.map(c => c.r))).sort((a, b) => a - b);
    for (let i = 0; i < sortedRanks.length - 2; i++) {
      if (sortedRanks[i + 2] - sortedRanks[i] <= 4) {
        value += 15; // Potential straight building
      }
    }
    
    // Value high cards
    for (const card of cards) {
      if (card.r >= 11) { // J, Q, K, A
        value += 3;
      }
    }
    
    return value;
  }
  
  private analyzeStrategicValue(played: Card[], remaining: Card[]): PlayOption['strategic'] {
    // Check if we're keeping trips for audit
    const remainingRanks = new Map<number, number>();
    for (const card of remaining) {
      remainingRanks.set(card.r, (remainingRanks.get(card.r) || 0) + 1);
    }
    
    const keepsTrips = Array.from(remainingRanks.values()).some(count => count >= 3);
    
    // Check if we're building potential (keeping consecutive ranks or same suits)
    const buildsPotential = this.hasBuildPotential(remaining);
    
    // Check if we're dumping low singles
    const playedSingles = played.filter(c => 
      played.filter(p => p.r === c.r).length === 1
    );
    const dumpsJunk = playedSingles.length > 0 && 
                      playedSingles.every(c => c.r <= 6);
    
    // Check if we're saving high cards
    const savesHighCards = remaining.some(c => c.r >= 13);
    
    return {
      keepsTrips,
      buildsPotential,
      dumpsJunk,
      savesHighCards
    };
  }
  
  private hasBuildPotential(cards: Card[]): boolean {
    if (cards.length < 3) return false;
    
    // Check for straight building potential
    const ranks = Array.from(new Set(cards.map(c => c.r))).sort((a, b) => a - b);
    for (let i = 0; i < ranks.length - 2; i++) {
      if (ranks[i + 2] - ranks[i] <= 4) return true;
    }
    
    // Check for flush building potential
    const suitCounts = new Map<string, number>();
    for (const card of cards) {
      suitCounts.set(card.s, (suitCounts.get(card.s) || 0) + 1);
    }
    if (Array.from(suitCounts.values()).some(count => count >= 3)) return true;
    
    // Check for full house potential (pair + different pair/trips)
    const rankCounts = new Map<number, number>();
    for (const card of cards) {
      rankCounts.set(card.r, (rankCounts.get(card.r) || 0) + 1);
    }
    const pairs = Array.from(rankCounts.values()).filter(count => count >= 2);
    if (pairs.length >= 2) return true;
    
    return false;
  }
  
  // Get best play for a specific strategy
  getBestForStrategy(strategy: 'maximize' | 'minimize' | 'safe' | 'aggressive'): PlayOption | null {
    const options = this.getAllOptions();
    if (options.length === 0) return null;
    
    switch (strategy) {
      case 'maximize':
        // Maximize immediate points
        return options.reduce((best, opt) => 
          opt.immediateValue > best.immediateValue ? opt : best
        );
      
      case 'minimize':
        // Play smallest valid option to save cards
        const legal = this.getLegalOptions();
        if (legal.length > 0) {
          return legal.reduce((best, opt) => 
            opt.cards.length < best.cards.length ? opt : best
          );
        }
        return null;
      
      case 'safe':
        // Prefer legal, then safe illegal
        const safeLegal = this.getLegalOptions();
        if (safeLegal.length > 0) {
          return safeLegal[0];
        }
        const safeIllegal = this.getSafeIllegalOptions();
        if (safeIllegal.length > 0) {
          return safeIllegal[0];
        }
        return null;
      
      case 'aggressive':
        // Go for high value even if risky
        const highValue = options.filter(opt => opt.rawValue >= 27);
        if (highValue.length > 0) {
          return highValue[0];
        }
        return this.getBestForStrategy('maximize');
    }
  }
}
