
interface AuditTrackProps {
  currentLevel: number;
  maxLevel?: number;
}

export function AuditTrack({ currentLevel, maxLevel = 5 }: AuditTrackProps) {
  const getBoxColor = (index: number) => {
    if (index >= currentLevel) return 'bg-gray-300';
    if (currentLevel >= 4) return 'bg-red-600';
    if (currentLevel >= 3) return 'bg-orange-500';
    return 'bg-yellow-500';
  };
  
  const getWarningMessage = () => {
    if (currentLevel === 4) return 'DANGER: Next spike triggers EXTERNAL AUDIT!';
    if (currentLevel === 3) return 'HIGH RISK: Violations now add +2 ticks';
    if (currentLevel >= 5) return 'EXTERNAL AUDIT IN PROGRESS';
    return '';
  };
  
  return (
    <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-xl p-4 shadow-xl">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-white font-bold text-lg">Regulatory Audit Track</h2>
        {currentLevel > 0 && (
          <div className="text-yellow-400 text-sm font-semibold">
            Level {currentLevel}/5
          </div>
        )}
      </div>
      
      {/* Track Boxes */}
      <div className="flex gap-2 mb-3">
        {Array.from({ length: maxLevel }, (_, i) => (
          <div key={i} className="flex-1">
            <div className="text-xs text-gray-400 text-center mb-1">{i + 1}</div>
            <div className={`
              h-12 rounded-lg border-2 border-gray-600
              ${getBoxColor(i)}
              transition-all duration-300
              ${i < currentLevel ? 'shadow-lg animate-pulse' : ''}
              flex items-center justify-center
            `}>
              {i < currentLevel && (
                <span className="text-white font-bold text-lg">!</span>
              )}
            </div>
          </div>
        ))}
      </div>
      
      {/* Warning Message */}
      {getWarningMessage() && (
        <div className={`
          rounded-lg p-2 text-center font-semibold text-sm
          ${currentLevel === 4 ? 'bg-red-600 text-white animate-pulse' : 
            currentLevel === 3 ? 'bg-orange-500 text-white' :
            currentLevel >= 5 ? 'bg-purple-600 text-white' : ''}
        `}>
          ⚠️ {getWarningMessage()}
        </div>
      )}
      
      {/* Track Description */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div className="text-gray-400">
          <span className="text-green-400">●</span> 0-2: Safe Zone
        </div>
        <div className="text-gray-400">
          <span className="text-orange-400">●</span> 3: Escalation (+2)
        </div>
        <div className="text-gray-400">
          <span className="text-red-400">●</span> 5: External Audit
        </div>
      </div>
    </div>
  );
}
