// Fonction pour convertir les classes Tailwind en couleurs CSS
export const getColorFromClass = (colorClass: string): string => {
  if (!colorClass.startsWith('bg-')) return colorClass;
  const colorName = colorClass.substring(3);
  return `var(--${colorName})`;
};

// Fonction pour vérifier si un joueur est spécial (Sim ou Riqui ou a l'effet spécial activé)
export const isSpecialPlayer = (player: any): boolean => {
  // Si le joueur a explicitement activé l'effet spécial dans ses préférences
  if (player?.preferences?.specialEffect) {
    return true;
  }
  
  // Sinon, vérifier si c'est un des noms spéciaux par défaut
  const name = typeof player === 'string' 
    ? player.toLowerCase() 
    : player.name?.toLowerCase();
  return name === 'sim' || name === 'riqui';
};

// Fonction pour obtenir la classe CSS de l'effet spécial
export const getSpecialEffectClass = (player: any): string => {
  // Si le joueur a un effet spécial spécifique
  if (player?.preferences?.specialEffect) {
    const effect = player.preferences.specialEffect as 'fire' | 'ice' | 'lightning' | 'rainbow' | 'neon' | 'galaxy' | 'matrix' | 'sunset' | 'ocean' | 'red' | 'blue' | 'gold' | 'emerald' | 'purple' | 'cyber';
    return `special-player-name-${effect}`;
  }
  
  // Pour les joueurs spéciaux par défaut (Sim ou Riqui)
  const name = typeof player === 'string' 
    ? player.toLowerCase() 
    : player.name?.toLowerCase();
  if (name === 'sim' || name === 'riqui') {
    return 'special-player-name-fire'; // Effet par défaut pour Sim et Riqui
  }
  
  return '';
};

// Fonction pour obtenir le style complet d'un joueur (couleur + effet)
export const getPlayerStyle = (player: any) => {
  return {
    backgroundColor: getColorFromClass(player?.preferences?.color || 'bg-gray-500'),
    effectClass: getSpecialEffectClass(player)
  };
};
