"use client"

import { useId } from 'react'
import { useTranslations } from 'next-intl'
import { Sparkles } from 'lucide-react'
import type { AmbianceMode } from '@/lib/ambiance-mode'
import type { Player } from '@/lib/players'
import { Button } from '@/components/ui/button'
import { PlayingCard, PlayingCardBack, suitGlyph, suitIsRed } from '@/components/ui/PlayingCard'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { PlayerName } from '@/components/ui/PlayerName'
import { cn } from '@/lib/utils'
import {
  COUPE_KINGS_TO_FINISH,
  COUPE_RULE_MAX_LENGTH,
  coupeHasInForce,
  coupeRuleFor,
  type CoupeCard,
  type CoupeRank,
  type CoupeSettings,
  type CoupeState,
} from '@/lib/coupe-du-roi/engine'

export type CoupeRuleText = { custom: boolean; title: string; text: string }

/**
 * Titre et texte d'un rang pour cette table : la version maison si la table
 * en a écrit une, sinon l'originale selon la coupe choisie et l'ambiance
 * (figée au clic « Commencer »).
 */
export function useCoupeRuleText(ambiance: AmbianceMode) {
  const t = useTranslations('games.coupe-du-roi')
  return (rank: CoupeRank, settings: CoupeSettings): CoupeRuleText => {
    const rule = coupeRuleFor(rank, settings.overrides)
    if (rule.kind === 'custom') return { custom: true, title: t('game.customTag'), text: rule.text }
    const variant = ambiance === 'soft' ? 'soft' : rank === 'K' && settings.cup === 'solo' ? 'solo' : 'text'
    return { custom: false, title: t(`rules.${rank}.title`), text: t(`rules.${rank}.${variant}`) }
  }
}

/** « 5 de cœur », « Roi de pique » : le nom lu par le lecteur d'écran. */
export function useCoupeCardName() {
  const t = useTranslations('games.coupe-du-roi')
  return (card: CoupeCard) => t('game.cardName', { rank: t(`ranks.${card.rank}`), suit: t(`suits.${card.suit}`) })
}

/**
 * Face de carte, rang AU CENTRE et en grand : on la lit depuis l'autre bout
 * de la table, les coins de 11 px n'y suffisent pas.
 */
export function CoupeCardFace({
  card,
  size,
  label,
  className,
}: {
  card: CoupeCard
  size: 'mini' | 'large'
  label?: string
  className?: string
}) {
  const ink = suitIsRed(card.suit) ? 'text-suit-red' : 'text-[#24201A]'
  const large = size === 'large'
  return (
    <PlayingCard
      suit={card.suit}
      rank={card.rank}
      corners={large}
      className={cn('flex flex-col items-center justify-center', large ? 'gap-1' : 'gap-0', className)}
    >
      {label && <span className="sr-only">{label}</span>}
      <span
        aria-hidden
        className={cn('font-display font-black', large ? 'text-[clamp(3rem,15vw,4.5rem)]' : 'text-sm', 'leading-none', ink)}
      >
        {card.rank}
      </span>
      <span aria-hidden className={cn(large ? 'text-[clamp(2rem,10vw,3rem)]' : 'text-xs', 'leading-none', ink)}>
        {suitGlyph(card.suit)}
      </span>
    </PlayingCard>
  )
}

/** Les quatre rois : ceux qui sont sortis, face visible, puis les dos de ceux qui restent. */
export function KingsRow({ kings, className }: { kings: CoupeCard[]; className?: string }) {
  const t = useTranslations('games.coupe-du-roi')
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-2xl border border-gold/20 bg-felt-deep/70 px-3 py-2',
        className
      )}
    >
      <span className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t('game.kings')}</span>
      <div aria-hidden className="flex flex-1 justify-center gap-1.5">
        {Array.from({ length: COUPE_KINGS_TO_FINISH }, (_, i) =>
          i < kings.length ? (
            <CoupeCardFace key={i} card={kings[i]} size="mini" className="h-11 w-8 rounded-md" />
          ) : (
            <PlayingCardBack key={i} className="h-11 w-8 rounded-md" />
          )
        )}
      </div>
      <span className="font-display text-lg font-bold tabular-nums text-gold">
        {t('game.kingsCount', { count: kings.length, total: COUPE_KINGS_TO_FINISH })}
      </span>
    </div>
  )
}

function RoleRow({ label, player }: { label: string; player: Player | undefined }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl bg-black/20 px-3 py-2">
      <span className="min-w-0 text-sm text-cream/70">{label}</span>
      {player && (
        <span className="flex min-w-0 items-center gap-1.5">
          <PlayerIcon player={player} size="sm" />
          <PlayerName player={player} className="min-w-0 truncate text-sm font-semibold text-cream" />
        </span>
      )}
    </li>
  )
}

/**
 * Ce que la table doit retenir : maître du pouce, maître des questions,
 * binômes et règles inventées. C'est tout l'intérêt de l'appli : plus
 * personne n'oublie qui a le pouce.
 */
export function InForceList({
  state,
  players,
  title,
  emptyText,
  className,
}: {
  state: CoupeState
  players: Player[]
  title: string
  /** Sans texte vide, le panneau ne s'affiche pas tant qu'il n'y a rien à retenir. */
  emptyText?: string
  className?: string
}) {
  const t = useTranslations('games.coupe-du-roi')
  const byId = (id: string | null) => (id ? players.find((p) => p.id === id) : undefined)
  const nameOf = (id: string) => byId(id)?.name ?? ''
  const pairs = state.playerIds.filter((id) => state.pairs[id] !== undefined)
  const empty = !coupeHasInForce(state)
  if (empty && !emptyText) return null

  return (
    <section className={cn('rounded-2xl border border-gold/20 bg-felt-deep/70 p-3', className)}>
      <h3 className="mb-2 font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">{title}</h3>
      {empty ? (
        <p className="text-sm text-cream/70">{emptyText}</p>
      ) : (
        <ul className="space-y-1.5">
          {state.thumbMaster !== null && <RoleRow label={t('game.thumb')} player={byId(state.thumbMaster)} />}
          {state.questionMaster !== null && <RoleRow label={t('game.questions')} player={byId(state.questionMaster)} />}
          {pairs.map((id) => (
            <RoleRow key={`pair-${id}`} label={t('game.pairOf', { name: nameOf(id) })} player={byId(state.pairs[id])} />
          ))}
          {state.customRules.map((rule, i) => (
            <li key={`rule-${i}`} className="rounded-xl bg-black/20 px-3 py-2">
              <p className="text-xs text-cream/70">{t('game.ruleBy', { name: nameOf(rule.playerId) })}</p>
              <p className="break-words text-sm font-semibold leading-snug text-cream">{rule.text}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Le joueur du 8 choisit son binôme : sélection ici, validation dans la barre du bas. */
export function PairPicker({
  chooser,
  candidates,
  selectedId,
  onSelect,
  ambiance,
}: {
  chooser: Player
  candidates: Player[]
  selectedId: string | null
  onSelect: (playerId: string) => void
  ambiance: AmbianceMode
}) {
  const t = useTranslations('games.coupe-du-roi')
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className="rounded-2xl border border-gold/40 bg-felt-deep/70 p-4">
      <h3 id={titleId} className="font-display text-lg font-bold leading-snug text-cream">
        {t('game.pair.title', { name: chooser.name })}
      </h3>
      <p className="mt-1 text-sm text-cream/70">{ambiance === 'soft' ? t('game.pair.hintSoft') : t('game.pair.hint')}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {candidates.map((player) => {
          const active = selectedId === player.id
          return (
            <button
              key={player.id}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(player.id)}
              className={cn(
                'flex min-h-[48px] min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-left leading-tight transition-colors',
                active
                  ? 'border-gold/60 bg-gold/[0.15] text-cream'
                  : 'border-gold/[0.15] bg-black/20 text-cream/80 hover:border-gold/40 hover:text-cream'
              )}
            >
              <PlayerIcon player={player} size="sm" />
              {/* Nom entier, sur deux lignes s'il le faut : « Jean-Bapti… » ne dit pas qui on choisit. */}
              <PlayerName player={player} className="min-w-0 break-words text-sm font-semibold" />
            </button>
          )
        })}
      </div>
    </section>
  )
}

/** Le joueur du Valet écrit sa règle, ou en tire une au sort ; « Ajouter » vit dans la barre du bas. */
export function RuleComposer({
  author,
  value,
  onChange,
  onIdea,
  onSubmit,
}: {
  author: Player
  value: string
  onChange: (value: string) => void
  onIdea: () => void
  /** Reçoit l'instant de la touche Entrée : la barre ne prend qu'une action par double appui. */
  onSubmit: (timeStamp: number) => void
}) {
  const t = useTranslations('games.coupe-du-roi')
  const inputId = useId()
  return (
    <section className="rounded-2xl border border-gold/40 bg-felt-deep/70 p-4">
      <h3 className="font-display text-lg font-bold leading-snug text-cream">
        {t('game.newRule.title', { name: author.name })}
      </h3>
      <p className="mt-1 text-sm text-cream/70">{t('game.newRule.hint')}</p>
      <label htmlFor={inputId} className="sr-only">
        {t('game.newRule.label')}
      </label>
      <textarea
        id={inputId}
        value={value}
        rows={2}
        maxLength={COUPE_RULE_MAX_LENGTH}
        enterKeyHint="done"
        placeholder={t('game.newRule.placeholder')}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // Une règle tient sur une ligne : Entrée l'ajoute au lieu d'aller à la ligne.
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            onSubmit(e.timeStamp)
          }
        }}
        className="mt-3 block w-full resize-none rounded-xl border border-cream/50 bg-black/30 px-4 py-3 text-base font-semibold text-cream placeholder:text-cream/60 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/40"
      />
      <Button type="button" variant="quiet" size="game" className="mt-2 w-full" onClick={onIdea}>
        <Sparkles aria-hidden className="mr-2 h-5 w-5" />
        {t('game.newRule.idea')}
      </Button>
    </section>
  )
}
