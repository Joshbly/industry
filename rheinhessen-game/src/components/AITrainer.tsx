import { useState, useEffect, useRef } from 'react';
import { LearningAgent } from '../ai/learning';
import type { AgentConfig } from '../ai/learning';

// Store multiple learning agents
const learningAgents = new Map<string, LearningAgent>();

// Default configurations for different agent variants
const AGENT_CONFIGS: AgentConfig[] = [
  {
    name: 'Explorer',
    epsilon: 0.4,       // High exploration
    alpha: 0.15,        // Moderate learning rate
    gamma: 0.92,        // Shorter-term focus
    rewardWeights: {
      pointGain: 0.8,
      winBonus: 80,
      auditReward: 30   // Likes auditing
    }
  },
  {
    name: 'Conservative',
    epsilon: 0.2,       // Low exploration
    alpha: 0.1,         // Steady learning
    gamma: 0.97,        // Long-term planning
    rewardWeights: {
      pointGain: 1.2,
      illegalPenalty: -10,  // Avoids illegal
      auditPenalty: -40      // Avoids triggering externals
    }
  },
  {
    name: 'Balanced',
    epsilon: 0.3,       // Standard exploration
    alpha: 0.12,        // Standard learning
    gamma: 0.95,        // Balanced planning
    rewardWeights: {}   // Default weights
  },
  {
    name: 'Aggressive',
    epsilon: 0.25,      // Moderate exploration
    alpha: 0.18,        // Fast learning
    gamma: 0.90,        // Short-term focus
    rewardWeights: {
      pointGain: 1.5,
      winBonus: 150,
      positionBonus: 30,
      illegalPenalty: -2  // Less worried about illegal
    }
  }
];

export function getLearningAgent(name: string = 'Balanced'): LearningAgent {
  if (!learningAgents.has(name)) {
    const config = AGENT_CONFIGS.find(c => c.name === name) || AGENT_CONFIGS[2];
    learningAgents.set(name, new LearningAgent(config));
  }
  return learningAgents.get(name)!;
}

interface SavedBatch {
  name: string;
  date: string;
  agents: any;
  metadata: {
    totalEpisodes: number;
    avgWinRate: number;
    avgScore: number;
  };
}

export function AITrainer() {
  const [isTraining, setIsTraining] = useState(false);
  const isTrainingRef = useRef(false);
  const [trainingSpeed, setTrainingSpeed] = useState(100); // ms between moves
  const [episodesTarget, setEpisodesTarget] = useState(100);
  const [currentEpisode, setCurrentEpisode] = useState(0);
  const [insights, setInsights] = useState<string[]>([]);
  const [showTrainer, setShowTrainer] = useState(false);
  const [selectedAgents, setSelectedAgents] = useState<string[]>(['Explorer', 'Conservative', 'Balanced', 'Aggressive']);
  const [trainingMode, setTrainingMode] = useState<'self-play' | 'vs-bots'>('self-play');
  const [useLearnerInGames, setUseLearnerInGames] = useState(
    localStorage.getItem('rheinhessen-use-learner') === 'true'
  );
  
  // Batch management
  const [savedBatches, setSavedBatches] = useState<SavedBatch[]>([]);
  const [showBatchManager, setShowBatchManager] = useState(false);
  const [batchName, setBatchName] = useState('');
  const [currentBatchName, setCurrentBatchName] = useState('Current');
  
  // Game table configuration
  const [tableConfig, setTableConfig] = useState<{
    player1: string;
    player2: string; 
    player3: string;
  }>(() => {
    const saved = localStorage.getItem('rheinhessen-table-config');
    return saved ? JSON.parse(saved) : {
      player1: 'Balanced',  // Default learner variant for player 1
      player2: 'Regular',   // Regular AI
      player3: 'Regular'    // Regular AI
    };
  });
  
  // Get all selected agents
  const agents = selectedAgents.map(name => getLearningAgent(name));
  
  // Load saved batches on mount
  useEffect(() => {
    const saved = localStorage.getItem('rheinhessen-ai-batches');
    if (saved) {
      try {
        setSavedBatches(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load saved batches:', e);
      }
    }
  }, []);
  
  useEffect(() => {
    // Aggregate insights from all agents
    const allInsights: string[] = [];
    agents.forEach(agent => {
      allInsights.push(`=== ${agent.name} ===`);
      allInsights.push(...agent.getInsights());
      allInsights.push('');
    });
    setInsights(allInsights);
  }, [currentEpisode, selectedAgents]);
  
  const runTrainingEpisode = async (episodeNumber: number = 0) => {
    // Import all required functions at the top
    const { createMatch, startTurn, applyProduction, applyInternalWithCards, applyInternal, advanceTurn, endCheck } = 
      await import('../engine/match');
    const { bestLegalGreedy, getHandType } = await import('../engine/evaluation');
    const { decideAI } = await import('../ai/personas');
    
    // Create a unique game ID for this episode
    const gameId = `episode-${episodeNumber}-${Date.now()}`;
    
    // Set game ID for all agents to track this game properly
    agents.forEach(agent => agent.setGameId(gameId));
    
    let match = createMatch(Math.random().toString());
    match = startTurn(match);
    
    // Set up players based on training mode
    if (trainingMode === 'self-play') {
      // All 4 players are learning agents with different configs
      selectedAgents.forEach((agentName, idx) => {
        if (idx < 4) {
          match.players[idx].persona = `Learner-${agentName}` as any;
        }
      });
    } else {
      // Mix of learners and regular bots
      match.players[0].persona = `Learner-${selectedAgents[0]}` as any;
      if (selectedAgents.length > 1) {
        match.players[1].persona = `Learner-${selectedAgents[1]}` as any;
      }
      // Keep players 2 and 3 as regular bots
    }
    
    const previousStates: Array<{
      state: typeof match;
      action: any;
      playerId: number;
      agentName?: string;
    }> = [];
    
    // Play out the game
    while (match.winnerId === undefined) {
      const currentPlayer = match.players[match.turnIdx];
      const prevMatch = match;
      
      // Check if current player is a learner
      const isLearner = currentPlayer.persona && 
        typeof currentPlayer.persona === 'string' && 
        currentPlayer.persona.startsWith('Learner-');
      
      if (isLearner) { // Learning agent's turn
        // Extract agent name from persona
        const agentName = (currentPlayer.persona as string).replace('Learner-', '');
        const agent = getLearningAgent(agentName);
        const decision = agent.chooseAction(match, currentPlayer.id);
        
        // Store state-action for learning
        const action = decision.doInternal ? 'audit-highest' :
                      decision.production.type === 'legal' ? 'play-legal' :
                      decision.production.type === 'safe' ? 'play-safe' :
                      decision.production.type === 'illegal' && decision.production.cards?.length === currentPlayer.hand.length ? 'play-dump' :
                      'pass';
        
        previousStates.push({
          state: prevMatch,
          action,
          playerId: currentPlayer.id,
          agentName
        });
        
        // Apply decision
        if (decision.doInternal && decision.targetId !== undefined) {
          // Find a valid audit hand
          const legal = bestLegalGreedy(currentPlayer.hand);
          if (legal) {
            const handType = getHandType(legal.cards);
            const validTypes = ['trips', 'straight', 'flush', 'full-house', 'quads', 'straight-flush'];
            if (validTypes.includes(handType)) {
              const newMatch = applyInternalWithCards(match, currentPlayer.id, decision.targetId, legal.cards);
              if (newMatch) match = newMatch;
            }
          }
        }
        
        if (decision.production.cards) {
          match = applyProduction(
            match, 
            currentPlayer.id, 
            decision.production.cards,
            decision.production.type === 'legal' ? 'legal' : 'illegal'
          );
        }
      } else {
        // Other AIs play normally
        const decision = decideAI(match, currentPlayer.id);
        
        if (decision.doInternal && decision.targetId !== undefined) {
          const newMatch = applyInternal(match, currentPlayer.id, decision.targetId);
          if (newMatch) match = newMatch;
        }
        
        if (decision.production.cards) {
          match = applyProduction(
            match,
            currentPlayer.id,
            decision.production.cards,
            decision.production.type === 'legal' ? 'legal' : 'illegal'
          );
        }
      }
      
      // Check end and advance
      const result = endCheck(match);
      if (result.over) {
        match = { ...match, winnerId: result.winnerId };
        
        // Learn from all stored states
        for (let i = 0; i < previousStates.length; i++) {
          const { state, action, playerId, agentName } = previousStates[i];
          if (agentName) {
            const learner = getLearningAgent(agentName);
            learner.learn(state, action, match, playerId);
          }
        }
      } else {
        match = advanceTurn(match);
        match = startTurn(match);
        
        // Learn from recent state if agent played
        if (previousStates.length > 0) {
          const lastState = previousStates[previousStates.length - 1];
          if (lastState.agentName) {
            const learner = getLearningAgent(lastState.agentName);
            learner.learn(lastState.state, lastState.action, match, lastState.playerId);
          }
        }
      }
      
      // Small delay to prevent browser freezing
      if (Math.random() < 0.1) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    
    // Update exploration rate and episode count for all agents
    agents.forEach(agent => {
      agent.updateExploration(episodeNumber);
    });
  };
  
  const startTraining = async () => {
    try {
      console.log('Starting training with', episodesTarget, 'episodes');
      setIsTraining(true);
      isTrainingRef.current = true;
      setCurrentEpisode(0);
      
      for (let i = 0; i < episodesTarget; i++) {
        if (!isTrainingRef.current) {
          console.log('Training stopped by user');
          break;
        }
        
        console.log('Running episode', i + 1);
        await runTrainingEpisode(i + 1);
        setCurrentEpisode(i + 1);
        
        // Update UI periodically
        if (i % 10 === 0) {
          const allInsights: string[] = [];
          agents.forEach(agent => {
            allInsights.push(`=== ${agent.name} ===`);
            allInsights.push(...agent.getInsights());
            allInsights.push('');
          });
          setInsights(allInsights);
          await new Promise(resolve => setTimeout(resolve, trainingSpeed));
        }
      }
      
      console.log('Training complete!');
      setIsTraining(false);
      isTrainingRef.current = false;
      const finalInsights: string[] = [];
      agents.forEach(agent => {
        finalInsights.push(`=== ${agent.name} ===`);
        finalInsights.push(...agent.getInsights());
        finalInsights.push('');
      });
      setInsights(finalInsights);
    } catch (error) {
      console.error('Training error:', error);
      alert('Training failed: ' + (error as any).message);
      setIsTraining(false);
      isTrainingRef.current = false;
    }
  };
  
  const stopTraining = () => {
    console.log('Stopping training...');
    setIsTraining(false);
    isTrainingRef.current = false;
  };
  
  const resetAgent = () => {
    if (confirm('Reset all agents in current batch? This will lose all training progress!')) {
      agents.forEach(agent => agent.reset());
      const allInsights: string[] = [];
      agents.forEach(agent => {
        allInsights.push(`=== ${agent.name} ===`);
        allInsights.push(...agent.getInsights());
        allInsights.push('');
      });
      setInsights(allInsights);
      setCurrentEpisode(0);
      setCurrentBatchName('Reset Batch');
    }
  };
  
  const toggleUseLearner = () => {
    const newValue = !useLearnerInGames;
    setUseLearnerInGames(newValue);
    localStorage.setItem('rheinhessen-use-learner', newValue.toString());
  };
  
  const updateTableConfig = (player: 'player1' | 'player2' | 'player3', value: string) => {
    const newConfig = { ...tableConfig, [player]: value };
    setTableConfig(newConfig);
    localStorage.setItem('rheinhessen-table-config', JSON.stringify(newConfig));
  };
  
  // Batch management functions
  const saveBatch = (name: string) => {
    const data: any = {};
    let totalEpisodes = 0;
    let totalWinRate = 0;
    let totalScore = 0;
    let agentCount = 0;
    
    agents.forEach(agent => {
      data[agent.name] = agent.exportKnowledge();
      totalEpisodes += agent.stats.episodesCompleted;
      totalWinRate += agent.stats.winRate;
      totalScore += agent.stats.avgScore;
      agentCount++;
    });
    
    const batch: SavedBatch = {
      name,
      date: new Date().toISOString(),
      agents: data,
      metadata: {
        totalEpisodes: Math.round(totalEpisodes / agentCount),
        avgWinRate: totalWinRate / agentCount,
        avgScore: totalScore / agentCount
      }
    };
    
    const newBatches = [...savedBatches, batch];
    setSavedBatches(newBatches);
    localStorage.setItem('rheinhessen-ai-batches', JSON.stringify(newBatches));
    setCurrentBatchName(name);
    setBatchName('');
  };
  
  const loadBatch = (batch: SavedBatch) => {
    // Clear existing agents
    learningAgents.clear();
    
    // Load the saved agents
    Object.keys(batch.agents).forEach(agentName => {
      const agent = getLearningAgent(agentName);
      agent.importKnowledge(batch.agents[agentName]);
    });
    
    // Update insights
    const allInsights: string[] = [];
    agents.forEach(agent => {
      allInsights.push(`=== ${agent.name} ===`);
      allInsights.push(...agent.getInsights());
      allInsights.push('');
    });
    setInsights(allInsights);
    setCurrentBatchName(batch.name);
    setShowBatchManager(false);
  };
  
  const deleteBatch = (index: number) => {
    const newBatches = savedBatches.filter((_, i) => i !== index);
    setSavedBatches(newBatches);
    localStorage.setItem('rheinhessen-ai-batches', JSON.stringify(newBatches));
  };
  
  const startFreshBatch = () => {
    // Clear all agents
    learningAgents.clear();
    
    // Create fresh agents
    agents.forEach(agent => {
      agent.reset();
    });
    
    // Update insights
    const allInsights: string[] = [];
    agents.forEach(agent => {
      allInsights.push(`=== ${agent.name} ===`);
      allInsights.push(...agent.getInsights());
      allInsights.push('');
    });
    setInsights(allInsights);
    setCurrentBatchName('Fresh Batch');
    setCurrentEpisode(0);
  };
  
  return (
    <>
      <button
        onClick={() => {
          console.log('AI Trainer button clicked, showTrainer:', showTrainer);
          alert('Button clicked! Opening trainer...');
          setShowTrainer(true);
        }}
        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded font-medium transition-colors"
      >
        🤖 AI Trainer
      </button>
      
      {showTrainer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 p-6 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-2xl font-bold text-white">Self-Learning AI Trainer</h2>
                <p className="text-sm text-gray-400">Current Batch: {currentBatchName}</p>
              </div>
              <button
                onClick={() => setShowTrainer(false)}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Batch Management */}
              <div className="bg-gray-900 rounded p-4">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-white font-semibold">Batch Management</h3>
                  <span className="text-xs text-gray-400">
                    {savedBatches.length} saved • {agents.reduce((sum, a) => sum + a.stats.episodesCompleted, 0)} episodes trained
                  </span>
                </div>
                
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => setShowBatchManager(!showBatchManager)}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
                  >
                    📁 Manage Batches ({savedBatches.length})
                  </button>
                  <button
                    onClick={startFreshBatch}
                    className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded transition-colors"
                  >
                    🆕 Start Fresh
                  </button>
                </div>
                
                {!showBatchManager && savedBatches.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    <span className="text-xs text-gray-400 mr-2">Quick Load:</span>
                    {savedBatches.slice(-3).map((batch, index) => (
                      <button
                        key={index}
                        onClick={() => loadBatch(batch)}
                        className="px-2 py-0.5 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded"
                        title={`Episodes: ${batch.metadata.totalEpisodes} • Win: ${Math.round(batch.metadata.avgWinRate * 100)}%`}
                      >
                        {batch.name}
                      </button>
                    ))}
                  </div>
                )}
                
                {showBatchManager && (
                  <div className="bg-gray-800 rounded p-3 space-y-2">
                    <div className="flex gap-2 mb-3">
                      <input
                        type="text"
                        placeholder="Batch name..."
                        value={batchName}
                        onChange={(e) => setBatchName(e.target.value)}
                        className="flex-1 px-2 py-1 bg-gray-700 text-white rounded text-sm"
                      />
                      <button
                        onClick={() => batchName && saveBatch(batchName)}
                        disabled={!batchName}
                        className="px-3 py-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white text-sm rounded transition-colors"
                      >
                        💾 Save Current
                      </button>
                    </div>
                    
                    {savedBatches.length > 0 ? (
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {savedBatches.map((batch, index) => (
                          <div key={index} className="flex items-center justify-between bg-gray-700 rounded p-2">
                            <div className="flex-1">
                              <div className="text-white text-sm font-medium">{batch.name}</div>
                              <div className="text-xs text-gray-400">
                                {new Date(batch.date).toLocaleDateString()} • 
                                Episodes: {batch.metadata.totalEpisodes} • 
                                Win: {Math.round(batch.metadata.avgWinRate * 100)}% • 
                                Score: {Math.round(batch.metadata.avgScore)}
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <button
                                onClick={() => loadBatch(batch)}
                                className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded"
                              >
                                Load
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm(`Delete batch "${batch.name}"?`)) {
                                    deleteBatch(index);
                                  }
                                }}
                                className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-400 text-sm text-center py-2">No saved batches</p>
                    )}
                  </div>
                )}
              </div>
              
              {/* Play Settings */}
              <div className="bg-gray-900 rounded p-4">
                <h3 className="text-white font-semibold mb-3">Game Table Configuration</h3>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-gray-300">
                    Use Learner Bots in games
                  </span>
                  <button
                    onClick={toggleUseLearner}
                    className={`px-3 py-1 rounded transition-colors ${
                      useLearnerInGames
                        ? 'bg-green-600 hover:bg-green-700 text-white'
                        : 'bg-gray-600 hover:bg-gray-700 text-white'
                    }`}
                  >
                    {useLearnerInGames ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>
                
                {useLearnerInGames && (
                  <>
                    <div className="flex gap-2 mb-3">
                      <button
                        onClick={() => {
                          updateTableConfig('player1', 'Balanced');
                          updateTableConfig('player2', 'Regular');
                          updateTableConfig('player3', 'Regular');
                        }}
                        className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded"
                      >
                        1 Learner
                      </button>
                      <button
                        onClick={() => {
                          updateTableConfig('player1', 'Explorer');
                          updateTableConfig('player2', 'Conservative');
                          updateTableConfig('player3', 'Aggressive');
                        }}
                        className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded"
                      >
                        All Learners
                      </button>
                      <button
                        onClick={() => {
                          updateTableConfig('player1', 'Balanced');
                          updateTableConfig('player2', 'Balanced');
                          updateTableConfig('player3', 'Regular');
                        }}
                        className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded"
                      >
                        2 Balanced
                      </button>
                    </div>
                    
                    <div className="space-y-3 mb-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-400">Opponent 1:</span>
                        <select
                          value={tableConfig.player1}
                          onChange={(e) => updateTableConfig('player1', e.target.value)}
                          className="bg-gray-700 text-white px-2 py-1 rounded text-sm"
                        >
                          <option value="Regular">Regular AI</option>
                          <option value="Explorer">Learner: Explorer</option>
                          <option value="Conservative">Learner: Conservative</option>
                          <option value="Balanced">Learner: Balanced</option>
                          <option value="Aggressive">Learner: Aggressive</option>
                        </select>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-400">Opponent 2:</span>
                        <select
                          value={tableConfig.player2}
                          onChange={(e) => updateTableConfig('player2', e.target.value)}
                          className="bg-gray-700 text-white px-2 py-1 rounded text-sm"
                        >
                          <option value="Regular">Regular AI</option>
                          <option value="Explorer">Learner: Explorer</option>
                          <option value="Conservative">Learner: Conservative</option>
                          <option value="Balanced">Learner: Balanced</option>
                          <option value="Aggressive">Learner: Aggressive</option>
                        </select>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-400">Opponent 3:</span>
                        <select
                          value={tableConfig.player3}
                          onChange={(e) => updateTableConfig('player3', e.target.value)}
                          className="bg-gray-700 text-white px-2 py-1 rounded text-sm"
                        >
                          <option value="Regular">Regular AI</option>
                          <option value="Explorer">Learner: Explorer</option>
                          <option value="Conservative">Learner: Conservative</option>
                          <option value="Balanced">Learner: Balanced</option>
                          <option value="Aggressive">Learner: Aggressive</option>
                        </select>
                      </div>
                    </div>
                    <p className="text-xs text-yellow-400">
                      Start a new game to play with your configured table!
                    </p>
                  </>
                )}
              </div>
              
              {/* Agent Selection */}
              <div className="bg-gray-900 rounded p-4">
                <h3 className="text-white font-semibold mb-3">Training Configuration</h3>
                
                <div className="mb-4">
                  <label className="text-sm text-gray-300 block mb-2">Training Mode</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setTrainingMode('self-play')}
                      className={`px-3 py-1 rounded transition-colors ${
                        trainingMode === 'self-play'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      Self-Play (All Learners)
                    </button>
                    <button
                      onClick={() => setTrainingMode('vs-bots')}
                      className={`px-3 py-1 rounded transition-colors ${
                        trainingMode === 'vs-bots'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      Vs Regular Bots
                    </button>
                  </div>
                </div>
                
                <div>
                  <label className="text-sm text-gray-300 block mb-2">Active Learner Agents</label>
                  <div className="grid grid-cols-2 gap-2">
                    {AGENT_CONFIGS.map(config => (
                      <label key={config.name} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={selectedAgents.includes(config.name!)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedAgents([...selectedAgents, config.name!]);
                            } else {
                              setSelectedAgents(selectedAgents.filter(n => n !== config.name));
                            }
                          }}
                          className="w-4 h-4 text-blue-600"
                        />
                        <span className="text-sm text-gray-300">{config.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
                
                {trainingMode === 'self-play' && selectedAgents.length < 4 && (
                  <p className="text-xs text-yellow-400 mt-2">
                    Note: In self-play mode with &lt; 4 agents, some will play multiple seats
                  </p>
                )}
              </div>
              
              {/* Training Controls */}
              <div className="bg-gray-900 rounded p-4">
                <h3 className="text-white font-semibold mb-3">Training Controls</h3>
                
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="text-sm text-gray-300">Episodes to Train</label>
                    <input
                      type="number"
                      value={episodesTarget}
                      onChange={(e) => setEpisodesTarget(Math.max(1, parseInt(e.target.value) || 1))}
                      disabled={isTraining}
                      className="w-full mt-1 px-3 py-1 bg-gray-700 text-white rounded"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-300">Training Speed (ms)</label>
                    <input
                      type="range"
                      min="0"
                      max="1000"
                      value={trainingSpeed}
                      onChange={(e) => setTrainingSpeed(parseInt(e.target.value))}
                      className="w-full mt-3"
                    />
                    <span className="text-xs text-gray-400">{trainingSpeed}ms delay</span>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  {!isTraining ? (
                    <button
                      onClick={startTraining}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                    >
                      Start Training
                    </button>
                  ) : (
                    <button
                      onClick={stopTraining}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                    >
                      Stop Training
                    </button>
                  )}
                  
                  <button
                    onClick={resetAgent}
                    disabled={isTraining}
                    className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded transition-colors disabled:opacity-50"
                  >
                    Reset Batch
                  </button>
                  
                  <button
                    onClick={() => {
                      const data: any = {
                        batchName: currentBatchName,
                        exportDate: new Date().toISOString(),
                        agents: {}
                      };
                      agents.forEach(agent => {
                        data.agents[agent.name] = agent.exportKnowledge();
                      });
                      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `rheinhessen-batch-${currentBatchName.replace(/\s+/g, '-').toLowerCase()}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    disabled={isTraining}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50"
                  >
                    Export Batch
                  </button>
                  
                  <button
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = '.json';
                      input.onchange = (e: any) => {
                        const file = e.target.files[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            try {
                              const data = JSON.parse(event.target?.result as string);
                              
                              // Handle both old and new format
                              const agentsData = data.agents || data;
                              const batchName = data.batchName || 'Imported';
                              
                              Object.keys(agentsData).forEach(agentName => {
                                if (typeof agentsData[agentName] === 'object') {
                                  const agent = getLearningAgent(agentName);
                                  agent.importKnowledge(agentsData[agentName]);
                                }
                              });
                              
                              // Update insights
                              const allInsights: string[] = [];
                              agents.forEach(agent => {
                                allInsights.push(`=== ${agent.name} ===`);
                                allInsights.push(...agent.getInsights());
                                allInsights.push('');
                              });
                              setInsights(allInsights);
                              setCurrentBatchName(batchName);
                              alert(`Batch "${batchName}" imported successfully!`);
                            } catch (error) {
                              alert('Failed to import batch: ' + error);
                            }
                          };
                          reader.readAsText(file);
                        }
                      };
                      input.click();
                    }}
                    disabled={isTraining}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors disabled:opacity-50"
                  >
                    Import Batch
                  </button>
                </div>
                
                {isTraining && (
                  <div className="mt-4">
                    <div className="text-sm text-gray-300">
                      Episode {currentEpisode} / {episodesTarget}
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2 mt-1">
                      <div 
                        className="bg-purple-600 h-2 rounded-full transition-all"
                        style={{ width: `${(currentEpisode / episodesTarget) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
              
              {/* Statistics */}
              <div className="bg-gray-900 rounded p-4">
                <h3 className="text-white font-semibold mb-3">Learning Statistics</h3>
                <div className="text-xs text-gray-400 mb-2">Episode {currentEpisode} of {episodesTarget}</div>
                {agents.map(agent => (
                  <div key={agent.name} className="mb-3">
                    <h4 className="text-purple-400 font-medium mb-2">{agent.name}</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-gray-400">Participated:</span>
                        <span className="text-white ml-2">{agent.stats.gamesPlayed}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Wins:</span>
                        <span className="text-white ml-2">{agent.stats.gamesWon}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Win Rate:</span>
                        <span className="text-white ml-2">
                          {agent.stats.gamesPlayed > 0 
                            ? `${Math.round(agent.stats.winRate * 100)}%`
                            : 'N/A'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400">Avg Score:</span>
                        <span className="text-white ml-2">
                          {agent.stats.gamesPlayed > 0 
                            ? Math.round(agent.stats.avgScore)
                            : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Insights */}
              <div className="bg-gray-900 rounded p-4">
                <h3 className="text-white font-semibold mb-3">AI Insights</h3>
                {insights.length > 0 ? (
                  <ul className="space-y-1">
                    {insights.map((insight, idx) => (
                      <li key={idx} className="text-sm text-gray-300">
                        • {insight}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-400">No insights yet - start training!</p>
                )}
              </div>
              
              {/* Reward Configuration */}
              <div className="bg-gray-900 rounded p-4">
                <h3 className="text-white font-semibold mb-3">🔥 SAVAGE WILDMAN MODE 🔥</h3>
                <div className="text-sm text-gray-300 space-y-1">
                  <div>💰 <span className="text-green-400 font-bold">+1 per point</span> - POINTS = POWER!</div>
                  <div>🏆 <span className="text-yellow-400 font-bold">+300 for wins</span> - WIN AT ALL COSTS!</div>
                  <div>🔥 <span className="text-red-500 font-bold">+60 AUDIT SUCCESS</span> - AUDITS ARE MONEY!</div>
                  <div>🎯 <span className="text-red-400 font-bold">+80 AUDIT LEADER</span> - Cut them down!</div>
                  <div>💣 <span className="text-orange-500 font-bold">+15 HOLDING TRIPS</span> - Save audit ammo!</div>
                  <div>💎 <span className="text-purple-400 font-bold">+25 MEGA HANDS</span> - Full house/Quads!</div>
                  <div>⚔️ <span className="text-orange-400">+15 aggressive play</span> - Big illegal scores!</div>
                  <div>🎲 <span className="text-blue-400">+8 strategic pass</span> - Build monsters!</div>
                  <div>🔨 <span className="text-cyan-400">+12 hand building</span> - Pass then SMASH!</div>
                  <div>⚠️ <span className="text-red-400">-50 external</span> - Only real penalty</div>
                </div>
              </div>
              
              {/* Instructions */}
              <div className="text-xs text-gray-400 border-t border-gray-700 pt-3">
                <p className="text-orange-400 font-bold mb-1">🔥 SAVAGE WILDMAN PHILOSOPHY:</p>
                <p>• AUDIT AGGRESSIVELY - Hold cheap trips, strike often!</p>
                <p>• Score relentlessly - Every point is +1 reward!</p>
                <p>• Build MEGA hands - Pass with trash, build monsters!</p>
                <p>• Take risks - No punishment for losing!</p>
                <p>• Hunt the leader - Massive bonus for audit attacks!</p>
                <p className="mt-2 text-yellow-400">
                  💪 Long-term thinking (γ=0.97) + Fast learning (α=0.15) = UNSTOPPABLE
                </p>
                <p className="mt-1 text-red-400">
                  ⚡ After training, unleash the beast against human players!
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
