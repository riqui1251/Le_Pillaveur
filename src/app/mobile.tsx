'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function MobilePage() {
  useEffect(() => {
    // Détecter si c'est un appareil mobile
    const mobileCheck = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(
      navigator.userAgent
    ) || window.innerWidth <= 768;
    
    // Ajouter une classe spéciale pour les styles d'urgence
    if (mobileCheck) {
      document.documentElement.classList.add('mobile-emergency');
    }
  }, []);
  
  // Styles inline pour garantir l'affichage
  const containerStyle = {
    backgroundColor: '#000000',
    color: '#ffffff',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    padding: '20px',
    margin: '0',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center' as const,
  } as React.CSSProperties;
  
  const titleStyle = {
    fontSize: '24px',
    fontWeight: 'bold',
    marginBottom: '20px',
    color: '#ffffff',
  } as React.CSSProperties;
  
  const buttonStyle = {
    backgroundColor: '#333333',
    color: '#ffffff',
    border: 'none',
    borderRadius: '5px',
    padding: '15px 20px',
    margin: '10px 0',
    width: '100%',
    maxWidth: '300px',
    fontSize: '16px',
    cursor: 'pointer',
    display: 'block',
    textAlign: 'center' as const,
    textDecoration: 'none',
  } as React.CSSProperties;
  
  return (
    <div style={containerStyle}>
      <h1 style={titleStyle}>Jeux à Boire</h1>
      <p style={{ marginBottom: '20px' }}>Version mobile simplifiée</p>
      
      <div style={{ width: '100%', maxWidth: '300px' }}>
        <Link href="/games/pmu" passHref>
          <div style={buttonStyle}>Jeu PMU</div>
        </Link>
        
        <Link href="/games/petit-buveur" passHref>
          <div style={buttonStyle}>Petit Buveur</div>
        </Link>
        
        <Link href="/games/quizz-alcoolo" passHref>
          <div style={buttonStyle}>Quizz Alcoolo</div>
        </Link>
        
        <Link href="/games/plinko" passHref>
          <div style={buttonStyle}>Plinko</div>
        </Link>
        
        <Link href="/" passHref>
          <div style={{ ...buttonStyle, backgroundColor: '#555555', marginTop: '30px' }}>
            Retour à l&apos;accueil normal
          </div>
        </Link>
      </div>
      
      <div style={{ marginTop: '30px', fontSize: '14px' }}>
        <p>Si vous rencontrez des problèmes d&apos;affichage sur mobile, utilisez cette interface simplifiée.</p>
      </div>
    </div>
  );
} 