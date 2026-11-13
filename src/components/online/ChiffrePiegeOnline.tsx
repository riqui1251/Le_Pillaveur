"use client"

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { motion, useReducedMotion } from 'framer-motion'
import { AlertTriangle, SkipForward, Trophy } from 'lucide-react'
import { useAuth } from '@/components/providers/AuthProvider'
import { useAmbianceMode } from '@/components/providers/AmbianceAttribute'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { useAdvanceTick, useAfkTick, useBotReferee } from '@/hooks/useBotReferee'
import { useGameAction } from '@/hooks/useGameAction'
import { useDeadline } from '@/hooks/useDeadline'
import { Button } from '@/components/ui/button'
import { TurnBanner } from '@/components/game/TurnBanner'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { GameOnlineLobby } from '@/components/online/GameOnlineLobby'
import { PhaseCountdown } from '@/components/online/PhaseCountdown'
import { PhaseHeader } from '@/components/online/PhaseHeader'
import { OnlineActionBar, onlineActionBarPadding } from '@/components/online/OnlineActionBar'
import { OnlineEndScreen } from '@/components/online/OnlineEndScreen'
import { XpGainBanner } from '@/components/online/XpGainBanner'
import { MedalDot } from '@/components/online/MedalDot'
import { GameTutorialModal, TutorialReopenButton, useGameTutorial } from '@/components/online/GameTutorialModal'
import { OnlinePlayerName, RankCrest, useMemberCosmetics } from '@/components/online/OnlinePlayerTag'
import { botAvatarFromName } from '@/lib/online/bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { isSoundMuted, playGameSound } from '@/lib/sound/game-sounds'
import { cn } from '@/lib/utils'
import { CHIFFRE_PIEGE_INPUT_MAX_LENGTH, readChiffrePiegeInput, sanitizeChiffrePiegeInput } from '@/lib/chiffre-piege/display'
import {
  CHIFFRE_PIEGE_JOKER_PENALTY,
  chiffrePiegeAttempts,
  chiffrePiegeNextStarterId,
  chiffrePiegeRanking,
  hasChiffrePiegeJoker,
  isChiffrePiegeForced,
} from '@/lib/chiffre-piege/engine'
import {
  chiffrePiegeBotTickDelayMs,
  currentChiffrePiegeActorId,
  parseChiffrePiegeClientView,
  type ChiffrePiegeOnlinePlayer,
} from '@/lib/chiffre-piege/online-state'
import {
  ChiffrePiegeBoomScreen,
  ChiffrePiegeHistory,
  ChiffrePiegeRangePanel,
  ChiffrePiegeTiles,
} from '@/app/[locale]/games/chiffre-piege/components/chiffre-piege-ui'
import { useChiffrePiegeText } from '@/app/[locale]/games/chiffre-piege/components/use-chiffre-piege-text'

/**
 * Le Chiffre Piégé en ligne : le serveur garde le piège, chaque téléphone
 * reçoit la même vue publique (intervalle, essais, pénalités). Le joueur au
 * tour tape son nombre ou grille son joker ; le BOUM s'affiche partout, puis
 * la manche suivante part au toucher d'un joueur (après la lecture) ou
 * d'office à l'échéance. Plateau, tuiles, historique et BOUM sont ceux du jeu
 * local (games/chiffre-piege/components) ; gorgées ou points selon l'ambiance
 * de CE téléphone.
 */

/** Avertissement d'inactivité 1 min avant le remplacement par un bot (comme les autres jeux). */
const AFK_WARN_AFTER_MS = ONLINE_REPLACE_GRACE_MS - 60_000

// Barre de MON tour : consigne + champ et « Tenter » (56 px) + joker (48 px),
// ou la consigne du dernier nombre sur deux lignes : plus haute qu'une rangée.
const PLAY_PADDING = 'pb-[calc(11rem+env(safe-area-inset-bottom,0px))]'
const FORCED_PADDING = 'pb-[calc(14rem+env(safe-area-inset-bottom,0px))]'

const BOOM_VIBRATION = [120, 60, 220]
const TURN_VIBRATION = [60]

/** Le son coupé coupe aussi la vibration (convention du jeu local). */
function vibrate(pattern: number[]) {
  if (isSoundMuted()) return
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // vibration refusée ou absente (iPhone) : l'écran et le son suffisent
  }
}

/** Écran tactile : le clavier se referme après l'essai et ne s'ouvre pas tout seul. */
function isTouchScreen(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches
  } catch {
    return false
  }
}

// Surcouche plein écran HORS de la scène : OnlineGameStage (z-20) est un
// contexte d'empilement, le BOUM rendu dedans passait sous la Navbar.
const portal = (node: ReactNode) => (typeof document === 'undefined' ? node : createPortal(node, document.body))

export function ChiffrePiegeOnline() {
  const { user } = useAuth()
  const { room, voteRematch, leaveRoom } = useOnlineRoom()
  const t = useTranslations('games.chiffre-piege')
  // Chaque téléphone affiche dans SON ambiance : gorgées, ou points sans alcool.
  const { mode: ambiance } = useAmbianceMode()
  const tx = useChiffrePiegeText(ambiance)
  const { busy, actionError, sendAction } = useGameAction(room?.id)
  const reduceMotion = useReducedMotion()
  const hintId = useId()
  const tableId = useId()
  const [entry, setEntry] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const forcedBarRef = useRef<HTMLDivElement>(null)
  const boomTitleRef = useRef<HTMLHeadingElement>(null)

  const inGame = room?.gameId === 'chiffre-piege' && room.status === 'playing'
  const tutorial = useGameTutorial('chiffre-piege', inGame)
  const cosmetics = useMemberCosmetics(room)
  const view = useMemo(
    () => (inGame ? parseChiffrePiegeClientView(room?.gameStateJson) : null),
    [inGame, room?.gameStateJson]
  )
  const live = Boolean(view && user && room && view.phase !== 'finished')
  const canContinue = useDeadline(view?.continueAt ?? null)

  // Échéance du BOUM : le rang 0 des arbitres l'envoie, le serveur suit en filet.
  useAdvanceTick({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    players: view?.players,
    enabled: live,
    advance: view && view.phaseEndsAt !== null ? { phaseKey: view.phaseKey, dueAt: view.phaseEndsAt } : null,
  })

  // Siège automatique au tour, bot ou parti (même formule que le serviceTick du serveur), et partis à remplacer.
  const botDelayMs = view ? chiffrePiegeBotTickDelayMs(view) : null
  useBotReferee({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    players: view?.players,
    enabled: live,
    botTick: botDelayMs !== null ? { body: { action: 'bot' }, delayMs: botDelayMs } : null,
    replaceLeft: Boolean(view?.players.some((p) => !p.isBot && p.leftAt)),
  })

  // Anti-AFK du joueur au tour, tant qu'un AUTRE humain est là pour le signaler.
  const actorId = view ? currentChiffrePiegeActorId(view) : null
  const actor = actorId === null ? undefined : view?.players.find((p) => p.id === actorId)
  const afkWatchable = Boolean(
    view &&
      actor &&
      !actor.isBot &&
      !actor.leftAt &&
      view.players.some((p) => !p.isBot && !p.leftAt && p.id !== actor.id)
  )
  const turnStartedAt = useAfkTick({
    roomId: room?.id,
    stateVersion: room?.stateVersion,
    userId: user?.id,
    targetId: actor?.id,
    enabled: afkWatchable,
  })
  const stateVersion = room?.stateVersion ?? -1
  const [afkWatch, setAfkWatch] = useState(false)
  useEffect(() => {
    setAfkWatch(false)
    if (!afkWatchable) return
    const timer = setTimeout(() => setAfkWatch(true), AFK_WARN_AFTER_MS)
    return () => clearTimeout(timer)
  }, [stateVersion, afkWatchable])

  // Un essai joué (par n'importe qui) : la saisie repart à vide.
  const turnKey = view ? `${view.game.roundIndex}:${view.game.history.length}:${view.phase}` : ''
  useEffect(() => {
    setEntry('')
  }, [turnKey])

  // BOUM reçu : son et vibration une fois par BOUM, jamais à l'arrivée sur un BOUM déjà en cours.
  const boomKey = view?.phase === 'boom' ? view.phaseKey : null
  const seenBoomRef = useRef<string | null | undefined>(undefined)
  const hasView = view !== null
  useEffect(() => {
    if (!hasView) return
    if (seenBoomRef.current !== undefined && boomKey && boomKey !== seenBoomRef.current) {
      playGameSound('boom')
      vibrate(BOOM_VIBRATION)
    }
    seenBoomRef.current = boomKey
    if (boomKey) boomTitleRef.current?.focus()
  }, [boomKey, hasView])

  // Mon tour au clavier : le champ prend le focus, ou le premier bouton actif de
  // la barre du dernier nombre, qui n'a pas de champ — le focus y tombait sur
  // <body>. Jamais au doigt : il ouvrirait le clavier.
  const isMyTurn = Boolean(user && actorId === user.id)
  const forced = view ? isChiffrePiegeForced(view.game) : false
  useEffect(() => {
    if (!isMyTurn || isTouchScreen()) return
    const target = inputRef.current ?? forcedBarRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')
    target?.focus({ preventScroll: true })
  }, [isMyTurn, turnKey, forced])

  // Mon tour arrive : son de tour et courte vibration. Tenu ici et non par
  // TurnBanner (alertOnMine) : le BOUM démonte le plateau, et le bandeau,
  // remonté avec « à moi », restait muet pour le joueur qui ouvre la manche
  // suivante. Jamais à la première vue, compte chargé (arrivée, reconnexion en
  // plein tour).
  const wasMyTurnRef = useRef<boolean | undefined>(undefined)
  const seesTable = hasView && Boolean(user)
  useEffect(() => {
    if (!seesTable) return
    if (isMyTurn && wasMyTurnRef.current === false) {
      playGameSound('turn')
      vibrate(TURN_VIBRATION)
    }
    wasMyTurnRef.current = isMyTurn
  }, [isMyTurn, seesTable])

  if (!inGame) {
    return <GameOnlineLobby gameId="chiffre-piege" />
  }

  if (!view || !user || !room) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="h-8 w-8 rounded-full border-2 border-gold/30 border-t-gold motion-safe:animate-spin" />
      </div>
    )
  }

  const game = view.game
  const playerOf = (id: string | null | undefined) => (id ? view.players.find((p) => p.id === id) : undefined)
  const nameOf = (id: string) => playerOf(id)?.name ?? ''
  const iconOf = (p: ChiffrePiegeOnlinePlayer) =>
    p.isBot ? botAvatarFromName(p.name) : room.members.find((m) => m.userId === p.id)?.preferences?.icon ?? '👤'
  const me = playerOf(user.id)
  const amPlaying = Boolean(me && !me.isBot && !me.leftAt)
  const tutorialButton = <TutorialReopenButton onClick={tutorial.reopen} className="h-11 w-11" />
  const tutorialModal = tutorial.open && <GameTutorialModal gameId="chiffre-piege" onClose={tutorial.close} />

  // Coups au tour SANS verrou de version : le moteur valide déjà tour, phase
  // et intervalle, et un départ ou un retour à la table pendant mon tour fait
  // monter la version — le 409 muet avalait l'essai. Un second envoi rattrape
  // une écriture vraiment simultanée (compare-and-swap perdu).
  const send = async (body: Record<string, unknown>) => {
    const res = await sendAction(body)
    return res?.status === 409 && res.data.error === 'version_conflict' ? sendAction(body) : res
  }

  // Voix unique, montée en permanence : dernier essai, joker, BOUM, fin.
  const ranking = chiffrePiegeRanking(game)
  const leaders = ranking.filter((row) => row.rank === 1)
  const winnerLine =
    leaders.length === 1 ? t('end.winner', { name: nameOf(leaders[0].playerId) }) : t('end.tie', { count: leaders.length })
  let liveText = ''
  if (view.phase === 'boom' && game.lastBoom) {
    liveText = tx('boom.live', { name: nameOf(game.lastBoom.playerId), value: game.lastBoom.trap, count: game.lastBoom.penalty })
  } else if (view.phase === 'finished') {
    liveText = winnerLine
  } else {
    const lastMove = game.history.length > 0 ? game.history[game.history.length - 1] : null
    if (lastMove?.kind === 'guess') {
      const where = isChiffrePiegeForced(game)
        ? t('game.forcedTitle', { value: game.low })
        : t('game.rangeSummary', { low: game.low, high: game.high, max: game.max })
      liveText = `${t('game.liveMiss', { name: nameOf(lastMove.playerId), value: lastMove.value, dir: lastMove.dir })} ${where}`
    } else if (lastMove?.kind === 'pass') {
      liveText = t('game.livePass', { name: nameOf(lastMove.playerId) })
    } else if (actor) {
      // Le bandeau de tour, remonté après le BOUM, naît avec son texte et se
      // tait : c'est cette voix qui dit qui ouvre la manche.
      liveText = t('game.liveRoundStarter', {
        round: game.roundIndex + 1,
        max: game.max,
        name: actor.name,
        mine: isMyTurn ? 'yes' : 'no',
      })
    } else {
      liveText = t('game.liveRound', { round: game.roundIndex + 1, max: game.max })
    }
  }
  const liveRegion = (
    <p role="status" aria-live="polite" className="sr-only">
      {liveText}
    </p>
  )

  // ── Fin de partie : du moins pénalisé au plus pénalisé ───────────────────
  if (view.phase === 'finished') {
    return (
      <>
        {liveRegion}
        <OnlineEndScreen
          rematchVotes={view.rematchVotes ?? []}
          onRematch={voteRematch}
          onLeave={leaveRoom}
          header={
            <motion.div
              initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 220, damping: 18 }}
              className="flex flex-col items-center gap-2 text-center"
            >
              <Trophy aria-hidden className="h-12 w-12 text-gold" />
              <h2 className="font-display text-3xl font-bold text-gold">{t('end.title')}</h2>
              <p className="text-sm text-cream/80">{winnerLine}</p>
            </motion.div>
          }
          ranking={
            <ol aria-label={t('end.results')} className="grid w-full max-w-sm grid-cols-1 gap-2">
              {ranking.map((row) => {
                const player = playerOf(row.playerId)
                if (!player) return null
                return (
                  <li
                    key={row.playerId}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border px-3 py-2',
                      row.rank === 1 ? 'border-gold/60 bg-gold/10' : 'border-gold/20 bg-felt-deep/70'
                    )}
                  >
                    <span className="flex w-6 shrink-0 items-center justify-center text-sm font-bold tabular-nums text-cream/80">
                      {row.rank <= 3 ? <MedalDot position={row.rank} /> : `${row.rank}.`}
                    </span>
                    <RankCrest role={cosmetics.get(player.id)?.role} size="sm" />
                    <span aria-hidden className="text-lg leading-none">
                      <PlayerAvatarGlyph value={iconOf(player)} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <OnlinePlayerName
                        name={player.name}
                        cosmetics={cosmetics.get(player.id)}
                        className="block truncate text-sm font-semibold text-cream"
                      />
                      {/* Replié et non tronqué : à 375 px, « joker grillé » disparaissait sous l'ellipse. */}
                      <p className="break-words text-xs text-cream/70">
                        {t('end.details', { booms: row.booms, joker: row.jokerUsed ? 'used' : 'kept' })}
                      </p>
                    </div>
                    <span className="shrink-0 font-display text-base font-semibold lining-nums tabular-nums text-gold">
                      {tx('end.penalty', { count: row.penalty })}
                    </span>
                  </li>
                )
              })}
            </ol>
          }
          // Gorgées ou points de pénalité : XP de participation, aucun vainqueur au classement du site.
          xp={<XpGainBanner playerIds={view.players.map((p) => p.id)} className="w-full max-w-sm" />}
        />
      </>
    )
  }

  // ── BOUM : sur tous les téléphones, rouge carreau ────────────────────────
  if (view.phase === 'boom' && game.lastBoom) {
    const boom = game.lastBoom
    const lastRound = game.roundIndex + 1 >= game.roundsTotal
    const loser = playerOf(boom.playerId)
    const nextStarterId = chiffrePiegeNextStarterId(game)
    // Le refus de « Manche suivante » (lecture pas finie à l'heure du serveur,
    // réseau) s'affiche ici : la barre d'action du tour n'est pas montée.
    const note = (actionError || view.phaseEndsAt !== null) && (
      <>
        {actionError && (
          <span role="alert" className="mb-1 flex items-center justify-center gap-1.5 font-bold text-cream">
            <AlertTriangle aria-hidden className="h-4 w-4 shrink-0" />
            {actionError}
          </span>
        )}
        {view.phaseEndsAt !== null && (
          <PhaseCountdown endsAt={view.phaseEndsAt}>
            {({ seconds }) => t(lastRound ? 'online.rankingIn' : 'online.nextRoundIn', { seconds })}
          </PhaseCountdown>
        )}
      </>
    )
    return (
      <>
        {liveRegion}
        {tutorialModal}
        {portal(
          <ChiffrePiegeBoomScreen
            boom={boom}
            loser={{ name: nameOf(boom.playerId) }}
            avatar={loser ? <PlayerAvatarGlyph value={iconOf(loser)} /> : undefined}
            roundIndex={game.roundIndex}
            roundsTotal={game.roundsTotal}
            nextStarter={nextStarterId ? { name: nameOf(nextStarterId) } : undefined}
            canContinue={canContinue && !busy}
            onContinue={amPlaying ? () => void send({ action: 'next', phaseKey: view.phaseKey }) : undefined}
            note={note}
            ambiance={ambiance}
            titleRef={boomTitleRef}
          />
        )}
      </>
    )
  }

  // ── Tour de jeu ──────────────────────────────────────────────────────────
  const leftPlayer = view.players.find((p) => !p.isBot && p.leftAt)
  const input = readChiffrePiegeInput(entry, game.low, game.high)
  const jokerAvailable = isMyTurn && hasChiffrePiegeJoker(game, user.id)
  const errorLine = actionError ? <span className="text-red-300">{actionError}</span> : null
  // Le siège d'un parti joue au hasard (même cerveau que les bots) : il ne « choisit » rien.
  const waitingLine = actor
    ? t(actor.leftAt ? 'online.autoTurn' : 'online.waitingTurn', { name: actor.name })
    : null

  const submitGuess = async (value: number) => {
    const res = await send({ action: 'guess', value })
    if (res?.ok && isTouchScreen()) inputRef.current?.blur()
  }
  const playJoker = async () => {
    const res = await send({ action: 'pass' })
    if (!res?.ok) return
    playGameSound('skip')
    if (isTouchScreen()) inputRef.current?.blur()
  }

  const jokerButton = jokerAvailable && (
    <Button
      type="button"
      variant="quiet"
      size="game"
      className="w-full whitespace-normal leading-tight"
      disabled={busy}
      onClick={() => void playJoker()}
    >
      <SkipForward aria-hidden className="mr-2 h-4 w-4 shrink-0" />
      {tx('game.jokerButton', { count: CHIFFRE_PIEGE_JOKER_PENALTY })}
    </Button>
  )

  const myTurnBar = forced ? (
    <div ref={forcedBarRef} className="flex w-full flex-col gap-2">
      <p className="text-center font-display text-lg font-bold leading-snug lining-nums text-red-300">
        {t('game.forcedTitle', { value: game.low })}
      </p>
      <p className="text-center text-sm text-cream/80">
        {jokerAvailable ? t('game.forcedWithJoker') : t('game.forcedNoJoker')}
      </p>
      <Button
        variant="danger"
        size="gameLg"
        className="w-full whitespace-normal leading-tight"
        disabled={busy}
        onClick={() => void submitGuess(game.low)}
      >
        {t('game.forcedPlay', { value: game.low })}
      </Button>
      {jokerButton}
    </div>
  ) : (
    <form
      className="flex w-full flex-col gap-2"
      noValidate
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (input.status === 'ok' && !busy) void submitGuess(input.value)
      }}
    >
      <p
        id={hintId}
        className={cn(
          'text-sm font-semibold leading-snug',
          input.status === 'out-of-range' ? 'text-red-300' : 'text-cream/80'
        )}
      >
        {input.status === 'out-of-range'
          ? t('game.outOfRange', { low: game.low, high: game.high })
          : t('game.inputHint', { low: game.low, high: game.high })}
      </p>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={entry}
          onChange={(event) => setEntry(sanitizeChiffrePiegeInput(event.target.value))}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={CHIFFRE_PIEGE_INPUT_MAX_LENGTH}
          autoComplete="off"
          enterKeyHint="go"
          aria-label={t('game.inputLabel', { low: game.low, high: game.high })}
          aria-describedby={hintId}
          aria-invalid={input.status === 'out-of-range'}
          placeholder={t('game.inputPlaceholder', { low: game.low, high: game.high })}
          className="h-14 w-0 min-w-0 flex-1 rounded-xl border border-cream/50 bg-black/30 px-4 text-center text-base font-semibold tabular-nums text-cream placeholder:text-cream/60 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/40"
        />
        <Button
          type="submit"
          variant="primary"
          size="gameLg"
          className="shrink-0 px-5"
          disabled={input.status !== 'ok' || busy}
        >
          {input.status === 'ok' ? t('game.tryValue', { value: input.value }) : t('game.try')}
        </Button>
      </div>
      {jokerButton}
    </form>
  )

  return (
    <>
      {liveRegion}
      <div
        className={cn(
          'flex flex-1 flex-col gap-3 p-3 text-cream sm:mx-auto sm:w-full sm:max-w-lg',
          isMyTurn ? (forced ? FORCED_PADDING : PLAY_PADDING) : onlineActionBarPadding('default')
        )}
      >
        <PhaseHeader
          phase={t('game.progress', {
            round: game.roundIndex + 1,
            total: game.roundsTotal,
            attempt: chiffrePiegeAttempts(game) + 1,
          })}
          right={tutorialButton}
        />
        {tutorialModal}

        {actor && (
          <TurnBanner mine={isMyTurn} name={actor.name} avatar={<PlayerAvatarGlyph value={iconOf(actor)} />} />
        )}

        {leftPlayer?.leftAt && (
          <div className="rounded-2xl border border-gold/30 bg-gold/10 px-4 py-2 text-center text-sm font-semibold text-cream">
            <PhaseCountdown endsAt={leftPlayer.leftAt + ONLINE_REPLACE_GRACE_MS}>
              {({ seconds }) => t('online.waitingReturn', { name: leftPlayer.name, seconds })}
            </PhaseCountdown>
          </div>
        )}

        {afkWatch && actor && (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-2 text-center text-sm font-semibold text-red-200">
            {actor.id === user.id && <AlertTriangle aria-hidden className="h-4 w-4 shrink-0" />}
            <PhaseCountdown endsAt={turnStartedAt + ONLINE_REPLACE_GRACE_MS}>
              {({ seconds }) =>
                actor.id === user.id
                  ? t('online.afkWarningSelf', { seconds })
                  : t('online.afkWarning', { name: actor.name, seconds })
              }
            </PhaseCountdown>
          </div>
        )}

        <ChiffrePiegeRangePanel view={game} mark={isMyTurn && input.status === 'ok' ? input.value : null} />
        <ChiffrePiegeTiles view={game} ambiance={ambiance} />
        <ChiffrePiegeHistory view={game} nameOf={nameOf} />

        <section aria-labelledby={tableId} className="rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
          <h2 id={tableId} className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">
            {t('online.tableTitle')}
          </h2>
          <ul className="grid grid-cols-2 gap-2">
            {view.players.map((p) => (
              <li
                key={p.id}
                className={cn(
                  'flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-2',
                  p.id === actorId ? 'border-gold/60 bg-gold/10' : 'border-gold/20 bg-black/20',
                  p.leftAt && 'opacity-60'
                )}
              >
                <RankCrest role={cosmetics.get(p.id)?.role} />
                <span aria-hidden className="text-lg leading-none">
                  <PlayerAvatarGlyph value={iconOf(p)} />
                </span>
                <span className="min-w-0 flex-1">
                  <OnlinePlayerName
                    name={p.name}
                    cosmetics={cosmetics.get(p.id)}
                    className="block truncate text-sm font-bold text-cream"
                  />
                  <span className="block truncate text-xs text-cream/70">
                    {tx('end.penalty', { count: game.penalties[p.id] ?? 0 })}
                    {hasChiffrePiegeJoker(game, p.id) && ` · ${t('online.jokerReady')}`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Montée toute la manche : sa ligne d'état n'est annoncée que si elle change. */}
      <OnlineActionBar
        status={isMyTurn ? errorLine : errorLine ?? waitingLine}
        maxWidthClass="max-w-lg"
      >
        {isMyTurn && myTurnBar}
      </OnlineActionBar>
    </>
  )
}
