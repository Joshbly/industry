import { useState } from 'react';
import useGameStore from '../store/gameStore';
import { isLegalExact, getHandType } from '../engine/evaluation';
import { calculateTaxedValue } from '../engine/scoring';
import { reorganizeGreedy } from '../engine/audits';
import { rawValue } from '../engine/deck';

// Valid hand types for internal audit (trips or better)
const AUDIT_VALID_HANDS = ['trips', 'straight', 'flush', 'full-house', 'quads', 'straight-flush'];

export function InternalAudit() {
  const match = useGameStore(state => state.match);
  const selectedCards = useGameStore(state => state.selectedCards);
  const triggerInternalWithCards = useGameStore(state => state.triggerInternalWithCards);
  const [showTargetPicker, setShowTargetPicker] = useState(false);
  
  if (!match || match.winnerId !== undefined) return null;
  
  const currentPlayer = match.players[match.turnIdx];
  if (currentPlayer.persona !== 'Human') return null;
  
  // Check if selected cards form a legal hand (trips or better) with taxed >= 12
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
  
  // Calculate estimated fines for each opponent
  const getEstimatedFine = (playerId: number) => {
    const player = match.players[playerId];
    if (player.floor.length === 0) return 0;
    const { leftover } = reorganizeGreedy(player.floor);
    return Math.round(rawValue(leftover) * 1.5); // 1.5x multiplier
  };
  
  return (
    <>
      <button
        onClick={() => setShowTargetPicker(true)}
        disabled={!canAudit}
        className={`w-full px-4 py-2 rounded font-medium transition-colors ${
          canAudit
            ? 'bg-orange-600 hover:bg-orange-700 text-white'
            : 'bg-gray-600 text-gray-400 cursor-not-allowed'
        }`}
      >
        Trigger Internal Audit
        <div className="text-xs mt-1">
          {selectedCards.length === 0 ? (
            'Select trips or better (taxed ≥12)'
          ) : !isSelectedLegal ? (
            'Selected cards are not a legal hand'
          ) : !isTripsOrBetter ? (
            `${selectedHandType} - need trips or better for audit`
          ) : selectedTaxed < 12 ? (
            `${selectedHandType} - taxed ${selectedTaxed} (need ≥12)`
          ) : (
            `Using: ${selectedHandType}, taxed ${selectedTaxed}`
          )}
        </div>
      </button>
      
      {showTargetPicker && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-lg max-w-md w-full">
            <h3 className="text-xl font-bold text-white mb-4">Select Audit Target</h3>
            
            <div className="space-y-2">
              {match.players
                .filter(p => p.id !== currentPlayer.id)
                .map(player => {
                  const estimatedFine = getEstimatedFine(player.id);
                  return (
                    <button
                      key={player.id}
                      onClick={() => handleAudit(player.id)}
                      className="w-full p-3 bg-gray-700 hover:bg-gray-600 rounded text-left transition-colors"
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="text-white font-medium">{player.name}</div>
                          <div className="text-sm text-gray-400">
                            Floor: {player.floor.length} cards
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-green-400 font-medium">
                            Est. Fine: {estimatedFine}
                          </div>
                          {isSelectedLegal && (
                            <div className="text-xs text-gray-400">
                              Net: {estimatedFine - Math.round(selectedRaw * 0.7)}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
            </div>
            
            <button
              onClick={() => setShowTargetPicker(false)}
              className="mt-4 w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
