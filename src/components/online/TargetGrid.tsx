"use client"

import type { ReactNode } from 'react'
import { Ban, Check, Loader2, Skull } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { cn } from '@/lib/utils'

export type TargetGridPlayer = { id: string; name: string; isBot: boolean }

type TargetGridCommonProps = {
  players: readonly TargetGridPlayer[]
  iconOf: (p: TargetGridPlayer) => string
  /**
   * Grille inerte (envoi en cours, vote déjà parti, plus de prises de
   * parole) : les cartes passent à 60 %, sauf la carte choisie ou en cours
   * d'envoi, qui reste en pleine lumière.
   */
  disabled?: boolean
  /** Choix déjà ENREGISTRÉ côté serveur (vote des loups, vote envoyé) : anneau + coche. */
  chosenId?: string | null
  /** Cibles interdites (le Salvateur ne protège pas deux fois le même) : 40 %, icône Ban, non touchables. */
  excludeIds?: readonly string[]
  /** Joueurs morts laissés dans la grille : crâne, nom barré, 40 %, non touchables. */
  deadIds?: readonly string[]
  /** Carte dont l'action est partie et attend le serveur : roue qui tourne (« Envoi… » au lecteur d'écran). */
  pendingId?: string | null
  /** Ligne 12 px sous le nom (« accusé 3× », « a voté »), en gris encre. */
  meta?: (p: TargetGridPlayer) => ReactNode
  /** Teinte de la carte choisie : or (défaut) ou rouge pour un geste CONTRE quelqu'un (vote, tir). */
  tone?: 'gold' | 'danger'
  youLabel: string
  selfId: string
}

export type TargetGridProps =
  | (TargetGridCommonProps & {
      /** Un toucher = l'action part (défaut). Pour les gestes réversibles ou sans enjeu. */
      mode?: 'instant'
      onPick: (id: string) => void
    })
  | (TargetGridCommonProps & {
      /**
       * Choisir puis valider : un toucher SÉLECTIONNE (re-toucher la même
       * carte la désélectionne), le geste part du bouton de la barre du bas
       * (OnlineActionBar), jamais de la grille.
       */
      mode: 'select'
      selectedId: string | null | undefined
      onSelect: (id: string | null) => void
    })

export type TargetCardState = {
  /** Carte choisie (sélection locale, sinon choix enregistré). */
  marked: boolean
  pending: boolean
  excluded: boolean
  dead: boolean
  /** Grille inerte : la carte s'estompe à 60 %. */
  dimmed: boolean
  /** Un toucher fait quelque chose. */
  pickable: boolean
}

/** État d'une carte — pur, partagé par le rendu et ses tests. */
export function targetCardState(
  id: string,
  {
    disabled = false,
    chosenId,
    selectedId,
    excludeIds = [],
    deadIds = [],
    pendingId,
  }: {
    disabled?: boolean
    chosenId?: string | null
    selectedId?: string | null
    excludeIds?: readonly string[]
    deadIds?: readonly string[]
    pendingId?: string | null
  }
): TargetCardState {
  const dead = deadIds.includes(id)
  const excluded = !dead && excludeIds.includes(id)
  const pending = pendingId != null && pendingId === id
  // Une sélection locale l'emporte sur le choix enregistré ; désélectionner
  // (null) laisse réapparaître celui-ci.
  const marked = selectedId != null ? selectedId === id : chosenId != null && chosenId === id
  const unavailable = dead || excluded
  return {
    marked,
    pending,
    excluded,
    dead,
    dimmed: disabled && !marked && !pending && !unavailable,
    pickable: !disabled && !pending && !unavailable,
  }
}

/**
 * Grille de cibles des jeux de table (sonde / vote loup / potion / tir / vote
 * du jour au Loup-Garou, accusation à l'Imposteur, question à l'Espion) —
 * chaque cible est une mini-carte crème qu'on « abat » sur la table. Noms en
 * encre pure (pas de cosmétiques : illisibles sur crème).
 *
 * Chaque état se lit sans la couleur : interdit (Ban), mort (crâne + nom
 * barré), envoi en cours (roue), choisi (coche). Les opacités sont des crans
 * que Tailwind 3.3 génère (40, 60) — l'ancien `opacity-35` ne produisait
 * aucun CSS, une cible interdite gardait son plein aspect.
 */
export function TargetGrid(props: TargetGridProps) {
  const {
    players,
    iconOf,
    disabled = false,
    chosenId,
    excludeIds,
    deadIds,
    pendingId,
    meta,
    tone = 'gold',
    youLabel,
    selfId,
  } = props
  const t = useTranslations('gameUi.targets')
  const tCommon = useTranslations('common')
  const selectedId = props.mode === 'select' ? props.selectedId : undefined
  // Bouton à bascule seulement quand la grille porte un choix (sélection ou
  // choix enregistré) : une sonde à un toucher n'est pas « non enfoncée ».
  const toggles = props.mode === 'select' || chosenId !== undefined

  const pick = (id: string) => {
    if (props.mode === 'select') props.onSelect(props.selectedId === id ? null : id)
    else props.onPick(id)
  }

  return (
    <div className="grid grid-cols-2 gap-2.5">
      {players.map((p) => {
        const s = targetCardState(p.id, { disabled, chosenId, selectedId, excludeIds, deadIds, pendingId })
        const unavailable = s.excluded || s.dead
        const metaLine = meta?.(p)
        const hasMeta = metaLine != null && metaLine !== false && metaLine !== ''
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              if (s.pickable) pick(p.id)
            }}
            // Interdit / mort : aria-disabled, la carte reste lisible au
            // lecteur d'écran (qui annonce l'état) au lieu de disparaître du
            // parcours au clavier. Grille inerte : vrai `disabled`, pas de
            // double envoi.
            disabled={!unavailable && (disabled || s.pending)}
            aria-disabled={unavailable || undefined}
            aria-pressed={toggles ? s.marked : undefined}
            aria-busy={s.pending || undefined}
            className={cn(
              'flex min-h-[52px] items-center gap-2 rounded-xl border px-3 py-2 text-left text-[#24201A] transition-all',
              'shadow-[0_6px_14px_-8px_rgba(0,0,0,0.55)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-felt-deep',
              s.marked
                ? tone === 'danger'
                  ? '-translate-y-0.5 border-suit-red bg-cream ring-[3px] ring-red-400'
                  : '-translate-y-0.5 border-gold bg-cream ring-[3px] ring-gold'
                : 'border-[#D8CCAE] bg-cream',
              s.pickable && 'hover:-translate-y-0.5 active:scale-95',
              unavailable && 'cursor-not-allowed opacity-40',
              s.dimmed && 'opacity-60'
            )}
          >
            <span className="shrink-0 text-lg" aria-hidden>
              <PlayerAvatarGlyph value={iconOf(p)} />
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn('line-clamp-2 break-words text-sm font-bold leading-tight', s.dead && 'line-through')}>
                {p.name}
                {p.id === selfId && <span className="font-semibold text-[#6B6455]"> {youLabel}</span>}
              </span>
              {hasMeta && <span className="mt-0.5 block text-xs font-semibold leading-tight text-[#6B6455]">{metaLine}</span>}
            </span>
            <TargetMark state={s} tone={tone} />
            {/* État dit au lecteur d'écran, détaché du nom par la parenthèse. */}
            {s.pending && <span className="sr-only">{` (${tCommon('sending')})`}</span>}
            {s.excluded && <span className="sr-only">{` (${t('excluded')})`}</span>}
            {s.dead && <span className="sr-only">{` (${t('dead')})`}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** Signe non chromatique de l'état, à droite de la carte. */
function TargetMark({ state, tone }: { state: TargetCardState; tone: 'gold' | 'danger' }) {
  if (state.pending) return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#6B6455]" aria-hidden />
  if (state.dead) return <Skull className="h-4 w-4 shrink-0 text-[#6B6455]" aria-hidden />
  if (state.excluded) return <Ban className="h-4 w-4 shrink-0 text-[#6B6455]" aria-hidden />
  if (state.marked) {
    return (
      <span
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
          tone === 'danger' ? 'bg-suit-red text-cream' : 'bg-amber-500 text-[#24201A]'
        )}
        aria-hidden
      >
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </span>
    )
  }
  return null
}
