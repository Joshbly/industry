import { useState } from 'react';
import useGameStore from '../store/gameStore';
import { Card } from './Card';
import type { Card as CardType, PlayerState } from '../engine/types';
import { bestLegalGreedy, bestSafeIllegalGreedy } from '../engine/evaluation';
import { rawValue } from '../engine/deck';
import { scoreLegal, scoreIllegal } from '../engine/scoring';

function OpponentZone({ player, isActive, onAudit }: { 
  player: PlayerState; 
  isActive: boolean;
  onAudit?: () => void;
}) {
  const totalCrime = player.floor.reduce((sum, card) => {
    const value = card.r <= 10 ? card.r : card.r === 14 ? 11 : 10;
    return sum + value;
  }, 0);

  return (
    <div className={`
      w-64 h-40 rounded-lg p-3 transition-all
      ${isActive ? 'ring-2 ring-yellow-400 bg-yellow-900/20' : 'bg-gray-800/50'}
    `}>
      <div className="flex justify-between items-start mb-2">
        <div>
          <div className="font-bold text-white">{player.name}</div>
          <div className="text-xs text-gray-400">{player.persona}</div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold text-white">{player.score}</div>
          <div className="text-xs text-gray-400">Cards: {player.hand.length}</div>
        </div>
      </div>
      
      {/* Mini factory floor */}
      <div className="bg-black/40 rounded p-2 h-16 overflow-hidden">
        {player.floorGroups.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {player.floorGroups.map((group, idx) => (
              <div key={idx} className="flex">
                {group.slice(0, 3).map(card => (
                  <div key={card.id} className="w-5 h-7 bg-white rounded-sm text-xs flex items-center justify-center">
                    <span className={card.s === 'H' || card.s === 'D' ? 'text-red-600' : 'text-black'}>
                      {card.r <= 10 ? card.r : card.r === 11 ? 'J' : card.r === 12 ? 'Q' : card.r === 13 ? 'K' : 'A'}
                    </span>
                  </div>
                ))}
                {group.length > 3 && (
                  <div className="text-white text-xs ml-1">+{group.length - 3}</div>
                )}
              </div>
            ))}
          </div>
        )}
        {totalCrime > 0 && (
          <div className={`text-xs mt-1 ${totalCrime >= 40 ? 'text-red-400' : totalCrime >= 25 ? 'text-orange-400' : 'text-yellow-400'}`}>
            Crime: {totalCrime}
          </div>
        )}
      </div>
      
      {onAudit && (
        <button
          onClick={onAudit}
          className="mt-2 w-full py-1 bg-orange-600 hover:bg-orange-500 text-white text-xs rounded transition-colors"
        >
          Audit
        </button>
      )}
    </div>
  );
}

export function GameLayout() {
  const match = useGameStore(state => state.match);
  const selectedCards = useGameStore(state => state.selectedCards);
  const selectCard = useGameStore(state => state.selectCard);
  const deselectCard = useGameStore(state => state.deselectCard);
  const clearSelection = useGameStore(state => state.clearSelection);
  const playLegal = useGameStore(state => state.playLegal);
  const playIllegal = useGameStore(state => state.playIllegal);
  const pass = useGameStore(state => state.pass);
  const triggerInternal = useGameStore(state => state.triggerInternal);
  const newMatch = useGameStore(state => state.newMatch);
  const [showStats, setShowStats] = useState(true);
  
  if (!match) {
    return (
      <div className="h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-2xl">Loading...</div>
      </div>
    );
  }
  
  const humanPlayer = match.players[0];
  const selectedRaw = rawValue(selectedCards);
  const isHumanTurn = match.turnIdx === 0;
  
  const handleCardClick = (card: CardType) => {
    if (!isHumanTurn) return;
    const isSelected = selectedCards.some(c => c.id === card.id);
    if (isSelected) {
      deselectCard(card);
    } else {
      selectCard(card);
    }
  };
  
  const handleSafeIllegal = () => {
    const best = bestSafeIllegalGreedy(humanPlayer.hand, 26);
    clearSelection();
    best.cards.forEach(card => selectCard(card));
  };
  
  const handleBestLegal = () => {
    const best = bestLegalGreedy(humanPlayer.hand);
    if (best) {
      clearSelection();
      best.cards.forEach(card => selectCard(card));
    }
  };
  
  const legalPoints = selectedCards.length > 0 ? scoreLegal(selectedRaw) : 0;
  const illegalResult = selectedCards.length > 0 ? scoreIllegal(selectedRaw) : null;
  
  return (
    <div className="h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 overflow-hidden flex flex-col select-none">
      {/* Top Bar - Game Status */}
      <div className="h-16 bg-black/50 flex items-center justify-between px-6 border-b border-gray-700">
        <div className="flex items-center gap-4">
          <button
            onClick={() => newMatch()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded transition-colors"
          >
            New Game
          </button>
          <div className="text-white">
            <span className="text-gray-400">Turn: </span>
            <span className="font-bold text-yellow-400">
              {match.players[match.turnIdx].name}
            </span>
          </div>
        </div>
        
        {/* Audit Track */}
        <div className="flex items-center gap-3">
          <div className="text-white font-bold">Audit Track:</div>
          <div className="flex gap-1">
            {[0, 1, 2, 3, 4].map(i => (
              <div
                key={i}
                className={`w-8 h-8 rounded border-2 flex items-center justify-center font-bold
                  ${i < match.auditTrack 
                    ? 'bg-red-600 border-red-400 text-white' 
                    : 'bg-gray-700 border-gray-600 text-gray-500'}`}
              >
                {i + 1}
              </div>
            ))}
          </div>
          {match.auditTrack >= 4 && (
            <div className="text-orange-400 font-bold animate-pulse">
              {match.auditTrack === 4 ? '⚠️ DANGER!' : 'HIGH RISK'}
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-white">
            <span className="text-gray-400">Deck: </span>
            <span className="font-bold">{match.deck.length}</span>
          </div>
          <button
            onClick={() => setShowStats(!showStats)}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded transition-colors"
          >
            {showStats ? 'Hide' : 'Show'} Stats
          </button>
        </div>
      </div>
      
      {/* Main Game Area */}
      <div className="flex-1 flex">
        {/* Left Sidebar - Stats */}
        {showStats && (
          <div className="w-64 bg-black/30 p-4 border-r border-gray-700">
            <h3 className="text-white font-bold mb-4">Game Stats</h3>
            <div className="space-y-3">
              {[...match.players].sort((a, b) => b.score - a.score).map(player => (
                <div key={player.id} className="bg-gray-800/50 rounded p-3">
                  <div className="flex justify-between text-white mb-2">
                    <span className="font-bold">{player.name}</span>
                    <span className="text-yellow-400">{player.score} pts</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-xs text-gray-400">
                    <div>Legal: {player.stats.legal}</div>
                    <div>Illegal: {player.stats.illegal}</div>
                    <div>Spikes: {player.stats.spikes}</div>
                    <div>Audits: {player.stats.internalsDone}</div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-6">
              <h4 className="text-white font-bold mb-2">Target: 300 pts</h4>
              <div className="text-gray-400 text-sm">
                Leader: {Math.max(...match.players.map(p => p.score))} pts
              </div>
            </div>
          </div>
        )}
        
        {/* Center - Game Table */}
        <div className="flex-1 relative">
          {/* Opponents positioned around table */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2">
            <OpponentZone 
              player={match.players[2]} 
              isActive={match.turnIdx === 2}
              onAudit={isHumanTurn ? () => triggerInternal(2) : undefined}
            />
          </div>
          
          <div className="absolute left-4 top-1/2 -translate-y-1/2">
            <OpponentZone 
              player={match.players[1]} 
              isActive={match.turnIdx === 1}
              onAudit={isHumanTurn ? () => triggerInternal(1) : undefined}
            />
          </div>
          
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <OpponentZone 
              player={match.players[3]} 
              isActive={match.turnIdx === 3}
              onAudit={isHumanTurn ? () => triggerInternal(3) : undefined}
            />
          </div>
          
          {/* Center Table */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-gradient-to-br from-green-900 to-green-800 rounded-2xl w-96 h-64 shadow-2xl flex items-center justify-center">
              <div className="text-center">
                <div className="text-6xl font-bold text-white/20 mb-2">
                  {match.deck.length}
                </div>
                <div className="text-white/50">Cards Remaining</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Bottom Area - Player Zone */}
      <div className="h-80 bg-gradient-to-t from-gray-900 to-transparent border-t border-gray-700">
        {/* Player Info Bar */}
        <div className="h-16 bg-black/30 flex items-center justify-between px-6">
          <div className="flex items-center gap-6">
            <div>
              <div className="text-white font-bold text-lg">You</div>
              <div className="text-gray-400 text-sm">Score: {humanPlayer.score}</div>
            </div>
            
            {/* Factory Floor Display */}
            <div className="bg-gray-800/50 rounded px-4 py-2">
              <div className="text-xs text-gray-400 mb-1">Factory Floor</div>
              <div className="flex gap-1">
                {humanPlayer.floorGroups.map((group, idx) => (
                  <div key={idx} className="bg-black/40 rounded px-1">
                    <span className="text-white text-xs">{group.length}</span>
                  </div>
                ))}
                {humanPlayer.floor.length === 0 && (
                  <span className="text-gray-500 text-xs">Empty</span>
                )}
              </div>
            </div>
          </div>
          
          {/* Selection Info */}
          {selectedCards.length > 0 && (
            <div className="bg-gray-800/50 rounded px-4 py-2">
              <div className="text-white text-sm">
                {selectedCards.length} cards • Raw: {selectedRaw}
              </div>
              <div className="flex gap-4 text-xs">
                <span className="text-green-400">Legal: {legalPoints}</span>
                <span className="text-orange-400">
                  Illegal: {illegalResult?.points || 0}
                  {illegalResult?.kickback ? ` (-${illegalResult.kickback})` : ''}
                </span>
              </div>
            </div>
          )}
          
          {/* Action Buttons */}
          <div className="flex gap-2">
            <button
              onClick={playLegal}
              disabled={!isHumanTurn || selectedCards.length === 0}
              className={`px-4 py-2 rounded font-bold transition-colors ${
                isHumanTurn && selectedCards.length > 0
                  ? 'bg-green-600 hover:bg-green-500 text-white'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              Play Legal
            </button>
            
            <button
              onClick={playIllegal}
              disabled={!isHumanTurn || selectedCards.length === 0}
              className={`px-4 py-2 rounded font-bold transition-colors ${
                isHumanTurn && selectedCards.length > 0
                  ? 'bg-red-600 hover:bg-red-500 text-white'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              Play Illegal
            </button>
            
            <button
              onClick={handleSafeIllegal}
              disabled={!isHumanTurn}
              className={`px-4 py-2 rounded font-bold transition-colors ${
                isHumanTurn
                  ? 'bg-yellow-600 hover:bg-yellow-500 text-white'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              Safe ≤26
            </button>
            
            <button
              onClick={handleBestLegal}
              disabled={!isHumanTurn}
              className={`px-4 py-2 rounded font-bold transition-colors ${
                isHumanTurn
                  ? 'bg-blue-600 hover:bg-blue-500 text-white'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              Best Legal
            </button>
            
            <button
              onClick={pass}
              disabled={!isHumanTurn}
              className={`px-4 py-2 rounded font-bold transition-colors ${
                isHumanTurn
                  ? 'bg-gray-600 hover:bg-gray-500 text-white'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              Pass
            </button>
            
            {selectedCards.length > 0 && (
              <button
                onClick={clearSelection}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>
        
        {/* Hand Display */}
        <div className="flex-1 flex items-center justify-center px-8 py-4">
          <div className="flex gap-2">
            {humanPlayer.hand.length === 0 ? (
              <div className="text-gray-500">No cards in hand</div>
            ) : (
              humanPlayer.hand.map((card) => {
                const isSelected = selectedCards.some(c => c.id === card.id);
                return (
                  <div
                    key={card.id}
                    className={`transition-all cursor-pointer ${
                      isSelected ? 'transform -translate-y-4' : 'hover:-translate-y-2'
                    }`}
                    onClick={() => handleCardClick(card)}
                  >
                    <Card
                      card={card}
                      selected={isSelected}
                      size="large"
                      faceUp={true}
                    />
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
      
      {/* Winner Modal */}
      {match.winnerId !== undefined && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-yellow-500 to-orange-600 rounded-xl p-8 shadow-2xl">
            <h2 className="text-4xl font-bold text-white mb-4">
              {match.players[match.winnerId].name === 'You' ? '🎉 VICTORY!' : '😞 DEFEAT'}
            </h2>
            <p className="text-white text-xl mb-6">
              {match.players[match.winnerId].name} wins with {match.players[match.winnerId].score} points!
            </p>
            <button
              onClick={() => newMatch()}
              className="w-full py-3 bg-white hover:bg-gray-100 text-gray-900 rounded-lg font-bold text-lg transition-colors"
            >
              New Game
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
