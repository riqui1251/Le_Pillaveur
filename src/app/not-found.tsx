/* eslint-disable @next/next/no-html-link-for-pages --
   Ces pages REMPLACENT le document entier : elles vivent au-dessus de
   l'application (leur propre <html>/<body>, ni Tailwind ni next-intl). Une
   navigation par <Link> tenterait un routage côté client depuis un arbre
   cassé ou absent ; le <a> provoque un rechargement complet, qui est
   précisément ce qu'on veut pour repartir d'une application saine. */
/**
 * 404 des URL qui n'atteignent JAMAIS le segment de langue (fichier absent,
 * chemin exclu du middleware…). Elle vit au-dessus de [locale] : ni next-intl
 * (donc texte court en français, la langue par défaut du site), ni la feuille
 * Tailwind chargée par le layout de langue — d'où des styles en ligne aux
 * couleurs « Cartes sur Table » et un empilement de polices avec repli
 * (Playfair Display n'est chargée que sous [locale]).
 * Le layout racine ne rend que ses enfants : c'est donc ici qu'on pose
 * <html> et <body>.
 */

const FELT = '#0A2C22'
const FELT_DEEP = '#0E3B2E'
const GOLD = '#D9A441'
const CREAM = '#F3EAD3'

const DISPLAY_FONT = '"Playfair Display", Georgia, "Times New Roman", serif'
const TEXT_FONT = '"Source Sans 3", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'

export default function RootNotFound() {
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
          <p style={{ margin: 0, fontFamily: DISPLAY_FONT, fontSize: '56px', fontWeight: 700, color: GOLD }}>
            404
          </p>
          <h1 style={{ margin: 0, fontFamily: DISPLAY_FONT, fontSize: '24px', fontWeight: 700 }}>
            Cette carte n&apos;est pas dans le jeu
          </h1>
          <p style={{ margin: 0, maxWidth: '28rem', fontSize: '15px', lineHeight: 1.6, opacity: 0.7 }}>
            La page a changé de place, la table a été fermée, ou le lien s&apos;est perdu en route.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '12px', marginTop: '20px' }}>
            {/* Liens nus (pas de <Link> next-intl hors du fournisseur) : le
                préfixe de langue est obligatoire, on vise donc /fr. */}
            <a
              href="/fr"
              style={{
                padding: '12px 22px',
                borderRadius: '16px',
                backgroundColor: GOLD,
                color: FELT_DEEP,
                fontWeight: 700,
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
        </main>
      </body>
    </html>
  )
}
