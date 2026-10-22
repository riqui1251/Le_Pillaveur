"use client"

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Beer, Dice6, Leaf, Sparkles, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getCaseMeta, CASE_FAMILY_STYLE } from '@/lib/petit-buveur/case-families'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { PhaseCountdown } from '@/components/online/PhaseCountdown'
import { DiceFace } from '@/components/petit-buveur/DiceOverlay'
import { useDrinkDeltas } from '@/components/petit-buveur/drink-feedback'
import { tvColor } from '../tv-shared'
import {
  ABSENTS_VISIBLE,
  absentsBlockRem,
  cardLayout,
  cardTargetId,
  EFFECT_ACCENT,
  EFFECT_ICON,
  EFFECT_TITLE_KEY,
  effectsLayout,
  PAWN_GAP_REM,
  pawnGrid,
  pendingLayout,
  rankingDensity,
  type TitleLayout,
  type TvPbCard,
  type TvPbChange,
  type TvPbEffect,
  type TvPbPending,
  type TvPbPlayer,
  type TvPbScreenModel,
} from './model'
import type { PbTexts } from './online-view'

const BOARD_SIZE = 30

/**
 * Vue plateau du Petit Buveur en grand, pour la toile TV de 80 × 39 rem :
 * à gauche le joueur au tour, le plateau de 30 cases (10 × 3) puis la carte
 * de la dernière case et les effets en cours ; à droite le classement et les
 * gorgées. Ne lit que le modèle déjà calé sur la chronologie du téléphone.
 */
export function TvPbScreen({ model, texts }: { model: TvPbScreenModel; texts: PbTexts }) {
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[80rem] flex-1 gap-5 px-6 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <TurnBanner model={model} texts={texts} />
        <Board model={model} />
        <div className="flex min-h-0 flex-1 gap-4">
          <div className="flex min-w-0 flex-[3] flex-col">
            <CardSlot model={model} texts={texts} />
          </div>
          <div className="flex min-w-0 flex-[2] flex-col">
            <EffectsPanel model={model} texts={texts} />
          </div>
        </div>
      </div>
      <RankingPanel model={model} texts={texts} />
    </div>
  )
}

/** Pion TV : pastille sombre cerclée de la couleur du joueur, avec son icône (ou son initiale). Taille en rem. */
export function TvPbPawn({
  player,
  size,
  active = false,
}: {
  player: Pick<TvPbPlayer, 'name' | 'index' | 'icon'>
  size: number
  active?: boolean
}) {
  const color = tvColor(player.index)
  const ring = Math.max(0.1, size * 0.08)
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-felt-deep font-black leading-none"
      style={{
        width: `${size}rem`,
        height: `${size}rem`,
        fontSize: `${size * 0.6}rem`,
        color,
        boxShadow: active
          ? `0 0 0 ${ring}rem ${color}, 0 0 0 ${ring + 0.15}rem rgba(255, 255, 255, 0.9)`
          : `0 0 0 ${ring}rem ${color}`,
      }}
    >
      {player.icon ? <PlayerAvatarGlyph value={player.icon} /> : (player.name.trim()[0] ?? '?').toUpperCase()}
    </span>
  )
}

/** Dé sans face pendant qu'il roule, quand l'écran ne l'anime pas (prefers-reduced-motion) : aucune valeur avant le téléphone. */
export function TvPbBlankDie({ sizeRem }: { sizeRem: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-2xl border-2 border-[#D8CCAE] bg-cream font-black leading-none shadow-2xl"
      style={{ width: `${sizeRem}rem`, height: `${sizeRem}rem`, fontSize: `${sizeRem * 0.5}rem`, color: 'rgba(36, 32, 26, 0.6)' }}
    >
      ?
    </span>
  )
}

/** Dé du téléphone (DiceFace) en rem ; l'anneau or en rem aussi, celui du composant étant en px. */
export function TvPbDie({ value, accent = false, sizeRem }: { value: number; accent?: boolean; sizeRem: number }) {
  return (
    <span className={cn('inline-flex shrink-0 rounded-2xl', accent && 'ring-[0.25rem] ring-gold')}>
      <DiceFace value={value} sizeRem={sizeRem} />
    </span>
  )
}

function DrinkGlyph({ soft, className }: { soft: boolean; className?: string }) {
  return soft ? <Leaf aria-hidden className={className} /> : <Beer aria-hidden className={className} />
}

function TurnBanner({ model, texts }: { model: TvPbScreenModel; texts: PbTexts }) {
  const t = useTranslations('tv')
  const reduced = useReducedMotion()
  const player = model.players.find((p) => p.id === model.turnPlayerId) ?? null
  return (
    <div className="flex h-16 shrink-0 items-center gap-4 rounded-2xl border border-gold/30 bg-felt-deep/70 px-5">
      <span className="shrink-0 text-base font-bold uppercase tracking-[0.25em] text-gold/90">{t('turnOf')}</span>
      <AnimatePresence mode="wait" initial={false}>
        {player && (
          <motion.div
            key={player.id}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: '-0.5rem' }}
            animate={{ opacity: 1, y: '0rem' }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.2 }}
            className="flex min-w-0 flex-1 items-center gap-3"
          >
            <TvPbPawn player={player} size={3} active />
            <span className="truncate text-5xl font-black leading-tight text-cream">{player.name}</span>
          </motion.div>
        )}
      </AnimatePresence>
      {model.turnCount != null && (
        <span className="ml-auto shrink-0 rounded-full border border-gold/40 bg-gold/10 px-4 py-1 text-xl font-bold text-gold">
          {texts.t('online.turn', { count: model.turnCount })}
        </span>
      )}
    </div>
  )
}

function Board({ model }: { model: TvPbScreenModel }) {
  const reduced = useReducedMotion()
  const byCell = useMemo(() => {
    const map = new Map<number, TvPbPlayer[]>()
    for (const p of model.players) {
      const cell = Math.max(0, Math.min(BOARD_SIZE - 1, p.position))
      map.set(cell, [...(map.get(cell) ?? []), p])
    }
    return map
  }, [model.players])
  const turnPos = model.players.find((p) => p.id === model.turnPlayerId)?.position ?? -1
  const leaderPos = model.players.length > 0 ? Math.max(...model.players.map((p) => p.position)) : -1

  return (
    <div className="shrink-0 rounded-2xl border border-gold/20 bg-felt-deep/80 p-1.5">
      <div className="grid grid-cols-10 gap-1.5">
        {Array.from({ length: BOARD_SIZE }, (_, i) => {
          const here = byCell.get(i) ?? []
          const { size, cols, visible } = pawnGrid(here.length)
          // Case bondée : le joueur au tour reste dessiné, les pions au-delà de la grille passent en « +N ».
          const drawn =
            visible < here.length
              ? [...here.filter((p) => p.id === model.turnPlayerId), ...here.filter((p) => p.id !== model.turnPlayerId)].slice(0, visible)
              : here
          const isFinish = i === BOARD_SIZE - 1
          const isStart = i === 0
          return (
            <div
              key={i}
              className={cn(
                'relative aspect-square rounded-xl border',
                isFinish
                  ? 'border-2 border-gold/70 bg-gold/20'
                  : isStart
                    ? 'border-emerald-400/30 bg-emerald-500/10'
                    : i % 2 === 1
                      ? 'border-gold/[0.12] bg-cream/[0.06]'
                      : 'border-gold/[0.12] bg-cream/[0.04]',
                i === turnPos
                  ? 'border-gold bg-gold/[0.12] ring-2 ring-gold/60'
                  : i === leaderPos && !isFinish && !isStart
                    ? 'border-gold/50'
                    : ''
              )}
            >
              <span
                className={cn(
                  'absolute left-1.5 top-1 z-[1] text-lg font-bold leading-none tabular-nums',
                  isStart ? 'text-emerald-300' : isFinish ? 'text-gold' : 'text-cream/90'
                )}
                style={{ textShadow: '0 0 0.25rem rgba(0, 0, 0, 0.95), 0 0 0.125rem rgba(0, 0, 0, 0.95)' }}
              >
                {i + 1}
              </span>
              {isFinish && here.length === 0 && (
                <Trophy aria-hidden className="absolute inset-0 m-auto h-10 w-10 text-gold" />
              )}
              <div
                className="absolute inset-1 grid place-content-center place-items-center"
                style={{ gridTemplateColumns: `repeat(${Math.min(cols, Math.max(1, drawn.length))}, auto)`, gap: `${PAWN_GAP_REM}rem` }}
              >
                {drawn.map((p) => (
                  <motion.span
                    key={p.id}
                    layoutId={`tv-pb-pawn-${p.id}`}
                    transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 28 }}
                    className="inline-flex"
                  >
                    <TvPbPawn player={p} size={size} active={p.id === model.turnPlayerId} />
                  </motion.span>
                ))}
                {drawn.length < here.length && (
                  <span className="col-span-full text-lg font-black leading-none text-cream">+{here.length - drawn.length}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Joueurs partis, en tête du classement : chacun sur deux lignes au plus (absentsBlockRem). */
function Absents({ absents, texts }: { absents: TvPbScreenModel['absents']; texts: PbTexts }) {
  const named = absents.slice(0, ABSENTS_VISIBLE)
  return (
    <div className="shrink-0 space-y-1 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-3 py-1.5">
      {named.map((a, i) => (
        <p key={`${i}-${a.name}`} className="line-clamp-2 break-words text-lg font-semibold leading-snug text-amber-100">
          <PhaseCountdown endsAt={a.endsAt}>
            {({ seconds }) => texts.t('online.waitingReturn', { name: a.name, seconds })}
          </PhaseCountdown>
        </p>
      ))}
      {absents.length > named.length && (
        <p className="text-lg font-bold leading-snug text-amber-100">+{absents.length - named.length}</p>
      )}
    </div>
  )
}

/** Titre de case en entier (titleLayout) : l'information principale n'est jamais coupée par un voisin. */
function titleClass(title: TitleLayout): string {
  return cn(title.size === '4xl' ? 'text-4xl' : 'text-3xl', title.lines === 2 ? 'line-clamp-2 break-words' : 'truncate')
}

function CardSlot({ model, texts }: { model: TvPbScreenModel; texts: PbTexts }) {
  if (model.pending) return <PendingCard pending={model.pending} players={model.players} texts={texts} />
  if (model.card) return <CaseCard card={model.card} players={model.players} texts={texts} />
  return <IdleCard model={model} texts={texts} />
}

function CaseCard({ card, players, texts }: { card: TvPbCard; players: TvPbPlayer[]; texts: PbTexts }) {
  const t = useTranslations('tv')
  const reduced = useReducedMotion()
  const meta = getCaseMeta(card.caseType)
  const style = CASE_FAMILY_STYLE[meta.family]
  const layout = cardLayout(card, (id) => players.find((p) => p.id === id)?.name ?? '')
  return (
    <motion.div
      key={card.key}
      initial={reduced ? { opacity: 0 } : { opacity: 0, rotateX: -70, scale: 0.96 }}
      animate={{ opacity: 1, rotateX: 0, scale: 1 }}
      transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 320, damping: 22 }}
      style={{ transformPerspective: '56rem' }}
      className={cn('flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border-2 p-4', style.border, style.bg)}
    >
      {/* my-auto plutôt que justify-center : un contenu trop haut serait coupé en bas, jamais au titre. */}
      <div className="my-auto flex min-w-0 flex-col gap-2">
        <div className="flex shrink-0 items-center gap-4">
          <span aria-hidden className="shrink-0 text-6xl leading-none">
            {meta.icon}
          </span>
          <div className="min-w-0 flex-1">
            <p className={cn('font-black leading-tight', titleClass(layout.title), style.text)}>{card.title}</p>
            {(card.caseNumber != null || card.dice != null) && (
              <p className="flex items-center gap-4 text-lg font-semibold leading-tight text-white/80">
                {card.caseNumber != null && (
                  <span>
                    {t('position')} {card.caseNumber}
                  </span>
                )}
                {card.dice != null && (
                  <span className="inline-flex items-center gap-1.5">
                    <Dice6 aria-hidden className="h-6 w-6" /> {card.dice}
                  </span>
                )}
              </p>
            )}
          </div>
        </div>
        {(card.changes.length > 0 || cardTargetId(card)) && (
          <ChangeChips
            changes={card.changes}
            targetId={cardTargetId(card)}
            players={players}
            soft={texts.soft}
            plain={layout.plainChips}
            visible={layout.visibleChips}
          />
        )}
        {card.lines.slice(0, layout.lineCount).map((line, i) => (
          <p
            key={i}
            className={cn(
              'shrink-0 break-words text-xl font-semibold leading-snug text-cream/90',
              layout.lineClamp === 2 ? 'line-clamp-2' : 'line-clamp-1'
            )}
          >
            {line}
          </p>
        ))}
        {card.detail && layout.detailClamp > 0 && (
          <p
            className={cn(
              'shrink-0 break-words text-xl font-semibold leading-snug text-white/90',
              layout.detailClamp === 2 ? 'line-clamp-2' : 'line-clamp-1'
            )}
          >
            {card.detail}
          </p>
        )}
        {card.nothing && <p className="shrink-0 text-2xl font-bold text-emerald-300">{texts.t('online.outcomeNothing')}</p>}
      </div>
    </motion.div>
  )
}

/** Qui a bu, qui a bougé : pastilles du téléphone, en grand ; sans le nom (pion seul) quand toute la table est touchée. */
function ChangeChips({
  changes,
  targetId,
  players,
  soft,
  plain,
  visible,
}: {
  changes: TvPbChange[]
  targetId: string | null
  players: TvPbPlayer[]
  soft: boolean
  plain: boolean
  visible: number
}) {
  const t = useTranslations('tv')
  const shown = changes.slice(0, visible)
  const hidden = changes.length - shown.length
  const target = targetId ? players.find((p) => p.id === targetId) ?? null : null
  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      {target && (
        <span className="inline-flex min-w-0 items-center gap-2 rounded-full border border-amber-300/40 bg-black/40 py-1 pl-1 pr-3 text-xl font-bold text-amber-200">
          <TvPbPawn player={target} size={2} />
          <span aria-hidden className="text-3xl leading-none">
            🎯
          </span>
          <span className="max-w-[9rem] truncate">{target.name}</span>
        </span>
      )}
      {shown.map((c) => {
        const p = players.find((pl) => pl.id === c.playerId)
        if (!p) return null
        return (
          <span
            key={c.playerId}
            className="inline-flex min-w-0 items-center gap-2 rounded-full border border-white/20 bg-black/40 py-1 pl-1 pr-3 text-xl font-bold"
          >
            <TvPbPawn player={p} size={2} />
            {plain && <span className="max-w-[9rem] truncate text-white/90">{p.name}</span>}
            {c.drinks > 0 && (
              <span className="inline-flex items-center gap-1 text-amber-300">
                +{c.drinks}
                <DrinkGlyph soft={soft} className="h-6 w-6" />
              </span>
            )}
            {c.to !== c.from && (
              <span className="text-sky-300">
                → {plain ? `${t('position')} ` : ''}
                {c.to + 1}
              </span>
            )}
          </span>
        )
      })}
      {hidden > 0 && (
        <span className="inline-flex items-center rounded-full border border-white/20 bg-black/40 px-3 py-1 text-xl font-bold text-white/80">
          +{hidden}
        </span>
      )}
    </div>
  )
}

/** Qui doit décider, en texte ; `seconds` : compte à rebours du pile ou face. */
function waitingLine(pending: TvPbPending, texts: PbTexts, seconds: number): string {
  const w = pending.waiting
  if (w.kind === 'verdict') return texts.t('online.verdictWaiting', { name: w.judge, target: w.target })
  if (w.kind === 'side' && w.deadlineAt != null) return texts.t('online.sideWaiting', { name: w.name, seconds })
  return texts.t('online.waitingFor', { name: w.name })
}

function waitingText(pending: TvPbPending, texts: PbTexts) {
  const w = pending.waiting
  if (w.kind === 'side' && w.deadlineAt != null) {
    return <PhaseCountdown endsAt={w.deadlineAt}>{({ seconds }) => waitingLine(pending, texts, seconds)}</PhaseCountdown>
  }
  return waitingLine(pending, texts, 0)
}

const clampClass = (lines: 0 | 1 | 2) => (lines === 2 ? 'line-clamp-2' : 'line-clamp-1')

function PendingCard({ pending, players, texts }: { pending: TvPbPending; players: TvPbPlayer[]; texts: PbTexts }) {
  const reduced = useReducedMotion()
  const meta = getCaseMeta(pending.caseType)
  const target = pending.targetId ? players.find((p) => p.id === pending.targetId) ?? null : null
  const status = pending.status ?? null
  // Verdict et pile ou face nomment déjà la cible dans la ligne d'attente ; sinon elle a sa rangée sous le titre.
  const targetRow = target !== null && (status !== null || pending.waiting.kind === 'choice')
  const layout = pendingLayout({
    title: pending.title,
    detail: pending.detail,
    targetRow,
    status: status ? status.text : waitingLine(pending, texts, 60),
    die: status?.die != null,
  })
  return (
    <motion.div
      key={`${pending.caseType}:${pending.waiting.kind}:${pending.targetId ?? ''}`}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: '0.5rem' }}
      animate={{ opacity: 1, y: '0rem' }}
      transition={{ duration: reduced ? 0 : 0.25 }}
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border-2 border-gold/50 bg-felt-deep/80 p-4"
    >
      <div className="my-auto flex min-w-0 flex-col gap-2">
        <div className="flex shrink-0 items-center gap-4">
          <span aria-hidden className="shrink-0 text-6xl leading-none">
            {pending.icon ?? meta.icon}
          </span>
          <p className={cn('min-w-0 flex-1 font-black leading-tight text-cream', titleClass(layout.title))}>{pending.title}</p>
        </div>
        {targetRow && target && (
          <div className="flex min-w-0 shrink-0 items-center gap-3 text-2xl font-bold text-amber-200">
            <span aria-hidden className="text-3xl leading-none">
              🎯
            </span>
            <TvPbPawn player={target} size={2.25} />
            <span className="min-w-0 truncate">{target.name}</span>
          </div>
        )}
        {pending.detail && layout.detailClamp > 0 && (
          <p className={cn('shrink-0 break-words text-xl font-semibold leading-snug text-white/90', clampClass(layout.detailClamp))}>
            {pending.detail}
          </p>
        )}
        {status ? (
          <div className="flex shrink-0 items-center gap-4">
            {status.die != null && <TvPbDie value={status.die} accent sizeRem={3.5} />}
            <p
              className={cn(
                'min-w-0 break-words text-2xl font-black leading-snug',
                clampClass(layout.statusClamp),
                status.rolling ? 'text-white/80' : 'text-gold'
              )}
            >
              {status.text}
            </p>
          </div>
        ) : (
          <p className={cn('shrink-0 break-words text-2xl font-bold leading-snug text-gold', clampClass(layout.statusClamp))}>
            {waitingText(pending, texts)}
          </p>
        )}
      </div>
    </motion.div>
  )
}

function IdleCard({ model, texts }: { model: TvPbScreenModel; texts: PbTexts }) {
  const roller = model.roll ? model.players.find((p) => p.id === model.roll?.playerId) ?? null : null
  return (
    <div className="flex h-full min-h-0 items-center justify-center gap-5 overflow-hidden rounded-3xl border-2 border-dashed border-gold/30 bg-felt-deep/50 p-4">
      {model.roll && roller ? (
        <>
          <TvPbDie value={model.roll.value} accent sizeRem={4.5} />
          <p className="line-clamp-2 min-w-0 break-words text-4xl font-black leading-tight text-cream">
            {texts.t('diceOverlay.result', { name: roller.name, value: model.roll.value })}
          </p>
        </>
      ) : model.waitingName ? (
        <>
          <Dice6 aria-hidden className="h-14 w-14 shrink-0 text-gold/80" />
          <p className="line-clamp-2 min-w-0 break-words text-4xl font-black leading-tight text-white/80">
            {texts.t('online.waitingFor', { name: model.waitingName })}
          </p>
        </>
      ) : null}
    </div>
  )
}

/** Porteur et partenaire d'un effet, en toutes lettres, pour les lecteurs d'écran (les pastilles n'ont que des pions). */
function effectNames(effect: TvPbEffect, players: TvPbPlayer[]): string {
  const name = players.find((p) => p.id === effect.playerId)?.name ?? ''
  if (!effect.partnerId) return name
  const partner = players.find((p) => p.id === effect.partnerId)?.name ?? ''
  return `${name} ${effect.kind === 'chain' ? '↔' : '→'} ${partner}`
}

function TurnsBadge({ remaining, texts }: { remaining: number; texts: PbTexts }) {
  return (
    <span className="shrink-0 rounded-full bg-black/30 px-2.5 text-lg font-bold text-white">
      <span aria-hidden>{remaining}</span>
      <span className="sr-only">{texts.t('game.turnsRemaining', { count: remaining })}</span>
    </span>
  )
}

/**
 * Une ligne par effet : pion et nom du porteur ; en deux lignes, le
 * partenaire d'une chaîne ou d'un miroir en toutes lettres (sinon son pion
 * seul), ou le titre de l'effet.
 */
function EffectLine({ effect, two, players, texts }: { effect: TvPbEffect; two: boolean; players: TvPbPlayer[]; texts: PbTexts }) {
  const owner = players.find((p) => p.id === effect.playerId) ?? null
  const partner = effect.partnerId ? players.find((p) => p.id === effect.partnerId) ?? null : null
  const arrow = effect.kind === 'chain' ? '↔' : '→'
  return (
    <div className={cn('flex shrink-0 items-center gap-2 rounded-2xl border px-2 py-0.5', EFFECT_ACCENT[effect.kind])}>
      <span aria-hidden className="w-9 shrink-0 text-center text-3xl leading-none">
        {EFFECT_ICON[effect.kind]}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-w-0 items-center gap-2">
          {owner && <TvPbPawn player={owner} size={1.75} />}
          <span className="min-w-0 flex-1 truncate text-xl font-bold leading-tight text-white">{owner?.name ?? ''}</span>
          {!two && partner && (
            <>
              <span aria-hidden className="shrink-0 text-xl font-bold text-white/80">
                {arrow}
              </span>
              <TvPbPawn player={partner} size={1.75} />
              <span className="sr-only">{partner.name}</span>
            </>
          )}
        </div>
        {two &&
          (partner ? (
            <div className="flex min-w-0 items-center gap-2">
              <span aria-hidden className="shrink-0 text-xl font-bold text-white/80">
                {arrow}
              </span>
              <TvPbPawn player={partner} size={1.5} />
              <span className="min-w-0 truncate text-xl font-bold leading-tight text-white">{partner.name}</span>
            </div>
          ) : (
            <p className="truncate text-lg font-semibold leading-tight text-white/80">
              {texts.t(`game.effects.${EFFECT_TITLE_KEY[effect.kind]}`)}
            </p>
          ))}
      </div>
      <TurnsBadge remaining={effect.remaining} texts={texts} />
    </div>
  )
}

/** Pastille dense : l'emoji dit l'effet, les pions (icône et couleur du joueur, comme au plateau) disent qui. */
function EffectChip({ effect, players, texts }: { effect: TvPbEffect; players: TvPbPlayer[]; texts: PbTexts }) {
  const owner = players.find((p) => p.id === effect.playerId) ?? null
  const partner = effect.partnerId ? players.find((p) => p.id === effect.partnerId) ?? null : null
  return (
    <div className={cn('flex min-w-0 items-center justify-between gap-1.5 rounded-2xl border px-1.5 py-0.5', EFFECT_ACCENT[effect.kind])}>
      <span aria-hidden className="shrink-0 text-3xl leading-none">
        {EFFECT_ICON[effect.kind]}
      </span>
      <span className="flex min-w-0 items-center gap-1">
        {owner && <TvPbPawn player={owner} size={1.75} />}
        {partner && <TvPbPawn player={partner} size={1.5} />}
      </span>
      <span className="sr-only">{effectNames(effect, players)}</span>
      <TurnsBadge remaining={effect.remaining} texts={texts} />
    </div>
  )
}

function EffectsPanel({ model, texts }: { model: TvPbScreenModel; texts: PbTexts }) {
  const count = model.effects.length
  const layout = effectsLayout(model.effects)
  const shown = layout.mode === 'chips' ? model.effects.slice(0, layout.visible) : model.effects
  const hidden = count - shown.length
  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 overflow-hidden rounded-3xl border border-amber-500/30 bg-amber-500/10 p-2.5">
      <div className="flex shrink-0 items-center gap-2">
        <Sparkles aria-hidden className="h-6 w-6 shrink-0 text-amber-300" />
        <span className="truncate text-base font-bold uppercase tracking-[0.2em] text-amber-200">
          {texts.t('game.effects.activeTitle')}
        </span>
        {count > 0 && (
          <span className="shrink-0 rounded-lg border border-amber-400/40 bg-amber-500/20 px-2 text-lg font-bold text-amber-100">
            {count}
          </span>
        )}
      </div>
      {count === 0 ? (
        <p className="flex flex-1 items-center justify-center text-center text-xl font-semibold text-white/70">
          {texts.t('game.effects.none')}
        </p>
      ) : layout.mode === 'rows' ? (
        <div className="flex min-h-0 flex-col gap-1">
          {shown.map((e, i) => (
            <EffectLine key={e.id} effect={e} two={layout.rows[i] === 'two'} players={model.players} texts={texts} />
          ))}
        </div>
      ) : (
        <div className="grid min-h-0 grid-cols-2 gap-1">
          {shown.map((e) => (
            <EffectChip key={e.id} effect={e} players={model.players} texts={texts} />
          ))}
          {hidden > 0 && (
            <div className="flex items-center justify-center rounded-2xl border border-amber-400/40 bg-black/20 text-xl font-bold text-amber-100">
              +{hidden}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const RANK_BORDER = [
  'border-amber-400/40 bg-amber-500/10',
  'border-white/20 bg-white/5',
  'border-orange-500/25 bg-orange-600/10',
]

function RankingPanel({ model, texts }: { model: TvPbScreenModel; texts: PbTexts }) {
  const t = useTranslations('tv')
  const reduced = useReducedMotion()
  const ranked = useMemo(() => [...model.players].sort((a, b) => b.position - a.position), [model.players])
  const density = rankingDensity(ranked.length, absentsBlockRem(model.absents.length))
  const visible = ranked.slice(0, density.visible)
  const hidden = ranked.length - visible.length
  // Clé texte : le modèle est recalculé à chaque rendu, les compteurs ne changent qu'avec les gorgées.
  const drinksKey = JSON.stringify(model.players.map((p) => [p.id, p.drinks]))
  const drinksById = useMemo(
    () => Object.fromEntries(JSON.parse(drinksKey) as [string, number][]) as Record<string, number>,
    [drinksKey]
  )
  const deltas = useDrinkDeltas(drinksById, 1500, { silent: true })
  const pawnSize = density.mode === 'detailed' ? 2.5 : density.mode === 'single' ? 2.1 : 1.6

  return (
    <aside className="flex w-[21rem] shrink-0 flex-col gap-2 overflow-hidden">
      {model.absents.length > 0 && <Absents absents={model.absents} texts={texts} />}
      <div className="flex shrink-0 items-center gap-2 px-1">
        <Trophy aria-hidden className="h-6 w-6 shrink-0 text-amber-300" />
        <span className="text-base font-bold uppercase tracking-[0.2em] text-white/80">{texts.t('game.ranking')}</span>
      </div>
      <ol className={cn('flex min-h-0 flex-col', density.mode === 'detailed' ? 'gap-2' : density.mode === 'single' ? 'gap-1' : 'gap-0.5')}>
        {visible.map((p, i) => {
          const isTurn = p.id === model.turnPlayerId
          return (
            <li
              key={p.id}
              className={cn(
                'relative flex shrink-0 items-center gap-2 rounded-2xl border px-3',
                density.mode === 'detailed' ? 'py-1.5' : 'py-0.5',
                isTurn ? 'border-emerald-400/60 bg-emerald-500/[0.12]' : RANK_BORDER[i] ?? 'border-white/10 bg-white/[0.03]'
              )}
            >
              <AnimatePresence>
                {deltas
                  .filter((d) => d.playerId === p.id)
                  .map((d) => (
                    <motion.span
                      key={d.key}
                      initial={reduced ? { opacity: 1 } : { opacity: 0, y: '0.25rem' }}
                      animate={reduced ? { opacity: 1 } : { opacity: [0, 1, 1, 0], y: '-1.5rem' }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 1.4, ease: 'easeOut' }}
                      aria-hidden
                      className="pointer-events-none absolute -top-2 right-3 z-20 inline-flex items-center gap-1 rounded-full border border-suit-red/60 bg-suit-red px-2.5 text-xl font-black text-cream shadow-lg"
                    >
                      +{d.delta}
                      <DrinkGlyph soft={texts.soft} className="h-6 w-6" />
                    </motion.span>
                  ))}
              </AnimatePresence>
              <span className="w-7 shrink-0 text-center text-lg font-black tabular-nums text-white/75">{i + 1}</span>
              <TvPbPawn player={p} size={pawnSize} active={isTurn} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xl font-bold leading-tight text-white">{p.name}</p>
                {density.mode === 'detailed' && (
                  <p className="text-lg font-semibold leading-tight text-white/75">
                    {t('position')} {p.position + 1}
                  </p>
                )}
              </div>
              <span className="flex shrink-0 items-center gap-1 text-xl font-black tabular-nums text-red-300">
                <span aria-hidden>{p.drinks}</span>
                <DrinkGlyph soft={texts.soft} className="h-6 w-6" />
                <span className="sr-only">{texts.t('game.drinksShort', { count: p.drinks })}</span>
              </span>
            </li>
          )
        })}
        {hidden > 0 && (
          <li className="shrink-0 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-0.5 text-center text-lg font-bold text-white/75">
            +{hidden}
          </li>
        )}
      </ol>
    </aside>
  )
}
