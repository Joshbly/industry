import type { MatchState, Card } from '../engine/types';
import { bestLegalGreedy, bestSafeIllegalGreedy, getHandType } from '../engine/evaluation';
import { scoreLegal, scoreIllegal, calculateTaxedValue } from '../engine/scoring';
import { reorganizeGreedy } from '../engine/audits';
import { rawValue } from '../engine/deck';

// Find best legal hand that qualifies for audit (trips or better, taxed >= 12)
function findAuditHand(hand: Card[]): { cards: Card[]; raw: number } | null {
  const legal = bestLegalGreedy(hand);
  if (!legal) return null;
  
  const handType = getHandType(legal.cards);
  const validTypes = ['trips', 'straight', 'flush', 'full-house', 'quads', 'straight-flush'];
  if (!validTypes.includes(handType)) return null;
  
  if (calculateTaxedValue(legal.raw) < 12) return null;
  
  return legal;
}

export interface AIDecision {
  doInternal: boolean;
  targetId?: number;
  production: {
    type: 'legal' | 'illegal' | 'safe' | 'pass';
    cards?: Card[];
  };
}

// Import at top of file for Learner support
let getLearningAgent: ((name?: string) => any) | null = null;
if (typeof window !== 'undefined') {
  import('../components/AITrainer').then(module => {
    getLearningAgent = module.getLearningAgent;
  });
}

export function decideAI(state: MatchState, playerId: number): AIDecision {
  const player = state.players[playerId];
  const persona = player.persona;
  
  // Check if it's a learner variant (e.g., 'Learner-Explorer')
  if (typeof persona === 'string' && persona.startsWith('Learner-')) {
    if (getLearningAgent) {
      const agentName = persona.replace('Learner-', '');
      const agent = getLearningAgent(agentName);
      return agent.chooseAction(state, playerId);
    }
    // Fallback to balanced if learner not loaded
    return decideBalanced(state, playerId);
  }
  
  switch (player.persona) {
    case 'Aggro':
      return decideAggro(state, playerId);
    case 'Balanced':
      return decideBalanced(state, playerId);
    case 'Conservative':
      return decideConservative(state, playerId);
    case 'Opportunist':
      return decideOpportunist(state, playerId);
    case 'Learner' as any: {
      // Use the default learning AI if available
      if (getLearningAgent) {
        const agent = getLearningAgent('Balanced');
        return agent.chooseAction(state, playerId);
      }
      // Fallback to balanced if learner not loaded
      return decideBalanced(state, playerId);
    }
    default:
      return { doInternal: false, production: { type: 'pass' } };
  }
}

function decideAggro(state: MatchState, playerId: number): AIDecision {
  const player = state.players[playerId];
  const legal = bestLegalGreedy(player.hand);
  const safe = bestSafeIllegalGreedy(player.hand, 26);
  const dumpAll = { cards: player.hand, raw: rawValue(player.hand) };
  
  // Calculate points for each option
  const legalPoints = legal ? scoreLegal(legal.raw) : 0;
  const safePoints = safe ? scoreIllegal(safe.raw, state.auditTrack).points : 0;
  const dumpPoints = scoreIllegal(dumpAll.raw, state.auditTrack).points;
  
  // Audit consideration - aggressive but not foolish
  const auditHand = findAuditHand(player.hand);
  const auditTarget = findBestAuditTarget(state, playerId);
  if (auditHand && auditTarget && Math.random() > 0.5) { // 50% chance to audit when beneficial
    const fine = estimateFine(state.players[auditTarget].floor);
    const cost = auditHand.raw * 0.7;
    if (fine - cost >= 10) {
      return {
        doInternal: true,
        targetId: auditTarget,
        production: { type: 'pass' }
      };
    }
  }
  
  // Dump if it maximizes points
  if (dumpPoints > Math.max(legalPoints, safePoints)) {
    return {
      doInternal: false,
      production: { type: 'illegal', cards: dumpAll.cards }
    };
  }
  
  // Choose best between legal and safe
  if (legalPoints >= safePoints && legal) {
    return {
      doInternal: false,
      production: { type: 'legal', cards: legal.cards }
    };
  }
  
  if (safe && safe.cards.length > 0) {
    return {
      doInternal: false,
      production: { type: 'safe', cards: safe.cards }
    };
  }
  
  return { doInternal: false, production: { type: 'pass' } };
}

function decideBalanced(state: MatchState, playerId: number): AIDecision {
  const player = state.players[playerId];
  const legal = bestLegalGreedy(player.hand);
  const safe = bestSafeIllegalGreedy(player.hand, 26);
  
  const legalPoints = legal ? scoreLegal(legal.raw) : 0;
  const safePoints = safe ? scoreIllegal(safe.raw, state.auditTrack).points : 0;
  
  // At Track 4, prefer legal if within 10% of safe
  if (state.auditTrack === 4) {
    if (legal && legalPoints >= safePoints * 0.9) {
      return {
        doInternal: false,
        production: { type: 'legal', cards: legal.cards }
      };
    }
  }
  
  // Choose legal if within 2 points of best
  const bestPoints = Math.max(legalPoints, safePoints);
  if (legal && legalPoints >= bestPoints - 2) {
    return {
      doInternal: false,
      production: { type: 'legal', cards: legal.cards }
    };
  }
  
  if (safe && safePoints > legalPoints) {
    return {
      doInternal: false,
      production: { type: 'safe', cards: safe.cards }
    };
  }
  
  if (legal) {
    return {
      doInternal: false,
      production: { type: 'legal', cards: legal.cards }
    };
  }
  
  return { doInternal: false, production: { type: 'pass' } };
}

function decideConservative(state: MatchState, playerId: number): AIDecision {
  const player = state.players[playerId];
  const legal = bestLegalGreedy(player.hand);
  const safe = bestSafeIllegalGreedy(player.hand, 26);
  const dumpAll = { cards: player.hand, raw: rawValue(player.hand) };
  
  const legalPoints = legal ? scoreLegal(legal.raw) : 0;
  const safePoints = safe ? scoreIllegal(safe.raw, state.auditTrack).points : 0;
  const dumpPoints = scoreIllegal(dumpAll.raw, state.auditTrack).points;
  
  // At Track ≥3, prefer legal unless safe beats it by ≥25%
  if (state.auditTrack >= 3) {
    if (legal && safePoints < legalPoints * 1.25) {
      return {
        doInternal: false,
        production: { type: 'legal', cards: legal.cards }
      };
    }
  }
  
  // Only dump if ahead by ≥4 pts
  const maxScore = Math.max(...state.players.filter(p => p.id !== playerId).map(p => p.score));
  if (dumpPoints > Math.max(legalPoints, safePoints) && player.score >= maxScore + 4) {
    return {
      doInternal: false,
      production: { type: 'illegal', cards: dumpAll.cards }
    };
  }
  
  // Prefer legal over safe most of the time
  if (legal && legalPoints >= safePoints * 0.9) {
    return {
      doInternal: false,
      production: { type: 'legal', cards: legal.cards }
    };
  }
  
  if (safe && safe.cards.length > 0) {
    return {
      doInternal: false,
      production: { type: 'safe', cards: safe.cards }
    };
  }
  
  return { doInternal: false, production: { type: 'pass' } };
}

function decideOpportunist(state: MatchState, playerId: number): AIDecision {
  const player = state.players[playerId];
  const legal = bestLegalGreedy(player.hand);
  const safe = bestSafeIllegalGreedy(player.hand, 26);
  const dumpAll = { cards: player.hand, raw: rawValue(player.hand) };
  
  const legalPoints = legal ? scoreLegal(legal.raw) : 0;
  const safePoints = safe ? scoreIllegal(safe.raw, state.auditTrack).points : 0;
  const dumpPoints = scoreIllegal(dumpAll.raw, state.auditTrack).points;
  
  // Opportunist audits aggressively
  const auditHand = findAuditHand(player.hand);
  const auditTarget = findBestAuditTarget(state, playerId);
  if (auditHand && auditTarget) {
    const fine = estimateFine(state.players[auditTarget].floor);
    const cost = auditHand.raw * 0.7;
    const net = fine - cost;
    
    // Audit if net≥0 or (Track≥3 and net≥-2)
    if (net >= 0 || (state.auditTrack >= 3 && net >= -2)) {
      return {
        doInternal: true,
        targetId: auditTarget,
        production: { type: 'pass' }
      };
    }
  }
  
  // Prefer legal if within 4 of best
  const bestPoints = Math.max(legalPoints, safePoints, dumpPoints);
  if (legal && legalPoints >= bestPoints - 4) {
    return {
      doInternal: false,
      production: { type: 'legal', cards: legal.cards }
    };
  }
  
  // Dump only pre-Track 3 and ahead by ≥6
  const maxScore = Math.max(...state.players.filter(p => p.id !== playerId).map(p => p.score));
  if (state.auditTrack < 3 && player.score >= maxScore + 6 && 
      dumpPoints === bestPoints) {
    return {
      doInternal: false,
      production: { type: 'illegal', cards: dumpAll.cards }
    };
  }
  
  // Otherwise choose best option
  if (safePoints >= legalPoints && safe) {
    return {
      doInternal: false,
      production: { type: 'safe', cards: safe.cards }
    };
  }
  
  if (legal) {
    return {
      doInternal: false,
      production: { type: 'legal', cards: legal.cards }
    };
  }
  
  return { doInternal: false, production: { type: 'pass' } };
}

function findBestAuditTarget(state: MatchState, playerId: number): number | null {
  let bestTarget = -1;
  let bestFine = 0;
  
  for (const player of state.players) {
    if (player.id === playerId || player.floor.length === 0) continue;
    
    const fine = estimateFine(player.floor);
    if (fine > bestFine) {
      bestFine = fine;
      bestTarget = player.id;
    }
  }
  
  return bestTarget >= 0 ? bestTarget : null;
}

function estimateFine(floor: Card[]): number {
  const { leftover } = reorganizeGreedy(floor);
  return rawValue(leftover);
}
