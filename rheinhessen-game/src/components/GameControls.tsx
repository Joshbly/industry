import useGameStore from '../store/gameStore';
import { isLegalExact } from '../engine/evaluation';
import { rawValue } from '../engine/deck';
import { scoreLegal, scoreIllegal } from '../engine/scoring';
import { InternalAudit } from './InternalAudit';

export function GameControls() {
  const match = useGameStore(state => state.match);
  const selectedCards = useGameStore(state => state.selectedCards);
  const playLegal = useGameStore(state => state.playLegal);
  const playIllegal = useGameStore(state => state.playIllegal);
  const playSafe = useGameStore(state => state.playSafe);
  const pass = useGameStore(state => state.pass);
  const clearSelection = useGameStore(state => state.clearSelection);
  
  if (!match || match.winnerId !== undefined) return null;
  
  const currentPlayer = match.players[match.turnIdx];
  const isHumanTurn = currentPlayer.persona === 'Human';
  const canPlayLegal = selectedCards.length > 0 && isLegalExact(selectedCards);
  const canPlayIllegal = selectedCards.length > 0;
  
  return (
    <div className="space-y-4 p-4 bg-gray-800 rounded-lg">
      <div className="text-white font-semibold">
        {isHumanTurn ? 'Your Turn' : `${currentPlayer.name}'s Turn`}
      </div>
      
      {isHumanTurn && (
        <>
          <div className="mb-2">
            <InternalAudit />
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={playLegal}
              disabled={!canPlayLegal}
              className={`px-4 py-2 rounded font-medium transition-colors ${
                canPlayLegal 
                  ? 'bg-green-600 hover:bg-green-700 text-white' 
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'
              }`}
            >
              Play LEGAL
            </button>
            
            <button
              onClick={playIllegal}
              disabled={!canPlayIllegal}
              className={`px-4 py-2 rounded font-medium transition-colors ${
                canPlayIllegal 
                  ? 'bg-yellow-600 hover:bg-yellow-700 text-white' 
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'
              }`}
            >
              Play ILLEGAL
            </button>
            
            <button
              onClick={playSafe}
              className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
            >
              Safe ILLEGAL ≤26
            </button>
            
            <button
              onClick={pass}
              className="px-4 py-2 rounded bg-gray-600 hover:bg-gray-700 text-white font-medium transition-colors"
            >
              Pass
            </button>
          </div>
        </>
      )}
      
      {selectedCards.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm text-gray-300">
            Selected: {selectedCards.length} cards
          </div>
          <div className="text-sm text-gray-300">
            Raw Value: {rawValue(selectedCards)}
          </div>
          {canPlayLegal && (
            <div className="text-sm text-green-400">
              Legal Points: {scoreLegal(rawValue(selectedCards))}
            </div>
          )}
          {!canPlayLegal && canPlayIllegal && (
            <div className="text-sm text-yellow-400">
              Illegal Points: {scoreIllegal(rawValue(selectedCards), match.auditTrack).points}
            </div>
          )}
          <button
            onClick={clearSelection}
            className="px-3 py-1 rounded bg-red-600 hover:bg-red-700 text-white text-sm transition-colors"
          >
            Clear Selection
          </button>
        </div>
      )}
    </div>
  );
}
