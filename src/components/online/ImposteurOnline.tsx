"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { AlertTriangle, Check, Megaphone, Pencil, Send, Shield, Skull, Trophy, UserX } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { useDeadline } from '@/hooks/useDeadline'
import { GameOnlineLobby } from './GameOnlineLobby'
import { OnlineEndScreen } from './OnlineEndScreen'
import { OnlineActionBar, onlineActionBarPadding } from './OnlineActionBar'
import { PhaseHeader } from './PhaseHeader'
import { PhaseCountdown } from './PhaseCountdown'
import { PhaseCountdownLaunch } from './PhaseCountdownLaunch'
import { TurnBanner } from '@/components/game/TurnBanner'
import { Button } from '@/components/ui/button'
import { PlayingCard } from '@/components/ui/PlayingCard'
import { cn } from '@/lib/utils'
import {
  isEmptyClueText,
  isValidClue,
  IMPOSTEUR_CLUE_MAX_LEN,
  IMPOSTEUR_CLUE_MS,
  IMPOSTEUR_REVEAL_MS,
  IMPOSTEUR_SPEECH_CAP,
  IMPOSTEUR_VOTE_MS,
  imposteurCitedClue,
  type ImposteurClientView,
  type ImposteurHumanSpeakKind,
  type ImposteurSpeech,
} from '@/lib/imposteur/engine'
import { imposteurBotTickDelayMs } from '@/lib/imposteur/bot-tick'
import { botAvatarFromName } from '@/lib/online/bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { useAdvanceTick, useBotReferee } from '@/hooks/useBotReferee'
import { useGameAction } from '@/hooks/useGameAction'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial } from './GameTutorialModal'
import { OnlinePlayerName, RankCrest, useMemberCosmetics } from './OnlinePlayerTag'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { XpGainBanner } from './XpGainBanner'
import { TargetGrid } from './TargetGrid'
import { BotSpeechFeed } from './bot-speech/BotSpeechFeed'
import { genreOf, genreOfId, type LineTranslator } from './bot-speech/bot-speech-feed'
import { ImposteurWordChip } from './imposteur/ImposteurWordChip'
import { serverNow } from '@/hooks/server-clock'

/**
 * L'IMPOSTEUR en ligne (serveur-autoritaire). La vue est déjà filtrée par le
 * serveur : SEUL mon mot m'arrive — les camps des vivants ne quittent JAMAIS
 * le serveur (personne ne sait s'il est l'imposteur). Votes réduits à des
 * booléens « a voté ». Phases chronométrées : le compte à rebours est
 * décoratif côté client, l'échéance fait foi côté serveur (tick `advance`).
 *
 * Le geste du moment vit dans la barre du bas (zone du pouce) : le champ
 * d'indice à MON tour (il tombait sous la liste et le fil des bots, hors
 * écran pendant que les 45 s filaient), la validation du vote, « Manche
 * suivante ». Le vote est définitif côté moteur (ALREADY_VOTED) : on choisit
 * une carte, puis on valide.
 */

function parseView(json: string | null | undefined): ImposteurClientView | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as ImposteurClientView
    return Array.isArray(v.players) && typeof v.phase === 'string' ? v : null
  } catch {
    return null
  }
}

const AFK_WARN_AFTER_MS = ONLINE_REPLACE_GRACE_MS - 60_000

/** Durée totale de la phase, pour remplir la barre du chrono. */
const PHASE_TOTAL_MS: Partial<Record<ImposteurClientView['phase'], number>> = {
  clue: IMPOSTEUR_CLUE_MS,
  vote: IMPOSTEUR_VOTE_MS,
  reveal: IMPOSTEUR_REVEAL_MS,
}

/** Paroles qui chargent quelqu'un (accusation, abonder contre) : le compte des cartes de vote. */
const ACCUSING_KINDS: readonly string[] = ['suspect', 'rally']

/**
 * Le dernier joueur qui m'a accusé ou a abondé contre moi dans la manche,
 * tant que je ne me suis pas défendu depuis — la cible de « Me défendre ».
 */
function lastAccuserOf(
  speech: readonly ImposteurSpeech[],
  meId: string,
  isAlive: (id: string) => boolean
): string | null {
  for (let i = speech.length - 1; i >= 0; i -= 1) {
    const sp = speech[i]
    if (sp.playerId === meId && sp.kind === 'defend') return null
    if ((sp.kind === 'suspect' || sp.kind === 'rally') && sp.targetId === meId && isAlive(sp.playerId)) {
      return sp.playerId
    }
  }
  return null
}

export function ImposteurOnline() {
  const { user } = useAuth()
  const isSoft = user?.ambianceMode === 'soft'
  const { room, voteRematch, leaveRoom, fetchRoom } = useOnlineRoom()
  const t = useTranslations('games.imposteur.game')
  const tTargets = useTranslations('gameUi.targets')
  const { busy: posting, actionError, sendAction: postAction } = useGameAction(room?.id)
  // Relecture de la salle entre deux essais d'une intention (cf. sendIntent) :
  // le hook n'est plus « occupé », mais le geste n'est pas fini.
  const [retrying, setRetrying] = useState(false)
  const busy = posting || retrying
  const [hideWord, setHideWord] = useState(false)
  const reducedMotion = useReducedMotion()
  const [clueInput, setClueInput] = useState('')
  // Grille d'accusation ouverte par « Accuser » (distincte de la grille de vote).
  const [speakMode, setSpeakMode] = useState(false)
  const [speakSending, setSpeakSending] = useState<string | null>(null)
  // Vote en deux temps : la carte touchée est seulement CHOISIE, le vote part
  // du bouton de la barre du bas.
  const [votePick, setVotePick] = useState<string | null>(null)
  const [voteSending, setVoteSending] = useState<string | null>(null)

  const inGame = room?.gameId === 'imposteur' && room.status === 'playing'
  const view = useMemo(() => (inGame ? parseView(room?.gameStateJson) : null), [inGame, room?.gameStateJson])
  const stateVersion = room?.stateVersion ?? -1
  const tutorial = useGameTutorial('imposteur', inGame)
  const cosmetics = useMemberCosmetics(room)
  // Plancher de lecture de la révélation (le moteur refuse « continuer » avant).
  const continueUnlocked = useDeadline(view?.continueAt ?? null)

  // ÉCHÉANCE DE PHASE : tick « advance » arbitré par rang (cf. useAdvanceTick)
  // — le rang 0 tire à l'échéance, le suivant prend le relais 4 s plus tard si
  // son téléphone est verrouillé, et la version qui bouge coupe les autres.
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
  // humain restant arbitre, éliminé inclus (un spectateur pilote les ticks).
  // Délai calculé comme le filet serveur (bot-tick.ts) : indice du bot au
  // tour, « continuer » de la révélation, et tick « au cas où » dès qu'un bot
  // vivant est à table (paroles, vote groupé) — NOT_BOT_TURN (409) s'il n'a
  // rien à faire.
  const botActor = view?.players.find((p) => p.id === room?.currentTurnUserId)
  const botDelayMs = view
    ? imposteurBotTickDelayMs(
        {
          phase: view.phase,
          actorIsBot: Boolean(botActor?.isBot),
          actorName: botActor?.name,
          hasAliveBot: view.players.some((p) => p.isBot && !p.eliminated),
        },
        Math.random
      )
    : null
  useBotReferee({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    players: view?.players,
    enabled: Boolean(view && user && room && view.phase !== 'finished'),
    botTick: botDelayMs === null ? null : { body: { action: 'bot' }, delayMs: botDelayMs },
    replaceLeft: Boolean(view?.players.some((p) => !p.isBot && p.leftAt)),
  })

  // Anti-AFK (phase indices uniquement — le vote a son échéance).
  const turnStartRef = useRef({ version: stateVersion, at: serverNow() })
  if (turnStartRef.current.version !== stateVersion) {
    turnStartRef.current = { version: stateVersion, at: serverNow() }
  }
  const afkTarget = view?.players.find((p) => p.id === room?.currentTurnUserId)
  const afkWatchable = Boolean(
    view &&
      view.phase === 'clue' &&
      afkTarget &&
      !afkTarget.isBot &&
      !afkTarget.leftAt &&
      view.players.some((p) => !p.isBot && !p.leftAt && p.id !== afkTarget.id)
  )
  const [afkWatch, setAfkWatch] = useState(false)
  useEffect(() => {
    setAfkWatch(false)
    if (!afkWatchable) return
    const timer = setTimeout(() => setAfkWatch(true), AFK_WARN_AFTER_MS)
    return () => clearTimeout(timer)
  }, [stateVersion, afkWatchable])

  // Vide le champ d'indice et le choix de vote à chaque tour de parole ou
  // phase — pas à chaque version : les bots parlent pendant que l'humain
  // cherche son indice ou hésite sur son vote, et chaque parole effacerait
  // ce qu'il est en train de faire.
  const phaseKeyOfView = view?.phaseKey
  useEffect(() => {
    setClueInput('')
    setVotePick(null)
  }, [phaseKeyOfView])

  // La grille d'accusation se referme quand MA parole est passée, à chaque
  // phase et à chaque manche — ni à chaque version ni à chaque indice : les
  // bots parlent et jouent toutes les quelques secondes et la fermeraient
  // sous le doigt du joueur.
  const mySpeechCount =
    view && user
      ? (view.speech ?? []).filter((sp) => sp.round === view.round && sp.playerId === user.id).length
      : 0
  const speechRoundKey = view ? `${view.phase}#${view.round}` : null
  // Et quand mon tour d'indice arrive : la grille, masquée pendant mon tour,
  // ne doit pas resurgir ouverte une fois mon indice donné.
  const myClueTurnNow = Boolean(view && user && view.phase === 'clue' && room?.currentTurnUserId === user.id)
  useEffect(() => {
    setSpeakMode(false)
  }, [speechRoundKey, mySpeechCount, myClueTurnNow])

  if (!inGame) {
    return <GameOnlineLobby gameId="imposteur" />
  }

  if (!view || !user || !room) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-cream/70">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
      </div>
    )
  }

  const me = view.players.find((p) => p.id === user.id)
  const iAmAlive = Boolean(me && !me.eliminated)
  const activeId = room.currentTurnUserId
  const activePlayer = view.players.find((p) => p.id === activeId)
  const isMyClueTurn = view.phase === 'clue' && activeId === user.id && iAmAlive
  const finished = view.phase === 'finished'
  const reveal = view.lastReveal
  const alivePlayers = view.players.filter((p) => !p.eliminated)
  const aliveCount = alivePlayers.length

  const nameOf = (id: string | null | undefined) =>
    view.players.find((p) => p.id === id)?.name ?? '—'
  const revealGenre = genreOfId(view.players, reveal?.eliminatedId)
  const iconOf = (p: { id: string; name: string; isBot: boolean }) =>
    p.isBot ? botAvatarFromName(p.name) : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'

  // Verrou de version conservé ; le hook lit la réponse et annonce les refus.
  const sendAction = (body: Record<string, unknown>) =>
    postAction({ ...body, expectedVersion: room.stateVersion })
  // Intention du joueur (indice, vote, parole). Les bots parlent toutes les
  // 2,5 à 5,5 s : une parole arrivée entre-temps fait sauter le verrou, et le
  // 409 est muet — le vote validé dans la barre ou l'indice envoyé ne partait
  // pas, sans un mot. On relit la salle et on retente une fois (comme le
  // Loup-Garou) : le moteur revalide phase, tour et cible sur l'état frais,
  // et c'est la retentative qui parle si elle échoue.
  const sendIntent = async (body: Record<string, unknown>) => {
    const res = await sendAction(body)
    if (res?.status !== 409) return res
    setRetrying(true)
    try {
      const fresh = await fetchRoom()
      return fresh ? await postAction({ ...body, expectedVersion: fresh.stateVersion }) : res
    } finally {
      setRetrying(false)
    }
  }

  const clueTrimmed = clueInput.trim()
  const clueOk = me ? isValidClue(clueTrimmed, me.word) && !isEmptyClueText(clueTrimmed) : false
  const clueRejected = clueTrimmed.length > 0 && !clueOk
  const currentRoundClues = view.clues.filter((c) => c.round === view.round)
  const pastClues = view.clues.filter((c) => c.round < view.round)

  // Paroles : on parle pendant les indices (hors de son propre tour) et le vote.
  const speaking = view.phase === 'clue' || view.phase === 'vote'
  const roundSpeech = (view.speech ?? []).filter((sp) => sp.round === view.round)
  const speechLeft = Math.max(0, IMPOSTEUR_SPEECH_CAP - mySpeechCount)
  const canSpeak = iAmAlive && !busy && speechLeft > 0
  const isAlive = (id: string) => view.players.some((p) => p.id === id && !p.eliminated)
  const accuserId = lastAccuserOf(roundSpeech, user.id, isAlive)
  const speak = async (kind: ImposteurHumanSpeakKind, targetId: string) => {
    setSpeakSending(targetId)
    await sendIntent({ action: 'speak', kind, targetId })
    setSpeakSending(null)
  }
  const accusationsOf = (id: string) =>
    roundSpeech.filter((sp) => sp.targetId === id && ACCUSING_KINDS.includes(sp.kind)).length
  const tr: LineTranslator = {
    has: (key) => t.has(key),
    format: (key, values) => t(key, values),
  }
  const speechValues = (sp: ImposteurSpeech) => ({
    clue: imposteurCitedClue(view.clues, sp.targetId, sp.round),
  })

  // ── Écran de fin ─────────────────────────────────────────────────────────
  if (finished) {
    const civilWon = view.winnerTeam === 'civil'
    const won = view.players.find((p) => p.id === user.id)?.team === view.winnerTeam
    // Un bot ne boit pas : la ligne des gorgées ne vise que des perdants humains.
    const humanLosers = view.players.some((p) => !p.isBot && p.team !== view.winnerTeam)
    return (
      <OnlineEndScreen
        confetti
        won={won}
        rematchVotes={view.rematchVotes ?? []}
        onRematch={voteRematch}
        onLeave={leaveRoom}
        header={
          <motion.div
            initial={reducedMotion ? false : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 18 }}
            className="flex flex-col items-center gap-2 text-center"
          >
            <Trophy aria-hidden className="h-14 w-14 text-gold" />
            <h2 className="font-display text-3xl font-bold text-gold">
              {civilWon ? t('victory.civilWin') : t('victory.imposteurWin')}
            </h2>
            {!isSoft && humanLosers && (
              <p className="text-sm text-cream/80">
                {civilWon ? t('victory.civilDrinks') : t('victory.imposteurDrinks')}
              </p>
            )}
          </motion.div>
        }
        ranking={
          // Révélation complète
          <div className="w-full max-w-sm space-y-2">
            <p className="text-center text-xs font-semibold uppercase tracking-wide text-gold">
              {t('victory.fullReveal')}
            </p>
            {view.players.map((p) => (
              <div
                key={p.id}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border px-4 py-2.5',
                  p.team === 'imposteur'
                    ? 'border-suit-red/40 bg-suit-red/10'
                    : 'border-gold/20 bg-felt-deep/70'
                )}
              >
                <RankCrest role={cosmetics.get(p.id)?.role} />
                {/* Éliminé : seul l'avatar s'estompe — la ligne entière à 60 %
                    passait le mot révélé (cream/80) sous 4,5:1 ; le crâne et le
                    nom barré portent l'état. */}
                <span className={cn('text-xl', p.eliminated && 'opacity-50')} aria-hidden>
                  <PlayerAvatarGlyph value={iconOf(p)} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 text-sm font-bold">
                    <OnlinePlayerName
                      name={p.name}
                      cosmetics={cosmetics.get(p.id)}
                      className={cn('truncate', p.eliminated && 'line-through')}
                    />
                    {p.eliminated && (
                      <>
                        <Skull aria-hidden className="h-4 w-4 shrink-0 text-cream/70" />
                        <span className="sr-only">{` (${tTargets('dead')})`}</span>
                      </>
                    )}
                  </p>
                  <p className="break-words text-sm text-cream/80">« {p.word} »</p>
                </div>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-xs font-black uppercase',
                    p.team === 'imposteur'
                      ? 'bg-suit-red/30 text-red-100'
                      : 'bg-emerald-500/20 text-emerald-100'
                  )}
                >
                  {p.team === 'imposteur'
                    ? t('victory.teamImposteur', { genre: genreOf(p) })
                    : t('victory.teamCivil', { genre: genreOf(p) })}
                </span>
              </div>
            ))}
          </div>
        }
        xp={<XpGainBanner won={won} playerIds={view.players.map((p) => p.id)} className="w-full max-w-sm" />}
      />
    )
  }

  // ── Compte à rebours de lancement ────────────────────────────────────────
  // La pleine carte du mot, une seule fois : c'est le moment de le mémoriser.
  if (view.phase === 'countdown') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-cream">
        <p className="font-display text-base font-bold uppercase tracking-widest text-gold">
          {t('countdown.title')}
        </p>
        <PhaseCountdownLaunch endsAt={view.phaseEndsAt} className="font-display text-8xl font-bold tabular-nums text-gold" />
        {me && (
          <PlayingCard suit="spade" rank="K" className="w-full max-w-xs">
            <div className="px-6 py-3 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#6B6455]">
                {t('yourWord')}
              </p>
              <p className="break-words font-display text-2xl font-bold tracking-wide text-[#24201A]">
                {me.word}
              </p>
              <p className="mt-1 text-xs leading-snug text-[#6B6455]">{t('wordHint')}</p>
            </div>
          </PlayingCard>
        )}
        <p className="text-center text-sm font-semibold text-cream/80">{t('countdown.hint')}</p>
      </div>
    )
  }

  // ── Partie en cours ──────────────────────────────────────────────────────
  const leftPlayer = view.players.find((p) => !p.isBot && p.leftAt)
  const isVote = view.phase === 'vote'
  const isReveal = view.phase === 'reveal' && Boolean(reveal)
  const showClueBar = isMyClueTurn && Boolean(me)
  const hasBar = showClueBar || isVote || isReveal
  // Révélation : une rangée seule, sauf quand une erreur s'affiche au-dessus
  // de « Manche suivante » (elle recouvrirait la fin du récap des indices).
  const flowPadding = !hasBar
    ? 'pb-6'
    : onlineActionBarPadding(isReveal && !actionError ? 'default' : 'tall')

  // Vote : candidats = vivants, moi exclu (le moteur refuse le vote contre soi),
  // dans l'ordre de parole de la manche — les cartes portent les indices, elles
  // doivent se lire comme le fil qu'elles remplacent.
  const clueRank = (id: string) => {
    const i = view.clueOrder.indexOf(id)
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }
  const voteCandidates = alivePlayers
    .filter((p) => (iAmAlive ? p.id !== user.id : true))
    .sort((a, b) => clueRank(a.id) - clueRank(b.id))
  const votedCount = alivePlayers.filter((p) => p.hasVoted).length
  const canVote = isVote && iAmAlive && !view.myVote
  const confirmVote = async () => {
    if (!votePick) return
    setVoteSending(votePick)
    const res = await sendIntent({ action: 'vote', targetId: votePick })
    setVoteSending(null)
    // Échec (refus annoncé) : le choix reste, on peut revalider.
    if (res?.ok) setVotePick(null)
  }
  const sendClue = () => {
    if (clueOk && !busy) void sendIntent({ action: 'clue', text: clueTrimmed })
  }

  // L'erreur d'action s'affiche là où l'on vient d'agir : dans la barre du bas
  // quand elle est là (le haut de l'écran est hors de vue en tapant).
  const errorLine = actionError ? <span className="font-semibold text-red-300">{actionError}</span> : null
  // Sans barre (indices, pas mon tour), le seul geste possible est une parole :
  // le refus s'affiche dans le panneau du débat, sous le doigt — en haut de
  // l'écran, il tombait hors de vue. 3 s.
  const errorAlert = actionError ? (
    <div role="alert" className="rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-2 text-center text-sm font-semibold text-red-300">
      {actionError}
    </div>
  ) : null
  const barStatus = errorLine
    ?? (showClueBar && clueRejected
      ? <span className="font-semibold text-red-300">{t('clueInvalid')}</span>
      : isVote
        ? view.myVote
          ? t('votedStatus', { n: votedCount, total: aliveCount })
          : t('voteProgress', { n: votedCount, total: aliveCount })
        : null)

  const continueLocked = view.continueAt != null && !continueUnlocked

  const phaseTitle =
    view.phase === 'clue' ? t('phaseHeader.clue') : isVote ? t('phaseHeader.vote') : t('phaseHeader.reveal')

  const clueList = (
    <ul className="space-y-1.5">
      {view.clueOrder.map((pid) => {
        const p = view.players.find((q) => q.id === pid)
        if (!p) return null
        const clue = currentRoundClues.find((c) => c.playerId === pid)
        const isActive = view.phase === 'clue' && activeId === pid
        return (
          <li
            key={pid}
            className={cn(
              'flex items-center gap-2 rounded-xl border px-3 py-2',
              isActive ? 'border-gold/50 bg-gold/10' : 'border-cream/10 bg-black/20',
              p.eliminated && 'opacity-40'
            )}
          >
            <span className="shrink-0 text-lg" aria-hidden><PlayerAvatarGlyph value={iconOf(p)} /></span>
            <span
              className={cn(
                'w-[6.5rem] shrink-0 truncate text-sm font-semibold text-cream/80',
                p.eliminated && 'line-through'
              )}
            >
              <OnlinePlayerName name={p.name} cosmetics={cosmetics.get(p.id)} />
              {p.id === user.id && <span className="text-cream/70"> {t('you')}</span>}
            </span>
            <span className="min-w-0 flex-1 break-words text-sm font-bold text-cream">
              {clue ? (
                `« ${clue.text} »`
              ) : isActive ? (
                <Pencil aria-hidden className="inline-block h-4 w-4 text-gold motion-safe:animate-pulse" />
              ) : (
                ''
              )}
            </span>
            {p.eliminated && (
              <>
                <Skull aria-hidden className="h-4 w-4 shrink-0 text-cream/70" />
                <span className="sr-only">{` (${tTargets('dead')})`}</span>
              </>
            )}
          </li>
        )
      })}
    </ul>
  )

  return (
    <>
    <div className={cn('flex flex-1 flex-col gap-3 p-3 text-cream sm:mx-auto sm:w-full sm:max-w-lg', flowPadding)}>
      <PhaseHeader
        round={t('round', { n: view.round })}
        phase={phaseTitle}
        endsAt={view.phaseEndsAt}
        total={PHASE_TOTAL_MS[view.phase]}
        dangerMs={10_000}
        right={<TutorialReopenButton onClick={tutorial.reopen} className="h-11 w-11" />}
        status={
          view.phase === 'clue'
            ? t('clueProgress', { n: currentRoundClues.length, total: view.clueOrder.length })
            : undefined
        }
      />

      {/* À qui le tour : seule la phase d'indices se joue chacun son tour.
          Monté toute la partie, masqué hors indices : TurnBanner sonne au
          PASSAGE à « à moi », jamais au montage — le premier de l'ordre d'une
          nouvelle manche n'aurait sinon ni son ni vibration (à la manche 1,
          il se monte après le compte à rebours, que toute la table regarde). */}
      <TurnBanner
        mine={isMyClueTurn}
        name={activePlayer?.name}
        avatar={activePlayer ? <PlayerAvatarGlyph value={iconOf(activePlayer)} /> : undefined}
        hint={isMyClueTurn ? t('clueHintMine') : undefined}
        alertOnMine
        className={view.phase === 'clue' ? undefined : 'hidden'}
      />

      {!hasBar && !speaking && errorAlert}
      {/* Bannières retour / AFK */}
      {leftPlayer?.leftAt && (
        <div className="rounded-2xl border border-gold/30 bg-gold/10 px-4 py-2 text-center text-sm font-semibold text-cream">
          <PhaseCountdown endsAt={leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS}>
            {({ seconds }) => t('waitingReturn', { name: leftPlayer.name, seconds })}
          </PhaseCountdown>
        </div>
      )}
      {afkWatch && afkTarget && (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-2 text-center text-sm font-semibold text-red-300">
          {afkTarget.id === user.id && <AlertTriangle aria-hidden className="h-4 w-4 shrink-0" />}
          <PhaseCountdown endsAt={turnStartRef.current.at + ONLINE_REPLACE_GRACE_MS}>
            {({ seconds }) =>
              afkTarget.id === user.id
                ? t('afkWarningSelf', { seconds })
                : t('afkWarning', { name: afkTarget.name, seconds })
            }
          </PhaseCountdown>
        </div>
      )}

      {/* Mon mot secret : une bande retournable (la pleine carte est au compte à rebours). */}
      {me && (
        <ImposteurWordChip word={me.word} eliminated={!iAmAlive} hidden={hideWord} onHiddenChange={setHideWord} />
      )}

      {/* Révélation */}
      <AnimatePresence>
        {view.phase === 'reveal' && reveal && (
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-3 rounded-2xl border border-gold/25 bg-felt-deep/80 p-4 text-center"
          >
            {reveal.eliminatedId ? (
              <>
                <UserX aria-hidden className="mx-auto h-8 w-8 text-red-300" />
                <p className="font-display text-lg font-bold text-gold">
                  {t('reveal.outTitle', { name: nameOf(reveal.eliminatedId), genre: revealGenre })}
                </p>
                <p className="text-sm text-cream/80">
                  {t('reveal.outWord', { word: reveal.word ?? '—', genre: revealGenre })}
                </p>
                <p
                  className={cn(
                    'mx-auto w-fit rounded-full px-3 py-1 text-sm font-black uppercase',
                    reveal.team === 'imposteur'
                      ? 'bg-suit-red/25 text-red-100'
                      : 'bg-emerald-500/20 text-emerald-100'
                  )}
                >
                  {reveal.team === 'imposteur'
                    ? t('reveal.wasImposteur', { genre: revealGenre })
                    : t('reveal.wasCivil', { genre: revealGenre })}
                </p>
                {!isSoft && reveal.sips > 0 && (
                  <p className="text-sm font-bold text-amber-200">
                    {t('reveal.sips', { name: nameOf(reveal.eliminatedId), sips: reveal.sips })}
                  </p>
                )}
              </>
            ) : (
              <>
                {/* Zéro voix exprimée n'est pas une égalité (tie = false). */}
                <p className="font-display text-lg font-bold text-gold">
                  {reveal.tie ? t('reveal.tieTitle') : t('reveal.noVote')}
                </p>
                <p className="text-sm text-cream/80">{t('reveal.tieMsg')}</p>
              </>
            )}
            {/* Décompte public */}
            {Object.keys(reveal.tally).length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5">
                {Object.entries(reveal.tally)
                  .sort((a, b) => b[1] - a[1])
                  .map(([id, count]) => (
                    <span
                      key={id}
                      className="rounded-full border border-cream/20 bg-black/20 px-2.5 py-0.5 text-sm text-cream/80"
                    >
                      {nameOf(id)} : <span className="font-bold tabular-nums text-cream">{count}</span>
                    </span>
                  ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Vote : les cartes portent l'indice de chacun — on décide sans
          remonter au fil. Un toucher choisit, la barre du bas valide. */}
      {isVote && (
        <div className="space-y-2.5 rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
          <p className="text-center text-sm font-semibold text-cream/80">
            {iAmAlive ? (view.myVote ? t('voted') : t('votePickHint')) : t('spectatorVote')}
          </p>
          <TargetGrid
            mode="select"
            tone="danger"
            players={voteCandidates}
            iconOf={iconOf}
            selectedId={canVote ? votePick : null}
            onSelect={setVotePick}
            chosenId={view.myVote ?? null}
            disabled={!canVote || busy}
            pendingId={voteSending}
            meta={(p) => {
              const clue = currentRoundClues.find((c) => c.playerId === p.id)
              const accused = accusationsOf(p.id)
              const voted = view.players.find((q) => q.id === p.id)?.hasVoted
              if (!clue && !accused && !voted) return null
              return (
                <>
                  {/* L'indice décide du vote : 14 px en encre, au-dessus des 12 px gris de l'état. */}
                  {clue && <span className="block break-words text-sm text-[#24201A]">« {clue.text} »</span>}
                  {(accused > 0 || voted) && (
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2">
                      {accused > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Megaphone aria-hidden className="h-3 w-3 shrink-0" />
                          {t('accusations', { count: accused })}
                        </span>
                      )}
                      {voted && (
                        <span className="inline-flex items-center gap-1">
                          <Check aria-hidden className="h-3 w-3 shrink-0" strokeWidth={3} />
                          {t('hasVotedMeta')}
                        </span>
                      )}
                    </span>
                  )}
                </>
              )
            }}
            youLabel={t('you')}
            selfId={user.id}
          />
        </div>
      )}

      {/* Fil d'indices de la manche (au vote, les cartes de vote le portent). */}
      {!isVote && (
        <div className="space-y-2 rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gold">
            {t('cluesTitle', { n: view.round })}
          </p>
          {clueList}
        </div>
      )}

      {/* Débat : fil des paroles (bots et humains), Accuser / Me défendre */}
      {speaking && (
        <div className="space-y-2.5 rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gold">{t('feedAria')}</p>
          <BotSpeechFeed
            speeches={view.speech ?? []}
            round={view.round}
            players={view.players}
            iconOf={iconOf}
            meId={user.id}
            variant="phone"
            tr={tr}
            feedAria={t('feedAria')}
            aimedBadge={{ kinds: ['suspect', 'rally'], text: t('accusedYou') }}
            valuesOf={speechValues}
            // Une parole de bot toutes les quelques secondes : le lecteur
            // d'écran n'entend que celles qui me visent.
            live="aimed"
          />
          {!hasBar && errorAlert}
          {/* Hors de mon tour d'indice, vivant */}
          {iAmAlive && !isMyClueTurn && (
            speakMode ? (
              <div className="space-y-2">
                <p className="text-center text-sm font-semibold text-cream/80">{t('speakPickAccuse')}</p>
                <TargetGrid
                  players={view.players.filter((p) => !p.eliminated && p.id !== user.id)}
                  iconOf={iconOf}
                  onPick={(id) => void speak('suspect', id)}
                  disabled={!canSpeak}
                  pendingId={speakSending}
                  youLabel={t('you')}
                  selfId={user.id}
                />
                <Button variant="quiet" size="game" className="w-full" onClick={() => setSpeakMode(false)}>
                  {t('speakCancel')}
                </Button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className={cn('grid gap-2', accuserId ? 'grid-cols-2' : 'grid-cols-1')}>
                  <Button
                    variant="danger"
                    size="game"
                    className="min-w-0 px-3"
                    onClick={() => setSpeakMode(true)}
                    disabled={!canSpeak}
                  >
                    <Megaphone aria-hidden className="mr-1.5 h-4 w-4 shrink-0" />
                    <span className="truncate">{t('speakAccuse')}</span>
                  </Button>
                  {accuserId && (
                    <Button
                      variant="primary"
                      size="game"
                      className="min-w-0 px-3"
                      onClick={() => void speak('defend', accuserId)}
                      disabled={!canSpeak}
                    >
                      <Shield aria-hidden className="mr-1.5 h-4 w-4 shrink-0" />
                      <span className="truncate">{t('speakDefend')}</span>
                    </Button>
                  )}
                </div>
                <p className="text-center text-xs text-cream/70">
                  {t('speechLeft', { n: speechLeft, max: IMPOSTEUR_SPEECH_CAP })}
                </p>
              </div>
            )
          )}
        </div>
      )}

      {/* Manches précédentes (aide-mémoire compact) */}
      {pastClues.length > 0 && (
        <details className="rounded-2xl border border-gold/20 bg-felt-deep/70 px-3 text-sm text-cream/80">
          <summary className="cursor-pointer py-3 font-semibold text-cream">
            {t('pastClues')}
          </summary>
          <div className="space-y-1 pb-3">
            {pastClues.map((c, i) => (
              <p key={i} className="break-words">
                <span className="text-cream/70">{t('round', { n: c.round })} · {nameOf(c.playerId)} ·</span> « {c.text} »
              </p>
            ))}
          </div>
        </details>
      )}
    </div>

    {/* Le geste du moment, sous le pouce */}
    {hasBar && (
      <OnlineActionBar status={barStatus} maxWidthClass="max-w-lg">
        {showClueBar && (
          <>
          {/* Le chrono redit sous le pouce : clavier ouvert, l'en-tête de
              phase est hors de vue pendant que les 45 s filent. */}
          <PhaseCountdown
            variant="bar"
            showDigits
            endsAt={view.phaseEndsAt}
            total={IMPOSTEUR_CLUE_MS}
            dangerMs={10_000}
            colorClassName="bg-gold"
            className="mb-2 flex items-center gap-3"
          />
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              sendClue()
            }}
          >
            <input
              value={clueInput}
              onChange={(e) => setClueInput(e.target.value)}
              maxLength={IMPOSTEUR_CLUE_MAX_LEN}
              placeholder={t('cluePlaceholder')}
              aria-label={t('cluePlaceholder')}
              aria-invalid={clueRejected || undefined}
              autoComplete="off"
              enterKeyHint="send"
              autoFocus
              // text-base : sous 16 px, iOS zoome sur le champ au toucher.
              className="h-12 min-w-0 flex-1 rounded-xl border border-cream/[0.25] bg-black/30 px-4 text-base font-semibold text-cream placeholder:text-cream/60 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/40"
            />
            <Button
              type="submit"
              variant="primary"
              size="game"
              disabled={busy || !clueOk}
              aria-label={t('clueSend')}
              className="shrink-0 px-4"
            >
              <Send aria-hidden className="mr-1.5 h-4 w-4" />
              {t('clueSendShort')}
            </Button>
          </form>
          </>
        )}
        {canVote && (
          <div className="flex gap-2">
            <Button
              variant="quiet"
              size="gameLg"
              className="shrink-0 px-4"
              disabled={!votePick || busy}
              onClick={() => setVotePick(null)}
            >
              {t('voteChange')}
            </Button>
            <Button
              variant="danger"
              size="gameLg"
              className="min-w-0 flex-1"
              disabled={!votePick || busy}
              onClick={() => void confirmVote()}
            >
              <span className="truncate">
                {votePick ? t('voteFor', { name: nameOf(votePick) }) : t('votePickFirst')}
              </span>
            </Button>
          </div>
        )}
        {isReveal && reveal && (
          <Button
            variant="primary"
            size="gameLg"
            className="w-full"
            disabled={busy || continueLocked}
            onClick={() => void sendAction({ action: 'continue' })}
          >
            {aliveCount <= 3 || reveal.team === 'imposteur'
              ? t('reveal.seeResult')
              : t('reveal.continue')}
          </Button>
        )}
      </OnlineActionBar>
    )}
    <AnimatePresence>
      {tutorial.open && <GameTutorialModal gameId="imposteur" onClose={tutorial.close} />}
    </AnimatePresence>
    </>
  )
}
