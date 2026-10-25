import { ImageResponse } from 'next/og'
import { getTranslations } from 'next-intl/server'
import { GAMES } from '@/lib/games'
import { locales, type AppLocale } from '@/i18n/routing'
import { apiError, withApiRoute } from '@/lib/api-route'
import { prisma } from '@/lib/prisma'
import { checkRateLimit, networkRateLimitKey } from '@/lib/rate-limit'

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
 * - ?type=invite&code=ABC123 → qui invite, à quel jeu (relus en base par le
 *   code : `host=` et `game=` de l'URL sont ignorés), et qu'un pseudo suffit.
 *
 * Aucun chiffre n'est dessiné : rien à inventer, rien à démentir.
 * Police par défaut de next/og : pas de fetch réseau au rendu (robuste en
 * prod, même sans accès sortant).
 *
 * Un rendu (satori puis resvg) gèle l'unique thread Node ~400 ms : rendu à
 * la demande pour chaque URL, un paramètre aléatoire (`&v=…`) suffisait à
 * figer tout le site à 3 requêtes par seconde. D'où :
 * - cartes de marque et de jeu mémoïsées par (type, jeu, langue) — jeux du
 *   catalogue × 4 langues au plus, tout autre paramètre ignoré ;
 * - invitations mémoïsées par (code, langue) quelques minutes ; un code
 *   inconnu reçoit la carte d'invitation nue, mémoïsée elle aussi ;
 * - quota par RÉSEAU avant tout rendu qui n'est pas déjà en mémoire.
 */

const WIDTH = 1200
const HEIGHT = 630

/** Cartes de marque et de jeu : elles ne changent qu'au déploiement. */
const STATIC_HEADERS = { 'cache-control': 'public, max-age=86400, stale-while-revalidate=604800' }
/**
 * Une table est éphémère : on laisse les aperçus se rafraîchir vite.
 * noindex : robots.txt laisse passer tout /api/og (cartes de jeu et de
 * marque), cette carte comprise — or elle porte le pseudo de l'hôte. Les
 * robots d'aperçu (WhatsApp, Discord, X, Facebook) ignorent l'en-tête : le
 * partage ne change pas, Google Images ne la garde pas.
 */
const INVITE_HEADERS = { 'cache-control': 'public, max-age=300', 'x-robots-tag': 'noindex' }
const INVITE_TTL_MS = 5 * 60 * 1000
/** ~70 Ko par carte : la mémoire reste bornée quel que soit le nombre de tables. */
const MAX_INVITE_CARDS = 100

/**
 * Rendus neufs par minute et par réseau (clé /64 en IPv6). Un robot d'aperçu
 * n'en demande qu'un par lien partagé ; tout ce qui est déjà en mémoire est
 * servi sans compter.
 */
const RENDER_NETWORK_LIMIT = 20
const RENDER_WINDOW_MS = 60 * 1000

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

async function renderPng(element: React.ReactElement): Promise<ArrayBuffer> {
  return new ImageResponse(element, { width: WIDTH, height: HEIGHT }).arrayBuffer()
}

// ── Les trois cartes ──

/** Invitation à une table : le partage le plus précieux du produit. */
function InviteCard({ headline, code, footer }: { headline: string; code: string | null; footer: string }) {
  return (
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
        {footer}
      </div>
    </Frame>
  )
}

/** Page d'un jeu. */
function GameCard({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <Frame>
      <Kicker />
      <div
        style={{
          display: 'flex',
          marginTop: 28,
          fontSize: title.length > 18 ? 84 : 104,
          fontWeight: 800,
          lineHeight: 1.1,
          color: CREAM,
        }}
      >
        {title}
      </div>
      <div
        style={{
          display: 'flex',
          marginTop: 26,
          fontSize: 32,
          color: GOLD,
        }}
      >
        {subtitle}
      </div>
    </Frame>
  )
}

/** Carte de marque (défaut) — la phrase suit enfin la langue du lien. */
function SiteCard({ tagline }: { tagline: string }) {
  return (
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
        {tagline}
        <div style={{ display: 'flex', width: 54, height: 2, background: 'rgba(217,164,65,0.6)' }} />
      </div>
    </Frame>
  )
}

async function gameTitleOf(locale: AppLocale, gameId: string | null): Promise<string | null> {
  if (!gameId) return null
  const tCatalog = await getTranslations({ locale, namespace: 'games.catalog' })
  return tCatalog(`${gameId}.title`)
}

async function siteOrGameElement(locale: AppLocale, gameId: string | null): Promise<React.ReactElement> {
  const t = await getTranslations({ locale, namespace: 'og' })
  const gameTitle = await gameTitleOf(locale, gameId)
  if (gameTitle) return <GameCard title={gameTitle} subtitle={t('gameSubtitle')} />
  return <SiteCard tagline={t('siteTagline')} />
}

/** Table relue en base : hôte et jeu ne viennent jamais de l'URL. */
async function inviteElement(
  locale: AppLocale,
  invite: { code: string; host: string | null; gameId: string | null } | null
): Promise<React.ReactElement> {
  const t = await getTranslations({ locale, namespace: 'og' })
  const gameTitle = await gameTitleOf(locale, invite?.gameId ?? null)
  const host = invite?.host ?? null
  const headline =
    host && gameTitle
      ? t('inviteTitle', { host, game: gameTitle })
      : gameTitle
        ? t('inviteTitleAnon', { game: gameTitle })
        : t('inviteTitleBare')
  return <InviteCard headline={headline} code={invite?.code ?? null} footer={t('inviteFooter')} />
}

/** Hôte et jeu de la table, lus comme la page /invite/CODE les lit ; null si le code n'existe pas. */
async function loadInvite(code: string): Promise<{ code: string; host: string | null; gameId: string | null } | null> {
  const room = await prisma.onlineRoom.findUnique({
    where: { code },
    select: { gameId: true, host: { select: { name: true, displayName: true } } },
  })
  if (!room) return null
  const rawHost = room.host?.name?.trim() || room.host?.displayName?.trim() || ''
  return { code, host: sanitizeName(rawHost), gameId: knownGameId(room.gameId) }
}

// ── Mémoire des rendus ──

/** Marque, jeu et invitation nue, par (type, jeu, langue) : un ensemble fini de clés. */
const staticCards = new Map<string, Promise<ArrayBuffer>>()

type InviteEntry = { png: Promise<ArrayBuffer | null>; expiresAt: number }
/** Invitations par (code, langue), quelques minutes, MAX_INVITE_CARDS au plus. */
const inviteCards = new Map<string, InviteEntry>()

function rememberInvite(key: string, entry: InviteEntry, now: number): void {
  for (const [cachedKey, cached] of inviteCards) {
    if (cached.expiresAt <= now) inviteCards.delete(cachedKey)
  }
  inviteCards.delete(key)
  while (inviteCards.size >= MAX_INVITE_CARDS) {
    const oldest = inviteCards.keys().next().value
    if (oldest === undefined) break
    inviteCards.delete(oldest)
  }
  inviteCards.set(key, entry)
}

function forgetInvite(key: string, entry: InviteEntry): void {
  if (inviteCards.get(key) === entry) inviteCards.delete(key)
}

/** Refus du quota de rendus, ou null s'il reste de la place. */
function renderQuotaRefusal(request: Request): Response | null {
  const quota = checkRateLimit(networkRateLimitKey(request, 'og-render'), RENDER_NETWORK_LIMIT, RENDER_WINDOW_MS)
  if (quota.ok) return null
  const response = apiError('rate_limited', 429, { retryAfterSec: quota.retryAfterSec })
  response.headers.set('retry-after', String(quota.retryAfterSec))
  response.headers.set('cache-control', 'no-store')
  return response
}

/** Copie à chaque réponse : le tampon mémoïsé reste intact. */
function pngResponse(png: ArrayBuffer, headers: Record<string, string>): Response {
  return new Response(png.slice(0), { headers: { 'content-type': 'image/png', ...headers } })
}

/**
 * Carte mémoïsée sous `key`, rendue au premier appel. `quotaTaken` : le quota
 * a déjà été compté pour cette requête (code d'invitation inconnu).
 */
async function serveStaticCard(
  request: Request,
  key: string,
  build: () => Promise<React.ReactElement>,
  headers: Record<string, string>,
  quotaTaken = false
): Promise<Response> {
  let png = staticCards.get(key)
  if (!png) {
    const refusal = quotaTaken ? null : renderQuotaRefusal(request)
    if (refusal) return refusal
    const rendering = build().then(renderPng)
    // Un rendu raté n'est pas gardé : le prochain appel réessaie.
    rendering.catch(() => {
      if (staticCards.get(key) === rendering) staticCards.delete(key)
    })
    staticCards.set(key, rendering)
    png = rendering
  }
  return pngResponse(await png, headers)
}

export const GET = withApiRoute('og GET', async (request: Request) => {
  const params = new URL(request.url).searchParams
  const locale = normalizeLocale(params.get('locale'))

  if (params.get('type') === 'invite') {
    const code = sanitizeCode(params.get('code'))
    const bare = (quotaTaken: boolean) =>
      serveStaticCard(request, `invite:${locale}`, () => inviteElement(locale, null), INVITE_HEADERS, quotaTaken)
    if (!code) return bare(false)

    const key = `${code}:${locale}`
    const now = Date.now()
    let entry = inviteCards.get(key)
    if (!entry || entry.expiresAt <= now) {
      const refusal = renderQuotaRefusal(request)
      if (refusal) return refusal
      const created: InviteEntry = {
        png: loadInvite(code).then((invite) =>
          invite ? inviteElement(locale, invite).then(renderPng) : null
        ),
        expiresAt: now + INVITE_TTL_MS,
      }
      created.png.then(
        (png) => {
          if (!png) forgetInvite(key, created)
        },
        () => forgetInvite(key, created)
      )
      rememberInvite(key, created, now)
      entry = created
    }
    const png = await entry.png
    // Code bien formé mais sans table : la carte nue, sans le code.
    return png ? pngResponse(png, INVITE_HEADERS) : bare(true)
  }

  const gameId = params.get('type') === 'game' ? knownGameId(params.get('game')) : null
  const key = gameId ? `game:${gameId}:${locale}` : `site:${locale}`
  return serveStaticCard(request, key, () => siteOrGameElement(locale, gameId), STATIC_HEADERS)
})
