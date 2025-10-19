import type { MatchState, Card } from '../engine/types';
import { bestLegalGreedy, bestSafeIllegalGreedy, getHandType } from '../engine/evaluation';
import { calculateTaxedValue } from '../engine/scoring';
import { rawValue } from '../engine/deck';
import { reorganizeGreedy } from '../engine/audits';
import type { AIDecision } from './personas';

// State features for Q-learning - EXPANDED for granular decision-making
interface StateFeatures {
  // Hand composition (11 features)
  handSize: number;
  numPairs: number;
  numTrips: number; 
  numStraightDraws: number;  // Cards away from straight
  numFlushDraws: number;      // Cards in same suit
  highestRank: number;        // A=14, K=13, etc
  lowestRank: number;
  rankSpread: number;         // Highest - lowest
  suitDiversity: number;      // Number of unique suits
  hasAce: boolean;
  hasKing: boolean;
  
  // Legal hand potential (8 features)
  hasLegal: boolean;
  hasTripsPlus: boolean;
  hasStraight: boolean;
  hasFlush: boolean;
  hasFullHouse: boolean;
  bestLegalRaw: number;
  bestLegalTaxed: number;
  numLegalOptions: number;    // Different legal hands available
  
  // Illegal hand analysis (6 features)
  bestSafeRaw: number;
  bestSafeTaxed: number;
  bestDumpRaw: number;        // Full hand dump value
  wouldTriggerExternal: boolean;  // If played now
  ticksWouldAdd: number;      // 0, 1, or 2
  kickbackAmount: number;     // Potential kickback
  
  // My position (8 features)
  myScore: number;
  myScoreRank: number;        // 1st, 2nd, 3rd, 4th
  pointsBehindLeader: number;
  pointsAheadOfLast: number;
  myFloorCrime: number;
  myFloorCardCount: number;
  myAuditHistory: number;     // Times I've been audited
  myProductionCount: number;  // Total productions made
  
  // Individual opponent analysis (12 features - 4 per opponent)
  opp1Score: number;
  opp1FloorCrime: number;
  opp1HandSize: number;
  opp1RecentAction: number;   // 0=pass, 1=legal, 2=illegal, 3=audit
  
  opp2Score: number;
  opp2FloorCrime: number;
  opp2HandSize: number;
  opp2RecentAction: number;
  
  opp3Score: number;
  opp3FloorCrime: number;
  opp3HandSize: number;
  opp3RecentAction: number;
  
  // Audit dynamics (8 features)
  auditTrack: number;         // Current track value
  auditMomentum: number;      // Recent tick rate
  turnsUntilExternal: number; // Estimated
  lastAuditTurnsAgo: number;
  highestCrimeFloor: number;  // Max opponent floor value
  crimeFloorOwner: number;    // Which player has it
  totalTableCrime: number;    // Sum of all floor crimes
  externalRisk: number;       // 0-1 probability estimate
  
  // Hanging value - Audit profit potential (10 features)
  hasValidAuditHand: boolean; // Can I audit someone now?
  myAuditHandValue: number;   // Taxed value of my best audit hand
  myVulnerability: number;    // How much could I lose if audited
  opp1HangingValue: number;   // Net profit if I audit opponent 1
  opp2HangingValue: number;   // Net profit if I audit opponent 2  
  opp3HangingValue: number;   // Net profit if I audit opponent 3
  bestAuditTarget: number;    // Player ID with highest hanging value
  maxHangingValue: number;    // Maximum potential audit profit
  totalHangingValue: number;  // Sum of all positive hanging values
  auditProfitRatio: number;   // Max hanging value / my audit hand cost
  
  // Game phase (6 features)
  turnNumber: number;
  deckRemaining: number;
  estimatedTurnsLeft: number;
  gamePhase: number;          // 0=early, 1=mid, 2=late, 3=final
  scoringPace: number;        // Avg points per turn
  isEndgame: boolean;         // < 5 turns left
  
  // Strategic indicators (8 features)
  canBlockLeader: boolean;    // Can audit the leader
  canEscapeBottom: boolean;   // Can get out of last place
  shouldDump: boolean;        // Hand quality suggests dumping
  shouldRace: boolean;        // Behind and need points
  shouldDefend: boolean;      // Leading and need to maintain
  auditValueRatio: number;    // My floor crime / max opponent
  scoreGap: number;           // Leader score - last place score
  volatility: number;         // Recent score change rate
  
  // Card counting hints (6 features)
  acesPlayed: number;
  kingsPlayed: number;
  queensPlayed: number;
  highCardsRemaining: number; // 10+ cards left
  lowCardsRemaining: number;  // 2-5 cards left
  suitBalance: number;        // Std dev of suit distributions
}

// Possible actions
type Action = 
  | 'play-legal'
  | 'play-safe'
  | 'play-dump'
  | 'audit-highest'
  | 'pass';

// Configuration for agent behavior
export interface AgentConfig {
  epsilon?: number;      // Exploration rate (0.1 to 0.5)
  alpha?: number;        // Learning rate (0.05 to 0.2)
  gamma?: number;        // Discount factor (0.9 to 0.99)
  rewardWeights?: {
    pointGain?: number;
    winBonus?: number;
    positionBonus?: number;
    illegalPenalty?: number;
    auditPenalty?: number;
    auditReward?: number;
  };
  name?: string;         // For tracking different agents
}

// Q-learning agent
export class LearningAgent {
  private qTable: Map<string, Map<Action, number>> = new Map();
  private epsilon: number; // Exploration rate
  private alpha: number; // Learning rate  
  private gamma: number; // Discount factor
  public name: string;
  
  // Turn history for calculating momentum and recent actions
  private turnHistory: Array<{
    turnNumber: number;
    playerId: number;
    action: 'pass' | 'legal' | 'illegal' | 'audit';
    scoreChange: number;
    auditTicksAdded: number;
  }> = [];
  
  // Training stats
  public stats = {
    gamesPlayed: 0,        // Total game participations (episodes * players using this agent)
    gamesWon: 0,           // Games where this agent won
    totalScore: 0,         // Cumulative score across all games
    avgScore: 0,           // Average score per game
    winRate: 0,            // Win percentage
    exploration: 0.3,      // Current exploration rate (epsilon)
    episodesCompleted: 0   // Training episodes/matches completed
  };
  
  // Track which games we've already counted to avoid double-counting
  private countedGames = new Set<string>();
  private currentGameId: string | null = null;

  // Reward weights - SAVAGE WILDMAN MODE
  private rewards = {
    pointGain: 1.0,        // Every point MATTERS - scoring is the path to victory!
    winGame: 300,          // Big win bonus (= 300 points worth)
    loseGame: 0,           // No punishment for losing, just no win bonus
    avoidExternal: 5,      // Small bonus for dodging external
    causeExternal: -50,    // BIG penalty - this actually hurts you
    successfulAudit: 30,   // Good tactical move (= 30 points worth)
    position2nd: 50,       // Good effort bonus
    position3rd: 10,       // Participation trophy
    position4th: 0,        // No punishment - removes fear!
    spike: -2,             // Minor penalty for audit track ticks
    cleanProduction: 3,    // Small bonus for legal plays
    blockLeaderAudit: 50,  // Strategic bonus for targeting leader
    preventWin: 100,       // Important defensive play
    aggressiveBonus: 15,   // Reward for high-value illegal plays
    leadMaintenance: 0.5,  // Bonus per point ahead of 2nd place
    strategicPass: 8,      // Reward for passing with weak hand to build better
    megaHandBonus: 25,     // MEGA BONUS for full house, quads, straight flush!
    handBuilding: 12       // Reward for improving hand after passing
  };

  constructor(config: AgentConfig = {}) {
    // Apply configuration
    this.epsilon = config.epsilon ?? 0.3;
    this.alpha = config.alpha ?? 0.15;  // Faster learning for aggressive play
    this.gamma = config.gamma ?? 0.97;   // Strong long-term thinking
    this.name = config.name ?? 'Learner';
    
    // Apply reward weight overrides
    if (config.rewardWeights) {
      this.rewards.pointGain = config.rewardWeights.pointGain ?? this.rewards.pointGain;
      this.rewards.winGame = config.rewardWeights.winBonus ?? this.rewards.winGame;
      this.rewards.position2nd = config.rewardWeights.positionBonus ?? this.rewards.position2nd;
      this.rewards.spike = config.rewardWeights.illegalPenalty ?? this.rewards.spike;
      this.rewards.causeExternal = config.rewardWeights.auditPenalty ?? this.rewards.causeExternal;
      this.rewards.successfulAudit = config.rewardWeights.auditReward ?? this.rewards.successfulAudit;
    }
    
    this.stats.exploration = this.epsilon;
    this.loadFromStorage();
  }

  // Extract features from game state
  private extractFeatures(state: MatchState, playerId: number): StateFeatures {
    const player = state.players[playerId];
    const opponents = state.players.filter(p => p.id !== playerId);
    const legal = bestLegalGreedy(player.hand);
    const safe = bestSafeIllegalGreedy(player.hand, 26);
    
    // Hand composition analysis
    const rankCounts = new Map<number, number>();
    const suitCounts = new Map<string, number>();
    const ranks: number[] = [];
    
    player.hand.forEach(card => {
      const rank = card.r; // Already a number: 14=A, 13=K, 12=Q, 11=J
      rankCounts.set(rank, (rankCounts.get(rank) || 0) + 1);
      suitCounts.set(card.s, (suitCounts.get(card.s) || 0) + 1);
      ranks.push(rank);
    });
    
    const numPairs = Array.from(rankCounts.values()).filter(c => c === 2).length;
    const numTrips = Array.from(rankCounts.values()).filter(c => c === 3).length;
    const highestRank = ranks.length > 0 ? Math.max(...ranks) : 0;
    const lowestRank = ranks.length > 0 ? Math.min(...ranks) : 0;
    
    // Check straight draws (simplified - cards needed for straight)
    const sortedRanks = [...new Set(ranks)].sort((a, b) => a - b);
    let numStraightDraws = 5; // Default worst case
    for (let i = 0; i <= sortedRanks.length - 3; i++) {
      const gap = sortedRanks[i + 2] - sortedRanks[i];
      if (gap <= 4) numStraightDraws = Math.min(numStraightDraws, 5 - 3);
    }
    
    // Check flush draws
    const maxSuitCount = Math.max(...Array.from(suitCounts.values()), 0);
    const numFlushDraws = Math.max(0, 5 - maxSuitCount);
    
    // Check legal hand types
    let hasTripsPlus = false;
    let hasStraight = false;
    let hasFlush = false;
    let hasFullHouse = false;
    let numLegalOptions = 0;
    
    if (legal) {
      const handType = getHandType(legal.cards);
      hasTripsPlus = ['trips', 'straight', 'flush', 'full-house', 'quads', 'straight-flush'].includes(handType);
      hasStraight = handType === 'straight' || handType === 'straight-flush';
      hasFlush = handType === 'flush' || handType === 'straight-flush';
      hasFullHouse = handType === 'full-house';
      if (calculateTaxedValue(legal.raw) >= 12) numLegalOptions++;
    }
    
    // Illegal hand analysis
    const dumpRaw = rawValue(player.hand);
    const wouldTriggerExternal = state.auditTrack >= 3 && dumpRaw >= 27;
    const ticksWouldAdd = dumpRaw >= 27 ? (state.auditTrack >= 3 && dumpRaw >= 25 ? 2 : 1) : 0;
    const kickbackAmount = dumpRaw >= 27 ? 5 : 0;
    
    // Position analysis
    const sortedScores = [...state.players].sort((a, b) => b.score - a.score);
    const myScoreRank = sortedScores.findIndex(p => p.id === playerId) + 1;
    const leader = sortedScores[0];
    const last = sortedScores[3];
    const pointsBehindLeader = Math.max(0, leader.score - player.score);
    const pointsAheadOfLast = Math.max(0, player.score - last.score);
    const myFloorCardCount = player.floor.length;
    
    // Get individual opponent data
    const [opp1, opp2, opp3] = opponents;
    
    // Get recent actions from turn history
    const getRecentAction = (pid: number): number => {
      const recent = this.turnHistory.filter(t => t.playerId === pid).slice(-1)[0];
      if (!recent) return 0;
      return recent.action === 'pass' ? 0 : 
             recent.action === 'legal' ? 1 :
             recent.action === 'illegal' ? 2 : 3;
    };
    
    // Audit dynamics
    const recentTicks = this.turnHistory.slice(-4).reduce((sum, t) => sum + t.auditTicksAdded, 0);
    const auditMomentum = recentTicks;
    const turnsUntilExternal = Math.max(0, Math.ceil((5 - state.auditTrack) / Math.max(0.5, auditMomentum)));
    const lastAudit = this.turnHistory.filter(t => t.action === 'audit').slice(-1)[0];
    const lastAuditTurnsAgo = lastAudit ? (this.turnHistory.length - this.turnHistory.indexOf(lastAudit)) : 99;
    
    const floorCrimes = opponents.map(o => rawValue(o.floor));
    const highestCrimeFloor = Math.max(...floorCrimes, 0);
    const crimeFloorOwner = opponents.findIndex(o => rawValue(o.floor) === highestCrimeFloor);
    const totalTableCrime = floorCrimes.reduce((a, b) => a + b, 0) + rawValue(player.floor);
    const externalRisk = Math.min(1, state.auditTrack / 5);
    
    // Game phase
    const turnNumber = this.turnHistory.length;
    const deckRemaining = state.deck.length;
    const cardsPerTurn = 2;
    const estimatedTurnsLeft = Math.floor(deckRemaining / (cardsPerTurn * 4));
    const gamePhase = estimatedTurnsLeft > 15 ? 0 : estimatedTurnsLeft > 8 ? 1 : estimatedTurnsLeft > 3 ? 2 : 3;
    const scoringPace = turnNumber > 0 ? totalTableCrime / turnNumber : 0;
    const isEndgame = estimatedTurnsLeft < 5;
    
    // Strategic indicators
    const canBlockLeader = hasTripsPlus && leader.id !== playerId && rawValue(leader.floor) >= 15;
    const canEscapeBottom = myScoreRank === 4 && (legal ? legal.raw * 0.7 : 0) > pointsBehindLeader / 2;
    const shouldDump = player.hand.length > 10 && !hasTripsPlus;
    const shouldRace = pointsBehindLeader > 30 && estimatedTurnsLeft < 10;
    const shouldDefend = myScoreRank === 1 && pointsAheadOfLast > 20;
    const auditValueRatio = highestCrimeFloor > 0 ? rawValue(player.floor) / highestCrimeFloor : 1;
    const scoreGap = leader.score - last.score;
    const recentScoreChanges = this.turnHistory.slice(-4).map(t => t.scoreChange);
    const volatility = recentScoreChanges.length > 0 ? 
      Math.sqrt(recentScoreChanges.reduce((a, b) => a + b * b, 0) / recentScoreChanges.length) : 0;
    
    // Card counting (simplified - tracking high value cards)
    const cardsPlayed = state.players.reduce((sum, p) => sum + p.floor.length, 0);
    const acesPlayed = state.players.reduce((sum, p) => 
      sum + p.floor.filter(c => c.r === 14).length, 0); // 14 = Ace
    const kingsPlayed = state.players.reduce((sum, p) => 
      sum + p.floor.filter(c => c.r === 13).length, 0); // 13 = King
    const queensPlayed = state.players.reduce((sum, p) => 
      sum + p.floor.filter(c => c.r === 12).length, 0); // 12 = Queen
    const highCardsPlayed = acesPlayed + kingsPlayed + queensPlayed;
    const highCardsRemaining = Math.max(0, 16 - highCardsPlayed); // 4 each of A,K,Q,J
    const lowCardsRemaining = Math.max(0, 16 - cardsPlayed / 3); // Rough estimate
    
    // Hanging value calculations - Audit profit potential
    const findBestAuditHand = (hand: Card[]): { cards: Card[]; raw: number } | null => {
      const legalHand = bestLegalGreedy(hand);
      if (!legalHand) return null;
      
      const handType = getHandType(legalHand.cards);
      const validTypes = ['trips', 'straight', 'flush', 'full-house', 'quads', 'straight-flush'];
      if (!validTypes.includes(handType)) return null;
      
      if (calculateTaxedValue(legalHand.raw) < 12) return null;
      
      return legalHand;
    };
    
    const calculateHangingValue = (targetFloor: Card[], auditHandCost: number): number => {
      const { leftover } = reorganizeGreedy(targetFloor);
      const fine = Math.round(rawValue(leftover) * 1.5); // 1.5x multiplier for confiscated cards
      return fine - auditHandCost; // Net profit from audit
    };
    
    const myBestAuditHand = findBestAuditHand(player.hand);
    const hasValidAuditHand = myBestAuditHand !== null;
    const myAuditHandValue = myBestAuditHand ? calculateTaxedValue(myBestAuditHand.raw) : 0;
    const auditHandCost = myBestAuditHand ? myBestAuditHand.raw * 0.7 : 0;
    
    // Calculate my vulnerability (how much I could lose if audited)
    const { leftover: myLeftover } = reorganizeGreedy(player.floor);
    const myVulnerability = Math.round(rawValue(myLeftover) * 1.5); // 1.5x multiplier
    
    // Calculate hanging value for each opponent
    const opp1HangingValue = hasValidAuditHand && opp1 
      ? calculateHangingValue(opp1.floor, auditHandCost) 
      : 0;
    const opp2HangingValue = hasValidAuditHand && opp2 
      ? calculateHangingValue(opp2.floor, auditHandCost) 
      : 0;
    const opp3HangingValue = hasValidAuditHand && opp3 
      ? calculateHangingValue(opp3.floor, auditHandCost) 
      : 0;
    
    // Find best audit target
    const hangingValues = [
      { id: opp1?.id || -1, value: opp1HangingValue },
      { id: opp2?.id || -1, value: opp2HangingValue },
      { id: opp3?.id || -1, value: opp3HangingValue }
    ].filter(hv => hv.id >= 0);
    
    const bestAudit = hangingValues.reduce((best, current) => 
      current.value > best.value ? current : best,
      { id: -1, value: -999 }
    );
    
    const bestAuditTarget = bestAudit.value > -10 ? bestAudit.id : -1;
    const maxHangingValue = Math.max(0, opp1HangingValue, opp2HangingValue, opp3HangingValue);
    const totalHangingValue = Math.max(0, opp1HangingValue) + 
                             Math.max(0, opp2HangingValue) + 
                             Math.max(0, opp3HangingValue);
    const auditProfitRatio = auditHandCost > 0 ? maxHangingValue / auditHandCost : 0;
    
    return {
      // Hand composition (11 features)
      handSize: player.hand.length,
      numPairs,
      numTrips,
      numStraightDraws,
      numFlushDraws,
      highestRank,
      lowestRank,
      rankSpread: highestRank - lowestRank,
      suitDiversity: suitCounts.size,
      hasAce: ranks.includes(14),
      hasKing: ranks.includes(13),
      
      // Legal hand potential (8 features)
      hasLegal: legal !== null,
      hasTripsPlus,
      hasStraight,
      hasFlush,
      hasFullHouse,
      bestLegalRaw: legal?.raw || 0,
      bestLegalTaxed: legal ? calculateTaxedValue(legal.raw) : 0,
      numLegalOptions,
      
      // Illegal hand analysis (6 features)
      bestSafeRaw: safe?.raw || 0,
      bestSafeTaxed: safe ? Math.round(safe.raw * 0.6) : 0,
      bestDumpRaw: dumpRaw,
      wouldTriggerExternal,
      ticksWouldAdd,
      kickbackAmount,
      
      // My position (8 features)
      myScore: player.score,
      myScoreRank,
      pointsBehindLeader,
      pointsAheadOfLast,
      myFloorCrime: rawValue(player.floor),
      myFloorCardCount,
      myAuditHistory: 0, // TODO: track this
      myProductionCount: player.floorGroups?.length || 0,
      
      // Individual opponent analysis (12 features)
      opp1Score: opp1?.score || 0,
      opp1FloorCrime: opp1 ? rawValue(opp1.floor) : 0,
      opp1HandSize: opp1?.hand.length || 0,
      opp1RecentAction: opp1 ? getRecentAction(opp1.id) : 0,
      
      opp2Score: opp2?.score || 0,
      opp2FloorCrime: opp2 ? rawValue(opp2.floor) : 0,
      opp2HandSize: opp2?.hand.length || 0,
      opp2RecentAction: opp2 ? getRecentAction(opp2.id) : 0,
      
      opp3Score: opp3?.score || 0,
      opp3FloorCrime: opp3 ? rawValue(opp3.floor) : 0,
      opp3HandSize: opp3?.hand.length || 0,
      opp3RecentAction: opp3 ? getRecentAction(opp3.id) : 0,
      
      // Audit dynamics (8 features)
      auditTrack: state.auditTrack,
      auditMomentum,
      turnsUntilExternal,
      lastAuditTurnsAgo,
      highestCrimeFloor,
      crimeFloorOwner,
      totalTableCrime,
      externalRisk,
      
      // Hanging value - Audit profit potential (10 features)
      hasValidAuditHand,
      myAuditHandValue,
      myVulnerability,
      opp1HangingValue,
      opp2HangingValue,
      opp3HangingValue,
      bestAuditTarget,
      maxHangingValue,
      totalHangingValue,
      auditProfitRatio,
      
      // Game phase (6 features)
      turnNumber,
      deckRemaining,
      estimatedTurnsLeft,
      gamePhase,
      scoringPace,
      isEndgame,
      
      // Strategic indicators (8 features)
      canBlockLeader,
      canEscapeBottom,
      shouldDump,
      shouldRace,
      shouldDefend,
      auditValueRatio,
      scoreGap,
      volatility,
      
      // Card counting hints (6 features)
      acesPlayed,
      kingsPlayed,
      queensPlayed,
      highCardsRemaining,
      lowCardsRemaining,
      suitBalance: 0 // TODO: calculate standard deviation of suit distributions
    };
  }

  // Discretize features for Q-table key - using top 35 most important features (including hanging values)
  private stateToKey(features: StateFeatures): string {
    const d = (value: number, buckets: number[]): number => {
      for (let i = 0; i < buckets.length; i++) {
        if (value <= buckets[i]) return i;
      }
      return buckets.length;
    };
    
    const b = (value: boolean): number => value ? 1 : 0;
    
    // Select the most impactful features for state representation
    // We can't use all 85+ features or the state space would be too large
    return [
      // Core hand features (5)
      d(features.handSize, [5, 7, 10, 15]),
      b(features.hasLegal),
      b(features.hasTripsPlus),
      d(features.bestLegalRaw, [15, 25, 35, 50]),
      d(features.bestSafeRaw, [15, 25, 35]),
      
      // Position features (4)
      features.myScoreRank,
      d(features.myScore, [50, 100, 150, 200]),
      d(features.pointsBehindLeader, [10, 30, 50]),
      d(features.myFloorCrime, [20, 40, 60]),
      
      // Opponent features (3) - aggregate instead of individual
      d(features.highestCrimeFloor, [20, 40, 60]),
      d(Math.max(features.opp1Score, features.opp2Score, features.opp3Score), [50, 100, 150]),
      d(features.totalTableCrime, [50, 100, 150, 200]),
      
      // Audit features (4)
      features.auditTrack,
      d(features.auditMomentum, [0, 1, 2]),
      b(features.wouldTriggerExternal),
      d(features.externalRisk * 10, [2, 5, 8]),
      
      // Hanging value features (5) - NEW!
      b(features.hasValidAuditHand),
      d(features.myVulnerability, [10, 20, 40]),
      d(features.maxHangingValue, [-10, 0, 10, 20]),
      d(features.auditProfitRatio * 10, [-5, 0, 5, 10]),
      features.bestAuditTarget >= 0 ? 1 : 0,
      
      // Game phase features (3)
      features.gamePhase,
      d(features.estimatedTurnsLeft, [5, 10, 15]),
      b(features.isEndgame),
      
      // Strategic features (3)
      b(features.canBlockLeader),
      b(features.shouldRace),
      d(features.scoreGap, [20, 50, 80]),
      
      // Additional discriminators (4)
      d(features.numPairs + features.numTrips, [0, 1, 2, 3]),
      b(features.hasFlush || features.hasStraight),
      d(features.volatility, [5, 10, 20]),
      d(features.highCardsRemaining, [5, 10, 15])
    ].join('-');
  }

  // Get available actions
  private getAvailableActions(state: MatchState, playerId: number): Action[] {
    const player = state.players[playerId];
    const opponents = state.players.filter(p => p.id !== playerId);
    const features = this.extractFeatures(state, playerId);
    const actions: Action[] = [];
    
    // Legal play available if we have a valid legal hand
    if (features.hasLegal && features.bestLegalTaxed >= 12) {
      actions.push('play-legal');
    }
    
    // Safe play available if below external trigger threshold
    if (features.bestSafeRaw > 0 && !features.wouldTriggerExternal) {
      actions.push('play-safe');
    }
    
    // Dump is available if hand size warrants it
    if (player.hand.length > 0 && (features.shouldDump || player.hand.length > 12)) {
      actions.push('play-dump');
    }
    
    // Audit available based on hanging value calculation
    if (features.hasValidAuditHand && features.maxHangingValue > -5) {
      // Use hanging value to determine if audit is worth it
      // Positive hanging value = profitable audit
      // Small negative ok if strategic (blocking leader, etc)
      
      // MALICIOUS CHECK: Is someone about to win?
      const leader = opponents.reduce((best, opp) => 
        opp.score > best.score ? opp : best, opponents[0]);
      const leaderNearWin = leader && leader.score >= 250;
      
      const worthAudit = features.maxHangingValue > 0 || 
                        (features.maxHangingValue > -10 && features.canBlockLeader) ||
                        (features.auditProfitRatio > 0.8 && features.auditTrack >= 3) ||
                        leaderNearWin; // ALWAYS try to audit if leader near win!
      
      if (worthAudit) {
        actions.push('audit-highest');
      }
    }
    
    // Pass is always available but discouraged in certain situations
    if (!features.shouldRace && !features.isEndgame) {
      actions.push('pass');
    }
    
    // Ensure at least one action is available
    if (actions.length === 0) {
      actions.push('pass');
    }
    
    return actions;
  }

  // Get Q-value for state-action pair
  private getQ(stateKey: string, action: Action): number {
    if (!this.qTable.has(stateKey)) {
      this.qTable.set(stateKey, new Map());
    }
    const actionValues = this.qTable.get(stateKey)!;
    return actionValues.get(action) || 0;
  }

  // Update Q-value
  private updateQ(stateKey: string, action: Action, value: number) {
    if (!this.qTable.has(stateKey)) {
      this.qTable.set(stateKey, new Map());
    }
    this.qTable.get(stateKey)!.set(action, value);
  }

  // Choose action using epsilon-greedy
  public chooseAction(state: MatchState, playerId: number): AIDecision {
    const features = this.extractFeatures(state, playerId);
    const stateKey = this.stateToKey(features);
    const availableActions = this.getAvailableActions(state, playerId);
    
    if (availableActions.length === 0) {
      return { doInternal: false, production: { type: 'pass' } };
    }
    
    let selectedAction: Action;
    
    // Epsilon-greedy: explore vs exploit
    if (Math.random() < this.epsilon) {
      // Explore: random action
      selectedAction = availableActions[Math.floor(Math.random() * availableActions.length)];
      this.stats.exploration = this.epsilon;
    } else {
      // Exploit: best Q-value
      let bestQ = -Infinity;
      selectedAction = availableActions[0];
      
      for (const action of availableActions) {
        const q = this.getQ(stateKey, action);
        if (q > bestQ) {
          bestQ = q;
          selectedAction = action;
        }
      }
    }
    
    // Convert action to AIDecision
    return this.actionToDecision(state, playerId, selectedAction);
  }

  // Convert action to game decision
  private actionToDecision(state: MatchState, playerId: number, action: Action): AIDecision {
    const player = state.players[playerId];
    const legal = bestLegalGreedy(player.hand);
    const safe = bestSafeIllegalGreedy(player.hand, 26);
    
    switch (action) {
      case 'play-legal':
        return {
          doInternal: false,
          production: legal ? { type: 'legal', cards: legal.cards } : { type: 'pass' }
        };
      
      case 'play-safe':
        return {
          doInternal: false,
          production: safe ? { type: 'safe', cards: safe.cards } : { type: 'pass' }
        };
      
      case 'play-dump':
        return {
          doInternal: false,
          production: { type: 'illegal', cards: player.hand }
        };
      
      case 'audit-highest': {
        // Use hanging value to find best audit target
        const features = this.extractFeatures(state, playerId);
        const targetId = features.bestAuditTarget;
        
        // Fallback to highest crime if no best target identified
        if (targetId < 0) {
          let fallbackId = -1;
          let maxCrime = 0;
          for (const opponent of state.players) {
            if (opponent.id === playerId) continue;
            const crime = rawValue(opponent.floor);
            if (crime > maxCrime) {
              maxCrime = crime;
              fallbackId = opponent.id;
            }
          }
          if (fallbackId >= 0) {
            return { doInternal: true, targetId: fallbackId, production: { type: 'pass' } };
          }
          return { doInternal: false, production: { type: 'pass' } };
        }
        
        return { doInternal: true, targetId, production: { type: 'pass' } };
      }
      
      default:
        return { doInternal: false, production: { type: 'pass' } };
    }
  }

  // Calculate immediate reward
  public calculateReward(
    prevState: MatchState,
    action: Action,
    newState: MatchState,
    playerId: number
  ): number {
    let reward = 0;
    
    const prevPlayer = prevState.players[playerId];
    const newPlayer = newState.players[playerId];
    
    // Points gained
    const pointsGained = newPlayer.score - prevPlayer.score;
    reward += pointsGained * this.rewards.pointGain;
    
    // Check for external audit
    if (prevState.auditTrack < 5 && newState.auditTrack >= 5) {
      reward += this.rewards.causeExternal;
    } else if (prevState.auditTrack >= 3 && newState.auditTrack < 5 && action === 'play-legal') {
      reward += this.rewards.avoidExternal;
    }
    
    // Spike penalty
    if (newState.auditTrack > prevState.auditTrack) {
      reward += this.rewards.spike * (newState.auditTrack - prevState.auditTrack);
    }
    
    // Legal production bonus
    if (action === 'play-legal') {
      reward += this.rewards.cleanProduction;
    }
    
    // AGGRESSIVE BONUS: Reward high-value illegal plays
    if ((action === 'play-safe' || action === 'play-dump') && pointsGained > 15) {
      reward += this.rewards.aggressiveBonus;
    }
    
    // LEAD MAINTENANCE: Reward for being ahead
    const scores = newState.players.map(p => p.score).sort((a, b) => b - a);
    if (newPlayer.score === scores[0] && scores[1] !== undefined) {
      const leadMargin = newPlayer.score - scores[1];
      reward += leadMargin * this.rewards.leadMaintenance;
    }
    
    // STRATEGIC PASS: Reward passing with a weak hand (< 3 cards or no pairs)
    if (action === 'pass') {
      const hasWeakHand = prevPlayer.hand.length <= 3 || 
                         !this.extractFeatures(prevState, playerId).hasLegal;
      if (hasWeakHand) {
        reward += this.rewards.strategicPass;
      }
    }
    
    // MEGA HAND BONUS: Reward for playing full house, quads, or straight flush!
    if (action === 'play-legal' && pointsGained > 0) {
      const features = this.extractFeatures(prevState, playerId);
      if (features.hasFullHouse || features.hasFlush || features.hasStraight) {
        reward += this.rewards.megaHandBonus;
      }
    }
    
    // HAND BUILDING: Reward if we improved our hand after passing
    // Check if our last action was a pass and now we're playing
    if ((action === 'play-legal' || action === 'play-safe' || action === 'play-dump') && 
        this.turnHistory.length > 0) {
      const lastPlayerTurn = this.turnHistory
        .filter(t => t.playerId === playerId)
        .slice(-1)[0];
      
      if (lastPlayerTurn && lastPlayerTurn.action === 'pass' && pointsGained > 20) {
        // We passed last turn and now played a good hand!
        reward += this.rewards.handBuilding;
      }
    }
    
    // Successful audit bonus
    if (action === 'audit-highest' && pointsGained > 10) {
      reward += this.rewards.successfulAudit;
      
      // MALICIOUS BONUS: Extra reward for auditing the leader
      const prevLeader = [...prevState.players].sort((a, b) => b.score - a.score)[0];
      const features = this.extractFeatures(prevState, playerId);
      if (features.bestAuditTarget === prevLeader.id && prevLeader.id !== playerId) {
        reward += this.rewards.blockLeaderAudit;
        
        // EXTREME BONUS: If leader was close to winning, massive reward
        if (prevLeader.score >= 250) {
          reward += this.rewards.preventWin;
        }
      }
    }
    
    // Game end rewards
    if (newState.winnerId !== undefined) {
      // Only count each game once using the gameId
      const gameKey = this.currentGameId || `game-${Date.now()}`;
      const shouldCountGame = !this.countedGames.has(gameKey);
      
      if (shouldCountGame) {
        this.countedGames.add(gameKey);
        
        // Track game participation  
        this.stats.gamesPlayed++;
        this.stats.totalScore += newPlayer.score;
        
        if (newState.winnerId === playerId) {
          this.stats.gamesWon++;
        }
        
        this.stats.avgScore = this.stats.totalScore / this.stats.gamesPlayed;
        this.stats.winRate = this.stats.gamesWon / this.stats.gamesPlayed;
      }
      
      // Always give rewards for game end, even if we already counted the game
      if (newState.winnerId === playerId) {
        reward += this.rewards.winGame;
      } else {
        const position = [...newState.players]
          .sort((a, b) => b.score - a.score)
          .findIndex(p => p.id === playerId) + 1;
        
        switch (position) {
          case 2: reward += this.rewards.position2nd; break;
          case 3: reward += this.rewards.position3rd; break;
          case 4: reward += this.rewards.position4th; break;
        }
      }
    }
    
    return reward;
  }

  // Update Q-values after action
  public learn(
    prevState: MatchState,
    action: Action,
    newState: MatchState,
    playerId: number
  ) {
    const prevFeatures = this.extractFeatures(prevState, playerId);
    const prevKey = this.stateToKey(prevFeatures);
    
    const reward = this.calculateReward(prevState, action, newState, playerId);
    
    // Q-learning update
    const oldQ = this.getQ(prevKey, action);
    
    if (newState.winnerId === undefined) {
      // Game continues - consider future rewards
      const newFeatures = this.extractFeatures(newState, playerId);
      const newKey = this.stateToKey(newFeatures);
      const nextActions = this.getAvailableActions(newState, playerId);
      
      let maxNextQ = 0;
      for (const nextAction of nextActions) {
        maxNextQ = Math.max(maxNextQ, this.getQ(newKey, nextAction));
      }
      
      // Q-learning formula: Q(s,a) = Q(s,a) + α[r + γ*max(Q(s',a')) - Q(s,a)]
      const newQ = oldQ + this.alpha * (reward + this.gamma * maxNextQ - oldQ);
      this.updateQ(prevKey, action, newQ);
    } else {
      // Terminal state - no future rewards
      const newQ = oldQ + this.alpha * (reward - oldQ);
      this.updateQ(prevKey, action, newQ);
    }
    
    this.saveToStorage();
  }

  // Decay exploration over time
  public updateExploration(episodesCompleted: number) {
    this.epsilon = Math.max(0.05, 0.3 * Math.pow(0.995, episodesCompleted));
    this.stats.exploration = this.epsilon;
    this.stats.episodesCompleted = episodesCompleted;
  }
  
  // Set the current game ID to track game completions
  public setGameId(gameId: string) {
    this.currentGameId = gameId;
  }

  // Save learned Q-table
  private saveToStorage() {
    try {
      const data = this.exportKnowledge();
      localStorage.setItem('rheinhessen-ai-learning', JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save learning data:', e);
    }
  }
  
  // Export knowledge for saving/sharing
  public exportKnowledge() {
    return {
      qTable: Array.from(this.qTable.entries()).map(([state, actions]) => ({
        state,
        actions: Array.from(actions.entries())
      })),
      stats: this.stats,
      epsilon: this.epsilon,
      turnHistory: this.turnHistory.slice(-50), // Keep last 50 turns for context
      config: {
        name: this.name,
        alpha: this.alpha,
        gamma: this.gamma,
        rewards: this.rewards
      },
      metadata: {
        exportDate: new Date().toISOString(),
        featureVersion: 'v2-75features',
        stateCount: this.qTable.size
      },
      countedGames: Array.from(this.countedGames) // Track which games we've counted
    };
  }

  // Load learned Q-table
  private loadFromStorage() {
    try {
      const saved = localStorage.getItem('rheinhessen-ai-learning');
      if (saved) {
        const data = JSON.parse(saved);
        this.importKnowledge(data);
      }
    } catch (e) {
      console.error('Failed to load learning data:', e);
    }
  }
  
  // Import knowledge from saved data
  public importKnowledge(data: any) {
    try {
      // Restore Q-table
      this.qTable = new Map();
      if (data.qTable) {
        for (const entry of data.qTable) {
          this.qTable.set(entry.state, new Map(entry.actions));
        }
      }
      
      // Restore stats
      if (data.stats) {
        this.stats = { ...this.stats, ...data.stats };
      }
      
      // Restore epsilon
      if (data.epsilon !== undefined) {
        this.epsilon = data.epsilon;
        this.stats.exploration = this.epsilon;
      }
      
      // Restore turn history
      if (data.turnHistory) {
        this.turnHistory = data.turnHistory;
      }
      
      // Restore counted games to avoid double-counting
      if (data.countedGames) {
        this.countedGames = new Set(data.countedGames);
      }
    } catch (e) {
      console.error('Failed to import learning data:', e);
    }
  }

  // Reset learning
  public reset() {
    this.qTable.clear();
    this.epsilon = 0.3;
    this.turnHistory = [];
    this.countedGames.clear();
    this.currentGameId = null;
    this.stats = {
      gamesPlayed: 0,
      gamesWon: 0,
      totalScore: 0,
      avgScore: 0,
      winRate: 0,
      exploration: 0.3,
      episodesCompleted: 0
    };
    localStorage.removeItem('rheinhessen-ai-learning');
  }

  // Update turn history (call this when actions are taken)
  public recordTurn(turnNumber: number, playerId: number, action: 'pass' | 'legal' | 'illegal' | 'audit', 
                    scoreChange: number, auditTicksAdded: number) {
    this.turnHistory.push({
      turnNumber,
      playerId, 
      action,
      scoreChange,
      auditTicksAdded
    });
    
    // Keep history reasonable size
    if (this.turnHistory.length > 100) {
      this.turnHistory = this.turnHistory.slice(-50);
    }
  }
  
  // Get detailed feature analysis for current state
  public analyzeState(state: MatchState, playerId: number): string[] {
    const features = this.extractFeatures(state, playerId);
    const analysis: string[] = [];
    
    analysis.push(`=== State Analysis for ${this.name} ===`);
    analysis.push(`Position: ${features.myScoreRank} place with ${features.myScore} points`);
    analysis.push(`Hand: ${features.handSize} cards, Legal: ${features.hasLegal}, Trips+: ${features.hasTripsPlus}`);
    analysis.push(`Best Legal: ${features.bestLegalRaw} raw (${features.bestLegalTaxed} taxed)`);
    analysis.push(`Floor Crime: ${features.myFloorCrime} (Highest opponent: ${features.highestCrimeFloor})`);
    analysis.push(`Audit Track: ${features.auditTrack}/5, Momentum: ${features.auditMomentum}`);
    analysis.push(`Game Phase: ${['Early', 'Mid', 'Late', 'Final'][features.gamePhase]} (${features.estimatedTurnsLeft} turns left)`);
    
    if (features.canBlockLeader) analysis.push(`⚠️ Can block leader!`);
    if (features.shouldRace) analysis.push(`🏃 Should race for points!`);
    if (features.shouldDefend) analysis.push(`🛡️ Should defend lead!`);
    if (features.wouldTriggerExternal) analysis.push(`⚠️ Would trigger external audit!`);
    
    return analysis;
  }

  // Get learning insights
  public getInsights(): string[] {
    const insights: string[] = [];
    
    insights.push(`📊 Processing 85+ features (including hanging values)`);
    insights.push(`🧠 Q-table: ${this.qTable.size} unique states mapped`);
    
    // Most valuable states
    const stateValues: Array<[string, number]> = [];
    for (const [state, actions] of this.qTable.entries()) {
      const maxQ = Math.max(...Array.from(actions.values()));
      stateValues.push([state, maxQ]);
    }
    stateValues.sort((a, b) => b[1] - a[1]);
    
    // Analyze patterns
    let preferLegal = 0;
    let preferIllegal = 0;
    let preferAudit = 0;
    
    for (const [, actions] of this.qTable.entries()) {
      const bestAction = Array.from(actions.entries())
        .sort((a, b) => b[1] - a[1])[0];
      
      if (bestAction) {
        if (bestAction[0] === 'play-legal') preferLegal++;
        if (bestAction[0] === 'play-safe' || bestAction[0] === 'play-dump') preferIllegal++;
        if (bestAction[0] === 'audit-highest') preferAudit++;
      }
    }
    
    const total = preferLegal + preferIllegal + preferAudit;
    if (total > 0) {
      insights.push(`Strategy: ${Math.round(preferLegal/total*100)}% legal, ${Math.round(preferIllegal/total*100)}% illegal, ${Math.round(preferAudit/total*100)}% AUDIT`);
    }
    
    // Clarify episodes vs games
    if (this.stats.episodesCompleted > 0) {
      insights.push(`🎮 Episodes: ${this.stats.episodesCompleted} (${this.stats.gamesPlayed} participations)`);
      insights.push(`📈 Win rate: ${Math.round(this.stats.winRate * 100)}% (${this.stats.gamesWon}/${this.stats.gamesPlayed})`);
      insights.push(`💰 Avg score: ${Math.round(this.stats.avgScore)} points`);
    }
    
    insights.push(`🎲 Exploration: ${Math.round(this.epsilon * 100)}% random actions`);
    insights.push(`💾 Memory: ${this.qTable.size} states × 5 actions`);
    
    return insights;
  }
}
