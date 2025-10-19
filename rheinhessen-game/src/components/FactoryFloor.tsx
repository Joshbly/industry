import { useState } from 'react';
import useGameStore from '../store/gameStore';
import type { Card } from '../engine/types';
import { getHandType } from '../engine/evaluation';
import { rawValue } from '../engine/deck';

export function FactoryFloor() {
  const match = useGameStore(state => state.match);
  const [selectedPlayerId, setSelectedPlayerId] = useState(0);
  
  if (!match) return null;
  
  const selectedPlayer = match.players[selectedPlayerId];
  
  const getCardDisplay = (card: Card) => {
    const rankStr = card.r <= 10 ? card.r.toString() : 
                    card.r === 11 ? 'J' : 
                    card.r === 12 ? 'Q' : 
                    card.r === 13 ? 'K' : 'A';
    const suitStr = card.s === 'S' ? '♠' : 
                    card.s === 'H' ? '♥' : 
                    card.s === 'D' ? '♦' : '♣';
    const color = (card.s === 'H' || card.s === 'D') ? 'text-red-500' : 'text-gray-900';
    
    return (
      <div className={`${color} font-bold text-xs`}>
        {rankStr}{suitStr}
      </div>
    );
  };
  
  // Use the actual floor groups from game state
  const floorGroups = selectedPlayer.floorGroups || [];
  
  return (
    <div className="p-4 bg-gray-800 rounded-lg">
      <div className="mb-3">
        <h3 className="text-white font-semibold mb-2">Factory Floor Viewer</h3>
        
        {/* Player selector tabs */}
        <div className="flex gap-1 mb-3">
          {match.players.map(player => (
            <button
              key={player.id}
              onClick={() => setSelectedPlayerId(player.id)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                selectedPlayerId === player.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {player.name}
              {player.id === 0 && ' (You)'}
            </button>
          ))}
        </div>
      </div>
      
      {/* Floor display */}
      <div className="bg-gray-900 rounded p-3 max-h-64 overflow-y-auto">
        <div className="flex justify-between text-xs text-gray-400 mb-2">
          <span>Floor Cards: {selectedPlayer.floor.length}</span>
          <span className="font-semibold text-yellow-400">
            Total Crime: {rawValue(selectedPlayer.floor)} raw points
          </span>
        </div>
        
        {selectedPlayer.floor.length === 0 ? (
          <div className="text-gray-500 text-center py-4">
            No cards on factory floor yet
          </div>
        ) : floorGroups.length === 0 ? (
          <div className="text-gray-500 text-center py-4">
            Floor not initialized (old save)
          </div>
        ) : (
          <div className="space-y-2">
            {selectedPlayer.stats.internalsRecv > 0 && (
              <div className="text-xs text-orange-400 border border-orange-700 bg-orange-900/20 rounded p-1">
                Floor reorganized after audit
              </div>
            )}
            {floorGroups.map((group, idx) => {
              const handType = getHandType(group);
              const isLegal = handType !== 'illegal';
              
              return (
                <div 
                  key={idx}
                  className={`flex items-center gap-1 p-2 rounded border ${
                    isLegal ? 'border-green-700 bg-green-900/20' : 'border-red-700 bg-red-900/20'
                  }`}
                >
                  <div className="flex gap-1">
                    {group.map((card, cardIdx) => (
                      <div
                        key={`${card.id}-${cardIdx}`}
                        className="bg-white rounded px-2 py-1 shadow-sm"
                      >
                        {getCardDisplay(card)}
                      </div>
                    ))}
                  </div>
                  <div className="ml-auto text-xs">
                    <span className={isLegal ? 'text-green-400' : 'text-red-400'}>
                      {handType}
                    </span>
                    <span className="text-gray-400 ml-1">
                      (raw: {rawValue(group)})
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      {/* Audit status */}
      {selectedPlayer.floor.length > 0 && (
        <div className="mt-2 text-xs text-gray-400">
          {selectedPlayer.stats.internalsRecv > 0 && (
            <div className="text-orange-400 mb-1">
              ⚠️ Floor has been audited {selectedPlayer.stats.internalsRecv} time(s)
            </div>
          )}
          <div>If audited now:</div>
          <div className="text-yellow-400">
            Reorganization would find leftover illegal cards
          </div>
          <div className="text-gray-500">
            (Auto-greedy packing - no manual reorg available)
          </div>
        </div>
      )}
    </div>
  );
}
