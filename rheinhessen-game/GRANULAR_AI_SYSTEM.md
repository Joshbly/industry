# Granular AI Hand Management System

## Overview
The new granular AI system provides **real hand management** capabilities, allowing AI agents to make specific card selection decisions rather than just choosing high-level strategies.

## Original System Limitations

The original AI could only choose between 5 high-level actions:
- `play-legal` → Automatically plays best legal hand
- `play-safe` → Automatically plays best illegal under 27
- `play-dump` → Dumps entire hand
- `audit-highest` → Audits highest crime opponent
- `pass` → Pass turn

**Problems:**
- No control over which cards to play
- Cannot hold specific cards for later
- Cannot choose between multiple valid options
- Cannot build combinations over turns
- Always plays greedily (highest value)

## New Granular System Features

### 1. Hand Analyzer (`handAnalyzer.ts`)
- Evaluates **ALL possible card combinations** from hand
- Calculates immediate value, future value, and strategic implications
- Identifies hand types (pair, trips, straight, etc.)
- Assesses audit risk and building potential

### 2. Play Options
Each possible play is evaluated with:
```typescript
interface PlayOption {
  cards: Card[];              // Specific cards to play
  immediateValue: number;     // Points from this play
  futureValue: number;        // Estimated value of remaining cards
  auditRisk: number;          // Risk if audited
  strategic: {
    keepsTrips: boolean;      // Preserves trips for audit
    buildsPotential: boolean; // Keeps cards for better hands
    dumpsJunk: boolean;       // Gets rid of low singles
    savesHighCards: boolean;  // Keeps aces/kings
  }
}
```

### 3. Granular Actions
Instead of abstract actions, the AI now chooses specific card combinations:
```typescript
type GranularAction = {
  type: 'play' | 'audit' | 'pass';
  cards?: Card[];        // EXACT cards to play
  targetPlayer?: number;
  strategy?: 'aggressive' | 'conservative' | 'balanced';
}
```

### 4. Enhanced State Features
The AI sees much more detail about its options:
- Number of legal/illegal options available
- Best values for each option type
- Building potential (straight/flush)
- Whether it can keep trips for audit
- Specific opponent vulnerabilities

### 5. Strategic Decision Making
The AI can now:
- **Hold valuable cards**: Play a smaller pair to keep an ace-king
- **Build combinations**: Pass to complete a straight next turn
- **Manage risk**: Play safe hands when audit track is high
- **Preserve audit capability**: Keep trips instead of playing them
- **Dump strategically**: Get rid of low singles while keeping high cards

## Example Scenarios

### Scenario 1: Building a Hand
**Hand**: [2♠, 3♦, 4♣, 5♥, K♠, K♦]
- **Original AI**: Would play K♠-K♦ immediately (highest value)
- **Granular AI**: Might play 2♠-3♦-4♣-5♥ incomplete, hoping to draw a 6 for straight

### Scenario 2: Audit Management
**Hand**: [7♣, 7♦, 7♥, A♠, K♦]
- **Original AI**: Would play trips immediately if legal value > illegal
- **Granular AI**: Can choose to hold trips for audit if opponents have high crime

### Scenario 3: Risk Management
**Hand**: [3♠, 5♦, 8♣, J♥, Q♠, K♦] with audit track at 4
- **Original AI**: Might dump all cards (dangerous)
- **Granular AI**: Can play just 3♠-5♦-8♣ (safe under threshold) and keep high cards

## Implementation

### Using Granular Agents
```javascript
// In personas.ts, agents with "Granular-" prefix use the new system
if (persona.startsWith('Granular-')) {
  const agent = getGranularAgent(agentName);
  return agent.decide(state, playerId);
}
```

### Training Granular Agents
The Q-learning now maps state features to specific card combinations:
- State space: Game conditions + hand composition
- Action space: Specific card selections (not abstract strategies)
- Rewards: Based on immediate value + future potential

## Performance Implications

### Pros:
- **True hand management**: AI makes intelligent card-specific decisions
- **Strategic depth**: Can plan multiple turns ahead
- **Adaptability**: Learns which cards work best in different situations
- **Realistic play**: More human-like decision making

### Cons:
- **Larger action space**: More combinations to evaluate
- **Slower training**: Takes longer to explore all options
- **Memory usage**: Q-table grows faster with specific actions

## Future Enhancements

1. **Card counting**: Track which cards have been played
2. **Opponent modeling**: Learn opponent-specific strategies
3. **Bluffing**: Intentionally play suboptimal to mislead
4. **Combo recognition**: Identify multi-turn combination opportunities
5. **Meta-strategies**: Switch between aggressive/conservative based on game state

## Conclusion

The granular AI system transforms the game from "strategy selection" to "hand management". AI agents can now:
- Make specific card decisions
- Build hands over multiple turns
- Balance immediate gains vs future potential
- Play more like skilled human players

This creates a much more challenging and realistic opponent that can discover sophisticated strategies through learning.
