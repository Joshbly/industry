# AI Feature Analysis: Rheinhessen Industriewerk GmbH

## Executive Summary

After deep analysis of game mechanics and win conditions, we've optimized from 35 features to 25 critical features that directly impact winning decisions. This document explains the reasoning behind each feature choice.

## The Core Game Loop

**Objective**: First to 300 points wins
- **Legal production**: 70% of raw value + 8 bonus
- **Safe illegal** (≤26 raw): 60% of raw value  
- **Dangerous illegal** (≥27 raw): 60% - 5 kickback + audit tick
- **Internal audit**: Requires trips+ worth 12+ taxed, fines at 1.5x
- **External audit** (5 ticks): -20 for trigger, double fines for all

## The 25 Critical Features

### POSITION & SCORING (4 features)
Essential for understanding win condition proximity.

| Feature | Discretization | Why This Matters |
|---------|---------------|------------------|
| `myScore` | [100, 200] | Coarse game phases: early/mid/late |
| `myScoreRank` | Exact 1-4 | Relative position drives strategy |
| `pointsBehindLeader > 30` | Binary | Far behind = need aggressive play |
| `leaderScore >= 250` | Binary | Someone near win = urgent decisions |

**Key Insight**: We don't need granular score tracking. What matters is phase (early/mid/late) and urgency (someone winning soon?).

### HAND QUALITY (5 features)
Determines available actions each turn.

| Feature | Type | Critical Decision |
|---------|------|-------------------|
| `hasLegal` | Binary | 70% vs 60% rate choice |
| `bestLegalRaw > 30` | Binary | Strong legal worth playing |
| `hasTripsPlus` | Binary | Can perform internal audit |
| `bestSafeRaw >= 20` | Binary | Good safe illegal available |
| `canPlayDangerous` | Binary | **NEW** - Have 27+ option? |

**The 27-Threshold**: The difference between 26 and 27 raw value is massive:
- 26 raw = 15 points (safe)
- 27 raw = 11 points + tick + kickback (dangerous)

This single point difference changes everything, yet we weren't tracking it!

### AUDIT DYNAMICS (6 features)
Risk/reward balance that defines the game.

| Feature | Type | Strategic Impact |
|---------|------|------------------|
| `auditTrack` | 0-4 exact | Determines safe/dangerous threshold |
| `wouldTriggerExternal` | Binary | Prevents -20 catastrophe |
| `hasValidAuditHand` | Binary | Audit availability |
| `auditROI` | [-1, 0, 1] | **NEW** - Profit/cost ratio |
| `playersNearExternal` | 0-3 count | **NEW** - Cascade risk |
| `myFloorCrime > 30` | Binary | Am I vulnerable? |

**ROI Thinking**: Instead of tracking profit and cost separately, we use the ratio. An audit with ROI > 1 is always good, ROI < -0.5 is usually bad.

### OPPONENT TRACKING (7 features)
Individual tracking enables targeted strikes.

| Feature | Type | Why Individual Matters |
|---------|------|------------------------|
| `opp1Score` | [100, 200] buckets | Track threat progression |
| `opp1FloorCrime` | [15, 30, 50] buckets | AI learns audit thresholds |
| `opp2Score` | [100, 200] buckets | (Same for each opponent) |
| `opp2FloorCrime` | [15, 30, 50] buckets | |
| `opp3Score` | [100, 200] buckets | |
| `opp3FloorCrime` | [15, 30, 50] buckets | |
| `bestAuditTarget` | Player ID | **WHO** to audit |

**Critical**: We MUST track opponents individually. Aggregating loses the ability to target the right player for audits.

### GAME CONTEXT (3 features)
Phase awareness for strategic timing.

| Feature | Type | Strategic Use |
|---------|------|---------------|
| `gamePhase` | 0-3 | Early/mid/late/final |
| `isEndgame` | Binary | Changes risk tolerance |
| `canBlockLeader` | Binary | Can stop winner with audit |

## Features We REMOVED and Why

### Redundant Features
- **`highestRank`**: Already captured in `bestLegalRaw`
- **`myProductionCount`**: `gamePhase` covers this
- **`myVulnerability`**: Just use `myFloorCrime`
- **`numPairs`**: `hasLegal` is what matters

### Overrated Features
- **`opp1/2/3HandSize`**: Can't act on this information
- **`shouldDump`, `shouldRace`**: Redundant with position features
- **`estimatedTurnsLeft`**: Too speculative

### Granularity Problems
- **`handSize` with 4 buckets**: Binary (small/large) sufficient
- **Individual crime with 3 buckets**: Binary (audit-worthy or not)

## Critical Feature Interactions

### The Audit Track Cascade
```
auditTrack × wouldTriggerExternal × playersNearExternal
```
At track 4, even safe plays become dangerous. The `playersNearExternal` feature captures the risk of someone else triggering.

### The ROI Decision
```
auditROI = maxHangingValue / myAuditHandValue
```
This single ratio captures the audit decision better than tracking components separately.

### The Desperation Play
```
(pointsBehindLeader > 30) × isEndgame × canPlayDangerous
```
When far behind in endgame with 27+ option, the AI learns to take calculated risks.

## What Makes This System Superior

### 1. **Threshold Focus**
Instead of continuous values, we use bucketed ranges that let the AI learn what matters:
- Score buckets: [100, 200] - AI learns when transitions matter
- Crime buckets: [15, 30, 50] - AI discovers audit-worthy levels
- Raw 27 = danger line (this IS hardcoded in game rules)
- Track 4 = external risk (also game rule)

### 2. **Let AI Learn Thresholds**
We provide bucketed ranges and let the AI discover what's "audit-worthy" through training, not impose our opinions.

### 3. **ROI Over Absolutes**
Profit/cost ratio matters more than absolute values. A 10-point profit on 5-point cost (ROI=2) beats 15-point profit on 20-point cost (ROI=0.75).

### 4. **Cascade Awareness**
New features like `playersNearExternal` capture multi-player dynamics that individual features miss.

## Training Implications

### Faster Convergence
- 25 features vs 35 = smaller state space
- Binary discretization = fewer unique states
- Clearer signals = faster learning

### Better Generalization
- Less overfitting to noise
- Focus on strategic thresholds
- Transferable patterns

### Interpretability
Each feature has clear strategic meaning. We can explain WHY the AI makes decisions.

## Validation Metrics

After implementing this system, we should see:
1. **Higher audit rates** (10-20% vs current 0%)
2. **Better 27-threshold awareness** (fewer accidental spikes)
3. **Smarter ROI-based audits** (not just "crime exists")
4. **Faster training** (convergence in fewer episodes)

## Conclusion

This 25-feature system captures the TRUE strategic depth of Rheinhessen while eliminating noise. Every feature directly impacts win probability through clear causal chains. The system is both more sophisticated (ROI thinking, cascade risk) and simpler (binary thresholds, coarse buckets) than the original.

The key insight: **Games are won by making correct decisions at critical thresholds, not by tracking every detail.**
