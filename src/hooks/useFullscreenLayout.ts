import { useEffect } from 'react';
import { useFullscreen } from './useFullscreen';

export const useFullscreenLayout = () => {
  const { isFullscreen } = useFullscreen();

  useEffect(() => {
    // Fonction pour appliquer les styles de centrage
    const applyFullscreenStyles = () => {
      const html = document.documentElement;
      const body = document.body;
      const container = document.querySelector('.fullscreen-container') as HTMLElement;
      
      if (!container) return;
      
      if (isFullscreen) {
        // Obtenez les dimensions de l'écran en mode plein écran
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        
        // Appliquer les styles de centrage
        html.style.overflow = 'hidden';
        body.style.overflow = 'hidden';
        
        // Centrer le contenu horizontalement et verticalement
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.justifyContent = 'center';
        container.style.alignItems = 'center';
        container.style.height = `${screenHeight}px`;
        container.style.width = `${screenWidth}px`;
        container.style.maxWidth = '100%';
        container.style.margin = '0 auto';
        container.style.overflow = 'auto';
        
        // Ajuster le padding pour la navbar
        const contentContainer = document.querySelector('.content-container') as HTMLElement;
        if (contentContainer) {
          contentContainer.style.paddingTop = '5rem'; // Plus d'espace pour la navbar en plein écran
          contentContainer.style.width = '100%';
          contentContainer.style.maxWidth = '1400px'; // Limite la largeur max pour les grands écrans
          contentContainer.style.margin = '0 auto';
          contentContainer.style.height = `${screenHeight - 80}px`; // 80px pour la navbar
        }
      } else {
        // Réinitialiser les styles lorsqu'on quitte le mode plein écran
        html.style.overflow = '';
        body.style.overflow = '';
        
        container.style.display = '';
        container.style.flexDirection = '';
        container.style.justifyContent = '';
        container.style.alignItems = '';
        container.style.height = '';
        container.style.width = '';
        container.style.maxWidth = '';
        container.style.margin = '';
        container.style.overflow = '';
        
        const contentContainer = document.querySelector('.content-container') as HTMLElement;
        if (contentContainer) {
          contentContainer.style.paddingTop = '';
          contentContainer.style.width = '';
          contentContainer.style.maxWidth = '';
          contentContainer.style.margin = '';
          contentContainer.style.height = '';
        }
      }
    };

    // Appliquer les styles immédiatement
    applyFullscreenStyles();
    
    // Réappliquer les styles si la fenêtre change de taille
    window.addEventListener('resize', applyFullscreenStyles);
    
    return () => {
      window.removeEventListener('resize', applyFullscreenStyles);
      
      // Nettoyer les styles en sortant
      const html = document.documentElement;
      const body = document.body;
      const container = document.querySelector('.fullscreen-container') as HTMLElement;
      
      if (container) {
        html.style.overflow = '';
        body.style.overflow = '';
        
        container.style.display = '';
        container.style.flexDirection = '';
        container.style.justifyContent = '';
        container.style.alignItems = '';
        container.style.height = '';
        container.style.width = '';
        container.style.maxWidth = '';
        container.style.margin = '';
        container.style.overflow = '';
        
        const contentContainer = document.querySelector('.content-container') as HTMLElement;
        if (contentContainer) {
          contentContainer.style.paddingTop = '';
          contentContainer.style.width = '';
          contentContainer.style.maxWidth = '';
          contentContainer.style.margin = '';
          contentContainer.style.height = '';
        }
      }
    };
  }, [isFullscreen]);

  return { isFullscreen };
}; 