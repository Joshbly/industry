import { Card } from './Card';
import type { PlayerState } from '../engine/types';

interface PlayerAreaProps {
  player: PlayerState;
  isCurrentPlayer: boolean;
  onAudit?: () => void;
}

export function PlayerArea({ player, isCurrentPlayer, onAudit }: PlayerAreaProps) {
  const totalCrime = player.floor.reduce((sum, card) => {
    const value = card.r <= 10 ? card.r : card.r === 14 ? 11 : 10;
    return sum + value;
  }, 0);
  
  
  return (
    <div 
      className={`
        ${isCurrentPlayer ? 'ring-2 ring-yellow-500 bg-yellow-50/50' : 'bg-gray-100/50'}
        rounded-xl p-4 border border-gray-300
        transition-all duration-300
      `}
      style={{ backdropFilter: 'blur(4px)' }}
    >
      {/* Player Header */}
      <div className="flex justify-between items-center mb-3">
        <div>
          <h3 className="font-bold text-lg text-gray-800">{player.name}</h3>
          <div className="text-sm text-gray-600">{player.persona}</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-blue-600">{player.score}</div>
          <div className="text-xs text-gray-500">Points</div>
        </div>
      </div>
      
      {/* Stats Bar */}
      <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
        <div className="bg-white rounded px-2 py-1">
          <span className="text-gray-500">Hand:</span>
          <span className="ml-1 font-semibold">{player.hand.length}</span>
        </div>
        <div className="bg-white rounded px-2 py-1">
          <span className="text-gray-500">Legal:</span>
          <span className="ml-1 font-semibold text-green-600">{player.stats.legal}</span>
        </div>
        <div className="bg-white rounded px-2 py-1">
          <span className="text-gray-500">Illegal:</span>
          <span className="ml-1 font-semibold text-red-600">{player.stats.illegal}</span>
        </div>
      </div>
      
      {/* Factory Floor */}
      <div className="bg-gradient-to-br from-gray-800 to-gray-700 rounded-lg p-3 min-h-[100px]">
        <div className="flex justify-between items-start mb-2">
          <div className="text-white text-xs font-semibold">Factory Floor</div>
          {totalCrime > 0 && (
            <div className={`
              px-2 py-1 rounded text-xs font-bold
              ${totalCrime >= 40 ? 'bg-red-600 text-white' : 
                totalCrime >= 25 ? 'bg-orange-500 text-white' : 
                'bg-yellow-400 text-gray-800'}
            `}>
              Crime: {totalCrime}
            </div>
          )}
        </div>
        
        {/* Production Groups */}
        <div className="flex flex-wrap gap-2">
          {player.floorGroups.map((group, groupIdx) => (
            <div key={groupIdx} className="bg-black/30 rounded p-1 flex gap-1">
              {group.map((card) => (
                <Card 
                  key={card.id} 
                  card={card} 
                  size="small" 
                  faceUp={true}
                />
              ))}
            </div>
          ))}
        </div>
        
        {/* Audit Status */}
        {player.stats.internalsRecv > 0 && (
          <div className="mt-2 text-orange-400 text-xs">
            Audited {player.stats.internalsRecv}x this game
          </div>
        )}
      </div>
      
      {/* Audit Button for opponents */}
      {player.persona !== 'Human' && onAudit && (
        <button
          onClick={onAudit}
          className="mt-2 w-full py-1 px-3 bg-orange-500 hover:bg-orange-600 text-white rounded-md text-sm font-semibold transition-colors"
        >
          Internal Audit
        </button>
      )}
    </div>
  );
}
