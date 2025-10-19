export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14; // 11=J, 12=Q, 13=K, 14=A

export interface Card {
  id: string;
  r: Rank;
  s: Suit;
  d: 0 | 1 | 2 | 3; // deck index
}

export interface PlayerState {
  id: number;
  name: string;
  persona: 'Human' | 'Aggro' | 'Balanced' | 'Conservative' | 'Opportunist';
  hand: Card[];
  floor: Card[];
  floorGroups: Card[][]; // Track production groups
  score: number;
  stats: {
    legal: number;
    illegal: number;
    spikes: number;
    internalsDone: number;
    internalsRecv: number;
  };
}

export interface MatchState {
  players: PlayerState[];
  deck: Card[];
  discard: Card[];
  auditTrack: number;
  turnIdx: number;
  endRoundSeat?: number; // seat index when deck-out first detected
  winnerId?: number; // when set, match is over
  options: {
    targetScore: number;
    escalating: boolean;
  };
}

export type HandType = 'pair' | 'two-pair' | 'trips' | 'straight' | 'flush' | 'full-house' | 'quads' | 'straight-flush';

export interface EvaluatedHand {
  cards: Card[];
  type: HandType | 'illegal';
  raw: number;
  taxed: number;
  points: number;
}

export interface ProductionResult {
  points: number;
  ticksAdded: number;
  kickback: number;
}
