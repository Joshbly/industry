import { useState, useEffect, useRef } from 'react';
import { LearningAgent } from '../ai/learning';
import type { AgentConfig } from '../ai/learning';

// Store multiple learning agents
const learningAgents = new Map<string, LearningAgent>();

// Default configurations for different agent variants
const AGENT_CONFIGS: AgentConfig[] = [
  // PURE WARZONE AGENTS - Only winning/losing matters, zero guidance
  {
    name: 'PureWarzone-1',
    epsilon: 1.0,       // Start 100% random - pure discovery
    // alpha: 0.1 (slower learning), gamma: 0.98 (strong future focus)
    // ALL rewards are 0 except +1000 win / -1000 lose
  },
  {
    name: 'PureWarzone-2',
    epsilon: 1.0,       // Start 100% random
  },
  {
    name: 'PureWarzone-3',
    epsilon: 1.0,       // Start 100% random
  },
  {
    name: 'PureWarzone-4',
    epsilon: 1.0,       // Start 100% random
  },
  
  // WARZONE AGENTS - Pure competition, only winning matters (with some guidance)
  {
    name: 'Warzone-1',
    epsilon: 0.95,      // Start nearly pure random (95%)
    // alpha dynamically managed: starts at 0.25, decays based on performance
    gamma: 0.95         // Balanced horizon
    // No reward weights - uses pure warzone system
  },
  {
    name: 'Warzone-2',
    epsilon: 0.95,      // Start nearly pure random
    // alpha dynamically managed
    gamma: 0.95
  },
  {
    name: 'Warzone-3',
    epsilon: 0.95,      // Start nearly pure random
    // alpha dynamically managed
    gamma: 0.95
  },
  {
    name: 'Warzone-4',
    epsilon: 0.95,      // Start nearly pure random
    // alpha dynamically managed
    gamma: 0.95
  },
  
  // LEGACY AGENTS - Strategy-focused personas
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
      illegalPenalty: 2  // Less worried about illegal
    }
  }
];

export function getLearningAgent(name: string = 'Balanced'): LearningAgent {
  if (!learningAgents.has(name)) {
    // Find config for this agent name
    let config = AGENT_CONFIGS.find(c => c.name === name);
    
    // If no config found, create a default one based on the name
    if (!config) {
      console.warn(`No config found for agent: ${name}, using default`);
      if (name.startsWith('PureWarzone')) {
        // Create PureWarzone config - will use special handling
        config = {
          name,
          epsilon: 1.0,  // Start 100% random
          gamma: 0.98    // Strong future focus
        };
      } else if (name.startsWith('Warzone')) {
        // Create warzone config
        config = {
          name,
          epsilon: 0.95,  // Start nearly pure random
          // alpha dynamically managed (starts at 0.25)
          gamma: 0.95
        };
      } else {
        // Use balanced config as default
        config = AGENT_CONFIGS.find(c => c.name === 'Balanced') || {
          name,
          epsilon: 0.3,
          alpha: 0.12,
          gamma: 0.95
        };
      }
    }
    
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
  const [cumulativeEpisodes, setCumulativeEpisodes] = useState(0); // Total episodes across all sessions
  const [insights, setInsights] = useState<string[]>([]);
  const [showTrainer, setShowTrainer] = useState(false);
  const [trainingModeType, setTrainingModeType] = useState<'legacy' | 'warzone' | 'pure'>('legacy');
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
  
  // Track the loaded batch for gameplay
  const [loadedGameplayBatch, setLoadedGameplayBatch] = useState<string>('Current Training');
  
  // Get all selected agents - ensure they're initialized
  const agents = selectedAgents.map(name => {
    const agent = getLearningAgent(name);
    // Ensure agent is properly initialized
    if (!agent) {
      console.error(`Failed to get agent: ${name}`);
    }
    return agent;
  }).filter(Boolean);  // Remove any undefined agents
  
  // Switch agents when training mode type changes
  useEffect(() => {
    if (trainingModeType === 'pure') {
      setSelectedAgents(['PureWarzone-1', 'PureWarzone-2', 'PureWarzone-3', 'PureWarzone-4']);
      setCurrentBatchName('PURE ADVERSARIAL');
    } else if (trainingModeType === 'warzone') {
      setSelectedAgents(['Warzone-1', 'Warzone-2', 'Warzone-3', 'Warzone-4']);
      setCurrentBatchName('WARZONE');
    } else {
      setSelectedAgents(['Explorer', 'Conservative', 'Balanced', 'Aggressive']);
      setCurrentBatchName('Legacy');
    }
  }, [trainingModeType]);
  
  // Load saved batches on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('rheinhessen-ai-batches');
      if (saved) {
        const batches = JSON.parse(saved);
        setSavedBatches(batches);
        
        // Check storage size
        const size = new Blob([saved]).size / (1024 * 1024);
        if (size > 3) {
          console.warn(`Batch storage using ${size.toFixed(2)}MB. Consider cleaning old batches.`);
        }
      }
    } catch (e) {
      console.error('Failed to load saved batches:', e);
      // If corrupt data, offer to clear
      if (confirm('Failed to load saved batches. Clear corrupted data?')) {
        localStorage.removeItem('rheinhessen-ai-batches');
        setSavedBatches([]);
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
    let match: any = null;
    let turnCount = 0;
    
    try {
      // Import all required functions at the top
      const { createMatch, startTurn, applyProduction, applyInternalWithCards, applyInternal, advanceTurn, endCheck } = 
        await import('../engine/match');
    const { bestLegalGreedy, getHandType } = await import('../engine/evaluation');
    const { decideAI } = await import('../ai/personas');
    const { rawValue } = await import('../engine/deck');
    
    // Create a unique game ID for this episode
    const gameId = `episode-${episodeNumber}-${Date.now()}`;
    
    // Set game ID for all agents to track this game properly
    agents.forEach(agent => agent.setGameId(gameId));
    
    // Create match with randomized starting position for fairness
    match = createMatch(Math.random().toString(), { 
      targetScore: 300, 
      escalating: true, 
      randomizeStart: true  // Always randomize in training
    });
    
    // Log starting player for debugging position bias (more frequent for first games)
    if (episodeNumber % 25 === 1 || episodeNumber <= 3) {
      // Reduced logging for performance
    }
    
    match = startTurn(match);
    
    // Set up players based on training mode
    if (trainingMode === 'self-play') {
      // RANDOMIZE SEAT ASSIGNMENTS for fairness!
      // Create a shuffled copy of selected agents
      const shuffledAgents = [...selectedAgents];
      
      // Fisher-Yates shuffle for true randomization
      for (let i = shuffledAgents.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledAgents[i], shuffledAgents[j]] = [shuffledAgents[j], shuffledAgents[i]];
      }
      
      // Assign shuffled agents to seats
      shuffledAgents.forEach((agentName, idx) => {
        if (idx < 4) {
          match.players[idx].persona = `Learner-${agentName}` as any;
        }
      });
      
      // Log seat assignments more frequently to show randomization working
      if (episodeNumber % 10 === 1 || episodeNumber <= 5) {
        // Reduced logging for performance
      }
    } else {
      // Mix of learners and regular bots - also randomize learner positions
      const learnerPositions = [0, 1];
      
      // Shuffle which positions get learners
      for (let i = learnerPositions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [learnerPositions[i], learnerPositions[j]] = [learnerPositions[j], learnerPositions[i]];
      }
      
      match.players[learnerPositions[0]].persona = `Learner-${selectedAgents[0]}` as any;
      if (selectedAgents.length > 1) {
        match.players[learnerPositions[1]].persona = `Learner-${selectedAgents[1]}` as any;
      }
      // Keep other players as regular bots
    }
    
    const previousStates: Array<{
      state: typeof match;
      action: any;
      playerId: number;
      agentName?: string;
      features?: any; // TIER 1 OPTIMIZATION: Store extracted features
    }> = [];
    
    turnCount = 0; // Reset turn counter (declared at top of function)
    const MAX_TURNS = 200; // Safety limit to prevent infinite loops
    
    // Play out the game with safety limit
    while (match.winnerId === undefined && turnCount < MAX_TURNS) {
      const currentPlayer = match.players[match.turnIdx];
      const prevMatch = match;
      turnCount++; // Increment turn counter
      
      // Safety check for stuck games
      if (turnCount >= MAX_TURNS) {
        console.error(`Episode ${episodeNumber} exceeded ${MAX_TURNS} turns - forcing end`);
        // Force winner to be highest score player
        const scores = match.players.map((p: any) => p.score);
        const maxScore = Math.max(...scores);
        match.winnerId = match.players.findIndex((p: any) => p.score === maxScore);
        break;
      }
      
      // Check if current player is a learner
      const isLearner = currentPlayer.persona && 
        typeof currentPlayer.persona === 'string' && 
        currentPlayer.persona.startsWith('Learner-');
      
      if (isLearner) { // Learning agent's turn
        // Extract agent name from persona
        const agentName = (currentPlayer.persona as string).replace('Learner-', '');
        const agent = getLearningAgent(agentName);
        
        // TIER 1 OPTIMIZATION: Extract features once and share
        const features = agent.extractFeatures(match, currentPlayer.id);
        const decision = agent.chooseAction(match, currentPlayer.id, features);
        
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
          agentName,
          features // Store features for later use in learn()
        });
        
        // DON'T clear cache here - hands haven't changed yet!
        // Only clear after cards are actually played
        
        // Apply decision
        if (decision.doInternal && decision.targetId !== undefined) {
          // Find a valid audit hand
          const legal = bestLegalGreedy(currentPlayer.hand);
          if (legal) {
            const handType = getHandType(legal.cards);
            const validTypes = ['trips', 'straight', 'flush', 'full-house', 'quads', 'straight-flush'];
            if (validTypes.includes(handType)) {
              const newMatch = applyInternalWithCards(match, currentPlayer.id, decision.targetId, legal.cards);
              if (newMatch) {
                match = newMatch;
                // Don't clear cache here - let it manage itself
              }
            }
          }
        }
        
        if (decision.production.cards) {
          const newMatch = applyProduction(
            match, 
            currentPlayer.id, 
            decision.production.cards,
            decision.production.type === 'legal' ? 'legal' : 'illegal'
          );
          
          // Safety check for valid state update
          if (!newMatch) {
            console.error(`Episode ${episodeNumber}: applyProduction returned null/undefined`);
            // Force pass instead
            decision.production = { type: 'pass' };
          } else {
            match = newMatch;
          }
        }
        
        // Record turn for all learning agents (opponent modeling)
        const turnAction = decision.doInternal ? 'audit' :
                          decision.production.type === 'pass' ? 'pass' :
                          decision.production.type === 'legal' ? 'legal' : 'illegal';
        const scoreChange = match.players[currentPlayer.id].score - (prevMatch.players[currentPlayer.id]?.score || 0);
        const auditTicksAdded = decision.production.cards && decision.production.type === 'illegal' && 
                               rawValue(decision.production.cards) >= 27 ? 1 : 0;
        
        // Record for ALL learning agents
        selectedAgents.forEach((name: string) => {
          const agent = getLearningAgent(name);
          agent.recordTurn(turnCount, currentPlayer.id, turnAction as any, scoreChange, auditTicksAdded);
        });
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
        
        // Record turn for regular AI too (for opponent modeling)
        const regAction = decision.doInternal ? 'audit' :
                         decision.production.type === 'pass' ? 'pass' :
                         decision.production.type === 'legal' ? 'legal' : 'illegal';
        const regScoreChange = match.players[currentPlayer.id].score - (prevMatch.players[currentPlayer.id]?.score || 0);
        const regAuditTicks = decision.production.cards && decision.production.type === 'illegal' && 
                             rawValue(decision.production.cards) >= 27 ? 1 : 0;
        
        // Record for ALL learning agents
        selectedAgents.forEach((name: string) => {
          const agent = getLearningAgent(name);
          agent.recordTurn(turnCount, currentPlayer.id, regAction as any, regScoreChange, regAuditTicks);
        });
      }
      
      // Check end and advance
      const result = endCheck(match);
      if (result.over) {
        match = { ...match, winnerId: result.winnerId };
        
        // Safety check for undefined winner
        if (result.winnerId === undefined) {
          console.error(`Episode ${episodeNumber} ended with undefined winner - using highest score`);
          const scores = match.players.map((p: any) => p.score);
          const maxScore = Math.max(...scores);
          match.winnerId = match.players.findIndex((p: any) => p.score === maxScore);
        }
        // Log only every 10 episodes to reduce console overhead
        if (episodeNumber % 10 === 0) {
          console.log(`🏆 Episode ${episodeNumber} ended! Winner: P${result.winnerId}, Total states: ${previousStates.length}`);
        }
        
        // Learn from all stored states
        const agentsLearned = new Set<string>();
        for (let i = 0; i < previousStates.length; i++) {
          const { state, action, playerId, agentName, features } = previousStates[i];
          if (agentName) {
            agentsLearned.add(agentName);
            const learner = getLearningAgent(agentName);
            // TIER 1 OPTIMIZATION: Pass precomputed features
            learner.learn(state, action, match, playerId, features);
          }
        }
        // Removed console log for performance
        
        // CRITICAL FIX: Directly update opponent profiles for ALL agents
        // The learn() method might not trigger profile updates if the agent already counted the game
        // Update opponent profiles silently for performance
        selectedAgents.forEach(agentName => {
          const learner = getLearningAgent(agentName);
          // Find which player this agent was
          const playerIdx = match.players.findIndex((p: any) => p.persona === `Learner-${agentName}`);
          if (playerIdx >= 0) {
            // Silent profile update for performance
            // Directly call the profile update method
            learner.updateOpponentProfiles(match, playerIdx);
          } else {
            // Silent warning for performance
          }
          // Track episode completion timing
          learner.markEpisodeComplete();
        });
      } else {
        match = advanceTurn(match);
        match = startTurn(match);
        
        // Learn from recent state if agent played
        if (previousStates.length > 0) {
          const lastState = previousStates[previousStates.length - 1];
          if (lastState.agentName) {
            const learner = getLearningAgent(lastState.agentName);
            // TIER 1 OPTIMIZATION: Use precomputed features
            learner.learn(lastState.state, lastState.action, match, lastState.playerId, lastState.features);
          }
        }
      }
      
      // Small delay to prevent browser freezing (only every 10 turns)
      // Reduced frequency to improve performance
      if (turnCount % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      
      // Extra safety: If we've been in this loop too long, yield more often
      if (turnCount > 50 && turnCount % 5 === 0) {
        console.warn(`Episode ${episodeNumber} has ${turnCount} turns - yielding to prevent hang`);
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }
    
    // Log if we hit the turn limit
    if (turnCount >= MAX_TURNS) {
      console.error(`🚨 Episode ${episodeNumber} hit MAX_TURNS limit (${MAX_TURNS}). Game state may be stuck.`);
      // Log agent stats for debugging
      agents.forEach(agent => {
        console.log(`${agent.name} stats:`, agent.stats);
      });
    }
    
    // Update exploration rate and episode count for all agents
    agents.forEach(agent => {
      agent.updateExploration(episodeNumber);
    });
    
    // PERFORMANCE FIX: Save to storage periodically, not every learn()
    if (episodeNumber % 10 === 0) {
      agents.forEach(agent => agent.saveToStorage());
      console.log(`💾 Saved Q-tables at episode ${episodeNumber}`);
    }
    } catch (error) {
      console.error(`🚨 Critical error in episode ${episodeNumber}:`, error);
      console.error('Stack trace:', (error as any).stack);
      
      // Log current game state for debugging
      console.log('Turn count reached:', turnCount);
      console.log('Match had winnerId:', match?.winnerId);
      
      // Force a winner to prevent complete hang
      if (match && match.winnerId === undefined) {
        const scores = match.players.map((p: any) => p.score);
        const maxScore = Math.max(...scores);
        match.winnerId = match.players.findIndex((p: any) => p.score === maxScore);
        console.log('Forced winner:', match.winnerId);
      }
    }
  };
  
  const startTraining = async () => {
    try {
      // Get the current max episodes completed by agents (preserve progress)
      const startingEpisodes = Math.max(...agents.map(a => a.stats.episodesCompleted || 0), cumulativeEpisodes);
      console.log(`Resuming training from episode ${startingEpisodes + 1}, running ${episodesTarget} more episodes`);
      
      setIsTraining(true);
      isTrainingRef.current = true;
      setCurrentEpisode(0);
      
      // Ensure agents have a batch name for display
      agents.forEach(agent => {
        if (!agent.batchName) {
          agent.batchName = currentBatchName || 'Training';
        }
      });
      
      for (let i = 0; i < episodesTarget; i++) {
        if (!isTrainingRef.current) {
          console.log('Training stopped by user');
          break;
        }
        
        const actualEpisode = startingEpisodes + i + 1;
        // Log progress every 10 episodes to reduce console overhead
        if (actualEpisode % 10 === 0) {
          console.log(`Running episode ${actualEpisode} (${i + 1} of ${episodesTarget} in this batch)`);
        }
        await runTrainingEpisode(actualEpisode);
        setCurrentEpisode(i + 1);
        setCumulativeEpisodes(actualEpisode);
        
        // Update UI more frequently for debugging (every 3 episodes)
        if (actualEpisode % 3 === 0) {
          const allInsights: string[] = [];
          agents.forEach(agent => {
            allInsights.push(`=== ${agent.name} ===`);
            // PERFORMANCE: Use quick mode during training to skip expensive Q-table iteration
            allInsights.push(...agent.getInsights(true));
            allInsights.push('');
          });
          setInsights(allInsights);
          await new Promise(resolve => setTimeout(resolve, trainingSpeed));
        }
        
        // Save progress less frequently (every 10 episodes)
        if (actualEpisode % 10 === 0) {
          agents.forEach(agent => {
            // Save progress with current batch name
            if (!agent.batchName) {
              agent.batchName = currentBatchName;
            }
            agent.saveToStorage();
          });
        }
      }
      
      console.log('Training complete!');
      
      // PERFORMANCE FIX: Save Q-tables when training completes
      agents.forEach(agent => agent.saveToStorage());
      console.log('💾 Saved final Q-tables');
      
      setIsTraining(false);
      isTrainingRef.current = false;
      const finalInsights: string[] = [];
      agents.forEach(agent => {
        finalInsights.push(`=== ${agent.name} ===`);
        // Full insights for final display
        finalInsights.push(...agent.getInsights(false));
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
      setCumulativeEpisodes(0);
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
    try {
      console.log('Saving batch:', name, 'Agents:', agents.length);
      
      if (agents.length === 0) {
        alert('No agents to save!');
        return;
      }
      
      const data: any = {};
      let totalEpisodes = 0;
      let totalWinRate = 0;
      let totalScore = 0;
      let agentCount = 0;
      
      agents.forEach(agent => {
        agent.batchName = name;  // Set batch name on agents
        // Save to agent-specific storage immediately
        agent.saveToStorage();
        const knowledge = agent.exportKnowledge();
        
        // Check if knowledge export succeeded
        if (!knowledge) {
          console.error('Failed to export knowledge for agent:', agent.name);
          return;
        }
        
        data[agent.name] = knowledge;
        totalEpisodes += agent.stats.episodesCompleted || 0;
        totalWinRate += agent.stats.winRate || 0;
        totalScore += agent.stats.avgScore || 0;
        agentCount++;
      });
      
      if (agentCount === 0) {
        alert('No agent data to save!');
        return;
      }
      
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
      
      // Check localStorage size before saving
      const batchDataStr = JSON.stringify(newBatches);
      const sizeMB = batchDataStr.length / (1024 * 1024);
      console.log(`💾 Attempting to save ${sizeMB.toFixed(2)}MB to localStorage...`);
      
      // Try to save to localStorage
      try {
        setSavedBatches(newBatches);
        localStorage.setItem('rheinhessen-ai-batches', batchDataStr);
        setCurrentBatchName(name);
        setBatchName('');
        
        console.log('✅ Batch saved to localStorage successfully!');
        alert(`✅ Batch "${name}" saved successfully! (${sizeMB.toFixed(2)}MB)`);
      } catch (storageError: any) {
        console.error('localStorage failed:', storageError);
        
        // Don't auto-download - just warn the user
        console.error(`⚠️ localStorage is full (tried to save ${sizeMB.toFixed(2)}MB)`);
        
        // Still update the current batch name
        setCurrentBatchName(name);
        setBatchName('');
        
        alert(`⚠️ localStorage is full (tried to save ${sizeMB.toFixed(2)}MB).\n\n` +
              `💡 You can manually export this batch using the Export button.\n` +
              `🗑️ Or clear storage to make room.`);
      }
    } catch (error) {
      console.error('Failed to save batch:', error);
      alert(`Failed to save batch: ${error}`);
    }
  };
  
  const loadBatch = (batch: SavedBatch) => {
    // Clear existing agents
    learningAgents.clear();
    
    // Track max episodes for cumulative count
    let maxEpisodes = 0;
    
    // Load the saved agents
    Object.keys(batch.agents).forEach(agentName => {
      const agent = getLearningAgent(agentName);
      agent.importKnowledge(batch.agents[agentName]);
      
      // Track the maximum episodes completed
      maxEpisodes = Math.max(maxEpisodes, agent.stats.episodesCompleted || 0);
      
      // Ensure batch name is set and saved
      agent.batchName = batch.name;
      agent.saveToStorage();
    });
    
    // Set cumulative episodes to match loaded batch
    setCumulativeEpisodes(maxEpisodes);
    
    // Update insights
    const allInsights: string[] = [];
    agents.forEach(agent => {
      allInsights.push(`=== ${agent.name} ===`);
      allInsights.push(...agent.getInsights());
      allInsights.push('');
    });
    setInsights(allInsights);
    setCurrentBatchName(batch.name);
    setLoadedGameplayBatch(batch.name);  // Set for gameplay too
    setShowBatchManager(false);
    
    console.log(`Loaded batch: ${batch.name} with ${maxEpisodes} episodes completed`);
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
    setCumulativeEpisodes(0);
  };
  
  // Calculate total localStorage usage
  const getStorageSize = () => {
    let totalSize = 0;
    for (let key in localStorage) {
      if (key.startsWith('rheinhessen-')) {
        const item = localStorage.getItem(key);
        if (item) {
          totalSize += item.length;
        }
      }
    }
    return (totalSize / (1024 * 1024)).toFixed(2); // MB
  };
  
  // Get detailed storage breakdown
  const getStorageBreakdown = () => {
    const breakdown: { key: string; size: number }[] = [];
    for (let key in localStorage) {
      if (key.startsWith('rheinhessen-')) {
        const item = localStorage.getItem(key);
        if (item) {
          breakdown.push({
            key: key.replace('rheinhessen-', ''),
            size: item.length / 1024 // KB
          });
        }
      }
    }
    breakdown.sort((a, b) => b.size - a.size);
    return breakdown;
  };
  
  // Clear all AI training data from localStorage
  const clearAllAIData = () => {
    const keysToRemove: string[] = [];
    for (let key in localStorage) {
      if (key.startsWith('rheinhessen-ai-') || key === 'rheinhessen-ai-batches') {
        keysToRemove.push(key);
      }
    }
    
    const sizeBefore = getStorageSize();
    
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
    });
    
    const sizeAfter = getStorageSize();
    
    console.log(`Cleared ${keysToRemove.length} AI data keys`);
    console.log(`Storage reduced from ${sizeBefore}MB to ${sizeAfter}MB`);
    
    return keysToRemove.length;
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
                    
                    {/* Storage management */}
                    {savedBatches.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-700 flex justify-between items-center">
                        <div className="text-xs text-gray-400">
                          {savedBatches.length} batches saved
                        </div>
                        <button
                          onClick={() => {
                            if (confirm('Clear ALL saved batches? This cannot be undone!')) {
                              localStorage.removeItem('rheinhessen-ai-batches');
                              setSavedBatches([]);
                              alert('All batches cleared!');
                            }
                          }}
                          className="px-2 py-1 bg-red-700 hover:bg-red-800 text-white text-xs rounded"
                        >
                          Clear All
                        </button>
                      </div>
                    )}
                    
                    {/* Storage Management */}
                    <div className="mt-2 p-2 bg-yellow-900/20 rounded space-y-2">
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() => {
                            const breakdown = getStorageBreakdown();
                            const details = breakdown.map(item => 
                              `${item.key}: ${item.size.toFixed(1)}KB`
                            ).join('\n');
                            alert(`Storage Breakdown:\n\n${details}\n\nTotal: ${getStorageSize()}MB`);
                          }}
                          className="text-xs text-yellow-400 hover:text-yellow-300 cursor-pointer underline"
                        >
                          Storage: {getStorageSize()}MB used (click for details)
                        </button>
                        <button
                          onClick={() => {
                            const sizeBefore = getStorageSize();
                            const keysCleared = clearAllAIData();
                            const sizeAfter = getStorageSize();
                            alert(`Cleared ${keysCleared} AI data keys!\nFreed ${(parseFloat(sizeBefore) - parseFloat(sizeAfter)).toFixed(2)}MB of storage.\n\nYou can now save new batches.`);
                            // Refresh agents
                            agents.forEach(agent => agent.reset());
                            const allInsights: string[] = [];
                            agents.forEach(agent => {
                              allInsights.push(`=== ${agent.name} ===`);
                              allInsights.push(...agent.getInsights());
                              allInsights.push('');
                            });
                            setInsights(allInsights);
                          }}
                          className="px-2 py-1 bg-yellow-700 hover:bg-yellow-800 text-white text-xs rounded"
                        >
                          🗑️ Clear AI Storage
                        </button>
                      </div>
                      <div className="text-xs text-yellow-500">
                        If you get "QuotaExceededError", click Clear AI Storage
                      </div>
                      
                      {/* Nuclear option */}
                      {getStorageSize() !== '0.00' && (
                        <button
                          onClick={() => {
                            if (confirm('⚠️ NUCLEAR OPTION ⚠️\n\nThis will clear ALL Rheinhessen game data including:\n- All AI training data\n- All saved batches\n- All game settings\n\nAre you ABSOLUTELY SURE?')) {
                              // Clear EVERYTHING related to the game
                              const keysToRemove: string[] = [];
                              for (let key in localStorage) {
                                if (key.startsWith('rheinhessen-')) {
                                  keysToRemove.push(key);
                                }
                              }
                              
                              keysToRemove.forEach(key => localStorage.removeItem(key));
                              
                              // Reset everything
                              setSavedBatches([]);
                              setUseLearnerInGames(false);
                              agents.forEach(agent => agent.reset());
                              
                              alert(`💥 NUCLEAR CLEAR COMPLETE 💥\n\nCleared ${keysToRemove.length} keys.\nAll game data has been wiped.\n\nYou have a fresh start!`);
                              
                              // Refresh the page for a clean slate
                              window.location.reload();
                            }
                          }}
                          className="w-full px-2 py-1 bg-red-900 hover:bg-red-800 text-white text-xs rounded flex items-center justify-center gap-1"
                        >
                          💥 Nuclear Clear (Wipes Everything)
                        </button>
                      )}
                    </div>
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
                    {/* Batch Selector for Gameplay */}
                    {(trainingModeType === 'warzone' || trainingModeType === 'pure') && (
                      <div className="mb-4 p-3 bg-gray-800 rounded border border-gray-700">
                        <div className="text-sm text-gray-300 mb-2">Playing with batch:</div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-white font-bold">{loadedGameplayBatch}</span>
                          <button
                            onClick={() => setShowBatchManager(true)}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded"
                          >
                            Load Batch
                          </button>
                        </div>
                        {loadedGameplayBatch !== 'Current Training' && agents.some(a => a.batchName) && (
                          <div className="text-xs text-purple-400 mt-1">
                            Episodes: {Math.max(...agents.map(a => a.stats.episodesCompleted || 0))}
                          </div>
                        )}
                      </div>
                    )}
                    
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
                          {trainingModeType === 'pure' ? (
                            <>
                              <option value="PureWarzone-1">PureWarzone-1</option>
                              <option value="PureWarzone-2">PureWarzone-2</option>
                              <option value="PureWarzone-3">PureWarzone-3</option>
                              <option value="PureWarzone-4">PureWarzone-4</option>
                            </>
                          ) : trainingModeType === 'warzone' ? (
                            <>
                              <option value="Warzone-1">Warzone-1</option>
                              <option value="Warzone-2">Warzone-2</option>
                              <option value="Warzone-3">Warzone-3</option>
                              <option value="Warzone-4">Warzone-4</option>
                            </>
                          ) : (
                            <>
                              <option value="Explorer">Learner: Explorer</option>
                              <option value="Conservative">Learner: Conservative</option>
                              <option value="Balanced">Learner: Balanced</option>
                              <option value="Aggressive">Learner: Aggressive</option>
                            </>
                          )}
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
                          {trainingModeType === 'pure' ? (
                            <>
                              <option value="PureWarzone-1">PureWarzone-1</option>
                              <option value="PureWarzone-2">PureWarzone-2</option>
                              <option value="PureWarzone-3">PureWarzone-3</option>
                              <option value="PureWarzone-4">PureWarzone-4</option>
                            </>
                          ) : trainingModeType === 'warzone' ? (
                            <>
                              <option value="Warzone-1">Warzone-1</option>
                              <option value="Warzone-2">Warzone-2</option>
                              <option value="Warzone-3">Warzone-3</option>
                              <option value="Warzone-4">Warzone-4</option>
                            </>
                          ) : (
                            <>
                              <option value="Explorer">Learner: Explorer</option>
                              <option value="Conservative">Learner: Conservative</option>
                              <option value="Balanced">Learner: Balanced</option>
                              <option value="Aggressive">Learner: Aggressive</option>
                            </>
                          )}
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
                          {trainingModeType === 'pure' ? (
                            <>
                              <option value="PureWarzone-1">PureWarzone-1</option>
                              <option value="PureWarzone-2">PureWarzone-2</option>
                              <option value="PureWarzone-3">PureWarzone-3</option>
                              <option value="PureWarzone-4">PureWarzone-4</option>
                            </>
                          ) : trainingModeType === 'warzone' ? (
                            <>
                              <option value="Warzone-1">Warzone-1</option>
                              <option value="Warzone-2">Warzone-2</option>
                              <option value="Warzone-3">Warzone-3</option>
                              <option value="Warzone-4">Warzone-4</option>
                            </>
                          ) : (
                            <>
                              <option value="Explorer">Learner: Explorer</option>
                              <option value="Conservative">Learner: Conservative</option>
                              <option value="Balanced">Learner: Balanced</option>
                              <option value="Aggressive">Learner: Aggressive</option>
                            </>
                          )}
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
                
                {/* TRAINING MODE SELECTOR */}
                <div className="mb-4 p-3 bg-gray-800 border-2 border-gray-600 rounded">
                  <div className="text-white font-bold mb-2">Training Mode</div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => setTrainingModeType('legacy')}
                      className={`px-3 py-2 rounded font-bold transition-all ${
                        trainingModeType === 'legacy'
                          ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/50'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      <div>Legacy</div>
                      <div className="text-xs font-normal">Guided</div>
                    </button>
                    <button
                      onClick={() => setTrainingModeType('warzone')}
                      className={`px-3 py-2 rounded font-bold transition-all ${
                        trainingModeType === 'warzone'
                          ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/50'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      <div>⚔️ Warzone</div>
                      <div className="text-xs font-normal">Competition</div>
                    </button>
                    <button
                      onClick={() => setTrainingModeType('pure')}
                      className={`px-3 py-2 rounded font-bold transition-all ${
                        trainingModeType === 'pure'
                          ? 'bg-red-600 text-white shadow-lg shadow-red-600/50'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      <div>🎯 Pure</div>
                      <div className="text-xs font-normal">Win Only</div>
                    </button>
                  </div>
                  <div className="mt-2 text-xs text-gray-400">
                    {trainingModeType === 'legacy' && '📚 Strategy-focused personas with specific reward guidance'}
                    {trainingModeType === 'warzone' && '🔥 4 competitors with minimal guidance - winning is everything'}
                    {trainingModeType === 'pure' && '💀 ZERO GUIDANCE - Only +1000 win / -1000 lose - Pure discovery'}
                  </div>
                </div>
                
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
                  <label className="text-sm text-gray-300 block mb-2">
                    {trainingModeType === 'pure' ? '🎯 Pure Adversaries' : 
                     trainingModeType === 'warzone' ? '⚔️ Warzone Competitors' : 
                     'Active Learner Agents'}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {AGENT_CONFIGS
                      .filter(config => {
                        if (trainingModeType === 'pure') return config.name?.startsWith('PureWarzone');
                        if (trainingModeType === 'warzone') return config.name?.startsWith('Warzone-');
                        return !config.name?.startsWith('Warzone') && !config.name?.startsWith('PureWarzone');
                      })
                      .map(config => (
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
                            disabled={trainingModeType === 'warzone' || trainingModeType === 'pure'}  // In warzone/pure, all 4 compete
                            className={`w-4 h-4 ${trainingModeType === 'pure' ? 'text-red-600' : trainingModeType === 'warzone' ? 'text-orange-600' : 'text-blue-600'}`}
                          />
                          <span className={`text-sm ${trainingModeType === 'pure' ? 'text-red-300' : trainingModeType === 'warzone' ? 'text-orange-300' : 'text-gray-300'}`}>
                            {config.name}
                          </span>
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
                      try {
                        if (agents.length === 0) {
                          alert('No agents to export!');
                          return;
                        }
                        
                        const data: any = {
                          batchName: currentBatchName,
                          exportDate: new Date().toISOString(),
                          agents: {}
                        };
                        
                        agents.forEach(agent => {
                          const knowledge = agent.exportKnowledge();
                          if (knowledge) {
                            data.agents[agent.name] = knowledge;
                          } else {
                            console.error('Failed to export knowledge for agent:', agent.name);
                          }
                        });
                        
                        if (Object.keys(data.agents).length === 0) {
                          alert('No agent data to export!');
                          return;
                        }
                        
                        // Calculate total states and size
                        let totalStates = 0;
                        Object.values(data.agents).forEach((agent: any) => {
                          if (agent.qTable) {
                            totalStates += Object.keys(agent.qTable).length;
                          }
                        });
                        
                        const jsonStr = JSON.stringify(data, null, 2);
                        const sizeMB = jsonStr.length / (1024 * 1024);
                        
                        console.log(`📤 Exporting batch: ${currentBatchName}`);
                        console.log(`📊 Size: ${sizeMB.toFixed(2)}MB with ${totalStates} total states`);
                        console.log(`🎯 Agents: ${Object.keys(data.agents).join(', ')}`);
                        
                        const blob = new Blob([jsonStr], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `rheinhessen-batch-${currentBatchName.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                        
                        alert(`Exported ${Object.keys(data.agents).length} agents with ${totalStates} states (${sizeMB.toFixed(2)}MB).\n\nFile saved to your Downloads folder.`);
                      } catch (error) {
                        console.error('Failed to export batch:', error);
                        alert(`Failed to export batch: ${error}`);
                      }
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
                              const fileContent = event.target?.result as string;
                              const fileSizeMB = fileContent.length / (1024 * 1024);
                              console.log(`📂 Importing file: ${file.name} (${fileSizeMB.toFixed(2)}MB)`);
                              
                              const data = JSON.parse(fileContent);
                              
                              // Handle single agent file (from auto-download) or batch file
                              let agentsData: any = {};
                              let batchName = 'Imported';
                              
                              if (data.qTable && data.stats) {
                                // Single agent file from auto-download
                                const agentName = data.name || file.name.split('_')[0];
                                agentsData[agentName] = data;
                                batchName = `${agentName}_import`;
                                console.log(`📥 Importing single agent: ${agentName}`);
                              } else {
                                // Multi-agent batch file
                                agentsData = data.agents || data;
                                batchName = data.batchName || 'Imported';
                              }
                              
                              let importCount = 0;
                              let totalStates = 0;
                              
                              Object.keys(agentsData).forEach(agentName => {
                                if (typeof agentsData[agentName] === 'object') {
                                  const agent = getLearningAgent(agentName);
                                  agent.importKnowledge(agentsData[agentName]);
                                  
                                  // Count imported data
                                  const agentStates = Object.keys(agentsData[agentName].qTable || {}).length;
                                  totalStates += agentStates;
                                  importCount++;
                                  
                                  console.log(`✅ Imported ${agentName}: ${agentStates} states`);
                                  
                                  // Set batch name but DON'T save to storage yet - let user decide
                                  agent.batchName = batchName;
                                }
                              });
                              
                              alert(`Successfully imported ${importCount} agents with ${totalStates} total states from ${fileSizeMB.toFixed(2)}MB file!\n\nThe data is loaded in memory. Use 'Save Batch' to persist to localStorage if it fits.`);
                              
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
                      Batch: {currentEpisode} / {episodesTarget} | Total: {cumulativeEpisodes} episodes
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
                <div className="text-xs text-gray-400 mb-2">
                  Batch Progress: {currentEpisode} of {episodesTarget} | Total Episodes: {cumulativeEpisodes}
                </div>
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
                <h3 className="text-white font-semibold mb-3">⚔️ COLLUSION WARZONE MODE ⚔️</h3>
                <div className="text-sm text-gray-300 space-y-1">
                  <div>🏆 <span className="text-yellow-400 font-bold">+1000 WIN</span> - ONLY GOAL!</div>
                  <div>💀 <span className="text-red-500 font-bold">-500 LOSE</span> - FAILURE!</div>
                  <div className="text-orange-400 font-bold">ANTI-LEADER COLLUSION:</div>
                  <div>🎯 <span className="text-yellow-300">+150 base</span> - Attack the leader</div>
                  <div>⚡ <span className="text-orange-400">+250 @ 250pts</span> - Medium urgency</div>
                  <div>🔥 <span className="text-red-400 font-bold">+400 @ 275pts</span> - HIGH URGENCY</div>
                  <div>🚨 <span className="text-red-600 font-bold">+600 @ 290pts</span> - EMERGENCY!</div>
                  <div>💥 <span className="text-purple-400">+300 PREVENT WIN</span> - Stop them!</div>
                  <div className="text-cyan-400 font-bold">GANG TACTICS:</div>
                  <div>🤝 <span className="text-cyan-300">+100 FOLLOW-UP</span> - Join the attack</div>
                  <div>⚔️ <span className="text-cyan-500">+150 PILE ON</span> - Gang assault!</div>
                </div>
              </div>
              
              {/* Instructions */}
              <div className="text-xs text-gray-400 border-t border-gray-700 pt-3">
                <p className="text-red-500 font-bold mb-1">⚔️ ANTI-LEADER COLLUSION PROTOCOL:</p>
                <p>• <span className="text-yellow-400">PROGRESSIVE URGENCY</span> - More aggressive as leader approaches 300</p>
                <p>• <span className="text-orange-400">GANG UP</span> - Multiple AIs coordinate attacks on leader</p>
                <p>• <span className="text-red-400">EMERGENCY MODE</span> - At 290+ points, stop them at ALL COSTS</p>
                <p>• <span className="text-cyan-400">PILE ON</span> - Join attacks for bonus coordination rewards</p>
                <p>• <span className="text-purple-400">CUT THEM DOWN</span> - Big rewards for large score drops</p>
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
