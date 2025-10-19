import { useRef, useEffect } from 'react';
import useGameStore from '../store/gameStore';

export function TurnLog() {
  const turnLog = useGameStore(state => state.turnLog);
  const logEndRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turnLog]);
  
  const getActionColor = (action: string) => {
    if (action.includes('LEGAL')) return 'text-green-400';
    if (action.includes('ILLEGAL')) return 'text-orange-400';
    if (action.includes('AUDIT')) return 'text-red-400';
    if (action.includes('Pass')) return 'text-gray-400';
    return 'text-white';
  };
  
  const getActionIcon = (action: string) => {
    if (action.includes('LEGAL')) return '✓';
    if (action.includes('ILLEGAL')) return '⚠';
    if (action.includes('AUDIT')) return '🔍';
    if (action.includes('Pass')) return '○';
    return '•';
  };
  
  return (
    <div className="bg-gray-900/95 rounded-lg shadow-2xl border border-gray-700" style={{ backdropFilter: 'blur(12px)' }}>
      <div className="bg-gradient-to-r from-purple-800 to-indigo-800 p-3 rounded-t-lg">
        <h3 className="text-white font-bold text-sm">Turn Log</h3>
      </div>
      
      <div className="max-h-96 overflow-y-auto p-3 space-y-1">
        {turnLog.length === 0 ? (
          <div className="text-gray-500 text-sm italic text-center py-4">
            No actions yet...
          </div>
        ) : (
          turnLog.map((entry, idx) => (
            <div 
              key={idx} 
              className={`
                text-xs p-2 rounded-md transition-all
                ${idx === turnLog.length - 1 ? 'bg-purple-900/30 animate-pulse' : 'bg-gray-800/50'}
                hover:bg-gray-700/50
              `}
            >
              <div className="flex items-start gap-2">
                <span className={getActionColor(entry)}>
                  {getActionIcon(entry)}
                </span>
                <div className="flex-1">
                  <div className={getActionColor(entry)}>
                    {entry}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={logEndRef} />
      </div>
      
      <div className="bg-gray-800/50 px-3 py-2 rounded-b-lg border-t border-gray-700">
        <div className="text-xs text-gray-400">
          {turnLog.length} actions • Auto-scrolling
        </div>
      </div>
    </div>
  );
}