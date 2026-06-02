import { useState, useEffect } from 'react';

// Définir les seuils de taille d'écran
const SCREEN_SIZES = {
  sm: 640,  // Petit mobile
  md: 768,  // Grand mobile / petit tablet
  lg: 1024, // Tablet / petit ordinateur
  xl: 1280, // Ordinateur standard
};

interface ScreenSize {
  width: number;
  height: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isLandscape: boolean;
}

// Valeurs initiales identiques serveur/client pour éviter les erreurs d'hydratation
const INITIAL_SCREEN_SIZE: ScreenSize = {
  width: 1200,
  height: 800,
  isMobile: false,
  isTablet: false,
  isDesktop: true,
  isLandscape: true,
};

export function useScreenSize(): ScreenSize {
  const [screenSize, setScreenSize] = useState<ScreenSize>(INITIAL_SCREEN_SIZE);

  useEffect(() => {
    // Fonction pour mettre à jour les dimensions de l'écran
    const updateDimension = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      setScreenSize({
        width,
        height,
        isMobile: width < SCREEN_SIZES.md,
        isTablet: width >= SCREEN_SIZES.md && width < SCREEN_SIZES.lg,
        isDesktop: width >= SCREEN_SIZES.lg,
        isLandscape: width > height,
      });
    };

    // Exécuter une fois au montage
    updateDimension();

    // Ajouter un listener pour le redimensionnement de la fenêtre
    window.addEventListener('resize', updateDimension);
    
    // Nettoyer le listener au démontage
    return () => {
      window.removeEventListener('resize', updateDimension);
    };
  }, []);

  return screenSize;
}

export default useScreenSize; 