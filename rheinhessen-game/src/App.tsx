import { useEffect } from 'react';
import useGameStore from './store/gameStore';
import { IndustrialUI } from './components/IndustrialUI';

function App() {
  const match = useGameStore(state => state.match);
  const newMatch = useGameStore(state => state.newMatch);
  const processAITurn = useGameStore(state => state.processAITurn);
  const aiDelay = useGameStore(state => state.aiDelay);
  
  useEffect(() => {
    if (!match) {
      newMatch();
    }
  }, [match, newMatch]);
  
  useEffect(() => {
    if (!match || match.winnerId !== undefined) return;
    
    const currentPlayer = match.players[match.turnIdx];
    if (currentPlayer.persona !== 'Human') {
      const timer = setTimeout(() => {
        processAITurn();
      }, aiDelay);
      return () => clearTimeout(timer);
    }
  }, [match, processAITurn, aiDelay]);
  
  return <IndustrialUI />;
}

export default App;