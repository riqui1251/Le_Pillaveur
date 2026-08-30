import { useState, useEffect, useCallback } from 'react';

// Types pour les API de plein écran spécifiques aux navigateurs
interface FullscreenDocument extends Document {
  webkitFullscreenElement?: Element | null;
  mozFullScreenElement?: Element | null;
  msFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
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
  // false au premier rendu (SSR compris) : le bouton n'apparaît qu'après montage,
  // et jamais sur iPhone Safari où aucune API requestFullscreen n'existe.
  const [isSupported, setIsSupported] = useState(false);

  const handleFullscreenChange = useCallback(() => {
    const doc = document as FullscreenDocument;
    setIsFullscreen(!!(
      document.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.mozFullScreenElement ||
      doc.msFullscreenElement
    ));
  }, []);

  useEffect(() => {
    const doc = document as FullscreenDocument;
    const docEl = document.documentElement as FullscreenElement;
    setIsSupported(Boolean(
      document.fullscreenEnabled ||
      doc.webkitFullscreenEnabled ||
      docEl.requestFullscreen ||
      docEl.webkitRequestFullscreen
    ));
    handleFullscreenChange();

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
    }
  };

  return { isFullscreen, isSupported, toggleFullscreen };
};
