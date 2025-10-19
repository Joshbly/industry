import type { Card as CardType } from '../engine/types';

interface CardProps {
  card: CardType;
  selected?: boolean;
  onClick?: () => void;
  size?: 'small' | 'medium' | 'large';
  faceUp?: boolean;
  stacked?: boolean;
  stackIndex?: number;
}

export function Card({ 
  card, 
  selected = false, 
  onClick, 
  size = 'medium',
  faceUp = true,
  stacked = false,
  stackIndex = 0
}: CardProps) {
  const rankDisplay = card.r <= 10 ? card.r.toString() : 
                      card.r === 11 ? 'J' : 
                      card.r === 12 ? 'Q' : 
                      card.r === 13 ? 'K' : 'A';
  
  const suitDisplay = card.s === 'S' ? '♠' : 
                      card.s === 'H' ? '♥' : 
                      card.s === 'D' ? '♦' : '♣';
  
  const isRed = card.s === 'H' || card.s === 'D';
  
  const sizeClasses = {
    small: 'w-12 h-16 text-xs',
    medium: 'w-16 h-24 text-sm',
    large: 'w-20 h-28 text-base'
  };
  
  const stackOffset = stacked ? stackIndex * 20 : 0;
  
  return (
    <div
      onClick={onClick}
      style={stacked ? { 
        transform: `translateX(${stackOffset}px)`,
        zIndex: stackIndex 
      } : undefined}
      className={`
        ${sizeClasses[size]}
        ${selected ? 'ring-2 ring-yellow-400 shadow-xl -translate-y-2' : ''}
        ${onClick ? 'cursor-pointer hover:shadow-lg transition-all' : ''}
        ${stacked ? 'absolute' : 'relative'}
        bg-white rounded-lg border-2 border-gray-800
        flex flex-col items-center justify-center
        shadow-md
      `}
    >
      {faceUp ? (
        <>
          <div className={`font-bold ${isRed ? 'text-red-600' : 'text-black'}`}>
            {rankDisplay}
          </div>
          <div className={`text-2xl ${isRed ? 'text-red-600' : 'text-black'}`}>
            {suitDisplay}
          </div>
        </>
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-blue-900 to-blue-700 rounded-md" />
      )}
    </div>
  );
}
