import { Card } from './Card';
import type { Card as CardType } from '../engine/types';

interface HandAreaProps {
  cards: CardType[];
  selectedCards: CardType[];
  onCardClick: (card: CardType) => void;
}

export function HandArea({ cards, selectedCards, onCardClick }: HandAreaProps) {
  const isSelected = (card: CardType) => 
    selectedCards.some(c => c.id === card.id);
  
  return (
    <div className="bg-gradient-to-b from-gray-900 to-gray-800 rounded-t-2xl p-6 shadow-2xl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-bold text-lg">Your Hand</h3>
        <div className="text-gray-400 text-sm">
          {selectedCards.length > 0 && (
            <span className="text-yellow-400 font-semibold">
              {selectedCards.length} selected
            </span>
          )}
        </div>
      </div>
      
      <div className="flex justify-center items-end gap-2 min-h-[120px]">
        {cards.length === 0 ? (
          <div className="text-gray-500 italic">No cards in hand</div>
        ) : (
          cards.map((card, idx) => (
            <div
              key={card.id}
              className={`
                transition-all duration-200 ease-out
                ${isSelected(card) ? 'transform -translate-y-4' : 'hover:-translate-y-2'}
              `}
              style={{
                zIndex: idx,
                marginLeft: idx === 0 ? 0 : '-20px'
              }}
            >
              <Card
                card={card}
                selected={isSelected(card)}
                onClick={() => onCardClick(card)}
                size="large"
                faceUp={true}
              />
            </div>
          ))
        )}
      </div>
      
      {/* Card Count Indicator */}
      <div className="mt-4 text-center text-xs text-gray-500">
        {cards.length} cards • Click to select for production
      </div>
    </div>
  );
}
