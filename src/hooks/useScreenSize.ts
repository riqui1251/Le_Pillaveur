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
}

export function useScreenSize(): ScreenSize {
  // Initialiser avec une taille par défaut pour éviter les erreurs SSR
  const [screenSize, setScreenSize] = useState<ScreenSize>({
    width: typeof window !== 'undefined' ? window.innerWidth : 1200,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
    isMobile: false,
    isTablet: false,
    isDesktop: true,
  });

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