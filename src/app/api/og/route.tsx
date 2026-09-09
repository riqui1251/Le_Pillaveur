import { ImageResponse } from 'next/og'
import { getTranslations } from 'next-intl/server'
import { GAMES } from '@/lib/games'
import { locales, type AppLocale } from '@/i18n/routing'

/**
 * Aperçus de partage DYNAMIQUES (WhatsApp, Discord, SMS…).
 *
 * Le site n'avait qu'une seule carte pour tout : la home, un jeu et une
 * invitation à une table affichaient la même image et la même phrase — or
 * l'invitation est la boucle d'acquisition n°1 (« Jean t'invite au
 * Loup-Garou »), et elle parlait des bots à quelqu'un qu'un ami attend.
 *
 * Trois variantes, toutes traduites (l'ancienne carte statique montrait du
 * français aux quatre langues) :
 * - ?type=site           → carte de marque, phrase du site ;
 * - ?type=game&game=ID    → le jeu concerné ;
 * - ?type=invite&game=ID&code=ABC123&host=Nom → qui invite, à quel jeu, et
 *   qu'un pseudo suffit.
 *
 * Aucun chiffre n'est dessiné : rien à inventer, rien à démentir.
 * Police par défaut de next/og : pas de fetch réseau au rendu (robuste en
 * prod, même sans accès sortant).
 */

const WIDTH = 1200
const HEIGHT = 630

const FELT = '#0E3B2E'
const FELT_DEEP = '#0A2C22'
const GOLD = '#D9A441'
const CREAM = '#F3EAD3'
const SUIT_RED = '#B3382E'

/** Locale de l'URL, ramenée à une langue connue (défaut : français). */
function normalizeLocale(raw: string | null): AppLocale {
  return locales.includes(raw as AppLocale) ? (raw as AppLocale) : 'fr'
}

/**
 * Le pseudo de l'hôte transite par l'URL : on ne dessine que des caractères
 * imprimables, sur une seule ligne et bornés, pour qu'un lien bricolé ne
 * puisse pas faire passer un texte arbitraire pour un message du site.
 */
function sanitizeName(raw: string | null): string | null {
  if (!raw) return null
  const cleaned = Array.from(raw)
    .map((ch) => {
      // Caractères de contrôle (invisibles, parfois porteurs de mise en forme
      // bidirectionnelle) ramenés à une espace : seul du texte lisible entre
      // dans l'image.
      const code = ch.charCodeAt(0)
      return code < 0x20 || (code >= 0x7f && code <= 0x9f) ? ' ' : ch
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return null
  return cleaned.length > 24 ? `${cleaned.slice(0, 24)}…` : cleaned
}

/** Code de table : six caractères alphanumériques, sinon rien. */
function sanitizeCode(raw: string | null): string | null {
  if (!raw) return null
  const code = raw.trim().toUpperCase()
  return /^[A-Z0-9]{6}$/.test(code) ? code : null
}

/** Le jeu doit exister au catalogue : pas d'identifiant libre dans l'image. */
function knownGameId(raw: string | null): string | null {
  if (!raw) return null
  return GAMES.some((g) => g.id === raw) ? raw : null
}

/** Éventail de cartes du favicon — la signature visuelle de la marque. */
function CardFan({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <rect
        x="14.5" y="6.5" width="22" height="31" rx="3.5"
        transform="rotate(9 25.5 22)"
        fill={FELT_DEEP} stroke={GOLD} strokeWidth="1.8"
      />
      <rect
        x="10" y="9" width="22" height="31" rx="3.5"
        transform="rotate(-6 21 24.5)"
        fill={CREAM} stroke={GOLD} strokeWidth="1.8"
      />
      <g transform="rotate(-6 21 24.5)">
        <path
          d="M21 15.5 c3.4 4 5.6 6.1 5.6 8.9 a3.4 3.4 0 0 1 -5 3 c.3 1.7 .9 2.9 1.8 3.9 h-4.8 c.9 -1 1.5 -2.2 1.8 -3.9 a3.4 3.4 0 0 1 -5 -3 c0 -2.8 2.2 -4.9 5.6 -8.9 z"
          fill={SUIT_RED}
        />
      </g>
    </svg>
  )
}

/** Feutre + double filet or : le cadre commun aux trois variantes. */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `radial-gradient(120% 120% at 50% 0%, ${FELT}, ${FELT_DEEP})`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 28, left: 28, right: 28, bottom: 28,
          border: `3px solid rgba(217, 164, 65, 0.9)`,
          borderRadius: 18,
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 42, left: 42, right: 42, bottom: 42,
          border: `1.5px solid rgba(217, 164, 65, 0.45)`,
          borderRadius: 12,
          display: 'flex',
        }}
      />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 88px',
          textAlign: 'center',
        }}
      >
        {children}
      </div>
    </div>
  )
}

/** Nom de marque en petit, au-dessus du titre. */
function Kicker() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        fontSize: 26,
        letterSpacing: '0.3em',
        color: GOLD,
        textTransform: 'uppercase',
      }}
    >
      <CardFan size={44} />
      <div style={{ display: 'flex' }}>Le Pillaveur</div>
    </div>
  )
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const locale = normalizeLocale(params.get('locale'))
  const type = params.get('type')
  const t = await getTranslations({ locale, namespace: 'og' })
  const tCatalog = await getTranslations({ locale, namespace: 'games.catalog' })

  const gameId = knownGameId(params.get('game'))
  const gameTitle = gameId ? tCatalog(`${gameId}.title`) : null

  // ── Invitation à une table : le partage le plus précieux du produit ──
  if (type === 'invite') {
    const code = sanitizeCode(params.get('code'))
    const host = sanitizeName(params.get('host'))
    const headline =
      host && gameTitle
        ? t('inviteTitle', { host, game: gameTitle })
        : gameTitle
          ? t('inviteTitleAnon', { game: gameTitle })
          : t('inviteTitleBare')
    return new ImageResponse(
      (
        <Frame>
          <Kicker />
          <div
            style={{
              display: 'flex',
              marginTop: 30,
              fontSize: headline.length > 46 ? 60 : 72,
              fontWeight: 800,
              lineHeight: 1.15,
              color: CREAM,
            }}
          >
            {headline}
          </div>
          {code && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 18,
                marginTop: 34,
                padding: '14px 34px',
                borderRadius: 16,
                background: CREAM,
                color: FELT_DEEP,
                fontSize: 46,
                fontWeight: 800,
                letterSpacing: '0.22em',
              }}
            >
              {code}
            </div>
          )}
          <div
            style={{
              display: 'flex',
              marginTop: 30,
              fontSize: 30,
              color: GOLD,
            }}
          >
            {t('inviteFooter')}
          </div>
        </Frame>
      ),
      {
        width: WIDTH,
        height: HEIGHT,
        // Une table est éphémère : on laisse les aperçus se rafraîchir vite.
        headers: { 'cache-control': 'public, max-age=300' },
      }
    )
  }

  // ── Page d'un jeu ──
  if (type === 'game' && gameTitle) {
    return new ImageResponse(
      (
        <Frame>
          <Kicker />
          <div
            style={{
              display: 'flex',
              marginTop: 28,
              fontSize: gameTitle.length > 18 ? 84 : 104,
              fontWeight: 800,
              lineHeight: 1.1,
              color: CREAM,
            }}
          >
            {gameTitle}
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 26,
              fontSize: 32,
              color: GOLD,
            }}
          >
            {t('gameSubtitle')}
          </div>
        </Frame>
      ),
      {
        width: WIDTH,
        height: HEIGHT,
        headers: { 'cache-control': 'public, max-age=86400' },
      }
    )
  }

  // ── Carte de marque (défaut) — la phrase suit enfin la langue du lien ──
  return new ImageResponse(
    (
      <Frame>
        <CardFan size={150} />
        <div
          style={{
            display: 'flex',
            marginTop: 22,
            fontSize: 92,
            fontWeight: 800,
            letterSpacing: '0.08em',
            color: CREAM,
          }}
        >
          LE PILLAVEUR
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            marginTop: 24,
            fontSize: 30,
            letterSpacing: '0.24em',
            color: GOLD,
            textTransform: 'uppercase',
          }}
        >
          <div style={{ display: 'flex', width: 54, height: 2, background: 'rgba(217,164,65,0.6)' }} />
          {t('siteTagline')}
          <div style={{ display: 'flex', width: 54, height: 2, background: 'rgba(217,164,65,0.6)' }} />
        </div>
      </Frame>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: { 'cache-control': 'public, max-age=86400' },
    }
  )
}
