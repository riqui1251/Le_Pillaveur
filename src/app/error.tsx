'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Enregistrer l'erreur dans un service d'analyse ou de journalisation
    console.error('Erreur d\'application:', error)
  }, [error])

  return (
    <div style={{
      padding: '20px',
      maxWidth: '600px',
      margin: '0 auto',
      fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
    }}>
      <h1 style={{ fontSize: '1.8rem', marginBottom: '1rem' }}>
        Oups! Quelque chose s&apos;est mal passé
      </h1>
      
      <p style={{ marginBottom: '1rem', lineHeight: '1.5' }}>
        Nous rencontrons un problème technique lors du chargement de cette page. Nous sommes désolés pour la gêne occasionnée.
      </p>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px' }}>
        <button
          onClick={reset}
          style={{
            padding: '10px 15px',
            backgroundColor: '#6366f1',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          Réessayer
        </button>
        
        <Link href="/"
          style={{
            padding: '10px 15px',
            backgroundColor: '#333',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 'bold',
            textDecoration: 'none',
            textAlign: 'center',
          }}
        >
          Retour à l&apos;accueil
        </Link>
      </div>
      
      <div style={{ marginTop: '20px', fontSize: '0.875rem', color: '#666' }}>
        <p>Vous pouvez également essayer:</p>
        <ul style={{ paddingLeft: '20px', lineHeight: '1.5' }}>
          <li>Actualiser la page</li>
          <li>Vider le cache de votre navigateur</li>
          <li>Vérifier votre connexion Internet</li>
        </ul>
      </div>
    </div>
  )
} 