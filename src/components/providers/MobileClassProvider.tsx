"use client";

import { useEffect } from 'react';

/**
 * Composant qui s'assure que les classes CSS pour mobile sont appliquées
 * Ce composant ne rend rien visuellement, il modifie juste le DOM pour ajouter les classes nécessaires
 */
export function MobileClassProvider() {
  // Suppression de l'état isMounted non utilisé
  
  useEffect(() => {
    // Nous laissons BrowserCapabilitiesProvider gérer la détection mobile
    // Ce composant ne fait plus rien pour éviter les conflits
    
    // Note: Si vous avez besoin de fonctionnalités spécifiques qui ne sont pas dans 
    // BrowserCapabilitiesProvider, vous pouvez les ajouter ici
  }, []);
  
  // Ne rend rien visuellement
  return null;
}

export default MobileClassProvider; 