import { useEffect, useState } from 'react';
import useGameStore from './store/gameStore';
import { GameTable } from './components/GameTable';
import { GameControls } from './components/GameControls';
import { HintsPanel } from './components/HintsPanel';
import { TurnLog } from './components/TurnLog';
import { FactoryFloor } from './components/FactoryFloor';
import { AITrainer } from './components/AITrainer';

function App() {
  const match = useGameStore(state => state.match);
  const newMatch = useGameStore(state => state.newMatch);
  const processAITurn = useGameStore(state => state.processAITurn);
  const aiDelay = useGameStore(state => state.aiDelay);
  const setAIDelay = useGameStore(state => state.setAIDelay);
  const toggleHints = useGameStore(state => state.toggleHints);
  const showHints = useGameStore(state => state.showHints);
  const [activeTab, setActiveTab] = useState<'controls' | 'floor' | 'log'>('controls');
  
  useEffect(() => {
    if (!match) {
      newMatch();
    }
  }, [match, newMatch]);
  
  useEffect(() => {
    if (match && !match.winnerId && match.players[match.turnIdx].persona !== 'Human') {
      const timer = setTimeout(() => processAITurn(), aiDelay);
      return () => clearTimeout(timer);
    }
  }, [match, processAITurn, aiDelay]);
  
  const handleNewGame = () => {
    const seed = Math.random().toString(36).substring(7);
    newMatch(seed);
  };
  
  if (!match) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass rounded-2xl p-12 animate-fade">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 border-4 border-t-transparent border-yellow-500 rounded-full animate-spin"></div>
            <div className="text-2xl font-light text-gray-300">Initializing Industrial Complex...</div>
          </div>
        </div>
      </div>
    );
  }
  
  const winner = match.winnerId !== undefined ? match.players[match.winnerId] : null;
  
  return (
    <div className="min-h-screen p-4 lg:p-6 relative z-10">
      <div className="max-w-[1920px] mx-auto">
        {/* Professional Header */}
        <header className="mb-6 glass rounded-2xl p-6 animate-fade">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div>
              <h1 className="text-4xl font-bold mb-2">
                <span className="text-gradient">RHEINHESSEN</span>
                <span className="text-gray-300 ml-3">INDUSTRIEWERK</span>
              </h1>
              <p className="text-gray-400 text-sm">Strategic Industrial Card Game • First to 300 Points</p>
            </div>
            
            <div className="flex items-center gap-3">
              <AITrainer />
              
              <button
                onClick={handleNewGame}
                className="btn btn-primary px-6 py-3 rounded-xl font-semibold"
              >
                New Game
              </button>
              
              <button
                onClick={toggleHints}
                className={`btn px-6 py-3 rounded-xl font-semibold ${
                  showHints ? 'btn-success text-white' : 'btn-secondary'
                }`}
              >
                <span className="flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  Hints {showHints ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>
          </div>
        </header>
        
        {/* Game Statistics Bar */}
        <div className="mb-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {match.players.map((player, idx) => (
            <div 
              key={player.id}
              className={`glass rounded-xl p-4 animate-slide ${
                idx === match.turnIdx ? 'border-yellow-500/50 border-2 pulse-gold' : ''
              }`}
              style={{ animationDelay: `${idx * 0.1}s` }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-sm ${player.persona === 'Human' ? 'text-yellow-400' : 'text-gray-400'}`}>
                  {player.name}
                </span>
                {idx === match.turnIdx && (
                  <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded-full">
                    ACTIVE
                  </span>
                )}
              </div>
              <div className="text-3xl font-bold text-white mb-1">{player.score}</div>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>Hand: {player.hand.length}</span>
                <span>Floor: {player.floor.length}</span>
              </div>
            </div>
          ))}
        </div>
        
        {/* Winner Modal */}
        {winner && (
          <div className="fixed inset-0 modal-overlay flex items-center justify-center z-50 animate-fade">
            <div className="glass rounded-3xl p-12 text-center max-w-lg mx-4">
              <div className="mb-6">
                <svg className="w-24 h-24 mx-auto text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm2.86-2h8.28l.5-3-2.14-1.5L12 14l-2.5-4.5L7.36 11l.5 3zM5 20h14v2H5v-2z"/>
                </svg>
              </div>
              <h2 className="text-4xl font-bold text-white mb-3">Victory Achieved!</h2>
              <p className="text-2xl text-gradient font-semibold mb-2">{winner.name} Dominates</p>
              <p className="text-xl text-gray-300 mb-8">Final Score: {winner.score} Points</p>
              
              <div className="grid grid-cols-2 gap-4 mb-8 text-sm">
                <div className="bg-black/30 rounded-lg p-3">
                  <div className="text-gray-400">Legal Productions</div>
                  <div className="text-xl font-bold text-green-400">{winner.stats.legal}</div>
                </div>
                <div className="bg-black/30 rounded-lg p-3">
                  <div className="text-gray-400">Illegal Productions</div>
                  <div className="text-xl font-bold text-yellow-400">{winner.stats.illegal}</div>
                </div>
              </div>
              
              <button
                onClick={handleNewGame}
                className="btn btn-primary px-8 py-4 rounded-xl font-semibold text-lg w-full"
              >
                Start New Game
              </button>
            </div>
          </div>
        )}
        
        {/* Main Game Layout */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Game Table Section */}
          <div className="xl:col-span-2">
            <div className="glass rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-white">Game Table</h2>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-400">Deck:</span>
                  <span className="text-lg font-bold text-white">{match.deck.length}</span>
                  <span className="text-gray-500">/</span>
                  <span className="text-sm text-gray-500">208</span>
                </div>
              </div>
              
              {/* Audit Track Display */}
              <div className="mb-4 p-4 bg-black/30 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-gray-300">Audit Track</span>
                  {match.auditTrack >= 3 && (
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      match.auditTrack === 4 
                        ? 'bg-red-500/20 text-red-400 animate-pulse' 
                        : 'bg-orange-500/20 text-orange-400'
                    }`}>
                      {match.auditTrack === 4 ? 'CRITICAL - NEXT SPIKE = EXTERNAL' : 'HIGH RISK'}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  {[0, 1, 2, 3, 4].map(tick => (
                    <div
                      key={tick}
                      className={`flex-1 h-8 rounded-lg border-2 flex items-center justify-center font-bold transition-all ${
                        tick < match.auditTrack
                          ? 'audit-tick filled text-white'
                          : 'border-gray-600 bg-black/20 text-gray-600'
                      }`}
                    >
                      {tick + 1}
                    </div>
                  ))}
                </div>
              </div>
              
              <GameTable />
            </div>
          </div>
          
          {/* Control Panel */}
          <div className="space-y-6">
            {/* Tab Navigation */}
            <div className="glass rounded-2xl p-2">
              <div className="grid grid-cols-3 gap-1">
                {(['controls', 'floor', 'log'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-3 rounded-xl font-medium transition-all ${
                      activeTab === tab
                        ? 'tab-active text-black'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {tab === 'controls' ? 'Controls' : tab === 'floor' ? 'Factory' : 'Log'}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Tab Content */}
            <div className="animate-fade">
              {activeTab === 'controls' && (
                <div className="space-y-6">
                  <GameControls />
                  {showHints && <HintsPanel />}
                </div>
              )}
              
              {activeTab === 'floor' && <FactoryFloor />}
              {activeTab === 'log' && <TurnLog />}
            </div>
            
            {/* Settings Panel */}
            <div className="glass rounded-2xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Settings</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-gray-400 block mb-2">
                    AI Speed: <span className="text-white font-medium">{aiDelay}ms</span>
                  </label>
                  <input
                    type="range"
                    min="200"
                    max="2000"
                    step="200"
                    value={aiDelay}
                    onChange={(e) => setAIDelay(Number(e.target.value))}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
                    style={{
                      background: `linear-gradient(to right, #d4af37 0%, #d4af37 ${
                        ((aiDelay - 200) / 1800) * 100
                      }%, #374151 ${((aiDelay - 200) / 1800) * 100}%, #374151 100%)`
                    }}
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Fast</span>
                    <span>Slow</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;