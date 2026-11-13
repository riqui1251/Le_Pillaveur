"use client"

import { Fragment, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { Player } from '@/lib/players'
import type { AmbianceMode } from '@/lib/ambiance-mode'
import { Button } from '@/components/ui/button'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { PlayerName } from '@/components/ui/PlayerName'
import { cn } from '@/lib/utils'
import {
  currentRoundRecord,
  currentScore,
  otherSide,
  stampFrom,
  type DegaineState,
  type DuelSide,
} from '@/lib/degaine/engine'
import {
  matchLabel,
  roundNumber,
  sideOutcome,
  sideTime,
  type SideOutcomeView,
  type TextRef,
} from '@/lib/degaine/display'
import type { DegaineText } from './use-degaine-text'

/**
 * Après le verdict, les boutons attendent un instant : un doigt encore lancé vers sa moitié ne
 * doit pas enchaîner la manche suivante par mégarde.
 */
const ACTIONS_ARM_MS = 700

/** Clavier (ordinateur, deux joueurs côte à côte) : F pour la moitié du haut, J pour celle du bas. */
const KEY_SIDES: Record<string, DuelSide> = { KeyF: 'a', KeyJ: 'b' }
const KEY_LABELS: Record<DuelSide, string> = { a: 'F', b: 'J' }

type ArenaProps = {
  state: DegaineState
  players: Player[]
  ambiance: AmbianceMode
  /** Téléphone posé entre deux joueurs face à face : la moitié du haut se lit à l'envers. */
  faceToFace: boolean
  text: DegaineText
  formatMs: (ms: number) => string
  onPress: (side: DuelSide, at: number) => void
  onNextRound: () => void
  onRematch: () => void
  onClose: () => void
}

const SIGNAL_CLASS =
  'whitespace-nowrap font-display text-[clamp(2.75rem,14vw,6rem)] font-black leading-none tracking-wide text-gold [text-shadow:0_0_0.45em_rgba(217,164,65,0.45)]'

export function DuelArena({
  state,
  players,
  ambiance,
  faceToFace,
  text,
  formatMs,
  onPress,
  onNextRound,
  onRematch,
  onClose,
}: ArenaProps) {
  const rootRef = useRef<HTMLElement>(null)
  /** Doigts posés : chacun compte pour la moitié où il s'est posé, une seule fois. */
  const pointersRef = useRef(new Map<number, DuelSide>())
  const [armedSeq, setArmedSeq] = useState<number | null>(null)

  const duel = state.duel
  const settled = duel?.settled ?? false
  const seq = state.duelSeq

  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    if (!settled) return
    const timer = window.setTimeout(() => setArmedSeq(seq), ACTIONS_ARM_MS)
    return () => window.clearTimeout(timer)
  }, [settled, seq])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return
      const side = KEY_SIDES[event.code]
      if (side) {
        event.preventDefault()
        onPress(side, stampFrom(event.timeStamp, performance.now()))
      } else if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onPress, onClose])

  if (!duel || typeof document === 'undefined') return null

  const playerById = (id: string) => players.find(p => p.id === id)
  const record = currentRoundRecord(state)
  const score = currentScore(state) ?? { a: 0, b: 0 }
  const bestOf3 = state.settings.roundsPerDuel === 3
  const labelParts = [
    ...matchLabel(state, duel.matchId).map(ref => text(ref.key, ref.values)),
    ...(bestOf3 ? [text('arena.roundNumber', { number: roundNumber(state) })] : []),
  ]
  const armed = settled && armedSeq === seq

  const down = (side: DuelSide) => (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (pointersRef.current.has(event.pointerId)) return
    pointersRef.current.set(event.pointerId, side)
    try {
      // Souris : sans capture, un relâcher hors de la moitié laisserait ce pointeur « posé ».
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // pointeur déjà levé : rien à capturer
    }
    onPress(side, stampFrom(event.timeStamp, performance.now()))
  }
  const release = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId)
  }

  let actions: { primary: { label: string; onClick: () => void }; secondary?: { label: string; onClick: () => void } } | null = null
  if (settled && record) {
    if (record.outcome !== 'win') actions = { primary: { label: text('arena.actions.replayRound'), onClick: onNextRound } }
    else if (!record.decided) actions = { primary: { label: text('arena.actions.nextRound'), onClick: onNextRound } }
    else if (state.settings.format === 'free') {
      actions = {
        primary: { label: text('arena.actions.rematch'), onClick: onRematch },
        secondary: { label: text('arena.actions.otherDuellists'), onClick: onClose },
      }
    } else if (state.finished) actions = { primary: { label: text('arena.actions.seeChampion'), onClick: onClose } }
    else actions = { primary: { label: text('arena.actions.nextDuel'), onClick: onClose } }
  }

  const half = (side: DuelSide) => {
    const id = duel[side]
    const player = playerById(id)
    const opponent = playerById(duel[otherSide(side)])
    const outcome = duel.phase === 'result' && record ? sideOutcome(state, record, side, ambiance) : null
    return (
      <DuelHalf
        side={side}
        rotated={faceToFace && side === 'a'}
        player={player}
        opponentName={opponent?.name ?? ''}
        state={state}
        outcome={outcome}
        mine={score[side]}
        theirs={score[otherSide(side)]}
        showScore={bestOf3}
        keyHint={faceToFace ? null : KEY_LABELS[side]}
        text={text}
        formatMs={formatMs}
        onPointerDown={down(side)}
        onPointerEnd={release}
        onReady={() => onPress(side, performance.now())}
      />
    )
  }

  // Rendue sous <body> : dans la coquille des jeux (space-y), la section prenait une marge haute et
  // laissait au-dessus du duelliste du haut une bande de la barre du site, encore touchable.
  return createPortal(
    <section
      ref={rootRef}
      tabIndex={-1}
      aria-label={text('arena.label', { a: playerById(duel.a)?.name ?? '', b: playerById(duel.b)?.name ?? '' })}
      className="app-felt fixed inset-0 z-[45] flex touch-none select-none flex-col overflow-hidden text-cream [-webkit-touch-callout:none] focus:outline-none"
      onContextMenu={event => event.preventDefault()}
    >
      {half('a')}

      <div className="relative z-10 flex h-16 shrink-0 items-center gap-2 border-y border-gold/30 bg-felt-deep/95 px-3">
        <Button
          type="button"
          variant="ghost"
          size="gameIcon"
          onClick={onClose}
          aria-label={text('arena.close')}
          className="shrink-0 border border-gold/20 bg-black/20 text-cream/70 hover:bg-black/30 hover:text-gold"
        >
          <X aria-hidden className="h-5 w-5" />
        </Button>
        {actions ? (
          <div className="flex min-w-0 flex-1 gap-2">
            {actions.secondary && (
              <Button
                type="button"
                variant="quiet"
                size="game"
                disabled={!armed}
                onClick={actions.secondary.onClick}
                className="flex-1 whitespace-normal px-2 leading-tight"
              >
                {actions.secondary.label}
              </Button>
            )}
            <Button
              type="button"
              variant="primary"
              size="game"
              disabled={!armed}
              onClick={actions.primary.onClick}
              className="flex-1 whitespace-normal px-2 leading-tight"
            >
              {actions.primary.label}
            </Button>
          </div>
        ) : (
          // Sur deux lignes : tronqué à une seule, « Manche N » disparaissait à 375 px. Chaque partie reste
          // d'un tenant, pour ne jamais laisser un numéro seul à la ligne.
          <p className="line-clamp-2 min-w-0 flex-1 text-center text-xs font-semibold uppercase leading-tight tracking-[0.12em] text-cream/70">
            {labelParts.map((part, index) => (
              <Fragment key={index}>
                {index > 0 ? ' · ' : null}
                <span className="whitespace-nowrap">{part}</span>
              </Fragment>
            ))}
          </p>
        )}
        {/* Contrepoids du bouton de sortie : le libellé reste centré sur l'écran. */}
        {!actions && <span aria-hidden className="h-11 w-11 shrink-0" />}
      </div>

      {half('b')}
    </section>,
    document.body
  )
}

type DuelHalfProps = {
  side: DuelSide
  rotated: boolean
  player: Player | undefined
  opponentName: string
  state: DegaineState
  outcome: SideOutcomeView | null
  mine: number
  theirs: number
  showScore: boolean
  keyHint: string | null
  text: DegaineText
  formatMs: (ms: number) => string
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void
  onPointerEnd: (event: ReactPointerEvent<HTMLDivElement>) => void
  onReady: () => void
}

function DuelHalf({
  side,
  rotated,
  player,
  opponentName,
  state,
  outcome,
  mine,
  theirs,
  showScore,
  keyHint,
  text,
  formatMs,
  onPointerDown,
  onPointerEnd,
  onReady,
}: DuelHalfProps) {
  const duel = state.duel
  if (!duel) return null
  const phase = duel.phase
  const ready = duel.ready[side]
  const tr = (ref: TextRef) => text(ref.key, ref.values)
  const tone = outcome?.tone ?? null

  const name = player ? (
    <span className="flex min-w-0 max-w-full items-center justify-center gap-2">
      <PlayerIcon player={player} size={phase === 'ready' || phase === 'result' ? 'lg' : 'md'} />
      <PlayerName
        player={player}
        className={cn(
          'min-w-0 truncate font-display font-bold text-cream',
          phase === 'ready' || phase === 'result' ? 'text-2xl' : 'text-lg'
        )}
      />
    </span>
  ) : null

  const scoreLine = showScore ? (
    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cream/70">
      {text('arena.score', { mine, theirs })}
    </p>
  ) : null

  let body: ReactNode
  if (phase === 'ready') {
    body = (
      <>
        {name}
        {scoreLine}
        {ready ? (
          <div className="flex flex-col items-center gap-1">
            <p className="font-display text-3xl font-bold text-gold">{text('arena.onGuard')}</p>
            <p className="text-sm text-cream/80">{text('arena.waitingFor', { name: opponentName })}</p>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={onReady}
              className="flex h-[min(7rem,22vh)] w-[min(7rem,22vh)] items-center justify-center rounded-full border-4 border-cream/30 bg-amber-500 font-display text-2xl font-bold text-[#24201A] shadow-[0_12px_28px_-12px_rgba(0,0,0,0.9)] focus:outline-none focus-visible:ring-4 focus-visible:ring-cream"
            >
              {text('arena.ready')}
            </button>
            {/* L'avis d'interruption remplace la consigne : empilés, ils débordaient d'une moitié d'écran court. */}
            {duel.interrupted ? (
              <p className="max-w-xs text-sm font-semibold text-red-300">{text('arena.interrupted')}</p>
            ) : (
              <p className="max-w-xs text-sm text-cream/80">{text('arena.readyHint')}</p>
            )}
          </>
        )}
      </>
    )
  } else if (phase === 'waiting') {
    body = (
      <>
        {name}
        <p className="font-display text-4xl font-bold text-cream/80 motion-safe:animate-pulse">{text('arena.attention')}</p>
      </>
    )
  } else if (phase === 'decoy') {
    const word = duel.decoyIndex !== null ? duel.decoys[duel.decoyIndex]?.word : undefined
    body = (
      <>
        {name}
        {/* Même allure que « FEU ! » : un leurre qui se distinguerait au premier coup d'œil ne piégerait personne. */}
        <p className={SIGNAL_CLASS}>{word ? text(`arena.decoys.${word}`) : text('arena.attention')}</p>
      </>
    )
  } else if (phase === 'fire') {
    body = (
      <>
        {name}
        <p className={SIGNAL_CLASS}>{text('arena.fire')}</p>
      </>
    )
  } else {
    const time = sideTime(duel, side)
    body = (
      <>
        {name}
        <p
          className={cn(
            'font-display text-5xl font-black leading-none lining-nums tabular-nums',
            tone === 'win' ? 'text-gold' : tone === 'lose' ? 'text-red-300' : 'text-cream'
          )}
        >
          {time.kind === 'ms'
            ? formatMs(time.ms)
            : time.kind === 'early'
              ? text('arena.tooEarly')
              : time.kind === 'decoy'
                ? text('arena.fellFor', { word: text(`arena.decoys.${time.word}`) })
                : text('arena.noTime')}
        </p>
        {outcome && (
          <p
            className={cn(
              'max-w-full rounded-full bg-black/30 px-4 py-1.5 text-base font-bold leading-snug',
              tone === 'win' ? 'text-gold' : tone === 'lose' ? 'text-red-300' : 'text-cream'
            )}
          >
            {[tr(outcome.title), ...outcome.costs.map(tr)].join(' · ')}
          </p>
        )}
        {scoreLine}
      </>
    )
  }

  return (
    <div
      className={cn(
        'relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-6 transition-colors duration-300',
        tone === 'win'
          ? 'bg-gold/[0.15]'
          : tone === 'lose'
            ? 'bg-suit-red/20'
            : side === 'a'
              ? 'bg-chip-blue/20'
              : 'bg-transparent'
      )}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onLostPointerCapture={onPointerEnd}
    >
      {tone === 'win' && (
        <span aria-hidden className={cn('absolute inset-x-0 h-1 bg-gold', side === 'a' ? 'top-0' : 'bottom-0')} />
      )}
      <div
        className={cn(
          'flex w-full max-w-md flex-col items-center text-center',
          phase === 'ready' ? 'gap-2' : 'gap-3',
          rotated && 'rotate-180'
        )}
      >
        {body}
        {keyHint && (
          <p className="rounded-md border border-cream/30 px-2 py-0.5 text-xs font-semibold text-cream/70">
            {text('arena.keyHint', { key: keyHint })}
          </p>
        )}
      </div>
    </div>
  )
}
