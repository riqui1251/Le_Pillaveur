/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { Player } from '@/lib/players';

// Style CSS pour les différentes animations de dégradé
export const specialPlayerNameStyle = `
  @keyframes gradientFlow {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }
  
  /* Effet rouge */
  .special-player-name-red {
    background: linear-gradient(90deg, #ff0000, #ff6b6b, #ff0000);
    background-size: 200% auto;
    color: transparent;
    -webkit-background-clip: text;
    background-clip: text;
    animation: gradientFlow 3s linear infinite;
    font-weight: bold;
    text-shadow: 0 0 5px rgba(255, 0, 0, 0.3);
  }
  
  /* Effet bleu */
  .special-player-name-blue {
    background: linear-gradient(90deg, #0066ff, #00ccff, #0066ff);
    background-size: 200% auto;
    color: transparent;
    -webkit-background-clip: text;
    background-clip: text;
    animation: gradientFlow 3s linear infinite;
    font-weight: bold;
    text-shadow: 0 0 5px rgba(0, 102, 255, 0.3);
  }
  
  /* Effet arc-en-ciel */
  .special-player-name-rainbow {
    background: linear-gradient(90deg, #ff0000, #ffa500, #ffff00, #00ff00, #0000ff, #4b0082, #ee82ee, #ff0000);
    background-size: 400% auto;
    color: transparent;
    -webkit-background-clip: text;
    background-clip: text;
    animation: gradientFlow 6s linear infinite;
    font-weight: bold;
    text-shadow: 0 0 5px rgba(255, 255, 255, 0.3);
  }
  
  /* Effet or */
  .special-player-name-gold {
    background: linear-gradient(90deg, #ffd700, #ffcc00, #ffdb58, #ffd700);
    background-size: 200% auto;
    color: transparent;
    -webkit-background-clip: text;
    background-clip: text;
    animation: gradientFlow 3s linear infinite;
    font-weight: bold;
    text-shadow: 0 0 5px rgba(255, 215, 0, 0.5);
  }
  
  /* Effet feu */
  .special-player-name-fire {
    background: linear-gradient(90deg, #ff4500, #ff8c00, #ff4500);
    background-size: 200% auto;
    color: transparent;
    -webkit-background-clip: text;
    background-clip: text;
    animation: gradientFlow 2s linear infinite;
    font-weight: bold;
    text-shadow: 0 0 8px rgba(255, 69, 0, 0.7);
  }
  
  /* Effet néon */
  .special-player-name-neon {
    background: linear-gradient(90deg, #00ff00, #66ff66, #00ff00);
    background-size: 200% auto;
    color: transparent;
    -webkit-background-clip: text;
    background-clip: text;
    animation: gradientFlow 3s linear infinite;
    font-weight: bold;
    text-shadow: 0 0 10px rgba(0, 255, 0, 0.8);
  }
  
  /* Effet émeraude */
  .special-player-name-emerald {
    background: linear-gradient(90deg, #50c878, #00a86b, #2e8b57, #50c878);
    background-size: 200% auto;
    color: transparent;
    -webkit-background-clip: text;
    background-clip: text;
    animation: gradientFlow 3s linear infinite;
    font-weight: bold;
    text-shadow: 0 0 5px rgba(80, 200, 120, 0.3);
  }
  
  /* Effet violet */
  .special-player-name-purple {
    background: linear-gradient(90deg, #800080, #9370db, #ba55d3, #800080);
    background-size: 200% auto;
    color: transparent;
    -webkit-background-clip: text;
    background-clip: text;
    animation: gradientFlow 3s linear infinite;
    font-weight: bold;
    text-shadow: 0 0 5px rgba(128, 0, 128, 0.3);
  }
  
  /* Effet cyber */
  .special-player-name-cyber {
    background: linear-gradient(90deg, #00ffff, #ff00ff, #00ffff);
    background-size: 200% auto;
    color: transparent;
    -webkit-background-clip: text;
    background-clip: text;
    animation: gradientFlow 3s linear infinite;
    font-weight: bold;
    text-shadow: 0 0 5px rgba(0, 255, 255, 0.3);
  }
  
  /* Fallback styles pour les appareils qui ne supportent pas background-clip */
  @supports not (background-clip: text) {
    .special-player-name-red { color: #ff0000; }
    .special-player-name-blue { color: #0066ff; }
    .special-player-name-rainbow { color: #ff00ff; }
    .special-player-name-gold { color: #ffd700; }
    .special-player-name-fire { color: #ff4500; }
    .special-player-name-neon { color: #00ff00; }
    .special-player-name-emerald { color: #50c878; }
    .special-player-name-purple { color: #800080; }
    .special-player-name-cyber { color: #00ffff; }
  }
`;

// Fonction pour vérifier si un joueur est spécial (Sim ou Riqui ou a l'effet spécial activé)
export const isSpecialPlayer = (player: any): boolean => {
  // Si on reçoit juste une chaîne de caractères (nom du joueur)
  if (typeof player === 'string') {
    const name = player.toLowerCase();
    return name === 'sim' || name === 'riqui';
  }
  
  // Si le joueur a explicitement activé l'effet spécial dans ses préférences
  if (player?.preferences?.specialEffect) {
    return true;
  }
  
  // Sinon, vérifier si c'est un des noms spéciaux par défaut
  const name = player?.name?.toLowerCase?.();
  return name === 'sim' || name === 'riqui';
};

// Fonction pour obtenir la classe CSS de l'effet spécial
export const getSpecialEffectClass = (player: any): string => {
  // Si on reçoit juste une chaîne de caractères (nom du joueur)
  if (typeof player === 'string') {
    const name = player.toLowerCase();
    if (name === 'sim' || name === 'riqui') {
      return 'special-player-name-red'; // Effet par défaut pour Sim et Riqui
    }
    return '';
  }
  
  // Si le joueur a un effet spécial spécifique
  if (player?.preferences?.specialEffect) {
    const effect = player.preferences.specialEffect as 'red' | 'blue' | 'rainbow' | 'gold' | 'fire' | 'neon' | 'emerald' | 'purple' | 'cyber';
    return `special-player-name-${effect}`;
  }
  
  // Pour les joueurs spéciaux par défaut (Sim ou Riqui)
  const name = player?.name?.toLowerCase?.();
  if (name === 'sim' || name === 'riqui') {
    return 'special-player-name-red'; // Effet par défaut pour Sim et Riqui
  }
  
  return '';
};

interface PlayerNameProps {
  player: Player | string | any;
  className?: string;
}

export function PlayerName({ player, className = '' }: PlayerNameProps) {
  // Obtenir la classe d'effet spécial si applicable
  const effectClass = getSpecialEffectClass(player);
  
  // Obtenir le nom du joueur
  const playerName = typeof player === 'string' ? player : player?.name;
  
  return (
    <>
      <style jsx>{specialPlayerNameStyle}</style>
      <span className={`${effectClass} ${className}`}>
        {playerName}
      </span>
    </>
  );
}

// Composant pour appliquer le style global des effets spéciaux
export function PlayerEffectsProvider() {
  return <style jsx global>{specialPlayerNameStyle}</style>;
} 