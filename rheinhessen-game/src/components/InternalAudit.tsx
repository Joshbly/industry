import { useState } from 'react';
import useGameStore from '../store/gameStore';
import { isLegalExact, getHandType } from '../engine/evaluation';
import { calculateTaxedValue } from '../engine/scoring';
import { reorganizeGreedy } from '../engine/audits';
import { rawValue } from '../engine/deck';

const AUDIT_VALID_HANDS = ['trips', 'straight', 'flush', 'full-house', 'quads', 'straight-flush'];

export function InternalAudit() {
  const match = useGameStore(state => state.match);
  const selectedCards = useGameStore(state => state.selectedCards);
  const triggerInternalWithCards = useGameStore(state => state.triggerInternalWithCards);
  const [showTargetPicker, setShowTargetPicker] = useState(false);
  
  if (!match || match.winnerId !== undefined) return null;
  
  const currentPlayer = match.players[match.turnIdx];
  if (currentPlayer.persona !== 'Human') return null;
  
  const isSelectedLegal = selectedCards.length > 0 && isLegalExact(selectedCards);
  const selectedHandType = isSelectedLegal ? getHandType(selectedCards) : 'illegal';
  const isTripsOrBetter = AUDIT_VALID_HANDS.includes(selectedHandType);
  const selectedRaw = rawValue(selectedCards);
  const selectedTaxed = calculateTaxedValue(selectedRaw);
  const canAudit = isSelectedLegal && isTripsOrBetter && selectedTaxed >= 12;
  
  const handleAudit = (targetId: number) => {
    triggerInternalWithCards(targetId, selectedCards);
    setShowTargetPicker(false);
  };
  
  const getEstimatedFine = (playerId: number) => {
    const player = match.players[playerId];
    if (player.floor.length === 0) return 0;
    const { leftover } = reorganizeGreedy(player.floor);
    return rawValue(leftover);
  };
  
  return (
    <>
      <button
        onClick={() => setShowTargetPicker(true)}
        disabled={!canAudit}
        className={`
          w-full px-4 py-3 rounded-xl font-semibold transition-all
          ${canAudit
            ? 'bg-gradient-to-r from-orange-600 to-red-600 text-white hover:shadow-lg transform hover:-translate-y-0.5'
            : 'bg-gray-800 text-gray-500 cursor-not-allowed opacity-50'
          }
        `}
      >
        <div className="flex items-center justify-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span>Trigger Audit</span>
        </div>
        <div className="text-xs mt-1 opacity-75">
          {selectedCards.length === 0 ? (
            'Select trips+ (taxed ≥12)'
          ) : !isSelectedLegal ? (
            'Not a legal hand'
          ) : !isTripsOrBetter ? (
            `${selectedHandType} - need trips+`
          ) : selectedTaxed < 12 ? (
            `${selectedHandType} - taxed ${selectedTaxed} (need ≥12)`
          ) : (
            `Ready: ${selectedHandType}, taxed ${selectedTaxed}`
          )}
        </div>
      </button>
      
      {showTargetPicker && (
        <div className="fixed inset-0 modal-overlay flex items-center justify-center z-50 animate-fade">
          <div className="glass rounded-3xl p-8 max-w-lg w-full mx-4">
            <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-orange-500/20 to-red-500/20 rounded-xl">
                <svg className="w-6 h-6 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              Select Audit Target
            </h3>
            
            <div className="space-y-3 mb-6">
              {match.players
                .filter(p => p.id !== currentPlayer.id)
                .map(player => {
                  const estimatedFine = getEstimatedFine(player.id);
                  const netGain = estimatedFine - Math.round(selectedRaw * 0.7);
                  const crimeAmount = rawValue(player.floor);
                  
                  return (
                    <button
                      key={player.id}
                      onClick={() => handleAudit(player.id)}
                      className="w-full p-4 bg-gradient-to-r from-gray-800/80 to-gray-700/80 hover:from-orange-900/30 hover:to-red-900/30 rounded-xl border border-gray-600 hover:border-orange-500/50 transition-all transform hover:scale-[1.02]"
                    >
                      <div className="flex justify-between items-start">
                        <div className="text-left">
                          <div className="text-white font-semibold text-lg">{player.name}</div>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-gray-400">
                              Floor: {player.floor.length} cards
                            </span>
                            <span className={`text-xs ${
                              crimeAmount >= 40 ? 'text-red-400' : 
                              crimeAmount >= 25 ? 'text-orange-400' : 
                              'text-gray-400'
                            }`}>
                              Crime: {crimeAmount}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-green-400">
                            +{estimatedFine}
                          </div>
                          <div className={`text-xs ${netGain > 0 ? 'text-green-400' : 'text-red-400'}`}>
                            Net: {netGain > 0 ? '+' : ''}{netGain}
                          </div>
                        </div>
                      </div>
                      {crimeAmount >= 40 && (
                        <div className="mt-2 text-xs text-orange-300 text-left">
                          ⚠ High crime target - likely profitable
                        </div>
                      )}
                    </button>
                  );
                })}
            </div>
            
            <button
              onClick={() => setShowTargetPicker(false)}
              className="w-full px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-semibold transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
