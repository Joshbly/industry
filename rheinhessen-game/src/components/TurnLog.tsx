import { useEffect, useRef } from 'react';
import useGameStore from '../store/gameStore';

export function TurnLog() {
  const turnLog = useGameStore(state => state.turnLog);
  const logEndRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turnLog]);
  
  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-gradient-to-br from-purple-500/20 to-indigo-500/20 rounded-lg">
          <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-white">Activity Log</h3>
      </div>
      
      <div className="h-64 overflow-y-auto pr-2">
        <div className="space-y-2">
          {turnLog.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} 
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm">No actions yet</p>
              <p className="text-xs mt-1">Game activity will appear here</p>
            </div>
          ) : (
            turnLog.map((entry, idx) => {
              const isExternal = entry.includes('EXTERNAL');
              const isAudit = entry.includes('audited');
              const isWin = entry.includes('wins');
              const isProduction = entry.includes('produced');
              const isPassed = entry.includes('passed');
              
              return (
                <div 
                  key={idx} 
                  className={`
                    relative pl-6 pr-3 py-2 rounded-lg text-sm transition-all
                    ${isExternal ? 'bg-red-500/10 border-l-4 border-red-500 text-red-400 font-semibold' :
                      isWin ? 'bg-green-500/10 border-l-4 border-green-500 text-green-400 font-semibold' :
                      isAudit ? 'bg-orange-500/10 border-l-4 border-orange-500 text-orange-400' :
                      isProduction ? 'bg-blue-500/5 text-gray-300' :
                      isPassed ? 'text-gray-500' :
                      'text-gray-400'
                    }
                    animate-slide
                  `}
                  style={{ animationDelay: `${idx * 0.02}s` }}
                >
                  <div className="absolute left-2 top-1/2 -translate-y-1/2">
                    {isExternal && (
                      <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    )}
                    {isWin && (
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    )}
                    {isAudit && (
                      <div className="w-2 h-2 bg-orange-500 rounded-full" />
                    )}
                    {isProduction && (
                      <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                    )}
                    {!isExternal && !isWin && !isAudit && !isProduction && (
                      <div className="w-1 h-1 bg-gray-600 rounded-full" />
                    )}
                  </div>
                  <span className="break-words">{entry}</span>
                  <span className="text-xs text-gray-600 ml-2">
                    Turn {Math.floor(idx / 4) + 1}
                  </span>
                </div>
              );
            })
          )}
          <div ref={logEndRef} />
        </div>
      </div>
      
    </div>
  );
}