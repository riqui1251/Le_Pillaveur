"use client";

import React, { createContext, useContext, ReactNode } from 'react';
import { specialPlayerNameStyle } from '../ui/PlayerName';

// Type du contexte
type PlayerEffectsContextType = {
  isEffectsEnabled: boolean;
};

// Création du contexte
const PlayerEffectsContext = createContext<PlayerEffectsContextType>({
  isEffectsEnabled: true,
});

// Hook personnalisé pour utiliser le contexte
export const usePlayerEffects = () => useContext(PlayerEffectsContext);

// Props du provider
interface PlayerEffectsProviderProps {
  children: ReactNode;
}

// Provider pour les effets des joueurs
export function PlayerEffectsProvider({ children }: PlayerEffectsProviderProps) {
  // Par défaut, les effets sont activés
  const isEffectsEnabled = true;

  return (
    <PlayerEffectsContext.Provider value={{ isEffectsEnabled }}>
      {/* Style global pour les effets spéciaux des joueurs */}
      <style jsx global>{specialPlayerNameStyle}</style>
      {children}
    </PlayerEffectsContext.Provider>
  );
} 