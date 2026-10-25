"use client"

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { HubShell } from '@/components/hub/HubShell'
import { PartyBar } from '@/components/hub/PartyBar'
import { TableRecordsPanel } from '@/components/hub/SelectedPlayersBar'
import { GamesGrid } from '@/components/hub/GamesGrid'
import { OpenLobbiesList } from '@/components/online/OpenLobbiesList'
import { FriendInviteBanner } from '@/components/online/FriendInviteBanner'
import { FridayTableBanner } from '@/components/online/FridayTableBanner'
import { JoinGate } from '@/components/online/JoinGate'
import { RejoinBanner } from '@/components/online/RejoinBanner'
import { RecentGamesRow } from '@/components/online/RecentGamesRow'
import { RecentLocalGamesRow } from '@/components/hub/RecentLocalGamesRow'
import { OfflineBanner } from '@/components/hub/OfflineBanner'
import { requestAgeVerification } from '@/components/legal/AgeGate'
import { useConfirmAction } from '@/components/game/ConfirmActionDialog'
import { useRequireSelectedPlayers } from '@/hooks/useRequireSelectedPlayers'
import { useAuth } from '@/hooks/useAuth'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { Link } from '@/i18n/navigation'
import { COLLECTION_SLUGS } from '@/lib/collections'
import { GAMES } from '@/lib/games'
import { useLocalizedGames } from '@/lib/games-i18n'
import { deepLinkJoinDecision } from './join-deep-link'

/**
 * Le hub est rendu UNE fois au build, sans URL : tout ce qui lit
 * useSearchParams vit dans un composant enfant sous sa propre frontière
 * Suspense (JoinDeepLink, SoloFilterFromUrl), au repli VIDE — ces enfants ne
 * rendent rien, ils agissent. Sans frontière, Next repassait la page ENTIÈRE
 * au navigateur — HTML vide, catalogue invisible pour Googlebot — ou refusait
 * le build. Le reste (barre de soirée, bandeaux, grille) ne dépend pas de l'URL et
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
          {/* Sans réseau : le dit en tête, avant les bascules — les jeux sur un
              seul téléphone restent jouables (service worker), le reste non.
              Rendu vide tant que la connexion tient. */}
          <OfflineBanner />
          {/* Les réglages de la soirée — mode, ambiance, joueurs — tiennent
              sur UNE ligne de 56 px ; un toucher ouvre la feuille qui les
              règle. Les deux bascules et la liste des joueurs, posées ici en
              entier, repoussaient la première carte de jeu vers 850-950 px à
              375×667 : choisir un jeu demandait de faire défiler. La barre
              garde sa hauteur pendant le chargement de l'auth : rien ne saute. */}
          <PartyBar />
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
      {/* Rendez-vous « table du vendredi » PENDANT la soirée : en tête du hub,
          avant tables et catalogue, en ligne comme en local — il décide seul
          s'il a quelque chose à dire. Seules les deux alertes du moment le
          précèdent (une partie en cours à rejoindre, une invitation qui
          attend) : rares, elles ne se montrent que lorsqu'elles pressent.
          Le reste de la semaine, sa ligne de rendez-vous descend sous la
          grille (voir plus bas) : elle ne doit pas passer avant les jeux. */}
      <FridayTableBanner show="live" />
      {/* « Rejouer » juste sous la barre ; tables ouvertes et parties en cours
          tiennent en une ligne « Rejoindre » qui se déplie. */}
      {isOnline && <RecentGamesRow />}
      {isOnline && <OpenLobbiesList />}
      {/* Pendant local de « Vos dernières tables » : les derniers jeux ouverts
          sur cet appareil. Même attente de l'auth que les records, sinon un
          joueur en ligne la verrait passer le temps d'une réponse. */}
      {!authLoading && !isOnline && <RecentLocalGamesRow />}

      {/* La grille ne dépend QUE du catalogue statique : elle est rendue sans
          condition, dès le rendu serveur. La page renvoyait `null` tant que
          l'appel d'authentification n'avait pas répondu — HTML vide, flash
          blanc pour tout le monde et catalogue invisible sans JavaScript sur
          la page poussée en priorité 1.0 au sitemap. Seuls les bandeaux
          au-dessus (barre de soirée, tables récentes) attendent la session.
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
      {/* Sous la grille : ce qu'on va chercher entre deux parties (records de
          la table, pont vers le compte) et le rendez-vous du vendredi. */}
      {!authLoading && !isOnline && <TableRecordsPanel />}
      <FridayTableBanner show="upcoming" className="mb-0 mt-6" />
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
 * après le détour par l'inscription. Déjà assis quelque part, il est renvoyé
 * à sa propre table, ou on lui demande avant de quitter une partie en cours
 * (cf. deepLinkJoinDecision).
 */
function JoinDeepLink() {
  const router = useRouter()
  const { user, setPlayMode, loading: authLoading } = useAuth()
  const { joinRoom, fetchRoom } = useOnlineRoom()
  const tOnline = useTranslations('hub.jeuxOnline')
  const localizedGames = useLocalizedGames()
  const [confirmDialog, confirm] = useConfirmAction()
  // Lus au moment du lien : changer à chaque rendu ne doit pas relancer le join.
  const latestRef = useRef({ tOnline, localizedGames, confirm })
  latestRef.current = { tOnline, localizedGames, confirm }
  // La confirmation se résout à `false` au démontage : on ne navigue plus alors.
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])
  const isOnline = user?.playMode === 'online'
  const searchParams = useSearchParams()
  // DERNIER code tenté, pas un simple « déjà tenté » : un second lien
  // (?join=DEF456 après un échec sur ABC123) doit encore partir, le même
  // code ne doit pas repartir en boucle à chaque rendu.
  const lastJoinCodeRef = useRef<string | null>(null)
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
    if (!isOnline || !user) return
    let code = searchParams.get('join')?.trim().toUpperCase() ?? null
    if (!code) {
      try {
        code = window.localStorage.getItem('lp-pending-join')
      } catch {
        code = null
      }
    }
    if (!code || !/^[A-Z0-9]{6}$/.test(code) || lastJoinCodeRef.current === code) return
    lastJoinCodeRef.current = code
    try {
      window.localStorage.removeItem('lp-pending-join')
    } catch {
      // rien à nettoyer
    }
    const pathOf = (gameId: string | null | undefined) => GAMES.find((g) => g.id === gameId)?.path
    void (async () => {
      // Où est-on assis ? Sans réponse, on rejoint comme avant.
      const current = await fetchRoom()
      const decision = deepLinkJoinDecision(current, code)
      if (decision === 'stay') {
        const path = pathOf(current?.gameId)
        if (path) router.replace(path)
        return
      }
      if (decision === 'confirm') {
        const { tOnline: t, localizedGames: games, confirm: ask } = latestRef.current
        const game = games.find((g) => g.id === current?.gameId)?.title ?? ''
        const ok = await ask({
          title: t('inviteLeave.title'),
          description: t('inviteLeave.description', { game }),
          confirmLabel: t('inviteLeave.confirm'),
          cancelLabel: t('inviteLeave.cancel'),
        })
        if (!mountedRef.current) return
        if (!ok) {
          const path = pathOf(current?.gameId)
          if (path) router.replace(path)
          return
        }
      }
      const joined = await joinRoom({ code })
      if (joined?.gameId) {
        const path = pathOf(joined.gameId)
        if (path) router.replace(path)
      }
    })()
  }, [searchParams, isOnline, user, joinRoom, fetchRoom, router])

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
  if (!gateCode || user || authLoading || !ageVerified) return <>{confirmDialog}</>
  return <JoinGate code={gateCode} onDismiss={dismissGate} />
}
