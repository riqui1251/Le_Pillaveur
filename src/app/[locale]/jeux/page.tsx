"use client"

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { HubShell } from '@/components/hub/HubShell'
import { SelectedPlayersBar } from '@/components/hub/SelectedPlayersBar'
import { GamesGrid } from '@/components/hub/GamesGrid'
import { OpenLobbiesList } from '@/components/online/OpenLobbiesList'
import { FriendInviteBanner } from '@/components/online/FriendInviteBanner'
import { JoinGate } from '@/components/online/JoinGate'
import { RejoinBanner } from '@/components/online/RejoinBanner'
import { RecentGamesRow } from '@/components/online/RecentGamesRow'
import { PlayModeToggle } from '@/components/auth/PlayModeToggle'
import { AmbianceModeToggle } from '@/components/auth/AmbianceModeToggle'
import { requestAgeVerification } from '@/components/legal/AgeGate'
import { useRequireSelectedPlayers } from '@/hooks/useRequireSelectedPlayers'
import { useAuth } from '@/hooks/useAuth'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { Link } from '@/i18n/navigation'
import { COLLECTION_SLUGS } from '@/lib/collections'
import { GAMES } from '@/lib/games'
import { cn } from '@/lib/utils'

/**
 * Le hub est rendu UNE fois au build, sans URL : tout ce qui lit
 * useSearchParams vit dans un composant enfant sous sa propre frontière
 * Suspense (JoinDeepLink, SoloFilterFromUrl), au repli VIDE — ces enfants ne
 * rendent rien, ils agissent. Sans frontière, Next repassait la page ENTIÈRE
 * au navigateur — HTML vide, catalogue invisible pour Googlebot — ou refusait
 * le build. Le reste (bascules, bandeaux, grille) ne dépend pas de l'URL et
 * part dans le HTML comme avant.
 */
export default function GamesHubPage() {
  const t = useTranslations('hub.jeux')
  const tOnline = useTranslations('hub.jeuxOnline')
  const tCollections = useTranslations('hub.collections')
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { joinRoom, loading: joining } = useOnlineRoom()
  const isOnline = user?.playMode === 'online'
  // Filtre ?solo=1, remonté par SoloFilterFromUrl une fois l'URL lisible.
  const [solo, setSolo] = useState(false)
  // Appelé pour son effet de bord (redirection vers /joueurs en mode local
  // sans joueur) : la vitrine ne dépend PLUS de son retour — voir plus bas.
  useRequireSelectedPlayers('/joueurs', { skipWhenOnline: true })

  const handleJoinInvite = async (roomId: string) => {
    const room = await joinRoom({ roomId })
    if (room?.gameId) {
      const game = GAMES.find((g) => g.id === room.gameId)
      if (game) router.push(game.path)
    }
  }

  return (
    <>
    {/* Porte d'invitation (?join=CODE) : ne rend rien avant que l'auth ait
        répondu, le repli vide du build ne change donc rien à l'écran. */}
    <Suspense fallback={null}>
      <JoinDeepLink />
    </Suspense>
    <HubShell
      compact
      title={isOnline ? tOnline('title') : t('title')}
      subtitle={isOnline ? tOnline('subtitle') : t('subtitle')}
      headerExtra={
        <div className="space-y-2">
          {/* Deux réglages, deux lignes. Côte à côte, l'ambiance tenait en
              icônes seules (une chope, une feuille) : personne ne savait ce
              qu'elle changeait, ni laquelle était active. Elle a désormais ses
              libellés et sa phrase d'explication, sur toute la largeur.
              La hauteur est RÉSERVÉE tant que l'auth n'a pas répondu : sans
              ça, l'arrivée des bascules pousserait la grille déjà affichée
              vers le bas. Une fois l'auth connue sans compte, la zone se
              referme au lieu de laisser une bande vide. */}
          <div
            className={cn(
              'flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3',
              (authLoading || Boolean(user)) && 'min-h-[6.75rem] sm:min-h-[4.75rem]'
            )}
          >
            <PlayModeToggle className="max-w-none sm:max-w-sm sm:flex-1" />
            <AmbianceModeToggle className="sm:max-w-sm sm:flex-1" />
          </div>
          {/* Bandeau de session : tant que l'auth n'a pas répondu, `isOnline`
              vaut false pour TOUT LE MONDE — l'afficher tout de suite le
              ferait clignoter chez les joueurs en ligne. */}
          {!authLoading && !isOnline && <SelectedPlayersBar />}
          {user?.displayName && (
            <p className="flex items-center justify-end gap-1.5 px-1 text-[11px] text-white/45">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {isOnline ? (user.onlineDisplayName ?? user.displayName) : user.displayName}
            </p>
          )}
          {/* Quatre portes par intention (« à 2 », « sans alcool »…) : des
              pages serveur indexables (/jeux/<collection>), liées d'ici pour
              le maillage — et pour le joueur qui sait déjà ce qu'il cherche.
              Sans condition : elles partent dans le HTML, session ou pas.
              Sans préchargement, comme les cartes de la grille (GameCard) :
              une page statique se précharge ENTIÈRE (≈ 30 Ko compressés par
              collection), et ces puces sont toujours à l'écran. */}
          <nav
            aria-label={tCollections('chipsLabel')}
            className="flex gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {COLLECTION_SLUGS.map((slug) => (
              <Link
                key={slug}
                href={`/jeux/${slug}`}
                prefetch={false}
                className="shrink-0 whitespace-nowrap rounded-full border border-gold/25 px-3 py-1.5 text-xs font-semibold text-cream/70 transition-colors hover:border-gold/50 hover:text-cream"
              >
                {tCollections(`${slug}.chip`)}
              </Link>
            ))}
          </nav>
        </div>
      }
    >

      {isOnline && <RejoinBanner onJoin={handleJoinInvite} joining={joining} />}
      {isOnline && <FriendInviteBanner onJoin={handleJoinInvite} joining={joining} />}
      {isOnline && <RecentGamesRow />}
      {isOnline && <OpenLobbiesList />}

      {/* La grille ne dépend QUE du catalogue statique : elle est rendue sans
          condition, dès le rendu serveur. La page renvoyait `null` tant que
          l'appel d'authentification n'avait pas répondu — HTML vide, flash
          blanc pour tout le monde et catalogue invisible sans JavaScript sur
          la page poussée en priorité 1.0 au sitemap. Seuls les bandeaux
          au-dessus (bascules, joueurs, tables récentes) attendent la session.
          Le filtre ?solo=1, lui, vient de l'URL, inconnue au build : il est
          lu à part (SoloFilterFromUrl) et appliqué après l'hydratation. Le
          HTML porte donc la grille COMPLÈTE — celle que voient Googlebot et
          un visiteur sans JavaScript, et ce que voit de toute façon quiconque
          arrive sans ?solo — et une seule : avec la grille en repli d'une
          frontière Suspense, l'hydratation jetait ses 22 cartes pour en
          construire 22 autres, juste pour lire un paramètre d'URL. */}
      <Suspense fallback={null}>
        <SoloFilterFromUrl onChange={setSolo} />
      </Suspense>
      <GamesGrid solo={solo} />
    </HubShell>
    </>
  )
}

/**
 * Funnel landing « Jouer seul avec les bots » : ?solo=1 filtre la grille sur
 * les jeux jouables avec des bots (voir GamesGrid). Ne rend RIEN : lit l'URL
 * et remonte le drapeau à la page. Par useSearchParams, pas window.location :
 * il suit les navigations client entre /jeux?solo=1 et /jeux (« tout revoir »
 * dans le bandeau de la grille), qui ne remontent pas la page.
 */
function SoloFilterFromUrl({ onChange }: { onChange: (solo: boolean) => void }) {
  const searchParams = useSearchParams()
  const solo = searchParams.get('solo') === '1'
  useEffect(() => {
    onChange(solo)
  }, [solo, onChange])
  return null
}

/**
 * Deep-link « rejoins ma table » (QR TV ou lien partagé) : ?join=CODE →
 * rejoint la salle et ouvre le jeu. Un visiteur pas encore connecté (ou
 * pas en mode online) garde le code sous le coude en localStorage — il est
 * consommé automatiquement dès qu'il arrive ici connecté en ligne, même
 * après le détour par l'inscription.
 */
function JoinDeepLink() {
  const router = useRouter()
  const { user, setPlayMode, loading: authLoading } = useAuth()
  const { joinRoom } = useOnlineRoom()
  const isOnline = user?.playMode === 'online'
  const searchParams = useSearchParams()
  const joinAttemptedRef = useRef(false)
  const modeSwitchedRef = useRef(false)
  const [gateCode, setGateCode] = useState<string | null>(null)
  // Déclaration 18+ faite (cookie présent, ou portail franchi à l'instant) :
  // condition d'affichage de la porte d'invitation, voir l'effet plus bas.
  const [ageVerified, setAgeVerified] = useState(false)

  useEffect(() => {
    const raw = searchParams.get('join')?.trim().toUpperCase()
    if (raw && /^[A-Z0-9]{6}$/.test(raw) && (!user || !isOnline)) {
      try {
        window.localStorage.setItem('lp-pending-join', raw)
      } catch {
        // stockage indisponible — le lien ne survivra pas à l'inscription
      }
    }
  }, [searchParams, user, isOnline])

  // Visiteur SANS session avec un code en attente : porte d'entrée « invité
  // ou connexion » (voir JoinGate) au lieu de le laisser errer sur la vitrine.
  useEffect(() => {
    if (user) {
      setGateCode(null)
      return
    }
    const raw = searchParams.get('join')?.trim().toUpperCase()
    let code = raw && /^[A-Z0-9]{6}$/.test(raw) ? raw : null
    if (!code) {
      try {
        const stored = window.localStorage.getItem('lp-pending-join')
        code = stored && /^[A-Z0-9]{6}$/.test(stored) ? stored : null
      } catch {
        code = null
      }
    }
    setGateCode(code)
  }, [searchParams, user])

  // Le portail 18+ (AgeGate, au-dessus de tout) et la porte d'invitation se
  // montaient EN MÊME TEMPS : le champ pseudo prenait le focus SOUS le portail
  // et le clavier s'ouvrait sur un champ invisible. La porte attend donc la
  // déclaration d'âge — immédiate si le cookie existe, sinon une fois le
  // portail franchi (requestAgeVerification). Sur le hub il n'est pas
  // annulable : un « non » ne vient que d'une navigation ailleurs, et la page
  // n'est alors plus là pour l'entendre — d'où le garde-fou au démontage.
  useEffect(() => {
    if (!gateCode || user || authLoading) return
    let stale = false
    void requestAgeVerification().then((verified) => {
      if (!stale) setAgeVerified(verified)
    })
    return () => {
      stale = true
    }
  }, [gateCode, user, authLoading])

  // Connecté mais en mode local avec un code en attente (retour de connexion
  // après un scan de QR) : on bascule en ligne d'office — c'est ce que le
  // scan voulait dire — et l'effet de join ci-dessous prend le relais.
  useEffect(() => {
    if (!user || isOnline || modeSwitchedRef.current) return
    const raw = searchParams.get('join')?.trim().toUpperCase()
    let code = raw && /^[A-Z0-9]{6}$/.test(raw) ? raw : null
    if (!code) {
      try {
        const stored = window.localStorage.getItem('lp-pending-join')
        code = stored && /^[A-Z0-9]{6}$/.test(stored) ? stored : null
      } catch {
        code = null
      }
    }
    if (!code) return
    modeSwitchedRef.current = true
    void setPlayMode('online')
  }, [searchParams, user, isOnline, setPlayMode])
  useEffect(() => {
    if (joinAttemptedRef.current || !isOnline || !user) return
    let code = searchParams.get('join')?.trim().toUpperCase() ?? null
    if (!code) {
      try {
        code = window.localStorage.getItem('lp-pending-join')
      } catch {
        code = null
      }
    }
    if (!code || !/^[A-Z0-9]{6}$/.test(code)) return
    joinAttemptedRef.current = true
    try {
      window.localStorage.removeItem('lp-pending-join')
    } catch {
      // rien à nettoyer
    }
    void (async () => {
      const joined = await joinRoom({ code })
      if (joined?.gameId) {
        const game = GAMES.find((g) => g.id === joined.gameId)
        if (game) router.replace(game.path)
      }
    })()
  }, [searchParams, isOnline, user, joinRoom, router])

  const dismissGate = () => {
    try {
      window.localStorage.removeItem('lp-pending-join')
    } catch {
      // rien à nettoyer
    }
    setGateCode(null)
    router.replace('/jeux')
  }

  // Pas de porte tant que l'auth n'a pas répondu : pendant ce temps `user`
  // vaut null pour TOUT LE MONDE, et un joueur déjà connecté se voyait
  // proposer de créer un second compte invité. Ni avant la déclaration
  // 18+ : son champ (autoFocus) ouvrait le clavier sous le portail.
  if (!gateCode || user || authLoading || !ageVerified) return null
  return <JoinGate code={gateCode} onDismiss={dismissGate} />
}
