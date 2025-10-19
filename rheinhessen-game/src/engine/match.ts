import type { MatchState, PlayerState, Card } from './types';
import { makeDoubleDeck, shuffle, rawValue } from './deck';
import { bestLegalGreedy, isLegalExact, getHandType } from './evaluation';
import { scoreLegal, scoreIllegal, calculateTaxedValue } from './scoring';
import { reorganizeGreedy } from './audits';

// Helper to extract legal groups from reorganized cards
function extractLegalGroups(cards: Card[]): Card[][] {
  const groups: Card[][] = [];
  const used = new Set<string>();
  
  // Try to find legal hands in the cards
  for (let size = 5; size >= 2; size--) {
    for (let i = 0; i <= cards.length - size; i++) {
      if (cards.slice(i, i + size).some(c => used.has(c.id))) continue;
      
      const subset = cards.slice(i, i + size);
      if (isLegalExact(subset)) {
        groups.push(subset);
        subset.forEach(c => used.add(c.id));
      }
    }
  }
  
  // Any remaining cards as single group
  const remaining = cards.filter(c => !used.has(c.id));
  if (remaining.length > 0) {
    groups.push(remaining);
  }
  
  return groups;
}

// Helper to find best legal hand that qualifies for audit (trips or better, taxed >= 12)
function findBestAuditHand(hand: Card[]): { cards: Card[]; raw: number } | null {
  const legal = bestLegalGreedy(hand);
  if (!legal) return null;
  
  const handType = getHandType(legal.cards);
  const validTypes = ['trips', 'straight', 'flush', 'full-house', 'quads', 'straight-flush'];
  if (!validTypes.includes(handType)) return null;
  
  if (calculateTaxedValue(legal.raw) < 12) return null;
  
  return legal;
}

export function createMatch(
  seed?: string,
  options = { targetScore: 300, escalating: true }
): MatchState {
  const deck = shuffle(makeDoubleDeck(), seed);
  
  const players: PlayerState[] = [
    createPlayer(0, 'You', 'Human'),
    createPlayer(1, 'Aggro Bot', 'Aggro'),
    createPlayer(2, 'Balanced Bot', 'Balanced'),
    createPlayer(3, 'Conservative Bot', 'Conservative')
  ];
  
  // Deal 7 cards to each player
  let deckIndex = 0;
  for (const player of players) {
    player.hand = deck.slice(deckIndex, deckIndex + 7);
    deckIndex += 7;
  }
  
  return {
    players,
    deck: deck.slice(deckIndex),
    discard: [],
    auditTrack: 0,
    turnIdx: 0,
    options
  };
}

function createPlayer(id: number, name: string, persona: PlayerState['persona']): PlayerState {
  return {
    id,
    name,
    persona,
    hand: [],
    floor: [],
    floorGroups: [],
    score: 0,
    stats: {
      legal: 0,
      illegal: 0,
      spikes: 0,
      internalsDone: 0,
      internalsRecv: 0
    }
  };
}

export function startTurn(state: MatchState): MatchState {
  const newState = { ...state };
  const currentPlayer = newState.players[newState.turnIdx];
  
  // Draw 2 cards
  if (newState.deck.length >= 2) {
    const drawn = newState.deck.slice(0, 2);
    newState.deck = newState.deck.slice(2);
    newState.players = newState.players.map(p =>
      p.id === currentPlayer.id
        ? { ...p, hand: [...p.hand, ...drawn] }
        : p
    );
  } else {
    // Set end-of-round marker if not already set
    if (newState.endRoundSeat === undefined) {
      newState.endRoundSeat = (newState.turnIdx + 3) % 4; // Seat before current
    }
  }
  
  return newState;
}

export function applyInternal(
  state: MatchState,
  accuserId: number,
  targetId: number
): MatchState | null {
  const accuser = state.players[accuserId];
  const target = state.players[targetId];
  
  // Find best legal hand that is trips or better with taxed value >= 12
  const legal = findBestAuditHand(accuser.hand);
  if (!legal) {
    return null; // Can't perform internal audit (no trips+ hand with taxed >= 12)
  }
  
  const newState = { ...state };
  
  // Discard the legal hand
  newState.discard = [...newState.discard, ...legal.cards];
  
  // Reorganize target's floor
  const { kept, leftover } = reorganizeGreedy(target.floor);
  const fine = Math.round(rawValue(leftover) * 1.5); // 1.5x multiplier for confiscated cards
  
  // Create new floor groups from reorganization
  const reorganizedGroups = extractLegalGroups(kept);
  // Don't add leftover cards - they are confiscated!
  
  newState.players = newState.players.map(p => {
    if (p.id === accuserId) {
      return {
        ...p,
        hand: p.hand.filter(c => !legal.cards.some(lc => lc.id === c.id)),
        score: p.score + fine,
        stats: { ...p.stats, internalsDone: p.stats.internalsDone + 1 }
      };
    }
    if (p.id === targetId) {
      return {
        ...p,
        floor: kept, // Only keep reorganized cards, confiscated ones are removed
        floorGroups: reorganizedGroups, // But groups are reorganized
        confiscatedCards: leftover, // Track what was confiscated
        score: p.score - fine,
        stats: { ...p.stats, internalsRecv: p.stats.internalsRecv + 1 }
      };
    }
    return p;
  });
  
  return newState;
}

export function applyInternalWithCards(
  state: MatchState,
  accuserId: number,
  targetId: number,
  cards: Card[]
): MatchState | null {
  const accuser = state.players[accuserId];
  const target = state.players[targetId];
  
  // Check if provided cards are legal and have taxed value >= 12
  if (!isLegalExact(cards)) {
    return null; // Cards don't form a legal hand
  }
  
  // Check if hand is trips or better
  const handType = getHandType(cards);
  const validHandTypes = ['trips', 'straight', 'flush', 'full-house', 'quads', 'straight-flush'];
  if (!validHandTypes.includes(handType)) {
    return null; // Must be trips or better for internal audit
  }
  
  const raw = rawValue(cards);
  if (calculateTaxedValue(raw) < 12) {
    return null; // Taxed value too low
  }
  
  // Check that accuser actually has these cards
  const hasAllCards = cards.every(card => 
    accuser.hand.some(h => h.id === card.id)
  );
  if (!hasAllCards) {
    return null; // Accuser doesn't have all the cards
  }
  
  const newState = { ...state };
  
  // Discard the legal hand
  newState.discard = [...newState.discard, ...cards];
  
  // Reorganize target's floor
  const { kept, leftover } = reorganizeGreedy(target.floor);
  const fine = Math.round(rawValue(leftover) * 1.5); // 1.5x multiplier for confiscated cards
  
  // Create new floor groups from reorganization
  const reorganizedGroups = extractLegalGroups(kept);
  // Don't add leftover cards - they are confiscated!
  
  newState.players = newState.players.map(p => {
    if (p.id === accuserId) {
      return {
        ...p,
        hand: p.hand.filter(c => !cards.some(lc => lc.id === c.id)),
        score: p.score + fine,
        stats: { ...p.stats, internalsDone: p.stats.internalsDone + 1 }
      };
    }
    if (p.id === targetId) {
      return {
        ...p,
        floor: kept, // Only keep reorganized cards, confiscated ones are removed
        floorGroups: reorganizedGroups, // But groups are reorganized
        confiscatedCards: leftover, // Track what was confiscated
        score: p.score - fine,
        stats: { ...p.stats, internalsRecv: p.stats.internalsRecv + 1 }
      };
    }
    return p;
  });
  
  return newState;
}

export function applyProduction(
  state: MatchState,
  playerId: number,
  cards: Card[],
  kind: 'legal' | 'illegal' | 'pass'
): MatchState {
  if (kind === 'pass') {
    return state;
  }
  
  const newState = { ...state };
  const raw = rawValue(cards);
  
  if (kind === 'legal') {
    const points = scoreLegal(raw);
    
    newState.players = newState.players.map(p =>
      p.id === playerId
        ? {
            ...p,
            hand: p.hand.filter(c => !cards.some(pc => pc.id === c.id)),
            floor: [...p.floor, ...cards],
            floorGroups: [...p.floorGroups, cards], // Add as a group
            score: p.score + points,
            stats: { ...p.stats, legal: p.stats.legal + 1 }
          }
        : p
    );
  } else {
    const result = scoreIllegal(raw, newState.auditTrack);
    
    newState.players = newState.players.map(p =>
      p.id === playerId
        ? {
            ...p,
            hand: p.hand.filter(c => !cards.some(pc => pc.id === c.id)),
            floor: [...p.floor, ...cards],
            floorGroups: [...p.floorGroups, cards], // Add as a group
            score: p.score + result.points,
            stats: {
              ...p.stats,
              illegal: p.stats.illegal + 1,
              spikes: result.ticksAdded > 0 ? p.stats.spikes + 1 : p.stats.spikes
            }
          }
        : p
    );
    
    newState.auditTrack += result.ticksAdded;
    
    // Trigger external audit if track reaches 5
    if (newState.auditTrack >= 5) {
      return applyExternal(newState, playerId);
    }
  }
  
  return newState;
}

export function applyExternal(state: MatchState, triggerId: number): MatchState {
  const newState = { ...state };
  
  newState.players = newState.players.map(p => {
    const { kept, leftover } = reorganizeGreedy(p.floor);
    const fine = rawValue(leftover) * 2; // Double fines
    
    // Create new floor groups from reorganization
    const reorganizedGroups = extractLegalGroups(kept);
    
    if (p.id === triggerId) {
      return {
        ...p,
        floor: kept,
        floorGroups: reorganizedGroups,
        score: Math.max(0, p.score - fine - 20) // Triggerer gets -20 additional
      };
    }
    
    return {
      ...p,
      floor: kept,
      floorGroups: reorganizedGroups,
      score: Math.max(0, p.score - fine)
    };
  });
  
  // Leftover cards are removed from game (not added to discard)
  newState.auditTrack = 0;
  
  return newState;
}

export function endCheck(state: MatchState): { over: boolean; winnerId?: number } {
  // Check if someone reached target score
  const winner = state.players.find(p => p.score >= state.options.targetScore);
  if (winner) {
    return { over: true, winnerId: winner.id };
  }
  
  // Check if we've completed the round after deck-out
  if (state.endRoundSeat !== undefined && state.turnIdx === state.endRoundSeat) {
    const topPlayer = [...state.players].sort((a, b) => b.score - a.score)[0];
    return { over: true, winnerId: topPlayer.id };
  }
  
  return { over: false };
}

export function advanceTurn(state: MatchState): MatchState {
  return {
    ...state,
    turnIdx: (state.turnIdx + 1) % 4
  };
}
