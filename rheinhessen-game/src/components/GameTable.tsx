import React, { useEffect, useRef, useCallback } from 'react';
import useGameStore from '../store/gameStore';
import type { Card } from '../engine/types';

const CARD_WIDTH = 60;
const CARD_HEIGHT = 84;
const TABLE_SIZE = 640;
const HAND_AREA_HEIGHT = 140;

export function GameTable() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const match = useGameStore(state => state.match);
  const selectedCards = useGameStore(state => state.selectedCards);
  const selectCard = useGameStore(state => state.selectCard);
  const deselectCard = useGameStore(state => state.deselectCard);
  
  const drawCard = (ctx: CanvasRenderingContext2D, card: Card, x: number, y: number, selected = false, inHand = false) => {
    // Card shadow
    if (selected || inHand) {
      ctx.shadowColor = selected ? 'rgba(212, 175, 55, 0.5)' : 'rgba(0, 0, 0, 0.3)';
      ctx.shadowBlur = selected ? 20 : 10;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = selected ? -4 : 4;
    }
    
    // Card background gradient
    const gradient = ctx.createLinearGradient(x, y, x, y + CARD_HEIGHT);
    if (selected) {
      gradient.addColorStop(0, '#fef3c7');
      gradient.addColorStop(1, '#fbbf24');
    } else {
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(1, '#f3f4f6');
    }
    
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, CARD_WIDTH, CARD_HEIGHT);
    
    // Reset shadow for border
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    
    // Premium border
    ctx.strokeStyle = selected ? '#d4af37' : '#374151';
    ctx.lineWidth = selected ? 3 : 2;
    ctx.strokeRect(x, y, CARD_WIDTH, CARD_HEIGHT);
    
    // Inner border highlight
    if (selected) {
      ctx.strokeStyle = 'rgba(212, 175, 55, 0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 3, y + 3, CARD_WIDTH - 6, CARD_HEIGHT - 6);
    }
    
    // Rank and suit
    const isRed = card.s === 'H' || card.s === 'D';
    ctx.fillStyle = isRed ? '#dc2626' : '#111827';
    
    const rankStr = card.r <= 10 ? card.r.toString() : 
                    card.r === 11 ? 'J' : 
                    card.r === 12 ? 'Q' : 
                    card.r === 13 ? 'K' : 'A';
    const suitStr = card.s === 'S' ? '♠' : 
                    card.s === 'H' ? '♥' : 
                    card.s === 'D' ? '♦' : '♣';
    
    // Top left rank
    ctx.font = 'bold 20px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(rankStr, x + 6, y + 6);
    
    // Top left suit
    ctx.font = '18px serif';
    ctx.fillText(suitStr, x + 6, y + 28);
    
    // Center suit (larger)
    ctx.font = '36px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isRed ? 'rgba(220, 38, 38, 0.2)' : 'rgba(17, 24, 39, 0.15)';
    ctx.fillText(suitStr, x + CARD_WIDTH / 2, y + CARD_HEIGHT / 2);
    
    // Bottom right (inverted)
    ctx.save();
    ctx.translate(x + CARD_WIDTH - 6, y + CARD_HEIGHT - 6);
    ctx.rotate(Math.PI);
    
    ctx.fillStyle = isRed ? '#dc2626' : '#111827';
    ctx.font = 'bold 20px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(rankStr, 0, 0);
    
    ctx.font = '18px serif';
    ctx.fillText(suitStr, 0, 22);
    ctx.restore();
  };
  
  const drawMiniCard = (ctx: CanvasRenderingContext2D, card: Card, x: number, y: number) => {
    // Mini card for factory floor display
    const width = 26;
    const height = 36;
    
    // Card background
    const gradient = ctx.createLinearGradient(x, y, x, y + height);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(1, '#e5e7eb');
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, width, height);
    
    // Border
    ctx.strokeStyle = '#6b7280';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);
    
    // Content
    const rankStr = card.r <= 10 ? card.r.toString() : 
                    card.r === 11 ? 'J' : 
                    card.r === 12 ? 'Q' : 
                    card.r === 13 ? 'K' : 'A';
    const suitStr = card.s === 'S' ? '♠' : 
                    card.s === 'H' ? '♥' : 
                    card.s === 'D' ? '♦' : '♣';
    
    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = (card.s === 'H' || card.s === 'D') ? '#dc2626' : '#111827';
    ctx.fillText(rankStr, x + width/2, y + height/2 - 6);
    
    ctx.font = '12px serif';
    ctx.fillText(suitStr, x + width/2, y + height/2 + 6);
  };
  
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !match) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear with gradient background
    const bgGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    bgGradient.addColorStop(0, '#0f1523');
    bgGradient.addColorStop(1, '#1a2234');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw premium table felt
    const tableGradient = ctx.createRadialGradient(
      canvas.width/2, canvas.height/2, 100,
      canvas.width/2, canvas.height/2, TABLE_SIZE/2
    );
    tableGradient.addColorStop(0, '#065f46');
    tableGradient.addColorStop(0.7, '#064e3b');
    tableGradient.addColorStop(1, '#022c22');
    
    ctx.fillStyle = tableGradient;
    ctx.fillRect(50, 50, TABLE_SIZE, TABLE_SIZE);
    
    // Table border with gold accent
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 3;
    ctx.strokeRect(50, 50, TABLE_SIZE, TABLE_SIZE);
    
    // Inner table border
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(55, 55, TABLE_SIZE - 10, TABLE_SIZE - 10);
    
    // Center decoration
    ctx.beginPath();
    ctx.arc(canvas.width/2, TABLE_SIZE/2 + 50, 60, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.1)';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Draw deck with count
    const deckX = canvas.width/2 - 30;
    const deckY = TABLE_SIZE/2 + 20;
    
    // Deck cards (stacked effect)
    for (let i = 0; i < Math.min(3, match.deck.length); i++) {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(deckX - i*2, deckY - i*2, CARD_WIDTH, CARD_HEIGHT);
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1;
      ctx.strokeRect(deckX - i*2, deckY - i*2, CARD_WIDTH, CARD_HEIGHT);
    }
    
    // Deck count
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(match.deck.length.toString(), deckX + CARD_WIDTH/2, deckY + CARD_HEIGHT/2);
    
    ctx.font = '12px Inter, sans-serif';
    ctx.fillStyle = '#9ca3af';
    ctx.fillText('DECK', deckX + CARD_WIDTH/2, deckY + CARD_HEIGHT + 20);
    
    // Player positions with premium styling
    const positions = [
      { x: TABLE_SIZE/2 + 50, y: TABLE_SIZE + 80, align: 'bottom' }, // Human
      { x: 70, y: TABLE_SIZE/2 + 50, align: 'left' },                // Left
      { x: TABLE_SIZE/2 + 50, y: 70, align: 'top' },                 // Top
      { x: TABLE_SIZE + 30, y: TABLE_SIZE/2 + 50, align: 'right' }   // Right
    ];
    
    match.players.forEach((player, idx) => {
      const pos = positions[idx];
      const isCurrent = idx === match.turnIdx;
      
      // Player panel background
      if (isCurrent) {
        const glowGradient = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, 80);
        glowGradient.addColorStop(0, 'rgba(212, 175, 55, 0.2)');
        glowGradient.addColorStop(1, 'transparent');
        ctx.fillStyle = glowGradient;
        ctx.fillRect(pos.x - 100, pos.y - 40, 200, 80);
      }
      
      // Player info panel
      ctx.fillStyle = 'rgba(30, 38, 56, 0.8)';
      ctx.fillRect(pos.x - 70, pos.y - 25, 140, 50);
      
      ctx.strokeStyle = isCurrent ? '#d4af37' : '#4b5563';
      ctx.lineWidth = isCurrent ? 2 : 1;
      ctx.strokeRect(pos.x - 70, pos.y - 25, 140, 50);
      
      // Player name
      ctx.fillStyle = player.persona === 'Human' ? '#d4af37' : '#ffffff';
      ctx.font = `${isCurrent ? 'bold' : 'normal'} 14px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(player.name, pos.x, pos.y - 10);
      
      // Score with styling
      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 20px Inter, sans-serif';
      ctx.fillText(player.score.toString(), pos.x, pos.y + 10);
      
      // Hand count badge
      ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
      ctx.fillRect(pos.x - 65, pos.y - 20, 30, 18);
      ctx.fillStyle = '#3b82f6';
      ctx.font = '11px Inter, sans-serif';
      ctx.fillText(`H:${player.hand.length}`, pos.x - 50, pos.y - 11);
      
      // Factory floor cards
      if (player.floorGroups && player.floorGroups.length > 0) {
        const floorY = idx === 0 ? pos.y - 100 : 
                      idx === 2 ? pos.y + 40 : 
                      pos.y - 10;
        
        let totalWidth = 0;
        player.floorGroups.forEach(group => {
          totalWidth += group.length * 28 + 8;
        });
        totalWidth -= 8;
        
        let currentX = pos.x - totalWidth/2;
        
        player.floorGroups.forEach((group) => {
          // Group background
          ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
          ctx.fillRect(currentX - 2, floorY - 2, group.length * 28 + 4, 40);
          
          group.forEach((card, cardIdx) => {
            drawMiniCard(ctx, card, currentX + cardIdx * 28, floorY);
          });
          
          currentX += group.length * 28 + 8;
        });
        
        // Crime value display
        const totalRaw = player.floor.reduce((sum, card) => {
          const value = card.r <= 10 ? card.r : card.r === 14 ? 11 : 10;
          return sum + value;
        }, 0);
        
        ctx.fillStyle = totalRaw >= 40 ? '#ef4444' : totalRaw >= 25 ? '#f59e0b' : '#10b981';
        ctx.font = 'bold 12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`Crime: ${totalRaw}`, pos.x, floorY + 50);
      }
    });
    
    // Draw human hand with premium cards
    const humanPlayer = match.players[0];
    const handY = canvas.height - HAND_AREA_HEIGHT;
    const cardSpacing = Math.min(CARD_WIDTH + 10, (canvas.width - 100) / humanPlayer.hand.length);
    const totalWidth = cardSpacing * (humanPlayer.hand.length - 1) + CARD_WIDTH;
    const startX = (canvas.width - totalWidth) / 2;
    
    humanPlayer.hand.forEach((card, idx) => {
      const x = startX + idx * cardSpacing;
      const isSelected = selectedCards.some(c => c.id === card.id);
      const y = isSelected ? handY - 15 : handY;
      drawCard(ctx, card, x, y, isSelected, true);
    });
  }, [match, selectedCards]);
  
  useEffect(() => {
    draw();
  }, [draw]);
  
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!match) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const humanPlayer = match.players[0];
    const handY = canvas.height - HAND_AREA_HEIGHT;
    const cardSpacing = Math.min(CARD_WIDTH + 10, (canvas.width - 100) / humanPlayer.hand.length);
    const totalWidth = cardSpacing * (humanPlayer.hand.length - 1) + CARD_WIDTH;
    const startX = (canvas.width - totalWidth) / 2;
    
    humanPlayer.hand.forEach((card, idx) => {
      const cardX = startX + idx * cardSpacing;
      const isSelected = selectedCards.some(c => c.id === card.id);
      const cardY = isSelected ? handY - 15 : handY;
      
      if (x >= cardX && x <= cardX + CARD_WIDTH && 
          y >= cardY && y <= cardY + CARD_HEIGHT) {
        if (isSelected) {
          deselectCard(card);
        } else {
          selectCard(card);
        }
      }
    });
  };
  
  return (
    <canvas
      ref={canvasRef}
      width={740}
      height={740}
      onClick={handleCanvasClick}
      className="rounded-xl cursor-pointer w-full max-w-[740px]"
      style={{ imageRendering: 'crisp-edges' }}
    />
  );
}