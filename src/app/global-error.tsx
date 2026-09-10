/* eslint-disable @next/next/no-html-link-for-pages --
   Ces pages REMPLACENT le document entier : elles vivent au-dessus de
   l'application (leur propre <html>/<body>, ni Tailwind ni next-intl). Une
   navigation par <Link> tenterait un routage côté client depuis un arbre
   cassé ou absent ; le <a> provoque un rechargement complet, qui est
   précisément ce qu'on veut pour repartir d'une application saine. */
'use client'

import { useEffect } from 'react'

/**
 * Dernier filet : erreur survenue DANS le layout racine (ou dans un rendu
 * si tôt que [locale]/error.tsx n'existe pas encore). Ce composant REMPLACE
 * tout le document, il vit donc hors du fournisseur next-intl : impossible
 * d'y traduire quoi que ce soit — le texte est assumé court et en français,
 * la langue par défaut du site. Il n'a pas non plus la feuille Tailwind du
 * layout de langue, d'où les styles en ligne aux couleurs
 * « Cartes sur Table » et un empilement de polices avec repli.
 */

const FELT = '#0A2C22'
const FELT_DEEP = '#0E3B2E'
const GOLD = '#D9A441'
const CREAM = '#F3EAD3'

const DISPLAY_FONT = '"Playfair Display", Georgia, "Times New Roman", serif'
const TEXT_FONT = '"Source Sans 3", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Erreur globale :', error)
  }, [error])

  return (
    <html lang="fr">
      <body style={{ margin: 0 }}>
        <main
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            padding: '32px 20px',
            textAlign: 'center',
            backgroundColor: FELT,
            color: CREAM,
            fontFamily: TEXT_FONT,
          }}
        >
          <h1 style={{ margin: 0, fontFamily: DISPLAY_FONT, fontSize: '26px', fontWeight: 700 }}>
            La partie s&apos;est arrêtée net
          </h1>
          <p style={{ margin: 0, maxWidth: '28rem', fontSize: '15px', lineHeight: 1.6, opacity: 0.7 }}>
            Une erreur inattendue a interrompu la page. Réessayez, ou repartez de l&apos;accueil.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '12px', marginTop: '20px' }}>
            <button
              type="button"
              onClick={reset}
              style={{
                padding: '12px 22px',
                borderRadius: '16px',
                border: 'none',
                backgroundColor: GOLD,
                color: FELT_DEEP,
                fontFamily: TEXT_FONT,
                fontSize: '15px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Réessayer
            </button>
            {/* Préfixe de langue obligatoire (localePrefix « always ») : /fr. */}
            <a
              href="/fr"
              style={{
                padding: '12px 22px',
                borderRadius: '16px',
                border: `1px solid ${GOLD}`,
                color: CREAM,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Retour à l&apos;accueil
            </a>
            <a
              href="/fr/jeux"
              style={{
                padding: '12px 22px',
                borderRadius: '16px',
                border: `1px solid ${GOLD}`,
                color: CREAM,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Voir les jeux
            </a>
          </div>

          {error?.digest ? (
            <p style={{ marginTop: '24px', fontSize: '12px', opacity: 0.4 }}>Code : {error.digest}</p>
          ) : null}
        </main>
      </body>
    </html>
  )
}
