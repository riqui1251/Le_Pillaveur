/* eslint-disable react-hooks/exhaustive-deps */
"use client"

import { useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { motion, useReducedMotion } from 'framer-motion'
import { Flag, RotateCcw, TrendingUp, Undo2 } from 'lucide-react'
import type { Player } from '@/lib/players'
import type { AmbianceMode } from '@/lib/ambiance-mode'
import { Button } from '@/components/ui/button'
import { PlayingCardBack } from '@/components/ui/PlayingCard'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { PlayerName } from '@/components/ui/PlayerName'
import { GameShell } from '@/components/game/GameShell'
import { ResumeGamePrompt } from '@/components/game/ResumeGamePrompt'
import { PassPhoneOverlay } from '@/components/game/PassPhoneOverlay'
import { useConfirmAction } from '@/components/game/ConfirmActionDialog'
import { useResumableLocalGame } from '@/lib/game-session'
import { randomSeed } from '@/lib/petit-buveur/rng'
import { playGameSound } from '@/lib/sound/game-sounds'
import { cn } from '@/lib/utils'
import { loadCapCards } from '@/lib/cap-ou-pas-cap/load'
import {
  CAP_KINDS,
  CAP_SAVE_ID,
  CAP_SAVE_VERSION,
  canResumeCapSave,
  canReturnToSender,
  capCardsPlayed,
  capLevelUp,
  capPoolFor,
  capTargetId,
  cardHolderId,
  cardStake,
  createGame,
  currentLevel,
  currentPlayerId,
  drawCard,
  endGame,
  fillPlayerToken,
  hasJoker,
  ranking,
  resolve as resolveCapCard,
  restoreCapSave,
  returnToSender,
  toCapSave,
  type CapCard,
  type CapKind,
  type CapOutcome,
  type CapSave,
  type CapSettings,
  type CapState,
} from '@/lib/cap-ou-pas-cap/engine'
import { CapCardFace, CapChoiceBack, CapJokerDialog } from './cap-ui'
import { CapEndScreen } from './cap-end'

interface GameProps {
  players: Player[]
  settings: CapSettings
  /** Figée au clic « Commencer » : gorgées ou points pour toute la partie. */
  ambiance: AmbianceMode
  onGameEnd: () => void
  updatePlayerStats: (playerId: string, gameId: string, stats: { gamesPlayed: number; totalDrinks?: number; wins?: number }) => void
}

/** Retournement de la carte tirée. Sans animation (préférence système), elle se montre d'un coup. */
const FLIP_MS = 600

/** Ce qui vient de se jouer, rappelé au joueur suivant (état d'écran, jamais sauvegardé). */
type LastOutcome = { playerId: string; outcome: CapOutcome; stake: number }

/** Morceaux lus à la suite par le lecteur d'écran : un point seulement là où il en manque. */
const asSentence = (text: string) => (/[.!?…]$/.test(text.trim()) ? text : `${text}.`)

const HEADER_BUTTON = 'border border-gold/20 bg-black/20 text-cream/70 hover:bg-black/30 hover:text-gold'
const BIG_ANSWER = 'h-auto min-h-[3.5rem] flex-1 flex-col gap-0.5 whitespace-normal px-3 py-2 leading-tight'
/** Barre à deux rangées (joker au-dessus des réponses) : le contenu doit pouvoir défiler au-dessus. */
const TWO_ROW_BAR_PADDING = 'pb-[calc(9.5rem+env(safe-area-inset-bottom,0px))]'
/** Plafonnée en hauteur d'écran : sur un iPhone, le prix passait sous la barre d'action. */
const CARD_HEIGHT = 'min-h-[min(21rem,45dvh)] w-full'

export default function Game({ players, settings, ambiance, onGameEnd, updatePlayerStats }: GameProps) {
  const t = useTranslations('games.cap-ou-pas-cap')
  const tc = useTranslations('common')
  const locale = useLocale()
  const reduceMotion = useReducedMotion()
  const [confirmDialog, confirm] = useConfirmAction()
  const soft = ambiance === 'soft'
  // Les textes qui parlent de gorgées ont leur variante Sans alcool sous `soft.`.
  const tg = (key: string, values?: Record<string, string | number>) => t(soft ? `soft.${key}` : key, values)

  const [cards, setCards] = useState<CapCard[] | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [game, setGame] = useState<CapState | null>(null)
  const [started, setStarted] = useState(false)
  const [last, setLast] = useState<LastOutcome | null>(null)
  const [flipping, setFlipping] = useState(false)
  const [jokerOpen, setJokerOpen] = useState(false)
  // La table seule, pas les réglages : la pré-partie revient aux défauts après un rechargement,
  // la partie reprend donc avec ceux de sa sauvegarde.
  const session = useResumableLocalGame<CapSave>(CAP_SAVE_ID, CAP_SAVE_VERSION, (s) =>
    canResumeCapSave(s, players.map(p => p.id))
  )
  /** Une partie n'est créditée qu'une fois. */
  const gameCountedRef = useRef(false)
  /** Retournement en cours : une relance l'annule, sinon il débloquerait la partie suivante. */
  const flipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const endTitleRef = useRef<HTMLHeadingElement>(null)
  const choiceRef = useRef<HTMLDivElement>(null)
  const capButtonRef = useRef<HTMLButtonElement>(null)

  // Seule la langue de la page part au navigateur (un morceau par langue, load.ts).
  useEffect(() => {
    let alive = true
    setCards(null)
    setLoadFailed(false)
    loadCapCards(locale)
      .then((loaded) => {
        if (alive) setCards(loaded)
      })
      .catch(() => {
        if (alive) setLoadFailed(true)
      })
    return () => {
      alive = false
    }
  }, [locale, loadAttempt])

  useEffect(() => () => {
    if (flipTimerRef.current) clearTimeout(flipTimerRef.current)
  }, [])

  // Partie neuve seulement quand la reprise a été lue ET tranchée, cartes en main.
  useEffect(() => {
    if (!session.ready || session.pending || started || !cards) return
    newGame(settings)
    setStarted(true)
  }, [session.ready, session.pending, started, cards])

  // Sauvegarde continue : jamais avant `started` (elle écraserait la sauvegarde proposée), jamais après la fin.
  useEffect(() => {
    if (!started || !game || game.ended) return
    session.save(toCapSave(game))
  }, [started, game])

  const phase = !game ? null : game.ended ? 'end' : game.current ? 'card' : 'choose'

  // Les cartes et la barre changent sous le doigt : le focus retombait sur <body>.
  useEffect(() => {
    if (phase === null || flipping) return
    const active = document.activeElement
    if (active && active !== document.body) return
    if (phase === 'end') {
      endTitleRef.current?.focus()
      return
    }
    // Carte : « Cap ! », pas le joker posé au-dessus des réponses.
    const target =
      phase === 'card'
        ? capButtonRef.current
        : choiceRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')
    target?.focus({ preventScroll: true })
  }, [phase, flipping])

  const cancelFlip = () => {
    if (flipTimerRef.current) {
      clearTimeout(flipTimerRef.current)
      flipTimerRef.current = null
    }
    setFlipping(false)
  }

  const resetScreen = () => {
    cancelFlip()
    setLast(null)
    setJokerOpen(false)
  }

  /** « Rejouer » et ↺ repartent des réglages de la partie jouée : après une reprise, ce sont ceux de la sauvegarde. */
  const newGame = (from: CapSettings) => {
    resetScreen()
    gameCountedRef.current = false
    setGame(createGame({ playerIds: players.map(p => p.id), settings: from, seed: randomSeed() }))
  }

  const resumeSavedGame = () => {
    const saved = session.accept()
    if (!saved) return
    // Réglages de la sauvegarde, pas ceux de la pré-partie. Illisible ou autre table → partie
    // neuve plutôt qu'un écran planté ; carte disparue de la banque → re-tirage.
    const restored = restoreCapSave(saved, players.map(p => p.id), new Set((cards ?? []).map(c => c.id)))
    if (!restored) {
      session.discard()
      return
    }
    resetScreen()
    gameCountedRef.current = false
    setGame(restored)
    setStarted(true)
  }

  const pick = (kind: CapKind) => {
    if (!game || !cards || game.current || flipping) return
    const next = drawCard(game, kind, cards)
    if (!next) return
    playGameSound('reveal')
    setLast(null)
    setGame(next)
    if (reduceMotion) return
    setFlipping(true)
    flipTimerRef.current = setTimeout(() => {
      flipTimerRef.current = null
      setFlipping(false)
    }, FLIP_MS)
  }

  const answer = (outcome: CapOutcome) => {
    if (!game || !game.current || flipping) return
    const holder = cardHolderId(game)
    const stake = cardStake(game.current)
    const next = resolveCapCard(game, outcome)
    if (!next || holder === null) return
    playGameSound(outcome === 'done' ? 'correct' : soft ? 'skip' : 'drink')
    setJokerOpen(false)
    setLast({ playerId: holder, outcome, stake })
    setGame(next)
  }

  const sendBack = (targetId: string) => {
    setJokerOpen(false)
    if (!game) return
    const next = returnToSender(game, targetId)
    if (next) setGame(next)
  }

  const creditGame = (state: CapState) => {
    if (gameCountedRef.current) return
    gameCountedRef.current = true
    for (const row of ranking(state)) {
      const wins = row.won ? 1 : 0
      // Sans alcool, rien n'est bu : aucune gorgée au compteur du joueur.
      updatePlayerStats(
        row.playerId,
        'cap-ou-pas-cap',
        soft ? { gamesPlayed: 1, wins } : { gamesPlayed: 1, wins, totalDrinks: row.refusedPrice }
      )
    }
  }

  const quitGame = () => {
    cancelFlip()
    session.clear()
    onGameEnd()
  }

  // Pas de fin naturelle : la table s'arrête quand elle veut, et voit le bilan.
  const askFinish = async () => {
    if (!game || game.ended) return
    if (capCardsPlayed(game) === 0) {
      quitGame()
      return
    }
    const ok = await confirm({
      title: t('endConfirm.title'),
      description: tg('endConfirm.description'),
      confirmLabel: t('endConfirm.confirm'),
      cancelLabel: t('endConfirm.cancel'),
      tone: 'primary',
    })
    if (!ok) return
    const ended = endGame(game)
    resetScreen()
    creditGame(ended)
    session.clear()
    setGame(ended)
  }

  const askRestart = async () => {
    const ok = await confirm({
      title: tc('confirmRestart.title'),
      description: tc('confirmRestart.description'),
      confirmLabel: tc('confirmRestart.confirm'),
      cancelLabel: tc('confirmRestart.cancel'),
      tone: 'danger',
    })
    if (ok && game) newGame(game.settings)
  }

  if (loadFailed) {
    return (
      <GameShell title={t('title')} onBack={onGameEnd} maxWidth={640} center>
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="max-w-sm text-base text-cream/80">{t('load.error')}</p>
          <Button variant="primary" size="gameLg" onClick={() => setLoadAttempt(n => n + 1)}>
            {t('load.retry')}
          </Button>
        </div>
      </GameShell>
    )
  }
  if (!session.ready || !cards) return <div className="p-6 text-center text-cream/70">{t('load.loading')}</div>
  if (session.pending) return <ResumeGamePrompt onResume={resumeSavedGame} onDiscard={session.discard} />
  if (!game) return <div className="p-6 text-center text-cream/70">{t('load.loading')}</div>

  // ─── Bilan ─────────────────────────────────────────────────────────────────
  if (game.ended) {
    return (
      <CapEndScreen
        game={game}
        players={players}
        soft={soft}
        titleRef={endTitleRef}
        onReplay={() => newGame(game.settings)}
        onQuit={onGameEnd}
      />
    )
  }

  // ─── Partie en cours ───────────────────────────────────────────────────────
  const playerById = (id: string | null | undefined) => (id ? players.find(p => p.id === id) : undefined)
  const turnPlayerId = currentPlayerId(game)
  const holderId = cardHolderId(game)
  const holder = playerById(holderId)
  const current = game.current
  const card = current ? cards.find(c => c.id === current.cardId) ?? null : null
  const stake = current ? cardStake(current) : 0
  const sender = current?.returnedTo ? playerById(turnPlayerId) : undefined
  const target = card ? playerById(capTargetId(game, card.text)) : undefined
  const jokerAvailable = canReturnToSender(game)
  const jokerReady = turnPlayerId !== null && hasJoker(game, turnPlayerId)
  const jokerTargets = players.filter(p => p.id !== turnPlayerId && game.playerIds.includes(p.id))
  const levelLabel = t(`levels.${currentLevel(game)}`)
  // Le niveau vit dans l'en-tête, comme sur la maquette : en pastille à côté du joueur au tour,
  // il coupait son prénom en deux à 375 px. En Progressif, une flèche remplace « Progressif : ».
  const headerSubtitle = (
    <>
      {t('game.round', { round: game.round })} ·{' '}
      {game.settings.level === 'progressif' ? (
        <span className="font-semibold text-gold">
          <TrendingUp aria-hidden className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
          <span className="sr-only">{t('game.levelProgressive', { level: levelLabel })}</span>
          <span aria-hidden>{levelLabel}</span>
        </span>
      ) : (
        <span className="font-semibold text-gold">{t('game.levelPill', { level: levelLabel })}</span>
      )}
    </>
  )
  const levelUp = capLevelUp(game)
  const levelUpText = levelUp ? t('game.levelUp', { level: t(`levels.${levelUp}`) }) : ''
  const lastPlayer = last ? playerById(last.playerId) : undefined
  const lastText =
    last && lastPlayer
      ? tg(last.outcome === 'done' ? 'game.lastDone' : 'game.lastRefused', { name: lastPlayer.name, count: last.stake })
      : ''
  const poolSizes: Record<CapKind, number> = {
    truth: capPoolFor(game, 'truth', cards).length,
    dare: capPoolFor(game, 'dare', cards).length,
  }
  const returnedText = sender ? t('game.returned', { sender: sender.name }) : ''

  // Une seule voix pour le lecteur d'écran, montée en permanence : la carte se lit d'un trait.
  const liveText =
    phase === 'card'
      ? card && !flipping
        ? [
            returnedText,
            t(`kinds.${card.kind}`),
            t(`themes.${card.theme}`),
            fillPlayerToken(card.text, target?.name ?? ''),
            tg('game.price', { count: stake }),
          ]
            .filter(Boolean)
            .map(asSentence)
            .join(' ')
        : ''
      : [lastText, levelUpText].filter(Boolean).join(' ')

  const turnHeader = (
    <section className="flex items-center gap-3 rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
      {holder && <PlayerIcon player={holder} size="lg" />}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t('game.turnOf')}</p>
        <p className="break-words font-display text-xl font-bold leading-tight text-cream">
          {holder && <PlayerName player={holder} />}
        </p>
      </div>
    </section>
  )

  const finishLink = (
    <button
      type="button"
      onClick={() => void askFinish()}
      className="mx-auto mt-2 flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-sm text-cream/70 underline-offset-4 transition-colors hover:text-cream hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
    >
      <Flag aria-hidden className="h-4 w-4" />
      {t('game.finish')}
    </button>
  )

  // Le joker se joue avant de répondre : sous la carte, il tombait sous cette barre et passait
  // inaperçu. Il rejoint les réponses, sous le pouce.
  const actionBar =
    phase === 'card' ? (
      <div className="flex w-full flex-col gap-2">
        {jokerAvailable && (
          <Button
            variant="quiet"
            size="game"
            className="w-full whitespace-normal leading-tight"
            onClick={() => setJokerOpen(true)}
            disabled={flipping}
          >
            <Undo2 aria-hidden className="mr-2 h-5 w-5 shrink-0" />
            {t('game.joker')}
          </Button>
        )}
        <div className="flex w-full gap-2">
          <Button
            ref={capButtonRef}
            variant="primary"
            size="gameLg"
            className={BIG_ANSWER}
            onClick={() => answer('done')}
            disabled={flipping}
          >
            <span className="font-display text-lg leading-tight">{t('game.cap')}</span>
            <span className="text-xs font-semibold leading-tight">{tg('game.capSub', { count: stake })}</span>
          </Button>
          <Button variant="danger" size="gameLg" className={BIG_ANSWER} onClick={() => answer('refused')} disabled={flipping}>
            <span className="font-display text-lg leading-tight">{t('game.refuse')}</span>
            <span className="text-xs font-semibold leading-tight">{tg('game.refuseSub', { count: stake })}</span>
          </Button>
        </div>
      </div>
    ) : undefined

  return (
    <>
      {confirmDialog}
      {/* Clé nulle avant la donne : le premier joueur sert de point de départ, sans flash. Après
          un renvoi, la carte change de main : le flash dit à qui tendre le téléphone. */}
      <PassPhoneOverlay
        playerKey={started ? holderId : null}
        name={holder?.name ?? ''}
        avatar={holder ? <PlayerIcon player={holder} size="lg" className="h-20 w-20 text-6xl" /> : undefined}
        enabled={!jokerOpen}
      />
      <GameShell
        title={t('title')}
        headerSubtitle={headerSubtitle}
        onBack={() => void askFinish()}
        headerRight={
          <Button
            variant="ghost"
            size="gameIcon"
            onClick={() => void askRestart()}
            aria-label={tc('confirmRestart.confirm')}
            title={tc('confirmRestart.confirm')}
            className={HEADER_BUTTON}
          >
            <RotateCcw aria-hidden className="h-5 w-5" />
          </Button>
        }
        actionBar={actionBar}
        contentClassName={phase === 'card' && jokerAvailable ? TWO_ROW_BAR_PADDING : undefined}
        maxWidth={640}
      >
        <p role="status" aria-live="polite" className="sr-only">
          {liveText}
        </p>

        {phase === 'card' ? (
          <div className="flex flex-1 flex-col gap-4">
            {turnHeader}
            {returnedText && (
              <p className="flex items-center justify-center gap-2 rounded-xl border border-suit-red/40 bg-suit-red/20 px-3 py-2 text-center text-sm font-semibold text-red-300">
                <Undo2 aria-hidden className="h-4 w-4 shrink-0" />
                {returnedText}
              </p>
            )}
            {card && (
              <div className="mx-auto w-full max-w-[20rem] [perspective:1200px]">
                {/* Le calque 3D n'existe que le temps du retournement : resté monté, il passait
                    par-dessus la fenêtre du joker (compositing des faces cachées). */}
                {flipping ? (
                  <motion.div
                    className="relative [transform-style:preserve-3d]"
                    initial={{ rotateY: 180 }}
                    animate={{ rotateY: 0 }}
                    transition={{ duration: FLIP_MS / 1000, ease: 'easeOut' }}
                  >
                    <CapCardFace
                      card={card}
                      targetName={target?.name ?? null}
                      stake={stake}
                      doubled={Boolean(current?.returnedTo)}
                      soft={soft}
                      className={cn(CARD_HEIGHT, '[-webkit-backface-visibility:hidden] [backface-visibility:hidden]')}
                    />
                    <PlayingCardBack className="absolute inset-0 [-webkit-backface-visibility:hidden] [backface-visibility:hidden] [transform:rotateY(180deg)]" />
                  </motion.div>
                ) : (
                  <CapCardFace
                    card={card}
                    targetName={target?.name ?? null}
                    stake={stake}
                    doubled={Boolean(current?.returnedTo)}
                    soft={soft}
                    className={CARD_HEIGHT}
                  />
                )}
              </div>
            )}
            {finishLink}
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-4">
            {turnHeader}
            {levelUpText && (
              <p className="rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 text-center font-display text-base font-bold text-gold">
                {levelUpText}
              </p>
            )}
            {lastText && last && (
              <p
                className={cn(
                  'rounded-xl px-3 py-2 text-center text-sm font-semibold',
                  last.outcome === 'done' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-suit-red/20 text-red-300'
                )}
              >
                {lastText}
              </p>
            )}
            {/* Les deux dos de carte, poussés vers le bas de l'écran : en zone pouce. */}
            <section className="mt-auto flex flex-col items-center gap-3 pt-2">
              <h2 className="font-display text-xl font-bold text-gold">{t('game.choose')}</h2>
              <div ref={choiceRef} className="grid w-full max-w-sm grid-cols-2 gap-3">
                {CAP_KINDS.map(kind => (
                  <CapChoiceBack key={kind} kind={kind} disabled={poolSizes[kind] === 0} onPick={() => pick(kind)} />
                ))}
              </div>
              {poolSizes.truth + poolSizes.dare === 0 && (
                <p className="text-center text-sm font-semibold text-red-300">{t('game.noCards')}</p>
              )}
              <p className="text-center text-xs text-cream/70">
                {jokerReady ? t('game.jokerReady') : t('game.jokerUsed')}
              </p>
            </section>
            {finishLink}
          </div>
        )}
      </GameShell>

      <CapJokerDialog
        open={jokerOpen && jokerAvailable}
        players={jokerTargets}
        price={current?.price ?? 0}
        soft={soft}
        onPick={sendBack}
        onClose={() => setJokerOpen(false)}
        fallbackFocus={() => capButtonRef.current}
      />
    </>
  )
}
