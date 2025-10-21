import useGameStore from '../store/gameStore';
import { bestLegalGreedy, bestSafeIllegalGreedy } from '../engine/evaluation';
import { rawValue } from '../engine/deck';
import { scoreLegal, scoreIllegal } from '../engine/scoring';

export function GameControlsNew() {
  const match = useGameStore(state => state.match);
  const selectedCards = useGameStore(state => state.selectedCards);
  const selectCard = useGameStore(state => state.selectCard);
  const clearSelection = useGameStore(state => state.clearSelection);
  const playLegal = useGameStore(state => state.playLegal);
  const playIllegal = useGameStore(state => state.playIllegal);
  const pass = useGameStore(state => state.pass);
  
  if (!match || match.players[match.turnIdx].persona !== 'Human') {
    return null;
  }
  
  const humanPlayer = match.players[0];
  const canPlay = selectedCards.length > 0;
  
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
  
  // Calculate potential scores for selected cards
  const selectedRaw = rawValue(selectedCards);
  const legalScore = selectedCards.length > 0 ? scoreLegal(selectedRaw) : 0;
  const illegalResult = selectedCards.length > 0 ? scoreIllegal(selectedRaw) : null;
  
  return (
    <div className="bg-gradient-to-r from-indigo-900 to-purple-900 rounded-lg p-4 shadow-xl">
      {/* Selection Info */}
      {selectedCards.length > 0 && (
        <div className="mb-4 p-3 bg-white/10 rounded-lg" style={{ backdropFilter: 'blur(8px)' }}>
          <div className="text-white text-sm mb-2">
            Selection: {selectedCards.length} cards • Raw Value: {selectedRaw}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="text-green-300">
              Legal Points: {legalScore}
            </div>
            <div className="text-orange-300">
              Illegal Points: {illegalResult?.points || 0}
              {illegalResult?.kickback ? ` (-${illegalResult.kickback} kickback)` : ''}
            </div>
          </div>
        </div>
      )}
      
      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <button
          onClick={playLegal}
          disabled={!canPlay}
          className={`
            py-3 px-4 rounded-lg font-semibold transition-all
            ${canPlay 
              ? 'bg-green-500 hover:bg-green-600 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-0.5' 
              : 'bg-gray-600 text-gray-400 cursor-not-allowed opacity-50'}
          `}
        >
          <div className="text-sm">Play LEGAL</div>
          <div className="text-xs opacity-80 mt-1">70% + 8 bonus</div>
        </button>
        
        <button
          onClick={playIllegal}
          disabled={!canPlay}
          className={`
            py-3 px-4 rounded-lg font-semibold transition-all
            ${canPlay 
              ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-0.5' 
              : 'bg-gray-600 text-gray-400 cursor-not-allowed opacity-50'}
          `}
        >
          <div className="text-sm">Play ILLEGAL</div>
          <div className="text-xs opacity-80 mt-1">
            60% {selectedRaw >= 27 ? '⚠️ SPIKE' : ''}
          </div>
        </button>
      </div>
      
      {/* Helper Buttons */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={handleSafeIllegal}
          className="py-2 px-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm font-semibold transition-all hover:shadow-lg"
        >
          Safe ≤26
        </button>
        
        <button
          onClick={handleBestLegal}
          className="py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-all hover:shadow-lg"
        >
          Best Legal
        </button>
        
        <button
          onClick={pass}
          className="py-2 px-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-semibold transition-all hover:shadow-lg"
        >
          Pass
        </button>
      </div>
      
      {/* Clear Selection */}
      {selectedCards.length > 0 && (
        <button
          onClick={clearSelection}
          className="mt-2 w-full py-1 text-gray-400 hover:text-white text-sm transition-colors"
        >
          Clear Selection
        </button>
      )}
    </div>
  );
}
