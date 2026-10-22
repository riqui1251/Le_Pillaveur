"use client"

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname, useRouter } from '@/i18n/navigation'
import { useFormatter, useTranslations } from 'next-intl'
import { ArrowLeft, Bomb, Bot, Check, ChevronDown, Copy, Crown, Flame, Globe, Hourglass, Lock, LogOut, Mail, Pencil, Play, Plus, Settings, Share2, Tv, UserMinus, UserPlus, Users, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { VoiceDockButton } from '@/components/voice/VoiceDockButton'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { useOpenLobbies } from '@/hooks/useOpenLobbies'
import { useFriends } from '@/hooks/useFriends'
import { useOnlineProgression } from '@/hooks/useOnlineProgression'
import { useSaveOnlinePreferences } from '@/hooks/useSaveOnlinePreferences'
import { OnlineCollection } from '@/components/online/OnlineCollection'
import { isDefaultOnlineLook } from '@/lib/online/cosmetics'
import { DEFAULT_ONLINE_PREFERENCES } from '@/lib/online-preferences'
import { GAMES, hasContentIn, soloBotsCount, type GameMeta } from '@/lib/games'
import { useLocalizedGames } from '@/lib/games-i18n'
import { useAmbianceMode } from '@/components/providers/AmbianceAttribute'
import { GameIconById } from '@/components/hub/GameIconById'
import { ConnectionBanner } from '@/components/online/ConnectionBanner'
import { FriendInviteBanner } from '@/components/online/FriendInviteBanner'
import { GameBriefing } from '@/components/online/GameBriefing'
import { RejoinBanner } from '@/components/online/RejoinBanner'
import { LiveDot } from '@/components/online/OpenLobbiesList'
import { OnlinePlayerIcon } from '@/components/online/OnlinePlayerTag'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { JoinQR } from '@/components/tv/JoinQR'
import { cn } from '@/lib/utils'
import { isCapacitorApp } from '@/lib/native-app'
import { copyText, shareLink } from '@/lib/native-share'
import { imposteurCountFor, maxImposteurCount, IMPOSTEUR_MIN_PLAYERS } from '@/lib/imposteur/engine'
import { lgDebateMinutes } from '@/lib/loup-garou/debate'
import { espionDiscussionMinutes } from '@/lib/espion/discussion'
import { forceLaunchDecision, lobbyLaunchStatus, MC_TEAM_MIN_PLAYERS } from '@/components/online/lobby-launch'

const VISIBILITY_OPTIONS = ['public', 'private', 'invite'] as const
type Visibility = (typeof VISIBILITY_OPTIONS)[number]
const VISIBILITY_ICON: Record<Visibility, typeof Globe> = { public: Globe, private: Lock, invite: Mail }

interface GameOnlineLobbyProps {
  gameId: string
  game?: GameMeta
}

/**
 * Conteneur centré partagé par tous les écrans du lobby. Le fond est celui du
 * cadre de jeu (feutre, mode Soft compris) : les halos pulsés d'ici étaient
 * en partie morts (`bg-amber-600/15` n'existe pas en Tailwind 3.3) et
 * tournaient sans fin, même pour qui coupe les animations.
 *
 * Le bandeau « Connexion perdue » y prend place EN TÊTE, dans le flux : celui
 * de la coquille flottait par-dessus le haut de « Quitter » et en
 * interceptait les touchers. Si le cadre de la page en porte déjà un, c'est
 * le sien qui parle (un seul bandeau, cf. ConnectionBanner).
 */
function LobbyShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-full text-cream">
      <div className="relative z-10 mx-auto w-full max-w-lg px-4 py-8 pb-12">
        <ConnectionBanner placement="stage" className="-mx-4 -mt-8 mb-4" />
        {children}
      </div>
    </div>
  )
}

/** Jeux qu'une table peut prendre : ceux qu'on peut ouvrir en ligne (même garde que POST /rooms). */
const SWITCHABLE_GAMES = GAMES.filter((g) => g.onlineReady && !g.hidden)

/**
 * Feuille « Changer de jeu » (hôte, table en attente) : la liste des jeux en
 * ligne, en zone pouce. Un jeu que la tablée dépasse déjà est grisé — le
 * serveur le refuserait (max_players) —, comme un jeu dont les cartes
 * n'existent pas dans la langue de la table (content_lang_unavailable). En
 * ambiance Soft, seuls les jeux prêts
 * pour elle (softModeReady), comme la grille des jeux : les autres membres
 * suivent la bascule sans rien choisir. Échap, le voile ou la croix ferment,
 * sauf pendant la bascule. Modale au clavier : Tab tourne dans la feuille, et
 * le focus revient à la fermeture sur ce qui l'avait (la puce du lobby).
 */
function GameSwitchSheet({
  currentGameId,
  humans,
  lang,
  pendingId,
  error,
  titleOf,
  onPick,
  onClose,
}: {
  currentGameId: string
  humans: number
  /** Langue de la table (RoomSettings.lang) : celle des cartes tirées. */
  lang: string | undefined
  pendingId: string | null
  error: string | null
  titleOf: (id: string) => string
  onPick: (game: GameMeta) => void
  onClose: () => void
}) {
  const tOnline = useTranslations('onlineLobby')
  // « Cartes en français uniquement » : les mots du badge du hub.
  const tHub = useTranslations('hub.jeux')
  const panelRef = useRef<HTMLDivElement>(null)
  const busy = pendingId !== null
  const { mode: ambiance } = useAmbianceMode()
  const games =
    ambiance === 'soft'
      ? SWITCHABLE_GAMES.filter((g) => g.softModeReady || g.id === currentGameId)
      : SWITCHABLE_GAMES
  const rows = games.map((g) => {
    const current = g.id === currentGameId
    const blockedReason =
      !current && g.maxPlayers !== undefined && humans > g.maxPlayers
        ? tOnline('gameSwitch.tooMany', { count: g.maxPlayers })
        : !current && !hasContentIn(g, lang)
          ? tHub('frOnlyHint')
          : null
    return { game: g, current, blockedReason }
  })
  const available = [...rows.filter((r) => r.current), ...rows.filter((r) => !r.current && r.blockedReason === null)]
  const unavailable = rows.filter((r) => r.blockedReason !== null)

  useEffect(() => {
    // Le focus entre dans la feuille : clavier et lecteur d'écran y sont. Il
    // revient, à la fermeture, sur ce qui l'avait — sinon on repartait du
    // haut de la page.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panelRef.current?.focus()
    return () => {
      if (opener?.isConnected) opener.focus()
    }
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
      if (e.key !== 'Tab') return
      // Tab tourne DANS la feuille (aria-modal) : le lobby en dessous n'est
      // plus atteignable tant qu'elle est ouverte.
      const panel = panelRef.current
      if (!panel) return
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')
      )
      const active = document.activeElement
      const inside = active instanceof Node && panel.contains(active) && active !== panel
      if (focusables.length === 0) {
        e.preventDefault()
        panel.focus()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && (!inside || active === first)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (!inside || active === last)) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  // Portée sur <body> : le contenu du lobby vit dans le contexte d'empilement
  // de LobbyShell (z-10), sous le dock vocal (z-90) — une feuille modale doit
  // passer au-dessus de tout. Montée seulement au toucher : `document` existe.
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      {/* Le voile ferme au toucher ; au clavier, c'est la croix (hors tabulation). */}
      <button
        type="button"
        tabIndex={-1}
        aria-label={tOnline('close')}
        disabled={busy}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-switch-title"
        tabIndex={-1}
        className="relative flex max-h-[80dvh] w-full max-w-lg flex-col rounded-t-3xl border-x border-t border-gold/25 bg-felt-deep pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-18px_50px_-20px_rgba(0,0,0,0.9)] outline-none"
      >
        <div className="flex items-start gap-3 px-4 pb-2 pt-3">
          <div className="min-w-0 flex-1 pt-1">
            <h2 id="game-switch-title" className="font-display text-lg font-bold text-cream">
              {tOnline('gameSwitch.cta')}
            </h2>
            <p className="mt-0.5 text-xs leading-snug text-cream/70">{tOnline('gameSwitch.hint')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={tOnline('close')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-cream/70 transition-colors hover:bg-gold/10 hover:text-cream disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {error && (
          <p role="alert" className="mx-4 mb-2 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {error}
          </p>
        )}
        {/* Jeux possibles d'abord (le jeu en cours en tête) ; ceux que la
            table ne peut pas prendre sont rangés dessous, sous leur titre,
            grisés pour de bon (opacity-40 : l'opacity-45 d'avant n'existait
            pas) avec un cadenas et la raison. Pendant une bascule, tout se
            grise sauf le jeu demandé. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-2">
          {[available, unavailable].map((group, groupIndex) =>
            group.length === 0 ? null : (
              <div key={groupIndex}>
                {groupIndex === 1 && (
                  <p className="mb-1.5 mt-3 flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold/80">
                    {tOnline('gameSwitch.unavailableTitle')}
                    <span aria-hidden className="h-px flex-1 bg-gold/20" />
                  </p>
                )}
                <ul className="space-y-1.5">
                  {group.map(({ game: g, current, blockedReason }) => {
                    const pending = pendingId === g.id
                    const disabled = current || blockedReason !== null || busy
                    return (
                      <li key={g.id}>
                        <button
                          type="button"
                          disabled={disabled}
                          aria-current={current ? 'true' : undefined}
                          onClick={() => onPick(g)}
                          className={cn(
                            'flex min-h-[52px] w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left transition-colors',
                            current ? 'border-gold/40 bg-gold/10' : 'border-gold/20 bg-felt/40',
                            !disabled && 'hover:border-amber-400/40 hover:bg-gold/10',
                            disabled && !current && !pending && 'opacity-40'
                          )}
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#D8CCAE] bg-cream text-[#24201A]">
                            <GameIconById id={g.id} surface="card" className="h-5 w-5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-cream">{titleOf(g.id)}</span>
                            <span className={cn('block truncate text-xs', blockedReason ? 'text-amber-200' : 'text-cream/70')}>
                              {blockedReason ??
                                (g.maxPlayers && g.maxPlayers < 20
                                  ? tOnline('playersRange.bounded', { min: g.minPlayers ?? 2, max: g.maxPlayers })
                                  : tOnline('playersRange.open', { min: g.minPlayers ?? 2 }))}
                            </span>
                          </span>
                          {current ? (
                            <span className="shrink-0 text-xs font-bold uppercase tracking-wider text-gold">
                              {tOnline('gameSwitch.current')}
                            </span>
                          ) : pending ? (
                            <span aria-hidden className="h-5 w-5 shrink-0 rounded-full border-2 border-gold/30 border-t-gold motion-safe:animate-spin" />
                          ) : blockedReason ? (
                            <Lock aria-hidden className="h-3.5 w-3.5 shrink-0 text-amber-200" />
                          ) : null}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

/**
 * La collection de la fiche compte, ouverte depuis son siège. Composant À
 * PART, monté au premier toucher du siège seulement (puis gardé, pour que la
 * modale se referme en douceur) : un abonné à la progression lance une
 * lecture à son montage (règle de fraîcheur du store). Monté avec le lobby,
 * il en coûtait une à chaque page de jeu en ligne et à chaque retour à la
 * table, pour une donnée qui ne sert qu'ici.
 *
 * Au-dessus du dock vocal (z-90), sur le même plan que la feuille « Changer
 * de jeu » : une modale dont un bouton du dock recouvrirait le coin perdrait
 * son « Enregistrer » sur mobile. La collection se ferme dès « Enregistrer » :
 * l'issue remonte au lobby (onSaved / onSaveFailed), qui l'affiche.
 */
function SeatCollection({
  open,
  onOpenChange,
  onSaved,
  onSaveFailed,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  onSaveFailed: () => void
}) {
  const { user } = useAuth()
  const { progression } = useOnlineProgression()
  const { save } = useSaveOnlinePreferences()
  if (!user) return null
  return (
    <OnlineCollection
      open={open}
      onOpenChange={onOpenChange}
      displayName={user.onlineDisplayName ?? user.displayName}
      role={user.role}
      // Couleur forcée comme sur la fiche compte : le catalogue en ligne n'en a qu'une.
      preferences={{
        ...DEFAULT_ONLINE_PREFERENCES,
        ...user.onlinePreferences,
        color: DEFAULT_ONLINE_PREFERENCES.color,
      }}
      progression={progression}
      onSave={(preferences) => {
        void save(preferences).then((ok) => (ok ? onSaved() : onSaveFailed()))
      }}
      contentClassName="z-[100]"
      overlayClassName="z-[100]"
    />
  )
}

/** Position d'un siège autour de la table ovale (siège 0 en haut, sens horaire). */
function seatPos(index: number, count: number) {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count
  return {
    left: `${50 + 40 * Math.cos(angle)}%`,
    top: `${50 + 40 * Math.sin(angle)}%`,
  }
}

/**
 * Au-delà, les sièges de 72 px se chevauchaient autour de l'ovale (simulé à
 * 375 px : 8 paires à 12 places, 16 à 16) — nom d'un joueur sous l'avatar du
 * suivant, toucher qui ouvrait la mauvaise fiche. Les grandes tablées passent
 * en liste de sièges sur deux colonnes, sous un ovale qui garde le code.
 */
const RING_MAX_SEATS = 8

/**
 * Option de réglage (format, manches, durées, variantes). Choisie : or plein,
 * encre dessus — les dégradés par jeu portaient du blanc à 2-3:1 sur leur
 * bout clair. Pour un invité, le réglage reste lisible mais visiblement
 * inerte (`disabled:opacity-60`, légende « Réglé par … » au-dessus) : seul
 * `cursor-not-allowed` le distinguait, invisible au doigt.
 */
function optionTone(active: boolean | undefined, isHost: boolean) {
  return cn(
    'transition-colors disabled:cursor-not-allowed disabled:opacity-60',
    active
      ? 'border-amber-400 bg-amber-500 text-[#24201A] shadow-[0_8px_18px_-12px_rgba(217,164,65,0.8)]'
      : 'border-gold/20 bg-felt-deep/60 text-cream/80',
    isHost && !active && 'hover:border-gold/40 hover:bg-gold/10 hover:text-cream'
  )
}
function optionHint(active: boolean | undefined) {
  return active ? 'text-[#24201A]/90' : 'text-cream/60'
}

/** Formats d'équipes Toucher-Coulé. */
const TC_MODE_OPTIONS = ['1v1', '2v2', '3v3', '4v4'] as const
const TC_PLAYERS_PER_TEAM: Record<(typeof TC_MODE_OPTIONS)[number], number> = {
  '1v1': 1,
  '2v2': 2,
  '3v3': 3,
  '4v4': 4,
}

/** Difficultés Petit Buveur (mêmes clés/couleurs que la sélection en local, en pastille). */
const PB_DIFFICULTIES = ['facile', 'normal', 'difficile', 'extreme'] as const
const PB_DIFFICULTY_DOT: Record<(typeof PB_DIFFICULTIES)[number], string> = {
  facile: 'bg-emerald-400',
  normal: 'bg-amber-300',
  difficile: 'bg-orange-500',
  extreme: 'bg-red-600',
}

/**
 * Fenêtre du second toucher qui confirme le retrait d'un joueur. Assez
 * courte pour qu'un pouce qui tremble ne vide pas la table, assez longue
 * pour ne pas avoir à viser deux fois de suite.
 */
const KICK_CONFIRM_MS = 3000
/**
 * Un second toucher plus tôt que ça n'est pas une confirmation mais le
 * rebond du premier (double-tap involontaire, doigt qui glisse) : ignoré.
 */
const KICK_BOUNCE_MS = 250

/** Durée de la confirmation « copié ». */
const COPIED_FEEDBACK_MS = 2000
/** Un échec de copie reste plus longtemps : il faut le temps de le lire, puis de noter le code. */
const COPY_FAILED_FEEDBACK_MS = 4000
type CopyFeedback = 'copied' | 'failed' | null

export function GameOnlineLobby({ gameId, game: gameProp }: GameOnlineLobbyProps) {
  const game = gameProp ?? GAMES.find((g) => g.id === gameId)
  const pathname = usePathname()
  const { user } = useAuth()
  const { room, loading, error, setError, createRoom, joinRoom, leaveRoom, setReady, launchGame, updateSettings, setTeam, inviteFriend, kickMember, changeGame, refreshRoom } = useOnlineRoom()
  // Son propre siège ouvre la collection (icône, effet de pseudo, cadre) :
  // l'attente à la Table Ronde est un temps mort, et c'est LÀ que les autres
  // voient son look. La collection n'est montée qu'au premier toucher (voir
  // SeatCollection) ; son état vit ici. Avant tout retour anticipé : ordre
  // des hooks fixe.
  const [showCollection, setShowCollection] = useState(false)
  const [collectionMounted, setCollectionMounted] = useState(false)
  // Échec du dernier enregistrement depuis la collection : sans ce message,
  // la modale se fermait, le siège gardait l'ancien look, et rien ne disait
  // pourquoi.
  const [lookSaveFailed, setLookSaveFailed] = useState(false)
  const seatCustomizeId = useId()
  const router = useRouter()
  const { lobbies, liveGames, liveGamesTotal } = useOpenLobbies({ pollMs: 15_000 }) // la table, elle, est sondée par useOnlineRoom
  const { friends, incoming, outgoing, sendRequestToUser, acceptRequest } = useFriends()
  // Retour de « toucher = copier » sur le code de la table.
  const [codeCopy, setCodeCopy] = useState<CopyFeedback>(null)
  useEffect(() => {
    if (!codeCopy) return
    const timer = setTimeout(() => setCodeCopy(null), codeCopy === 'failed' ? COPY_FAILED_FEEDBACK_MS : COPIED_FEEDBACK_MS)
    return () => clearTimeout(timer)
  }, [codeCopy])
  // Coquille mobile : connue seulement après montage (comme dans la Navbar),
  // pour que le premier rendu client reste celui du HTML serveur.
  const [inApp, setInApp] = useState(false)
  useEffect(() => {
    setInApp(isCapacitorApp())
  }, [])
  const [joinCode, setJoinCode] = useState('')
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set())
  const [showTv, setShowTv] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  // Anti double-tap du bouton fusionné « Lancer avec les bots » (l'appel
  // setReady préalable ne passe pas par `loading`).
  const [soloLaunching, setSoloLaunching] = useState(false)
  // Même garde pour « Lancer sans les retardataires », qui enchaîne lui aussi
  // « prêt » (l'hôte) puis le lancement forcé, et pour « Lancer la partie ».
  const [forceLaunching, setForceLaunching] = useState(false)
  const [hostLaunching, setHostLaunching] = useState(false)
  // Hauteur réelle de la barre fixe du bas (guichet ou table) : l'espace
  // réservé en fin de page la suit, au lieu d'une estimation qui laissait
  // passer des réglages sous la barre dès qu'un libellé tenait sur deux lignes.
  const [bottomBarHeight, setBottomBarHeight] = useState(0)
  const bottomBarObserverRef = useRef<ResizeObserver | null>(null)
  const bottomBarRef = useCallback((el: HTMLDivElement | null) => {
    bottomBarObserverRef.current?.disconnect()
    bottomBarObserverRef.current = null
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setBottomBarHeight(el.offsetHeight))
    observer.observe(el, { box: 'border-box' })
    bottomBarObserverRef.current = observer
  }, [])
  // Retrait d'un joueur par l'hôte : « Retirer » (fiche du siège) s'ARME au premier
  // toucher et n'agit qu'au second, dans les KICK_CONFIRM_MS — une
  // confirmation qui ne demande rien à lire à minuit. Le siège armé est
  // identifié par son userId ; la fenêtre retombe d'elle-même.
  const [kickArmed, setKickArmed] = useState<string | null>(null)
  // Instant de l'armement : le second toucher doit lui laisser KICK_BOUNCE_MS.
  const kickArmedAtRef = useRef(0)
  useEffect(() => {
    if (!kickArmed) return
    const timer = setTimeout(() => setKickArmed(null), KICK_CONFIRM_MS)
    return () => clearTimeout(timer)
  }, [kickArmed])
  const tOnline = useTranslations('onlineLobby')
  const tXp = useTranslations('onlineXp')
  const format = useFormatter()
  // Choix ouvert/privé proposé au clic « Ouvrir une table » (modifiable
  // ensuite dans les réglages du lobby).
  const [choosingVisibility, setChoosingVisibility] = useState(false)
  useEffect(() => {
    setChoosingVisibility(false)
  }, [room?.id])

  // Partage du lien de la table (boucle virale n°1) : feuille de partage de
  // l'app ou du navigateur (mobile), sinon copie dans le presse-papier — cf.
  // shareLink. Le lien /jeux?join=CODE fonctionne même pour un ami SANS
  // compte : le code est mémorisé et consommé après son inscription (voir
  // jeux/page.tsx).
  const [linkShare, setLinkShare] = useState<CopyFeedback>(null)
  useEffect(() => {
    if (!linkShare) return
    const timer = setTimeout(() => setLinkShare(null), linkShare === 'failed' ? COPY_FAILED_FEEDBACK_MS : COPIED_FEEDBACK_MS)
    return () => clearTimeout(timer)
  }, [linkShare])
  const shareTableLink = async () => {
    if (!room) return
    // URL SANS préfixe de langue (le rejoignant garde SA locale) via
    // /invite/CODE : la page sert un aperçu OpenGraph qui montre LA table
    // (jeu + code) sur WhatsApp/Discord, puis redirige vers /jeux?join=.
    const url = `${window.location.origin}/invite/${room.code}`
    const gameTitle = game?.title ?? 'Le Pillaveur'
    const text = tOnline('share.text', { game: gameTitle, code: room.code })
    const outcome = await shareLink({ title: 'Le Pillaveur', text, url, clipboardText: `${text}\n${url}` })
    // Feuille ouverte ou refermée : elle a parlé d'elle-même, rien à ajouter.
    if (outcome === 'copied' || outcome === 'failed') setLinkShare(outcome)
  }
  const [showInvite, setShowInvite] = useState(false)
  const [seatSel, setSeatSel] = useState<string | null>(null)
  const [top5, setTop5] = useState<Map<string, number>>(new Map())
  const tTv = useTranslations('tv')
  const tPb = useTranslations('games.petit-buveur.page')
  const tTc = useTranslations('games.toucher-coule.lobby')
  const tQuiz = useTranslations('games.quiz.lobby')
  const tLg = useTranslations('games.loup-garou.lobby')
  const tMenteur = useTranslations('games.menteur.lobby')
  const tImposteur = useTranslations('games.imposteur.lobby')
  const tBluff = useTranslations('games.bluff.lobby')
  const tSf = useTranslations('games.sans-filtre.lobby')
  const tMc = useTranslations('games.mots-codes.lobby')
  const tDil = useTranslations('games.dilemmes.lobby')
  const tPbc = useTranslations('games.petit-bac.lobby')
  const tPre = useTranslations('games.president.lobby')
  const tEspion = useTranslations('games.espion.lobby')
  const tTabou = useTranslations('games.tabou.lobby')
  const tCrobard = useTranslations('games.crobard.lobby')
  const tFriends = useTranslations('account.friends')
  // Titres traduits des jeux (sélecteur « Changer de jeu », bascule de table,
  // bandeau « tu es dans le lobby X ») : `games.catalog` est au socle, lisible
  // depuis la page de n'importe quel jeu — et le titre adouci en ambiance Soft
  // (useLocalizedGames), comme partout ailleurs.
  const localizedGames = useLocalizedGames()
  const catalogTitle = (id: string | null | undefined) => {
    if (!id) return ''
    return localizedGames.find((g) => g.id === id)?.title ?? id
  }

  const gameLobbies = lobbies.filter((l) => l.gameId === gameId)
  // Parties EN COURS de ce jeu (tables publiques uniquement) : informatif, on
  // ne peut pas les rejoindre. Le reste du site n'est qu'un total anonyme —
  // c'est la seule trace laissée par les tables privées.
  const liveHere = liveGames.filter((l) => l.gameId === gameId)
  const liveElsewhere = Math.max(0, liveGamesTotal - liveHere.length)
  const isHost = room?.hostUserId === user?.id
  const inThisGameRoom = room?.gameId === gameId
  const selfMember = room?.members.find((m) => m.isSelf)
  const visibility = (room?.visibility ?? 'public') as Visibility

  // Changer de jeu (hôte) : la table garde son id et change de gameId. Qui
  // était assis ICI pour ce jeu suit vers la page du nouveau — sans passer
  // par « mauvais lobby, quitte-le ». Qui arrive d'ailleurs (assis à une
  // autre table, guichet d'un autre jeu) garde l'avertissement.
  const [seatedRoomId, setSeatedRoomId] = useState<string | null>(null)
  useEffect(() => {
    const seatedHere = room && room.gameId === gameId ? room.id : null
    if (seatedHere) setSeatedRoomId(seatedHere)
    else if (!room) setSeatedRoomId(null)
  }, [room, gameId])
  const tableMoved = Boolean(
    room && room.status === 'waiting' && room.gameId !== gameId && room.id === seatedRoomId
  )
  const movedGame = tableMoved ? GAMES.find((g) => g.id === room?.gameId) : undefined
  // Jeu vers lequel l'hôte vient lui-même de basculer : c'est son geste qui
  // navigue (handleSwitchGame), pas le suivi ci-dessous.
  const selfSwitchRef = useRef<string | null>(null)
  // Une seule navigation par bascule, quel que soit le nombre de relectures.
  const followedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!room || !movedGame) return
    const key = `${room.id}:${movedGame.id}`
    if (selfSwitchRef.current === movedGame.id || followedRef.current === key) return
    followedRef.current = key
    router.replace(movedGame.path)
  }, [room, movedGame, router])

  const [showGameSwitch, setShowGameSwitch] = useState(false)
  const [switchingTo, setSwitchingTo] = useState<string | null>(null)
  const handleSwitchGame = async (target: GameMeta) => {
    if (switchingTo || loading || target.id === gameId) return
    setSwitchingTo(target.id)
    selfSwitchRef.current = target.id
    if (await changeGame(target.id)) {
      // La page quitte l'écran : la feuille et son indicateur partent avec.
      router.push(target.path)
      return
    }
    selfSwitchRef.current = null
    setSwitchingTo(null)
  }

  useEffect(() => {
    if (room && room.gameId !== gameId && room.status === 'waiting' && !tableMoved) {
      setError(tOnline('errors.wrongGameRoom'))
    }
  }, [room, gameId, setError, tOnline, tableMoved])

  // Badge « top 5 » : classement de CE jeu, pour repérer d'un coup d'œil les
  // meilleurs joueurs de la table avant de lancer.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/online/rankings?gameId=${gameId}`, { credentials: 'include' })
        if (!res.ok || cancelled) return
        const data = (await res.json()) as { rows: { userId: string; position: number }[] }
        if (cancelled) return
        setTop5(new Map(data.rows.slice(0, 5).map((r) => [r.userId, r.position])))
      } catch {
        // Badge purement décoratif : un échec réseau ne doit rien casser.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [gameId])

  const copyCode = () => {
    if (!room?.code) return
    // copyText ne rejette jamais : un refus ne finit plus en rejet non géré
    // et muet — il s'affiche sous le code, que le joueur peut alors dicter.
    void copyText(room.code).then((ok) => setCodeCopy(ok ? 'copied' : 'failed'))
  }

  const handleJoinByCode = () => {
    const code = joinCode.trim().toUpperCase()
    if (code.length !== 6) return
    void joinRoom({ code })
  }

  const handleInviteFriend = async (friendUserId: string) => {
    const ok = await inviteFriend(friendUserId)
    if (ok) setInvitedIds((prev) => new Set(prev).add(friendUserId))
  }

  if (!user) {
    // Le visiteur est venu ouvrir une table EN LIGNE : sans destination, le
    // formulaire de compte retombait sur /joueurs (sa valeur par défaut) et le
    // renvoyait à la sélection de joueurs LOCAUX, à l'opposé de son intention.
    // On lui passe la page courante — `?redirect=` est le seul indice dont
    // dispose AuthForm, et un chemin en /games/… lui fait aussi poser le mode
    // en ligne à l'inscription. `usePathname` (i18n) rend le chemin SANS
    // préfixe de langue, exactement ce que safeRedirect attend.
    const signInHref = `/compte?redirect=${encodeURIComponent(pathname || `/games/${gameId}`)}`
    return (
      <LobbyShell>
        <div className="rounded-3xl border border-gold/20 bg-felt-deep/70 p-6 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#D8CCAE] bg-cream text-[#24201A] shadow-[0_10px_24px_-12px_rgba(0,0,0,0.6)]">
            <GameIconById id={gameId} surface="card" className="h-8 w-8" />
          </div>
          <p className="text-sm text-cream/80">{tOnline('signIn.prompt')}</p>
          <Button asChild variant="primary" size="gameLg" className="mt-4 w-full">
            <Link href={signInHref}>{tOnline('signIn.cta')}</Link>
          </Button>
        </div>
      </LobbyShell>
    )
  }

  // Briefing tuto synchronisé : tout le monde lit les règles avant le début.
  if (inThisGameRoom && room && room.status === 'briefing') {
    return (
      <LobbyShell>
        <GameBriefing room={room} gameId={gameId} />
      </LobbyShell>
    )
  }

  // La table vient de changer de jeu : on part vers sa page (effet de suivi,
  // ou geste de l'hôte). Un écran de passage plutôt que le guichet de
  // l'ancien jeu et son « quitte ce lobby » ; le bouton couvre une navigation
  // qui n'aboutirait pas.
  if (tableMoved && movedGame) {
    return (
      <LobbyShell>
        <div role="status" aria-live="polite" className="flex flex-col items-center gap-4 py-20 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#D8CCAE] bg-cream text-[#24201A] shadow-[0_10px_24px_-12px_rgba(0,0,0,0.6)]">
            <GameIconById id={movedGame.id} surface="card" className="h-7 w-7" />
          </span>
          <p className="font-display text-base font-bold text-cream">
            {tOnline('gameSwitch.moving', { game: catalogTitle(movedGame.id) })}
          </p>
          <span aria-hidden className="h-6 w-6 rounded-full border-2 border-gold/30 border-t-gold motion-safe:animate-spin" />
          <Button variant="quiet" size="game" onClick={() => router.push(movedGame.path)}>
            {tOnline('gameSwitch.goToTable')}
          </Button>
        </div>
      </LobbyShell>
    )
  }

  // Pas encore dans un lobby pour ce jeu
  if (!inThisGameRoom || room?.status !== 'waiting') {
    const wrongRoom = Boolean(room && room.gameId !== gameId)
    // Table en cours ailleurs (autre jeu) : on propose d'y aller — bascule de
    // jeu manquée onglet caché, ou simple détour par le guichet.
    const otherRoomGame = wrongRoom ? GAMES.find((g) => g.id === room?.gameId) : undefined

    return (
      <LobbyShell>
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/jeux"
            className="flex min-h-[44px] items-center gap-2 rounded-xl border border-gold/20 bg-felt-deep/70 px-3 py-2 text-sm font-medium text-cream/80 transition-colors hover:bg-gold/10 hover:text-cream"
          >
            <ArrowLeft className="h-4 w-4" />
            {tOnline('back')}
          </Link>
          <span className="flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 text-xs font-semibold text-amber-200">
            <Globe className="h-3 w-3" /> {tOnline('onlineBadge')}
          </span>
        </div>

        {/* Guichet : la carte du jeu tient sur une ligne — l'écran sert à
            REJOINDRE (code, tables ouvertes) ; créer attend en zone pouce. */}
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-[#D8CCAE] bg-cream px-3 py-2.5 text-[#24201A] shadow-[0_10px_24px_-12px_rgba(0,0,0,0.6)]">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#24201A]/[0.15] bg-[#24201A]/5">
            <GameIconById id={gameId} surface="card" className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-base font-bold leading-tight">{game?.title}</h1>
            <p className="text-xs text-[#6B6455]">
              {game?.maxPlayers && game.maxPlayers < 20
                ? tOnline('playersRange.bounded', { min: game?.minPlayers ?? 2, max: game.maxPlayers })
                : tOnline('playersRange.open', { min: game?.minPlayers ?? 2 })}
            </p>
          </div>
        </div>

        {wrongRoom && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm text-amber-100">
            <span>{tOnline('errors.inOtherLobby', { game: catalogTitle(room?.gameId) })}</span>
            <div className="flex items-center gap-1">
              {otherRoomGame && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-[44px] font-semibold text-amber-100 hover:bg-amber-500/[0.15]"
                  onClick={() => router.push(otherRoomGame.path)}
                >
                  {tOnline('gameSwitch.goToTable')}
                </Button>
              )}
              <Button variant="ghost" size="sm" className="min-h-[44px] text-amber-200 hover:bg-amber-500/[0.15] hover:text-amber-100" onClick={() => leaveRoom()}>
                {tOnline('quit')}
              </Button>
            </div>
          </div>
        )}

        {!wrongRoom && (
          <>
            <RejoinBanner onJoin={(roomId) => joinRoom({ roomId })} joining={loading} />
            <FriendInviteBanner onJoin={(roomId) => joinRoom({ roomId })} joining={loading} />

            <div className="mb-5">
              <p className="mb-2 flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">
                {tOnline('joinByCode.label')}
                <span aria-hidden className="h-px flex-1 bg-gold/20" />
              </p>
              <div className="flex gap-2">
                {/* Cases façon OTP : un input invisible par-dessus, les cases
                    ne font qu'afficher — gros caractères, saisie directe. */}
                <div className="relative flex min-w-0 flex-1 gap-1.5 rounded-xl focus-within:ring-2 focus-within:ring-gold focus-within:ring-offset-2 focus-within:ring-offset-felt-deep">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <span
                      key={i}
                      aria-hidden
                      className={cn(
                        'flex h-12 flex-1 items-center justify-center rounded-xl border font-display text-xl font-black',
                        joinCode[i]
                          ? 'border-gold/40 bg-felt-deep/70 text-cream'
                          : 'border-gold/20 bg-felt-deep/50 text-cream/30'
                      )}
                    >
                      {joinCode[i] ?? '•'}
                    </span>
                  ))}
                  <input
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleJoinByCode()
                    }}
                    aria-label={tOnline('joinByCode.label')}
                    autoCapitalize="characters"
                    autoComplete="off"
                    maxLength={6}
                    className="absolute inset-0 h-full w-full cursor-text opacity-0"
                  />
                </div>
                <Button
                  variant={joinCode.trim().length === 6 ? 'primary' : 'quiet'}
                  size="game"
                  onClick={handleJoinByCode}
                  disabled={loading || joinCode.trim().length !== 6}
                  className="shrink-0 rounded-xl"
                >
                  {tOnline('joinByCode.submit')}
                </Button>
              </div>
            </div>
          </>
        )}

        {gameLobbies.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">
              {tOnline('openTables.title', { count: gameLobbies.length })}
              <span aria-hidden className="h-px flex-1 bg-gold/20" />
            </p>
            <ul className="space-y-2">
              {gameLobbies.map((lobby) => (
                <li
                  key={lobby.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-gold/10 bg-felt-deep/60 px-3 py-2.5 transition-colors hover:border-amber-400/30"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/20 bg-gold/10">
                      <Crown className="h-4 w-4 text-amber-300" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <span className="font-mono text-sm font-bold tracking-wider text-cream">{lobby.code}</span>
                      <p className="truncate text-xs text-cream/70">
                        {lobby.hostName} · {tOnline('playersCount', { count: lobby.memberCount })}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="primary"
                    size="game"
                    disabled={loading || wrongRoom}
                    onClick={() => joinRoom({ roomId: lobby.id })}
                    className="shrink-0 rounded-xl"
                  >
                    {tOnline('join')}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Parties en cours : le guichet doit montrer que ça joue, même quand
            aucune table n'attend. Aucun code, aucun bouton — une partie
            lancée ne se rejoint pas (le serveur répond game_already_started),
            proposer « Rejoindre » serait promettre l'impossible. */}
        {liveHere.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">
              <LiveDot />
              {tOnline('live.title', { count: liveHere.length })}
              <span aria-hidden className="h-px flex-1 bg-gold/20" />
            </p>
            <ul className="space-y-2">
              {liveHere.map((live) => (
                <li
                  key={live.id}
                  className="flex items-center gap-2.5 rounded-xl border border-gold/10 bg-felt-deep/50 px-3 py-2.5"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gold/20 bg-gold/10">
                    <GameIconById id={gameId} surface="feltGold" className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    {/* Aucun pseudo : une table en cours dit combien ils sont
                        et depuis quand, jamais qui joue. */}
                    <p className="flex items-center gap-1.5 truncate text-sm text-cream">
                      <span className="truncate">
                        {tOnline('playersCount', { count: live.playerCount })}
                      </span>
                      {live.isPrivate && (
                        <Lock
                          className="h-3 w-3 shrink-0 text-cream/60"
                          aria-label={tOnline('recentLaunches.privateTable')}
                        />
                      )}
                    </p>
                    <p className="truncate text-xs text-cream/60">
                      {live.openedAgoMinutes < 1
                        ? tOnline('live.justOpened')
                        : tOnline('live.openedAgo', { minutes: live.openedAgoMinutes })}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-cream/60">{tOnline('live.notJoinable')}</p>
          </div>
        )}

        {liveElsewhere > 0 && (
          <p className="mb-4 flex items-center gap-2 rounded-xl border border-dashed border-gold/20 px-3 py-2 text-xs text-cream/70">
            <LiveDot />
            {tOnline('live.elsewhere', { count: liveElsewhere })}
          </p>
        )}

        {error && <p className="mt-4 text-center text-sm text-red-300">{error}</p>}

        {/* « Ouvrir une table » : l'action de création attend en zone pouce.
            Le clic propose d'abord le choix ouvert/privé (modifiable ensuite
            dans les réglages du lobby). */}
        {!wrongRoom && (
          <>
            <div
              aria-hidden
              style={bottomBarHeight ? { height: bottomBarHeight } : undefined}
              className={bottomBarHeight ? undefined : 'h-[calc(5.5rem+env(safe-area-inset-bottom))]'}
            />
            <div
              ref={bottomBarRef}
              className="fixed inset-x-0 bottom-0 z-40 border-t border-gold/20 bg-felt-deep/90 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl"
            >
              <div className="mx-auto w-full max-w-lg">
                {!choosingVisibility ? (
                  <Button
                    variant="primary"
                    size="gameLg"
                    onClick={() => setChoosingVisibility(true)}
                    disabled={loading}
                    className="w-full"
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    {loading ? tOnline('create.creating') : tOnline('create.cta')}
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-center text-xs font-semibold uppercase tracking-wide text-cream/70">
                      {tOnline('create.whoCanJoin')}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => void createRoom(gameId, { visibility: 'public' })}
                        disabled={loading}
                        className="flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-2xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-2.5 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
                      >
                        <span className="flex items-center gap-1.5 text-sm font-bold text-emerald-200">
                          <Globe className="h-4 w-4" /> {tOnline('create.openLabel')}
                        </span>
                        <span className="text-xs leading-tight text-cream/70">
                          {tOnline('create.openDesc')}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void createRoom(gameId, { visibility: 'private' })}
                        disabled={loading}
                        className="flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-3 py-2.5 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
                      >
                        <span className="flex items-center gap-1.5 text-sm font-bold text-amber-200">
                          <Lock className="h-4 w-4" /> {tOnline('create.privateLabel')}
                        </span>
                        <span className="text-xs leading-tight text-cream/70">
                          {tOnline('create.privateDesc')}
                        </span>
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setChoosingVisibility(false)}
                      disabled={loading}
                      className="min-h-[44px] w-full py-1 text-center text-xs font-semibold text-cream/70 transition-colors hover:text-cream"
                    >
                      {loading ? tOnline('create.creating') : tOnline('create.cancel')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </LobbyShell>
    )
  }

  // Sièges bots visibles : la Table Ronde montre aussi les bots réglés par
  // l'hôte (settings.botsCount) — sinon le funnel « Essayer avec des bots »
  // débouche sur une table déserte où seul l'hôte est assis.
  const botSeatCount = game?.botsFillable ? Math.max(0, room.settings.botsCount ?? 0) : 0
  const totalSeatCount = room.members.length + botSeatCount

  // Hôte seul avec assez de bots pour atteindre le minimum : UN SEUL bouton
  // qui enchaîne « prêt » puis « lancer » (le serveur exige tous prêts au
  // moment du launch — l'appel setReady préalable suffit).
  const canLaunchSoloWithBots =
    isHost &&
    room.members.length === 1 &&
    botSeatCount > 0 &&
    1 + botSeatCount >= (game?.minPlayers ?? 2)
  const launchSoloWithBots = async () => {
    if (soloLaunching || loading) return
    setSoloLaunching(true)
    try {
      if (!selfMember?.isReady) await setReady(true)
      await launchGame()
    } finally {
      setSoloLaunching(false)
    }
  }

  // « Lancer sans les retardataires » : un ami parti fumer sans toucher
  // « Prêt » ne doit pas bloquer la tablée. Proposé à l'hôte dès qu'un AUTRE
  // siège n'est pas prêt ; actionnable seulement si ceux qui restent (+ bots)
  // atteignent le minimum du jeu (logique pure, cf. lobby-launch.ts). Le
  // serveur retire les non-prêts puis lance — l'hôte est mis prêt avant,
  // pour ne jamais compter parmi eux.
  // Équipes choisies au lobby : Mots Codés et Tabou Vocal les rangent sous
  // leur propre clé, avec le même équilibrage des non-assignés au lancement.
  const lobbyTeams = gameId === 'tabou' ? room.settings.tabouTeams : room.settings.mcTeams
  const forceLaunch = forceLaunchDecision({
    members: room.members.map((m) => ({
      isReady: m.isReady,
      isHost: m.isHost,
      team: lobbyTeams?.[m.userId] ?? null,
    })),
    botCount: botSeatCount,
    minPlayers: game?.minPlayers ?? 2,
    // Mots Codés et Tabou : chaque équipe doit garder 2 joueurs (humains, le
    // Tabou n'a pas de bots au lancement) une fois les retardataires retirés
    // — la même borne que la route (team_min_players), 2 pour les deux jeux.
    teamMinPlayers: gameId === 'mots-codes' || gameId === 'tabou' ? MC_TEAM_MIN_PLAYERS : undefined,
  })
  const showForceLaunch = isHost && !canLaunchSoloWithBots && forceLaunch.offered
  const launchWithoutLate = async () => {
    if (forceLaunching || loading || !forceLaunch.allowed) return
    setForceLaunching(true)
    try {
      if (!selfMember?.isReady) await setReady(true)
      await launchGame({ force: true })
    } finally {
      setForceLaunching(false)
    }
  }

  // Premier toucher : arme « Retirer » ; second dans la fenêtre (mais pas dans
  // le rebond du premier) : retire.
  const handleKickTap = (userId: string) => {
    if (kickArmed !== userId) {
      kickArmedAtRef.current = Date.now()
      setKickArmed(userId)
      return
    }
    if (Date.now() - kickArmedAtRef.current < KICK_BOUNCE_MS) return
    setKickArmed(null)
    void kickMember(userId)
  }

  // Indice « Touche ton siège… » tant que le look est celui de l'inscription
  // (même critère que l'écran de fin, cf. isDefaultOnlineLook) : rien à
  // stocker ni à purger, il s'éteint de lui-même au premier changement.
  const showLookHint = Boolean(selfMember) && isDefaultOnlineLook(user.onlinePreferences)
  const openSeatCollection = () => {
    setLookSaveFailed(false)
    setCollectionMounted(true)
    setShowCollection(true)
  }
  const roomId = room.id
  // Le siège lit le look dans le DTO de la salle, relu en base à chaque GET :
  // on relit tout de suite plutôt que d'attendre le prochain sondage, pour
  // que le joueur se voie changer à table (et les autres dans la foulée, à
  // leur propre sondage).
  const onLookSaved = () => {
    void refreshRoom(roomId)
  }

  // Où en est la table (logique pure, cf. lobbyLaunchStatus) : l'hôte compte
  // prêt — c'est lui qui lance —, les invités pas prêts sont nommés. Au
  // Toucher-Coulé, le plafond est la capacité du format choisi (bots en
  // complément, pas de minimum), comme côté serveur.
  const tcMode = (room.settings.tcMode ?? '1v1') as (typeof TC_MODE_OPTIONS)[number]
  const launchStatus = lobbyLaunchStatus({
    members: room.members,
    botCount: botSeatCount,
    minPlayers: game?.minPlayers ?? 2,
    maxPlayers: gameId === 'toucher-coule' ? TC_PLAYERS_PER_TEAM[tcMode] * 2 : game?.maxPlayers,
  })
  const hostName = room.members.find((m) => m.isHost)?.displayName ?? ''
  const lateOthers = launchStatus.late.filter((m) => !m.isSelf)
  const selfLate = launchStatus.late.some((m) => m.isSelf)
  // Jusqu'à trois prénoms (« Max et Zoé »), au-delà un nombre : la ligne doit
  // tenir sur un téléphone.
  const lateNames =
    lateOthers.length > 0 && lateOthers.length <= 3
      ? format.list(
          lateOthers.map((m) => m.displayName),
          { type: 'conjunction' }
        )
      : null
  const readyCounts = { ready: launchStatus.ready, total: launchStatus.total }
  const tableStatus =
    launchStatus.late.length === 0
      ? tOnline('launch.status.allReady', readyCounts)
      : selfLate && lateOthers.length === 0
        ? tOnline('launch.status.waitingYou', readyCounts)
        : lateNames
          ? tOnline('launch.status.waitingNames', { ...readyCounts, names: lateNames })
          : tOnline('launch.status.waitingCount', { ...readyCounts, count: lateOthers.length })
  // Ce que la barre de l'hôte dit quand il ne peut pas encore lancer.
  const hostBlockedLabel =
    launchStatus.missingPlayers > 0
      ? tOnline('launch.needPlayers', { count: launchStatus.missingPlayers })
      : launchStatus.tooMany
        ? tOnline('gameSwitch.tooMany', {
            count: gameId === 'toucher-coule' ? TC_PLAYERS_PER_TEAM[tcMode] * 2 : (game?.maxPlayers ?? 0),
          })
        : lateNames
          ? tOnline('launch.waitingFor', { ...readyCounts, names: lateNames })
          : tOnline('launch.waitingForCount', { ...readyCounts, count: lateOthers.length })

  // « Lancer la partie » (hôte) : un seul geste, qui le met prêt puis lance —
  // comme le lancement avec les bots. Le serveur reste juge (canLaunch) : un
  // refus s'affiche sous la table.
  const launchAsHost = async () => {
    if (hostLaunching || loading) return
    setHostLaunching(true)
    try {
      if (!selfMember?.isReady) await setReady(true)
      await launchGame()
    } finally {
      setHostLaunching(false)
    }
  }

  const ringMode = totalSeatCount <= RING_MAX_SEATS

  // Avatar d'un siège : anneau plein émeraude + coche si prêt (l'hôte compte
  // prêt), anneau pointillé crème sinon — un signe qui ne tient pas qu'à la
  // couleur, lisible de loin, à la place de la pastille de 10 px.
  const seatAvatar = (m: (typeof room.members)[number], compact: boolean) => {
    const ready = m.isReady || m.isHost
    return (
      <span
        className={cn(
          'relative flex shrink-0 items-center justify-center rounded-full',
          ready ? 'border-[3px] border-emerald-400' : 'border-2 border-dashed border-cream/40'
        )}
      >
        <OnlinePlayerIcon
          icon={m.preferences?.icon ?? (m.isHost ? '👑' : '🌐')}
          cosmetics={{ preferences: m.preferences, level: m.level, role: m.role }}
          className={cn(
            'border border-[#D8CCAE] bg-cream text-[#24201A] shadow-[0_4px_10px_-4px_rgba(0,0,0,0.6)]',
            compact ? 'h-8 w-8 text-sm' : 'h-9 w-9 text-base'
          )}
        />
        {ready && (
          <span
            aria-hidden
            className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-felt-deep bg-emerald-400 text-felt-deep"
          >
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
        )}
        {/* Crayon d'or au coin libre : on voit que son propre siège se touche. */}
        {m.isSelf && (
          <span
            aria-hidden
            className="absolute -bottom-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-felt-deep bg-gold text-felt-deep shadow-[0_2px_6px_-2px_rgba(0,0,0,0.7)]"
          >
            <Pencil className="h-2.5 w-2.5" />
          </span>
        )}
        {m.isHost && <Crown aria-hidden className="absolute -left-2 -top-2 h-4 w-4 text-amber-300" />}
      </span>
    )
  }

  // Son propre siège ouvre la collection ; celui d'un autre, sa fiche (amitié
  // et, pour l'hôte, retrait de la table) sous la table. Le nom reste le
  // contenu du bouton (« Toi », état prêt lu à voix haute) — un aria-label
  // l'aurait remplacé : « Toucher Toi » ne répondait plus à la commande
  // vocale (WCAG 2.5.3). Le geste passe en DESCRIPTION, par un texte masqué.
  const seatButtonProps = (m: (typeof room.members)[number]) => ({
    type: 'button' as const,
    onClick: m.isSelf ? openSeatCollection : () => setSeatSel((v) => (v === m.userId ? null : m.userId)),
    'aria-describedby': m.isSelf ? seatCustomizeId : undefined,
    'aria-haspopup': m.isSelf ? ('dialog' as const) : undefined,
    'aria-expanded': m.isSelf ? undefined : seatSel === m.userId,
  })
  const seatReadyText = (m: (typeof room.members)[number]) =>
    m.isReady || m.isHost ? tOnline('seat.ready') : tOnline('seat.notReady')
  const top5Badge = (m: (typeof room.members)[number]) =>
    top5.has(m.userId) ? (
      <span className="shrink-0 text-xs font-bold text-amber-300" title={tOnline('top5Badge', { rank: top5.get(m.userId) ?? 0 })}>
        #{top5.get(m.userId)}
      </span>
    ) : null

  // Invité : les réglages de l'hôte restent lisibles, grisés, et disent qui
  // les tient — un toucher sans effet ne s'explique pas tout seul.
  const hostOnlyLegend = isHost ? null : (
    <p className="mb-3 flex items-center gap-1.5 text-xs text-cream/70">
      <Lock aria-hidden className="h-3.5 w-3.5 shrink-0 text-gold/80" />
      {tOnline('settings.hostOnly', { name: hostName })}
    </p>
  )

  // Dans le lobby en attente
  return (
    <LobbyShell>
      <div className="mb-5 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => leaveRoom()}
          className="flex min-h-[44px] shrink-0 items-center gap-2 rounded-xl border border-gold/20 bg-felt-deep/70 px-3 py-2 text-sm font-medium text-cream/80 transition-colors hover:bg-gold/10 hover:text-red-300"
        >
          <LogOut className="h-4 w-4" />
          {tOnline('quit')}
        </button>
        {/* Changer de jeu (hôte) : même table, même code — tout le monde
            suit. Le jeu en cours y est écrit, le geste en dessous. */}
        {isHost && (
          <button
            type="button"
            onClick={() => {
              setError(null)
              setShowGameSwitch(true)
            }}
            aria-haspopup="dialog"
            aria-expanded={showGameSwitch}
            className="flex min-h-[44px] min-w-0 max-w-[13rem] flex-1 items-center gap-2 rounded-xl border border-gold/25 bg-felt-deep/70 px-2.5 text-left transition-colors hover:border-amber-400/40"
          >
            <GameIconById id={gameId} surface="feltGold" className="h-5 w-5 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-bold text-cream">{catalogTitle(gameId)}</span>
              <span className="block truncate text-xs leading-tight text-gold/80">{tOnline('gameSwitch.cta')}</span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-cream/60" />
          </button>
        )}
        {/* Le micro de la table, en haut et non plus en bulle sur la zone du
            pouce (rien tant que le vocal n'est pas disponible ici). */}
        <VoiceDockButton />
      </div>

      {isHost && showGameSwitch && (
        <GameSwitchSheet
          currentGameId={gameId}
          humans={room.members.length}
          lang={room.settings.lang}
          pendingId={switchingTo}
          error={error}
          titleOf={catalogTitle}
          onPick={(target) => void handleSwitchGame(target)}
          onClose={() => setShowGameSwitch(false)}
        />
      )}

      {/* La Table Ronde : les joueurs sont assis autour du feutre (même
          langage que le mode TV), le code trône au centre — le toucher le
          copie. Au-delà de RING_MAX_SEATS, l'ovale ne garde que le code et
          les sièges passent en liste sur deux colonnes. */}
      <div className={cn('relative mx-auto w-full max-w-sm flex-none', ringMode ? 'mb-3 h-64' : 'mb-3 h-32')}>
        <div
          className={cn(
            'absolute rounded-[50%] border-[3px] border-gold/40 shadow-[inset_0_10px_30px_rgba(0,0,0,0.45),0_10px_24px_-10px_rgba(0,0,0,0.6)]',
            ringMode ? 'inset-x-3 inset-y-5' : 'inset-x-8 inset-y-1'
          )}
          style={{
            background:
              'radial-gradient(ellipse at 50% 38%, rgb(255 255 255 / 0.08) 0%, transparent 62%), radial-gradient(ellipse at 50% 38%, rgb(var(--felt-rgb)) 0%, rgb(var(--felt-deep-rgb)) 100%)',
          }}
        >
          <div aria-hidden className="absolute inset-2 rounded-[50%] border border-gold/20" />
        </div>
        {ringMode &&
          room.members.map((m, i) => (
            <div
              key={m.userId}
              className="absolute w-[4.5rem] -translate-x-1/2 -translate-y-1/2"
              style={seatPos(i, totalSeatCount)}
            >
              <button {...seatButtonProps(m)} className="flex w-full flex-col items-center gap-1 rounded-xl">
                {seatAvatar(m, false)}
                <span className="flex max-w-full items-center gap-0.5 text-sm font-semibold leading-tight text-cream">
                  <span className="truncate">{m.isSelf ? tOnline('seat.you') : m.displayName}</span>
                  {top5Badge(m)}
                </span>
                <span className="sr-only">{seatReadyText(m)}</span>
              </button>
            </div>
          ))}
        {/* Sièges bots : après les vrais joueurs, pour que la table paraisse
            pleine avant le lancement. */}
        {ringMode &&
          Array.from({ length: botSeatCount }).map((_, b) => (
            <span
              key={`bot-${b}`}
              className="absolute flex w-[4.5rem] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
              style={seatPos(room.members.length + b, totalSeatCount)}
            >
              <span
                aria-hidden
                className="flex h-[42px] w-[42px] items-center justify-center rounded-full border-2 border-dashed border-cream/30 bg-felt-deep/70 text-cream/70"
              >
                <Bot className="h-5 w-5" />
              </span>
              <span className="max-w-full truncate text-xs leading-tight text-cream/60">{tOnline('seat.bot')}</span>
            </span>
          ))}
        <button
          type="button"
          onClick={copyCode}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[#D8CCAE] bg-cream px-4 py-1.5 text-center text-[#24201A] shadow-[0_8px_18px_-8px_rgba(0,0,0,0.6)]"
        >
          <span className="block text-xs font-bold uppercase tracking-[0.2em] text-[#6B6455]">{tOnline('table.label')}</span>
          <span className="block font-display text-xl font-black tracking-[0.16em]">{room.code}</span>
          <span className="flex items-center justify-center gap-1 text-xs font-semibold text-[#6B6455]">
            {codeCopy === 'copied' ? (
              <Check className="h-3 w-3 text-emerald-700" />
            ) : codeCopy === 'failed' ? (
              <X className="h-3 w-3 text-red-700" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
            {codeCopy === 'copied'
              ? tOnline('table.copied')
              : codeCopy === 'failed'
                ? tOnline('table.copyFailed')
                : tOnline('table.tapToCopy')}
          </span>
        </button>
      </div>

      {!ringMode && (
        <ul className="mb-3 grid grid-cols-2 gap-2">
          {room.members.map((m) => {
            const ready = m.isReady || m.isHost
            return (
              <li key={m.userId}>
                <button
                  {...seatButtonProps(m)}
                  className={cn(
                    'flex min-h-[52px] w-full items-center gap-2.5 rounded-xl border px-2.5 py-1.5 text-left transition-colors hover:bg-gold/10',
                    seatSel === m.userId ? 'border-gold/50 bg-gold/10' : 'border-gold/20 bg-felt-deep/60'
                  )}
                >
                  {seatAvatar(m, true)}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1">
                      <span className="truncate text-sm font-semibold text-cream">
                        {m.isSelf ? tOnline('seat.you') : m.displayName}
                      </span>
                      {top5Badge(m)}
                    </span>
                    <span className={cn('block text-xs', ready ? 'text-emerald-300' : 'text-cream/60')}>
                      {seatReadyText(m)}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
          {Array.from({ length: botSeatCount }).map((_, b) => (
            <li
              key={`bot-${b}`}
              className="flex min-h-[52px] items-center gap-2.5 rounded-xl border border-dashed border-gold/20 px-2.5 py-1.5"
            >
              <span
                aria-hidden
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-cream/30 text-cream/70"
              >
                <Bot className="h-4 w-4" />
              </span>
              <span className="truncate text-sm text-cream/70">{tOnline('seat.bot')}</span>
            </li>
          ))}
        </ul>
      )}
      {/* Masqué mais lu comme description (aria-describedby suit aussi un
          élément caché) : ni doublon à l'écran, ni dans le parcours du
          lecteur d'écran. */}
      <span id={seatCustomizeId} hidden>
        {tOnline('seat.customize')}
      </span>

      {/* Qui manque, en clair, pour toute la table : la pastille de 10 px
          ne disait pas qui bloquait. */}
      {room.members.length > 1 && (
        <p
          className={cn(
            'mb-2 flex items-center justify-center gap-1.5 text-center text-sm font-semibold',
            launchStatus.late.length === 0 ? 'text-emerald-300' : 'text-cream'
          )}
        >
          {launchStatus.late.length === 0 ? (
            <Check aria-hidden className="h-4 w-4 shrink-0" />
          ) : (
            <Hourglass aria-hidden className="h-4 w-4 shrink-0 text-gold" />
          )}
          {tableStatus}
        </p>
      )}

      {/* Indice d'une ligne, tant que le look est celui de l'inscription
          (voir showLookHint) : le crayon seul ne dit pas ce qu'on
          gagne à toucher. */}
      {showLookHint && !lookSaveFailed && (
        <p className="mb-2 flex items-center justify-center gap-1.5 text-center text-xs text-cream/70">
          <Pencil aria-hidden className="h-3 w-3 shrink-0 text-gold/80" />
          {tOnline('seat.customizeHint')}
        </p>
      )}
      {/* Échec de l'enregistrement : dit sous la table, là où le joueur
          regarde son siège (la collection s'est déjà refermée). */}
      {lookSaveFailed && (
        <p role="alert" className="mb-2 text-center text-xs font-semibold text-red-300">
          {tXp('lookSaveFailed')}
        </p>
      )}

      {collectionMounted && (
        <SeatCollection
          open={showCollection}
          onOpenChange={setShowCollection}
          onSaved={onLookSaved}
          onSaveFailed={() => setLookSaveFailed(true)}
        />
      )}

      {/* Fiche du siège touché : amitié, et pour l'hôte « Retirer de la
          table ». Le retrait vivait dans une croix de 20 px posée sur
          l'avatar, qui chevauchait le siège voisin aux grandes tablées ; ici
          c'est un bouton de 44 px qui s'ARME au premier toucher et n'agit
          qu'au second, dans les KICK_CONFIRM_MS. */}
      {seatSel && (() => {
        const m = room.members.find((x) => x.userId === seatSel)
        if (!m || m.isSelf) return null
        const isFriend = friends.some((f) => f.userId === m.userId)
        const incomingReq = incoming.find((r) => r.userId === m.userId)
        const outgoingPending = outgoing.some((r) => r.userId === m.userId)
        const kickable = isHost
        const armed = kickArmed === m.userId
        return (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-gold/20 bg-felt-deep/80 px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-cream">{m.displayName}</span>
            {isFriend ? (
              <span className="flex shrink-0 items-center gap-1 text-xs text-emerald-300">
                <Users className="h-3.5 w-3.5" />
                {tFriends('alreadyFriend')}
              </span>
            ) : incomingReq ? (
              <button
                type="button"
                onClick={() => acceptRequest(incomingReq.id)}
                className="min-h-[44px] shrink-0 rounded-xl border border-emerald-400/40 bg-emerald-500/20 px-3 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/30"
              >
                {tFriends('accept')}
              </button>
            ) : outgoingPending ? (
              <span className="shrink-0 text-xs text-cream/70">{tFriends('requestSent')}</span>
            ) : (
              <Button variant="primary" size="game" onClick={() => sendRequestToUser(m.userId)} className="h-11 shrink-0 gap-1.5 rounded-xl px-3 text-xs">
                <UserPlus className="h-3.5 w-3.5" />
                {tFriends('sendRequest')}
              </Button>
            )}
            {kickable && (
              <button
                type="button"
                onClick={() => handleKickTap(m.userId)}
                aria-label={armed ? tOnline('seat.kickConfirmLabel', { name: m.displayName }) : tOnline('seat.kick', { name: m.displayName })}
                className={cn(
                  'flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition-colors',
                  armed
                    ? 'border-red-300 bg-suit-red text-cream'
                    : 'border-red-400/40 bg-red-500/10 text-red-300 hover:bg-red-500/20'
                )}
              >
                <UserMinus className="h-3.5 w-3.5" />
                {armed ? tOnline('seat.kickConfirm') : tOnline('seat.kickAction')}
              </button>
            )}
            <button
              type="button"
              onClick={() => setSeatSel(null)}
              aria-label={tOnline('close')}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-cream/70 hover:bg-gold/10 hover:text-cream"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )
      })()}

      {/* Mise en avant des bots : dès qu'il manque du monde pour lancer,
          l'hôte complète en un geste — jouer seul est possible. Le réglage
          fin (+/-) reste dans « Réglages ». */}
      {isHost && game?.botsFillable && (() => {
        const botsCount = Math.max(0, room.settings.botsCount ?? 0)
        const minPlayers = game.minPlayers ?? 2
        const maxBots = Math.max(0, (game.maxPlayers ?? 12) - room.members.length)
        const missing = Math.min(
          Math.max(0, minPlayers - room.members.length - botsCount),
          Math.max(0, maxBots - botsCount)
        )
        if (missing <= 0) return null
        // Seul à table, l'hôte reçoit la table solo du jeu (soloBots), la même
        // que « Essayer avec des bots » — pas un duel au minimum de joueurs.
        const fill =
          room.members.length === 1
            ? Math.min(Math.max(missing, soloBotsCount(game) - botsCount), Math.max(0, maxBots - botsCount))
            : missing
        return (
          <div className="mb-3 flex items-center gap-3 rounded-2xl border border-gold/25 bg-felt-deep/70 px-3.5 py-3">
            <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-gold/10 text-gold">
              <Bot className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-cream">{tOnline('botsCallout.title', { count: missing })}</p>
              <p className="text-xs leading-snug text-cream/70">{tOnline('botsCallout.hint')}</p>
            </div>
            <Button
              variant="quiet"
              size="game"
              onClick={() => updateSettings({ botsCount: botsCount + fill })}
              className="h-11 shrink-0 whitespace-normal rounded-xl px-3 text-xs leading-tight"
            >
              {tOnline('botsCallout.fill')}
            </Button>
          </div>
        )
      })()}

      <div className="mb-3 flex gap-2">
        <button
          type="button"
          onClick={() => void shareTableLink()}
          className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-gold/30 bg-felt-deep/60 px-2 py-2.5 text-xs font-bold text-cream transition-colors hover:bg-gold/10"
        >
          {linkShare === 'copied' ? (
            <Check className="h-3.5 w-3.5" />
          ) : linkShare === 'failed' ? (
            <X className="h-3.5 w-3.5" />
          ) : (
            <Share2 className="h-3.5 w-3.5 text-gold" />
          )}
          {linkShare === 'copied'
            ? tOnline('share.linkCopied')
            : linkShare === 'failed'
              ? tOnline('share.copyFailed')
              : tOnline('share.cta')}
        </button>
        <button
          type="button"
          onClick={() => setShowTv((v) => !v)}
          aria-expanded={showTv}
          className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-gold/30 bg-felt-deep/60 px-2 py-2.5 text-xs font-bold text-cream transition-colors hover:bg-gold/10"
        >
          <Tv className="h-3.5 w-3.5 shrink-0 text-gold" />
          {tTv('modeTv')}
        </button>
        <button
          type="button"
          onClick={() => setShowInvite((v) => !v)}
          aria-expanded={showInvite}
          className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-gold/30 bg-felt-deep/60 px-2 py-2.5 text-xs font-bold text-cream transition-colors hover:bg-gold/10"
        >
          <Mail className="h-3.5 w-3.5 shrink-0 text-gold" />
          {tOnline('invites.inviteFriend')}
        </button>
      </div>

      {showTv && (
        <div className="mb-3 flex flex-col items-center gap-3 rounded-2xl border border-gold/20 bg-felt-deep/70 px-4 py-4 text-center">
          <p className="text-xs leading-relaxed text-cream/70">{tTv('modeTvHint')}</p>
          <p className="rounded-xl border border-[#D8CCAE] bg-cream px-5 py-2 font-mono text-3xl font-black tracking-[0.3em] text-[#24201A]">
            {room.code}
          </p>
          {/* Le seul chemin vers /tv dans tout le produit : sans ce lien, il
              fallait taper l'URL à la main. Nouvel onglet (et <a> nu, sans
              préfixe de langue) — le téléphone reste la manette de la table.
              Pas dans l'app : la WebView n'ouvre pas de seconde fenêtre, le
              lien chargeait /tv À LA PLACE du lobby (sans retour) et « nouvel
              onglet » devenait faux. Il y reste le code, le QR et la consigne
              « Ouvre lepillaveur.fr/tv sur ta télé » ci-dessus. */}
          {!inApp && (
            <>
              <a
                href={`/tv/${room.code}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 py-2.5 text-xs font-bold text-amber-200 transition-colors hover:bg-amber-500/20"
              >
                <Tv className="h-3.5 w-3.5" />
                {tTv('openTvScreen')}
              </a>
              <p className="text-xs leading-relaxed text-cream/60">{tTv('openTvScreenHint')}</p>
            </>
          )}
          <JoinQR
            url={`${typeof window !== 'undefined' ? window.location.origin : ''}/invite/${room.code}`}
            size={128}
          />
          <p className="text-xs text-cream/60">{tTv('scanToJoin')}</p>
        </div>
      )}

      {showInvite && (
        <div className="mb-4 rounded-2xl border border-gold/20 bg-felt-deep/70 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gold/80">
            {tOnline('invites.inviteFriend')}
          </p>
          {/* Le QR d'abord : le moyen le plus direct de faire entrer quelqu'un
              (lien sans préfixe de langue — l'invité arrive dans SA langue). */}
          <div className="mb-3 flex flex-col items-center gap-2 rounded-xl border border-gold/10 bg-felt-deep/60 px-3 py-4 text-center">
            <JoinQR
              url={`${typeof window !== 'undefined' ? window.location.origin : ''}/invite/${room.code}`}
              size={132}
            />
            <p className="font-mono text-lg font-black tracking-[0.25em] text-cream">{room.code}</p>
            <p className="max-w-[16rem] text-xs leading-relaxed text-cream/70">{tOnline('invites.qrHint')}</p>
          </div>
          {isHost && visibility !== 'public' && (
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gold/80">
              {tOnline('invites.friendsTitle')}
            </p>
          )}
          {isHost && visibility !== 'public' && (friends.length === 0 ? (
            <p className="text-sm text-cream/70">{tOnline('invites.noFriendsToInvite')}</p>
          ) : (
            <ul className="space-y-2">
              {friends
                .filter((f) => !room.members.some((m) => m.userId === f.userId))
                .map((f) => {
                  const invited = invitedIds.has(f.userId)
                  return (
                    <li
                      key={f.userId}
                      className="flex items-center justify-between gap-3 rounded-xl border border-gold/10 bg-felt-deep/60 px-3 py-2"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className={cn('h-2 w-2 shrink-0 rounded-full', f.isOnline ? 'bg-emerald-400' : 'bg-cream/30')} />
                        <span className="truncate text-sm font-medium text-cream">{f.displayName}</span>
                      </div>
                      <button
                        type="button"
                        disabled={invited}
                        onClick={() => handleInviteFriend(f.userId)}
                        aria-label={tOnline('invites.inviteFriend')}
                        className={cn(
                          'flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-colors',
                          invited ? 'border border-gold/20 text-cream/70' : 'bg-amber-500 text-[#24201A] hover:bg-amber-400'
                        )}
                      >
                        <Mail className="h-3.5 w-3.5" />
                        {invited ? tOnline('invites.pending') : tOnline('invites.inviteFriend')}
                      </button>
                    </li>
                  )
                })}
            </ul>
          ))}
        </div>
      )}

      {gameId === 'toucher-coule' && (() => {
        const perTeam = TC_PLAYERS_PER_TEAM[tcMode]
        const teams = room.settings.tcTeams ?? {}
        const myTeam = user ? teams[user.id] : undefined
        const teamMembers = (team: 'A' | 'B') =>
          room.members.filter((m) => teams[m.userId] === team).slice(0, perTeam)
        return (
          <>
            <div className="mb-4 rounded-2xl border border-gold/20 bg-felt-deep/70 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gold/80">
                {tTc('mode')}
              </p>
              {hostOnlyLegend}
              <div className="grid grid-cols-4 gap-2">
                {TC_MODE_OPTIONS.map((value) => {
                  const active = tcMode === value
                  return (
                    <button
                      key={value}
                      type="button"
                      disabled={!isHost}
                      onClick={() => updateSettings({ tcMode: value })}
                      title={tTc(`modes.${value}.desc`)}
                      className={cn('rounded-xl border px-2 py-3 text-center', optionTone(active, isHost))}
                    >
                      <span className="block text-sm font-bold">{tTc(`modes.${value}.label`)}</span>
                      <span className={cn('mt-0.5 block break-words text-xs leading-tight hyphens-auto', optionHint(active))}>
                        {tTc(`modes.${value}.desc`)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="mb-4 rounded-2xl border border-gold/20 bg-felt-deep/70 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gold/80">
                {tTc('teams')}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(['A', 'B'] as const).map((team) => {
                  const inTeam = teamMembers(team)
                  const slots = Array.from({ length: perTeam })
                  const isMine = myTeam === team
                  return (
                    <div
                      key={team}
                      className={cn(
                        'rounded-xl border p-2.5',
                        team === 'A' ? 'border-sky-400/25 bg-sky-500/10' : 'border-rose-400/25 bg-rose-500/10'
                      )}
                    >
                      <p className={cn('mb-2 text-xs font-bold', team === 'A' ? 'text-sky-300' : 'text-rose-300')}>
                        {team === 'A' ? tTc('teamA') : tTc('teamB')}
                      </p>
                      <ul className="mb-2 space-y-1">
                        {slots.map((_, i) => {
                          const member = inTeam[i]
                          return (
                            <li
                              key={i}
                              className={cn(
                                'truncate rounded-lg px-2 py-1',
                                member ? 'bg-black/25 text-sm font-medium text-cream' : 'bg-white/5 text-xs text-cream/60'
                              )}
                            >
                              {member ? (
                                <>
                                  {member.preferences?.icon && (
                                    <span aria-hidden className="mr-1">
                                      <PlayerAvatarGlyph value={member.preferences.icon} />
                                    </span>
                                  )}
                                  {member.displayName}
                                </>
                              ) : (
                                tTc('botSlot')
                              )}
                            </li>
                          )
                        })}
                      </ul>
                      {!isMine && (
                        <button
                          type="button"
                          onClick={() => setTeam(team)}
                          className={cn(
                            'min-h-[44px] w-full rounded-lg py-1.5 text-xs font-bold text-cream transition-colors',
                            team === 'A' ? 'bg-sky-700 hover:bg-sky-800' : 'bg-rose-700 hover:bg-rose-800'
                          )}
                        >
                          {tTc('joinTeam')}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
              <p className="mt-2 text-xs text-cream/60">{tTc('botsFill')}</p>
            </div>

            <div className="mb-4 rounded-2xl border border-gold/20 bg-felt-deep/70 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gold/80">
                {tTc('variants')}
              </p>
              {(() => {
                const active = Boolean(room.settings.tcPowerups)
                return (
                  <button
                    type="button"
                    disabled={!isHost}
                    aria-pressed={active}
                    onClick={() => updateSettings({ tcPowerups: !active })}
                    className={cn('w-full rounded-xl border px-3 py-3 text-left', optionTone(active, isHost))}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-black">
                      <Bomb aria-hidden className="h-4 w-4 shrink-0" />
                      {tTc('powerups')}
                    </span>
                    <span className={cn('mt-0.5 block text-xs', optionHint(active))}>
                      {tTc('powerupsHint')}
                    </span>
                  </button>
                )
              })()}
            </div>
          </>
        )
      })()}

      {/* Réglages de table repliés : le résumé suffit tant qu'on ne touche
          à rien — visibilité, bots et options du jeu vivent dedans.
          (Les équipes Toucher-Coulé restent au-dessus : c'est un choix de
          JOUEUR, pas un réglage d'hôte.) */}
      <div className="mb-4 overflow-hidden rounded-2xl border border-gold/20 bg-felt-deep/70">
        <button
          type="button"
          onClick={() => setShowSettings((v) => !v)}
          aria-expanded={showSettings}
          className="flex min-h-[48px] w-full items-center gap-2 px-4 py-3 text-sm font-semibold text-cream transition-colors hover:bg-gold/10"
        >
          <Settings className="h-4 w-4 shrink-0 text-gold" />
          <span className="shrink-0">{tOnline('settings.title')}</span>
          <span className="min-w-0 flex-1 truncate text-left text-xs font-normal text-cream/70">
            · {tOnline(`visibility.${visibility}`)}
            {(room.settings.botsCount ?? 0) > 0 && ` · ${tOnline('settings.botsSummary', { count: room.settings.botsCount ?? 0 })}`}
          </span>
          {!isHost && <Lock aria-hidden className="h-3.5 w-3.5 shrink-0 text-cream/60" />}
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-cream/60 transition-transform', showSettings && 'rotate-180')} />
        </button>
        <div className={cn('border-t border-gold/20 p-4 pb-0', !showSettings && 'hidden')}>
          {hostOnlyLegend}

      <div className="mb-4 rounded-2xl border border-gold/10 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gold/80">
          {tOnline('visibility.title')}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {VISIBILITY_OPTIONS.map((value) => {
            const active = visibility === value
            const Icon = VISIBILITY_ICON[value]
            return (
              <button
                key={value}
                type="button"
                disabled={!isHost}
                onClick={() => updateSettings({ visibility: value })}
                title={tOnline(`visibility.${value}Desc`)}
                className={cn('flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center', optionTone(active, isHost))}
              >
                <Icon className="h-4 w-4" />
                <span className="text-xs font-bold">{tOnline(`visibility.${value}`)}</span>
              </button>
            )
          })}
        </div>
      </div>

      {gameId === 'petit-buveur' && (
        <div className="mb-4 rounded-2xl border border-gold/10 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gold/80">
            {tPb('difficulty')}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {PB_DIFFICULTIES.map((value) => {
              const active = (room.settings.difficulty ?? 'normal') === value
              return (
                <button
                  key={value}
                  type="button"
                  disabled={!isHost}
                  onClick={() => updateSettings({ difficulty: value })}
                  className={cn('rounded-xl border px-3 py-3 text-left', optionTone(active, isHost))}
                >
                  <span className="flex items-center gap-1.5 text-sm font-bold">
                    <span aria-hidden className={cn('h-2.5 w-2.5 shrink-0 rounded-full border border-black/20', PB_DIFFICULTY_DOT[value])} />
                    {tPb(`difficulties.${value}.label`)}
                  </span>
                  <span className={cn('mt-0.5 block text-xs', optionHint(active))}>
                    {tPb(`difficulties.${value}.desc`)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Nombre de bots ajoutés (hôte) : permet de lancer sous le minimum d'humains. */}
      {game?.botsFillable && (() => {
        const botsCount = Math.max(0, room.settings.botsCount ?? 0)
        const maxBots = Math.max(0, (game.maxPlayers ?? 12) - room.members.length)
        return (
          <div className="mb-4 rounded-2xl border border-gold/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-bold text-cream">
                  <Bot aria-hidden className="h-4 w-4 shrink-0 text-gold" />
                  {tOnline('botsFill.title')}
                </p>
                <p className="mt-0.5 text-xs text-cream/70">
                  {tOnline('botsFill.hint', { min: game.minPlayers ?? 2 })}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1 rounded-xl border border-gold/20 bg-felt-deep/60 p-1">
                <button
                  type="button"
                  disabled={!isHost || botsCount <= 0}
                  onClick={() => updateSettings({ botsCount: botsCount - 1 })}
                  className="game-grid-cell flex h-11 w-11 items-center justify-center rounded-lg bg-white/10 text-lg font-black text-cream transition-colors hover:bg-gold/20 disabled:opacity-30"
                  aria-label={tOnline('botsFill.remove')}
                >
                  −
                </button>
                <span className="w-6 text-center text-lg font-black tabular-nums text-cream">
                  {botsCount}
                </span>
                <button
                  type="button"
                  disabled={!isHost || botsCount >= maxBots}
                  onClick={() => updateSettings({ botsCount: botsCount + 1 })}
                  className="game-grid-cell flex h-11 w-11 items-center justify-center rounded-lg bg-white/10 text-lg font-black text-cream transition-colors hover:bg-gold/20 disabled:opacity-30"
                  aria-label={tOnline('botsFill.add')}
                >
                  +
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {gameId === 'quiz' && (
        <div className="mb-4 rounded-2xl border border-gold/10 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gold/80">
            {tQuiz('questionCount')}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[10, 15, 20].map((value) => {
              const active = (room.settings.quizCount ?? 10) === value
              return (
                <button
                  key={value}
                  type="button"
                  disabled={!isHost}
                  onClick={() => updateSettings({ quizCount: value })}
                  className={cn('rounded-xl border px-3 py-3 text-center', optionTone(active, isHost))}
                >
                  <span className="block text-lg font-black">{value}</span>
                  <span className={cn('mt-0.5 block truncate text-xs', optionHint(active))}>
                    {tQuiz('questions')}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {gameId === 'bluff' && (
        <div className="mb-4 rounded-2xl border border-gold/10 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gold/80">
            {tBluff('roundsCount')}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[6, 8, 10].map((value) => {
              const active = (room.settings.bluffRounds ?? 8) === value
              return (
                <button
                  key={value}
                  type="button"
                  disabled={!isHost}
                  onClick={() => updateSettings({ bluffRounds: value })}
                  className={cn('rounded-xl border px-3 py-3 text-center', optionTone(active, isHost))}
                >
                  <span className="block text-lg font-black">{value}</span>
                  <span className={cn('mt-0.5 block truncate text-xs', optionHint(active))}>
                    {tBluff('rounds')}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {gameId === 'sans-filtre' && (
        <div className="mb-4 rounded-2xl border border-gold/10 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gold/80">
            {tSf('roundsCount')}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[5, 8, 12].map((value) => {
              const active = (room.settings.sfRounds ?? 8) === value
              return (
                <button
                  key={value}
                  type="button"
                  disabled={!isHost}
                  onClick={() => updateSettings({ sfRounds: value })}
                  className={cn('rounded-xl border px-3 py-3 text-center', optionTone(active, isHost))}
                >
                  <span className="block text-lg font-black">{value}</span>
                  <span className={cn('mt-0.5 block truncate text-xs', optionHint(active))}>
                    {tSf('rounds')}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {gameId === 'dilemmes' && (
        <div className="mb-4 rounded-2xl border border-gold/10 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gold/80">
            {tDil('roundsCount')}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[10, 15, 20].map((value) => {
              const active = (room.settings.dilRounds ?? 10) === value
              return (
                <button
                  key={value}
                  type="button"
                  disabled={!isHost}
                  onClick={() => updateSettings({ dilRounds: value })}
                  className={cn('rounded-xl border px-3 py-3 text-center', optionTone(active, isHost))}
                >
                  <span className="block text-lg font-black">{value}</span>
                  <span className={cn('mt-0.5 block truncate text-xs', optionHint(active))}>
                    {tDil('rounds')}
                  </span>
                </button>
              )
            })}
          </div>
          {/* Mode coquin : cartes grivoises par sous-entendu, opt-in de l'hôte. */}
          <button
            type="button"
            disabled={!isHost}
            aria-pressed={Boolean(room.settings.dilCoquin)}
            onClick={() => updateSettings({ dilCoquin: !room.settings.dilCoquin })}
            className={cn('mt-3 flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left', optionTone(room.settings.dilCoquin, isHost))}
          >
            <span>
              <span className="flex items-center gap-1.5 text-sm font-black">
                <Flame aria-hidden className="h-4 w-4 shrink-0" />
                {tDil('coquin')}
              </span>
              <span className={cn('mt-0.5 block text-xs', optionHint(room.settings.dilCoquin))}>
                {tDil('coquinHint')}
              </span>
            </span>
            <span
              className={cn(
                'shrink-0 text-xs font-bold uppercase tracking-wide',
                room.settings.dilCoquin ? 'text-[#24201A]' : 'text-cream/60'
              )}
            >
              {room.settings.dilCoquin ? tDil('coquinOn') : tDil('coquinOff')}
            </span>
          </button>
        </div>
      )}

      {gameId === 'petit-bac' && (
        <div className="mb-4 rounded-2xl border border-gold/10 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gold/80">
            {tPbc('roundsCount')}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[3, 5, 8].map((value) => {
              const active = (room.settings.pbcRounds ?? 3) === value
              return (
                <button
                  key={value}
                  type="button"
                  disabled={!isHost}
                  onClick={() => updateSettings({ pbcRounds: value })}
                  className={cn('rounded-xl border px-3 py-3 text-center', optionTone(active, isHost))}
                >
                  <span className="block text-lg font-black">{value}</span>
                  <span className={cn('mt-0.5 block truncate text-xs', optionHint(active))}>
                    {tPbc('rounds')}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {gameId === 'president' && (
        <div className="mb-4 rounded-2xl border border-gold/10 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gold/80">
            {tPre('manchesCount')}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[1, 3, 5].map((value) => {
              const active = (room.settings.preManches ?? 3) === value
              return (
                <button
                  key={value}
                  type="button"
                  disabled={!isHost}
                  onClick={() => updateSettings({ preManches: value })}
                  className={cn('rounded-xl border px-3 py-3 text-center', optionTone(active, isHost))}
                >
                  <span className="block text-lg font-black">{value}</span>
                  <span className={cn('mt-0.5 block truncate text-xs', optionHint(active))}>
                    {tPre('manches')}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {gameId === 'espion' && (
        <>
          <div className="mb-4 rounded-2xl border border-gold/10 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gold/80">
              {tEspion('discussionMin')}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[3, 5, 7].map((value) => {
                // La durée qui sera RÉELLEMENT jouée : sans choix de l'hôte,
                // 3 min quand il est seul face aux bots (espionDiscussionMinutes,
                // la même règle que le lanceur) — surligner « 5 » mentirait.
                const active = espionDiscussionMinutes(room.settings.espionDiscussionMin, room.members.length) === value
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={!isHost}
                    onClick={() => updateSettings({ espionDiscussionMin: value })}
                    className={cn('rounded-xl border px-3 py-3 text-center', optionTone(active, isHost))}
                  >
                    <span className="block text-lg font-black">{value}</span>
                    <span className={cn('mt-0.5 block truncate text-xs', optionHint(active))}>
                      {tEspion('minutes')}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="mb-4 rounded-2xl border border-gold/10 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gold/80">
              {tEspion('roundsToWin')}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[3, 5, 7].map((value) => {
                const active = (room.settings.espionRoundsToWin ?? 3) === value
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={!isHost}
                    onClick={() => updateSettings({ espionRoundsToWin: value })}
                    className={cn('rounded-xl border px-3 py-3 text-center', optionTone(active, isHost))}
                  >
                    <span className="block text-lg font-black">{value}</span>
                    <span className={cn('mt-0.5 block truncate text-xs', optionHint(active))}>
                      {tEspion('rounds')}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}

      {gameId === 'mots-codes' && (() => {
        const teams = room.settings.mcTeams ?? {}
        const teamMembers = (team: 'A' | 'B') => room.members.filter((m) => teams[m.userId] === team)
        const myTeam = user ? teams[user.id] : undefined
        return (
          <div className="mb-4 rounded-2xl border border-gold/10 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gold/80">
              {tMc('teams')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(['A', 'B'] as const).map((team) => {
                const inTeam = teamMembers(team)
                const isMine = myTeam === team
                return (
                  <div
                    key={team}
                    className={cn(
                      'rounded-xl border p-2.5',
                      team === 'A' ? 'border-amber-400/25 bg-amber-500/10' : 'border-red-400/25 bg-red-500/10'
                    )}
                  >
                    <p className={cn('mb-2 text-xs font-bold', team === 'A' ? 'text-amber-300' : 'text-red-300')}>
                      {team === 'A' ? tMc('teamGold') : tMc('teamRed')}
                    </p>
                    <ul className="mb-2 min-h-[1.75rem] space-y-1">
                      {inTeam.length === 0 && (
                        <li className="rounded-lg bg-white/5 px-2 py-1 text-xs text-cream/60">{tMc('autoSlot')}</li>
                      )}
                      {inTeam.map((member) => (
                        <li key={member.userId} className="truncate rounded-lg bg-black/25 px-2 py-1 text-sm font-medium text-cream">
                          {member.preferences?.icon && (
                            <span aria-hidden className="mr-1">
                              <PlayerAvatarGlyph value={member.preferences.icon} />
                            </span>
                          )}
                          {member.displayName}
                        </li>
                      ))}
                    </ul>
                    {!isMine && (
                      <button
                        type="button"
                        onClick={() => setTeam(team)}
                        className={cn(
                          'min-h-[44px] w-full rounded-lg py-1.5 text-xs font-bold transition-colors',
                          team === 'A' ? 'bg-amber-500 text-[#24201A] hover:bg-amber-400' : 'bg-red-700 text-cream hover:bg-red-800'
                        )}
                      >
                        {tMc('joinTeam')}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            <p className="mt-2 text-xs text-cream/60">{tMc('teamsHint')}</p>
          </div>
        )
      })()}

      {gameId === 'tabou' && (() => {
        const teams = room.settings.tabouTeams ?? {}
        const teamMembers = (team: 'A' | 'B') => room.members.filter((m) => teams[m.userId] === team)
        const myTeam = user ? teams[user.id] : undefined
        return (
          <>
            <div className="mb-4 rounded-2xl border border-gold/10 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gold/80">
                {tTabou('teams')}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(['A', 'B'] as const).map((team) => {
                  const inTeam = teamMembers(team)
                  const isMine = myTeam === team
                  return (
                    <div
                      key={team}
                      className={cn(
                        'rounded-xl border p-2.5',
                        team === 'A' ? 'border-sky-400/25 bg-sky-500/10' : 'border-rose-400/25 bg-rose-500/10'
                      )}
                    >
                      <p className={cn('mb-2 text-xs font-bold', team === 'A' ? 'text-sky-300' : 'text-rose-300')}>
                        {team === 'A' ? tTabou('teamA') : tTabou('teamB')}
                      </p>
                      <ul className="mb-2 min-h-[1.75rem] space-y-1">
                        {inTeam.length === 0 && (
                          <li className="rounded-lg bg-white/5 px-2 py-1 text-xs text-cream/60">{tTabou('openSeat')}</li>
                        )}
                        {inTeam.map((member) => (
                          <li key={member.userId} className="truncate rounded-lg bg-black/25 px-2 py-1 text-sm font-medium text-cream">
                            {member.preferences?.icon && (
                              <span aria-hidden className="mr-1">
                                <PlayerAvatarGlyph value={member.preferences.icon} />
                              </span>
                            )}
                            {member.displayName}
                          </li>
                        ))}
                      </ul>
                      {!isMine && (
                        <button
                          type="button"
                          onClick={() => setTeam(team)}
                          className={cn(
                            'min-h-[44px] w-full rounded-lg py-1.5 text-xs font-bold text-cream transition-colors',
                            team === 'A' ? 'bg-sky-700 hover:bg-sky-800' : 'bg-rose-700 hover:bg-rose-800'
                          )}
                        >
                          {tTabou('joinTeam')}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
              <p className="mt-2 text-xs text-cream/60">{tTabou('teamRule')}</p>
            </div>

            <div className="mb-4 rounded-2xl border border-gold/10 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gold/80">
                {tTabou('targetScore')}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[15, 20, 25].map((value) => {
                  const active = (room.settings.tabouTargetScore ?? 20) === value
                  return (
                    <button
                      key={value}
                      type="button"
                      disabled={!isHost}
                      onClick={() => updateSettings({ tabouTargetScore: value })}
                      className={cn('rounded-xl border px-3 py-3 text-center', optionTone(active, isHost))}
                    >
                      <span className="block text-lg font-black">{value}</span>
                      <span className={cn('mt-0.5 block truncate text-xs', optionHint(active))}>
                        {tTabou('points')}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        )
      })()}

      {gameId === 'crobard' && (
        <div className="mb-4 rounded-2xl border border-gold/10 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gold/80">
            {tCrobard('roundsCount')}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[6, 8, 10].map((value) => {
              const active = (room.settings.crobardRounds ?? 8) === value
              return (
                <button
                  key={value}
                  type="button"
                  disabled={!isHost}
                  onClick={() => updateSettings({ crobardRounds: value })}
                  className={cn('rounded-xl border px-3 py-3 text-center', optionTone(active, isHost))}
                >
                  <span className="block text-lg font-black">{value}</span>
                  <span className={cn('mt-0.5 block truncate text-xs', optionHint(active))}>
                    {tCrobard('rounds')}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {gameId === 'loup-garou' && (
        <div className="mb-4 rounded-2xl border border-gold/10 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gold/80">
            {tLg('debate')}
          </p>
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((value) => {
              // La durée qui sera RÉELLEMENT jouée : sans choix de l'hôte,
              // 1 min quand il est seul face aux bots (lgDebateMinutes, la
              // même règle que le lanceur) — surligner « 3 » mentirait.
              const active = lgDebateMinutes(room.settings.lgDebateMin, room.members.length) === value
              return (
                <button
                  key={value}
                  type="button"
                  disabled={!isHost}
                  onClick={() => updateSettings({ lgDebateMin: value })}
                  className={cn('rounded-xl border px-2 py-3 text-center', optionTone(active, isHost))}
                >
                  <span className="block text-lg font-black">{value}</span>
                  <span className={cn('mt-0.5 block truncate text-xs', optionHint(active))}>
                    {tLg('minutes')}
                  </span>
                </button>
              )
            })}
          </div>
          {/* Loup supplémentaire : proposé uniquement aux tables de 5 (à 4,
              2 loups gagneraient d'entrée — le moteur l'ignore de toute façon). */}
          {room.members.length + (room.settings.botsCount ?? 0) === 5 && (
            <button
              type="button"
              disabled={!isHost}
              aria-pressed={Boolean(room.settings.lgExtraWolf)}
              onClick={() => updateSettings({ lgExtraWolf: !room.settings.lgExtraWolf })}
              className={cn('mt-2 w-full rounded-xl border px-3 py-3 text-left', optionTone(room.settings.lgExtraWolf, isHost))}
            >
              <span className="block text-sm font-black">{tLg('extraWolf')}</span>
              <span className={cn('mt-0.5 block text-xs', optionHint(room.settings.lgExtraWolf))}>
                {tLg('extraWolfHint')}
              </span>
            </button>
          )}
        </div>
      )}

      {gameId === 'menteur' && (
        <div className="mb-4 rounded-2xl border border-gold/10 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gold/80">
            {tMenteur('variants')}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { key: 'menteurPalifico' as const, label: tMenteur('palifico'), hint: tMenteur('palificoHint') },
                { key: 'menteurCalza' as const, label: tMenteur('calza'), hint: tMenteur('calzaHint') },
              ]
            ).map(({ key, label, hint }) => {
              const active = Boolean(room.settings[key])
              return (
                <button
                  key={key}
                  type="button"
                  disabled={!isHost}
                  aria-pressed={active}
                  onClick={() => updateSettings({ [key]: !active })}
                  className={cn('rounded-xl border px-3 py-3 text-left', optionTone(active, isHost))}
                >
                  <span className="block text-sm font-black">{label}</span>
                  <span className={cn('mt-0.5 block text-xs', optionHint(active))}>
                    {hint}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {gameId === 'imposteur' && (() => {
        const estPlayers = Math.max(IMPOSTEUR_MIN_PLAYERS, room.members.length + (room.settings.botsCount ?? 0))
        const maxCount = maxImposteurCount(estPlayers)
        const current = Math.min(room.settings.imposteurCount ?? imposteurCountFor(estPlayers), maxCount)
        const options = Array.from({ length: maxCount }, (_, i) => i + 1)
        return (
          <div className="mb-4 rounded-2xl border border-gold/10 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-gold/80">
              {tImposteur('count')}
            </p>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
              {options.map((value) => {
                const active = current === value
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={!isHost}
                    onClick={() => updateSettings({ imposteurCount: value })}
                    className={cn('rounded-xl border px-2 py-3 text-center', optionTone(active, isHost))}
                  >
                    <span className="block text-lg font-black">{value}</span>
                    <span className={cn('mt-0.5 block truncate text-xs', optionHint(active))}>
                      {tImposteur(value > 1 ? 'imposteursPlural' : 'imposteurSingular')}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })()}

        </div>
      </div>

      {/* Espace réservé à la hauteur MESURÉE de la barre fixe (libellé sur
          deux lignes, ligne « sans les retardataires », safe-area) : rien ne
          passe sous elle. Avant la première mesure, une estimation. */}
      <div
        aria-hidden
        style={bottomBarHeight ? { height: bottomBarHeight } : undefined}
        className={bottomBarHeight ? undefined : 'h-[calc(6rem+env(safe-area-inset-bottom))]'}
      />

      {/* L'action du moment, fixe en zone pouce, safe-area comprise. Hôte : un
          seul bouton « Lancer » (il compte prêt, cf. lobbyLaunchStatus), ou
          l'attente en clair — plus de bouton grisé à 2:1 qui portait le
          compte. Invité : « Je suis prêt » en or, puis l'état « Prêt », avec
          de quoi se raviser. */}
      <div
        ref={bottomBarRef}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-gold/20 bg-felt-deep/90 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl"
      >
        {/* Un refus (lancement, prêt, réglage) se lit là où le doigt vient
            de toucher, pas en fin de page sous les réglages. */}
        {error && (
          <p role="alert" className="mx-auto mb-2 w-full max-w-lg text-center text-sm font-semibold text-red-300">
            {error}
          </p>
        )}
        <div className="mx-auto flex w-full max-w-lg items-center gap-3">
          {canLaunchSoloWithBots ? (
            /* Hôte seul + bots suffisants : « prêt » puis « lancer » enchaînés. */
            <Button
              variant="primary"
              size="gameLg"
              onClick={() => void launchSoloWithBots()}
              disabled={soloLaunching || loading}
              className="flex-1 gap-2"
            >
              <Play className="h-4 w-4" />
              {tOnline('launch.withBots')}
            </Button>
          ) : isHost ? (
            launchStatus.launchable ? (
              <Button
                variant="primary"
                size="gameLg"
                onClick={() => void launchAsHost()}
                disabled={hostLaunching || loading}
                className="flex-1 gap-2"
              >
                <Play className="h-4 w-4" />
                {tOnline('launch.cta')}
              </Button>
            ) : (
              <p
                role="status"
                className="flex min-h-[56px] flex-1 items-center justify-center gap-2 rounded-2xl border border-gold/40 bg-felt-deep px-4 py-2 text-center text-sm font-semibold leading-snug text-cream"
              >
                <Hourglass aria-hidden className="h-4 w-4 shrink-0 text-gold" />
                {hostBlockedLabel}
              </p>
            )
          ) : selfMember?.isReady ? (
            <div className="flex min-h-[56px] flex-1 items-center gap-2 rounded-2xl border border-emerald-400/40 bg-emerald-500/[0.15] py-1.5 pl-4 pr-1.5">
              <Check aria-hidden className="h-5 w-5 shrink-0 text-emerald-300" />
              <p role="status" className="min-w-0 flex-1 text-sm font-semibold leading-snug text-emerald-100">
                {tOnline('launch.guestReady', { name: hostName, ...readyCounts })}
              </p>
              <button
                type="button"
                onClick={() => void setReady(false)}
                className="min-h-[44px] shrink-0 rounded-xl px-3 text-xs font-semibold text-cream/80 underline underline-offset-2 transition-colors hover:bg-gold/10 hover:text-cream"
              >
                {tOnline('launch.notYet')}
              </button>
            </div>
          ) : (
            <Button variant="primary" size="gameLg" onClick={() => void setReady(true)} className="flex-1 gap-2">
              <Check className="h-5 w-5" />
              {tOnline('readyButton.off')}
            </Button>
          )}
        </div>
        {/* Sous le lancement, discret : « Lancer sans les retardataires ».
            Désactivé (rappel en clair, un titre ne se lit pas au doigt) tant
            que ceux qui restent ne font pas le minimum du jeu. Une boîte de
            44 px DANS le flux, sous la rangée : pas de `.touch-target`, dont
            la zone centrée débordait sur le bouton de lancement. */}
        {showForceLaunch && (
          <div className="mx-auto mt-1 w-full max-w-lg text-center">
            <button
              type="button"
              onClick={() => void launchWithoutLate()}
              disabled={!forceLaunch.allowed || forceLaunching || loading}
              className="min-h-[44px] px-3 text-xs font-semibold text-amber-200 underline-offset-2 transition-colors hover:text-amber-100 hover:underline disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:no-underline"
            >
              {tOnline('launch.force', { count: forceLaunch.late })}
            </button>
            {!forceLaunch.allowed && (
              <p className="text-xs text-cream/70">
                {tOnline('launch.forceBlocked', { count: forceLaunch.missing })}
              </p>
            )}
          </div>
        )}
      </div>
    </LobbyShell>
  )
}
