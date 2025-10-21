import type { MatchState, Card, PlayerState } from '../engine/types';
import { bestLegalGreedy, bestSafeIllegalGreedy, getHandType, isLegalExact } from '../engine/evaluation';
import { HandAnalyzerUltraFast } from '../engine/handAnalyzerUltraFast';
import { calculateTaxedValue } from '../engine/scoring';
import { rawValue } from '../engine/deck';
import { reorganizeGreedy } from '../engine/audits';
import type { AIDecision } from './personas';

// State features for Q-learning - EXPANDED for granular decision-making
interface StateFeatures {
  // Hand composition (12 features) - NOW INCLUDING ENCODED HAND
  handSize: number;
  handEncoding: string;        // Direct encoding of hand ranks for pattern matching
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
  
  // Trips building & opportunity cost (6 new features)
  closestToTrips: number;     // 0=have trips, 1=need 1 card, 2=need 2 cards
  numPairsForTrips: number;   // How many pairs could become trips
  tripsPlayValue: number;     // Value if played as legal hand
  tripsAuditValue: number;    // Expected value if saved for audit
  tripsDelta: number;         // Audit value - play value (opportunity cost)
  handBuildPotential: number; // 0-1 score of hand improvement potential
  
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
  
  // Opponent strategy fingerprints (9 features - PureWarzone meta-evolution)
  opp1Aggression: number;     // Learned illegal play rate
  opp1Control: number;        // Learned audit rate
  opp1Risk: number;          // Learned floor crime tendency
  opp2Aggression: number;     
  opp2Control: number;        
  opp2Risk: number;          
  opp3Aggression: number;     
  opp3Control: number;        
  opp3Risk: number;          
}

// Possible actions
type Action = 
  | 'play-legal'   // Legacy: auto-select best legal
  | 'play-safe'    // Legacy: auto-select best safe
  | 'play-dump'    // Legacy: dump all cards
  | 'audit-0'      // Audit player 0
  | 'audit-1'      // Audit player 1
  | 'audit-2'      // Audit player 2
  | 'audit-3'      // Audit player 3
  | 'pass'
  | string;        // Dynamic: 'play-{encoded cards}' for PureWarzone

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

// Q-learning agent with OPTIMIZED memory management
export class LearningAgent {
  private qTable: Map<string, Map<Action, number>> = new Map();
  // REMOVED: stateAccessOrder - was causing memory leak, never properly used
  private playOptions: Map<string, Card[]> = new Map(); // Store actual cards for dynamic play actions
  private actionStats: Map<string, number> = new Map(); // Track action usage for validation
  
  // TIER 1 OPTIMIZATION: Cache expensive hand calculations (with size limit)
  private handCache = new Map<string, { 
    legal: { cards: Card[]; raw: number } | null; 
    safe: { cards: Card[]; raw: number };
  }>();
  private static readonly MAX_HAND_CACHE_SIZE = 30; // Reduced to prevent slowdowns
  
  // No size limits - we support unlimited states for deep learning
  
  // OPPONENT MEMORY for meta-evolution (PureWarzone feature)
  private opponentMemory = new Map<number, {
    avgIllegalRate: number;      // How often they play illegal
    avgLegalRate: number;        // How often they play legal
    avgSpikeRate: number;        // How often they play 27+
    avgAuditRate: number;        // How often they audit
    avgFloorCrime: number;       // Their typical ILLEGAL floor accumulation (crime only)
    avgPassRate: number;         // How often they pass
    avgLegalStrength: number;    // Average legal hand value when played
    gamesObserved: number;
  }>();
  
  // Feature importance tracking
  private featureRewardCorrelation = new Map<string, number>();
  private featureUsageCount = new Map<string, number>();
  private featureDistributions = new Map<string, number[]>;
  
  private epsilon: number; // Exploration rate
  private alpha: number; // Learning rate  
  private gamma: number; // Discount factor
  public name: string;
  public batchName: string = '';  // Track which batch this agent came from
  
  // Turn history - CLEARED after each game to prevent memory bloat
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
  
  // PERFORMANCE METRICS for debugging slowdowns
  public perfMetrics = {
    extractFeaturesCount: 0,
    learnCallCount: 0,
    cacheHits: 0,
    cacheMisses: 0,
    getQCalls: 0,
    updateQCalls: 0,
    chooseActionCalls: 0,
    lastEpisodeTime: 0,
    episodeStartTime: 0,
    turnCount: 0,
    totalTurnTime: 0,
    avgTurnTime: 0,
    turnsLastEpisode: 0,
    auditsLastEpisode: 0,
    extractFeaturesLastEpisode: 0
  };
  
  // Track which games we've already counted to avoid double-counting
  private countedGames = new Set<string>();
  private currentGameId: string | null = null;

  // Reward weights - WARZONE SYSTEM with ANTI-LEADER COLLUSION
  private rewards = {
    // WINNING IS EVERYTHING
    winGame: 1000,         // MASSIVE reward for victory
    beatLearner: 200,      // Extra bonus for beating other learners
    
    // Position punishments (harsh reality)
    position2nd: -100,     // First loser
    position3rd: -200,     // Failed harder
    position4th: -300,     // Complete failure
    
    // Score only matters for winning
    pointGain: 0.5,        // Small reward to encourage scoring
    leadMaintenance: 2.0,  // Per point ahead - defend your lead
    
    // ANTI-LEADER COLLUSION (progressive urgency)
    eliminateLeader: 150,  // Base audit of leader
    collusionAudit250: 250, // Audit leader at 250+ points
    collusionAudit275: 400, // Audit leader at 275+ points  
    collusionAudit290: 600, // EMERGENCY: Audit leader at 290+
    preventWin: 300,       // Stop imminent victory (increased)
    crushWeakest: 50,      // Exploit the weak
    causeExternal: -100,   // Don't self-destruct
    
    // COLLUSION COORDINATION
    followupAudit: 100,    // Audit someone recently audited
    pileOn: 150,           // Multiple AIs audit same target
    
    // Discovery bonuses
    unexploredAction: 20,  // Try new things
    strategyShift: 30,     // Change tactics when losing
    
    // No preset strategy rewards - let them figure it out
    loseGame: -500,        // Losing is failure
    successfulAudit: 0,    // Let them learn if audits help
    cleanProduction: 0,    // Let them discover if legal is good
    spike: 0,              // Let them learn about risk
    strategicPass: 0,      // They'll figure out when to pass
    megaHandBonus: 0,      // They'll learn what hands win
    handBuilding: 0,       // No hand-holding
    holdingAuditCards: 0,  // They'll learn audit timing
    profitableROI: 0,      // They'll discover profit strategies
    optimalSafe: 0,        // They'll find safe spots
    avoidExternal: 0,      // They'll learn or die
    blockLeaderAudit: 0    // Merged into eliminateLeader
  };

  constructor(config: AgentConfig = {}) {
    // Apply configuration
    this.epsilon = config.epsilon ?? 0.95;    // Start at 95% exploration (nearly pure random)
    this.alpha = config.alpha ?? 0.15;        // Conservative 15% max learning rate
    this.gamma = config.gamma ?? 0.95;        // Discount factor
    this.name = config.name ?? 'Warzone';
    
    // PURE WARZONE mode - only win/lose matters
    const isPureWarzone = config.name?.includes('PureWarzone');
    const isWarzone = config.name?.includes('Warzone');
    
    if (isPureWarzone) {
      // Start with 100% random exploration - pure discovery
      this.epsilon = 1.0;   // 100% random initially
      this.alpha = 0.1;     // Slower learning - needs more evidence
      this.gamma = 0.98;    // Strong future focus - winning is all that matters
      
      // STRIP ALL INTERMEDIATE REWARDS - only win/lose/audit
      Object.keys(this.rewards).forEach(key => {
        this.rewards[key as keyof typeof this.rewards] = 0;
      });
      this.rewards.winGame = 1000;   // MASSIVE reward for victory
      this.rewards.loseGame = -1000; // MASSIVE penalty for losing
      this.rewards.successfulAudit = 5; // Very small reward - audits should emerge naturally
      
      console.log(`🎮 ${this.name}: PURE ADVERSARIAL MODE - Win at all costs (with audit discovery)!`);
    } else if (isWarzone) {
      // Regular Warzone - has some guidance
      this.epsilon = 0.95;  // 95% random initially
      this.alpha = 0.15;    // 15% max - requires 7+ consistent experiences to change strategy
      this.gamma = 0.95;    // Balanced horizon
    } else if (config.rewardWeights) {
      // Legacy persona mode - slightly lower starting point
      this.epsilon = 0.8;   // 80% random initially for legacy
      this.alpha = 0.12;    // 12% initial learning for legacy (more conservative)
      
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

  // Helper to get cached hand analysis
  private getCachedHandAnalysis(hand: Card[]): { 
    legal: { cards: Card[]; raw: number } | null; 
    safe: { cards: Card[]; raw: number };
  } {
    // Create cache key from hand
    const key = hand.map(c => c.id).sort().join(',');
    
    if (!this.handCache.has(key)) {
      this.perfMetrics.cacheMisses++;
      // Limit cache size to prevent unbounded growth
      if (this.handCache.size >= LearningAgent.MAX_HAND_CACHE_SIZE) {
        // Clear half the cache when limit reached (LRU-style)
        const keysToDelete = Array.from(this.handCache.keys()).slice(0, 15);
        keysToDelete.forEach(k => this.handCache.delete(k));
      }
      
      // Calculate and cache
      this.handCache.set(key, {
        legal: bestLegalGreedy(hand),
        safe: bestSafeIllegalGreedy(hand, 26)
      });
    } else {
      this.perfMetrics.cacheHits++;
    }
    
    return this.handCache.get(key)!;
  }
  
  // Clear hand cache when hands change
  public clearHandCache(): void {
    this.handCache.clear();
  }
  
  // Extract features from game state (now public for optimization)
  public extractFeatures(state: MatchState, playerId: number): StateFeatures {
    this.perfMetrics.extractFeaturesCount++;
    const player = state.players[playerId];
    const opponents = state.players.filter(p => p.id !== playerId);
    
    // TIER 1 OPTIMIZATION: Use cached hand analysis
    const { legal, safe } = this.getCachedHandAnalysis(player.hand);
    
    // Hand encoding for pattern matching
    const handEncoding = HandAnalyzerUltraFast.encodeHand(player.hand);
    
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
    const ticksWouldAdd = dumpRaw >= 27 ? Math.ceil((dumpRaw - 26) / 26) : 0;
    const wouldTriggerExternal = state.auditTrack + ticksWouldAdd >= 5;
    const kickbackAmount = dumpRaw >= 27 ? 5 : 0;
    
    // Position analysis
    const sortedScores = [...state.players].sort((a, b) => b.score - a.score);
    const myScoreRank = sortedScores.findIndex(p => p.id === playerId) + 1;
    const leader = sortedScores[0];
    const last = sortedScores[3];
    const pointsBehindLeader = Math.max(0, leader.score - player.score);
    const pointsAheadOfLast = Math.max(0, player.score - last.score);
    const myFloorCardCount = player.floor.length;
    
    // Get individual opponent data (ensuring all 3 opponents including human)
    const [opp1, opp2, opp3] = opponents;
    
    // Verify we have all opponents (should be 3 in a 4-player game)
    if (opponents.length !== 3) {
      console.warn(`Expected 3 opponents for player ${playerId}, got ${opponents.length}`);
    }
    
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
    
    const floorCrimes = opponents.map(o => this.calculateActualCrime(o));
    const highestCrimeFloor = Math.max(...floorCrimes, 0);
    const crimeFloorOwner = opponents.findIndex(o => this.calculateActualCrime(o) === highestCrimeFloor);
    const totalTableCrime = floorCrimes.reduce((a, b) => a + b, 0) + this.calculateActualCrime(player);
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
    const canBlockLeader = hasTripsPlus && leader.id !== playerId && this.calculateActualCrime(leader) >= 15;
    const canEscapeBottom = myScoreRank === 4 && (legal ? legal.raw * 0.7 : 0) > pointsBehindLeader / 2;
    const shouldDump = player.hand.length > 10 && !hasTripsPlus;
    const shouldRace = pointsBehindLeader > 30 && estimatedTurnsLeft < 10;
    const shouldDefend = myScoreRank === 1 && pointsAheadOfLast > 20;
    const auditValueRatio = highestCrimeFloor > 0 ? this.calculateActualCrime(player) / highestCrimeFloor : 1;
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
      // TIER 1 OPTIMIZATION: Reuse cached legal hand
      const { legal: legalHand } = this.getCachedHandAnalysis(hand);
      if (!legalHand) return null;
      
      const handType = getHandType(legalHand.cards);
      const validTypes = ['trips', 'straight', 'flush', 'full-house', 'quads', 'straight-flush'];
      if (!validTypes.includes(handType)) return null;
      
      if (calculateTaxedValue(legalHand.raw) < 12) return null;
      
      return legalHand;
    };
    
    const calculateHangingValue = (targetFloor: Card[], auditHandCost: number, auditHandRaw: number): number => {
      const { leftover } = reorganizeGreedy(targetFloor);
      // Dynamic multiplier based on audit hand raw value
      const multiplier = auditHandRaw / 10; // 30 raw = 3x, 50 raw = 5x
      const fine = Math.round(rawValue(leftover) * multiplier);
      return fine - auditHandCost; // Net profit from audit
    };
    
    const myBestAuditHand = findBestAuditHand(player.hand);
    const hasValidAuditHand = myBestAuditHand !== null;
    const myAuditHandValue = myBestAuditHand ? calculateTaxedValue(myBestAuditHand.raw) : 0;
    const auditHandCost = myBestAuditHand ? myBestAuditHand.raw * 0.3 : 0;  // Matches 30% legal scoring
    
    // Calculate my vulnerability (how much I could lose if audited)
    // Assume opponent might use a mid-value audit hand (trips = ~3x multiplier)
    const { leftover: myLeftover } = reorganizeGreedy(player.floor);
    const assumedMultiplier = 3; // Assume opponent uses trips (30 raw value)
    const myVulnerability = Math.round(rawValue(myLeftover) * assumedMultiplier);
    
    // Calculate hanging value for each opponent
    const opp1HangingValue = hasValidAuditHand && opp1 && myBestAuditHand
      ? calculateHangingValue(opp1.floor, auditHandCost, myBestAuditHand.raw) 
      : 0;
    const opp2HangingValue = hasValidAuditHand && opp2 && myBestAuditHand
      ? calculateHangingValue(opp2.floor, auditHandCost, myBestAuditHand.raw) 
      : 0;
    const opp3HangingValue = hasValidAuditHand && opp3 && myBestAuditHand
      ? calculateHangingValue(opp3.floor, auditHandCost, myBestAuditHand.raw) 
      : 0;
    
    // Find best audit target among all opponents
    const hangingValues = [
      { id: opp1?.id ?? -1, value: opp1HangingValue },
      { id: opp2?.id ?? -1, value: opp2HangingValue },
      { id: opp3?.id ?? -1, value: opp3HangingValue }
    ].filter(hv => hv.id >= 0);
    
    const bestAudit = hangingValues.reduce((best, current) => 
      current.value > best.value ? current : best,
      { id: -1, value: -999 }
    );
    
    const bestAuditTarget = bestAudit.value > -10 ? bestAudit.id : -1;
    const maxHangingValue = Math.max(0, opp1HangingValue, opp2HangingValue, opp3HangingValue);
    
    // Removed debug logging for performance
    const totalHangingValue = Math.max(0, opp1HangingValue) + 
                             Math.max(0, opp2HangingValue) + 
                             Math.max(0, opp3HangingValue);
    const auditProfitRatio = auditHandCost > 0 ? maxHangingValue / auditHandCost : 0;
    
    // Calculate trips building & opportunity cost features
    let closestToTrips = 2; // Default: need 2 more cards
    let numPairsForTrips = 0;
    let tripsPlayValue = 0;
    let tripsAuditValue = 0;
    
    // Check how close to trips
    if (hasTripsPlus) {
      closestToTrips = 0; // Already have trips
      // If we have trips/quads as legal hand, get its play value
      if (legal && ['trips', 'quads', 'full-house'].includes(getHandType(legal.cards))) {
        tripsPlayValue = calculateTaxedValue(legal.raw);
      }
    } else if (numPairs > 0) {
      closestToTrips = 1; // One card away (have pairs)
      numPairsForTrips = numPairs; // Each pair could become trips
    }
    
    // Calculate expected audit value (average of positive hanging values)
    if (hasValidAuditHand || closestToTrips <= 1) {
      const positiveHangings = [opp1HangingValue, opp2HangingValue, opp3HangingValue]
        .filter(v => v > 0);
      if (positiveHangings.length > 0) {
        tripsAuditValue = positiveHangings.reduce((sum, v) => sum + v, 0) / positiveHangings.length;
      }
    }
    
    // Calculate opportunity cost (positive means audit is better, negative means play is better)
    const tripsDelta = tripsAuditValue - tripsPlayValue;
    
    // Calculate hand building potential (0-1 scale)
    let handBuildPotential = 0;
    if (player.hand.length < 7) { // Can still draw
      // Higher potential if we have pairs (could become trips)
      handBuildPotential += numPairs * 0.3;
      // Higher potential if we're close to straights/flushes
      if (numStraightDraws <= 2) handBuildPotential += 0.2;
      if (numFlushDraws <= 2) handBuildPotential += 0.2;
      // Higher potential with more draws remaining
      handBuildPotential += (7 - player.hand.length) * 0.1;
      handBuildPotential = Math.min(1, handBuildPotential); // Cap at 1
    }
    
    // OPPONENT STRATEGY FINGERPRINTS for meta-evolution (PureWarzone feature)
    // These allow the agent to learn counter-strategies
    let opp1Strategy = { aggression: 0.5, control: 0.1, risk: 30 };
    let opp2Strategy = { aggression: 0.5, control: 0.1, risk: 30 };
    let opp3Strategy = { aggression: 0.5, control: 0.1, risk: 30 };
    
    if (this.name.includes('PureWarzone')) {
      // Get learned opponent profiles
      const profile1 = this.opponentMemory.get(opp1?.id ?? -1);
      const profile2 = this.opponentMemory.get(opp2?.id ?? -1);
      const profile3 = this.opponentMemory.get(opp3?.id ?? -1);
      
      if (profile1) {
        opp1Strategy.aggression = profile1.avgIllegalRate;
        opp1Strategy.control = profile1.avgAuditRate;
        opp1Strategy.risk = profile1.avgFloorCrime;
      }
      if (profile2) {
        opp2Strategy.aggression = profile2.avgIllegalRate;
        opp2Strategy.control = profile2.avgAuditRate;
        opp2Strategy.risk = profile2.avgFloorCrime;
      }
      if (profile3) {
        opp3Strategy.aggression = profile3.avgIllegalRate;
        opp3Strategy.control = profile3.avgAuditRate;
        opp3Strategy.risk = profile3.avgFloorCrime;
      }
    }
    
    return {
      // Hand composition (12 features)
      handSize: player.hand.length,
      handEncoding,  // NEW: Direct hand encoding for pattern matching
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
      myFloorCrime: this.calculateActualCrime(player),
      myFloorCardCount,
      myAuditHistory: 0, // TODO: track this
      myProductionCount: player.floorGroups?.length || 0,
      
      // Individual opponent analysis (12 features)
      opp1Score: opp1?.score || 0,
      opp1FloorCrime: opp1 ? this.calculateActualCrime(opp1) : 0,
      opp1HandSize: opp1?.hand.length || 0,
      opp1RecentAction: opp1 ? getRecentAction(opp1.id) : 0,
      
      opp2Score: opp2?.score || 0,
      opp2FloorCrime: opp2 ? this.calculateActualCrime(opp2) : 0,
      opp2HandSize: opp2?.hand.length || 0,
      opp2RecentAction: opp2 ? getRecentAction(opp2.id) : 0,
      
      opp3Score: opp3?.score || 0,
      opp3FloorCrime: opp3 ? this.calculateActualCrime(opp3) : 0,
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
      
      // Trips building & opportunity cost (6 features)
      closestToTrips,
      numPairsForTrips,
      tripsPlayValue,
      tripsAuditValue,
      tripsDelta,
      handBuildPotential,
      
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
      suitBalance: 0, // TODO: calculate standard deviation of suit distributions
      
      // OPPONENT STRATEGY FINGERPRINTS (9 new features for PureWarzone meta-evolution)
      // These encode learned opponent tendencies to enable counter-strategies
      opp1Aggression: opp1Strategy.aggression,  // How often opp1 plays illegal
      opp1Control: opp1Strategy.control,        // How often opp1 audits
      opp1Risk: opp1Strategy.risk,              // Average floor crime for opp1
      
      opp2Aggression: opp2Strategy.aggression,  // How often opp2 plays illegal
      opp2Control: opp2Strategy.control,        // How often opp2 audits  
      opp2Risk: opp2Strategy.risk,              // Average floor crime for opp2
      
      opp3Aggression: opp3Strategy.aggression,  // How often opp3 plays illegal
      opp3Control: opp3Strategy.control,        // How often opp3 audits
      opp3Risk: opp3Strategy.risk               // Average floor crime for opp3
    };
  }

  // OPTIMIZED state discretization - coarser buckets = fewer states = faster training
  private stateToKey(features: StateFeatures): string {
    // Faster discretization with fewer buckets
    const d = (value: number, buckets: number[]): number => {
      for (let i = 0; i < buckets.length; i++) {
        if (value <= buckets[i]) return i;
      }
      return buckets.length;
    };
    
    const b = (value: boolean): number => value ? 1 : 0;
    
    // OPTIMIZED 25-FEATURE SYSTEM - Only what matters for winning
    // Critical insight: Focus on thresholds that change decisions
    
    // Calculate additional critical features
    const canPlayDangerous = features.bestDumpRaw >= 27;
    const leaderScore = Math.max(features.opp1Score, features.opp2Score, features.opp3Score);
    const auditROI = features.hasValidAuditHand && features.myAuditHandValue > 0 ?
                     features.maxHangingValue / features.myAuditHandValue : 0;
    
    // Count players who would trigger external on next illegal
    let playersNearExternal = 0;
    if (features.auditTrack >= 4) playersNearExternal++;
    if (features.auditTrack >= 3 && features.opp1FloorCrime > 27) playersNearExternal++;
    if (features.auditTrack >= 3 && features.opp2FloorCrime > 27) playersNearExternal++;
    if (features.auditTrack >= 3 && features.opp3FloorCrime > 27) playersNearExternal++;
    
    // Include simplified hand pattern in state (first 3 cards for faster lookup)
    const handPattern = features.handEncoding.split(',').slice(0, 3).join('-');
    
    return [
      // HAND PATTERN - Direct encoding for action selection
      handPattern,                                           // Actual cards in hand (truncated)
      
      // POSITION & SCORING (4) - Core win condition with more granularity
      d(features.myScore, [50, 100, 150, 200, 250]),        // 6 buckets: very detailed progression
      features.myScoreRank,                                 // Exact 1-4
      d(features.pointsBehindLeader, [10, 20, 30, 50, 75]), // 6 buckets: nuanced gaps
      d(leaderScore, [150, 200, 225, 250, 275, 290]),       // 7 buckets: detailed endgame phases
      
      // HAND QUALITY & TRIPS (6) - What can we play?
      b(features.hasLegal),                                 // Can play legal
      d(features.bestLegalRaw, [5, 15, 25, 35, 45]),          // 5 buckets: legal hand strength
      features.closestToTrips,                             // 0=have, 1=close, 2=far
      d(features.tripsDelta, [-20, -10, 0, 10, 20]),       // 6 buckets: opportunity cost spectrum
      d(features.bestSafeRaw, [15, 20, 23, 26]),           // 5 buckets: safe illegal zones
      b(canPlayDangerous),                                 // 27+ option
      
      // AUDIT DYNAMICS (5) - Risk/reward balance with detail
      Math.min(features.auditTrack, 4),                    // Track position
      b(features.wouldTriggerExternal),                    // Would we trigger?
      b(features.hasValidAuditHand),                       // Can audit now?
      d(auditROI, [-2, -1, -0.5, 0, 0.5, 1, 2, 3, 4, 5]),          // 8 buckets: detailed ROI
      d(features.myFloorCrime, [20, 50, 80, 100, 150]),      // 6 buckets: vulnerability levels
      
      // OPPONENT TRACKING (7) - Who to target with granular data
      d(features.opp1Score, [50, 100, 150, 200, 250]),      // 6 buckets per opponent
      d(features.opp1FloorCrime, [20, 50, 80, 100, 150]), // 7 crime buckets
      d(features.opp2Score, [50, 100, 150, 200, 250]),
      d(features.opp2FloorCrime, [20, 50, 80, 100, 150]),
      d(features.opp3Score, [50, 100, 150, 200, 250]),
      d(features.opp3FloorCrime, [20, 50, 80, 100, 150]),
      features.bestAuditTarget >= 0 ? features.bestAuditTarget : -1,
      
      // GAME CONTEXT (3) - Phase awareness
      features.gamePhase,                                  // 0-3 already granular
      b(features.isEndgame),                              // Critical phase
      b(features.canBlockLeader),                         // Can stop winner
      
      // OPPONENT STRATEGY FINGERPRINTS (9) - For meta-evolution in PureWarzone
      // These enable learning counter-strategies based on opponent behavior patterns
      d(features.opp1Aggression, [0.2, 0.4, 0.6, 0.8]),   // 5 buckets: passive to hyper-aggressive
      d(features.opp1Control, [0.05, 0.15, 0.3]),         // 4 buckets: rare to frequent auditor
      d(features.opp1Risk, [20, 40, 60, 100]),            // 5 buckets: crime accumulation levels
      
      d(features.opp2Aggression, [0.2, 0.4, 0.6, 0.8]),   // Same discretization for consistency
      d(features.opp2Control, [0.05, 0.15, 0.3]),         
      d(features.opp2Risk, [20, 40, 60, 100]),            
      
      d(features.opp3Aggression, [0.2, 0.4, 0.6, 0.8]),   
      d(features.opp3Control, [0.05, 0.15, 0.3]),         
      d(features.opp3Risk, [20, 40, 60, 100])             
    ].join('-');
  }

  // Get available actions
  private getAvailableActions(state: MatchState, playerId: number): Action[] {
    const player = state.players[playerId];
    const opponents = state.players.filter(p => p.id !== playerId);
    const features = this.extractFeatures(state, playerId);
    const actions: Action[] = [];
    
    // PureWarzone: Use ULTRA FAST minimal hand analysis
    if (this.name.includes('PureWarzone')) {
      // DON'T clear play options here - only at episode end
      // Just overwrite as needed
      
      // ALWAYS add pass as an option first
      actions.push('pass');
      
      // Calculate eligible audit targets once
      const auditTargets: number[] = [];
      for (let i = 0; i < state.players.length; i++) {
        if (i !== playerId && this.calculateActualCrime(state.players[i]) > 5) {
          auditTargets.push(i);
        }
      }
      
      // Add audit actions
      for (const targetId of auditTargets) {
        actions.push(`audit-${targetId}` as Action);
      }
      
      // Skip play options if no cards
      if (player.hand.length === 0) {
        return actions;
      }
      
      // Create analyzer and get minimal options (max 10)
      const analyzer = new HandAnalyzerUltraFast(player.hand);
      const indexOptions = analyzer.getMinimalOptions();
      
      // Add each option (already limited to 10 max)
      for (const indices of indexOptions) {
        const actionKey = HandAnalyzerUltraFast.toAction(indices);
        // Store cards for later (when action is chosen)
        const cards = analyzer.getCards(indices);
        this.playOptions.set(actionKey, cards);
        actions.push(actionKey);
      }
    } else {
      // Non-PureWarzone: Use simple actions
      // Legal play - always prefer if strong enough
      if (features.hasLegal && features.bestLegalRaw > 15) {
        actions.push('play-legal');
      }
      
      // Safe illegal - the sweet spot (20-26 raw value)
      if (features.bestSafeRaw >= 20 && features.bestSafeRaw <= 26 && !features.wouldTriggerExternal) {
        actions.push('play-safe');
      }
      
      // Dangerous play - only when desperate or track is low
      const canPlayDangerous = features.bestDumpRaw >= 27;
      const desperate = features.pointsBehindLeader > 50 && features.isEndgame;
      const safeToSpike = features.auditTrack <= 2;
      
      if (canPlayDangerous && (desperate || safeToSpike) && !features.wouldTriggerExternal) {
        actions.push('play-dump');
      }
    }
    
    // AUDIT OPTION - Let AI learn when to audit
    if (features.hasValidAuditHand) {
      const maxCrime = Math.max(features.opp1FloorCrime, features.opp2FloorCrime, features.opp3FloorCrime);
      const roi = features.myAuditHandValue > 0 ? 
                  features.maxHangingValue / features.myAuditHandValue : 0;
      
      // Leader detection with PROGRESSIVE URGENCY
      const leader = opponents.reduce((best, opp) => 
        opp.score > best.score ? opp : best, opponents[0]);
      const leaderScore = leader ? leader.score : 0;
      
      // COLLUSION TRIGGER POINTS
      const emergencyMode = leaderScore >= 290;   // STOP THEM AT ALL COSTS
      const panicMode = leaderScore >= 275;       // HIGH URGENCY
      const threatMode = leaderScore >= 250;      // MEDIUM URGENCY
      const watchMode = leaderScore >= 225;       // START WATCHING
      
      // PROGRESSIVE AUDIT URGENCY - More likely to audit as leader approaches victory
      let auditPossible = false;
      
      if (emergencyMode) {
        // EMERGENCY: Always consider audit if we have the cards
        auditPossible = features.hasValidAuditHand;
        if (auditPossible && Math.random() < 0.1) {
          console.log(`🚨 EMERGENCY MODE: Leader at ${leaderScore}! ${this.name} considering audit!`);
        }
      } else if (panicMode) {
        // PANIC: Very low threshold but still strategic
        auditPossible = features.hasValidAuditHand && (
          (maxCrime > 5 && features.bestAuditTarget === leader.id) || // Target leader with ANY crime
          (roi > -2 && features.bestAuditTarget === leader.id) ||     // Accept losses to stop leader
          (maxCrime > 15 && roi > -3)                                 // Or significant crime even at loss
        );
      } else if (threatMode) {
        // THREAT: Lower threshold for strategic auditing
        auditPossible = features.hasValidAuditHand && (
          (maxCrime > 10 && roi > -1.5) ||        // Some crime with acceptable loss
          (features.canBlockLeader && roi > -2) || // Block leader even at moderate loss
          (roi > -0.5)                             // Near break-even audits
        );
      } else if (watchMode) {
        // WATCH: Starting to monitor, but still require meaningful conditions
        auditPossible = (maxCrime > 15 && roi > -1) ||   // Decent crime with acceptable ROI
                       (roi > 0) ||                       // At least break-even
                       (features.auditTrack >= 4 && maxCrime > 10); // Very high track with some crime
      } else {
        // Normal conditions - require strategic reasoning for audits
        auditPossible = (maxCrime >= 20 && roi > -1) ||  // Significant crime AND decent ROI
                       (roi > 0.5) ||                     // Profitable audit
                       (features.canBlockLeader && maxCrime > 10); // Can hurt leader with some crime
        // Removed: random audits just because track is high or minimal crime exists
      }
      
      if (auditPossible && features.hasValidAuditHand) {
        // Add all possible audit targets as separate actions
        // This allows the AI to learn WHO to audit in different situations
        for (const opponent of state.players) {
          if (opponent.id === playerId) continue;
          
          // Only add as option if they have meaningful crime
          const crime = this.calculateActualCrime(opponent);
          if (crime > 5) { // Some minimal crime threshold
            actions.push(`audit-${opponent.id}` as Action);
          }
        }
        
        // Log collusion mindset occasionally
        if (threatMode && Math.random() < 0.05 && actions.some(a => a.startsWith('audit-'))) {
          console.log(`⚔️ ${this.name} ready to collude: Leader at ${leaderScore}, Multiple audit targets available!`);
        }
      }
    }
    
    // Pass - strategic when hand is weak, building trips, or has potential
    const weakHand = player.hand.length <= 4 && !features.hasLegal;
    const buildingTrips = features.closestToTrips === 1 && features.tripsDelta > 10; // Close to trips with good audit value
    const highPotential = features.handBuildPotential > 0.5 && player.hand.length < 7; // High potential to improve
    
    // Make pass available as an option - let Q-learning decide when it's best
    if (weakHand || buildingTrips || highPotential || (!features.hasLegal && features.bestSafeRaw < 15)) {
      actions.push('pass');
    }
    
    // Ensure at least one action is available
    if (actions.length === 0) {
      actions.push('pass');
    }
    
    return actions;
  }

  // Get Q-value
  private getQ(stateKey: string, action: Action): number {
    this.perfMetrics.getQCalls++;
    if (!this.qTable.has(stateKey)) {
      // Don't create new states in getQ to avoid bloat
      return 0;
    }
    const actionValues = this.qTable.get(stateKey)!;
    return actionValues.get(action) || 0;
  }

  // Update Q-value - no size limits for deep learning
  private updateQ(stateKey: string, action: Action, value: number) {
    this.perfMetrics.updateQCalls++;
    if (!this.qTable.has(stateKey)) {
      this.qTable.set(stateKey, new Map());
    }
    this.qTable.get(stateKey)!.set(action, value);
  }

  // Choose action using epsilon-greedy
  public chooseAction(state: MatchState, playerId: number, precomputedFeatures?: StateFeatures): AIDecision {
    const startTime = performance.now();
    this.perfMetrics.chooseActionCalls++;
    this.perfMetrics.turnsLastEpisode++;
    
    // TIER 1 OPTIMIZATION: Use precomputed features if provided
    const features = precomputedFeatures || this.extractFeatures(state, playerId);
    const stateKey = this.stateToKey(features);
    const availableActions = this.getAvailableActions(state, playerId);
    
    if (availableActions.length === 0) {
      return { doInternal: false, production: { type: 'pass' } };
    }
    
    let selectedAction: Action;
    
    // Epsilon-greedy: explore vs exploit
    if (Math.random() < this.epsilon) {
      // EXPLORATION: Pure random action
      selectedAction = availableActions[Math.floor(Math.random() * availableActions.length)];
      this.stats.exploration = this.epsilon;
    } else {
      // EXPLOITATION: Use Q-values, with intelligent initialization
      const hasQValues = this.qTable.has(stateKey);
      
      // Early game heuristic when no Q-values exist yet
      if (!hasQValues && this.stats.episodesCompleted < 20 && !this.name.includes('PureWarzone')) {
        // Use simple heuristics for better-than-random baseline (NOT for PureWarzone)
        if (features.hasLegal && features.bestLegalRaw > 20) {
          selectedAction = 'play-legal';
        } else if (features.bestSafeRaw >= 20 && features.auditTrack < 4) {
          selectedAction = 'play-safe';
        } else if (features.hasValidAuditHand && features.maxHangingValue > 10) {
          // Find best audit target for heuristic
          selectedAction = features.bestAuditTarget >= 0 ? 
            `audit-${features.bestAuditTarget}` as Action : 'pass';
        } else {
          // Fallback to random
          selectedAction = availableActions[Math.floor(Math.random() * availableActions.length)];
        }
        
        // Ensure selected action is available
        if (!availableActions.includes(selectedAction)) {
          selectedAction = availableActions[Math.floor(Math.random() * availableActions.length)];
        }
      } else {
        // Standard Q-value selection
        let bestQ = -Infinity;
        selectedAction = availableActions[0];
        
        for (const action of availableActions) {
          const q = this.getQ(stateKey, action);
          if (q > bestQ) {
            bestQ = q;
            selectedAction = action;
          }
        }
        
        // Tie-breaking: if all Q-values are equal (likely 0), add randomness
        if (bestQ === 0) {
          const equalActions = availableActions.filter(a => this.getQ(stateKey, a) === bestQ);
          if (equalActions.length > 1 && Math.random() < 0.1) {
            // 10% chance to pick randomly among equal values
            selectedAction = equalActions[Math.floor(Math.random() * equalActions.length)];
          }
        }
      }
    }
    
    // Track action usage for validation (PureWarzone only)
    if (this.name.includes('PureWarzone')) {
      let actionType: string;
      if (selectedAction.startsWith('p') && selectedAction.length > 1 && selectedAction[1] >= '0' && selectedAction[1] <= '9') {
        // New ultra-fast granular plays (p01, p012, etc)
        actionType = 'granular-play';
      } else if (selectedAction.startsWith('play-')) {
        // Legacy plays (shouldn't happen)
        const isLegacy = ['play-legal', 'play-safe', 'play-dump'].includes(selectedAction);
        actionType = isLegacy ? 'legacy-play' : 'old-granular';
      } else if (selectedAction.startsWith('audit-')) {
        actionType = 'audit';
      } else {
        // Pass and other basic actions
        actionType = selectedAction;
      }
      this.actionStats.set(actionType, (this.actionStats.get(actionType) || 0) + 1);
    }
    
    // Convert action to AIDecision
    const decision = this.actionToDecision(state, playerId, selectedAction);
    
    // Track if this was an audit
    if (selectedAction.startsWith('audit-')) {
      this.perfMetrics.auditsLastEpisode++;
    }
    
    // Track turn time
    const turnTime = performance.now() - startTime;
    this.perfMetrics.turnCount++;
    this.perfMetrics.totalTurnTime += turnTime;
    this.perfMetrics.avgTurnTime = this.perfMetrics.totalTurnTime / this.perfMetrics.turnCount;
    
    return decision;
  }

  // Convert action to game decision
  private actionToDecision(state: MatchState, playerId: number, action: Action): AIDecision {
    const player = state.players[playerId];
    // TIER 1 OPTIMIZATION: Use cached hand analysis
    const { legal, safe } = this.getCachedHandAnalysis(player.hand);
    
    switch (action) {
      case 'play-legal':
        // Legacy action - shouldn't happen in PureWarzone
        return {
          doInternal: false,
          production: legal ? { type: 'legal', cards: legal.cards } : { type: 'pass' }
        };
      
      case 'play-safe':
        // Legacy action - shouldn't happen in PureWarzone
        return {
          doInternal: false,
          production: safe ? { type: 'safe', cards: safe.cards } : { type: 'pass' }
        };
      
      case 'play-dump':
        return {
          doInternal: false,
          production: { type: 'illegal', cards: player.hand }
        };
      
      case 'audit-0':
      case 'audit-1':
      case 'audit-2':
      case 'audit-3': {
        // Parse the target player ID from the action
        const targetId = parseInt(action.split('-')[1]);
        
        // Verify target is valid and not self
        if (targetId === playerId) {
          return { doInternal: false, production: { type: 'pass' } };
        }
        
        // Verify target exists in the game
        const target = state.players.find(p => p.id === targetId);
        if (!target) {
          return { doInternal: false, production: { type: 'pass' } };
        }
        
        return { doInternal: true, targetId, production: { type: 'pass' } };
      }
      
      default: {
        // Handle dynamic play actions for PureWarzone (now using 'p' prefix like p01, p012)
        if ((action.startsWith('play-') || action.startsWith('p')) && this.playOptions.has(action)) {
          const cards = this.playOptions.get(action)!;
          
          // Determine if it's legal or illegal
          const isLegal = isLegalExact(cards);
          
          return {
            doInternal: false,
            production: {
              type: isLegal ? 'legal' : 'illegal',
              cards: cards
            }
          };
        }
        
        // Pass as fallback
        return { doInternal: false, production: { type: 'pass' } };
      }
    }
  }

  // Track if opponent is a learner for competitive rewards
  private isLearnerOpponent(player: any): boolean {
    return player.persona?.toString().includes('Learner') || 
           player.persona?.toString().includes('Warzone') || false;
  }
  
  // Calculate immediate reward - WARZONE VERSION
  public calculateReward(
    prevState: MatchState,
    action: Action,
    newState: MatchState,
    playerId: number
  ): number {
    let reward = 0;
    
    const prevPlayer = prevState.players[playerId];
    const newPlayer = newState.players[playerId];
    const prevFeatures = this.extractFeatures(prevState, playerId);
    
    // PURE WARZONE: Skip ALL intermediate rewards
    const isPureWarzone = this.name.includes('PureWarzone');
    if (isPureWarzone) {
      // Only check game end - nothing else matters
      if (newState.winnerId !== undefined) {
        const gameKey = this.currentGameId || `game-${Date.now()}`;
        const shouldCountGame = !this.countedGames.has(gameKey);
        
        if (shouldCountGame) {
          this.countedGames.add(gameKey);
          this.stats.gamesPlayed++;
          this.stats.totalScore += newPlayer.score;
          this.stats.avgScore = this.stats.totalScore / this.stats.gamesPlayed;
          
          if (newState.winnerId === playerId) {
            this.stats.gamesWon++;
            this.stats.winRate = this.stats.gamesWon / this.stats.gamesPlayed;
            reward = this.rewards.winGame; // +1000
            
            if (this.stats.gamesWon % 50 === 0) {
              console.log(`🎯 ${this.name}: ${this.stats.gamesWon} wins / ${this.stats.gamesPlayed} games (${Math.round(this.stats.winRate * 100)}%)`);
            }
          } else {
            this.stats.winRate = this.stats.gamesWon / this.stats.gamesPlayed;
            reward = this.rewards.loseGame; // -1000
          }
        }
      }
      return reward; // Exit early for pure warzone
    }
    
    // Regular rewards for non-pure modes
    const pointsGained = newPlayer.score - prevPlayer.score;
    reward += pointsGained * this.rewards.pointGain;
    
    // LEAD DOMINANCE: Being ahead is power
    const scores = newState.players.map(p => p.score).sort((a, b) => b - a);
    if (newPlayer.score === scores[0] && scores[1] !== undefined) {
      const leadMargin = newPlayer.score - scores[1];
      reward += leadMargin * this.rewards.leadMaintenance;
    }
    
    // AUDIT SUCCESS REWARD: Basic reward for any successful audit
    if (action.startsWith('audit-')) {
      // Give basic audit reward immediately (helps discovery in PureWarzone)
      reward += this.rewards.successfulAudit;
    }
    
    // ANTI-LEADER COLLUSION: Progressive urgency to stop winners
    if (action.startsWith('audit-')) {
      const prevLeader = [...prevState.players].sort((a, b) => b.score - a.score)[0];
      const newLeader = [...newState.players].sort((a, b) => b.score - a.score)[0];
      
      // Parse who we audited from the action
      const auditedPlayerId = parseInt(action.split('-')[1]);
      
      // Did we audit the leader?
      if (auditedPlayerId === prevLeader.id && prevLeader.id !== playerId) {
        // Base reward for auditing leader
        reward += this.rewards.eliminateLeader;
        
        // PROGRESSIVE COLLUSION - Exponentially higher rewards as leader approaches 300
        if (prevLeader.score >= 290) {
          reward += this.rewards.collusionAudit290; // +600 EMERGENCY
          if (Math.random() < 0.2) { // Log occasionally
            console.log(`🚨 EMERGENCY COLLUSION: ${this.name} attacked leader at ${prevLeader.score}!`);
          }
        } else if (prevLeader.score >= 275) {
          reward += this.rewards.collusionAudit275; // +400 HIGH URGENCY
        } else if (prevLeader.score >= 250) {
          reward += this.rewards.collusionAudit250; // +250 MEDIUM URGENCY
        }
        
        // Massive bonus if we actually stopped them from winning
        const scoreDrop = prevLeader.score - newLeader.score;
        if (scoreDrop > 15 && prevLeader.score >= 270) {
          reward += this.rewards.preventWin;
          if (Math.random() < 0.3) { // Log occasionally
            console.log(`💀 ${this.name} cut leader down by ${scoreDrop} points!`);
          }
        }
      }
      
      // COLLUSION COORDINATION - Reward gang tactics
      // Check if other AIs also recently audited (simplified check)
      const recentAudits = this.turnHistory.slice(-3).filter(h => 
        h.action === 'audit' &&  // Use the correct action type
        h.playerId !== playerId
      );
      
      // If we're auditing the leader and others did too recently
      if (recentAudits.length > 0 && auditedPlayerId === prevLeader.id) {
        reward += this.rewards.followupAudit; // +100 for coordination
        
        // Multiple AIs attacking together
        if (recentAudits.length >= 2) {
          reward += this.rewards.pileOn; // +150 for gang attack
          if (Math.random() < 0.2) {
            console.log(`⚔️ PILE ON! ${this.name} joins the assault on leader!`);
          }
        }
      }
      
      // Still reward crushing the weakest (but less important)
      const weakest = [...prevState.players].sort((a, b) => a.score - b.score)[0];
      if (auditedPlayerId === weakest.id && weakest.id !== playerId) {
        reward += this.rewards.crushWeakest;
      }
    }
    
    // SELF-DESTRUCTION PENALTY
    if (prevState.auditTrack < 5 && newState.auditTrack >= 5) {
      reward += this.rewards.causeExternal;
    }
    
    // EXPLORATION BONUS: Try new strategies
    // Track action patterns and reward deviation when losing
    if (prevFeatures.myScoreRank > 1) {  // Not in first place
      const recentActions = this.turnHistory
        .filter(t => t.playerId === playerId)
        .slice(-5)
        .map(t => t.action);
      
      const isNewPattern = recentActions.length < 2 || 
                          recentActions[recentActions.length - 1] !== action;
      
      if (isNewPattern) {
        reward += this.rewards.unexploredAction;
      }
      
      // Strategy shift bonus when changing approach while losing
      const wasPassive = recentActions.filter(a => a === 'pass' || a === 'legal').length > 3;
      const nowAggressive = action.startsWith('audit-') || action === 'play-dump';
      if (wasPassive && nowAggressive) {
        reward += this.rewards.strategyShift;
      }
    }
    
    // Game end rewards
    if (newState.winnerId !== undefined) {
      // Only count each game once using the gameId
      const gameKey = this.currentGameId || `game-${Date.now()}`;
      const shouldCountGame = !this.countedGames.has(gameKey);
      
      if (shouldCountGame) {
        this.countedGames.add(gameKey);
        
        // Update opponent profiles for meta-evolution (PureWarzone only)
        this.updateOpponentProfiles(newState, playerId);
        
        // Track game participation  
        this.stats.gamesPlayed++;
        this.stats.totalScore += newPlayer.score;
        
        if (newState.winnerId === playerId) {
          this.stats.gamesWon++;
          
          // Log win by starting position for analysis (every 100 games)
          if (this.stats.gamesWon % 100 === 0 && this.name.includes('Warzone')) {
            console.log(`${this.name} won ${this.stats.gamesWon} games (${Math.round(this.stats.winRate * 100)}% win rate)`);
          }
        }
        
        this.stats.avgScore = this.stats.totalScore / this.stats.gamesPlayed;
        this.stats.winRate = this.stats.gamesWon / this.stats.gamesPlayed;
      }
      
      // Always give rewards for game end, even if we already counted the game
      if (newState.winnerId === playerId) {
        reward += this.rewards.winGame;
        
        // COMPETITIVE BONUS: Extra reward for beating other learners
        const defeatedLearners = newState.players
          .filter(p => p.id !== playerId && this.isLearnerOpponent(p))
          .length;
        reward += this.rewards.beatLearner * defeatedLearners;
      } else {
        // HARSH PUNISHMENT for losing
        reward += this.rewards.loseGame;
        
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
    playerId: number,
    precomputedFeatures?: StateFeatures
  ) {
    this.perfMetrics.learnCallCount++;
    
    // TIER 1 OPTIMIZATION: Use precomputed features if provided
    const prevFeatures = precomputedFeatures || this.extractFeatures(prevState, playerId);
    const prevKey = this.stateToKey(prevFeatures);
    
    const reward = this.calculateReward(prevState, action, newState, playerId);
    
    // Track feature importance when we get good rewards
    if (reward > 10) {
      this.trackFeatureImportance(prevFeatures, reward);
    }
    
    // Q-learning update
    const oldQ = this.getQ(prevKey, action);
    
    if (newState.winnerId === undefined) {
      // Game continues - consider future rewards
      // For PureWarzone, use a simplified future reward estimate instead of full feature extraction
      let maxNextQ = 0;
      
      if (this.name.includes('PureWarzone')) {
        // Simple heuristic: future value based on position
        const scores = newState.players.map(p => p.score).sort((a, b) => b - a);
        const myScore = newState.players[playerId].score;
        const position = scores.indexOf(myScore) + 1;
        
        // Rough estimate of future value based on position
        maxNextQ = position === 1 ? 100 : position === 2 ? 50 : position === 3 ? -50 : -100;
      } else {
        // Non-PureWarzone: Do the full calculation
        const newFeatures = this.extractFeatures(newState, playerId);
        const newKey = this.stateToKey(newFeatures);
        const nextActions = this.getAvailableActions(newState, playerId);
        
        for (const nextAction of nextActions) {
          maxNextQ = Math.max(maxNextQ, this.getQ(newKey, nextAction));
        }
      }
      
      // Q-learning formula: Q(s,a) = Q(s,a) + α[r + γ*max(Q(s',a')) - Q(s,a)]
      const newQ = oldQ + this.alpha * (reward + this.gamma * maxNextQ - oldQ);
      this.updateQ(prevKey, action, newQ);
    } else {
      // Terminal state - no future rewards
      const newQ = oldQ + this.alpha * (reward - oldQ);
      this.updateQ(prevKey, action, newQ);
    }
    
    // REMOVED: saveToStorage() - Was causing massive slowdown
    // Now only save periodically from AITrainer
  }

  // Simple gradual exploration and learning rate decay
  public updateExploration(episodesCompleted: number) {
    const isPureWarzone = this.name.includes('PureWarzone');
    const isWarzone = this.name.includes('Warzone');
    
    // Calculate new exploration rate
    this.epsilon = this.calculateEpsilon(episodesCompleted, isPureWarzone, isWarzone);
    
    // Calculate new learning rate (gradual decay to 7.5% at 2500 episodes)
    this.alpha = this.calculateAlpha(episodesCompleted);
    
    // PERFORMANCE FIX: Clear feature tracking Maps periodically to prevent memory bloat
    if (episodesCompleted % 50 === 0 && episodesCompleted > 0) {
      this.featureRewardCorrelation.clear();
      this.featureUsageCount.clear();
      // Keep only recent distribution data
      this.featureDistributions.forEach((dist, feature) => {
        if (dist.length > 1000) {
          this.featureDistributions.set(feature, dist.slice(-500)); // Keep last 500 samples
        }
      });
    }
    
    // Logging
    if (episodesCompleted % 100 === 0 && episodesCompleted > 0) {
      const winRate = this.stats.winRate;
      console.log(`${this.name}: Episode ${episodesCompleted}, WinRate: ${(winRate * 100).toFixed(1)}%, ` +
                  `Explore: ${(this.epsilon * 100).toFixed(1)}%, Learn: ${(this.alpha * 100).toFixed(1)}%`);
    }
    
    this.stats.exploration = this.epsilon;
    this.stats.episodesCompleted = episodesCompleted;
  }
  
  private calculateEpsilon(episodesCompleted: number, isPureWarzone: boolean, isWarzone: boolean): number {
    // PureWarzone: Start at 100%, reach ~17.5% by episode 1000
    if (isPureWarzone) {
      if (episodesCompleted < 30) {
        return 1.0; // Stay at 100% for first 100 episodes
      }
      
      const adjustedEpisodes = episodesCompleted - 30;
      const pureWarzoneDecay = 0.995; // Reaches ~17.5% by episode 1000
      const newEpsilon = Math.pow(pureWarzoneDecay, adjustedEpisodes);
      
      return Math.max(0.03, newEpsilon); // 3% minimum
    }
    
    // Regular agents: Simple exponential decay
    const startEpsilon = isWarzone ? 0.95 : 0.8;
    const decayRate = isWarzone ? 0.996 : 0.995;
    const minEpsilon = 0.03; // 3% minimum
    
    const newEpsilon = startEpsilon * Math.pow(decayRate, episodesCompleted);
    return Math.max(minEpsilon, newEpsilon);
  }
  
  private calculateAlpha(episodesCompleted: number): number {
    // Simple gradual decay from initial value to 7.5% at 2500 episodes
    const startAlpha = this.name.includes('Warzone') ? 0.15 : 0.12;
    const targetAlpha = 0.075; // 7.5% at 2500 episodes
    const targetEpisodes = 2500;
    
    if (episodesCompleted >= targetEpisodes) {
      return targetAlpha;
    }
    
    // Linear interpolation from start to target
    const progress = episodesCompleted / targetEpisodes;
    const alpha = startAlpha - (startAlpha - targetAlpha) * progress;
    
    return Math.max(targetAlpha, Math.min(startAlpha, alpha));
  }
  
  // Track which features correlate with high rewards
  private trackFeatureImportance(features: StateFeatures, reward: number) {
    // CRITICAL THRESHOLDS
    const canPlayDangerous = features.bestDumpRaw >= 27;
    const nearExternal = features.auditTrack >= 4;
    const leaderNearWin = Math.max(features.opp1Score, features.opp2Score, features.opp3Score) >= 250;
    
    // Track the features that actually matter
    if (features.hasTripsPlus) this.updateFeatureImportance('hasTripsPlus', reward);
    if (features.hasValidAuditHand) this.updateFeatureImportance('canAudit', reward);
    if (features.wouldTriggerExternal) this.updateFeatureImportance('wouldTriggerExternal', -Math.abs(reward));
    if (canPlayDangerous) this.updateFeatureImportance('has27+Option', reward);
    if (features.bestSafeRaw >= 20 && features.bestSafeRaw <= 26) {
      this.updateFeatureImportance('optimalSafeRange', reward);
    }
    
    // Position & timing features
    if (features.myScoreRank === 1) this.updateFeatureImportance('inLead', reward);
    if (features.pointsBehindLeader > 30) this.updateFeatureImportance('farBehind', reward * 0.5);
    if (leaderNearWin) this.updateFeatureImportance('leaderNearWin', reward * 2);
    if (nearExternal) this.updateFeatureImportance('nearExternal', reward * 0.8);
    
    // Audit ROI tracking
    if (features.hasValidAuditHand && features.myAuditHandValue > 0) {
      const roi = features.maxHangingValue / features.myAuditHandValue;
      if (roi > 1) this.updateFeatureImportance('profitableAuditROI', reward);
      if (roi < -0.5) this.updateFeatureImportance('lossyAuditROI', reward * 0.5);
    }
    
    // Track critical distributions for dynamic bucketing
    this.collectDistribution('myScore', features.myScore);
    this.collectDistribution('27threshold', features.bestDumpRaw >= 27 ? 1 : 0);
    this.collectDistribution('auditProfit', features.maxHangingValue);
    this.collectDistribution('crimeLevel', features.myFloorCrime);
  }
  
  private updateFeatureImportance(feature: string, reward: number) {
    const current = this.featureRewardCorrelation.get(feature) || 0;
    const count = this.featureUsageCount.get(feature) || 0;
    
    // Running average of reward correlation
    this.featureRewardCorrelation.set(feature, (current * count + reward) / (count + 1));
    this.featureUsageCount.set(feature, count + 1);
  }
  
  private collectDistribution(feature: string, value: number) {
    if (!this.featureDistributions.has(feature)) {
      this.featureDistributions.set(feature, []);
    }
    const dist = this.featureDistributions.get(feature)!;
    dist.push(value);
    
    // Keep only last 1000 samples to prevent memory bloat
    if (dist.length > 1000) {
      dist.shift();
    }
  }
  
  // Get top features by importance
  public getFeatureImportance(): Array<[string, number]> {
    const importance: Array<[string, number]> = [];
    
    for (const [feature, reward] of this.featureRewardCorrelation) {
      const count = this.featureUsageCount.get(feature) || 1;
      // Only include features we've seen enough times
      if (count > 10) {
        importance.push([feature, reward]);
      }
    }
    
    return importance.sort((a, b) => b[1] - a[1]);
  }
  
  // Get dynamic buckets based on actual data distribution
  public getDynamicBuckets(feature: string, numBuckets: number): number[] | null {
    const dist = this.featureDistributions.get(feature);
    if (!dist || dist.length < 100) return null; // Need enough data
    
    const sorted = [...dist].sort((a, b) => a - b);
    const buckets: number[] = [];
    
    // Calculate quantiles
    for (let i = 1; i < numBuckets; i++) {
      const idx = Math.floor((i / numBuckets) * sorted.length);
      buckets.push(sorted[idx]);
    }
    
    return buckets;
  }
  
  // Set the current game ID and reset per-game data
  public setGameId(gameId: string) {
    this.currentGameId = gameId;
    // Clear turn history to prevent memory bloat
    this.turnHistory = [];
    // Track episode timing and reset per-episode counters
    this.perfMetrics.episodeStartTime = performance.now();
    this.perfMetrics.turnsLastEpisode = 0;
    this.perfMetrics.auditsLastEpisode = 0;
    this.perfMetrics.extractFeaturesLastEpisode = this.perfMetrics.extractFeaturesCount;
  }
  
  // Mark episode as complete and track timing
  public markEpisodeComplete() {
    if (this.perfMetrics.episodeStartTime > 0) {
      this.perfMetrics.lastEpisodeTime = performance.now() - this.perfMetrics.episodeStartTime;
      // Calculate per-episode metrics
      this.perfMetrics.extractFeaturesLastEpisode = 
        this.perfMetrics.extractFeaturesCount - this.perfMetrics.extractFeaturesLastEpisode;
    }
    
    // Clear playOptions at end of each episode to prevent memory buildup
    this.playOptions.clear();
  }

  // Save learned Q-table
  public saveToStorage() {
    try {
      const data = this.exportKnowledge();
      // Save to agent-specific key
      const storageKey = `rheinhessen-ai-learning-${this.name}`;
      
      // Just save it - no size limits!
      const dataStr = JSON.stringify(data);
      const sizeMB = dataStr.length / (1024 * 1024);
      if (this.opponentMemory.size > 0 || Math.random() < 0.05) {
        console.log(`Saving ${this.name}: ${sizeMB.toFixed(2)}MB, ${this.qTable.size} states, ${this.opponentMemory.size} profiles`);
      }
      
      // Try localStorage first
      try {
        localStorage.setItem(storageKey, dataStr);
      } catch (quotaError) {
        // If localStorage fails, we'll handle it below
        throw quotaError;
      }
    } catch (e: any) {
      if (e.name === 'QuotaExceededError') {
        console.error('Storage quota exceeded - Creating downloadable backup!');
        
        // Export the full data
        const data = this.exportKnowledge();
        const dataStr = JSON.stringify(data);
        const sizeMB = dataStr.length / (1024 * 1024);
        
        // DON'T auto-download - just warn the user
        console.warn(`⚠️ Storage quota exceeded for ${this.name}!`);
        console.warn(`📊 Attempted to save: ${sizeMB.toFixed(2)}MB with ${this.qTable.size} states`);
        console.warn(`💡 Consider clearing storage or exporting manually`);
        
        // Clear ONLY other agents' data to make some room
        for (let key in localStorage) {
          if (key.startsWith('rheinhessen-ai-learning-') && !key.includes(this.name)) {
            localStorage.removeItem(key);
            console.log(`Cleared other agent: ${key}`);
          }
        }
        
        // Try to save a minimal version at least
        try {
          const minimalData = {
            ...data,
            qTable: {} // Save everything except the huge Q-table
          };
          const storageKey = `rheinhessen-ai-learning-${this.name}-meta`;
          localStorage.setItem(storageKey, JSON.stringify(minimalData));
          console.log('Saved metadata to localStorage, full data in downloaded file');
        } catch (e2) {
          console.log('Could not save even metadata, use the downloaded file');
        }
      } else {
        console.error('Failed to save learning data:', e);
      }
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
        featureVersion: 'v3-meta-evolution',  // Updated version with opponent modeling
        stateCount: this.qTable.size
      },
      batchName: this.batchName,
      countedGames: Array.from(this.countedGames), // Track which games we've counted
      // Save opponent profiles for meta persistence
      opponentProfiles: Array.from(this.opponentMemory.entries()).map(([id, profile]) => ({
        id,
        profile
      }))
    };
  }

  // Load learned Q-table
  private loadFromStorage() {
    try {
      // Try agent-specific key first
      const storageKey = `rheinhessen-ai-learning-${this.name}`;
      let saved = localStorage.getItem(storageKey);
      
      // Fall back to generic key for backwards compatibility
      if (!saved) {
        saved = localStorage.getItem('rheinhessen-ai-learning');
      }
      
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
      
      // Restore batch name
      if (data.batchName) {
        this.batchName = data.batchName;
      }
      
      // Restore opponent profiles for meta-evolution continuity
      if (data.opponentProfiles && data.opponentProfiles.length > 0) {
        this.opponentMemory = new Map();
        for (const entry of data.opponentProfiles) {
          this.opponentMemory.set(entry.id, entry.profile);
        }
      }
    } catch (e) {
      console.error('Failed to import learning data:', e);
    }
  }

  // Reset learning
  public reset() {
    this.qTable.clear();
    this.opponentMemory.clear();  // Clear opponent profiles for fresh meta discovery
    this.playOptions.clear();     // Clear card play options
    this.handCache.clear();       // TIER 1 OPTIMIZATION: Clear cache on reset
    this.actionStats.clear();     // Clear action stats to prevent memory buildup
    
    // Reset to appropriate starting values based on type
    const isWarzone = this.name.includes('Warzone');
    this.epsilon = isWarzone ? 0.95 : 0.8;  // Start high for true random discovery
    this.alpha = isWarzone ? 0.15 : 0.12;   // Conservative learning rates from the start
    
    this.turnHistory = [];
    this.countedGames.clear();
    this.currentGameId = null;
    
    this.stats = {
      gamesPlayed: 0,
      gamesWon: 0,
      totalScore: 0,
      avgScore: 0,
      winRate: 0,
      exploration: this.epsilon,
      episodesCompleted: 0
    };
    
    // Remove agent-specific storage
    const storageKey = `rheinhessen-ai-learning-${this.name}`;
    localStorage.removeItem(storageKey);
    // Also try to remove generic key for backwards compatibility
    localStorage.removeItem('rheinhessen-ai-learning');
    this.batchName = '';  // Clear batch name on reset
  }
  
  // Get training info for display (batch name or episode count)
  public getTrainingInfo(): string {
    if (this.batchName) {
      return this.batchName;
    }
    // If no batch name but has episodes, show training status
    if (this.stats.episodesCompleted > 0) {
      return `${this.stats.episodesCompleted} episodes`;
    }
    // If no training at all
    return '';
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
  
  // Update opponent profiles for meta-evolution (PureWarzone feature)
  public updateOpponentProfiles(state: MatchState, myPlayerId: number) {
    // Only for PureWarzone - track how opponents play to develop counter-strategies
    if (!this.name.includes('PureWarzone')) {
      console.log(`❌ ${this.name} skipping profiles (not PureWarzone)`);
      return;
    }
    
    let profilesUpdated = 0;
    
    for (const opponent of state.players) {
      if (opponent.id === myPlayerId) continue;
      
      // Get or create profile
      const profile = this.opponentMemory.get(opponent.id) || {
        avgIllegalRate: 0.5,
        avgLegalRate: 0.2,
        avgSpikeRate: 0.1,
        avgAuditRate: 0.1,
        avgFloorCrime: 30,
        avgPassRate: 0.2,
        avgLegalStrength: 20,
        gamesObserved: 0
      };
      
      // Calculate rates from this game's history
      const oppTurns = this.turnHistory.filter(t => t.playerId === opponent.id);
      if (oppTurns.length === 0) continue;
      
      const illegalCount = oppTurns.filter(t => t.action === 'illegal').length;
      const legalCount = oppTurns.filter(t => t.action === 'legal').length;
      const auditCount = oppTurns.filter(t => t.action === 'audit').length;
      const passCount = oppTurns.filter(t => t.action === 'pass').length;
      const totalTurns = oppTurns.length;
      
      // Check for spikes (27+ plays) - approximate based on score jumps
      const spikeCount = oppTurns.filter(t => 
        t.action === 'illegal' && t.auditTicksAdded > 0
      ).length;
      
      // Calculate legal hand strength when played
      const legalTurns = oppTurns.filter(t => t.action === 'legal');
      const avgLegalScore = legalTurns.length > 0 
        ? legalTurns.reduce((sum, t) => sum + t.scoreChange, 0) / legalTurns.length
        : 20;
      
      // Use exponential moving average to adapt to changing strategies
      const learningRate = 0.15; // How quickly we adapt to new opponent behavior
      
      profile.avgIllegalRate = (1 - learningRate) * profile.avgIllegalRate + 
                               learningRate * (illegalCount / totalTurns);
      profile.avgLegalRate = (1 - learningRate) * profile.avgLegalRate + 
                            learningRate * (legalCount / totalTurns);
      profile.avgSpikeRate = (1 - learningRate) * profile.avgSpikeRate + 
                            learningRate * (spikeCount / totalTurns);
      profile.avgAuditRate = (1 - learningRate) * profile.avgAuditRate + 
                            learningRate * (auditCount / totalTurns);
      profile.avgPassRate = (1 - learningRate) * profile.avgPassRate + 
                           learningRate * (passCount / totalTurns);
      profile.avgLegalStrength = (1 - learningRate) * profile.avgLegalStrength + 
                                 learningRate * avgLegalScore;
      
      // Update floor crime (only count illegal cards as crime)
      const finalFloorCrime = this.calculateActualCrime(opponent);
      profile.avgFloorCrime = (1 - learningRate) * profile.avgFloorCrime + 
                              learningRate * finalFloorCrime;
      
      profile.gamesObserved++;
      this.opponentMemory.set(opponent.id, profile);
      profilesUpdated++;
      
      // Log strategy evolution occasionally (less verbose)
      if (profile.gamesObserved % 20 === 0 && Math.random() < 0.2) {
        const strategy = profile.avgIllegalRate > 0.5 ? 'Aggro' :
                        profile.avgFloorCrime > 250 ? 'Crime-Lord' :
                        profile.avgAuditRate > 0.03 ? 'Control' :
                        profile.avgLegalRate > 0.3 ? 'Legal-Heavy' :
                        profile.avgPassRate > 0.4 ? 'Passive' : 'Balanced';
        console.log(`📊 ${this.name} sees Opp${opponent.id} as ${strategy} (${profile.gamesObserved} games)`);
      }
    }
    
    if (profilesUpdated > 0) {
      console.log(`  📊 ${this.name}: Updated ${profilesUpdated} opponent profiles (total: ${this.opponentMemory.size})`);
    } else if (this.name.includes('PureWarzone')) {
      console.log(`  ⚠️ ${this.name}: No profiles updated (history: ${this.turnHistory.length} turns)`);
    }
  }
  
  // Helper to calculate actual crime (only illegal cards on floor)
  private calculateActualCrime(player: PlayerState): number {
    if (!player.floorGroups || player.floorGroups.length === 0) {
      return 0;
    }
    
    let crime = 0;
    for (const group of player.floorGroups) {
      // Only count illegal groups as crime
      if (!isLegalExact(group)) {
        crime += rawValue(group);
      }
    }
    return crime;
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

  // Get opponent fingerprints for debugging
  public getOpponentFingerprints(): Map<number, any> {
    return this.opponentMemory;
  }
  
  // Get learning insights (with quick mode to skip expensive computations)
  public getInsights(quickMode: boolean = false): string[] {
    const insights: string[] = [];
    
    const isWarzone = this.name.includes('Warzone');
    
    if (isWarzone) {
      insights.push(`⚔️ WARZONE MODE: Pure competition, only winning matters`);
      insights.push(`🎯 Focus: WIN AT ALL COSTS (+1000), destroy competitors`);
    } else {
      insights.push(`⚡ LEGACY MODE: Strategy-focused learning`);
    }
    
    insights.push(`🧠 Q-table: ${this.qTable.size.toLocaleString()} states`);
    
    // ALWAYS show performance metrics for debugging
    insights.push(`━━━ PERFORMANCE METRICS ━━━`);
    insights.push(`📊 Feature extractions: ${this.perfMetrics.extractFeaturesCount}`);
    insights.push(`📚 Learn calls: ${this.perfMetrics.learnCallCount}`);
    insights.push(`🎯 Choose action calls: ${this.perfMetrics.chooseActionCalls}`);
    insights.push(`⚡ Cache hits: ${this.perfMetrics.cacheHits} / misses: ${this.perfMetrics.cacheMisses}`);
    const cacheHitRate = this.perfMetrics.cacheHits + this.perfMetrics.cacheMisses > 0 
      ? (this.perfMetrics.cacheHits / (this.perfMetrics.cacheHits + this.perfMetrics.cacheMisses) * 100).toFixed(1)
      : '0';
    insights.push(`💾 Cache hit rate: ${cacheHitRate}%`);
    insights.push(`🔍 GetQ calls: ${this.perfMetrics.getQCalls}`);
    insights.push(`✏️ UpdateQ calls: ${this.perfMetrics.updateQCalls}`);
    if (this.perfMetrics.avgTurnTime > 0) {
      insights.push(`⏱️ Avg turn time: ${this.perfMetrics.avgTurnTime.toFixed(2)}ms`);
    }
    insights.push(`🎭 Play options map size: ${this.playOptions.size}`);
    insights.push(`📈 Action stats map size: ${this.actionStats.size}`);
    insights.push(`🗃️ Hand cache size: ${this.handCache.size}/${LearningAgent.MAX_HAND_CACHE_SIZE}`);
    insights.push(`🧬 Opponent memory size: ${this.opponentMemory.size}`);
    
    // Estimate memory usage
    const estimatedMemory = (
      this.qTable.size * 200 + // Each Q-state ~200 bytes
      this.playOptions.size * 100 + // Each play option ~100 bytes
      this.handCache.size * 150 + // Each cache entry ~150 bytes
      this.opponentMemory.size * 100 // Each opponent profile ~100 bytes
    ) / 1024 / 1024; // Convert to MB
    insights.push(`💾 Est. memory usage: ${estimatedMemory.toFixed(2)} MB`);
    
    if (this.perfMetrics.lastEpisodeTime > 0) {
      insights.push(`⏰ Last episode time: ${(this.perfMetrics.lastEpisodeTime / 1000).toFixed(2)}s`);
      insights.push(`🎮 Last episode: ${this.perfMetrics.turnsLastEpisode} turns, ${this.perfMetrics.auditsLastEpisode} audits`);
      insights.push(`🔬 Features/episode: ${this.perfMetrics.extractFeaturesLastEpisode}`);
    }
    insights.push(`━━━━━━━━━━━━━━━━━━━`);
    
    // Skip expensive calculations in quick mode
    if (quickMode) {
      // Just show basic stats without iterating Q-table
      if (this.stats.episodesCompleted > 0) {
        insights.push(`🎮 Episodes: ${this.stats.episodesCompleted}`);
        insights.push(`📈 Win rate: ${Math.round(this.stats.winRate * 100)}%`);
        insights.push(`🎲 Exploration: ${Math.round(this.epsilon * 100)}%`);
      }
      return insights;
    }
    
    // Full insights for non-training display
    // Calculate approximate action space reduction with optimized analyzer
    const avgPatterns = 25; // Average patterns per hand state
    const oldCombinations = Math.pow(2, 7) - 1; // Old approach for 7 cards
    const reduction = Math.round((1 - avgPatterns/oldCombinations) * 100);
    insights.push(`⚡ Action space: ~${avgPatterns} patterns vs ${oldCombinations} combinations (${reduction}% reduction)`);
    
    // Show top features by importance
    const topFeatures = this.getFeatureImportance().slice(0, 5);
    if (topFeatures.length > 0 && !isWarzone) {  // Skip for warzone - they figure it out
      insights.push(`📊 Top features by importance:`);
      for (const [feature, importance] of topFeatures) {
        insights.push(`  • ${feature}: ${importance.toFixed(1)} avg reward`);
      }
    }
    
    // Most valuable states (EXPENSIVE - skip in quick mode)
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
        if (bestAction[0].startsWith('audit-')) preferAudit++;
      }
    }
    
    const total = preferLegal + preferIllegal + preferAudit;
    if (total > 0) {
      insights.push(`Strategy: ${Math.round(preferLegal/total*100)}% legal, ${Math.round(preferIllegal/total*100)}% illegal, ${Math.round(preferAudit/total*100)}% AUDIT`);
    }
    
    // Show hand management validation (PureWarzone only)
    if (this.name.includes('PureWarzone') && this.actionStats.size > 0) {
      const granularPlays = this.actionStats.get('granular-play') || 0;
      const legacyPlays = this.actionStats.get('legacy-play') || 0;
      const totalPlays = granularPlays + legacyPlays;
      
      if (totalPlays > 0 || legacyPlays > 0) {
        const granularPct = totalPlays > 0 ? Math.round(granularPlays / totalPlays * 100) : 100;
        
        if (legacyPlays > 0) {
          // This is an ERROR - legacy plays should NEVER happen
          insights.push(`⚠️ Hand Management ERROR: ${legacyPlays} legacy plays detected!`);
        }
        
        insights.push(`🎯 Hand Management: ${granularPct}% granular (${granularPlays} plays)`);
        
        // Show breakdown of all action types
        const breakdown: string[] = [];
        for (const [type, count] of this.actionStats.entries()) {
          if (type !== 'granular-play') {
            breakdown.push(`${type}: ${count}`);
          }
        }
        if (breakdown.length > 0) {
          insights.push(`📊 Actions: ${breakdown.join(', ')}`);
        }
      }
      
      // Clear stats periodically to show recent behavior
      const totalActions = Array.from(this.actionStats.values()).reduce((a, b) => a + b, 0);
      // Clear action stats more frequently to prevent memory buildup
      if (totalActions > 100) {
        this.actionStats.clear();
      }
    }
    
    // Show trips strategy insights if learned
    if (this.qTable.size > 1000) {
      let tripsHoldCount = 0;
      let tripsPlayCount = 0;
      
      // Sample some states to see trips behavior
      for (const [stateKey, actions] of this.qTable.entries()) {
        if (stateKey.includes('-0-1-')) { // Has trips (closestToTrips=0, tripsDelta>0)
          const playQ = actions.get('play-legal') || 0;
          // Get max audit Q-value across all audit actions
          const auditQ = Math.max(...Array.from(actions.entries())
            .filter(([act, _]) => act.startsWith('audit-'))
            .map(([_, q]) => q), 0);
          
          if (auditQ > playQ && auditQ > 0) tripsHoldCount++;
          if (playQ > auditQ && playQ > 0) tripsPlayCount++;
        }
        if (tripsHoldCount + tripsPlayCount > 50) break; // Sample enough
      }
      
      if (tripsHoldCount + tripsPlayCount > 10) {
        const holdRatio = Math.round((tripsHoldCount / (tripsHoldCount + tripsPlayCount)) * 100);
        insights.push(`♣️ Trips strategy: ${holdRatio}% hold for audit, ${100-holdRatio}% play immediately`);
      }
    }
    
    // Clarify episodes vs games
    if (this.stats.episodesCompleted > 0) {
      insights.push(`🎮 Episodes: ${this.stats.episodesCompleted} (${this.stats.gamesPlayed} participations)`);
      insights.push(`📈 Win rate: ${Math.round(this.stats.winRate * 100)}% (${this.stats.gamesWon}/${this.stats.gamesPlayed})`);
      insights.push(`💰 Avg score: ${Math.round(this.stats.avgScore)} points`);
    }
    
    // Show exploration decay progress with phase indicator
    const explorationPct = Math.round(this.epsilon * 100);
    const learningPct = Math.round(this.alpha * 100);
    
    if (this.stats.episodesCompleted === 0) {
      insights.push(`🎲 Exploration: ${explorationPct}% | Learning: ${learningPct}% (UNTRAINED)`);
    } else if (this.stats.episodesCompleted < 10) {
      insights.push(`🎲 Exploration: ${explorationPct}% | Learning: ${learningPct}% (DISCOVERY)`);
    } else if (this.stats.episodesCompleted < 50) {
      insights.push(`🎲 Exploration: ${explorationPct}% | Learning: ${learningPct}% (Early Learning)`);
    } else if (this.stats.episodesCompleted < 200) {
      insights.push(`🎲 Exploration: ${explorationPct}% | Learning: ${learningPct}% (Refining)`);
    } else if (this.stats.episodesCompleted < 500) {
      insights.push(`🎲 Exploration: ${explorationPct}% | Learning: ${learningPct}% (Mastering)`);
    } else {
      insights.push(`🎲 Exploration: ${explorationPct}% | Learning: ${learningPct}% (Expert)`);
    }
    
    // Show performance-based decay if applicable
    if (this.stats.episodesCompleted >= 10 && this.stats.winRate > 0) {
      const perfIndicator = this.stats.winRate > 0.3 ? '🔥' : 
                           this.stats.winRate > 0.2 ? '📊' : '📈';
      insights.push(`${perfIndicator} Performance-based dual decay active`);
    }
    
    // META-EVOLUTION INSIGHTS for PureWarzone
    if (this.name.includes('PureWarzone')) {
      if (this.opponentMemory.size > 0) {
        insights.push(`🧬 META-EVOLUTION: Tracking ${this.opponentMemory.size} opponent profiles`);
      
      // Show detailed opponent fingerprints
      const sortedProfiles = Array.from(this.opponentMemory.entries())
        .sort((a, b) => a[0] - b[0]); // Sort by player ID
      
      for (const [oppId, profile] of sortedProfiles) {
        if (profile.gamesObserved >= 3) { // Show after just 3 games
          // Classify this opponent's strategy (based on observed meta)
          const strategy = profile.avgIllegalRate > 0.5 ? 'Aggro' :           // 50%+ illegal (avg ~47%)
                          profile.avgFloorCrime > 250 ? 'Crime-Lord' :        // High crime accumulation
                          profile.avgAuditRate > 0.03 ? 'Control' :           // 3%+ audit (very rare)
                          profile.avgLegalRate > 0.3 ? 'Legal-Heavy' :        // 30%+ legal (avg ~18%)
                          profile.avgPassRate > 0.4 ? 'Passive' :             // 40%+ pass (avg ~35%)
                          'Balanced';
          
          // Format percentages
          const legalPct = Math.round(profile.avgLegalRate * 100);
          const illegalPct = Math.round(profile.avgIllegalRate * 100);
          const auditPct = Math.round(profile.avgAuditRate * 100);
          const passPct = Math.round(profile.avgPassRate * 100);
          const avgCrime = Math.round(profile.avgFloorCrime);
          
          insights.push(`  👤 Opp${oppId}: ${strategy} (${legalPct}% legal, ${illegalPct}% illegal, ${auditPct}% audit, ${passPct}% pass) ~${avgCrime} crime [${profile.gamesObserved} games]`);
        }
      }
      
      // Classify observed strategies with updated boundaries
      let aggroCount = 0;
      let crimeLordCount = 0;
      let controlCount = 0;
      let legalHeavyCount = 0;
      let balancedCount = 0;
      let passiveCount = 0;
      
      for (const [, profile] of this.opponentMemory) {
        if (profile.gamesObserved >= 5) { // Need enough data for summary
          if (profile.avgIllegalRate > 0.5) aggroCount++;           // 50%+ illegal
          else if (profile.avgFloorCrime > 250) crimeLordCount++;   // High crime
          else if (profile.avgAuditRate > 0.03) controlCount++;      // 3%+ audit
          else if (profile.avgLegalRate > 0.3) legalHeavyCount++;    // 30%+ legal
          else if (profile.avgPassRate > 0.4) passiveCount++;        // 40%+ pass
          else balancedCount++;
        }
      }
      
      const totalClassified = aggroCount + crimeLordCount + controlCount + legalHeavyCount + balancedCount + passiveCount;
      if (totalClassified > 0) {
        insights.push(`📊 Meta: ${aggroCount} Aggro, ${crimeLordCount} Crime-Lord, ${controlCount} Control, ${legalHeavyCount} Legal, ${balancedCount} Balanced, ${passiveCount} Passive`);
        
        // Show our counter-strategy adaptation
        if (aggroCount > controlCount && aggroCount > balancedCount) {
          insights.push(`🎯 Adapting: High aggro environment → Learning audit control`);
        } else if (crimeLordCount > 2) {
          insights.push(`🎯 Adapting: High crime environment → AUDIT OPPORTUNITY!`);
        } else if (controlCount > aggroCount) {
          insights.push(`🎯 Adapting: High control environment → Learning safe legal play`);
        } else if (legalHeavyCount > aggroCount && legalHeavyCount > controlCount) {
          insights.push(`🎯 Adapting: Legal-heavy environment → Learning spike timing`);
        } else if (passiveCount > aggroCount) {
          insights.push(`🎯 Adapting: Passive environment → Learning aggressive play`);
        } else if (balancedCount > aggroCount) {
          insights.push(`🎯 Adapting: Balanced environment → Exploring mixed strategies`);
        }
      }
      } else {
        insights.push(`⚠️ META-EVOLUTION: No profiles tracked yet (${this.turnHistory.length} turns recorded)`);
      }
    }
    
    insights.push(`💾 Memory: ${this.qTable.size.toLocaleString()} states`);
    
    return insights;
  }
}
