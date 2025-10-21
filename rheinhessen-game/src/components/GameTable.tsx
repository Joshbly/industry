import React, { useEffect, useRef, useCallback } from 'react';
import useGameStore from '../store/gameStore';
import type { Card } from '../engine/types';

const CARD_WIDTH = 50;
const CARD_HEIGHT = 70;
const TABLE_SIZE = 600;
const HAND_AREA_HEIGHT = 120;

export function GameTable() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const match = useGameStore(state => state.match);
  const selectedCards = useGameStore(state => state.selectedCards);
  const selectCard = useGameStore(state => state.selectCard);
  const deselectCard = useGameStore(state => state.deselectCard);
  
  const drawCard = (ctx: CanvasRenderingContext2D, card: Card, x: number, y: number, selected = false) => {
    // Card background
    ctx.fillStyle = selected ? '#fbbf24' : '#ffffff';
    ctx.fillRect(x, y, CARD_WIDTH, CARD_HEIGHT);
    
    // Card border
    ctx.strokeStyle = selected ? '#f59e0b' : '#374151';
    ctx.lineWidth = selected ? 3 : 1;
    ctx.strokeRect(x, y, CARD_WIDTH, CARD_HEIGHT);
    
    // Card content
    ctx.fillStyle = (card.s === 'H' || card.s === 'D') ? '#ef4444' : '#000000';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const rankStr = card.r <= 10 ? card.r.toString() : 
                    card.r === 11 ? 'J' : 
                    card.r === 12 ? 'Q' : 
                    card.r === 13 ? 'K' : 'A';
    const suitStr = card.s === 'S' ? '♠' : 
                    card.s === 'H' ? '♥' : 
                    card.s === 'D' ? '♦' : '♣';
    
    ctx.fillText(rankStr, x + CARD_WIDTH / 2, y + CARD_HEIGHT / 2 - 10);
    ctx.fillText(suitStr, x + CARD_WIDTH / 2, y + CARD_HEIGHT / 2 + 10);
  };
  
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !match) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw table
    ctx.fillStyle = '#065f46';
    ctx.fillRect(50, 50, TABLE_SIZE, TABLE_SIZE);
    
    // Draw audit track with tick information
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Audit Track:', 260, 30);
    
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i < match.auditTrack ? '#dc2626' : '#4b5563';
      ctx.fillRect(350 + i * 25, 15, 20, 20);
      ctx.strokeStyle = '#ffffff';
      ctx.strokeRect(350 + i * 25, 15, 20, 20);
      
      // Show tick number
      if (i < match.auditTrack) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText((i + 1).toString(), 360 + i * 25, 27);
      }
    }
    
    // Warning at high audit levels
    if (match.auditTrack >= 4) {
      ctx.fillStyle = match.auditTrack === 4 ? '#f59e0b' : '#ef4444';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(match.auditTrack === 4 ? '⚠ HIGH RISK' : '⚠ NEXT SPIKE = EXTERNAL!', 480, 27);
    }
    
    // Draw deck count
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(`Deck: ${match.deck.length}`, TABLE_SIZE / 2 + 50, TABLE_SIZE / 2 + 50);
    
    // Draw players
    const positions = [
      { x: TABLE_SIZE / 2 + 50, y: TABLE_SIZE + 60 }, // Bottom (Human)
      { x: 60, y: TABLE_SIZE / 2 + 50 },              // Left
      { x: TABLE_SIZE / 2 + 50, y: 60 },              // Top
      { x: TABLE_SIZE + 40, y: TABLE_SIZE / 2 + 50 }  // Right
    ];
    
    match.players.forEach((player, idx) => {
      const pos = positions[idx];
      
      // Highlight current player
      if (idx === match.turnIdx) {
        ctx.fillStyle = 'rgba(251, 191, 36, 0.3)';
        ctx.fillRect(pos.x - 60, pos.y - 30, 120, 60);
      }
      
      // Player info
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(player.name, pos.x, pos.y - 10);
      ctx.fillText(`Score: ${player.score}`, pos.x, pos.y + 5);
      ctx.fillText(`Hand: ${player.hand.length}`, pos.x, pos.y + 20);
      
      // Show ALL floor cards grouped by production (face-up, public information)
      if (player.floorGroups && player.floorGroups.length > 0) {
        const baseY = idx === 0 ? pos.y - 100 : 
                     idx === 2 ? pos.y + 45 : 
                     pos.y - 25;
        
        // Calculate total width to center
        const groupWidths = player.floorGroups.map(g => g.length * 22 + 5);
        const totalWidth = groupWidths.reduce((a, b) => a + b, 0) - 5;
        let currentX = pos.x - totalWidth / 2;
        
        player.floorGroups.forEach((group) => {
          // Draw group background to show production boundary
          const groupWidth = group.length * 22;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
          ctx.fillRect(currentX - 2, baseY - 2, groupWidth + 4, 34);
          
          group.forEach((card, cardIdx) => {
            const cardX = currentX + cardIdx * 22;
            
            // Draw mini card with visible rank/suit
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(cardX, baseY, 20, 30);
            ctx.strokeStyle = '#374151';
            ctx.lineWidth = 1;
            ctx.strokeRect(cardX, baseY, 20, 30);
            
            // Draw rank and suit (face-up)
            ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            const rankStr = card.r <= 10 ? card.r.toString() : 
                          card.r === 11 ? 'J' : 
                          card.r === 12 ? 'Q' : 
                          card.r === 13 ? 'K' : 'A';
            const suitStr = card.s === 'S' ? '♠' : 
                          card.s === 'H' ? '♥' : 
                          card.s === 'D' ? '♦' : '♣';
            
            ctx.fillStyle = (card.s === 'H' || card.s === 'D') ? '#ef4444' : '#000000';
            ctx.fillText(rankStr, cardX + 10, baseY + 10);
            ctx.font = '10px sans-serif';
            ctx.fillText(suitStr, cardX + 10, baseY + 20);
          });
          
          currentX += groupWidth + 5; // Space between groups
        });
        
        // Show total raw value (crime on factory floor)
        const totalRaw = player.floor.reduce((sum, card) => {
          const value = card.r <= 10 ? card.r : card.r === 14 ? 11 : 10;
          return sum + value;
        }, 0);
        
        // Highlight high crime amounts
        ctx.fillStyle = totalRaw >= 40 ? '#ef4444' : totalRaw >= 25 ? '#f59e0b' : '#ffffff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`Crime: ${totalRaw}`, pos.x, baseY + 40);
        
        // Show if recently audited
        if (player.stats.internalsRecv > 0) {
          ctx.fillStyle = '#f97316';
          ctx.font = '9px sans-serif';
          ctx.fillText(`(Audited ${player.stats.internalsRecv}x)`, pos.x, baseY + 52);
        }
      }
    });
    
    // Draw human hand
    const humanPlayer = match.players[0];
    const handY = canvas.height - HAND_AREA_HEIGHT;
    const totalWidth = humanPlayer.hand.length * (CARD_WIDTH + 5);
    const startX = (canvas.width - totalWidth) / 2;
    
    humanPlayer.hand.forEach((card, idx) => {
      const x = startX + idx * (CARD_WIDTH + 5);
      const isSelected = selectedCards.some(c => c.id === card.id);
      const y = isSelected ? handY - 10 : handY;
      drawCard(ctx, card, x, y, isSelected);
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
    
    // Check if click is on a hand card
    const humanPlayer = match.players[0];
    const handY = canvas.height - HAND_AREA_HEIGHT;
    const totalWidth = humanPlayer.hand.length * (CARD_WIDTH + 5);
    const startX = (canvas.width - totalWidth) / 2;
    
    humanPlayer.hand.forEach((card, idx) => {
      const cardX = startX + idx * (CARD_WIDTH + 5);
      const isSelected = selectedCards.some(c => c.id === card.id);
      const cardY = isSelected ? handY - 10 : handY;
      
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
      width={700}
      height={700}
      onClick={handleCanvasClick}
      className="border border-gray-700 rounded-lg cursor-pointer"
    />
  );
}
