import useGameStore from '../store/gameStore';
import { scoreLegal, scoreIllegal } from '../engine/scoring';

export function HintsPanel() {
  const match = useGameStore(state => state.match);
  const showHints = useGameStore(state => state.showHints);
  const getBestLegal = useGameStore(state => state.getBestLegal);
  const getBestSafe = useGameStore(state => state.getBestSafe);
  const getDumpAll = useGameStore(state => state.getDumpAll);
  
  if (!match || !showHints) return null;
  
  const currentPlayer = match.players[match.turnIdx];
  if (currentPlayer.persona !== 'Human') return null;
  
  const bestLegal = getBestLegal();
  const bestSafe = getBestSafe();
  const dumpAll = getDumpAll();
  
  return (
    <div className="p-4 bg-gray-800 rounded-lg space-y-3">
      <h3 className="text-white font-semibold">Hints</h3>
      
      {bestLegal && (
        <div className="text-sm space-y-1">
          <div className="text-green-400">Best Legal:</div>
          <div className="text-gray-300">
            {bestLegal.cards.length} cards, Raw: {bestLegal.raw}
          </div>
          <div className="text-gray-300">
            Points: {scoreLegal(bestLegal.raw)}
          </div>
        </div>
      )}
      
      {bestSafe && (
        <div className="text-sm space-y-1">
          <div className="text-blue-400">Best Safe (≤26):</div>
          <div className="text-gray-300">
            {bestSafe.cards.length} cards, Raw: {bestSafe.raw}
          </div>
          <div className="text-gray-300">
            Points: {scoreIllegal(bestSafe.raw).points}
          </div>
        </div>
      )}
      
      {dumpAll && (
        <div className="text-sm space-y-1">
          <div className="text-yellow-400">Dump All:</div>
          <div className="text-gray-300">
            {dumpAll.cards.length} cards, Raw: {dumpAll.raw}
          </div>
          <div className="text-gray-300">
            Points: {scoreIllegal(dumpAll.raw).points}
            {dumpAll.raw >= 27 && (
              <span className="text-red-400"> (Spike!)</span>
            )}
          </div>
        </div>
      )}
      
      <div className="text-xs text-gray-400 pt-2 border-t border-gray-700">
        Audit Track: {match.auditTrack}/5
        {match.auditTrack >= 4 && (
          <div className="text-red-400 animate-pulse">⚠ Next spike triggers external!</div>
        )}
      </div>
    </div>
  );
}
