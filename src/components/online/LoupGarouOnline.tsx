"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import {
  Ban,
  Beer,
  Bird,
  BookOpen,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  FlaskConical,
  Ghost,
  Handshake,
  Heart,
  Hourglass,
  Loader2,
  Medal,
  Megaphone,
  MessageCircle,
  Moon,
  Scale,
  Send,
  Shield,
  Skull,
  Sparkles,
  Sun,
  Target,
  Trophy,
  Vote,
  Wheat,
  X,
} from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { usePagePresence } from '@/hooks/usePagePresence'
import { chatCursorQuery, mergeMessages } from '@/lib/chat-delta'
import { GameOnlineLobby } from './GameOnlineLobby'
import { OnlineEndScreen } from './OnlineEndScreen'
import { OnlineActionBar, onlineActionBarPadding } from './OnlineActionBar'
import { PhaseHeader } from './PhaseHeader'
import { Button } from '@/components/ui/button'
import { PlayingCard, PlayingCardBack } from '@/components/ui/PlayingCard'
import { WolfIcon } from '@/components/icons/GameIcons'
import { GameIconById } from '@/components/hub/GameIconById'
import { cn } from '@/lib/utils'
import {
  lgTeamOf,
  LG_SPEECH_CAP,
  type LGClientView,
  type LGPlayerView,
  type LGRole,
} from '@/lib/loup-garou/engine'
import type { LGSpeakKind } from '@/lib/loup-garou/server-adapter'
import { useAdvanceTick, useBotReferee } from '@/hooks/useBotReferee'
import { useGameAction } from '@/hooks/useGameAction'
import { playGameSound } from '@/lib/sound/game-sounds'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial } from './GameTutorialModal'
import { OnlinePlayerName, RankCrest, useMemberCosmetics } from './OnlinePlayerTag'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { XpGainBanner } from './XpGainBanner'
import { DebateFeed } from './loup-garou/DebateFeed'
import { TargetGrid } from './TargetGrid'
import { lgPlayerIcon } from './loup-garou/debate-feed'
import { genreOf, genreOfId } from './bot-speech/bot-speech-feed'

/**
 * LOUP-GAROU en ligne. La vue reçue est déjà filtrée par le serveur selon QUI
 * regarde (villageois / loup / fantôme omniscient) — ce composant ne fait
 * qu'afficher ce qu'on lui donne. Pendant la nuit, les joueurs SANS action
 * voient tous exactement le même écran « le village dort » (anti-leak).
 *
 * Anti-fuite à l'ŒIL aussi : la nuit, tous les téléphones montrent la même
 * silhouette — même cadre bleu nuit, une grille de cartes du village (à
 * toucher pour l'acteur, posée pour le dormeur), la même ligne d'état dans la
 * barre du bas. Une grille crème vive face à un panneau sombre désignait
 * l'acteur au voisin de canapé.
 *
 * Gestes irréversibles (le moteur refuse tout second vote, toute seconde
 * potion, tout second tir) : on CHOISIT dans la grille, on VALIDE dans la
 * barre du bas, avec le nom écrit sur le bouton. Seul le vote des loups,
 * modifiable jusqu'au bout, part au premier toucher.
 */

function parseView(json: string | null | undefined): LGClientView | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as LGClientView
    return Array.isArray(v.players) && typeof v.phase === 'string' ? v : null
  } catch {
    return null
  }
}

/**
 * Icône SVG + couleurs de chaque rôle : `color` sur feutre (fond sombre),
 * `ink` sur carte crème (encre foncée) — les cosmétiques clairs des pseudos
 * ne s'affichent QUE sur feutre, jamais sur crème (contraste).
 */
const ROLE_META: Record<
  LGRole,
  { Icon: ComponentType<{ className?: string }>; color: string; ink: string }
> = {
  loup: { Icon: WolfIcon, color: 'text-red-300', ink: 'text-suit-red' },
  voyante: { Icon: Sparkles, color: 'text-purple-300', ink: 'text-purple-800' },
  sorciere: { Icon: FlaskConical, color: 'text-emerald-300', ink: 'text-emerald-800' },
  chasseur: { Icon: Target, color: 'text-amber-300', ink: 'text-amber-700' },
  salvateur: { Icon: Shield, color: 'text-cyan-300', ink: 'text-cyan-800' },
  corbeau: { Icon: Bird, color: 'text-slate-300', ink: 'text-slate-600' },
  ancien: { Icon: Hourglass, color: 'text-orange-300', ink: 'text-orange-800' },
  villageois: { Icon: Wheat, color: 'text-sky-300', ink: 'text-sky-800' },
}

/** Ordre d'affichage de la légende. */
const LEGEND_ROLES: LGRole[] = [
  'loup',
  'voyante',
  'sorciere',
  'chasseur',
  'salvateur',
  'corbeau',
  'ancien',
  'villageois',
]

const PHASE_TOTAL_MS: Record<string, number> = {
  'reveal-role': 10_000,
  'mayor-election': 30_000,
  'night-guard': 25_000,
  'night-seer': 30_000,
  'night-raven': 25_000,
  'night-wolves': 45_000,
  'night-witch': 30_000,
  dawn: 10_000,
  'hunter-shot': 20_000,
  'day-vote': 60_000,
  'day-revote': 45_000,
}

const NIGHT_PHASES = new Set([
  'night-guard',
  'night-seer',
  'night-raven',
  'night-wolves',
  'night-witch',
])

/** Paroles du débat qui chargent un joueur : l'accusation, et le « bien vu » qui s'y rallie. */
const ACCUSING_KINDS = new Set(['suspect', 'rally'])

/** Cadence conservée : une relève en delta ne coûte presque rien au repos. */
const GAME_CHAT_POLL_MS = 3000

/** Cadre de toutes les feuilles de nuit, acteurs comme dormeurs (anti-fuite). */
const NIGHT_PANEL = 'space-y-3 rounded-2xl border border-chip-blue/50 bg-felt-deep/80 p-4'

type WitchChoice = 'save' | 'kill' | 'none'

type GameChatMessage = {
  id: string
  senderId: string
  senderName: string
  senderIcon: string | null
  body: string
  createdAt: string
  self: boolean
}

/**
 * Chat de partie repliable — deux usages :
 *  - `scope="wolves"` (ton rouge) : canal privé des loups, gardé côté
 *    serveur (le viewer doit avoir role==='loup' dans l'état RÉEL) ;
 *  - `scope="room"` (ton or) : chat du village pendant les phases de jour —
 *    même canal que le chat de salle du header. `canWrite=false` pour les
 *    fantômes (vue omnisciente : lecture seule, pas de spoil).
 * Le composant se fie au serveur (404/403 = rien ne s'affiche).
 * Sondé déplié, ou replié quand `poll` le demande (les loups, la nuit : la
 * pastille du bandeau signale un message de la meute) — onglet au premier
 * plan seulement ; chaque relève ne demande que le delta derrière le dernier
 * message connu. Il reste monté replié : la liste ne repart pas de zéro à
 * chaque ouverture. `scope` est fixe par point de montage.
 */
function GameChatPanel({
  open,
  poll = false,
  scope,
  title,
  tone,
  canWrite = true,
  onUnreadChange,
}: {
  open: boolean
  poll?: boolean
  scope: 'wolves' | 'room'
  title: string
  tone: 'red' | 'gold'
  canWrite?: boolean
  /** Un message d'un autre est arrivé depuis la dernière ouverture (panneau replié). */
  onUnreadChange?: (unread: boolean) => void
}) {
  const tChat = useTranslations('chat')
  const visible = usePagePresence()
  const [messages, setMessages] = useState<GameChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  // Messages déjà vus : tout ce qui est arrivé panneau ouvert, plus
  // l'historique de la première relève (une pastille pour la nuit d'hier
  // n'apprendrait rien).
  const [seen, setSeen] = useState(0)
  const listRef = useRef<HTMLDivElement | null>(null)
  const inFlightRef = useRef(false)
  const baselineRef = useRef(false)
  const openRef = useRef(open)
  openRef.current = open
  // Miroir de `messages` : le curseur se lit au moment de la requête sans
  // recréer `fetchMessages` (et relancer l'intervalle) à chaque message.
  const messagesRef = useRef<GameChatMessage[]>([])

  const fetchMessages = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    try {
      const res = await fetch(`/api/chat/messages?scope=${scope}${chatCursorQuery(messagesRef.current)}`, {
        credentials: 'include',
      })
      if (!res.ok) return
      const data = await res.json()
      const incoming: GameChatMessage[] = Array.isArray(data?.messages) ? data.messages : []
      const first = !baselineRef.current
      baselineRef.current = true
      // Rien de neuf : pas de rendu — le cas courant d'une relève.
      if (incoming.length === 0) return
      const merged = mergeMessages(messagesRef.current, incoming)
      // Tout déjà connu (recouvrement du curseur, cf. la route) : idem.
      if (merged === messagesRef.current) return
      messagesRef.current = merged
      setMessages(merged)
      if (first && !openRef.current) setSeen(merged.length)
    } finally {
      inFlightRef.current = false
    }
  }, [scope])

  useEffect(() => {
    // Replié (sans relève demandée) ou onglet caché : pas de sondage. Au
    // retour, relève immédiate qui ne coûte que le delta accumulé pendant
    // l'absence (voir usePagePresence).
    if (!(open || poll) || !visible) return
    void fetchMessages()
    const timer = setInterval(fetchMessages, GAME_CHAT_POLL_MS)
    return () => clearInterval(timer)
  }, [open, poll, visible, fetchMessages])

  useEffect(() => {
    if (open) setSeen(messages.length)
  }, [open, messages.length])

  const unread = !open && messages.slice(seen).some((m) => !m.self)
  useEffect(() => {
    onUnreadChange?.(unread)
  }, [unread, onUnreadChange])

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, open])

  const send = async () => {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    try {
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ scope, body }),
      })
      if (res.ok) {
        setDraft('')
        await fetchMessages()
      }
    } finally {
      setSending(false)
    }
  }

  const red = tone === 'red'

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden"
        >
          <div
            className={cn(
              'space-y-2 rounded-2xl bg-felt-deep/90 p-3',
              red ? 'border border-suit-red/40' : 'border border-gold/30'
            )}
          >
            <p
              className={cn(
                'flex items-center justify-center gap-1.5 text-center text-xs font-bold uppercase tracking-wide',
                red ? 'text-red-200' : 'text-gold'
              )}
            >
              {red ? (
                <GameIconById id="loup-garou" surface="felt" className="h-5 w-5 shrink-0" />
              ) : (
                <MessageCircle aria-hidden className="h-5 w-5 shrink-0" />
              )}
              {title}
            </p>
            <div ref={listRef} className="max-h-40 min-h-[3rem] space-y-1.5 overflow-y-auto overscroll-contain">
              {messages.length === 0 ? (
                <p className="py-3 text-center text-sm text-cream/70">{tChat('empty')}</p>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className={cn('flex', m.self ? 'justify-end' : 'justify-start')}>
                    <div
                      className={cn(
                        'max-w-[80%] rounded-xl px-2.5 py-1.5',
                        m.self
                          ? red
                            ? 'rounded-br-sm bg-suit-red/30 text-cream'
                            : 'rounded-br-sm bg-gold/20 text-cream'
                          : 'rounded-bl-sm bg-black/25 text-cream/90'
                      )}
                    >
                      {!m.self && (
                        <p
                          className={cn(
                            'mb-0.5 flex items-center gap-1 text-sm font-semibold leading-tight',
                            red ? 'text-red-300' : 'text-gold'
                          )}
                        >
                          {m.senderIcon && (
                            <span aria-hidden>
                              <PlayerAvatarGlyph value={m.senderIcon} />
                            </span>
                          )}
                          {m.senderName}
                        </p>
                      )}
                      <p className="whitespace-pre-wrap break-words text-sm leading-snug">{m.body}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
            {canWrite && (
              <div className="flex items-center gap-2">
                {/* 16 px : sous cette taille, iOS zoome la page au focus. */}
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void send()
                    }
                  }}
                  maxLength={500}
                  placeholder={tChat('placeholder')}
                  aria-label={tChat('placeholder')}
                  className={cn(
                    'h-11 min-w-0 flex-1 rounded-xl border border-cream/[0.25] bg-black/30 px-3 text-base text-cream placeholder:text-cream/60 focus:outline-none focus:ring-2',
                    red ? 'focus:border-red-300 focus:ring-red-300/40' : 'focus:border-gold focus:ring-gold/40'
                  )}
                />
                <button
                  type="button"
                  onClick={() => {
                    void send()
                  }}
                  disabled={!draft.trim() || sending}
                  aria-label={tChat('send')}
                  className={cn(
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2 focus-visible:ring-offset-felt-deep disabled:opacity-40',
                    red ? 'bg-suit-red text-cream hover:bg-[#9E2F26]' : 'bg-amber-500 text-[#24201A] hover:bg-amber-400'
                  )}
                >
                  <Send aria-hidden className="h-5 w-5" />
                </button>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Bouton icône de 44 px du bandeau de phase (légende, chats). */
function HeaderToggle({
  label,
  active,
  tone = 'gold',
  dot = false,
  onClick,
  children,
}: {
  label: string
  active: boolean
  tone?: 'gold' | 'red'
  /** Pastille « nouveau » (message de la meute arrivé panneau replié). */
  dot?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={active}
      className={cn(
        'relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold',
        active
          ? tone === 'red'
            ? 'border-red-300/60 bg-suit-red/30 text-red-200'
            : 'border-gold/60 bg-gold/20 text-gold'
          : 'border-gold/20 bg-felt-deep/60 text-gold hover:bg-gold/10'
      )}
    >
      {children}
      {dot && (
        <span
          aria-hidden
          className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-gold ring-2 ring-felt-deep"
        />
      )}
    </button>
  )
}

export function LoupGarouOnline() {
  const { user } = useAuth()
  const isSoft = user?.ambianceMode === 'soft'
  const { room, voteRematch, leaveRoom, fetchRoom } = useOnlineRoom()
  const t = useTranslations('games.loup-garou.game')
  const tc = useTranslations('common')
  const tTargets = useTranslations('gameUi.targets')
  const { busy, actionError, sendAction: postAction } = useGameAction(room?.id)
  const [hideRole, setHideRole] = useState(false)
  const [showRoleDetails, setShowRoleDetails] = useState(false)
  const reducedMotion = useReducedMotion()
  const [showLegend, setShowLegend] = useState(false)
  const [showWolfChat, setShowWolfChat] = useState(false)
  const [wolfUnread, setWolfUnread] = useState(false)
  const [showDayChat, setShowDayChat] = useState(false)
  const [showDebateReview, setShowDebateReview] = useState(false)
  // Choisir puis valider : la cible touchée dans la grille (pas encore
  // envoyée), et celle dont l'envoi attend le serveur.
  const [pick, setPick] = useState<string | null>(null)
  const [sending, setSending] = useState<string | null>(null)
  const [witchChoice, setWitchChoice] = useState<WitchChoice | null>(null)
  // Débat : grille de cibles ouverte par « Accuser » ou « Faire équipe ».
  const [speakMode, setSpeakMode] = useState<'suspect' | 'ally' | null>(null)

  const inGame = room?.gameId === 'loup-garou' && room.status === 'playing'
  const view = useMemo(() => (inGame ? parseView(room?.gameStateJson) : null), [inGame, room?.gameStateJson])
  const tutorial = useGameTutorial('loup-garou', inGame)
  const cosmetics = useMemberCosmetics(room)

  // La grille du débat se referme quand MA parole est passée ou que la phase
  // change — pas à chaque version : les bots parlent toutes les 2,5-5,5 s et
  // fermeraient la grille sous le doigt du joueur.
  const mySpeechCount =
    view && user
      ? view.debateSpeech.filter((sp) => sp.round === view.round && sp.playerId === user.id).length
      : 0
  const phaseKeyOfView = view?.phaseKey
  useEffect(() => {
    setSpeakMode(null)
  }, [phaseKeyOfView, mySpeechCount])

  // Sélection et potion choisie valent pour UNE phase. Pas de remise à zéro à
  // chaque version : un bot qui vote ferait sauter la cible sous le doigt.
  useEffect(() => {
    setPick(null)
    setWitchChoice(null)
  }, [phaseKeyOfView])

  // Sting du Chasseur : son dramatique + vibration à l'ENTRÉE de la phase
  // (une seule fois par phase, pour tous les joueurs — c'est LE highlight).
  const hunterStingRef = useRef<string | null>(null)
  useEffect(() => {
    if (!view || view.phase !== 'hunter-shot') return
    if (hunterStingRef.current === view.phaseKey) return
    hunterStingRef.current = view.phaseKey
    playGameSound('hunter')
    try {
      navigator.vibrate?.([90, 60, 90, 60, 200])
    } catch {
      // vibration indisponible — tant pis
    }
  }, [view])

  // ÉCHÉANCE DE PHASE : tick « advance » arbitré par rang (cf. useAdvanceTick).
  // Un arbitre unique ne suffisait pas (téléphone verrouillé = timers gelés =
  // partie bloquée) ; tous en même temps non plus (rafale de 409) : le rang 0
  // tire à l'échéance, les suivants 4 s plus tard chacun, coupés dès que la
  // version bouge.
  useAdvanceTick({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    players: view?.players,
    enabled: Boolean(view && user && room && view.phase !== 'finished'),
    advance:
      view && view.phaseEndsAt !== null ? { phaseKey: view.phaseKey, dueAt: view.phaseEndsAt } : null,
  })

  // Ticks « arbitre » (bots + remplacement), avec secours par rang : tout
  // humain RESTANT arbitre — vivant OU fantôme (un mort pilote les ticks).
  // Tick bot « au cas où » le jour : NOT_BOT_TURN (409) si aucun bot concerné.
  // La nuit, le serveur fait seul jouer les bots (instant secret) et refuse
  // le tick des clients : inutile de l'envoyer.
  useBotReferee({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    players: view?.players,
    enabled: Boolean(view && user && room && view.phase !== 'finished'),
    botTick:
      view && !NIGHT_PHASES.has(view.phase) && view.players.some((p) => p.isBot)
        ? { body: { action: 'bot' }, delayMs: 2500 + Math.random() * 3000 }
        : null,
    replaceLeft: Boolean(view?.players.some((p) => !p.isBot && p.leftAt)),
  })

  if (!inGame) {
    return <GameOnlineLobby gameId="loup-garou" />
  }

  if (!view || !user || !room) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-cream/70">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
      </div>
    )
  }

  const me = view.players.find((p) => p.id === user.id)
  const myRole = view.myRole
  const finished = view.phase === 'finished'
  const isNight = NIGHT_PHASES.has(view.phase)
  const isDebate = view.phase === 'day-debate'
  const isVotePhase = view.phase === 'day-vote' || view.phase === 'day-revote'
  // Chat du village : ouvert pendant les phases de jour (débat + votes).
  const isDayChatPhase = isDebate || isVotePhase
  const alive = view.players.filter((p) => p.alive)
  const dead = view.players.filter((p) => !p.alive)

  const nameOf = (id: string | null | undefined) =>
    view.players.find((p) => p.id === id)?.name ?? '—'
  const genreOfPlayer = (id: string | null | undefined) => genreOfId(view.players, id)
  const iconOf = (p: { id: string; name: string; isBot: boolean }) => lgPlayerIcon(p, room.members)
  const roleName = (role: LGRole) => t(`roles.${role}.name`)

  const sendAction = async (body: Record<string, unknown>) => {
    const res = await postAction({ ...body, expectedVersion: room.stateVersion })
    if (res?.status === 409) {
      // Version périmée (ex: un loup coéquipier ou un bot a agi entre-temps) —
      // resynchronise puis retente une fois avec la version fraîche, sinon un
      // changement de cible loup pouvait silencieusement ne rien faire. Le 409
      // reste muet côté joueur : c'est la retentative qui parlera si elle échoue.
      const fresh = await fetchRoom()
      if (fresh) return postAction({ ...body, expectedVersion: fresh.stateVersion })
    }
    return res
  }

  /** Geste à un toucher sur une carte (vote des loups, parole) : roue sur la carte le temps de l'envoi. */
  const sendOnCard = async (body: Record<string, unknown>, targetId: string) => {
    setSending(targetId)
    await sendAction({ ...body, targetId })
    setSending(null)
  }

  /** Validation de la cible choisie ; un échec garde la sélection (on peut réessayer). */
  const confirmPick = async (body: Record<string, unknown>) => {
    if (!pick) return
    const target = pick
    setSending(target)
    const res = await sendAction({ ...body, targetId: target })
    setSending(null)
    if (res?.ok) setPick(null)
  }

  const totalPhaseMs =
    view.phase === 'day-debate' ? view.debateMs : PHASE_TOTAL_MS[view.phase] ?? 60_000

  const myPeek = view.seerPeeks?.find((p) => p.round === view.round) ?? null
  const iAmActingSeer = Boolean(myRole === 'voyante' && me?.alive && view.phase === 'night-seer')
  const iAmActingWolf = Boolean(myRole === 'loup' && me?.alive && view.phase === 'night-wolves')
  const iAmActingWitch = Boolean(
    myRole === 'sorciere' && me?.alive && view.phase === 'night-witch'
  )
  const iAmActingGuard = Boolean(
    myRole === 'salvateur' && me?.alive && view.phase === 'night-guard'
  )
  const iAmActingRaven = Boolean(
    myRole === 'corbeau' && me?.alive && view.phase === 'night-raven'
  )
  const iAmHunter = view.phase === 'hunter-shot' && view.pendingHunterId === user.id
  const wolves = view.players.filter((p) => p.role === 'loup')
  const accompliceNames = wolves.filter((w) => w.id !== user.id).map((w) => w.name).join(', ')

  // Débat : paroles de la manche (bots ET humains), les miennes, et le
  // dernier VIVANT qui m'accuse (cible de « Me défendre »).
  const roundSpeech = view.debateSpeech.filter((sp) => sp.round === view.round)
  const myAccusers = roundSpeech.filter(
    (sp) =>
      sp.kind === 'suspect' && sp.targetId === user.id && alive.some((p) => p.id === sp.playerId)
  )
  const lastAccuserId = myAccusers.length > 0 ? myAccusers[myAccusers.length - 1].playerId : null
  // Interpellation « tu votes qui ? » encore sans réponse : un `ask` qui me
  // vise, après lequel je n'ai ni parlé ni passé au vote.
  let askedById: string | null = null
  if (!view.debateSkips.includes(user.id)) {
    for (let i = roundSpeech.length - 1; i >= 0; i -= 1) {
      const sp = roundSpeech[i]
      if (sp.playerId === user.id) break
      if (sp.kind === 'ask' && sp.targetId === user.id) {
        askedById = sp.playerId
        break
      }
    }
  }
  const speechLeft = Math.max(0, LG_SPEECH_CAP - mySpeechCount)
  const canSpeak = Boolean(me?.alive) && !busy && speechLeft > 0
  const speak = (kind: LGSpeakKind, targetId: string) =>
    void sendOnCard({ action: 'debate-speak', kind }, targetId)

  // Au vote, le débat se relit sur les cartes : « accusé 3× », compté sur les
  // paroles de la manche.
  const accusations = new Map<string, number>()
  for (const sp of roundSpeech) {
    if (sp.targetId && ACCUSING_KINDS.has(sp.kind)) {
      accusations.set(sp.targetId, (accusations.get(sp.targetId) ?? 0) + 1)
    }
  }

  // ── Écran de fin ─────────────────────────────────────────────────────────
  if (finished) {
    const villageWon = view.winnerTeam === 'village'
    // Victoire du joueur local : son camp (celui de son rôle final) a gagné.
    const meFinal = view.players.find((p) => p.id === user.id)
    const won = Boolean(
      meFinal?.role && view.winnerTeam !== null && lgTeamOf(meFinal.role) === view.winnerTeam
    )
    return (
      <OnlineEndScreen
        confetti
        won={won}
        rematchVotes={view.rematchVotes ?? []}
        onRematch={voteRematch}
        onLeave={leaveRoom}
        header={
          <motion.div
            initial={reducedMotion ? { opacity: 0 } : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={reducedMotion ? { duration: 0.2 } : { type: 'spring', stiffness: 220, damping: 18 }}
            className="flex flex-col items-center gap-2 text-center"
          >
            {villageWon ? (
              <Trophy aria-hidden className="h-14 w-14 text-gold" />
            ) : (
              <GameIconById id="loup-garou" surface="feltGold" className="h-14 w-14" />
            )}
            <h2 className="font-display text-3xl font-bold text-gold">
              {villageWon ? t('victory.village') : t('victory.loups')}
            </h2>
            {!isSoft && (
              <p className="text-sm text-cream/80">
                {villageWon ? t('victory.villageDrinks') : t('victory.loupsDrinks')}
              </p>
            )}
          </motion.div>
        }
        ranking={
          <div className="w-full max-w-sm space-y-2">
            <p className="text-center text-xs font-semibold uppercase tracking-wide text-gold">
              {t('victory.fullReveal')}
            </p>
            {view.players.map((p) => {
              const RoleIcon = p.role ? ROLE_META[p.role].Icon : null
              return (
                <div
                  key={p.id}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl border px-4 py-2.5',
                    p.role === 'loup' ? 'border-suit-red/40 bg-suit-red/10' : 'border-gold/20 bg-felt-deep/60'
                  )}
                >
                  <RankCrest role={cosmetics.get(p.id)?.role} />
                  {/* Mort : seul l'avatar s'estompe — la ligne entière à 60 %
                      passait le rôle révélé sous 4,5:1 ; le crâne, le nom barré
                      et le « hors jeu » lu portent l'état. */}
                  <span className={cn('text-xl', !p.alive && 'opacity-50')} aria-hidden>
                    <PlayerAvatarGlyph value={iconOf(p)} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1 truncate text-sm font-bold">
                      <OnlinePlayerName
                        name={p.name}
                        cosmetics={cosmetics.get(p.id)}
                        className={cn(!p.alive && 'line-through')}
                      />
                      {!p.alive && (
                        <>
                          <Skull aria-hidden className="h-4 w-4 shrink-0 text-cream/70" />
                          <span className="sr-only">{` (${tTargets('dead')})`}</span>
                        </>
                      )}
                    </p>
                    {p.role && RoleIcon && (
                      <p className={cn('flex items-center gap-1.5 text-sm font-semibold', ROLE_META[p.role].color)}>
                        <RoleIcon className="h-5 w-5 shrink-0" />
                        {roleName(p.role)}
                      </p>
                    )}
                  </div>
                  {!isSoft && (
                    <span className="flex items-center gap-1 text-sm text-cream/80">
                      <Beer aria-hidden className="h-4 w-4 text-amber-300" /> {p.sips}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        }
        xp={<XpGainBanner won={won} playerIds={view.players.map((p) => p.id)} className="w-full max-w-sm" />}
      />
    )
  }

  // ── Cartes du village ────────────────────────────────────────────────────
  /**
   * Une carte du village. `grid` est la carte de TargetGrid, trait pour
   * trait : la nuit, le dormeur voit la même grille que l'acteur, posée au
   * lieu d'être à toucher — sans les rôles qu'il connaît (complices d'un
   * loup, vue du fantôme), ni écharpe ni gorgées, que les cartes à toucher
   * n'ont pas. `dense` sert au panneau « Le village » des phases sans grille.
   */
  const villageCard = (p: LGPlayerView, size: 'grid' | 'dense') => {
    const RoleIcon = p.role ? ROLE_META[p.role].Icon : null
    const isMe = p.id === user.id
    const dense = size === 'dense'
    const mayor = dense && view.mayorId === p.id
    const showSips = dense && !isSoft && p.sips > 0
    // Rôle masqué : rien du rôle à l'écran, pas plus sur ma carte que sur
    // celles de mes complices (un loup est le seul à voir des loups). Les
    // rôles des morts sont publics.
    const roleMark =
      p.role && RoleIcon && dense && (!hideRole || !p.alive) ? (
        <>
          <RoleIcon className={cn('h-5 w-5 shrink-0', p.alive ? ROLE_META[p.role].ink : ROLE_META[p.role].color)} />
          <span className="sr-only">{roleName(p.role)}</span>
        </>
      ) : null
    const mayorMark = mayor ? (
      <>
        <Medal aria-hidden className={cn('h-4 w-4 shrink-0', p.alive ? 'text-amber-700' : 'text-gold')} />
        <span className="sr-only">{t('mayorBadge', { genre: genreOf(p) })}</span>
      </>
    ) : null
    if (p.alive) {
      return (
        <div
          key={p.id}
          className={cn(
            'flex items-center gap-2 rounded-xl border border-[#D8CCAE] bg-cream text-[#24201A] shadow-[0_6px_14px_-8px_rgba(0,0,0,0.55)]',
            size === 'grid' ? 'min-h-[52px] px-3 py-2' : 'min-h-[44px] px-2.5 py-1.5'
          )}
        >
          <span className="shrink-0 text-lg" aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
          <span
            className={cn(
              'min-w-0 flex-1 text-sm font-bold leading-tight',
              size === 'grid' ? 'line-clamp-2 break-words' : 'truncate'
            )}
          >
            {p.name}
            {isMe && <span className="font-semibold text-[#6B6455]"> {t('you')}</span>}
          </span>
          {mayorMark}
          {roleMark}
          {showSips && (
            <span className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-amber-800">
              <Beer aria-hidden className="h-3.5 w-3.5" />
              {p.sips}
            </span>
          )}
        </div>
      )
    }
    return (
      <div
        key={p.id}
        className="flex min-h-[44px] items-center gap-2 rounded-xl border border-gold/25 bg-felt-deep px-2.5 py-1.5 opacity-80"
      >
        <Skull aria-hidden className="h-4 w-4 shrink-0 text-cream/70" />
        <span className="min-w-0 flex-1 truncate text-sm font-bold text-cream/70 line-through decoration-cream/40">
          {p.name}
          {isMe && <span className="font-semibold"> {t('you')}</span>}
        </span>
        {mayorMark}
        {roleMark}
        {showSips && (
          <span className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-amber-200">
            <Beer aria-hidden className="h-3.5 w-3.5" />
            {p.sips}
          </span>
        )}
      </div>
    )
  }

  /** Les vivants en cartes posées : la grille du dormeur, ou de l'acteur qui a déjà joué. */
  const restingVillage = (
    <div className="grid grid-cols-2 gap-2.5">{alive.map((p) => villageCard(p, 'grid'))}</div>
  )

  /** Les morts, en une ligne, sous une grille qui ne montre que les vivants. */
  const deadLine =
    dead.length > 0 ? (
      <p className="flex items-start gap-1.5 text-sm text-cream/70">
        <Skull aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
        {t('deadList', { names: dead.map((p) => p.name).join(', ') })}
      </p>
    ) : null

  const nightTitle = (icon: ReactNode, text: ReactNode) => (
    <p className="flex items-center justify-center gap-2 text-center text-sm font-bold text-cream">
      {icon}
      <span>{text}</span>
    </p>
  )

  const roleIcon = (role: LGRole) => {
    const RoleIcon = ROLE_META[role].Icon
    return <RoleIcon className={cn('h-5 w-5 shrink-0', ROLE_META[role].color)} />
  }

  // Les cartes candidates SONT le village : le panneau du bas ne double pas
  // la grille au moment d'agir.
  const gridShown =
    view.phase === 'mayor-election' ||
    isNight ||
    isVotePhase ||
    iAmHunter ||
    (isDebate && Boolean(me?.alive) && (speakMode !== null || askedById !== null))

  // ── Barre du bas : l'action du moment, sous le pouce ─────────────────────
  /** Annuler + valider, la cible nommée sur le bouton. */
  const pickBar = (variant: 'primary' | 'danger' | 'night', label: string, onConfirm: () => Promise<void>) => (
    <div className="flex gap-2">
      <Button
        variant="quiet"
        size="gameLg"
        className="shrink-0 px-4"
        disabled={!pick || busy}
        onClick={() => setPick(null)}
      >
        {tc('cancel')}
      </Button>
      <Button
        // La nuit, pas d'or plein : un bouton qui s'allume désignerait
        // l'acteur aux voisins. Même cadre que le reste, filet et texte or.
        variant={variant === 'night' ? 'quiet' : variant}
        size="gameLg"
        className={cn('min-w-0 flex-1', variant === 'night' && 'border-gold font-bold text-gold')}
        disabled={!pick || busy}
        onClick={() => void onConfirm()}
      >
        {sending && <Loader2 aria-hidden className="mr-2 h-5 w-5 shrink-0 animate-spin" />}
        <span className="truncate">{label}</span>
      </Button>
    </div>
  )

  let barStatus: ReactNode = null
  let barActions: ReactNode = null
  if (view.phase === 'mayor-election') {
    const n = alive.filter((p) => view.hasVotedMayor[p.id]).length
    barStatus = view.myMayorVote
      ? t('votedStatus', { n, total: alive.length })
      : t('votedCount', { n, total: alive.length })
    if (me?.alive && !view.myMayorVote) {
      barActions = pickBar('primary', pick ? t('mayorElect', { name: nameOf(pick) }) : t('pickPlayer'), () =>
        confirmPick({ action: 'mayor-vote' })
      )
    }
  } else if (isNight) {
    // La même ligne sur tous les téléphones, acteur ou dormeur.
    barStatus = t('sleepHint')
    if (iAmActingGuard && !view.guardProtectedId) {
      barActions = pickBar('night', pick ? t('guardConfirm', { name: nameOf(pick) }) : t('pickPlayer'), () =>
        confirmPick({ action: 'guard-protect' })
      )
    } else if (iAmActingRaven && !view.ravenTargetId) {
      barActions = pickBar('night', pick ? t('ravenConfirm', { name: nameOf(pick) }) : t('pickPlayer'), () =>
        confirmPick({ action: 'raven-mark' })
      )
    } else if (iAmActingSeer && !myPeek) {
      barActions = pickBar('night', pick ? t('seerConfirm', { name: nameOf(pick) }) : t('pickPlayer'), () =>
        confirmPick({ action: 'seer-peek' })
      )
    } else if (iAmActingWitch && !view.witchActed) {
      const ready = witchChoice === 'kill' ? Boolean(pick) : witchChoice !== null
      const label =
        witchChoice === 'save'
          ? t('witchSaveConfirm', { name: nameOf(view.nightVictimId) })
          : witchChoice === 'kill'
            ? pick
              ? t('witchKillConfirm', { name: nameOf(pick) })
              : t('pickPlayer')
            : witchChoice === 'none'
              ? t('witchNone')
              : t('witchPick')
      const confirmWitch = async () => {
        if (witchChoice === 'kill') {
          await confirmPick({ action: 'witch', witchAction: 'kill' })
          return
        }
        if (!witchChoice) return
        await sendAction({ action: 'witch', witchAction: witchChoice })
      }
      barActions = (
        <Button
          variant="quiet"
          size="gameLg"
          className="w-full border-gold font-bold text-gold"
          disabled={!ready || busy}
          onClick={() => void confirmWitch()}
        >
          {busy && <Loader2 aria-hidden className="mr-2 h-5 w-5 shrink-0 animate-spin" />}
          <span className="truncate">{label}</span>
        </Button>
      )
    }
    // Rien à valider (dormeur, loup qui vote d'un toucher, acteur qui a
    // joué) : une rangée inerte de la même hauteur. Une barre basse face à
    // une barre à boutons désignait l'acteur au voisin, comme la grille.
    if (!barActions) {
      barActions = (
        <div
          aria-hidden
          className="flex h-14 w-full items-center justify-center rounded-2xl border border-gold/[0.35] bg-felt-deep/60"
        >
          <Moon className="h-5 w-5 text-sky-300" />
        </div>
      )
    }
  } else if (iAmHunter) {
    barActions = pickBar('danger', pick ? t('hunterConfirm', { name: nameOf(pick) }) : t('pickPlayer'), () =>
      confirmPick({ action: 'hunter-shot' })
    )
  } else if (isDebate) {
    const skipped = view.debateSkips.includes(user.id)
    const counts = { n: view.debateSkips.length, total: alive.length }
    if (me?.alive && !skipped) {
      barActions = (
        <Button
          variant="primary"
          size="gameLg"
          className="w-full"
          disabled={busy}
          onClick={() => void sendAction({ action: 'debate-skip' })}
        >
          <Vote aria-hidden className="mr-2 h-5 w-5 shrink-0" />
          {t('skipToVote', counts)}
        </Button>
      )
    } else {
      barStatus = t('skipWaiting', counts)
    }
  } else if (isVotePhase) {
    const n = alive.filter((p) => view.hasVoted[p.id]).length
    barStatus = view.myVote
      ? t('votedStatus', { n, total: alive.length })
      : t('votedCount', { n, total: alive.length })
    if (me?.alive && !view.myVote) {
      barActions = pickBar('danger', pick ? t('lynch', { name: nameOf(pick) }) : t('pickSuspect'), () =>
        confirmPick({ action: 'day-vote' })
      )
    }
  }
  const barShown = view.phase === 'mayor-election' || isNight || iAmHunter || isDebate || isVotePhase
  // Un coup refusé se dit sous le pouce, là où il est parti : en haut de
  // page, il tombait hors de l'écran sous une grille défilée.
  if (barShown && actionError) {
    barStatus = <span className="font-semibold text-red-300">{actionError}</span>
  }

  // Repère de manche : « Nuit 2 » / « Jour 2 » (la manche 0 est la veillée :
  // rôles et élection du maire, la phase suffit).
  const roundLabel =
    view.round >= 1 ? (
      <span className="flex items-center gap-1.5">
        {isNight ? (
          <Moon aria-hidden className="h-4 w-4 shrink-0 text-sky-300" />
        ) : (
          <Sun aria-hidden className="h-4 w-4 shrink-0 text-gold" />
        )}
        {isNight ? t('roundNight', { n: view.round }) : t('roundDay', { n: view.round })}
      </span>
    ) : undefined

  /** « a voté » sur une carte, coche comprise : l'état ne tient pas qu'au texte gris. */
  const votedMark = (
    <span className="inline-flex items-center gap-1">
      <Check aria-hidden className="h-3 w-3 shrink-0" />
      {t('hasVotedMeta')}
    </span>
  )

  /** Méta d'une carte de vote : accusations du débat, marque du Corbeau, a voté. */
  const voteMeta = (p: { id: string; name: string; isBot: boolean }) => {
    const parts: ReactNode[] = []
    const accused = accusations.get(p.id) ?? 0
    if (accused > 0) {
      parts.push(
        <span key="accused" className="inline-flex items-center gap-1">
          <Megaphone aria-hidden className="h-3 w-3 shrink-0" />
          {t('accusedTimes', { count: accused })}
        </span>
      )
    }
    if (view.ravenTargetId === p.id && view.phase === 'day-vote') {
      parts.push(
        <span key="raven" className="inline-flex items-center gap-0.5 font-black">
          <Bird aria-hidden className="h-3 w-3 shrink-0" />
          <span aria-hidden>+2</span>
          <span className="sr-only">{t('ravenMarkBadge', { genre: genreOf(p) })}</span>
        </span>
      )
    }
    if (view.hasVoted[p.id]) {
      parts.push(<span key="voted">{votedMark}</span>)
    }
    return parts.length > 0 ? <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">{parts}</span> : null
  }

  const voteCandidates = alive.filter((p) => !view.revoteCandidates || view.revoteCandidates.includes(p.id))

  // ── Partie en cours ──────────────────────────────────────────────────────
  return (
    <>
    <div
      className={cn(
        'flex flex-1 flex-col gap-3 p-3 text-cream sm:mx-auto sm:w-full sm:max-w-lg',
        barShown ? onlineActionBarPadding(barActions && barStatus ? 'tall' : 'default') : 'pb-6',
        isNight && 'bg-gradient-to-b from-chip-blue/25 to-transparent'
      )}
    >
      <PhaseHeader
        round={roundLabel}
        phase={t(`phases.${view.phase}`)}
        endsAt={view.phaseEndsAt}
        total={totalPhaseMs}
        dangerMs={10_000}
        className={cn(isNight && 'border-chip-blue/50')}
        right={
          <>
            {myRole === 'loup' && (
              <HeaderToggle
                label={wolfUnread && !showWolfChat ? t('wolfChatUnread') : t('wolfChatTitle')}
                active={showWolfChat}
                tone="red"
                dot={wolfUnread && !showWolfChat}
                onClick={() => setShowWolfChat((v) => !v)}
              >
                <GameIconById id="loup-garou" surface="felt" className="h-5 w-5" />
              </HeaderToggle>
            )}
            {isDayChatPhase && (
              <HeaderToggle label={t('dayChatTitle')} active={showDayChat} onClick={() => setShowDayChat((v) => !v)}>
                <MessageCircle aria-hidden className="h-5 w-5" />
              </HeaderToggle>
            )}
            <HeaderToggle label={t('legend.title')} active={showLegend} onClick={() => setShowLegend((v) => !v)}>
              <BookOpen aria-hidden className="h-5 w-5" />
            </HeaderToggle>
          </>
        }
      />

      {/* Coup refusé (mauvaise phase, pas ton rôle, expulsion…) — 3 s ; dans
          la barre du bas quand elle est montée. */}
      {actionError && !barShown && (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-2 text-center text-sm font-semibold text-red-200">
          {actionError}
        </div>
      )}

      {/* Légende des rôles (repliable), avec le tutoriel : un bouton d'aide
          de moins dans le bandeau, qui laisse la place au nom de la phase. */}
      <AnimatePresence>
        {showLegend && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 rounded-2xl border border-gold/20 bg-felt-deep/80 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 font-display text-sm font-bold uppercase tracking-wide text-gold">
                  <BookOpen aria-hidden className="h-4 w-4" /> {t('legend.title')}
                </p>
                <span className="flex items-center gap-1.5">
                  <TutorialReopenButton onClick={tutorial.reopen} className="h-11 w-11" />
                  <button
                    type="button"
                    onClick={() => setShowLegend(false)}
                    className="flex h-11 w-11 items-center justify-center rounded-xl text-cream/70 transition-colors hover:bg-gold/10 hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                    aria-label={t('legend.close')}
                  >
                    <X aria-hidden className="h-5 w-5" />
                  </button>
                </span>
              </div>
              <ul className="space-y-1.5">
                {LEGEND_ROLES.map((role) => {
                  const RoleIcon = ROLE_META[role].Icon
                  return (
                    <li
                      key={role}
                      className="flex items-start gap-2 rounded-xl border border-cream/10 bg-black/20 px-3 py-2"
                    >
                      <RoleIcon aria-hidden className={cn('h-5 w-5 shrink-0', ROLE_META[role].color)} />
                      <span className="min-w-0">
                        <span className={cn('block text-sm font-bold', ROLE_META[role].color)}>
                          {roleName(role)}
                        </span>
                        <span className="block text-xs leading-snug text-cream/80">
                          {t(`roles.${role}.desc`)}
                        </span>
                      </span>
                    </li>
                  )
                })}
              </ul>
              <p className="text-xs text-cream/70">{t('legend.hint')}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat privé des loups (loups uniquement, repliable). Monté replié la
          nuit des loups : la pastille du bandeau signale la meute qui parle.
          Loup mort : lecture seule (fantôme omniscient — le serveur refuse
          aussi son envoi). */}
      {myRole === 'loup' && (
        <GameChatPanel
          open={showWolfChat}
          poll={view.phase === 'night-wolves' && Boolean(me?.alive)}
          scope="wolves"
          title={t('wolfChatTitle')}
          tone="red"
          canWrite={Boolean(me?.alive)}
          onUnreadChange={setWolfUnread}
        />
      )}

      {/* Chat du village (phases de jour, repliable) — fantômes en lecture
          seule : leur vue omnisciente ne doit pas fuiter dans le débat. */}
      {isDayChatPhase && (
        <GameChatPanel
          open={showDayChat}
          scope="room"
          title={t('dayChatTitle')}
          tone="gold"
          canWrite={!view.ghost}
        />
      )}

      {/* Fantôme */}
      {view.ghost && (
        <div className="flex items-center gap-2 rounded-2xl border border-cream/25 bg-cream/10 px-4 py-2 text-sm font-bold text-cream">
          <Ghost aria-hidden className="h-5 w-5 shrink-0" />
          <span>{t('ghostBanner')}</span>
        </div>
      )}

      {/* Le maire (une fois élu, visible de tous en permanence) */}
      {view.mayorId && view.phase !== 'mayor-election' && (
        <div className="flex items-center gap-2 rounded-2xl border border-gold/30 bg-gold/10 px-3 py-2 text-xs font-semibold text-cream">
          <Medal aria-hidden className="h-4 w-4 shrink-0 text-gold" />
          <span>
            {view.mayorId === user.id
              ? t('youAreMayor')
              : t('mayorBanner', { name: nameOf(view.mayorId), genre: genreOfPlayer(view.mayorId) })}
          </span>
        </div>
      )}

      {/* Mon rôle, hors révélation : une bande de 60 px (mini-carte, nom,
          détails, œil) au lieu d'une carte de 120 px figée toute la partie —
          c'est elle qui repoussait les actions sous la zone du pouce. Masquée :
          le dos de carte, rien du rôle dans le DOM. */}
      {myRole && view.phase !== 'reveal-role' && (
        <div className={cn('rounded-2xl border border-gold/20 bg-felt-deep/70 p-2', !me?.alive && 'opacity-70')}>
          <div className="flex items-center gap-3">
            {hideRole ? (
              <PlayingCardBack className="h-11 w-8 shrink-0" />
            ) : (
              <PlayingCard
                suit={lgTeamOf(myRole) === 'loups' ? 'spade' : 'heart'}
                corners={false}
                className="flex h-11 w-8 shrink-0 items-center justify-center"
              >
                {(() => {
                  const RoleIcon = ROLE_META[myRole].Icon
                  return <RoleIcon aria-hidden className={cn('h-5 w-5', ROLE_META[myRole].ink)} />
                })()}
              </PlayingCard>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-cream/70">{t('yourRole')}</p>
              {/* Crème pour tous les rôles : un nom rouge vif se repère de
                  loin sur le téléphone d'un loup. */}
              <p
                className={cn(
                  'truncate font-display text-base font-bold leading-tight',
                  hideRole ? 'text-cream/70' : 'text-cream'
                )}
              >
                {hideRole ? t('roleHidden') : roleName(myRole)}
              </p>
            </div>
            {!hideRole && (
              <button
                type="button"
                onClick={() => setShowRoleDetails((v) => !v)}
                aria-expanded={showRoleDetails}
                aria-label={t('roleDetails')}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-cream/80 transition-colors hover:bg-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              >
                <ChevronDown
                  aria-hidden
                  className={cn('h-5 w-5 transition-transform', showRoleDetails && 'rotate-180')}
                />
              </button>
            )}
            <button
              type="button"
              onClick={() => setHideRole((v) => !v)}
              aria-label={hideRole ? t('showRole') : t('hideRole')}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gold/30 bg-gold/10 text-gold transition-colors hover:bg-gold/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              {hideRole ? <Eye aria-hidden className="h-5 w-5" /> : <EyeOff aria-hidden className="h-5 w-5" />}
            </button>
          </div>
          {!hideRole && showRoleDetails && (
            <div className="space-y-1 px-1 pb-1 pt-2 text-sm leading-snug text-cream/80">
              <p>{t(`roles.${myRole}.desc`)}</p>
              {myRole === 'loup' && accompliceNames && (
                <p className="font-semibold text-cream">{t('accomplices', { names: accompliceNames })}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Bannière du dernier lynchage (persiste pendant la nuit) */}
      {view.lastVoteResult && !isVotePhase && (
        <div className="flex items-center gap-2 rounded-2xl border border-gold/20 bg-felt-deep/60 px-3 py-2 text-xs font-semibold text-cream/80">
          <Scale aria-hidden className="h-4 w-4 shrink-0 text-gold" />
          <span>
            {view.lastVoteResult.eliminatedId
              ? t('voteBanner', {
                  name: nameOf(view.lastVoteResult.eliminatedId),
                  genre: genreOfPlayer(view.lastVoteResult.eliminatedId),
                  role: view.lastVoteResult.role ? roleName(view.lastVoteResult.role) : '—',
                })
              : t('voteTieBanner')}
          </span>
        </div>
      )}

      {/* ── Centre par phase ─────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${view.phase}#${view.phaseSeq}`}
          initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="space-y-3"
        >
          {view.phase === 'reveal-role' && (
            <>
              <div className="rounded-2xl border border-gold/25 bg-felt-deep/80 p-4 text-center">
                <p className="font-display text-lg font-bold text-gold">{t('revealPrompt')}</p>
                <p className="mt-1 text-sm text-cream/70">{t('revealHint')}</p>
              </div>
              {/* La carte entière, le temps de la mémoriser — masquable comme la
                  bande : hideRole survit à la revanche, et un rôle masqué ne
                  doit pas réapparaître en grand sous les yeux du voisin. */}
              {myRole &&
                (hideRole ? (
                  <div className="relative">
                    <PlayingCardBack className="min-h-[7rem]" />
                    <button
                      type="button"
                      onClick={() => setHideRole(false)}
                      aria-label={t('showRole')}
                      className="absolute right-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-xl border border-gold/30 bg-gold/10 text-gold transition-colors hover:bg-gold/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                    >
                      <Eye aria-hidden className="h-5 w-5" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <PlayingCard
                      suit={lgTeamOf(myRole) === 'loups' ? 'spade' : 'heart'}
                      rank="A"
                      className="min-h-[7rem]"
                    >
                      <div className="flex items-center gap-3 py-4 pl-8 pr-14">
                        {(() => {
                          const RoleIcon = ROLE_META[myRole].Icon
                          return (
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-[#24201A]/20 bg-[#24201A]/5">
                              <RoleIcon aria-hidden className={cn('h-7 w-7', ROLE_META[myRole].ink)} />
                            </div>
                          )
                        })()}
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-wide text-[#6B6455]">
                            {t('yourRole')}
                          </p>
                          <p className={cn('font-display text-2xl font-bold leading-tight', ROLE_META[myRole].ink)}>
                            {roleName(myRole)}
                          </p>
                          <p className="mt-1 text-sm leading-snug text-[#6B6455]">{t(`roles.${myRole}.desc`)}</p>
                          {myRole === 'loup' && accompliceNames && (
                            <p className="mt-1 text-sm font-semibold text-suit-red">
                              {t('accomplices', { names: accompliceNames })}
                            </p>
                          )}
                        </div>
                      </div>
                    </PlayingCard>
                    <button
                      type="button"
                      onClick={() => setHideRole(true)}
                      aria-label={t('hideRole')}
                      className="absolute right-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-xl border border-[#24201A]/[0.15] bg-[#24201A]/5 text-[#24201A] transition-colors hover:bg-[#24201A]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24201A]"
                    >
                      <EyeOff aria-hidden className="h-5 w-5" />
                    </button>
                  </div>
                ))}
            </>
          )}

          {view.phase === 'mayor-election' && (
            <div className="space-y-3 rounded-2xl border border-gold/30 bg-felt-deep/80 p-4">
              <p className="flex items-center justify-center gap-2 text-center text-sm font-bold text-cream">
                <Medal aria-hidden className="h-5 w-5 shrink-0 text-gold" />
                <span>
                  {!me?.alive ? t('spectatorVote') : view.myMayorVote ? t('mayorVoted') : t('mayorPrompt')}
                </span>
              </p>
              <TargetGrid
                mode="select"
                players={alive}
                iconOf={iconOf}
                selectedId={pick}
                onSelect={setPick}
                chosenId={view.myMayorVote ?? null}
                disabled={!me?.alive || Boolean(view.myMayorVote) || busy}
                pendingId={sending}
                meta={(p) => (view.hasVotedMayor[p.id] ? votedMark : null)}
                youLabel={t('you')}
                selfId={user.id}
              />
              {deadLine}
            </div>
          )}

          {/* NUIT : même cadre, même grille pour tous — à toucher pour
              l'acteur, posée pour le dormeur et pour l'acteur qui a joué. */}
          {isNight &&
            (iAmActingGuard ? (
              <div className={NIGHT_PANEL}>
                {nightTitle(
                  roleIcon('salvateur'),
                  view.guardProtectedId ? t('guardDone', { name: nameOf(view.guardProtectedId) }) : t('guardPrompt')
                )}
                {view.guardProtectedId ? (
                  restingVillage
                ) : (
                  <>
                    <TargetGrid
                      mode="select"
                      players={alive}
                      iconOf={iconOf}
                      selectedId={pick}
                      onSelect={setPick}
                      disabled={busy}
                      pendingId={sending}
                      excludeIds={view.guardLastProtectedId ? [view.guardLastProtectedId] : []}
                      youLabel={t('you')}
                      selfId={user.id}
                    />
                    {view.guardLastProtectedId && (
                      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-cream/80">
                        <Ban aria-hidden className="h-3.5 w-3.5 shrink-0" />
                        {t('guardForbidden', {
                          name: nameOf(view.guardLastProtectedId),
                          genre: genreOfPlayer(view.guardLastProtectedId),
                        })}
                      </p>
                    )}
                  </>
                )}
                {deadLine}
              </div>
            ) : iAmActingRaven ? (
              <div className={NIGHT_PANEL}>
                {nightTitle(
                  roleIcon('corbeau'),
                  view.ravenTargetId ? t('ravenDone', { name: nameOf(view.ravenTargetId) }) : t('ravenPrompt')
                )}
                {view.ravenTargetId ? (
                  restingVillage
                ) : (
                  <TargetGrid
                    mode="select"
                    players={alive.filter((p) => p.id !== user.id)}
                    iconOf={iconOf}
                    selectedId={pick}
                    onSelect={setPick}
                    disabled={busy}
                    pendingId={sending}
                    youLabel={t('you')}
                    selfId={user.id}
                  />
                )}
                {deadLine}
              </div>
            ) : iAmActingSeer ? (
              <div className={NIGHT_PANEL}>
                {nightTitle(roleIcon('voyante'), myPeek ? t('seerDone') : t('seerPrompt'))}
                {myPeek ? (
                  <>
                    {/* Encadré neutre : un violet vif désignait la voyante aux voisins. */}
                    <p className="rounded-xl border border-gold/30 bg-black/25 px-3 py-2 text-center text-sm font-black text-cream">
                      {t('seerResult', {
                        name: nameOf(myPeek.targetId),
                        team: myPeek.team === 'loups' ? t('teamLoups') : t('teamVillage'),
                      })}
                    </p>
                    {restingVillage}
                  </>
                ) : (
                  <TargetGrid
                    mode="select"
                    players={alive.filter((p) => p.id !== user.id)}
                    iconOf={iconOf}
                    selectedId={pick}
                    onSelect={setPick}
                    disabled={busy}
                    pendingId={sending}
                    youLabel={t('you')}
                    selfId={user.id}
                  />
                )}
                {deadLine}
              </div>
            ) : iAmActingWolf ? (
              <div className={NIGHT_PANEL}>
                {nightTitle(roleIcon('loup'), t('wolfPrompt'))}
                {accompliceNames && (
                  <p className="text-center text-xs font-semibold text-cream/80">
                    {t('accomplices', { names: accompliceNames })}
                  </p>
                )}
                {/* Modifiable jusqu'à la fin de la phase : un toucher suffit. */}
                <TargetGrid
                  players={alive.filter((p) => p.role !== 'loup')}
                  iconOf={iconOf}
                  onPick={(id) => void sendOnCard({ action: 'wolf-vote' }, id)}
                  disabled={busy}
                  pendingId={sending}
                  chosenId={view.wolfVotes?.[user.id] ?? null}
                  youLabel={t('you')}
                  selfId={user.id}
                />
                {view.wolfVotes && Object.keys(view.wolfVotes).length > 0 && (
                  <p className="text-center text-xs text-cream/80">
                    {t('wolfPack', {
                      votes: Object.entries(view.wolfVotes)
                        .map(([w, target]) => `${nameOf(w)} → ${nameOf(target)}`)
                        .join(' · '),
                    })}
                  </p>
                )}
                {deadLine}
              </div>
            ) : iAmActingWitch ? (
              <div className={NIGHT_PANEL}>
                {nightTitle(
                  roleIcon('sorciere'),
                  view.nightVictimId
                    ? t('witchVictim', { name: nameOf(view.nightVictimId) })
                    : t('witchNoVictim')
                )}
                {view.witchActed ? (
                  <>
                    <p className="text-center text-sm text-cream/80">{t('witchDone')}</p>
                    {restingVillage}
                  </>
                ) : (
                  <>
                    {/* Choisir sa potion ici, la boire dans la barre du bas. */}
                    <div role="group" aria-label={t('witchChoicesAria')} className="grid gap-2">
                      {(
                        [
                          view.witchPotions?.save && view.nightVictimId
                            ? {
                                id: 'save' as const,
                                icon: <Heart aria-hidden className="h-5 w-5 shrink-0 text-emerald-300" />,
                                label: t('witchSave', { name: nameOf(view.nightVictimId) }),
                              }
                            : null,
                          view.witchPotions?.kill
                            ? {
                                id: 'kill' as const,
                                icon: <Skull aria-hidden className="h-5 w-5 shrink-0 text-red-300" />,
                                label: t('witchKill'),
                              }
                            : null,
                          {
                            id: 'none' as const,
                            icon: <Moon aria-hidden className="h-5 w-5 shrink-0 text-sky-300" />,
                            label: t('witchNone'),
                          },
                        ].filter((o) => o !== null) as { id: WitchChoice; icon: ReactNode; label: string }[]
                      ).map((option) => {
                        const selected = witchChoice === option.id
                        return (
                          <button
                            key={option.id}
                            type="button"
                            aria-pressed={selected}
                            disabled={busy}
                            onClick={() => {
                              setWitchChoice(selected ? null : option.id)
                              setPick(null)
                            }}
                            className={cn(
                              'flex min-h-[48px] w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-sm font-semibold transition-colors',
                              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:opacity-60',
                              selected
                                ? 'border-gold bg-gold/20 text-cream ring-2 ring-gold'
                                : 'border-cream/20 bg-black/20 text-cream/90 hover:bg-black/30'
                            )}
                          >
                            {option.icon}
                            <span className="min-w-0 flex-1">{option.label}</span>
                            {selected && <Check aria-hidden className="h-5 w-5 shrink-0 text-gold" />}
                          </button>
                        )
                      })}
                    </div>
                    {witchChoice === 'kill' ? (
                      <>
                        <p className="text-center text-sm font-semibold text-cream/80">{t('witchKillPrompt')}</p>
                        {/* Anneau or, comme toute cible de nuit : un rouge désignerait la sorcière. */}
                        <TargetGrid
                          mode="select"
                          players={alive.filter((p) => p.id !== user.id)}
                          iconOf={iconOf}
                          selectedId={pick}
                          onSelect={setPick}
                          disabled={busy}
                          pendingId={sending}
                          youLabel={t('you')}
                          selfId={user.id}
                        />
                      </>
                    ) : (
                      // Le village posé, comme chez le dormeur : sans lui, des
                      // potions sombres face à une grille crème désignaient
                      // la sorcière.
                      restingVillage
                    )}
                  </>
                )}
                {deadLine}
              </div>
            ) : (
              /* Écran de sommeil — IDENTIQUE pour tous les non-acteurs. */
              <div className={NIGHT_PANEL}>
                {nightTitle(
                  <Moon aria-hidden className="h-5 w-5 shrink-0 text-sky-300 motion-safe:animate-pulse" />,
                  t('sleep')
                )}
                {restingVillage}
                {deadLine}
              </div>
            ))}

          {view.phase === 'dawn' && (
            <div className="rounded-2xl border border-gold/25 bg-felt-deep/80 p-4 text-center">
              <Sun aria-hidden className="mx-auto h-8 w-8 text-gold" />
              {view.lastNightDeaths.length === 0 ? (
                <p className="mt-2 font-display text-base font-bold text-emerald-200">{t('dawnNobody')}</p>
              ) : (
                <div className="mt-2 space-y-1.5">
                  {view.lastNightDeaths.map((d) => (
                    <p key={d.playerId} className="text-sm font-bold text-red-200">
                      {t(isSoft ? 'dawnDeathSoft' : 'dawnDeath', {
                        name: nameOf(d.playerId),
                        genre: genreOfPlayer(d.playerId),
                        role: roleName(d.role),
                      })}
                    </p>
                  ))}
                </div>
              )}
              {view.ravenTargetId && (
                <p className="mt-2 flex items-center justify-center gap-1.5 rounded-xl bg-slate-500/20 px-3 py-1.5 text-xs font-bold text-slate-100">
                  <Bird aria-hidden className="h-4 w-4 shrink-0" />
                  <span>{t('ravenMarkBanner', { name: nameOf(view.ravenTargetId), genre: genreOfPlayer(view.ravenTargetId) })}</span>
                </p>
              )}
              {view.elderAttackedRound === view.round && (
                <p className="mt-2 flex items-center justify-center gap-1.5 rounded-xl border border-orange-400/25 bg-orange-500/10 px-3 py-1.5 text-xs font-bold text-orange-200">
                  <Hourglass aria-hidden className="h-4 w-4 shrink-0" />
                  <span>{t('elderAttackedBanner')}</span>
                </p>
              )}
            </div>
          )}

          {/* LE moment dramatique de la partie : cadre rouge qui pulse,
              cible animée, sting sonore + vibration (effet plus haut). */}
          {view.phase === 'hunter-shot' && (
            <motion.div
              initial={reducedMotion ? false : { scale: 0.94, opacity: 0 }}
              animate={
                reducedMotion
                  ? { opacity: 1 }
                  : {
                      scale: 1,
                      opacity: 1,
                      boxShadow: [
                        '0 0 22px -8px rgba(179,56,46,0.45)',
                        '0 0 38px -6px rgba(179,56,46,0.8)',
                        '0 0 22px -8px rgba(179,56,46,0.45)',
                      ],
                    }
              }
              transition={
                reducedMotion
                  ? undefined
                  : { boxShadow: { repeat: Infinity, duration: 1.4 }, default: { duration: 0.25 } }
              }
              className="space-y-3 rounded-2xl border-2 border-suit-red/60 bg-gradient-to-b from-suit-red/25 to-felt-deep/90 p-4"
            >
              <div className="flex items-center justify-center gap-2">
                <motion.span
                  aria-hidden
                  className="inline-flex"
                  animate={reducedMotion ? undefined : { scale: [1, 1.25, 1] }}
                  transition={reducedMotion ? undefined : { repeat: Infinity, duration: 1.1 }}
                >
                  <Target className="h-6 w-6 text-red-300" />
                </motion.span>
                <p className="text-center font-display text-lg font-bold uppercase tracking-wide text-red-200">
                  {t('hunterMoment')}
                </p>
              </div>
              <p className="text-center text-sm font-bold text-amber-200">
                {iAmHunter
                  ? t('hunterPrompt')
                  : t('hunterWaiting', { name: nameOf(view.pendingHunterId), genre: genreOfPlayer(view.pendingHunterId) })}
              </p>
              {iAmHunter && (
                <TargetGrid
                  mode="select"
                  tone="danger"
                  players={alive}
                  iconOf={iconOf}
                  selectedId={pick}
                  onSelect={setPick}
                  disabled={busy}
                  pendingId={sending}
                  youLabel={t('you')}
                  selfId={user.id}
                />
              )}
            </motion.div>
          )}

          {isDebate && (
            <div className="space-y-3 rounded-2xl border border-gold/20 bg-felt-deep/70 p-4">
              <div>
                <p className="text-center text-sm font-bold text-cream">{t('debatePrompt')}</p>
                <p className="mt-0.5 text-center text-xs text-cream/70">{t('debateHint')}</p>
              </div>
              {view.ravenTargetId && (
                <p className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-500/20 px-3 py-1.5 text-center text-xs font-bold text-slate-100">
                  <Bird aria-hidden className="h-4 w-4 shrink-0" />
                  <span>{t('ravenMarkBanner', { name: nameOf(view.ravenTargetId), genre: genreOfPlayer(view.ravenTargetId) })}</span>
                </p>
              )}
              <DebateFeed
                speeches={view.debateSpeech}
                round={view.round}
                players={view.players}
                iconOf={iconOf}
                meId={user.id}
                variant="phone"
              />
              {me?.alive && speakMode && (
                <>
                  <p className="text-center text-sm font-semibold text-cream/80">
                    {speakMode === 'suspect' ? t('speakPickAccuse') : t('speakPickAlly')}
                  </p>
                  <TargetGrid
                    players={alive.filter((p) => p.id !== user.id)}
                    iconOf={iconOf}
                    onPick={(id) => speak(speakMode, id)}
                    disabled={!canSpeak}
                    pendingId={sending}
                    tone={speakMode === 'suspect' ? 'danger' : 'gold'}
                    youLabel={t('you')}
                    selfId={user.id}
                  />
                  <Button variant="quiet" size="game" className="w-full" onClick={() => setSpeakMode(null)}>
                    {t('speakCancel')}
                  </Button>
                </>
              )}
              {me?.alive && !speakMode && askedById && (
                <div className="space-y-2 rounded-xl border border-gold/40 bg-gold/10 p-3">
                  <p className="text-center text-sm font-bold text-gold">
                    {t('askedBy', { name: nameOf(askedById) })}
                  </p>
                  <TargetGrid
                    players={alive.filter((p) => p.id !== user.id)}
                    iconOf={iconOf}
                    onPick={(id) => speak('suspect', id)}
                    disabled={!canSpeak}
                    pendingId={sending}
                    tone="danger"
                    youLabel={t('you')}
                    selfId={user.id}
                  />
                  <Button
                    variant="quiet"
                    size="game"
                    className="w-full"
                    onClick={() => setSpeakMode('ally')}
                    disabled={!canSpeak}
                  >
                    <Handshake aria-hidden className="mr-2 h-4 w-4 shrink-0" />
                    {t('speakAlly')}
                  </Button>
                </div>
              )}
              {me?.alive && !speakMode && (
                <>
                  {lastAccuserId && (
                    <Button
                      variant="quiet"
                      size="game"
                      className="w-full"
                      onClick={() => speak('defend', lastAccuserId)}
                      disabled={!canSpeak}
                    >
                      <Shield aria-hidden className="mr-2 h-4 w-4 shrink-0 text-emerald-300" />
                      <span className="truncate">{t('speakDefendAgainst', { name: nameOf(lastAccuserId) })}</span>
                    </Button>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="danger" size="game" onClick={() => setSpeakMode('suspect')} disabled={!canSpeak}>
                      <Megaphone aria-hidden className="mr-2 h-4 w-4 shrink-0" />
                      {t('speakAccuse')}
                    </Button>
                    <Button variant="quiet" size="game" onClick={() => setSpeakMode('ally')} disabled={!canSpeak}>
                      <Handshake aria-hidden className="mr-2 h-4 w-4 shrink-0" />
                      {t('speakAlly')}
                    </Button>
                  </div>
                  <p className="text-center text-xs text-cream/70">
                    {t('speechLeft', { n: speechLeft, max: LG_SPEECH_CAP })}
                  </p>
                </>
              )}
            </div>
          )}

          {isVotePhase && (
            <div className="space-y-3 rounded-2xl border border-gold/20 bg-felt-deep/70 p-4">
              <p className="text-center text-sm font-bold text-cream">
                {!me?.alive
                  ? t('spectatorVote')
                  : view.myVote
                    ? t('voted')
                    : view.phase === 'day-revote'
                      ? t('revotePrompt')
                      : t('votePrompt')}
              </p>
              {/* Le +2 du Corbeau ne vaut que pour le PREMIER vote du jour :
                  au revote, le dire noir sur blanc évite la confusion. */}
              {view.phase === 'day-revote' && view.ravenTargetId && (
                <p className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-500/20 px-3 py-1.5 text-center text-xs font-bold text-slate-100">
                  <Bird aria-hidden className="h-4 w-4 shrink-0" />
                  {t('ravenRevoteNotice')}
                </p>
              )}
              {/* Le débat reste à portée pendant le vote : on vote en se
                  souvenant de qui a accusé qui. */}
              {roundSpeech.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowDebateReview((v) => !v)}
                    aria-expanded={showDebateReview}
                    className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border border-gold/20 bg-black/20 px-3 text-sm font-semibold text-cream transition-colors hover:bg-black/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                  >
                    <span className="flex items-center gap-2">
                      <MessageCircle aria-hidden className="h-4 w-4 shrink-0 text-gold" />
                      {t('reviewDebate')}
                    </span>
                    <ChevronDown
                      aria-hidden
                      className={cn('h-5 w-5 shrink-0 transition-transform', showDebateReview && 'rotate-180')}
                    />
                  </button>
                  {showDebateReview && (
                    <div className="mt-2">
                      <DebateFeed
                        speeches={view.debateSpeech}
                        round={view.round}
                        players={view.players}
                        iconOf={iconOf}
                        meId={user.id}
                        variant="phone"
                      />
                    </div>
                  )}
                </div>
              )}
              <TargetGrid
                mode="select"
                tone="danger"
                players={voteCandidates}
                iconOf={iconOf}
                selectedId={pick}
                onSelect={setPick}
                chosenId={view.myVote ?? null}
                disabled={!me?.alive || Boolean(view.myVote) || busy}
                excludeIds={[user.id]}
                pendingId={sending}
                meta={voteMeta}
                youLabel={t('you')}
                selfId={user.id}
              />
              {deadLine}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Le village : mini-cartes posées sur la table — crème pour les
          vivants, retournées côté feutre pour les morts. Absent quand une
          grille de cibles montre déjà le village. */}
      {!gridShown && (
        <div className="space-y-2 rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gold">
            {t('village', { alive: alive.length, total: view.players.length })}
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {view.players.map((p) => villageCard(p, 'dense'))}
          </div>
        </div>
      )}
    </div>
    {/* Hors de la colonne animée : un ancêtre transformé (framer-motion)
        décrocherait la barre fixe du bas de l'écran. Montée toute la phase,
        pour que sa ligne d'état s'annonce quand elle change. */}
    {barShown && (
      <OnlineActionBar status={barStatus} maxWidthClass="max-w-lg">
        {barActions}
      </OnlineActionBar>
    )}
    <AnimatePresence>
      {tutorial.open && <GameTutorialModal gameId="loup-garou" onClose={tutorial.close} />}
    </AnimatePresence>
    </>
  )
}
