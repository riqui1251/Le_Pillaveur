import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/toast';

// Types pour les API de plein écran spécifiques aux navigateurs
interface FullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
  mozFullScreenElement?: Element | null;
  msFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void>;
  mozCancelFullScreen?: () => Promise<void>;
  msExitFullscreen?: () => Promise<void>;
}

interface FullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void>;
  mozRequestFullScreen?: () => Promise<void>;
  msRequestFullscreen?: () => Promise<void>;
}

export const useFullscreen = () => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { showToast } = useToast();

  const handleFullscreenChange = useCallback(() => {
    const doc = document as FullscreenDocument;
    const newFullscreenState = !!(
      document.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.mozFullScreenElement ||
      doc.msFullscreenElement
    );
    
    setIsFullscreen(newFullscreenState);
    
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
        const docEl = document.documentElement as FullscreenElement;
        const requestFullscreen = 
          docEl.requestFullscreen || 
          docEl.webkitRequestFullscreen || 
          docEl.mozRequestFullScreen || 
          docEl.msRequestFullscreen;
        
        if (requestFullscreen) {
          await requestFullscreen.call(docEl);
        }
      } else {
        const doc = document as FullscreenDocument;
        const exitFullscreen = 
          document.exitFullscreen || 
          doc.webkitExitFullscreen || 
          doc.mozCancelFullScreen || 
          doc.msExitFullscreen;
        
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