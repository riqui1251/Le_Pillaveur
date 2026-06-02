/**
 * Collection d'utilitaires pour détecter le support de fonctionnalités dans le navigateur
 * et fournir des alternatives si nécessaire
 */

/**
 * Vérifie si le navigateur actuel supporte les animations CSS avancées
 */
export const supportsAdvancedAnimations = (): boolean => {
  if (typeof window === 'undefined') return false; // Pour SSR

  try {
    // Vérifier les propriétés qui pourraient causer des problèmes sur certains navigateurs
    return 'animation' in document.documentElement.style &&
           'transform' in document.documentElement.style &&
           'backgroundClip' in document.documentElement.style &&
           !isOldAndroidBrowser() && 
           !isWebViewBrowser();
  } catch (_) {
    return false;
  }
};

/**
 * Vérifie si l'appareil est probablement un appareil mobile
 */
export const isMobileDevice = (): boolean => {
  if (typeof window === 'undefined') return false; // Pour SSR

  // Méthode améliorée pour détecter les appareils mobiles
  // 1. Vérification par user agent
  const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i;
  const isMobileByUserAgent = mobileRegex.test(navigator.userAgent);
  
  // 2. Vérification par taille d'écran
  const isMobileByScreenSize = window.innerWidth <= 768;
  
  // 3. Vérification par fonctionnalités tactiles
  const hasTouchScreen = ('ontouchstart' in window) || 
                         (navigator.maxTouchPoints > 0);
                         
  // 4. Vérification par orientation
  const hasOrientationAPI = Boolean(window.orientation !== undefined || window.screen.orientation);
  
  // On considère qu'un appareil est mobile s'il répond à au moins 2 critères sur 4
  let mobileScore = 0;
  if (isMobileByUserAgent) mobileScore++;
  if (isMobileByScreenSize) mobileScore++;
  if (hasTouchScreen) mobileScore++;
  if (hasOrientationAPI) mobileScore++;
  
  // Pour être plus sûr, on force à true pour les appareils Apple et Android courants
  if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
    return true;
  }
  
  return mobileScore >= 2;
};

/**
 * Vérifie si le navigateur est un ancien navigateur Android
 */
export const isOldAndroidBrowser = (): boolean => {
  if (typeof window === 'undefined') return false; // Pour SSR
  
  const ua = navigator.userAgent;
  return /Android/.test(ua) && 
         /Version\/[0-7]\./.test(ua) && 
         !/Chrome/.test(ua);
};

/**
 * Vérifie si le navigateur est un WebView
 */
export const isWebViewBrowser = (): boolean => {
  if (typeof window === 'undefined') return false; // Pour SSR
  
  const ua = navigator.userAgent.toLowerCase();
  return /(android|iphone|ipod|ipad).*applewebkit(?!.*version)/i.test(ua) || 
         /wv|WebView|FBAN|FBAV/.test(ua);
};

/**
 * Vérifie si le navigateur supporte background-clip: text
 */
export const supportsBackgroundClipText = (): boolean => {
  if (typeof window === 'undefined') return false; // Pour SSR

  try {
    // Créer un élément test
    const testElement = document.createElement('div');
    // Tester toutes les versions possibles de la propriété
    const properties = [
      'backgroundClip',
      'webkitBackgroundClip'
    ];

    // Si c'est un ancien navigateur ou WebView, on retourne false directement
    if (isOldAndroidBrowser() || isWebViewBrowser()) {
      return false;
    }

    for (const property of properties) {
      if (property in testElement.style) {
        return true;
      }
    }
    return false;
  } catch (_) {
    return false;
  }
};

/**
 * Vérifie si le navigateur est probablement un navigateur ancien ou limité
 */
export const isLimitedBrowser = (): boolean => {
  if (typeof window === 'undefined') return false; // Pour SSR

  // Recherche de navigateurs connus pour avoir des limitations
  const userAgent = navigator.userAgent.toLowerCase();
  
  // Navigateurs WebView sur Android ou iOS qui peuvent avoir des limitations
  const isWebView = isWebViewBrowser();
  
  // Anciens navigateurs
  const isOldIE = /msie|trident/.test(userAgent);
  const isOldEdge = /edge\/\d+/.test(userAgent) && !/edg/.test(userAgent);
  const isOldAndroid = isOldAndroidBrowser();
  
  // Autres cas problématiques
  const isUCBrowser = /ucbrowser/.test(userAgent);
  const isInAppBrowser = /fb_iab|fb4a|fbav|instagram|tiktok|twitter/.test(userAgent);
  
  return isWebView || isOldIE || isOldEdge || isOldAndroid || isUCBrowser || isInAppBrowser;
};

/**
 * Détecte tous les problèmes potentiels et renvoie un objet avec différentes capacités
 */
export const detectBrowserCapabilities = () => {
  // Sur le serveur, on retourne des valeurs par défaut
  if (typeof window === 'undefined') {
    return {
      advancedAnimations: false,
      backgroundClipText: false,
      isMobile: false,
      isLimitedBrowser: false
    };
  }
  
  // Sur le client, on détecte les capacités réelles
  const isMobile = isMobileDevice();
  const isLimited = isLimitedBrowser();
  
  // IMPORTANT: Nous retirons toutes manipulations DOM directes pour éviter les problèmes d'hydratation
  // Ces manipulations sont maintenant gérées par le BrowserCapabilitiesProvider
  
  // Si on est sur mobile et que c'est un navigateur limité, on désactive certaines fonctionnalités
  return {
    advancedAnimations: isMobile ? !isLimited && supportsAdvancedAnimations() : true,
    backgroundClipText: isMobile ? !isLimited && supportsBackgroundClipText() : true,
    isMobile,
    isLimitedBrowser: isLimited
  };
};

export default detectBrowserCapabilities; 