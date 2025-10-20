import { useState } from 'react';
import useGameStore from '../store/gameStore';
import type { Card as CardType, PlayerState } from '../engine/types';
import { bestLegalGreedy, bestSafeIllegalGreedy, getHandType, isLegalExact } from '../engine/evaluation';
import { rawValue } from '../engine/deck';
import { scoreLegal, scoreIllegal, calculateTaxedValue } from '../engine/scoring';
import { AITrainer, getLearningAgent } from './AITrainer';

function FactoryCard({ card, size = 'tiny' }: { card: CardType; size?: 'tiny' | 'small' | 'medium' }) {
  const rankStr = card.r <= 10 ? card.r.toString() : 
                  card.r === 11 ? 'J' : 
                  card.r === 12 ? 'Q' : 
                  card.r === 13 ? 'K' : 'A';
  const suitStr = card.s === 'S' ? '♠' : 
                  card.s === 'H' ? '♥' : 
                  card.s === 'D' ? '♦' : '♣';
  const isRed = card.s === 'H' || card.s === 'D';
  
  const sizeMap = {
    tiny: 'w-6 h-8 text-[10px]',
    small: 'w-10 h-14 text-xs',
    medium: 'w-14 h-20 text-sm'
  };
  
  return (
    <div className={`${sizeMap[size]} bg-white rounded flex flex-col items-center justify-center border border-gray-700`}>
      <div className={`font-bold ${isRed ? 'text-red-600' : 'text-black'}`}>
        {rankStr}{suitStr}
      </div>
    </div>
  );
}

function PlayerCard({ card, selected, onClick, stacked, stackOffset, zIndex }: { 
  card: CardType; 
  selected: boolean;
  onClick: () => void;
  stacked?: boolean;
  stackOffset?: number;
  zIndex?: number;
}) {
  const rankStr = card.r <= 10 ? card.r.toString() : 
                  card.r === 11 ? 'J' : 
                  card.r === 12 ? 'Q' : 
                  card.r === 13 ? 'K' : 'A';
  const suitStr = card.s === 'S' ? '♠' : 
                  card.s === 'H' ? '♥' : 
                  card.s === 'D' ? '♦' : '♣';
  const isRed = card.s === 'H' || card.s === 'D';
  
  return (
    <button
      onClick={onClick}
      style={{
        transform: `translateX(${stackOffset || 0}px) ${selected ? 'translateY(-16px)' : ''}`,
        zIndex: zIndex || 0,
      }}
      className={`
        absolute w-20 h-28 bg-white rounded-lg border-2 transition-all cursor-pointer
        ${selected 
          ? 'border-yellow-400 shadow-lg shadow-yellow-400/50 ring-2 ring-yellow-400' 
          : 'border-gray-800 hover:-translate-y-2 hover:shadow-lg'}
        ${stacked ? 'hover:z-50' : ''}
      `}
    >
      <div className="h-full flex flex-col items-center justify-center">
        <div className={`text-3xl font-bold ${isRed ? 'text-red-600' : 'text-black'}`}>
          {rankStr}
        </div>
        <div className={`text-4xl ${isRed ? 'text-red-600' : 'text-black'}`}>
          {suitStr}
        </div>
      </div>
    </button>
  );
}

function HandDisplay({ cards, selectedCards, onCardClick, isHumanTurn }: {
  cards: CardType[];
  selectedCards: CardType[];
  onCardClick: (card: CardType) => void;
  isHumanTurn: boolean;
}) {
  // Calculate stacking based on number of cards
  const cardWidth = 80; // w-20 = 5rem = 80px
  const containerPadding = 200; // Leave padding for UI elements
  const maxWidth = typeof window !== 'undefined' 
    ? Math.min(window.innerWidth - containerPadding, 1400)  // Cap at reasonable max
    : 1000; // Default for SSR
  
  // Calculate if we need to stack
  const normalSpacing = cardWidth + 12; // gap-3 = 12px
  const totalWidthNeeded = cards.length * normalSpacing;
  const needsStacking = totalWidthNeeded > maxWidth;
  
  // Calculate overlap spacing
  let overlapSpacing: number;
  if (!needsStacking) {
    overlapSpacing = normalSpacing;
  } else if (cards.length === 1) {
    overlapSpacing = 0;
  } else {
    // Ensure minimum overlap for visibility (at least 30px of each card visible)
    const availableSpace = maxWidth - cardWidth;
    const maxOverlap = availableSpace / (cards.length - 1);
    overlapSpacing = Math.max(30, Math.min(60, maxOverlap));
  }
  
  // Calculate actual width
  const totalStackedWidth = cards.length === 0 
    ? 200 
    : cards.length === 1 
    ? cardWidth
    : cardWidth + (overlapSpacing * (cards.length - 1));
    
  return (
    <div className="relative flex items-center justify-center" style={{ width: '100%', height: '112px' }}>
      <div className="relative" style={{ width: `${totalStackedWidth}px`, height: '112px' }}>
        {cards.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500 italic">
            {isHumanTurn ? 'Draw cards to begin' : 'Waiting for turn...'}
          </div>
        ) : (
          cards.map((card, idx) => {
            const isSelected = selectedCards.some(c => c.id === card.id);
            const offset = idx * overlapSpacing;
            
            return (
              <PlayerCard
                key={card.id}
                card={card}
                selected={isSelected}
                onClick={() => onCardClick(card)}
                stacked={needsStacking}
                stackOffset={offset}
                zIndex={isSelected ? 100 + idx : idx}
              />
            );
          })
        )}
      </div>
      {cards.length > 10 && (
        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs text-yellow-400 bg-black/60 px-2 py-1 rounded">
          {cards.length} cards in hand {needsStacking && '• Stacked for visibility'}
        </div>
      )}
    </div>
  );
}

// Calculate crime for a player (only illegal productions)
function calculateCrime(player: PlayerState): number {
  let totalCrime = 0;
  player.floorGroups.forEach(group => {
    // Only count illegal productions toward crime
    if (!isLegalExact(group)) {
      group.forEach(card => {
        const value = card.r <= 10 ? card.r : card.r === 14 ? 11 : 10;
        totalCrime += value;
      });
    }
  });
  return totalCrime;
}

function CorporateRival({ 
  player, 
  isActive,
  canAuditThis,
  onAudit,
  isExpanded,
  onToggleExpand
}: { 
  player: PlayerState;
  isActive: boolean;
  canAuditThis: boolean;
  onAudit: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  const totalCrime = calculateCrime(player);
  
  const dangerLevel = totalCrime >= 40 ? 'critical' : 
                      totalCrime >= 27 ? 'high' : 
                      totalCrime >= 15 ? 'moderate' : 'low';
  
  const borderColors = {
    critical: 'border-red-600 bg-red-950/50',
    high: 'border-orange-500 bg-orange-950/50',
    moderate: 'border-yellow-500 bg-yellow-950/50',
    low: 'border-gray-600 bg-gray-900/50'
  };
  
  // Get training info for learner agents
  const getTrainingInfo = () => {
    if (player.persona && typeof player.persona === 'string') {
      // Handle both Learner- and direct agent names (like PureWarzone-1)
      let agentName = '';
      if (player.persona.startsWith('Learner-')) {
        agentName = player.persona.replace('Learner-', '');
      } else if (player.persona.includes('Warzone')) {
        // Direct Warzone/PureWarzone agents
        agentName = player.persona;
      }
      
      if (agentName) {
        try {
          const agent = getLearningAgent(agentName);
          return agent.getTrainingInfo();
        } catch {
          return '';
        }
      }
    }
    return '';
  };
  
  const trainingInfo = getTrainingInfo();
  
  return (
    <div className={`
      ${isExpanded ? 'w-80' : 'w-72'} 
      transition-all duration-300
      ${isActive ? 'ring-4 ring-yellow-400 ring-opacity-75 shadow-2xl z-20' : ''}
      ${borderColors[dangerLevel]} 
      border-2 rounded-xl overflow-hidden
    `}>
      {/* Header */}
      <div className="bg-black/60 px-4 py-2 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-yellow-400 animate-pulse' : 'bg-gray-500'}`} />
          <div>
            <div className="text-white font-bold">{player.name}</div>
            <div className="text-xs text-gray-400">
              {player.persona} Corp.
              {trainingInfo && (
                <span className="ml-1 text-purple-400">({trainingInfo})</span>
              )}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-white">{player.score}</div>
          <div className="text-xs text-gray-400">Position #{player.id + 1}</div>
        </div>
      </div>
      
      {/* Stats Bar */}
      <div className="bg-black/40 px-4 py-1 flex justify-between text-xs">
        <span className="text-gray-400">
          Hand: <span className="text-white font-bold">{player.hand.length}</span>
        </span>
        <span className="text-green-400">
          Legal: {player.stats.legal}
        </span>
        <span className="text-red-400">
          Illegal: {player.stats.illegal}
        </span>
        <span className="text-orange-400">
          Audited: {player.stats.internalsRecv}x
        </span>
      </div>
      
      {/* Factory Floor */}
      <div className="p-3">
        <button
          onClick={onToggleExpand}
          className="w-full text-left mb-2 flex justify-between items-center group"
        >
          <span className="text-xs text-gray-400 group-hover:text-white transition-colors">
            FACTORY FLOOR ({player.floorGroups.length} productions)
          </span>
          <span className={`text-xs font-bold ${
            dangerLevel === 'critical' ? 'text-red-400 animate-pulse' :
            dangerLevel === 'high' ? 'text-orange-400' :
            dangerLevel === 'moderate' ? 'text-yellow-400' :
            'text-gray-400'
          }`}>
            Crime: {totalCrime}
          </span>
        </button>
        
        {/* Preview Mode - Show latest productions first */}
        {!isExpanded && (
          <div className="bg-black/40 rounded-lg p-2 h-16 overflow-hidden relative">
            {player.floorGroups.length === 0 ? (
              <div className="text-gray-500 text-xs italic">Clean floor</div>
            ) : (
              <div className="flex gap-2 flex-nowrap">
                {[...player.floorGroups].reverse().slice(0, 3).map((group, idx) => {
                  const isLegal = isLegalExact(group);
                  const realIndex = player.floorGroups.length - 1 - idx;
                  return (
                    <div 
                      key={realIndex} 
                      className={`relative rounded p-1 flex gap-0.5 flex-shrink-0 ${
                        isLegal ? 'bg-green-900/60 border border-green-600' : 'bg-red-900/60 border border-red-600'
                      }`}
                    >
                      <div className={`absolute -top-1 -left-1 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold z-10 ${
                        isLegal ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                      }`}>
                        {isLegal ? '✓' : '✗'}
                      </div>
                      {group.slice(0, 2).map(card => (
                        <FactoryCard key={card.id} card={card} size="tiny" />
                      ))}
                      {group.length > 2 && (
                        <div className="w-6 h-8 bg-gray-700 rounded flex items-center justify-center text-[10px] text-white">
                          +{group.length - 2}
                        </div>
                      )}
                    </div>
                  );
                })}
                {player.floorGroups.length > 3 && (
                  <div className="text-gray-400 text-xs self-center ml-1">
                    +{player.floorGroups.length - 3} more
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        
        {/* Expanded Mode - Show all productions with turn numbers */}
        {isExpanded && (
          <div className="bg-black/40 rounded-lg p-3 max-h-64 overflow-y-auto">
            {player.floorGroups.length === 0 && player.stats.internalsRecv === 0 ? (
              <div className="text-gray-500 text-xs italic">No production history</div>
            ) : (
              <div className="space-y-2">
                {/* Show audit warning if player has been audited */}
                {player.stats.internalsRecv > 0 && (
                  <div className="bg-orange-900/40 border border-orange-600 rounded p-2 mb-2">
                    <div className="text-xs text-orange-400 font-bold">
                      ⚠️ AUDITED {player.stats.internalsRecv}x - Floor Reorganized
                    </div>
                  </div>
                )}
                
                {/* Display productions and track reorganization */}
                {(() => {
                  // After an audit, we don't have confiscated cards in floorGroups anymore
                  // They've been removed during the audit
                  const displayGroups = player.floorGroups;
                  
                  // Track which productions are reorganized (from audit) vs new (after audit)
                  // We'll consider the first N groups as reorganized if player was audited
                  // This is a simplified approach - ideally we'd track the exact count
                  const reorganizedCount = player.stats.internalsRecv > 0 ? 
                    Math.min(5, displayGroups.length) : 0; // Assume first 5 are from reorganization
                  
                  return (
                    <>
                      {/* Show productions - distinguish reorganized from new */}
                      {[...displayGroups].reverse().map((group, idx) => {
                        const isLegal = isLegalExact(group);
                        const turnNumber = displayGroups.length - idx;
                        const groupRaw = rawValue(group);
                        // Only the first N productions are reorganized from audit
                        const isReorganized = turnNumber <= reorganizedCount;
                        
                        return (
                          <div 
                            key={turnNumber - 1} 
                            className={`rounded p-2 relative ${
                              isLegal ? 'bg-green-900/30 border border-green-600' : 'bg-red-900/30 border border-red-600'
                            } ${isReorganized ? 'opacity-75' : ''}`}
                          >
                            {isReorganized && (
                              <div className="absolute -top-2 right-2 bg-orange-600 text-white text-[8px] px-1 rounded">
                                POST-AUDIT
                              </div>
                            )}
                            <div className="flex justify-between items-start mb-1">
                              <div className="text-[10px] text-gray-400">
                                {isReorganized ? `Reorganized #${turnNumber}` : `Turn #${turnNumber}`}
                              </div>
                              <div className={`text-xs font-bold ${isLegal ? 'text-green-400' : 'text-red-400'}`}>
                                {isLegal ? `✓ LEGAL (${getHandType(group).toUpperCase()})` : `✗ ILLEGAL (${groupRaw} raw)`}
                              </div>
                            </div>
                            <div className="flex gap-1 flex-wrap">
                              {group.map(card => (
                                <FactoryCard key={card.id} card={card} size="small" />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                      
                      {/* Show confiscated cards if they exist */}
                      {player.confiscatedCards && player.confiscatedCards.length > 0 && (
                        <div className="border-t border-gray-600 pt-2 mt-2">
                          <div className="bg-red-950/40 border border-red-700 rounded p-2">
                            <div className="text-xs text-red-400 font-bold mb-1">
                              🚫 CONFISCATED CARDS (Fined {rawValue(player.confiscatedCards)} @ 1.5x = {Math.round(rawValue(player.confiscatedCards) * 1.5)})
                            </div>
                            <div className="flex gap-1 flex-wrap mb-1">
                              {player.confiscatedCards.map(card => (
                                <FactoryCard key={card.id} card={card} size="small" />
                              ))}
                            </div>
                            <div className="text-[9px] text-gray-500 italic">
                              Returned to bottom of deck
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Audit Control */}
      <div className="px-3 pb-3">
        <button
          onClick={onAudit}
          disabled={!canAuditThis}
          className={`
            w-full py-2 rounded-lg font-bold text-sm transition-all
            ${canAuditThis
              ? 'bg-red-600 hover:bg-red-500 text-white hover:shadow-lg active:scale-95 animate-pulse' 
              : 'bg-gray-700 text-gray-500 cursor-not-allowed opacity-50'}
          `}
        >
          {canAuditThis ? '🔍 EXECUTE AUDIT!' : 'Select Trips+ ≥12'}
        </button>
      </div>
    </div>
  );
}

// Helper function to check if SELECTED cards form valid audit hand
function isValidAuditSelection(cards: CardType[]): boolean {
  if (cards.length === 0) return false;
  
  // Check if selected cards form a legal hand
  if (!isLegalExact(cards)) return false;
  
  // Check if it's trips or better
  const handType = getHandType(cards);
  const validTypes = ['trips', 'straight', 'flush', 'full-house', 'quads', 'straight-flush'];
  if (!validTypes.includes(handType)) return false;
  
  // Check taxed value >= 12
  const raw = rawValue(cards);
  return calculateTaxedValue(raw) >= 12;
}

export function IndustrialUI() {
  const match = useGameStore(state => state.match);
  const selectedCards = useGameStore(state => state.selectedCards);
  const selectCard = useGameStore(state => state.selectCard);
  const deselectCard = useGameStore(state => state.deselectCard);
  const clearSelection = useGameStore(state => state.clearSelection);
  const playLegal = useGameStore(state => state.playLegal);
  const playIllegal = useGameStore(state => state.playIllegal);
  const pass = useGameStore(state => state.pass);
  const triggerInternalWithCards = useGameStore(state => state.triggerInternalWithCards);
  const newMatch = useGameStore(state => state.newMatch);
  const turnLog = useGameStore(state => state.turnLog);
  
  const [expandedRival, setExpandedRival] = useState<number | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [showMyFloor, setShowMyFloor] = useState(false);
  const [showAITrainer, setShowAITrainer] = useState(false);
  
  if (!match) {
    return (
      <div className="h-screen bg-gradient-to-br from-gray-900 to-black flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-yellow-500 mb-4">RHEINHESSEN INDUSTRIEWERK GmbH</h1>
          <div className="text-xl text-gray-400 animate-pulse">Initializing corporate warfare...</div>
        </div>
      </div>
    );
  }
  
  const humanPlayer = match.players[0];
  const isHumanTurn = match.turnIdx === 0;
  const selectedRaw = rawValue(selectedCards);
  
  // Check if selected cards form a valid legal hand
  const isValidLegalPlay = selectedCards.length > 0 && isLegalExact(selectedCards);
  const legalScore = isValidLegalPlay ? scoreLegal(selectedRaw) : 0;
  const illegalResult = selectedCards.length > 0 ? scoreIllegal(selectedRaw, match.auditTrack) : null;
  
  // Check if SELECTED cards can be used for audit
  const canAuditWithSelected = isHumanTurn && isValidAuditSelection(selectedCards);
  
  const handleCardClick = (card: CardType) => {
    if (!isHumanTurn) return;
    const isSelected = selectedCards.some(c => c.id === card.id);
    if (isSelected) {
      deselectCard(card);
    } else {
      selectCard(card);
    }
  };
  
  const handleAudit = (targetId: number) => {
    if (canAuditWithSelected) {
      // Use the selected cards for the audit
      triggerInternalWithCards(targetId, selectedCards);
      clearSelection();
    }
  };
  
  const auditTrackDanger = match.auditTrack >= 4 ? 'critical' :
                           match.auditTrack >= 3 ? 'high' :
                           match.auditTrack >= 2 ? 'moderate' : 'low';
  
  const humanCrime = calculateCrime(humanPlayer);
  
  return (
    <div className="h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-black overflow-hidden flex flex-col">
      {/* Industrial Header */}
      <header className="h-20 bg-black border-b-4 border-yellow-600 flex items-center justify-between px-6">
        <div>
          <h1 className="text-2xl font-bold text-yellow-500">RHEINHESSEN INDUSTRIEWERK GmbH</h1>
          <div className="text-xs text-gray-400">
            Corporate Production Management System v2.0
            {match.players[match.turnIdx].id === 0 && (
              <span className="ml-2 text-yellow-400">• YOUR TURN</span>
            )}
          </div>
        </div>
        
        {/* Turn Order Indicator */}
        <div className="flex flex-col items-center">
          <div className="text-xs text-gray-500">Turn Order</div>
          <div className="flex gap-1">
            {[0, 1, 2, 3].map(idx => (
              <div
                key={idx}
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                  ${match.turnIdx === idx ? 'bg-yellow-500 text-black' : 'bg-gray-700 text-gray-400'}
                  ${idx === 0 ? 'border-2 border-blue-500' : ''}
                `}
                title={match.players[idx].name}
              >
                {idx === 0 ? 'H' : idx}
              </div>
            ))}
          </div>
        </div>
        
        {/* Regulatory Compliance Monitor (Audit Track) */}
        <div className="flex items-center gap-4">
          <div className="text-yellow-400 font-bold text-sm">REGULATORY COMPLIANCE:</div>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map(level => (
              <div
                key={level}
                className={`
                  w-12 h-12 rounded-lg border-2 flex flex-col items-center justify-center font-bold
                  ${level <= match.auditTrack
                    ? level === 5 ? 'bg-purple-600 border-purple-400 text-white animate-pulse' :
                      level === 4 ? 'bg-red-600 border-red-400 text-white' :
                      level === 3 ? 'bg-orange-600 border-orange-400 text-white' :
                      'bg-yellow-600 border-yellow-400 text-white'
                    : 'bg-gray-800 border-gray-600 text-gray-500'}
                `}
              >
                <div className="text-xs">{level === 5 ? 'EXT' : `L${level}`}</div>
              </div>
            ))}
          </div>
          {auditTrackDanger === 'critical' && (
            <div className="text-red-400 font-bold animate-pulse">
              ⚠️ EXTERNAL AUDIT IMMINENT
            </div>
          )}
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => setShowAITrainer(!showAITrainer)}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg transition-all hover:scale-105 text-xs"
          >
            🤖 AI LAB
          </button>
          <button
            onClick={() => newMatch()}
            className="px-6 py-2 bg-yellow-600 hover:bg-yellow-500 text-black font-bold rounded-lg transition-all hover:scale-105"
          >
            NEW CORPORATION
          </button>
        </div>
      </header>
      
      {/* Game Table */}
      <div className="flex-1 relative">
        {/* Rivals positioned in perfect triangle */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
          <CorporateRival
            player={match.players[2]}
            isActive={match.turnIdx === 2}
            canAuditThis={canAuditWithSelected}
            onAudit={() => handleAudit(2)}
            isExpanded={expandedRival === 2}
            onToggleExpand={() => setExpandedRival(expandedRival === 2 ? null : 2)}
          />
        </div>
        
        <div className="absolute left-8 top-1/2 -translate-y-1/2 z-10">
          <CorporateRival
            player={match.players[1]}
            isActive={match.turnIdx === 1}
            canAuditThis={canAuditWithSelected}
            onAudit={() => handleAudit(1)}
            isExpanded={expandedRival === 1}
            onToggleExpand={() => setExpandedRival(expandedRival === 1 ? null : 1)}
          />
        </div>
        
        <div className="absolute right-8 top-1/2 -translate-y-1/2 z-10">
          <CorporateRival
            player={match.players[3]}
            isActive={match.turnIdx === 3}
            canAuditThis={canAuditWithSelected}
            onAudit={() => handleAudit(3)}
            isExpanded={expandedRival === 3}
            onToggleExpand={() => setExpandedRival(expandedRival === 3 ? null : 3)}
          />
        </div>
        
        {/* Central Authority (Deck) - Smaller and lower */}
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2">
          <div className="bg-gradient-to-br from-green-900/60 to-green-950/60 rounded-lg p-4 shadow-lg border border-green-700">
            <div className="text-center">
              <div className="text-[10px] text-green-400">DECK</div>
              <div className="text-2xl font-bold text-green-300">{match.deck.length}</div>
              <div className="text-[10px] text-green-400">CARDS</div>
            </div>
          </div>
        </div>
        
        {/* My Factory Floor Display - Fixed position that doesn't overlap */}
        {showMyFloor && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 w-[600px] bg-black/95 border-2 border-yellow-600 rounded-lg p-4">
            <div className="flex justify-between mb-2">
              <h3 className="text-yellow-400 font-bold">
                YOUR FACTORY FLOOR ({humanPlayer.floorGroups.length} productions)
              </h3>
              <button 
                onClick={() => setShowMyFloor(false)}
                className="text-gray-400 hover:text-white text-xl"
              >
                ✕
              </button>
            </div>
            <div className="bg-gray-800 rounded p-3 max-h-96 overflow-auto">
              {humanPlayer.floorGroups.length === 0 && humanPlayer.stats.internalsRecv === 0 ? (
                <div className="text-gray-500 italic">No production on floor</div>
              ) : (
                <div className="space-y-2">
                  {/* Show audit warning if audited */}
                  {humanPlayer.stats.internalsRecv > 0 && (
                    <div className="bg-orange-900/40 border border-orange-600 rounded p-3 mb-3">
                      <div className="text-orange-400 font-bold mb-1">
                        ⚠️ FLOOR AUDITED {humanPlayer.stats.internalsRecv} TIME{humanPlayer.stats.internalsRecv > 1 ? 'S' : ''}
                      </div>
                      <div className="text-xs text-orange-300">
                        Your factory floor was reorganized. Legal productions were kept, 
                        illegal cards were confiscated and fined.
                      </div>
                    </div>
                  )}
                  
                  {/* Display productions and track reorganization */}
                  {(() => {
                    // After an audit, confiscated cards are removed from floor
                    const displayGroups = humanPlayer.floorGroups;
                    
                    // Track which productions are reorganized (from audit) vs new (after audit)
                    // Similar to opponent display
                    const reorganizedCount = humanPlayer.stats.internalsRecv > 0 ? 
                      Math.min(5, displayGroups.length) : 0;
                    
                    return (
                      <>
                        {/* Show productions - distinguish reorganized from new */}
                        {[...displayGroups].reverse().map((group, idx) => {
                          const isLegal = isLegalExact(group);
                          const groupRaw = rawValue(group);
                          const turnNumber = displayGroups.length - idx;
                          // Only the first N productions are reorganized from audit
                          const isReorganized = turnNumber <= reorganizedCount;
                          
                          return (
                            <div key={turnNumber - 1} className={`rounded p-3 relative ${
                              isLegal ? 'bg-green-900/30 border border-green-600' : 'bg-red-900/30 border border-red-600'
                            } ${isReorganized ? 'opacity-90' : ''}`}>
                              {isReorganized && (
                                <div className="absolute -top-2 -right-2 bg-orange-600 text-white text-[10px] px-2 py-0.5 rounded">
                                  POST-AUDIT
                                </div>
                              )}
                              <div className="flex justify-between items-start mb-2">
                                <div className="text-sm text-gray-400">
                                  {isReorganized ? `Reorganized Production #${turnNumber}` : `Turn #${turnNumber}`}
                                </div>
                                <div className={`text-sm font-bold ${isLegal ? 'text-green-400' : 'text-red-400'}`}>
                                  {isLegal ? `✓ LEGAL (${getHandType(group).toUpperCase()})` : `✗ ILLEGAL (Raw: ${groupRaw})`}
                                </div>
                              </div>
                              <div className="flex gap-1 flex-wrap">
                                {group.map(card => (
                                  <FactoryCard key={card.id} card={card} size="medium" />
                                ))}
                              </div>
                              <div className="mt-2 text-xs text-gray-500">
                                Points: {isLegal ? scoreLegal(groupRaw) : scoreIllegal(groupRaw, 0).points}
                              </div>
                            </div>
                          );
                        })}
                        
                        {/* Show actual confiscated cards if they exist */}
                        {humanPlayer.confiscatedCards && humanPlayer.confiscatedCards.length > 0 && (
                          <div className="border-t-2 border-red-600 pt-3 mt-3">
                            <div className="bg-red-950/50 border border-red-700 rounded p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="text-red-400 font-bold">
                                  🚫 CONFISCATED BASKET
                                </div>
                                <div className="text-xs text-red-300">
                                  (Fine: {rawValue(humanPlayer.confiscatedCards)} raw @ 1.5x = {Math.round(rawValue(humanPlayer.confiscatedCards) * 1.5)} points)
                                </div>
                              </div>
                              <div className="flex gap-1 flex-wrap mb-2">
                                {humanPlayer.confiscatedCards.map(card => (
                                  <FactoryCard key={card.id} card={card} size="medium" />
                                ))}
                              </div>
                              <div className="text-xs text-gray-400">
                                These illegal cards couldn't be reorganized into legal hands. They were confiscated and placed at the bottom of the deck.
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
              {humanCrime > 0 && (
                <div className={`mt-3 p-2 rounded text-center font-bold ${
                  humanCrime >= 40 ? 'bg-red-900/50 text-red-400' :
                  humanCrime >= 27 ? 'bg-orange-900/50 text-orange-400' :
                  humanCrime >= 15 ? 'bg-yellow-900/50 text-yellow-400' :
                  'bg-gray-900/50 text-gray-400'
                }`}>
                  Total Illegal Crime Value: {humanCrime}
                  {humanCrime >= 27 && ' (DANGEROUS!)'}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* CEO Control Panel (Player Zone) */}
      <div className="h-72 bg-gradient-to-t from-black via-gray-900 to-transparent border-t-2 border-yellow-600">
        {/* Status Bar */}
        <div className="h-16 bg-black/60 flex items-center justify-between px-8 border-b border-gray-700">
          <div className="flex items-center gap-8">
            <div>
              <div className="text-xs text-gray-400">CHIEF EXECUTIVE</div>
              <div className="text-xl font-bold text-white">YOU</div>
            </div>
            
            <div className="flex gap-4">
              <div className="bg-gray-800 rounded px-4 py-2">
                <div className="text-xs text-gray-400">MARKET CAP</div>
                <div className="text-xl font-bold text-yellow-400">{humanPlayer.score} pts</div>
              </div>
              
              <button
                onClick={() => setShowMyFloor(!showMyFloor)}
                className="bg-gray-800 hover:bg-gray-700 rounded px-4 py-2 transition-colors"
              >
                <div className="text-xs text-gray-400">FACTORY FLOOR</div>
                <div className="flex gap-2">
                  <span className="text-white">{humanPlayer.floorGroups.length} groups</span>
                  {humanCrime > 0 && (
                    <span className={`font-bold ${
                      humanCrime >= 40 ? 'text-red-400' :
                      humanCrime >= 27 ? 'text-orange-400' :
                      'text-yellow-400'
                    }`}>
                      C:{humanCrime}
                    </span>
                  )}
                </div>
              </button>
            </div>
            
            {/* Selection Preview */}
            {selectedCards.length > 0 && (
              <div className="bg-yellow-900/50 border border-yellow-600 rounded px-4 py-2">
                <div className="text-xs text-yellow-400">SELECTION ANALYSIS</div>
                <div className="flex gap-4 text-sm">
                  <span className="text-white">Raw: {selectedRaw}</span>
                  {isValidLegalPlay ? (
                    <span className="text-green-400 font-bold">
                      ✓ LEGAL ({getHandType(selectedCards).toUpperCase()}): +{legalScore}
                    </span>
                  ) : (
                    <>
                      <span className="text-gray-500 line-through">Legal: N/A</span>
                      <span className="text-orange-400">
                        Illegal: +{illegalResult?.points || 0}
                        {illegalResult?.ticksAdded ? ` (⚠️+${illegalResult.ticksAdded})` : ''}
                      </span>
                    </>
                  )}
                </div>
                {canAuditWithSelected && (
                  <div className="text-xs text-red-400 font-bold mt-1">
                    ✓ VALID AUDIT HAND!
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Production Controls */}
          <div className="flex gap-2">
            <button
              onClick={playLegal}
              disabled={!isHumanTurn || !isValidLegalPlay}
              className={`
                px-6 py-2 rounded font-bold transition-all
                ${isHumanTurn && isValidLegalPlay
                  ? 'bg-green-600 hover:bg-green-500 text-white hover:scale-105'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed opacity-50'}
              `}
            >
              {isValidLegalPlay ? 'LEGAL PRODUCTION' : 'NOT LEGAL'}
            </button>
            
            <button
              onClick={playIllegal}
              disabled={!isHumanTurn || selectedCards.length === 0}
              className={`
                px-6 py-2 rounded font-bold transition-all
                ${isHumanTurn && selectedCards.length > 0
                  ? selectedRaw >= 27 
                    ? 'bg-red-600 hover:bg-red-500 text-white hover:scale-105 animate-pulse'
                    : 'bg-orange-600 hover:bg-orange-500 text-white hover:scale-105'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed opacity-50'}
              `}
            >
              {selectedRaw >= 27 ? '⚠️ SPIKE PRODUCTION' : 'ILLEGAL PRODUCTION'}
            </button>
            
            <button
              onClick={pass}
              disabled={!isHumanTurn}
              className={`
                px-6 py-2 rounded font-bold transition-all
                ${isHumanTurn
                  ? 'bg-gray-600 hover:bg-gray-500 text-white'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed opacity-50'}
              `}
            >
              PASS
            </button>
          </div>
        </div>
        
        {/* Hand Display */}
        <div className="flex-1 flex items-center justify-center px-8 py-4 bg-gradient-to-b from-transparent to-black/50">
          <HandDisplay
            cards={humanPlayer.hand}
            selectedCards={selectedCards}
            onCardClick={handleCardClick}
            isHumanTurn={isHumanTurn}
          />
        </div>
      </div>
      
      {/* Quick Actions Bar */}
      <div className="h-12 bg-black border-t border-gray-700 flex items-center justify-between px-8">
        <div className="flex gap-2">
          <button
            onClick={() => {
              const best = bestSafeIllegalGreedy(humanPlayer.hand, 26);
              clearSelection();
              best.cards.forEach(card => selectCard(card));
            }}
            disabled={!isHumanTurn}
            className="px-4 py-1 bg-yellow-600 hover:bg-yellow-500 text-black font-bold rounded text-sm transition-all"
          >
            AUTO SAFE ≤26
          </button>
          
          <button
            onClick={() => {
              const best = bestLegalGreedy(humanPlayer.hand);
              if (best) {
                clearSelection();
                best.cards.forEach(card => selectCard(card));
              }
            }}
            disabled={!isHumanTurn}
            className="px-4 py-1 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded text-sm transition-all"
          >
            BEST LEGAL
          </button>
          
          {selectedCards.length > 0 && (
            <button
              onClick={clearSelection}
              className="px-4 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded text-sm transition-all"
            >
              CLEAR
            </button>
          )}
        </div>
        
        <div className="text-xs">
          {canAuditWithSelected
            ? <span className="text-red-400 font-bold animate-pulse">✓ AUDIT READY! Select target above</span>
            : isValidLegalPlay
            ? <span className="text-green-400">✓ Valid legal hand selected</span>
            : <span className="text-gray-500">Select cards for production or audit</span>
          }
        </div>
        
        <button
          onClick={() => setShowLog(!showLog)}
          className="px-4 py-1 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded text-sm transition-all"
        >
          {showLog ? 'HIDE' : 'SHOW'} ACTIVITY LOG
        </button>
      </div>
      
      {/* Activity Log Overlay */}
      {showLog && (
        <div className="fixed right-4 bottom-16 w-96 h-96 bg-black/90 border-2 border-purple-600 rounded-lg p-4 overflow-auto z-30">
          <h3 className="text-purple-400 font-bold mb-2">CORPORATE ACTIVITY LOG</h3>
          <div className="space-y-1 text-xs">
            {turnLog.map((entry, idx) => (
              <div key={idx} className="text-gray-400">
                <span className="text-purple-500">[{idx}]</span> {entry}
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Winner Modal */}
      {match.winnerId !== undefined && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-yellow-600 to-orange-600 rounded-2xl p-8 shadow-2xl border-4 border-yellow-400">
            <h2 className="text-5xl font-bold text-black mb-4 text-center">
              {match.players[match.winnerId].name === 'You' 
                ? '🏆 INDUSTRIAL DOMINANCE ACHIEVED!' 
                : '💀 CORPORATE BANKRUPTCY'}
            </h2>
            <p className="text-2xl text-black text-center mb-6">
              {match.players[match.winnerId].name} controls the market with {match.players[match.winnerId].score} points
            </p>
            <button
              onClick={() => newMatch()}
              className="w-full py-4 bg-black hover:bg-gray-900 text-yellow-400 rounded-lg font-bold text-xl transition-all"
            >
              ESTABLISH NEW CORPORATION
            </button>
          </div>
        </div>
      )}
      
      {/* AI Trainer Overlay */}
      {showAITrainer && (
        <div className="fixed inset-0 bg-black/95 z-50 overflow-auto">
          <div className="min-h-screen p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-3xl font-bold text-yellow-500">AI TRAINING LABORATORY</h2>
              <button
                onClick={() => setShowAITrainer(false)}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition-all"
              >
                ✕ CLOSE
              </button>
            </div>
            <AITrainer />
          </div>
        </div>
      )}
    </div>
  );
}