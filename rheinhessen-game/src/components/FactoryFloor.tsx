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
  const floorGroups = selectedPlayer.floorGroups || [];
  const crimeTotal = rawValue(selectedPlayer.floor);
  
  const getCardDisplay = (card: Card) => {
    const rankStr = card.r <= 10 ? card.r.toString() : 
                    card.r === 11 ? 'J' : 
                    card.r === 12 ? 'Q' : 
                    card.r === 13 ? 'K' : 'A';
    const suitStr = card.s === 'S' ? '♠' : 
                    card.s === 'H' ? '♥' : 
                    card.s === 'D' ? '♦' : '♣';
    const isRed = card.s === 'H' || card.s === 'D';
    
    return (
      <div className="bg-white rounded-lg px-3 py-2 shadow-md hover:shadow-lg transition-shadow">
        <div className={`font-bold text-center ${isRed ? 'text-red-500' : 'text-gray-900'}`}>
          <div className="text-sm">{rankStr}</div>
          <div className="text-lg leading-none">{suitStr}</div>
        </div>
      </div>
    );
  };
  
  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-lg">
          <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-white">Factory Floor Inspector</h3>
      </div>
      
      {/* Player tabs */}
      <div className="grid grid-cols-4 gap-1 p-1 bg-black/30 rounded-xl mb-4">
        {match.players.map(player => (
          <button
            key={player.id}
            onClick={() => setSelectedPlayerId(player.id)}
            className={`
              px-3 py-2 rounded-lg text-sm font-medium transition-all
              ${selectedPlayerId === player.id
                ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
              }
            `}
          >
            {player.name}
          </button>
        ))}
      </div>
      
      {/* Floor statistics */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-black/30 rounded-lg p-3">
          <div className="text-xs text-gray-500">Cards</div>
          <div className="text-xl font-bold text-white">{selectedPlayer.floor.length}</div>
        </div>
        <div className="bg-black/30 rounded-lg p-3">
          <div className="text-xs text-gray-500">Crime Value</div>
          <div className={`text-xl font-bold ${
            crimeTotal >= 40 ? 'text-red-400' : 
            crimeTotal >= 25 ? 'text-orange-400' : 
            'text-green-400'
          }`}>
            {crimeTotal}
          </div>
        </div>
        <div className="bg-black/30 rounded-lg p-3">
          <div className="text-xs text-gray-500">Audits Recv</div>
          <div className="text-xl font-bold text-orange-400">{selectedPlayer.stats.internalsRecv}</div>
        </div>
      </div>
      
      {/* Floor display */}
      <div className="bg-black/30 rounded-xl p-4 max-h-64 overflow-y-auto">
        {selectedPlayer.floor.length === 0 ? (
          <div className="text-center py-8">
            <svg className="w-12 h-12 mx-auto mb-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} 
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <p className="text-gray-500">Factory floor is empty</p>
          </div>
        ) : floorGroups.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            Floor not initialized (old save)
          </div>
        ) : (
          <div className="space-y-3">
            {floorGroups.map((group, idx) => {
              const handType = getHandType(group);
              const isLegal = handType !== 'illegal';
              const groupRaw = rawValue(group);
              
              return (
                <div 
                  key={idx}
                  className={`
                    p-3 rounded-xl border-2 transition-all
                    ${isLegal 
                      ? 'bg-green-500/10 border-green-500/30' 
                      : 'bg-red-500/10 border-red-500/30'
                    }
                  `}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-semibold uppercase ${
                      isLegal ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {handType}
                    </span>
                    <span className="text-xs text-gray-400">
                      Raw: {groupRaw}
                    </span>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {group.map((card, cardIdx) => (
                      <div key={`${card.id}-${cardIdx}`}>
                        {getCardDisplay(card)}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      {/* Audit warning */}
      {selectedPlayer.floor.length > 0 && (
        <div className={`mt-4 p-3 rounded-lg ${
          crimeTotal >= 40 ? 'bg-red-500/10 border border-red-500/30' :
          crimeTotal >= 25 ? 'bg-orange-500/10 border border-orange-500/30' :
          'bg-green-500/10 border border-green-500/30'
        }`}>
          <div className="flex items-center gap-2">
            <svg className={`w-4 h-4 ${
              crimeTotal >= 40 ? 'text-red-400' :
              crimeTotal >= 25 ? 'text-orange-400' :
              'text-green-400'
            }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d={crimeTotal >= 25 
                  ? "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  : "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                } />
            </svg>
            <span className={`text-xs ${
              crimeTotal >= 40 ? 'text-red-400' :
              crimeTotal >= 25 ? 'text-orange-400' :
              'text-green-400'
            }`}>
              {crimeTotal >= 40 ? 'HIGH RISK: Major audit target!' :
               crimeTotal >= 25 ? 'MODERATE RISK: Potential audit target' :
               'LOW RISK: Minimal audit concern'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}