import type { MatchState, Card } from '../engine/types';
import type { PlayOption } from '../engine/handAnalyzer';
import { HandAnalyzer } from '../engine/handAnalyzer';
import { rawValue } from '../engine/deck';

// Define AIDecision type locally
interface AIDecision {
  doInternal: boolean;
  targetPlayer?: number;
  auditCards?: Card[];
  production: {
    type: 'legal' | 'illegal' | 'safe' | 'pass';
    cards?: Card[];
  };
}

// Simple crime calculation
function calculateCrime(player: any): number {
  if (!player.floorGroups) return rawValue(player.floor || []);
  return player.floorGroups
    .filter((g: any) => g.type === 'illegal')
    .reduce((sum: number, g: any) => sum + g.rawValue, 0);
}

// Enhanced action that includes specific cards
export type GranularAction = {
  type: 'play' | 'audit' | 'pass';
  cards?: Card[];  // Specific cards to play
  targetPlayer?: number;  // For audit
  strategy?: 'aggressive' | 'conservative' | 'balanced';
};

// More detailed state features for granular decisions
interface GranularStateFeatures {
  // Hand composition
  handSize: number;
  legalOptions: number;  // Number of legal plays available
  illegalOptions: number;
  bestLegalValue: number;
  bestIllegalValue: number;
  hasTrips: boolean;
  hasPairs: number;
  hasHighCards: number;  // A, K, Q, J
  
  // Strategic options
  canBuildStraight: boolean;
  canBuildFlush: boolean;
  canKeepTripsForAudit: boolean;
  
  // Game state
  myScore: number;
  opponentMaxScore: number;
  auditTrack: number;
  turnNumber: number;
  
  // Opponent vulnerability
  maxOpponentCrime: number;
  bestAuditTarget: number;
  auditProfit: number;
}

export class GranularLearningAgent {
  private qTable: Map<string, Map<string, number>> = new Map();
  private epsilon: number;
  private alpha: number;
  private gamma: number;
  private name: string;
  
  
  // Stats tracking
  private stats = {
    episodesCompleted: 0,
    gamesWon: 0,
    totalScore: 0,
    decisionsExplored: 0,
    decisionsExploited: 0
  };
  
  constructor(name: string, epsilon = 0.3, alpha = 0.1, gamma = 0.95) {
    this.name = name;
    this.epsilon = epsilon;
    this.alpha = alpha;
    this.gamma = gamma;
  }
  
  decide(state: MatchState, playerId: number): AIDecision {
    const player = state.players[playerId];
    const analyzer = new HandAnalyzer(player.hand);
    
    // Get all possible play options
    const allOptions = analyzer.getAllOptions();
    const legalOptions = analyzer.getLegalOptions();
    const auditOptions = analyzer.getAuditOptions();
    
    // Extract features for state
    const features = this.extractFeatures(state, playerId, allOptions);
    const stateKey = this.stateToKey(features);
    
    // Generate possible actions (specific card combinations)
    const possibleActions: GranularAction[] = [];
    
    // Add all legal play options
    for (const option of legalOptions) {
      possibleActions.push({
        type: 'play',
        cards: option.cards,
        strategy: this.classifyStrategy(option)
      });
    }
    
    // Add select illegal options (not all to limit action space)
    const topIllegal = this.selectTopIllegalOptions(allOptions.filter(o => o.type === 'illegal'));
    for (const option of topIllegal) {
      possibleActions.push({
        type: 'play',
        cards: option.cards,
        strategy: this.classifyStrategy(option)
      });
    }
    
    // Add audit options if available
    if (auditOptions.length > 0) {
      for (const opponent of state.players) {
        if (opponent.id === playerId) continue;
        const crime = calculateCrime(opponent);
        if (crime > 10) {  // Worth auditing
          possibleActions.push({
            type: 'audit',
            cards: auditOptions[0].cards,  // Use cheapest audit cards
            targetPlayer: opponent.id
          });
        }
      }
    }
    
    // Always can pass
    possibleActions.push({ type: 'pass' });
    
    // Choose action using epsilon-greedy
    let selectedAction: GranularAction;
    
    if (Math.random() < this.epsilon) {
      // Explore: random action
      selectedAction = possibleActions[Math.floor(Math.random() * possibleActions.length)];
      this.stats.decisionsExplored++;
    } else {
      // Exploit: use Q-values
      selectedAction = this.selectBestAction(stateKey, possibleActions);
      this.stats.decisionsExploited++;
    }
    
    // Convert to AIDecision
    return this.actionToDecision(selectedAction, state, playerId);
  }
  
  private extractFeatures(
    state: MatchState, 
    playerId: number, 
    options: PlayOption[]
  ): GranularStateFeatures {
    const player = state.players[playerId];
    const opponents = state.players.filter(p => p.id !== playerId);
    
    // Count hand characteristics
    const rankCounts = new Map<number, number>();
    for (const card of player.hand) {
      rankCounts.set(card.r, (rankCounts.get(card.r) || 0) + 1);
    }
    
    const pairs = Array.from(rankCounts.values()).filter(c => c >= 2).length;
    const hasTrips = Array.from(rankCounts.values()).some(c => c >= 3);
    const highCards = player.hand.filter(c => c.r >= 11).length;
    
    // Analyze options
    const legalOptions = options.filter(o => o.type === 'legal');
    const bestLegal = legalOptions.length > 0 ? 
      Math.max(...legalOptions.map(o => o.immediateValue)) : 0;
    const bestIllegal = Math.max(...options.filter(o => o.type === 'illegal')
      .map(o => o.immediateValue));
    
    // Check building potential
    const canBuildStraight = this.checkStraightPotential(player.hand);
    const canBuildFlush = this.checkFlushPotential(player.hand);
    const canKeepTripsForAudit = options.some(o => o.strategic.keepsTrips);
    
    // Game state
    const maxOpponentScore = Math.max(...opponents.map(o => o.score));
    const maxOpponentCrime = Math.max(...opponents.map(o => calculateCrime(o)));
    
    // Audit analysis
    let bestAuditTarget = -1;
    let auditProfit = 0;
    
    if (hasTrips) {
      for (const opp of opponents) {
        const crime = calculateCrime(opp);
        const profit = crime - (rankCounts.get(player.hand[0].r)! * 3 * 0.5);
        if (profit > auditProfit) {
          auditProfit = profit;
          bestAuditTarget = opp.id;
        }
      }
    }
    
    return {
      handSize: player.hand.length,
      legalOptions: legalOptions.length,
      illegalOptions: options.filter(o => o.type === 'illegal').length,
      bestLegalValue: bestLegal,
      bestIllegalValue: bestIllegal,
      hasTrips,
      hasPairs: pairs,
      hasHighCards: highCards,
      canBuildStraight,
      canBuildFlush,
      canKeepTripsForAudit,
      myScore: player.score,
      opponentMaxScore: maxOpponentScore,
      auditTrack: state.auditTrack,
      turnNumber: 0,  // Not tracked in state currently
      maxOpponentCrime,
      bestAuditTarget,
      auditProfit
    };
  }
  
  private checkStraightPotential(hand: Card[]): boolean {
    const ranks = Array.from(new Set(hand.map(c => c.r))).sort((a, b) => a - b);
    for (let i = 0; i < ranks.length - 2; i++) {
      if (ranks[i + 2] - ranks[i] <= 4) return true;
    }
    return false;
  }
  
  private checkFlushPotential(hand: Card[]): boolean {
    const suitCounts = new Map<string, number>();
    for (const card of hand) {
      suitCounts.set(card.s, (suitCounts.get(card.s) || 0) + 1);
    }
    return Array.from(suitCounts.values()).some(count => count >= 3);
  }
  
  private classifyStrategy(option: PlayOption): 'aggressive' | 'conservative' | 'balanced' {
    if (option.rawValue >= 27) return 'aggressive';
    if (option.type === 'legal' || option.rawValue <= 20) return 'conservative';
    return 'balanced';
  }
  
  private selectTopIllegalOptions(illegal: PlayOption[], maxOptions = 3): PlayOption[] {
    // Select diverse illegal options to limit action space
    const result: PlayOption[] = [];
    
    // Get best low-risk option
    const safe = illegal.filter(o => o.rawValue <= 26);
    if (safe.length > 0) {
      result.push(safe.reduce((best, o) => 
        o.immediateValue > best.immediateValue ? o : best));
    }
    
    // Get best high-risk option
    const aggressive = illegal.filter(o => o.rawValue > 26);
    if (aggressive.length > 0) {
      result.push(aggressive[0]);
    }
    
    // Get option that preserves most future value
    if (illegal.length > 0) {
      const bestFuture = illegal.reduce((best, o) => 
        o.futureValue > best.futureValue ? o : best);
      if (!result.includes(bestFuture)) {
        result.push(bestFuture);
      }
    }
    
    return result.slice(0, maxOptions);
  }
  
  private stateToKey(features: GranularStateFeatures): string {
    // Discretize continuous features
    const d = (val: number, buckets: number[]): number => {
      for (let i = 0; i < buckets.length; i++) {
        if (val <= buckets[i]) return i;
      }
      return buckets.length;
    };
    
    return [
      d(features.handSize, [3, 5, 7]),
      d(features.legalOptions, [0, 1, 3]),
      d(features.bestLegalValue, [0, 10, 20, 30]),
      d(features.bestIllegalValue, [0, 15, 25, 35]),
      features.hasTrips ? 1 : 0,
      d(features.hasPairs, [0, 1, 2]),
      features.canKeepTripsForAudit ? 1 : 0,
      d(features.myScore, [50, 100, 150, 200, 250]),
      d(features.opponentMaxScore, [50, 100, 150, 200, 250]),
      d(features.auditTrack, [0, 2, 4]),
      d(features.maxOpponentCrime, [0, 20, 40]),
      d(features.auditProfit, [-20, 0, 20])
    ].join('-');
  }
  
  private actionToKey(action: GranularAction): string {
    if (action.type === 'pass') return 'pass';
    if (action.type === 'audit') return `audit-${action.targetPlayer}`;
    
    // For play actions, encode key properties
    const cardCount = action.cards?.length || 0;
    const value = action.cards ? rawValue(action.cards) : 0;
    return `play-${cardCount}-${Math.floor(value / 5) * 5}-${action.strategy}`;
  }
  
  private selectBestAction(stateKey: string, actions: GranularAction[]): GranularAction {
    let bestAction = actions[0];
    let bestValue = -Infinity;
    
    const stateQ = this.qTable.get(stateKey);
    if (!stateQ) {
      // No Q-values yet, use heuristic
      return this.selectHeuristicAction(actions);
    }
    
    for (const action of actions) {
      const actionKey = this.actionToKey(action);
      const qValue = stateQ.get(actionKey) || 0;
      
      if (qValue > bestValue) {
        bestValue = qValue;
        bestAction = action;
      }
    }
    
    // Add small randomness for tie-breaking
    if (bestValue === 0) {
      const tied = actions.filter(a => {
        const key = this.actionToKey(a);
        return (stateQ.get(key) || 0) === bestValue;
      });
      if (tied.length > 1 && Math.random() < 0.1) {
        bestAction = tied[Math.floor(Math.random() * tied.length)];
      }
    }
    
    return bestAction;
  }
  
  private selectHeuristicAction(actions: GranularAction[]): GranularAction {
    // Simple heuristic when no Q-values exist
    const playActions = actions.filter(a => a.type === 'play');
    
    if (playActions.length > 0) {
      // Prefer balanced strategy initially
      const balanced = playActions.filter(a => a.strategy === 'balanced');
      if (balanced.length > 0) return balanced[0];
      
      const conservative = playActions.filter(a => a.strategy === 'conservative');
      if (conservative.length > 0) return conservative[0];
      
      return playActions[0];
    }
    
    return actions[0];  // Fallback
  }
  
  private actionToDecision(action: GranularAction, state: MatchState, playerId: number): AIDecision {
    switch (action.type) {
      case 'pass':
        return { doInternal: false, production: { type: 'pass' } };
      
      case 'audit':
        return {
          doInternal: true,
          targetPlayer: action.targetPlayer!,
          auditCards: action.cards!,
          production: { type: 'pass' }
        };
      
      case 'play':
        const cards = action.cards!;
        const player = state.players[playerId];
        const analyzer = new HandAnalyzer(player.hand);
        const options = analyzer.getAllOptions();
        const option = options.find(o => 
          o.cards.length === cards.length &&
          o.cards.every(c => cards.some(pc => pc.r === c.r && pc.s === c.s))
        );
        
        if (!option) {
          return { doInternal: false, production: { type: 'pass' } };
        }
        
        return {
          doInternal: false,
          production: {
            type: option.type === 'legal' ? 'legal' : 
                  option.rawValue <= 26 ? 'safe' : 'illegal',
            cards: option.cards
          }
        };
    }
  }
  
  // Update Q-values after seeing the result
  public learn(
    state: MatchState,
    playerId: number,
    action: GranularAction,
    reward: number,
    nextState: MatchState | null
  ) {
    const player = state.players[playerId];
    const analyzer = new HandAnalyzer(player.hand);
    const options = analyzer.getAllOptions();
    const features = this.extractFeatures(state, playerId, options);
    const stateKey = this.stateToKey(features);
    const actionKey = this.actionToKey(action);
    
    // Get or create Q-value
    if (!this.qTable.has(stateKey)) {
      this.qTable.set(stateKey, new Map());
    }
    const stateQ = this.qTable.get(stateKey)!;
    const oldQ = stateQ.get(actionKey) || 0;
    
    // Calculate future value
    let futureQ = 0;
    if (nextState) {
      const nextPlayer = nextState.players[playerId];
      const nextAnalyzer = new HandAnalyzer(nextPlayer.hand);
      const nextOptions = nextAnalyzer.getAllOptions();
      const nextFeatures = this.extractFeatures(nextState, playerId, nextOptions);
      const nextStateKey = this.stateToKey(nextFeatures);
      
      if (this.qTable.has(nextStateKey)) {
        const nextStateQ = this.qTable.get(nextStateKey)!;
        futureQ = Math.max(...Array.from(nextStateQ.values()));
      }
    }
    
    // Q-learning update
    const newQ = oldQ + this.alpha * (reward + this.gamma * futureQ - oldQ);
    stateQ.set(actionKey, newQ);
  }
  
  // Decay exploration rate
  public updateExploration(episodes: number) {
    // More gradual exploration decay
    this.epsilon = Math.max(0.05, 0.5 * Math.pow(0.995, episodes));
  }
  
  // Get insights about current strategy
  public getInsights(): string[] {
    const insights: string[] = [];
    
    insights.push(`Granular Agent: ${this.name}`);
    insights.push(`Episodes: ${this.stats.episodesCompleted}`);
    insights.push(`Win Rate: ${((this.stats.gamesWon / Math.max(1, this.stats.episodesCompleted)) * 100).toFixed(1)}%`);
    insights.push(`Avg Score: ${(this.stats.totalScore / Math.max(1, this.stats.episodesCompleted)).toFixed(0)}`);
    insights.push(`Exploration: ${(this.epsilon * 100).toFixed(1)}%`);
    insights.push(`Q-Table States: ${this.qTable.size}`);
    
    // Calculate action diversity
    let totalActions = 0;
    let uniqueActions = new Set<string>();
    for (const stateQ of this.qTable.values()) {
      for (const actionKey of stateQ.keys()) {
        totalActions++;
        uniqueActions.add(actionKey);
      }
    }
    insights.push(`Action Diversity: ${uniqueActions.size} unique actions`);
    
    // Find most valuable actions
    let topActions: Array<[string, number]> = [];
    for (const stateQ of this.qTable.values()) {
      for (const [action, value] of stateQ.entries()) {
        topActions.push([action, value]);
      }
    }
    topActions.sort((a, b) => b[1] - a[1]);
    
    if (topActions.length > 0) {
      insights.push(`Top Strategy: ${topActions[0][0]} (Q=${topActions[0][1].toFixed(1)})`);
    }
    
    return insights;
  }
  
  // Episode completion
  public episodeComplete(won: boolean, finalScore: number) {
    this.stats.episodesCompleted++;
    if (won) this.stats.gamesWon++;
    this.stats.totalScore += finalScore;
  }
  
  // Export/import for saving
  public exportKnowledge() {
    return {
      qTable: Array.from(this.qTable.entries()).map(([state, actions]) => ({
        state,
        actions: Array.from(actions.entries())
      })),
      stats: this.stats,
      epsilon: this.epsilon,
      alpha: this.alpha,
      gamma: this.gamma,
      name: this.name
    };
  }
  
  public importKnowledge(data: any) {
    if (data.qTable) {
      this.qTable.clear();
      for (const entry of data.qTable) {
        this.qTable.set(entry.state, new Map(entry.actions));
      }
    }
    if (data.stats) this.stats = data.stats;
    if (data.epsilon !== undefined) this.epsilon = data.epsilon;
    if (data.alpha !== undefined) this.alpha = data.alpha;
    if (data.gamma !== undefined) this.gamma = data.gamma;
    if (data.name) this.name = data.name;
  }
}
