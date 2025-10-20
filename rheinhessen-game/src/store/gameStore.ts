import { create } from 'zustand';
import type { MatchState, Card } from '../engine/types';
import { 
  createMatch, 
  startTurn, 
  applyInternal,
  applyInternalWithCards,
  applyProduction, 
  endCheck,
  advanceTurn 
} from '../engine/match';
import { decideAI } from '../ai/personas';
import { bestLegalGreedy, bestSafeIllegalGreedy } from '../engine/evaluation';
import { rawValue } from '../engine/deck';
import { reorganizeGreedy } from '../engine/audits';

export interface TelemetryEvent {
  type: 'TURN_START' | 'DRAW' | 'INTERNAL' | 'PRODUCTION' | 'TICKS_ADD' | 'EXTERNAL' | 'SCORE' | 'GAME_END';
  timestamp: number;
  data: any;
}

interface GameStore {
  // Match state
  match: MatchState | null;
  
  // UI state
  selectedCards: Card[];
  turnLog: string[];
  showHints: boolean;
  aiDelay: number;
  isProcessing: boolean;
  
  // Telemetry
  events: TelemetryEvent[];
  
  // Actions
  newMatch: (seed?: string) => void;
  selectCard: (card: Card) => void;
  deselectCard: (card: Card) => void;
  clearSelection: () => void;
  playLegal: () => void;
  playIllegal: () => void;
  playSafe: () => void;
  pass: () => void;
  triggerInternal: (targetId: number) => void;
  triggerInternalWithCards: (targetId: number, cards: Card[]) => void;
  processAITurn: () => Promise<void>;
  addLog: (message: string) => void;
  toggleHints: () => void;
  setAIDelay: (delay: number) => void;
  
  // Selectors
  getCurrentPlayer: () => any;
  getHumanPlayer: () => any;
  getBestLegal: () => any;
  getBestSafe: () => any;
  getDumpAll: () => any;
}

const useGameStore = create<GameStore>((set, get) => ({
  match: null,
  selectedCards: [],
  turnLog: [],
  showHints: true,
  aiDelay: 800,
  isProcessing: false,
  events: [],

  newMatch: (seed) => {
    // Create match with randomized starting position for fairness
    const match = createMatch(seed, {
      targetScore: 300,
      escalating: true,
      randomizeStart: true  // Randomize who goes first
    });
    
    // Check if we should use the Learner bots
    const useLearner = localStorage.getItem('rheinhessen-use-learner') === 'true';
    if (useLearner) {
      // Get table configuration
      const tableConfig = localStorage.getItem('rheinhessen-table-config');
      const config = tableConfig ? JSON.parse(tableConfig) : {
        player1: 'Balanced',
        player2: 'Regular',
        player3: 'Regular'
      };
      
      // Configure each opponent based on settings
      const configurePlayer = (playerIdx: number, configValue: string) => {
        if (configValue !== 'Regular') {
          // Check if it's a Warzone/PureWarzone agent (direct name) or other learner
          if (configValue.includes('Warzone')) {
            // Direct Warzone/PureWarzone agent
            match.players[playerIdx].name = configValue;
            match.players[playerIdx].persona = configValue as any;
          } else {
            // It's a learner variant (Explorer, Conservative, etc.)
            match.players[playerIdx].name = `Learner ${configValue}`;
            match.players[playerIdx].persona = `Learner-${configValue}` as any;
          }
        }
      };
      
      configurePlayer(1, config.player1);
      configurePlayer(2, config.player2);
      configurePlayer(3, config.player3);
      
      // Build log message
      const learnerNames: string[] = [];
      if (config.player1 !== 'Regular') learnerNames.push(config.player1);
      if (config.player2 !== 'Regular') learnerNames.push(config.player2);
      if (config.player3 !== 'Regular') learnerNames.push(config.player3);
      
      const logMsg = learnerNames.length > 0 
        ? ` (with Learner${learnerNames.length > 1 ? 's' : ''}: ${learnerNames.join(', ')})`
        : '';
      
      set({ 
        match, 
        selectedCards: [], 
        turnLog: ['New game started' + logMsg],
        events: [{
          type: 'GAME_END',
          timestamp: Date.now(),
          data: { seed }
        }]
      });
    } else {
      set({ 
        match, 
        selectedCards: [], 
        turnLog: ['New game started'],
        events: [{
          type: 'GAME_END',
          timestamp: Date.now(),
          data: { seed }
        }]
      });
    }
  },

  selectCard: (card) => {
    const { selectedCards } = get();
    if (!selectedCards.find(c => c.id === card.id)) {
      set({ selectedCards: [...selectedCards, card] });
    }
  },

  deselectCard: (card) => {
    const { selectedCards } = get();
    set({ selectedCards: selectedCards.filter(c => c.id !== card.id) });
  },

  clearSelection: () => {
    set({ selectedCards: [] });
  },

  playLegal: () => {
    const { match, selectedCards } = get();
    if (!match || match.winnerId !== undefined) return;
    
    const currentPlayer = match.players[match.turnIdx];
    if (currentPlayer.persona !== 'Human') return;
    
    let newMatch = applyProduction(match, currentPlayer.id, selectedCards, 'legal');
    const points = Math.round(rawValue(selectedCards) * 0.50 + 8);  // Updated from 0.70 to match new scoring
    
    get().addLog(`${currentPlayer.name} played LEGAL for ${points} points`);
    get().events.push({
      type: 'PRODUCTION',
      timestamp: Date.now(),
      data: { playerId: currentPlayer.id, type: 'legal', points }
    });
    
    // Check for game end
    const endResult = endCheck(newMatch);
    if (endResult.over) {
      newMatch = { ...newMatch, winnerId: endResult.winnerId };
      get().addLog(`Game Over! ${match.players[endResult.winnerId!].name} wins!`);
      get().events.push({
        type: 'GAME_END',
        timestamp: Date.now(),
        data: { winnerId: endResult.winnerId }
      });
    } else {
      newMatch = advanceTurn(newMatch);
      newMatch = startTurn(newMatch);
    }
    
    set({ match: newMatch, selectedCards: [] });
    
    // Process AI turn if next player is AI
    if (!endResult.over && newMatch.players[newMatch.turnIdx].persona !== 'Human') {
      setTimeout(() => get().processAITurn(), get().aiDelay);
    }
  },

  playIllegal: () => {
    const { match, selectedCards } = get();
    if (!match || match.winnerId !== undefined) return;
    
    const currentPlayer = match.players[match.turnIdx];
    if (currentPlayer.persona !== 'Human') return;
    
    const raw = rawValue(selectedCards);
    const oldTrack = match.auditTrack;
    let newMatch = applyProduction(match, currentPlayer.id, selectedCards, 'illegal');
    
    const result = {
      points: Math.round(raw * 0.60),
      ticksAdded: 0,
      kickback: 0
    };
    
    if (raw >= 27) {
      result.kickback = 5;
      result.points -= result.kickback;
      result.ticksAdded = (oldTrack >= 3 && raw >= 25) ? 2 : 1;
    }
    
    let logMsg = `${currentPlayer.name} played ILLEGAL for ${result.points} points`;
    if (result.kickback > 0) {
      logMsg += ` (-${result.kickback} kickback)`;
    }
    if (result.ticksAdded > 0) {
      logMsg += ` | ${currentPlayer.name} added ${result.ticksAdded} tick${result.ticksAdded > 1 ? 's' : ''} to Audit Track (now ${oldTrack + result.ticksAdded}/5)`;
    }
    get().addLog(logMsg);
    
    if (newMatch.auditTrack >= 5) {
      get().addLog(`🚨 EXTERNAL AUDIT TRIGGERED by ${currentPlayer.name}!`);
      get().addLog(`All players reorganize floors, ${currentPlayer.name} pays -20 penalty`);
      get().events.push({
        type: 'EXTERNAL',
        timestamp: Date.now(),
        data: { triggerId: currentPlayer.id }
      });
    }
    
    // Check for game end
    const endResult = endCheck(newMatch);
    if (endResult.over) {
      newMatch = { ...newMatch, winnerId: endResult.winnerId };
      get().addLog(`Game Over! ${match.players[endResult.winnerId!].name} wins!`);
    } else {
      newMatch = advanceTurn(newMatch);
      newMatch = startTurn(newMatch);
    }
    
    set({ match: newMatch, selectedCards: [] });
    
    // Process AI turn if next player is AI
    if (!endResult.over && newMatch.players[newMatch.turnIdx].persona !== 'Human') {
      setTimeout(() => get().processAITurn(), get().aiDelay);
    }
  },

  playSafe: () => {
    const { match } = get();
    if (!match || match.winnerId !== undefined) return;
    
    const currentPlayer = match.players[match.turnIdx];
    if (currentPlayer.persona !== 'Human') return;
    
    const safe = bestSafeIllegalGreedy(currentPlayer.hand, 26);
    if (safe && safe.cards.length > 0) {
      set({ selectedCards: safe.cards });
      get().playIllegal();
    }
  },

  pass: () => {
    const { match } = get();
    if (!match || match.winnerId !== undefined) return;
    
    const currentPlayer = match.players[match.turnIdx];
    if (currentPlayer.persona !== 'Human') return;
    
    get().addLog(`${currentPlayer.name} passed`);
    
    let newMatch = advanceTurn(match);
    newMatch = startTurn(newMatch);
    
    set({ match: newMatch, selectedCards: [] });
    
    // Process AI turn if next player is AI
    if (newMatch.players[newMatch.turnIdx].persona !== 'Human') {
      setTimeout(() => get().processAITurn(), get().aiDelay);
    }
  },

  triggerInternal: (targetId) => {
    const { match } = get();
    if (!match || match.winnerId !== undefined) return;
    
    const currentPlayer = match.players[match.turnIdx];
    if (currentPlayer.persona !== 'Human') return;
    
    const newMatch = applyInternal(match, currentPlayer.id, targetId);
    if (!newMatch) {
      get().addLog('Cannot perform internal audit - need trips or better with taxed value >= 12');
      return;
    }
    
    const target = match.players[targetId];
    const { leftover } = reorganizeGreedy(target.floor);
    const fine = Math.round(rawValue(leftover) * 1.5); // 1.5x multiplier
    
    get().addLog(`${currentPlayer.name} audited ${target.name} for ${fine} points`);
    get().events.push({
      type: 'INTERNAL',
      timestamp: Date.now(),
      data: { accuserId: currentPlayer.id, targetId, fine }
    });
    
    set({ match: newMatch });
  },

  triggerInternalWithCards: (targetId, cards) => {
    const { match } = get();
    if (!match || match.winnerId !== undefined) return;
    
    const currentPlayer = match.players[match.turnIdx];
    if (currentPlayer.persona !== 'Human') return;
    
    const newMatch = applyInternalWithCards(match, currentPlayer.id, targetId, cards);
    if (!newMatch) {
      get().addLog('Cannot perform internal audit - need trips or better with taxed >= 12');
      return;
    }
    
    const target = match.players[targetId];
    const { leftover } = reorganizeGreedy(target.floor);
    const fine = Math.round(rawValue(leftover) * 1.5); // 1.5x multiplier
    
    // Show the discarded cards in the log
    const cardStr = cards.map(c => {
      const rank = c.r <= 10 ? c.r : c.r === 11 ? 'J' : c.r === 12 ? 'Q' : c.r === 13 ? 'K' : 'A';
      const suit = c.s === 'S' ? '♠' : c.s === 'H' ? '♥' : c.s === 'D' ? '♦' : '♣';
      return `${rank}${suit}`;
    }).join(' ');
    
    get().addLog(`${currentPlayer.name} audited ${target.name} using [${cardStr}] for ${fine} points`);
    get().events.push({
      type: 'INTERNAL',
      timestamp: Date.now(),
      data: { accuserId: currentPlayer.id, targetId, fine, cards }
    });
    
    set({ match: newMatch, selectedCards: [] });
  },

  processAITurn: async () => {
    const { match } = get();
    if (!match || match.winnerId !== undefined) return;
    
    const currentPlayer = match.players[match.turnIdx];
    if (currentPlayer.persona === 'Human') return;
    
    set({ isProcessing: true });
    
    await new Promise(resolve => setTimeout(resolve, get().aiDelay));
    
    const decision = decideAI(match, currentPlayer.id);
    
    let newMatch = match;
    
    // Handle internal audit
    if (decision.doInternal && decision.targetId !== undefined) {
      const auditResult = applyInternal(newMatch, currentPlayer.id, decision.targetId);
      if (auditResult) {
        newMatch = auditResult;
        const target = match.players[decision.targetId];
        get().addLog(`${currentPlayer.name} audited ${target.name}`);
      }
    }
    
    // Handle production
    if (decision.production.type !== 'pass' && decision.production.cards) {
      const oldTrack = newMatch.auditTrack;
      const raw = rawValue(decision.production.cards);
      newMatch = applyProduction(newMatch, currentPlayer.id, decision.production.cards, 
        decision.production.type === 'legal' ? 'legal' : 'illegal');
      
      const typeStr = decision.production.type === 'legal' ? 'LEGAL' : 
                      decision.production.type === 'safe' ? 'SAFE ILLEGAL' : 'ILLEGAL';
      let logMsg = `${currentPlayer.name} played ${typeStr} (${decision.production.cards.length} cards)`;
      
      // Check if ticks were added
      if (decision.production.type !== 'legal' && raw >= 27) {
        const ticksAdded = (oldTrack >= 3 && raw >= 25) ? 2 : 1;
        logMsg += ` | ${currentPlayer.name} added ${ticksAdded} tick${ticksAdded > 1 ? 's' : ''} to Audit Track (now ${newMatch.auditTrack}/5)`;
      }
      get().addLog(logMsg);
      
      if (newMatch.auditTrack >= 5) {
        get().addLog(`🚨 EXTERNAL AUDIT TRIGGERED by ${currentPlayer.name}!`);
        get().addLog(`All players reorganize floors, ${currentPlayer.name} pays -20 penalty`);
      }
    } else if (decision.production.type === 'pass') {
      get().addLog(`${currentPlayer.name} passed`);
    }
    
    // Check for game end
    const endResult = endCheck(newMatch);
    if (endResult.over) {
      newMatch = { ...newMatch, winnerId: endResult.winnerId };
      get().addLog(`Game Over! ${match.players[endResult.winnerId!].name} wins!`);
    } else {
      newMatch = advanceTurn(newMatch);
      newMatch = startTurn(newMatch);
    }
    
    set({ match: newMatch, isProcessing: false });
    
    // Continue with next AI turn if applicable
    if (!endResult.over && newMatch.players[newMatch.turnIdx].persona !== 'Human') {
      setTimeout(() => get().processAITurn(), get().aiDelay);
    }
  },

  addLog: (message) => {
    set(state => ({ turnLog: [...state.turnLog, message] }));
  },

  toggleHints: () => {
    set(state => ({ showHints: !state.showHints }));
  },

  setAIDelay: (delay) => {
    set({ aiDelay: delay });
  },

  getCurrentPlayer: () => {
    const { match } = get();
    return match ? match.players[match.turnIdx] : null;
  },

  getHumanPlayer: () => {
    const { match } = get();
    return match ? match.players.find(p => p.persona === 'Human') : null;
  },

  getBestLegal: () => {
    const player = get().getHumanPlayer();
    return player ? bestLegalGreedy(player.hand) : null;
  },

  getBestSafe: () => {
    const player = get().getHumanPlayer();
    return player ? bestSafeIllegalGreedy(player.hand, 26) : null;
  },

  getDumpAll: () => {
    const player = get().getHumanPlayer();
    return player ? { cards: player.hand, raw: rawValue(player.hand) } : null;
  }
}));

export default useGameStore;
