import { useState, useEffect } from 'react';

export default function useScreenSize() {
  const [width, setWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 0);
  const [height, setHeight] = useState(typeof window !== 'undefined' ? window.innerHeight : 0);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  
  useEffect(() => {
    // Fonction pour mettre à jour les dimensions
    function handleResize() {
      const currentWidth = window.innerWidth;
      const currentHeight = window.innerHeight;
      
      // Si on est sur un ordinateur (non mobile), utiliser la résolution fixe
      if (currentWidth >= 1024) {
        // Résolution fixe pour desktop
        setWidth(2152);
        setHeight(2076);
      } else {
        // Pour les appareils mobiles, utiliser les dimensions réelles
        setWidth(currentWidth);
        setHeight(currentHeight);
      }
      
      // Déterminer si c'est un appareil mobile
      setIsMobile(currentWidth < 768);
    }
    
    // Appeler une fois au chargement
    handleResize();
    
    // Ajouter un écouteur d'événement pour le redimensionnement
    window.addEventListener('resize', handleResize);
    
    // Nettoyer l'écouteur d'événement lors du démontage
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  return { 
    width, 
    height, 
    isMobile,
    isTablet: width >= 768 && width < 1024,
    isDesktop: width >= 1024
  };
} 