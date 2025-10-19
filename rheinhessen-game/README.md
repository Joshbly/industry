# RHEINHESSEN INDUSTRIEWERK GmbH

A strategic card game where players compete as industrial corporations, managing production and navigating audits to reach 300 points first.

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173 to play.

## Game Rules

### Setup
- 208 cards (four standard decks, no Jokers)
- 4 players (You vs 3 AI bots)
- Each player draws 7 cards
- First to 300 points wins

### Turn Structure
1. **DRAW 2 cards** (mandatory)
2. **INTERNAL AUDIT** (optional) - Audit an opponent's factory floor
3. **PRODUCE** one set of cards or Pass

### Production Types
- **LEGAL** (exact poker hands): 70% of raw value + 8 bonus points
  - Pair, Two Pair, Trips, Straight, Flush, Full House, Quads, Straight Flush
- **ILLEGAL** (anything else): 60% of raw value
  - If raw value ≥27: -5 kickback, +1 or +2 audit ticks

### Audit System
- Track has 5 boxes (0-4)
- At 5 ticks: EXTERNAL AUDIT triggers
  - All players reorganize floors
  - Leftover illegal cards = double fines
  - Triggering player: -20 points
  - Track resets to 0

### AI Personas
- **Aggro**: High-risk, dumps cards for maximum points
- **Balanced**: Moderate strategy, adapts to audit track
- **Conservative**: Low-risk, prefers legal productions
- **Opportunist**: Strategic auditing, exploits opportunities

## Controls
- Click cards to select them
- **Play LEGAL**: Play selected cards as legal hand
- **Play ILLEGAL**: Play selected cards as illegal
- **Safe ILLEGAL ≤26**: Auto-select safe illegal combination
- **Pass**: Skip production phase

## Features
- Canvas-based rendering for smooth gameplay
- Real-time hints showing best available plays
- Turn log tracking all game actions
- Adjustable AI speed
- Telemetry system for game analysis

## Development

### Project Structure
```
src/
├── engine/       # Game logic (pure functions)
├── ai/           # Bot persona implementations
├── store/        # Zustand state management
├── components/   # React UI components
└── App.tsx       # Main application
```

### Testing
```bash
npm test
```

### Build
```bash
npm run build
```

## Technical Stack
- React 18 + TypeScript
- Vite for fast builds
- Zustand for state management
- Canvas API for rendering
- Tailwind CSS for styling

## Game Strategy Tips
1. Watch the audit track - at 4 ticks, prefer legal productions
2. Internal audits can swing games - target opponents with messy floors
3. Safe illegal (≤26) avoids spikes while scoring decent points
4. Different AI personas have predictable weaknesses to exploit