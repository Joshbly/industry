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
    <div className="glass rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-gradient-to-br from-yellow-500/20 to-amber-500/20 rounded-lg">
          <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-white">Strategic Analysis</h3>
      </div>
      
      <div className="space-y-3">
        {bestLegal && (
          <div className="p-4 bg-gradient-to-r from-green-500/10 to-emerald-500/10 rounded-xl border border-green-500/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-green-400">Best Legal Play</span>
              <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded-full">
                RECOMMENDED
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-gray-500 text-xs">Cards</div>
                <div className="font-bold text-white">{bestLegal.cards.length}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">Raw</div>
                <div className="font-bold text-white">{bestLegal.raw}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">Points</div>
                <div className="font-bold text-green-400">+{scoreLegal(bestLegal.raw)}</div>
              </div>
            </div>
          </div>
        )}
        
        {bestSafe && (
          <div className="p-4 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 rounded-xl border border-blue-500/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-blue-400">Safe Illegal (≤26)</span>
              <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded-full">
                NO RISK
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-gray-500 text-xs">Cards</div>
                <div className="font-bold text-white">{bestSafe.cards.length}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">Raw</div>
                <div className="font-bold text-white">{bestSafe.raw}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">Points</div>
                <div className="font-bold text-blue-400">+{scoreIllegal(bestSafe.raw, match.auditTrack).points}</div>
              </div>
            </div>
          </div>
        )}
        
        {dumpAll && (
          <div className="p-4 bg-gradient-to-r from-yellow-500/10 to-orange-500/10 rounded-xl border border-yellow-500/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-yellow-400">Maximum Dump</span>
              {dumpAll.raw >= 27 && (
                <span className="text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded-full animate-pulse">
                  SPIKE RISK
                </span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-gray-500 text-xs">Cards</div>
                <div className="font-bold text-white">{dumpAll.cards.length}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">Raw</div>
                <div className="font-bold text-white">{dumpAll.raw}</div>
              </div>
              <div>
                <div className="text-gray-500 text-xs">Points</div>
                <div className="font-bold text-yellow-400">
                  +{scoreIllegal(dumpAll.raw, match.auditTrack).points}
                </div>
              </div>
            </div>
            {dumpAll.raw >= 27 && (
              <div className="mt-2 flex items-center gap-2 text-xs text-orange-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>Adds {scoreIllegal(dumpAll.raw, match.auditTrack).ticksAdded} audit ticks</span>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Audit Track Warning */}
      <div className={`p-3 rounded-xl border ${
        match.auditTrack === 4 
          ? 'bg-red-500/10 border-red-500/30' 
          : match.auditTrack >= 3 
          ? 'bg-orange-500/10 border-orange-500/30'
          : 'bg-gray-500/10 border-gray-500/20'
      }`}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-400">AUDIT STATUS</span>
          <span className={`text-lg font-bold ${
            match.auditTrack === 4 ? 'text-red-400' : 
            match.auditTrack >= 3 ? 'text-orange-400' : 
            'text-gray-400'
          }`}>
            {match.auditTrack}/5
          </span>
        </div>
        {match.auditTrack >= 3 && (
          <div className={`mt-2 text-xs ${
            match.auditTrack === 4 ? 'text-red-400' : 'text-orange-400'
          }`}>
            {match.auditTrack === 4 
              ? '⚠ CRITICAL: Next spike triggers external audit!' 
              : '⚠ WARNING: High audit risk level'}
          </div>
        )}
      </div>
    </div>
  );
}