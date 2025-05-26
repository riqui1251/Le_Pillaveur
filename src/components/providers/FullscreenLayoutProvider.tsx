"use client"

import React, { createContext, useContext } from 'react';
import { useFullscreenLayout } from '@/hooks/useFullscreenLayout';

interface FullscreenLayoutContextType {
  isFullscreen: boolean;
}

const FullscreenLayoutContext = createContext<FullscreenLayoutContextType | undefined>(undefined);

export const useFullscreenLayoutContext = () => {
  const context = useContext(FullscreenLayoutContext);
  if (context === undefined) {
    throw new Error('useFullscreenLayoutContext must be used within a FullscreenLayoutProvider');
  }
  return context;
};

export const FullscreenLayoutProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isFullscreen } = useFullscreenLayout();

  return (
    <FullscreenLayoutContext.Provider value={{ isFullscreen }}>
      {children}
    </FullscreenLayoutContext.Provider>
  );
}; 