import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/toast';

export const useFullscreen = () => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { showToast } = useToast();

  const handleFullscreenChange = useCallback(() => {
    const newFullscreenState = !!(
      document.fullscreenElement ||
      // @ts-ignore - Propriétés spécifiques aux navigateurs
      document.webkitFullscreenElement ||
      // @ts-ignore
      document.mozFullScreenElement ||
      // @ts-ignore
      document.msFullscreenElement
    );
    
    setIsFullscreen(newFullscreenState);
    
    // Afficher une notification lors du changement d'état
    if (newFullscreenState) {
      showToast({
        message: 'Mode plein écran activé',
        type: 'success',
        duration: 2000
      });
    } else {
      showToast({
        message: 'Mode plein écran désactivé',
        type: 'info',
        duration: 2000
      });
    }
  }, [showToast]);

  useEffect(() => {
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, [handleFullscreenChange]);

  const toggleFullscreen = async () => {
    try {
      if (!isFullscreen) {
        const docEl = document.documentElement;
        const requestFullscreen = 
          docEl.requestFullscreen || 
          // @ts-ignore - Méthodes spécifiques aux navigateurs
          docEl.webkitRequestFullscreen || 
          // @ts-ignore
          docEl.mozRequestFullScreen || 
          // @ts-ignore
          docEl.msRequestFullscreen;
        
        if (requestFullscreen) {
          await requestFullscreen.call(docEl);
        }
      } else {
        const exitFullscreen = 
          document.exitFullscreen || 
          // @ts-ignore
          document.webkitExitFullscreen || 
          // @ts-ignore
          document.mozCancelFullScreen || 
          // @ts-ignore
          document.msExitFullscreen;
        
        if (exitFullscreen) {
          await exitFullscreen.call(document);
        }
      }
    } catch (error) {
      console.error('Erreur lors du basculement en plein écran:', error);
      showToast({
        message: 'Impossible de basculer en plein écran',
        type: 'error',
        duration: 3000
      });
    }
  };

  return { isFullscreen, toggleFullscreen };
}; 