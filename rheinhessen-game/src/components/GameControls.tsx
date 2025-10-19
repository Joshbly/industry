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
  const rawVal = selectedCards.length > 0 ? rawValue(selectedCards) : 0;
  const illegalResult = rawVal > 0 ? scoreIllegal(rawVal, match.auditTrack) : null;
  
  return (
    <div className="glass rounded-2xl p-6 space-y-6">
      {/* Turn Indicator */}
      <div className="flex items-center justify-between p-4 bg-black/30 rounded-xl">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${isHumanTurn ? 'bg-green-500' : 'bg-yellow-500'} animate-pulse`} />
          <span className="text-lg font-semibold text-white">
            {isHumanTurn ? 'Your Turn' : `${currentPlayer.name}'s Turn`}
          </span>
        </div>
        {isHumanTurn && (
          <span className="text-sm text-gray-400">
            Phase: Production
          </span>
        )}
      </div>
      
      {isHumanTurn && (
        <>
          {/* Internal Audit Section */}
          <div className="p-4 bg-gradient-to-r from-orange-500/10 to-red-500/10 rounded-xl border border-orange-500/20">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-semibold text-orange-400">Internal Audit</span>
            </div>
            <InternalAudit />
          </div>
          
          {/* Production Actions */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Production Actions</h3>
            
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={playLegal}
                disabled={!canPlayLegal}
                className={`
                  relative px-6 py-4 rounded-xl font-semibold transition-all overflow-hidden
                  ${canPlayLegal 
                    ? 'btn-success text-white shadow-lg hover:shadow-xl transform hover:-translate-y-0.5' 
                    : 'bg-gray-800 text-gray-500 cursor-not-allowed opacity-50'
                  }
                `}
              >
                <div className="relative z-10">
                  <div className="text-xs opacity-75 mb-1">LEGAL</div>
                  <div className="text-sm">Play Hand</div>
                  {canPlayLegal && (
                    <div className="text-xs mt-1 text-green-200">
                      +{scoreLegal(rawVal)} pts
                    </div>
                  )}
                </div>
              </button>
              
              <button
                onClick={playIllegal}
                disabled={!canPlayIllegal}
                className={`
                  relative px-6 py-4 rounded-xl font-semibold transition-all overflow-hidden
                  ${canPlayIllegal 
                    ? 'bg-gradient-to-r from-yellow-600 to-orange-600 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-0.5' 
                    : 'bg-gray-800 text-gray-500 cursor-not-allowed opacity-50'
                  }
                `}
              >
                <div className="relative z-10">
                  <div className="text-xs opacity-75 mb-1">ILLEGAL</div>
                  <div className="text-sm">Dump Cards</div>
                  {canPlayIllegal && illegalResult && (
                    <div className="text-xs mt-1 text-yellow-200">
                      +{illegalResult.points} pts
                      {illegalResult.ticksAdded > 0 && (
                        <span className="text-red-300 ml-1">
                          (+{illegalResult.ticksAdded} audit)
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </button>
              
              <button
                onClick={playSafe}
                className="relative px-6 py-4 rounded-xl font-semibold btn-secondary text-blue-400 border-blue-500/30 hover:bg-blue-500/10 transition-all"
              >
                <div className="relative z-10">
                  <div className="text-xs opacity-75 mb-1">SAFE</div>
                  <div className="text-sm">Auto ≤26</div>
                  <div className="text-xs mt-1 opacity-60">No audit risk</div>
                </div>
              </button>
              
              <button
                onClick={pass}
                className="relative px-6 py-4 rounded-xl font-semibold btn-secondary text-gray-400 hover:text-white transition-all"
              >
                <div className="relative z-10">
                  <div className="text-xs opacity-75 mb-1">SKIP</div>
                  <div className="text-sm">Pass Turn</div>
                  <div className="text-xs mt-1 opacity-60">End phase</div>
                </div>
              </button>
            </div>
          </div>
        </>
      )}
      
      {/* Selection Info */}
      {selectedCards.length > 0 && (
        <div className="p-4 bg-black/30 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-300">Selection Analysis</h4>
            <button
              onClick={clearSelection}
              className="px-3 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-medium transition-colors"
            >
              Clear
            </button>
          </div>
          
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="space-y-1">
              <div className="text-gray-500">Cards Selected</div>
              <div className="text-xl font-bold text-white">{selectedCards.length}</div>
            </div>
            
            <div className="space-y-1">
              <div className="text-gray-500">Raw Value</div>
              <div className="text-xl font-bold text-white">{rawVal}</div>
            </div>
            
            {canPlayLegal && (
              <div className="space-y-1 col-span-2 pt-2 border-t border-gray-700">
                <div className="text-gray-500">Legal Production</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-green-400">
                    +{scoreLegal(rawVal)}
                  </span>
                  <span className="text-xs text-green-400/60">points</span>
                </div>
              </div>
            )}
            
            {!canPlayLegal && canPlayIllegal && illegalResult && (
              <div className="space-y-1 col-span-2 pt-2 border-t border-gray-700">
                <div className="text-gray-500">Illegal Production</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-yellow-400">
                    +{illegalResult.points}
                  </span>
                  <span className="text-xs text-yellow-400/60">points</span>
                </div>
                {illegalResult.ticksAdded > 0 && (
                  <div className="flex items-center gap-2 mt-1">
                    <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span className="text-xs text-red-400">
                      Adds {illegalResult.ticksAdded} audit {illegalResult.ticksAdded === 1 ? 'tick' : 'ticks'}
                    </span>
                  </div>
                )}
                {illegalResult.kickback > 0 && (
                  <div className="text-xs text-orange-400">
                    Includes {illegalResult.kickback} point kickback penalty
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      
      {!isHumanTurn && (
        <div className="flex items-center justify-center p-8">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 border-4 border-yellow-500/30 border-t-yellow-500 rounded-full animate-spin" />
            <span className="text-gray-400">AI Processing...</span>
          </div>
        </div>
      )}
    </div>
  );
}