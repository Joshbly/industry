# Anti-Leader Collusion System 🎯

## Overview
The AI learns to gang up on whoever is approaching victory (300 points) through progressive reward incentives that create emergent collusion behavior.

## Progressive Urgency Levels

### 🟢 **WATCH MODE** (225-249 points)
- Leader is gaining momentum
- AIs start paying attention
- Normal audit thresholds apply

### 🟡 **THREAT MODE** (250-274 points)
- **+250 bonus** for auditing the leader
- Lower audit thresholds (accept small losses)
- Crime requirement drops to 10+

### 🔴 **PANIC MODE** (275-289 points)
- **+400 bonus** for auditing the leader
- Very low audit thresholds (accept moderate losses)
- Crime requirement drops to 5+
- Will audit even at ROI of -3

### 🚨 **EMERGENCY MODE** (290-299 points)
- **+600 bonus** for auditing the leader
- ALWAYS consider audit if holding trips
- No crime requirement - pure prevention
- Message: "STOP THEM AT ALL COSTS!"

## Coordination Bonuses

### 🤝 **Follow-up Attack** (+100)
When an AI audits someone who was recently audited by another AI, they get a coordination bonus for joining the assault.

### ⚔️ **Pile On** (+150)
When 3+ AIs audit the same target within a few turns, they all get the "pile on" bonus for effective gang tactics.

### 💥 **Prevention Bonus** (+300)
Extra reward for dropping a leader's score by 15+ points when they're at 270+ points.

## How It Works

1. **Detection**: Every AI constantly monitors who's leading and their score
2. **Urgency Calculation**: As leader approaches 300, audit thresholds drop exponentially
3. **Target Selection**: `bestAuditTarget` prioritizes the leader when they're threatening
4. **Coordination**: AIs learn that attacking together is more rewarding than solo attempts
5. **Emergent Behavior**: Without explicit communication, AIs learn to collude naturally

## Example Scenarios

### Scenario 1: Leader at 285 Points
```
Leader: 285 points, 30 crime on floor
AI-1: Holds K-K-K (worth 39)
AI-2: Holds 5-5-5 (worth 15)
AI-3: No trips

Result:
- AI-1 audits for +600 (emergency) +150 (base) +300 (prevention) = +1050 reward!
- AI-2 follows up for +600 +150 +100 (follow-up) = +850 reward!
- Leader drops from 285 to ~240
- Victory prevented!
```

### Scenario 2: Gang Assault
```
Turn 1: AI-1 audits leader at 275 (crime: 25)
Turn 2: AI-2 audits leader at 265 (crime: 15)
Turn 3: AI-3 audits leader at 250 (crime: 20)

Each AI gets:
- Base audit rewards
- Progressive urgency bonuses
- +100 follow-up (AI-2, AI-3)
- +150 pile-on (all three)
- Leader utterly destroyed!
```

## Training Impact

After ~500 episodes, AIs learn:
1. **Save cheap trips** for emergency audits
2. **Monitor leader score** constantly
3. **Accept audit losses** when leader threatens victory
4. **Coordinate attacks** without explicit communication
5. **Prioritize prevention** over personal gain when necessary

## Human Player Warning ⚠️

This system applies to HUMAN players too! If you're leading and approaching 300:
- AIs will increasingly focus on you
- They'll accept losing audits just to slow you down
- Multiple AIs may audit you in succession
- Your crime tolerance drops to nearly zero at 275+

## Configuration

In `learning.ts`:
```typescript
collusionAudit250: 250,  // Adjust for earlier/later intervention
collusionAudit275: 400,  // Increase for more aggressive mid-game
collusionAudit290: 600,  // Emergency multiplier
followupAudit: 100,       // Coordination reward
pileOn: 150,              // Gang bonus
```

## Observed Behaviors

After training, AIs exhibit:
- **Sacrifice plays**: Taking -20 point audits to stop a 290+ leader
- **Trip hoarding**: Keeping 3-3-3 instead of playing for audit ammunition
- **Leader targeting**: 80%+ of audits target the score leader
- **Cascade attacks**: One audit triggers others to join
- **Emergency response**: Near 100% audit rate when leader hits 290+

## The Math

Expected value calculation changes with leader score:
```
Normal:     EV = (Fine - Cost) = Profit focus
At 250:     EV = (Fine - Cost) + 250 = Prevention valued
At 275:     EV = (Fine - Cost) + 400 = Heavy prevention
At 290:     EV = (Fine - Cost) + 600 = STOP AT ALL COSTS
```

This creates a **non-linear urgency curve** that ensures games stay competitive until the end!
