/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { Player } from '@/lib/players';
import { isSpecialPlayer, getSpecialEffectClass } from '@/lib/playerUtils';

// Ré-exporter les fonctions pour la compatibilité
export { isSpecialPlayer, getSpecialEffectClass };

interface PlayerNameProps {
  player: Player | string | any;
  className?: string;
}

export function PlayerName({ player, className = '' }: PlayerNameProps) {
  // Obtenir la classe d'effet spécial si applicable
  const effectClass = getSpecialEffectClass(player);
  
  // Obtenir le nom du joueur
  const playerName = typeof player === 'string' ? player : player?.name;
  
  // Utiliser la classe par défaut si aucun effet spécial
  const finalClass = effectClass || 'player-name-default';
  
  return (
    <span className={`${finalClass} ${className}`}>
      {playerName}
    </span>
  );
} 