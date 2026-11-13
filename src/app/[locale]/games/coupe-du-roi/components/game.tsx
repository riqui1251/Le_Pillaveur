"use client"

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { motion, useReducedMotion } from 'framer-motion'
import { Check, Crown, Layers, RotateCcw, Volume2, VolumeX } from 'lucide-react'
import type { AmbianceMode } from '@/lib/ambiance-mode'
import type { Player } from '@/lib/players'
import { Button } from '@/components/ui/button'
import { GameShell } from '@/components/game/GameShell'
import { ResumeGamePrompt } from '@/components/game/ResumeGamePrompt'
import { EndActionDock } from '@/components/game/EndActionDock'
import { useConfirmAction } from '@/components/game/ConfirmActionDialog'
import { FirstGameFeedbackCard } from '@/components/feedback/FirstGameFeedbackCard'
import { CONFETTI_COLORS, fireConfetti, preloadConfetti } from '@/components/online/EndConfetti'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { PlayerName } from '@/components/ui/PlayerName'
import { PlayingCardBack } from '@/components/ui/PlayingCard'
import { useDeadline } from '@/hooks/useDeadline'
import { useGameSounds } from '@/hooks/useGameSounds'
import { isSameLocalTable, useResumableLocalGame } from '@/lib/game-session'
import { randomSeed } from '@/lib/petit-buveur/rng'
import { isSoundMuted } from '@/lib/sound/game-sounds'
import { cn } from '@/lib/utils'
import {
  COUPE_KINGS_TO_FINISH,
  COUPE_SAVE_ID,
  COUPE_SAVE_VERSION,
  addCoupeRule,
  cleanCoupeText,
  coupeActorId,
  coupeKingDraws,
  coupeLastDrawPartner,
  coupeRoleSpan,
  coupeRuleFor,
  coupeTally,
  createCoupeGame,
  currentCoupePlayerId,
  drawCoupeCard,
  lastCoupeDraw,
  pickCoupeSuggestion,
  restoreCoupeSave,
  setCoupePair,
  skipCoupeRule,
  toCoupeSave,
  type CoupeCupMode,
  type CoupeDraw,
  type CoupeOverrides,
  type CoupeSave,
  type CoupeState,
  type CoupeSuggestionKey,
} from '@/lib/coupe-du-roi/engine'
import { COUPE_END_READ_MS, coupeGestureAt, coupeTapAllowed } from '@/lib/coupe-du-roi/tap-guard'
import {
  CoupeCardFace,
  InForceList,
  KingsRow,
  PairPicker,
  RuleComposer,
  useCoupeCardName,
  useCoupeRuleText,
} from './coupe-ui'

interface GameProps {
  players: Player[]
  cup: CoupeCupMode
  overrides: CoupeOverrides
  /** Figée au clic « Commencer » : useAmbianceMode vaut toujours 'alcool' au premier rendu. */
  ambiance: AmbianceMode
  onGameEnd: () => void
  updatePlayerStats: (
    playerId: string,
    gameId: string,
    stats: { gamesPlayed: number; totalDrinks?: number; wins?: number }
  ) => void
}

const CARD_SIZE = 'h-[clamp(9.5rem,48vw,13rem)] w-[clamp(6.75rem,34vw,9.25rem)]'
const END_CARD_SIZE = 'h-[clamp(8rem,40vw,10.5rem)] w-[clamp(5.75rem,28vw,7.5rem)]'
const FLIP_S = 0.35
/** Barre à deux rangées (consigne + bouton de 56 px) : le padding de GameShell n'en prévoit qu'une. */
const BAR_PADDING = 'pb-[calc(8.5rem+env(safe-area-inset-bottom,0px))]'
const HEADER_BUTTON = 'border border-gold/20 bg-black/20 text-cream/70 hover:bg-black/30 hover:text-gold'

function vibrate(pattern: number | number[]) {
  // Un seul réglage pour tout le retour (convention plinko) : couper le son coupe aussi la vibration.
  if (isSoundMuted()) return
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // Vibration indisponible (iPhone) : le son et l'écran suffisent.
  }
}

export default function Game({ players, cup, overrides, ambiance, onGameEnd, updatePlayerStats }: GameProps) {
  const t = useTranslations('games.coupe-du-roi')
  const tc = useTranslations('common')
  const reduceMotion = useReducedMotion()
  const [confirmDialog, confirm] = useConfirmAction()
  const { muted, toggleMuted, play } = useGameSounds()
  const ruleText = useCoupeRuleText(ambiance)
  const cardName = useCoupeCardName()

  const [game, setGame] = useState<CoupeState | null>(null)
  const [started, setStarted] = useState(false)
  const [pairChoice, setPairChoice] = useState<string | null>(null)
  const [ruleDraft, setRuleDraft] = useState('')
  const [shownIdeas, setShownIdeas] = useState<CoupeSuggestionKey[]>([])
  // Une seule voix pour le lecteur d'écran, montée en permanence : une région
  // créée avec son texte se tait souvent (VoiceOver).
  const [announcement, setAnnouncement] = useState('')
  /** Échéance (Date.now) avant laquelle « Rejouer » et « Quitter » restent grisés. */
  const [endReadUntil, setEndReadUntil] = useState<number | null>(null)
  const endReadDone = useDeadline(endReadUntil)
  const endLocked = endReadUntil !== null && !endReadDone

  // La table seule : une sauvegarde reprend avec SES réglages (coupe, règles maison),
  // et « Rejouer » les garde (newGame).
  const session = useResumableLocalGame<CoupeSave>(COUPE_SAVE_ID, COUPE_SAVE_VERSION, (s) =>
    isSameLocalTable(s.playerIds, players)
  )
  const { save: saveSession, clear: clearSession } = session
  /** Une partie n'est créditée qu'une fois. */
  const gameCountedRef = useRef(false)
  /** Dernière action de la barre (horloge de la page) : voir tap-guard. */
  const lastBarActionAtRef = useRef(Number.NEGATIVE_INFINITY)
  const actionBarRef = useRef<HTMLDivElement>(null)
  const pendingRef = useRef<HTMLDivElement>(null)
  const endTitleRef = useRef<HTMLHeadingElement>(null)

  // Partie neuve seulement quand la reprise a été lue ET tranchée.
  useEffect(() => {
    if (!session.ready || session.pending || started) return
    // « Tirer une carte » apparaît là où était « Commencer la partie ».
    lastBarActionAtRef.current = performance.now()
    setGame(createCoupeGame(players.map((p) => p.id), { cup, overrides }, randomSeed()))
    setStarted(true)
  }, [session.ready, session.pending, started, players, cup, overrides])

  // Sauvegarde continue : jamais avant `started` (elle écraserait la sauvegarde proposée), jamais après la fin.
  useEffect(() => {
    if (!started || !game || game.finished) return
    saveSession(toCoupeSave(game))
  }, [started, game, saveSession])

  // La barre change de boutons (tirage, binôme, règle, fin) : un focus perdu retombait sur <body>.
  // Pendant un choix, il va dans le panneau du choix : le bouton de la barre attend encore une sélection.
  const barPhase = !game ? null : game.finished ? 'end' : game.pending ? game.pending.kind : 'draw'
  // Le dos de carte du premier tirage disparaît aussi sous le doigt : chaque tirage revérifie.
  const drawCount = game?.drawn.length ?? 0
  useEffect(() => {
    if (barPhase === null) return
    const active = document.activeElement
    // Un bouton qui vient de passer en `disabled` garde le focus jusqu'au rendu suivant (Chrome) : il est déjà perdu.
    const lost = !active || active === document.body || (active instanceof HTMLButtonElement && active.disabled)
    if (!lost) return
    const target =
      barPhase === 'end'
        ? endTitleRef.current
        : (barPhase === 'draw' ? actionBarRef : pendingRef).current?.querySelector<HTMLButtonElement>(
            'button:not(:disabled)'
          )
    target?.focus({ preventScroll: barPhase === 'draw' })
  }, [barPhase, drawCount])

  // Les confettis du quatrième roi partent avec le tirage, pas une requête après.
  const kingsOut = game?.kingsDrawn ?? 0
  useEffect(() => {
    if (kingsOut >= COUPE_KINGS_TO_FINISH - 1) preloadConfetti()
  }, [kingsOut])

  const playerById = (id: string | null | undefined) => (id ? players.find((p) => p.id === id) : undefined)
  const nameOf = (id: string | null | undefined) => playerById(id)?.name ?? ''

  const resetTransient = () => {
    setPairChoice(null)
    setRuleDraft('')
    setShownIdeas([])
    setAnnouncement('')
    setEndReadUntil(null)
    lastBarActionAtRef.current = performance.now()
  }

  const newGame = () => {
    gameCountedRef.current = false
    resetTransient()
    // Les réglages de la partie jouée, pas ceux du pré-lobby : après une reprise, la
    // coupe choisie n'y est plus (elle n'est pas gardée sur l'appareil).
    setGame(createCoupeGame(players.map((p) => p.id), game ? game.settings : { cup, overrides }, randomSeed()))
  }

  const resumeSavedGame = () => {
    const saved = session.accept()
    if (!saved) return
    if (!isSameLocalTable(saved.playerIds, players)) {
      session.discard()
      return
    }
    // Illisible → partie neuve plutôt qu'un écran planté.
    const restored = restoreCoupeSave(saved, players.map((p) => p.id))
    if (!restored) {
      session.discard()
      return
    }
    gameCountedRef.current = false
    resetTransient()
    setGame(restored)
    setStarted(true)
  }

  const creditGame = (state: CoupeState) => {
    if (gameCountedRef.current) return
    gameCountedRef.current = true
    state.playerIds.forEach((playerId) => updatePlayerStats(playerId, 'coupe-du-roi', { gamesPlayed: 1 }))
    clearSession()
  }

  const pendingPrompt = (state: CoupeState): string => {
    if (!state.pending) return ''
    const name = nameOf(state.pending.playerId)
    return state.pending.kind === 'pair' ? t('game.pair.title', { name }) : t('game.newRule.title', { name })
  }

  /** Instant d'un geste sur l'horloge de la page (celle de `event.timeStamp`). */
  const gestureAt = (timeStamp?: number) => coupeGestureAt(timeStamp, performance.now())
  // Une action de la barre en remplace le bouton sous le doigt : le second toucher
  // d'un double toucher ne doit rien faire, quelle que soit l'action d'avant.
  const barLocked = (at: number) => !coupeTapAllowed(at, lastBarActionAtRef.current)

  const draw = (event: MouseEvent<HTMLButtonElement>) => {
    const at = gestureAt(event.timeStamp)
    if (!game || barLocked(at)) return
    const next = drawCoupeCard(game)
    const drawn = lastCoupeDraw(next)
    if (next === game || !drawn) return
    lastBarActionAtRef.current = at
    setGame(next)
    setPairChoice(null)
    setRuleDraft('')

    if (next.finished) {
      // L'écran de fin arrive dans ce clic même : « Quitter » est sous le doigt.
      setEndReadUntil(Date.now() + COUPE_END_READ_MS)
      creditGame(next)
      setAnnouncement(t('end.title', { name: nameOf(next.cupHolder) }))
      play('victory')
      vibrate([90, 60, 200])
      fireConfetti({ particleCount: 90, spread: 80, origin: { y: 0.35 }, colors: CONFETTI_COLORS })
      return
    }

    const rule = ruleText(drawn.card.rank, next.settings)
    const said = t('game.announce', {
      name: nameOf(drawn.playerId),
      card: cardName(drawn.card),
      title: rule.title,
      text: rule.text,
    })
    // À deux, le 8 forme le binôme d'office : sans choix à l'écran, on le dit.
    const partner = coupeLastDrawPartner(next)
    const paired = partner ? t('game.pairSet', { name: nameOf(drawn.playerId), partner: nameOf(partner) }) : ''
    setAnnouncement([said, paired, pendingPrompt(next)].filter(Boolean).join(' '))
    if (drawn.card.rank === 'K') {
      play('dice-result')
      vibrate(90)
    } else {
      play('reveal')
    }
  }

  const confirmPair = (event: MouseEvent<HTMLButtonElement>) => {
    const at = gestureAt(event.timeStamp)
    if (!game || game.pending?.kind !== 'pair' || !pairChoice || barLocked(at)) return
    const chooser = game.pending.playerId
    const next = setCoupePair(game, chooser, pairChoice)
    if (next === game) return
    lastBarActionAtRef.current = at
    setGame(next)
    setPairChoice(null)
    setAnnouncement(t('game.pairSet', { name: nameOf(chooser), partner: nameOf(pairChoice) }))
    play('correct')
  }

  /** Bouton de la barre ou Entrée dans le champ : le focus passe ensuite au tirage, une 2e Entrée y tomberait. */
  const submitRule = (timeStamp?: number) => {
    const at = gestureAt(timeStamp)
    if (!game || barLocked(at)) return
    const next = addCoupeRule(game, ruleDraft)
    if (next === game) return
    lastBarActionAtRef.current = at
    const added = next.customRules[next.customRules.length - 1]
    setGame(next)
    setRuleDraft('')
    setAnnouncement(t('game.ruleAdded', { name: nameOf(added.playerId), rule: added.text }))
    play('correct')
  }

  const skipRule = (event: MouseEvent<HTMLButtonElement>) => {
    const at = gestureAt(event.timeStamp)
    if (!game || barLocked(at)) return
    const next = skipCoupeRule(game)
    if (next === game) return
    lastBarActionAtRef.current = at
    setGame(next)
    setRuleDraft('')
  }

  const suggestRule = () => {
    if (!game) return
    const { state, key } = pickCoupeSuggestion(game, shownIdeas)
    setGame(state)
    // Toutes déjà montrées : le moteur repart de la liste entière, la mémoire aussi.
    setShownIdeas((prev) => (prev.includes(key) ? [key] : [...prev, key]))
    setRuleDraft(t(`suggestions.${key}`))
  }

  const askRestart = async () => {
    const ok = await confirm({
      title: tc('confirmRestart.title'),
      description: tc('confirmRestart.description'),
      confirmLabel: tc('confirmRestart.confirm'),
      cancelLabel: tc('confirmRestart.cancel'),
      tone: 'danger',
    })
    if (ok) newGame()
  }

  const byline = (drawn: CoupeDraw, state: CoupeState): string => {
    const parts = [t('game.drawnBy', { name: nameOf(drawn.playerId) })]
    const partner = coupeLastDrawPartner(state)
    if (partner) parts.push(t('game.pairWith', { partner: nameOf(partner) }))
    const span = coupeRoleSpan(drawn.card.rank, state.settings.overrides)
    if (span === 'next') parts.push(t('game.spanNext', { rank: t(`ranks.${drawn.card.rank}`) }))
    else if (span === 'own') parts.push(t('game.spanOwn'))
    else if (span === 'game') parts.push(t('game.spanGame'))
    if (drawn.card.rank === 'K') parts.push(t('game.kingOrder', { count: state.kingsDrawn, total: COUPE_KINGS_TO_FINISH }))
    return parts.join(' · ')
  }

  if (!session.ready) return <div className="p-6 text-center text-cream/70">{tc('loading')}</div>
  if (session.pending) return <ResumeGamePrompt onResume={resumeSavedGame} onDiscard={session.discard} />
  if (!game) return <div className="p-6 text-center text-cream/70">{tc('loading')}</div>

  const last = lastCoupeDraw(game)

  // ─── Écran de fin : le quatrième roi ────────────────────────────────────────
  if (game.finished) {
    const holderName = nameOf(game.cupHolder)
    const kingRule = coupeRuleFor('K', game.settings.overrides)
    const finale =
      kingRule.kind === 'custom'
        ? kingRule.text
        : ambiance === 'soft'
          ? t('end.soft', { name: holderName })
          : game.settings.cup === 'shared'
            ? t('end.shared', { name: holderName })
            : t('end.solo', { name: holderName })

    return (
      <GameShell title={t('title')} onBack={onGameEnd} maxWidth={640}>
        <p role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>
        <section className="flex flex-col items-center gap-3 text-center">
          {last && <CoupeCardFace card={last.card} size="large" label={cardName(last.card)} className={END_CARD_SIZE} />}
          <h2 ref={endTitleRef} tabIndex={-1} className="font-display text-2xl font-bold text-gold focus:outline-none">
            {t('end.title', { name: holderName })}
          </h2>
          <p className="max-w-md break-words text-base text-cream/80">{finale}</p>
        </section>

        <section className="mt-5 w-full max-w-md self-center rounded-2xl border border-gold/20 bg-felt-deep/70 p-3">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h3 className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t('end.summary')}</h3>
            <span className="text-xs text-cream/70">{t('end.cardsDrawn', { count: game.drawn.length })}</span>
          </div>
          <ul className="space-y-2">
            {coupeTally(game).map((row) => {
              const player = playerById(row.playerId)
              if (!player) return null
              return (
                <li
                  key={row.playerId}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-xl px-3 py-2',
                    row.cup ? 'border border-gold/60 bg-gold/[0.15]' : 'bg-black/20'
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <PlayerIcon player={player} size="md" />
                    <PlayerName player={player} className="min-w-0 truncate font-display text-base text-cream" />
                    {row.cup && (
                      <>
                        <Crown aria-hidden className="h-4 w-4 shrink-0 text-gold" />
                        <span className="sr-only">{t('end.cupBadge')}</span>
                      </>
                    )}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-cream/80">
                    {t('end.playerLine', { cards: row.cards, kings: row.kings })}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>

        <InForceList
          state={game}
          players={players}
          title={t('end.inForce')}
          className="mt-4 w-full max-w-md self-center"
        />

        <EndActionDock
          voiceGutter={false}
          feedback={<FirstGameFeedbackCard variant="banner" mode="local" gameId="coupe-du-roi" />}
        >
          <Button variant="primary" size="gameLg" className="w-full" disabled={endLocked} onClick={newGame}>
            <RotateCcw aria-hidden className="mr-2 h-5 w-5" />
            {tc('replay')}
          </Button>
          <Button variant="quiet" size="game" className="w-full" disabled={endLocked} onClick={onGameEnd}>
            {tc('quit')}
          </Button>
        </EndActionDock>
      </GameShell>
    )
  }

  // ─── Partie en cours ───────────────────────────────────────────────────────
  const lastRule = last ? ruleText(last.card.rank, game.settings) : null
  const pending = game.pending
  const actor = playerById(coupeActorId(game))
  const nextPlayer = playerById(currentCoupePlayerId(game))
  const candidates =
    pending?.kind === 'pair'
      ? game.playerIds
          .filter((id) => id !== pending.playerId)
          .map((id) => playerById(id))
          .filter((p): p is Player => Boolean(p))
      : []
  const chosen = playerById(pairChoice)

  // Une `key` par branche : le bouton qui avait le focus quitte le DOM au lieu de
  // passer en `disabled` sous le focus, et l'effet de focus voit qu'il est perdu.
  let actionBar: ReactNode
  if (pending?.kind === 'pair') {
    actionBar = (
      <div key="pair" ref={actionBarRef} className="flex w-full flex-col gap-2">
        <p className="truncate text-center text-sm font-semibold text-cream/80">
          {t('game.pair.waiting', { name: actor?.name ?? '' })}
        </p>
        <Button
          variant="primary"
          size="gameLg"
          className="w-full whitespace-normal leading-tight"
          disabled={!chosen}
          onClick={confirmPair}
        >
          <Check aria-hidden className="mr-2 h-5 w-5 shrink-0" />
          {chosen ? t('game.pair.confirm', { name: chosen.name }) : t('game.pair.pick')}
        </Button>
      </div>
    )
  } else if (pending?.kind === 'rule') {
    actionBar = (
      <div key="rule" ref={actionBarRef} className="flex w-full flex-col gap-2">
        <p className="truncate text-center text-sm font-semibold text-cream/80">
          {t('game.newRule.waiting', { name: actor?.name ?? '' })}
        </p>
        <div className="flex gap-2">
          <Button
            variant="quiet"
            size="gameLg"
            className="w-[7rem] shrink-0 whitespace-normal px-3 leading-tight"
            onClick={skipRule}
          >
            {t('game.newRule.skip')}
          </Button>
          <Button
            variant="primary"
            size="gameLg"
            className="flex-1 whitespace-normal px-3 leading-tight"
            disabled={!cleanCoupeText(ruleDraft)}
            onClick={(event) => submitRule(event.timeStamp)}
          >
            <Check aria-hidden className="mr-2 h-5 w-5 shrink-0" />
            {t('game.newRule.add')}
          </Button>
        </div>
      </div>
    )
  } else {
    actionBar = (
      <div key="draw" ref={actionBarRef} className="flex w-full flex-col gap-2">
        <div className="flex min-w-0 items-center justify-center gap-2">
          {nextPlayer && <PlayerIcon player={nextPlayer} size="sm" />}
          <span className="truncate font-display text-base font-bold text-cream">
            {nextPlayer ? t('game.turnOf', { name: nextPlayer.name }) : null}
          </span>
        </div>
        <Button variant="primary" size="gameLg" className="w-full" onClick={draw}>
          <Layers aria-hidden className="mr-2 h-5 w-5" />
          {t('game.draw')}
        </Button>
      </div>
    )
  }

  const headerRight = (
    <>
      <Button
        variant="ghost"
        size="gameIcon"
        onClick={toggleMuted}
        aria-label={muted ? t('game.soundOn') : t('game.soundOff')}
        className={HEADER_BUTTON}
      >
        {muted ? <VolumeX aria-hidden className="h-5 w-5" /> : <Volume2 aria-hidden className="h-5 w-5" />}
      </Button>
      <Button
        variant="ghost"
        size="gameIcon"
        onClick={() => void askRestart()}
        aria-label={tc('confirmRestart.confirm')}
        className={HEADER_BUTTON}
      >
        <RotateCcw aria-hidden className="h-5 w-5" />
      </Button>
    </>
  )

  return (
    <>
      {confirmDialog}
      <GameShell
        title={t('title')}
        headerSubtitle={t('game.cardsLeft', { count: game.deck.length })}
        onBack={onGameEnd}
        headerRight={headerRight}
        actionBar={actionBar}
        maxWidth={640}
        contentClassName={BAR_PADDING}
      >
        <p role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>

        <KingsRow kings={coupeKingDraws(game).map((d) => d.card)} />

        <section className="mt-4 flex flex-col items-center text-center">
          {last && lastRule ? (
            <>
              <motion.div
                key={game.drawn.length}
                initial={reduceMotion ? false : { rotateY: -90, opacity: 0 }}
                animate={{ rotateY: 0, opacity: 1 }}
                transition={{ duration: reduceMotion ? 0 : FLIP_S, ease: 'easeOut' }}
                style={{ transformPerspective: 900 }}
              >
                <CoupeCardFace card={last.card} size="large" label={cardName(last.card)} className={CARD_SIZE} />
              </motion.div>
              <div className="mt-4 w-full max-w-md">
                {lastRule.custom && (
                  <p className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">
                    {lastRule.title}
                  </p>
                )}
                <h2
                  className={cn(
                    'font-display font-bold',
                    lastRule.custom ? 'mt-1 break-words text-xl leading-snug text-cream' : 'text-2xl text-gold'
                  )}
                >
                  {lastRule.custom ? lastRule.text : lastRule.title}
                </h2>
                {!lastRule.custom && <p className="mt-1 text-base leading-snug text-cream">{lastRule.text}</p>}
                <p className="mt-2 text-sm text-cream/70">{byline(last, game)}</p>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={draw}
              className="flex flex-col items-center gap-3 rounded-2xl p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              <PlayingCardBack className={CARD_SIZE} />
              <span className="text-sm font-semibold text-cream/80">{t('game.tapToDraw')}</span>
            </button>
          )}
        </section>

        {pending && actor && (
          <div ref={pendingRef} className="mt-4">
            {pending.kind === 'pair' ? (
              <PairPicker
                chooser={actor}
                candidates={candidates}
                selectedId={pairChoice}
                onSelect={setPairChoice}
                ambiance={ambiance}
              />
            ) : (
              <RuleComposer
                author={actor}
                value={ruleDraft}
                onChange={setRuleDraft}
                onIdea={suggestRule}
                onSubmit={submitRule}
              />
            )}
          </div>
        )}

        <InForceList
          state={game}
          players={players}
          title={t('game.inForce')}
          emptyText={t('game.inForceEmpty')}
          className="mt-4"
        />
      </GameShell>
    </>
  )
}
