"use client"

import React, { createContext, useContext, useEffect, useState } from 'react';
import { detectBrowserCapabilities } from '@/lib/browser-support';
import { getContextAwareConfig } from '@/lib/config';

// Type pour les capacités du navigateur
export type BrowserCapabilities = {
  advancedAnimations: boolean;
  backgroundClipText: boolean;
  isMobile: boolean;
  isLimitedBrowser: boolean;
};

// Type pour la configuration
export type AppConfig = {
  display: {
    disableAnimationsOnMobile: boolean;
    useSimplifiedComponentsOnMobile: boolean;
    optimizeMemoryUsage: boolean;
    reduceVisualEffectsOnMobile: boolean;
  };
  performance: {
    limitCSSTransforms: boolean;
    avoidComplexGradients: boolean;
    reducedMotionQuality: boolean;
  };
  compatibility: {
    loadPolyfills: boolean;
    useFallbacks: boolean;
    problematicFeatures: string[];
  };
};

// Type pour le contexte
type BrowserCapabilitiesContextType = {
  capabilities: BrowserCapabilities;
  config: AppConfig;
  isReady: boolean;
};

// Valeurs par défaut (côté serveur)
const defaultCapabilities: BrowserCapabilities = {
  advancedAnimations: false,
  backgroundClipText: false,
  isMobile: false,
  isLimitedBrowser: false
};

// Création du contexte
const BrowserCapabilitiesContext = createContext<BrowserCapabilitiesContextType>({
  capabilities: defaultCapabilities,
  config: {} as AppConfig,
  isReady: false
});

// Hook pour utiliser les capacités du navigateur
export const useBrowserCapabilities = () => useContext(BrowserCapabilitiesContext);

// Fournisseur de capacités du navigateur
export function BrowserCapabilitiesProvider({ children }: { children: React.ReactNode }) {
  const [capabilities, setCapabilities] = useState<BrowserCapabilities>(defaultCapabilities);
  const [config, setConfig] = useState<AppConfig>({} as AppConfig);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Détecter les capacités du navigateur directement
    const detectedCapabilities = detectBrowserCapabilities();
    setCapabilities(detectedCapabilities);
    
    // Obtenir la configuration adaptée
    const contextConfig = getContextAwareConfig(
      detectedCapabilities.isMobile,
      detectedCapabilities.isLimitedBrowser
    );
    setConfig(contextConfig as AppConfig);
    
    // Injecter des classes CSS pour les capacités du navigateur APRÈS l'hydratation
    // en utilisant requestAnimationFrame pour s'assurer que le navigateur a terminé le processus d'hydratation
    requestAnimationFrame(() => {
      const htmlElement = document.documentElement;
      
      if (detectedCapabilities.isMobile) {
        htmlElement.classList.add('is-mobile-device');
      }
      
      if (detectedCapabilities.isLimitedBrowser) {
        htmlElement.classList.add('is-limited-browser');
      }
      
      if (!detectedCapabilities.advancedAnimations) {
        htmlElement.classList.add('no-advanced-animations');
      }
      
      if (!detectedCapabilities.backgroundClipText) {
        htmlElement.classList.add('no-background-clip');
      }
      
      // Marquer comme prêt
      setIsReady(true);
    });
  }, []);

  return (
    <BrowserCapabilitiesContext.Provider value={{ capabilities, config, isReady }}>
      {children}
    </BrowserCapabilitiesContext.Provider>
  );
} 