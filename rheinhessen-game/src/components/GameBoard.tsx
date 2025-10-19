import useGameStore from '../store/gameStore';
import { PlayerArea } from './PlayerArea';
import { AuditTrack } from './AuditTrack';
import { HandArea } from './HandArea';
import { GameControlsNew } from './GameControlsNew';

export function GameBoard() {
  const match = useGameStore(state => state.match);
  const selectedCards = useGameStore(state => state.selectedCards);
  const selectCard = useGameStore(state => state.selectCard);
  const deselectCard = useGameStore(state => state.deselectCard);
  const triggerInternal = useGameStore(state => state.triggerInternal);
  
  if (!match) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="text-white text-2xl">Loading game...</div>
      </div>
    );
  }
  
  const handleCardClick = (card: any) => {
    const isSelected = selectedCards.some(c => c.id === card.id);
    if (isSelected) {
      deselectCard(card);
    } else {
      selectCard(card);
    }
  };
  
  const handleAudit = (playerId: number) => {
    if (match.turnIdx === 0) {  // Human's turn
      triggerInternal(playerId);
    }
  };
  
  const humanPlayer = match.players[0];
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="h-screen flex flex-col p-4">
        {/* Top Area - Opponent and Audit Track */}
        <div className="flex-none mb-4">
          <div className="grid grid-cols-3 gap-4">
            <div></div>
            <PlayerArea
              player={match.players[2]}
              isCurrentPlayer={match.turnIdx === 2}
              onAudit={() => handleAudit(2)}
            />
            <div></div>
          </div>
        </div>
        
        {/* Middle Area - Side Opponents, Game Info, and Deck */}
        <div className="flex-1 grid grid-cols-5 gap-4 mb-4">
          {/* Left Opponent */}
          <div className="col-span-1 flex items-center">
            <PlayerArea
              player={match.players[1]}
              isCurrentPlayer={match.turnIdx === 1}
              onAudit={() => handleAudit(1)}
            />
          </div>
          
          {/* Center - Game State */}
          <div className="col-span-3 flex flex-col gap-4">
            {/* Audit Track */}
            <AuditTrack currentLevel={match.auditTrack} />
            
            {/* Center Table Area */}
            <div className="flex-1 bg-gradient-to-br from-green-800 to-green-900 rounded-2xl shadow-2xl p-8 flex flex-col items-center justify-center">
              {/* Deck Display */}
              <div className="bg-black/30 rounded-xl p-6" style={{ backdropFilter: 'blur(8px)' }}>
                <div className="text-white text-center mb-3">
                  <div className="text-4xl font-bold">{match.deck.length}</div>
                  <div className="text-sm opacity-80">Cards Remaining</div>
                </div>
                
                {/* Deck Visual */}
                <div className="relative w-20 h-28 mx-auto">
                  {[0, 1, 2, 3, 4].map(i => (
                    <div
                      key={i}
                      className="absolute bg-gradient-to-br from-blue-900 to-blue-700 rounded-lg border-2 border-gray-800 shadow-lg"
                      style={{
                        width: '80px',
                        height: '112px',
                        top: `${i * 2}px`,
                        left: `${i * 2}px`,
                        zIndex: 5 - i
                      }}
                    />
                  ))}
                </div>
              </div>
              
              {/* Turn Indicator */}
              <div className="mt-6 bg-white/10 rounded-lg px-6 py-3" style={{ backdropFilter: 'blur(8px)' }}>
                <div className="text-yellow-300 font-bold text-lg text-center">
                  {match.turnIdx === 0 ? "Your Turn" : `${match.players[match.turnIdx].name}'s Turn`}
                </div>
              </div>
            </div>
          </div>
          
          {/* Right Opponent */}
          <div className="col-span-1 flex items-center">
            <PlayerArea
              player={match.players[3]}
              isCurrentPlayer={match.turnIdx === 3}
              onAudit={() => handleAudit(3)}
            />
          </div>
        </div>
        
        {/* Bottom Area - Human Player */}
        <div className="flex-none">
          <div className="grid grid-cols-3 gap-4">
            {/* Player Stats */}
            <div className="flex items-end">
              <PlayerArea
                player={humanPlayer}
                isCurrentPlayer={match.turnIdx === 0}
              />
            </div>
            
            {/* Controls */}
            <div className="flex items-end">
              <GameControlsNew />
            </div>
            
            {/* Extra Info */}
            <div className="flex items-end justify-end">
              <div className="bg-gray-800/50 rounded-lg p-4 text-white text-sm" style={{ backdropFilter: 'blur(8px)' }}>
                <div className="mb-2">
                  <span className="text-gray-400">Target:</span>
                  <span className="ml-2 font-bold">300 pts</span>
                </div>
                <div className="mb-2">
                  <span className="text-gray-400">Leader:</span>
                  <span className="ml-2 font-bold text-yellow-400">
                    {Math.max(...match.players.map(p => p.score))} pts
                  </span>
                </div>
                {match.winnerId !== undefined && (
                  <div className="mt-2 text-green-400 font-bold">
                    {match.players[match.winnerId].name} Wins!
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Hand Area - Overlaid at bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-50">
        <HandArea
          cards={humanPlayer.hand}
          selectedCards={selectedCards}
          onCardClick={handleCardClick}
        />
      </div>
    </div>
  );
}
