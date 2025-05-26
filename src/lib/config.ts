/**
 * Configuration globale de l'application
 */

export const APP_CONFIG = {
  // Configuration d'affichage
  display: {
    // Désactiver complètement les animations sur mobile pour améliorer les performances
    disableAnimationsOnMobile: true,
    
    // Utiliser des versions simplifiées des composants sur mobile
    useSimplifiedComponentsOnMobile: true,
    
    // Optimiser l'utilisation de la mémoire sur mobile
    optimizeMemoryUsage: true,
    
    // Réduire le nombre d'effets visuels sur mobile
    reduceVisualEffectsOnMobile: true
  },
  
  // Configuration des performances
  performance: {
    // Limiter les transformations CSS sur mobile
    limitCSSTransforms: true,
    
    // Eviter les gradients complexes sur mobile
    avoidComplexGradients: true,
    
    // Réduire la qualité des animations sur mobile pour améliorer les performances
    reducedMotionQuality: true
  },
  
  // Configuration de compatibilité
  compatibility: {
    // Polyfills à charger pour les navigateurs qui ne supportent pas certaines fonctionnalités
    loadPolyfills: true,
    
    // Utiliser des fallbacks pour les fonctionnalités non supportées
    useFallbacks: true,
    
    // Liste des fonctionnalités qui posent problème sur certains navigateurs
    problematicFeatures: [
      'background-clip: text',
      'complex animations',
      'framer-motion on old devices',
      'css variables in some contexts'
    ]
  }
};

/**
 * Obtenir une configuration adaptée au contexte du navigateur
 */
export const getContextAwareConfig = (isMobile: boolean, isLimitedBrowser: boolean) => {
  // Copie de la configuration de base
  const config = { ...APP_CONFIG };
  
  // Si on est sur mobile ou un navigateur limité, on force certaines options
  if (isMobile || isLimitedBrowser) {
    config.display.disableAnimationsOnMobile = true;
    config.display.useSimplifiedComponentsOnMobile = true;
    config.performance.limitCSSTransforms = true;
    config.performance.avoidComplexGradients = true;
  }
  
  return config;
};

export default APP_CONFIG; 