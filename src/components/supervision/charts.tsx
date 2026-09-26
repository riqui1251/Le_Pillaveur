'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { useLocale } from 'next-intl'
import { cn } from '@/lib/utils'
import { niceTicks, shareOf, sharesOf, showsXLabel, xLabelStep } from '@/lib/supervision/chart-scale'

/**
 * Kit de graphiques de la supervision — SVG et CSS maison, aucune
 * bibliothèque. Identité « Cartes sur Table » : feutre sombre, or, crème.
 *
 * Parti pris de lisibilité, commun à tous les graphes :
 * - 0 en bas, UNE échelle pour tout ce qu'on compare (jamais deux axes),
 *   graduée en valeurs rondes (chart-scale.ts) ;
 * - les chiffres sont ÉCRITS (sur les colonnes, au bout des barres, dans la
 *   légende) : la couleur n'est jamais le seul canal ;
 * - texte en crème (70 % au moins, ≥ 4,5:1 sur le feutre vert comme sur le
 *   bleu nuit du mode Soft), jamais dans la couleur de la série ;
 * - chaque graphe porte role="img" + aria-label ET une version texte masquée
 *   (tableau sr-only) de toutes ses valeurs : le lecteur d'écran lit les
 *   chiffres, pas un dessin.
 *
 * Le kit n'appelle pas useTranslations : tous les textes arrivent en props
 * (défauts vides ou neutres). Il lit seulement la locale, pour grouper les
 * milliers et écrire les % à la manière de la langue (« 1 234 », « 12 % »).
 *
 * Opacités Tailwind : on s'en tient à l'échelle de Tailwind 3.3 (5, 10, 20,
 * 30, 70, 80, 90…) — /15, /35, /45… n'y existent pas et ne produiraient
 * AUCUN CSS.
 */

export type ChartTone = 'gold' | 'cream' | 'blue' | 'green' | 'red' | 'violet'

export type ChartSeries = { key: string; label: string; tone: ChartTone }

/**
 * Teintes des marques sur le feutre. L'or et le crème sont ceux de la
 * marque ; le bleu jeton et le rouge d'enseigne, trop sombres sur le feutre
 * (le bleu jeton disparaissait sur le bleu nuit du mode Soft), sont remontés
 * d'un cran. Palette passée au validateur daltonisme (toutes paires : ΔE
 * OKLab ≥ 8,7 en protan/deutan, ≥ 17,9 en vision normale ; ≥ 3:1 contre le
 * feutre vert #0E2F26 et le bleu nuit #172539). Le crème est volontairement
 * peu saturé : c'est la teinte « neutre » (ex. parties solo face aux parties
 * entre humains).
 */
const TONE_FILL: Record<ChartTone, string> = {
  gold: 'rgb(var(--gold-rgb))',
  cream: '#EDE3C8',
  blue: '#4C82D4',
  green: '#3CC48C',
  violet: '#D2A6F2',
  red: '#D95A4F',
}

/**
 * Les mêmes teintes, assombries pour un fond crème (plaque KpiPlaque) :
 * l'or de la marque n'y tient qu'à ~2:1. Toutes ≥ 4,4:1 sur le crème.
 */
const TONE_ON_CREAM: Record<ChartTone, string> = {
  gold: '#8A6420',
  cream: '#6B6455',
  blue: 'rgb(var(--chip-blue-rgb))',
  green: '#1F7A55',
  violet: '#6B4BA8',
  red: 'rgb(var(--suit-red-rgb))',
}

/**
 * Ordre conseillé d'attribution des teintes : la série principale en or, la
 * suivante en crème, puis dans cet ordre. Une teinte suit son entité (les
 * « parties solo » restent crème partout), jamais son rang dans un tri.
 * Le rouge vient en dernier : il évoque l'alerte, à réserver à ce qui en est.
 */
export const CHART_TONE_ORDER: readonly ChartTone[] = ['gold', 'cream', 'blue', 'green', 'violet', 'red']

/** Couleur CSS d'une teinte, pour une pastille posée hors du kit. */
export function chartToneColor(tone: ChartTone, surface: 'felt' | 'cream' = 'felt'): string {
  return surface === 'cream' ? TONE_ON_CREAM[tone] : TONE_FILL[tone]
}

/**
 * Rayures « sans données » : un jour antérieur à la source (journal des
 * parties, suivi des comptes…) n'a RIEN à compter — un 0 y mentirait. Même
 * motif que les graphes historiques de la page, un peu plus appuyé pour
 * rester visible sur le bleu nuit.
 */
const NO_DATA_HATCH: CSSProperties = {
  backgroundImage: 'repeating-linear-gradient(135deg, rgb(var(--cream-rgb) / 0.14) 0 2px, transparent 2px 6px)',
}

/**
 * Largeur moyenne d'un caractère des étiquettes (10-11 px, chiffres
 * tabulaires), un peu large exprès : mieux vaut masquer une étiquette qui
 * aurait tenu que d'en superposer deux.
 */
const CHAR_PX = 6.5
/** Largeur supposée tant que le graphe n'est pas mesuré (rendu serveur). */
const FALLBACK_PLOT_WIDTH = 300
/** Place réservée au-dessus de l'échelle pour la valeur de la plus haute colonne. */
const HEADROOM_PX = 18

const ALIGN_CLASS = {
  center: 'left-1/2 -translate-x-1/2',
  start: 'left-0',
  end: 'right-0',
} as const
type Align = keyof typeof ALIGN_CLASS

function textWidth(text: string): number {
  return text.length * CHAR_PX
}

/** Valeur exploitable : négatif, NaN ou absent comptent pour 0 (les colonnes partent de 0). */
function positive(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

function useNumberFormatter(custom?: (value: number) => string): (value: number) => string {
  const locale = useLocale()
  const fallback = useMemo(() => {
    const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
    return (value: number) => nf.format(value)
  }, [locale])
  return custom ?? fallback
}

/** « 12 % » / « 12% » selon la langue ; « < 1 % » plutôt qu'un 0 % sur une part non nulle. */
function usePercentFormatter(): (share: number | null, part: number) => string {
  const locale = useLocale()
  return useMemo(() => {
    const pf = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 })
    return (share: number | null, part: number) =>
      share === null ? '—' : share === 0 && part > 0 ? `< ${pf.format(0.01)}` : pf.format(share / 100)
  }, [locale])
}

/**
 * Largeur réelle d'un élément, suivie au redimensionnement. Ref-callback et
 * non useEffect : le graphe peut d'abord rendre son état vide (données en
 * cours de chargement) puis son tracé — l'observateur doit suivre l'élément
 * qui apparaît. La première mesure tombe pendant le commit, avant que le
 * navigateur ne peigne : pas d'étiquette qui clignote.
 */
function useElementWidth(): [(element: HTMLElement | null) => void, number | null] {
  const [width, setWidth] = useState<number | null>(null)
  const observer = useRef<ResizeObserver | null>(null)
  const ref = useCallback((element: HTMLElement | null) => {
    observer.current?.disconnect()
    observer.current = null
    if (!element) return
    setWidth(Math.round(element.getBoundingClientRect().width))
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width
      if (next != null) setWidth(Math.round(next))
    })
    ro.observe(element)
    observer.current = ro
  }, [])
  useEffect(() => () => observer.current?.disconnect(), [])
  return [ref, width]
}

function Swatch({ tone, hollow }: { tone: ChartTone; hollow?: boolean }) {
  return (
    <span
      aria-hidden
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]"
      style={hollow ? { boxShadow: `inset 0 0 0 1.5px ${TONE_FILL[tone]}` } : { backgroundColor: TONE_FILL[tone] }}
    />
  )
}

function ChartEmpty({ label, minHeight }: { label: string; minHeight?: number }) {
  return (
    <p
      className="flex items-center justify-center rounded-xl border border-dashed border-cream/10 px-4 py-6 text-center text-xs text-cream/70"
      style={minHeight ? { minHeight } : undefined}
    >
      {label || '—'}
    </p>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ColumnChart
// ─────────────────────────────────────────────────────────────────────────────

export type ColumnChartDatum = {
  key: string
  /** Étiquette d'axe, courte (ex. « 26 »). */
  label: string
  /** Libellé complet, pour le bandeau de lecture et la version texte (ex. « ven. 26 sept. »). */
  fullLabel: string
  values: Record<string, number>
  /** Colonne mise en avant (aujourd'hui) : fond léger et étiquette en gras. */
  highlight?: boolean
  /** Sans données (avant la source) : rayures, jamais un 0. */
  muted?: boolean
}

export type ColumnChartProps = {
  ariaLabel: string
  data: ColumnChartDatum[]
  series: ChartSeries[]
  /** Plusieurs séries : empilées si true, sinon côte à côte — toujours sur la même échelle. */
  stacked?: boolean
  /** Hauteur de l'échelle en px (hors étiquettes). 160 par défaut. */
  height?: number
  valueFormatter?: (value: number) => string
  /**
   * 'auto' (défaut) : toutes les valeurs s'il y a ≤ 16 barres ET qu'elles
   * tiennent, sinon la plus haute (et celle du jour si la place le permet).
   * true / 'all' : toutes si elles tiennent ; 'max' ; false / 'none'.
   */
  showValues?: boolean | 'auto' | 'all' | 'max' | 'none'
  emptyLabel?: string
  /** Précision sous le graphe (définition, « depuis le … », exclusions). */
  caption?: ReactNode
  /** En-tête de la 1re colonne de la version texte (ex. « Jour »). */
  categoryLabel?: string
  /** Libellé des colonnes rayées (légende, lecture, version texte), ex. « avant le journal ». */
  mutedLabel?: string
  /** Libellé du total d'une pile (lecture, version texte), ex. « Total ». */
  totalLabel?: string
  className?: string
}

/**
 * Colonnes par jour (ou par catégorie) : axe gradué à gauche, lignes de
 * repère, valeur écrite au-dessus des colonnes, légende dès deux séries, et
 * un bandeau de lecture sous le tracé — le jour survolé (ou touché au
 * doigt), sinon le jour mis en avant — qui détaille chaque série. Ce bandeau
 * remplace l'infobulle `title` : inopérante au doigt, et elle masquerait les
 * colonnes voisines.
 *
 * Au CLAVIER aussi (WCAG 2.1.1) : le tracé est un arrêt de tabulation, et
 * ← → Début Fin y déplacent le jour lu. Sans cela, dès que les valeurs ne
 * tiennent plus toutes (mode 'max'), un exploitant voyant sans souris ne
 * lirait que le maximum et le jour mis en avant — la version texte complète
 * est réservée aux lecteurs d'écran. C'est l'élément role="img" lui-même qui
 * prend le focus : un élément focalisable À L'INTÉRIEUR d'une image serait
 * aplati par les lecteurs d'écran.
 *
 * Des divs positionnées plutôt qu'un SVG étiré : les chiffres gardent leur
 * taille sur téléphone. La largeur mesurée décide des étiquettes à écrire
 * (jamais deux étiquettes l'une sur l'autre).
 */
export function ColumnChart({
  ariaLabel,
  data,
  series,
  stacked = false,
  height = 160,
  valueFormatter,
  showValues = 'auto',
  emptyLabel = '',
  caption,
  categoryLabel = '',
  mutedLabel = '',
  totalLabel = '',
  className,
}: ColumnChartProps) {
  const fmt = useNumberFormatter(valueFormatter)
  const [plotRef, measuredWidth] = useElementWidth()
  const [active, setActive] = useState<number | null>(null)

  const n = data.length
  const k = series.length
  if (n === 0 || k === 0 || data.every((d) => d.muted)) {
    return (
      <figure className={cn('min-w-0', className)}>
        <ChartEmpty label={emptyLabel} minHeight={height} />
        {caption && <figcaption className="mt-2 text-[11px] leading-relaxed text-cream/70">{caption}</figcaption>}
      </figure>
    )
  }

  const values = data.map((d) => series.map((s) => positive(d.values[s.key])))
  const totals = values.map((row) => row.reduce((sum, v) => sum + v, 0))
  const grouped = !stacked && k > 1
  const barsPerSlot = grouped ? k : 1

  // Échelle commune : la plus haute pile (empilé) ou la plus haute barre.
  let peak = 0
  let integer = true
  for (let i = 0; i < n; i++) {
    if (data[i].muted) continue
    peak = Math.max(peak, stacked ? totals[i] : Math.max(...values[i]))
    if (values[i].some((v) => !Number.isInteger(v))) integer = false
  }
  const ticks = niceTicks(peak, height >= 140 ? 4 : 3, { integer })
  const top = ticks[ticks.length - 1]
  const pct = (value: number) => (value / top) * 100

  // Géométrie, en px, d'après la largeur mesurée du tracé.
  const plotWidth = measuredWidth ?? FALLBACK_PLOT_WIDTH
  const rawSlot = plotWidth / n
  const gap = rawSlot >= 28 ? 4 : rawSlot >= 12 ? 2 : 1
  const slotWidth = Math.max(1, (plotWidth - gap * (n - 1)) / n)
  const groupWidth = grouped ? Math.min(slotWidth * 0.92, k * 22) : Math.min(slotWidth * 0.76, 28)
  const barPitch = groupWidth / barsPerSlot
  const slotCenter = (i: number) => i * (slotWidth + gap) + slotWidth / 2
  const alignFor = (center: number, width: number): Align =>
    center - width / 2 < 0 ? 'start' : center + width / 2 > plotWidth ? 'end' : 'center'

  const highlightIndex = data.findIndex((d) => d.highlight)
  let lastMeasured = -1
  for (let i = n - 1; i >= 0; i--) {
    if (!data[i].muted) {
      lastMeasured = i
      break
    }
  }

  // ── Valeurs écrites : toutes si elles tiennent, sinon les plus parlantes.
  const valueText = (i: number, j: number) => fmt(grouped ? values[i][j] : totals[i])
  const measuredSlots = data.filter((d) => !d.muted).length
  const requested = showValues === true ? 'all' : showValues === false ? 'none' : showValues
  let mode: 'all' | 'max' | 'none' =
    requested === 'auto' ? (measuredSlots * barsPerSlot <= 16 ? 'all' : 'max') : requested
  if (mode === 'all') {
    // Mesurer d'abord : une valeur plus large que sa place chevaucherait la voisine.
    const room = (grouped ? barPitch : slotWidth + gap) - 2
    let fits = true
    for (let i = 0; i < n && fits; i++) {
      if (data[i].muted) continue
      for (let j = 0; j < barsPerSlot; j++) {
        if (textWidth(valueText(i, j)) > room) {
          fits = false
          break
        }
      }
    }
    if (!fits) mode = 'max'
  }
  const labelled = new Set<string>()
  if (mode === 'all') {
    for (let i = 0; i < n; i++) {
      if (data[i].muted) continue
      for (let j = 0; j < barsPerSlot; j++) labelled.add(`${i}:${j}`)
    }
  } else if (mode === 'max') {
    // La plus haute (la plus récente à égalité), puis le jour mis en avant
    // s'il ne la chevauche pas : l'extrême et le point d'arrivée.
    let best: [number, number] | null = null
    let bestValue = 0
    for (let i = 0; i < n; i++) {
      if (data[i].muted) continue
      for (let j = 0; j < barsPerSlot; j++) {
        const v = grouped ? values[i][j] : totals[i]
        if (v > 0 && v >= bestValue) {
          bestValue = v
          best = [i, j]
        }
      }
    }
    if (best) labelled.add(`${best[0]}:${best[1]}`)
    if (!grouped && highlightIndex >= 0 && !data[highlightIndex].muted) {
      const clear =
        !best ||
        (best[0] !== highlightIndex &&
          Math.abs(slotCenter(highlightIndex) - slotCenter(best[0])) >=
            (textWidth(valueText(highlightIndex, 0)) + textWidth(valueText(best[0], 0))) / 2 + 4)
      if (clear) labelled.add(`${highlightIndex}:0`)
    }
  }

  // ── Étiquettes de l'axe des jours : espacées pour ne jamais se toucher,
  // la grille part du jour mis en avant (ou du dernier).
  const anchor = highlightIndex >= 0 ? highlightIndex : n - 1
  const xLabelWidth = Math.max(1, ...data.map((d) => d.label.length)) * CHAR_PX
  const step = xLabelStep(n, Math.floor((plotWidth + gap) / (xLabelWidth + 6)))

  const readIndex = active != null && active < n ? active : highlightIndex >= 0 ? highlightIndex : lastMeasured
  const read = readIndex >= 0 ? data[readIndex] : null
  const hasMuted = data.some((d) => d.muted)
  const showLegend = k > 1 || (hasMuted && mutedLabel !== '')
  const columns: CSSProperties = { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, columnGap: gap }
  const tableColumns = k + (stacked && k > 1 ? 1 : 0)
  const longestTick = ticks.map((t) => fmt(t)).reduce((a, b) => (b.length > a.length ? b : a), '')

  // Lecture au clavier : on part du jour lu (survolé, sinon mis en avant).
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const from = readIndex
    let next: number
    if (event.key === 'ArrowLeft') next = from < 0 ? n - 1 : Math.max(0, from - 1)
    else if (event.key === 'ArrowRight') next = from < 0 ? 0 : Math.min(n - 1, from + 1)
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = n - 1
    else return
    // Début / Fin feraient défiler la page, les flèches aussi dans un bloc large.
    event.preventDefault()
    setActive(next)
  }
  // Arrivée AU CLAVIER : la colonne lue s'éclaire tout de suite, comme au
  // survol. Pas au clic (le pointeur a déjà choisi sa colonne), d'où le test
  // :focus-visible — protégé, un vieux moteur qui l'ignore lève une erreur.
  const onFocus = (event: FocusEvent<HTMLDivElement>) => {
    let keyboard = false
    try {
      keyboard = event.currentTarget.matches(':focus-visible')
    } catch {
      keyboard = false
    }
    if (keyboard && readIndex >= 0) setActive((current) => current ?? readIndex)
  }
  // En quittant le graphe (Tab, ou toucher ailleurs), le bandeau revient au
  // jour mis en avant : il ne reste pas bloqué sur un jour qu'on ne regarde plus.
  const onBlur = () => setActive(null)

  return (
    <figure className={cn('min-w-0', className)}>
      <div
        role="img"
        aria-label={ariaLabel}
        aria-keyshortcuts="ArrowLeft ArrowRight Home End"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        className="min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
      >
        {showLegend && (
          <ul className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-cream/80">
            {k > 1 &&
              series.map((s) => (
                <li key={s.key} className="inline-flex items-center gap-1.5">
                  <Swatch tone={s.tone} />
                  {s.label}
                </li>
              ))}
            {hasMuted && mutedLabel && (
              <li className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px] ring-1 ring-inset ring-cream/30"
                  style={NO_DATA_HATCH}
                />
                {mutedLabel}
              </li>
            )}
          </ul>
        )}

        <div className="flex min-w-0 gap-1.5">
          {/* Axe des valeurs : graduations rondes alignées sur les lignes de repère. */}
          <div
            aria-hidden
            className="relative shrink-0 whitespace-nowrap text-right text-[10px] leading-none tabular-nums text-cream/70"
            style={{ paddingTop: HEADROOM_PX }}
          >
            {/* Réserve la largeur de la plus longue graduation (les vraies sont en absolu). */}
            <span className="invisible block h-0 overflow-hidden">{longestTick}</span>
            <div className="relative" style={{ height }}>
              {ticks.map((tick) => (
                <span key={tick} className="absolute right-0 translate-y-1/2" style={{ bottom: `${pct(tick)}%` }}>
                  {fmt(tick)}
                </span>
              ))}
            </div>
          </div>

          <div
            className="min-w-0 flex-1"
            style={{ paddingTop: HEADROOM_PX }}
            onPointerLeave={(event) => {
              if (event.pointerType === 'mouse') setActive(null)
            }}
          >
            <div ref={plotRef} className="relative" style={{ height }}>
              {ticks.map((tick) => (
                <div
                  key={tick}
                  aria-hidden
                  className={cn('pointer-events-none absolute inset-x-0 h-px', tick === 0 ? 'bg-cream/30' : 'bg-cream/10')}
                  style={{ bottom: `${pct(tick)}%` }}
                />
              ))}
              <div className="absolute inset-0 grid" style={columns}>
                {data.map((d, i) => {
                  const isActive = i === active
                  return (
                    <div
                      key={d.key}
                      className={cn('relative h-full', isActive ? 'bg-cream/10' : d.highlight && 'bg-cream/5')}
                      onPointerEnter={(event) => {
                        if (event.pointerType === 'mouse') setActive(i)
                      }}
                      onPointerDown={() => setActive(i)}
                    >
                      {d.muted ? (
                        <div className="absolute inset-0 rounded-t-[4px]" style={NO_DATA_HATCH} />
                      ) : grouped ? (
                        <div
                          className="absolute inset-y-0 left-1/2 flex -translate-x-1/2 gap-[2px]"
                          style={{ width: `min(92%, ${k * 22}px)` }}
                        >
                          {series.map((s, j) => {
                            const v = values[i][j]
                            return (
                              <div key={s.key} className="relative h-full min-w-0 flex-1">
                                {v > 0 && (
                                  <div
                                    className="absolute inset-x-0 bottom-0 rounded-t-[4px]"
                                    style={{ height: `${pct(v)}%`, minHeight: 2, backgroundColor: TONE_FILL[s.tone] }}
                                  />
                                )}
                                {labelled.has(`${i}:${j}`) && (
                                  <ValueLabel
                                    text={valueText(i, j)}
                                    bottomPct={pct(v)}
                                    align={
                                      textWidth(valueText(i, j)) <= barPitch
                                        ? 'center'
                                        : alignFor(
                                            slotCenter(i) - groupWidth / 2 + barPitch * (j + 0.5),
                                            textWidth(valueText(i, j))
                                          )
                                    }
                                  />
                                )}
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <>
                          <StackColumn values={values[i]} series={series} pct={pct} />
                          {labelled.has(`${i}:0`) && (
                            <ValueLabel
                              text={valueText(i, 0)}
                              bottomPct={pct(totals[i])}
                              align={alignFor(slotCenter(i), textWidth(valueText(i, 0)))}
                            />
                          )}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <div aria-hidden className="mt-1.5 grid" style={columns}>
              {data.map((d, i) => (
                <span
                  key={d.key}
                  className={cn(
                    'relative h-3.5 min-w-0 text-[10px] leading-none tabular-nums sm:text-[11px]',
                    d.highlight ? 'font-bold text-cream' : 'text-cream/70'
                  )}
                >
                  {(showsXLabel(i, anchor, step) || d.highlight) && (
                    <span
                      className={cn(
                        'absolute top-0 whitespace-nowrap',
                        ALIGN_CLASS[alignFor(slotCenter(i), textWidth(d.label))]
                      )}
                    >
                      {d.label}
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Bandeau de lecture : le jour survolé/touché, sinon le jour mis en avant. */}
        {read && (
          <div className="mt-2.5 flex min-h-[1.25rem] flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="font-semibold text-cream/90">{read.fullLabel}</span>
            {read.muted ? (
              <span className="text-cream/70">{mutedLabel || '—'}</span>
            ) : (
              <>
                {series.map((s, j) => (
                  <span key={s.key} className="inline-flex items-center gap-1.5">
                    <Swatch tone={s.tone} />
                    <span className="font-semibold tabular-nums text-cream">{fmt(values[readIndex][j])}</span>
                    <span className="text-cream/70">{s.label}</span>
                  </span>
                ))}
                {stacked && k > 1 && totalLabel && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-cream/70">{totalLabel}</span>
                    <span className="font-semibold tabular-nums text-cream">{fmt(totals[readIndex])}</span>
                  </span>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th scope="col">{categoryLabel}</th>
            {series.map((s) => (
              <th key={s.key} scope="col">
                {s.label}
              </th>
            ))}
            {stacked && k > 1 && <th scope="col">{totalLabel || 'Σ'}</th>}
          </tr>
        </thead>
        <tbody>
          {data.map((d, i) => (
            <tr key={d.key}>
              <th scope="row">{d.fullLabel}</th>
              {d.muted ? (
                <td colSpan={tableColumns}>{mutedLabel || '—'}</td>
              ) : (
                <>
                  {series.map((s, j) => (
                    <td key={s.key}>{fmt(values[i][j])}</td>
                  ))}
                  {stacked && k > 1 && <td>{fmt(totals[i])}</td>}
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {caption && <figcaption className="mt-2 text-[11px] leading-relaxed text-cream/70">{caption}</figcaption>}
    </figure>
  )
}

/**
 * Une colonne (une série) ou une pile (plusieurs séries, la première en
 * bas). Chaque segment est placé à sa hauteur EXACTE sur l'échelle ; le
 * filet de 2 px qui sépare deux segments est pris dans le segment du dessus
 * (bordure transparente), pour que le sommet de la pile tombe pile sur son
 * total.
 */
function StackColumn({
  values,
  series,
  pct,
}: {
  values: number[]
  series: ChartSeries[]
  pct: (value: number) => number
}) {
  const first = values.findIndex((v) => v > 0)
  let last = -1
  for (let j = values.length - 1; j >= 0; j--) {
    if (values[j] > 0) {
      last = j
      break
    }
  }
  if (first < 0) return null
  const single = first === last
  let cumulative = 0
  return (
    <div className="absolute inset-y-0 left-1/2 -translate-x-1/2" style={{ width: 'min(76%, 28px)' }}>
      {series.map((s, j) => {
        const v = values[j]
        if (v <= 0) return null
        const bottom = pct(cumulative)
        cumulative += v
        const style: CSSProperties = {
          bottom: `${bottom}%`,
          height: `${pct(v)}%`,
          backgroundColor: TONE_FILL[s.tone],
        }
        // Une barre seule reste visible même minuscule : 1 ≠ 0.
        if (single) style.minHeight = 2
        if (j !== first) {
          style.borderBottom = '2px solid transparent'
          style.backgroundClip = 'padding-box'
        }
        return <div key={s.key} className={cn('absolute inset-x-0', j === last && 'rounded-t-[4px]')} style={style} />
      })}
    </div>
  )
}

/**
 * Valeur écrite au-dessus d'une colonne : 11 px à TOUTES les largeurs. C'est
 * le chiffre qu'on lit, pas un repère — seuls les graduations et les jours
 * descendent à 10 px sur téléphone. CHAR_PX est calibré pour ce corps : le
 * test « tient / ne tient pas » reste juste.
 */
function ValueLabel({ text, bottomPct, align }: { text: string; bottomPct: number; align: Align }) {
  return (
    <span
      className={cn(
        'pointer-events-none absolute whitespace-nowrap text-[11px] font-semibold leading-none tabular-nums text-cream/80',
        ALIGN_CLASS[align]
      )}
      style={{ bottom: `calc(${bottomPct}% + 3px)` }}
    >
      {text}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// BarList
// ─────────────────────────────────────────────────────────────────────────────

export type BarListRow = {
  key: string
  label: ReactNode
  value: number
  /** Second segment empilé au bout du premier (ex. défaites après victoires). */
  secondary?: number
  /** Précision écrite sous le libellé (visible, pas une simple infobulle). */
  hint?: string
  /** Rangée cliquable (ouvre un détail) : rendue en vrai bouton. */
  onClick?: () => void
}

export type BarListProps = {
  ariaLabel: string
  /** Déjà triées par l'appelant. */
  rows: BarListRow[]
  /** Base des parts en % ; par défaut la somme des rangées (valeur + secondaire). */
  total?: number
  showShare?: boolean
  /** Au-delà : repli avec « Voir tout (n) ». */
  limit?: number
  valueFormatter?: (value: number) => string
  tone?: ChartTone
  secondaryTone?: ChartTone
  secondaryLabel?: string
  primaryLabel?: string
  emptyLabel?: string
  /** Texte du dépli : chaîne (le kit ajoute « (n) ») ou fonction du nombre total de rangées. */
  showAllLabel?: string | ((count: number) => string)
  collapseLabel?: string
  /** En-têtes de la version texte. */
  categoryLabel?: string
  shareLabel?: string
  className?: string
}

/**
 * Barres horizontales triées : libellé à gauche, valeur (et part) à droite
 * en chiffres tabulaires, toutes les barres partant de la même ligne.
 * L'échelle est la plus longue rangée — y compris les rangées repliées, pour
 * que déplier ne change pas la longueur des barres déjà vues.
 *
 * Mise en page selon la largeur MESURÉE du bloc (pas celle de l'écran : une
 * carte en demi-largeur sur ordinateur est aussi étroite qu'un téléphone) :
 * étroit = libellé et valeur sur une ligne, barre pleine largeur dessous ;
 * large = une ligne libellé | barre | valeur. Les colonnes sont partagées par
 * toutes les rangées (subgrid) : les valeurs s'alignent à droite, les barres
 * démarrent au même endroit.
 */
export function BarList({
  ariaLabel,
  rows,
  total,
  showShare = false,
  limit,
  valueFormatter,
  tone = 'gold',
  secondaryTone = 'cream',
  secondaryLabel = '',
  primaryLabel = '',
  emptyLabel = '',
  showAllLabel,
  collapseLabel = '',
  categoryLabel = '',
  shareLabel = '',
  className,
}: BarListProps) {
  const fmt = useNumberFormatter(valueFormatter)
  const formatShare = usePercentFormatter()
  const [listRef, width] = useElementWidth()
  const [expanded, setExpanded] = useState(false)

  if (rows.length === 0) {
    return (
      <div className={cn('min-w-0', className)}>
        <ChartEmpty label={emptyLabel} />
      </div>
    )
  }

  const hasSecondary = rows.some((r) => r.secondary !== undefined)
  const sums = rows.map((r) => positive(r.value) + positive(r.secondary))
  const scaleMax = Math.max(0, ...sums)
  const rowsTotal = sums.reduce((a, b) => a + b, 0)
  // Rangées qui forment une PARTITION (base = leur somme : appareils, pays,
  // rôles…) : parts au plus fort reste, qui font 100 comme la StackedBar
  // voisine — trois tiers s'écrivent 34 / 33 / 33, pas 33 / 33 / 33. Une base
  // extérieure PLUS GRANDE (rangées partielles d'un total) garde l'arrondi
  // rangée par rangée : leurs parts ne doivent pas faire 100.
  const partition = total === undefined || total === rowsTotal
  const shares = partition ? sharesOf(sums) : sums.map((sum) => shareOf(sum, total ?? rowsTotal))
  const collapsible = limit != null && limit > 0 && rows.length > limit
  const visible = collapsible && !expanded ? rows.slice(0, limit) : rows
  const interactive = rows.some((r) => r.onClick)
  const wide = (width ?? 0) >= 420
  const showLegend = hasSecondary && (primaryLabel !== '' || secondaryLabel !== '')
  const expandText =
    typeof showAllLabel === 'function'
      ? showAllLabel(rows.length)
      : `${showAllLabel ?? '…'} (${rows.length})`

  const rowClass = 'col-span-full grid items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 [grid-template-columns:subgrid]'

  // Les rangées visibles sont toujours les premières : leur rang est celui de `rows`.
  const renderCells = (row: BarListRow, index: number) => {
    const v = positive(row.value)
    const sec = positive(row.secondary)
    const sum = sums[index]
    const primaryPct = scaleMax > 0 ? (v / scaleMax) * 100 : 0
    const secondaryPct = scaleMax > 0 ? (sec / scaleMax) * 100 : 0
    return (
      <>
        <span className="col-start-1 row-start-1 min-w-0">
          <span className={cn('block truncate text-sm text-cream/90', row.onClick && 'group-hover:underline')}>
            {row.label}
          </span>
          {row.hint && <span className="block truncate text-[11px] text-cream/70">{row.hint}</span>}
        </span>
        <span
          aria-hidden
          className={cn('relative block h-2.5', wide ? 'col-start-2 row-start-1' : 'col-span-2 row-start-2')}
        >
          {v > 0 && (
            <span
              className={cn('absolute inset-y-0 left-0', sec > 0 ? '' : 'rounded-r-[4px]')}
              style={{ width: `${primaryPct}%`, minWidth: 2, backgroundColor: TONE_FILL[tone] }}
            />
          )}
          {sec > 0 && (
            <span
              className="absolute inset-y-0 rounded-r-[4px]"
              style={{
                left: `${primaryPct}%`,
                width: `${secondaryPct}%`,
                minWidth: 2,
                backgroundColor: TONE_FILL[secondaryTone],
                ...(v > 0 ? { borderLeft: '2px solid transparent', backgroundClip: 'padding-box' } : {}),
              }}
            />
          )}
        </span>
        <span
          className={cn(
            'row-start-1 flex items-center justify-end gap-2 whitespace-nowrap text-sm tabular-nums',
            wide ? 'col-start-3' : 'col-start-2'
          )}
        >
          {hasSecondary ? (
            <>
              <span className="inline-flex items-center gap-1">
                <Swatch tone={tone} />
                <span className="font-semibold text-cream">{fmt(v)}</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <Swatch tone={secondaryTone} />
                <span className="text-cream/80">{fmt(sec)}</span>
              </span>
            </>
          ) : (
            <span className="font-semibold text-cream">{fmt(v)}</span>
          )}
          {showShare && (
            <span className="min-w-[5ch] text-right text-xs text-cream/70">
              {formatShare(shares[index], sum)}
            </span>
          )}
        </span>
      </>
    )
  }

  const list = (
    <ul
      ref={listRef}
      aria-label={interactive ? ariaLabel : undefined}
      className="grid gap-x-3 gap-y-0.5"
      style={{ gridTemplateColumns: wide ? 'fit-content(40%) minmax(0, 1fr) auto' : 'minmax(0, 1fr) auto' }}
    >
      {visible.map((row, index) => (
        <li key={row.key} className="col-span-full grid [grid-template-columns:subgrid]">
          {row.onClick ? (
            <button
              type="button"
              onClick={row.onClick}
              className={cn(
                rowClass,
                'group w-full text-left transition-colors hover:bg-cream/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50'
              )}
            >
              {renderCells(row, index)}
            </button>
          ) : (
            <div className={rowClass}>{renderCells(row, index)}</div>
          )}
        </li>
      ))}
    </ul>
  )

  return (
    <figure className={cn('min-w-0', className)}>
      <div role={interactive ? undefined : 'img'} aria-label={interactive ? undefined : ariaLabel} className="min-w-0">
        {showLegend && (
          <p aria-hidden className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-2 text-[11px] text-cream/80">
            {primaryLabel && (
              <span className="inline-flex items-center gap-1.5">
                <Swatch tone={tone} />
                {primaryLabel}
              </span>
            )}
            {secondaryLabel && (
              <span className="inline-flex items-center gap-1.5">
                <Swatch tone={secondaryTone} />
                {secondaryLabel}
              </span>
            )}
          </p>
        )}
        {list}
      </div>

      {/* Version texte COMPLÈTE, rangées repliées comprises. */}
      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th scope="col">{categoryLabel}</th>
            <th scope="col">{primaryLabel}</th>
            {hasSecondary && <th scope="col">{secondaryLabel}</th>}
            {showShare && <th scope="col">{shareLabel || '%'}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.key}>
              <th scope="row">
                {row.label}
                {row.hint ? ` — ${row.hint}` : ''}
              </th>
              <td>{fmt(positive(row.value))}</td>
              {hasSecondary && <td>{fmt(positive(row.secondary))}</td>}
              {showShare && <td>{formatShare(shares[i], sums[i])}</td>}
            </tr>
          ))}
        </tbody>
      </table>

      {collapsible && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
          className="mt-1.5 inline-flex items-center rounded-lg px-2 py-1 text-xs font-semibold text-gold transition-colors hover:bg-cream/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
        >
          {expanded ? collapseLabel || '—' : expandText}
        </button>
      )}
    </figure>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// StackedBar
// ─────────────────────────────────────────────────────────────────────────────

export type StackedBarSegment = { key: string; label: string; value: number; tone: ChartTone }

/**
 * Une répartition en une barre 100 % (rôles, types de comptes, statuts des
 * tables…) et sa légende chiffrée « libellé — valeur (part %) ». Les parts
 * totalisent exactement 100 (plus fort reste). Un segment à 0 n'a pas de
 * place dans la barre mais reste dans la légende, en creux : « 0 modérateur »
 * est une information.
 */
export function StackedBar({
  ariaLabel,
  segments,
  valueFormatter,
  emptyLabel = '',
  categoryLabel = '',
  valueLabel = '',
  shareLabel = '',
  className,
}: {
  ariaLabel: string
  segments: StackedBarSegment[]
  valueFormatter?: (value: number) => string
  emptyLabel?: string
  /** En-têtes de la version texte. */
  categoryLabel?: string
  valueLabel?: string
  shareLabel?: string
  className?: string
}) {
  const fmt = useNumberFormatter(valueFormatter)
  const formatShare = usePercentFormatter()
  const values = segments.map((s) => positive(s.value))
  const total = values.reduce((a, b) => a + b, 0)
  if (total <= 0) {
    return (
      <div className={cn('min-w-0', className)}>
        <ChartEmpty label={emptyLabel} />
      </div>
    )
  }
  const shares = sharesOf(values)

  return (
    <figure className={cn('min-w-0', className)}>
      <div role="img" aria-label={ariaLabel} className="min-w-0">
        {/* Les segments se partagent la largeur au prorata ; l'écart de 2 px
            laisse voir le feutre entre deux voisins, un minuscule reste visible. */}
        <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded-[4px]">
          {segments.map((s, i) =>
            values[i] > 0 ? (
              <div
                key={s.key}
                className="h-full"
                style={{ flex: `${values[i]} 1 0%`, minWidth: 3, backgroundColor: TONE_FILL[s.tone] }}
              />
            ) : null
          )}
        </div>
        <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
          {segments.map((s, i) => (
            <li key={s.key} className="inline-flex items-center gap-1.5">
              <Swatch tone={s.tone} hollow={values[i] === 0} />
              <span className={values[i] === 0 ? 'text-cream/70' : 'text-cream/80'}>{s.label}</span>
              <span aria-hidden className="text-cream/70">
                —
              </span>
              <span className={cn('tabular-nums', values[i] === 0 ? 'text-cream/70' : 'font-semibold text-cream')}>
                {fmt(values[i])}
              </span>
              <span className="tabular-nums text-cream/70">({formatShare(shares[i], values[i])})</span>
            </li>
          ))}
        </ul>
      </div>
      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th scope="col">{categoryLabel}</th>
            <th scope="col">{valueLabel}</th>
            <th scope="col">{shareLabel || '%'}</th>
          </tr>
        </thead>
        <tbody>
          {segments.map((s, i) => (
            <tr key={s.key}>
              <th scope="row">{s.label}</th>
              <td>{fmt(values[i])}</td>
              <td>{formatShare(shares[i], values[i])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sparkline
// ─────────────────────────────────────────────────────────────────────────────

const SPARK_W = 100
const SPARK_H = 32

/**
 * Mini-courbe de tendance (aire légère + trait de 2 px + point final
 * marqué), sans axe : la valeur exacte est le chiffre qu'elle accompagne.
 * Part de 0 comme tous les graphes du kit — une courbe « zoomée » ferait
 * d'une variation de 2 % une falaise.
 *
 * Racine en <span> (contenu phrasé) : elle peut se loger dans le <p> d'une
 * plaque KpiPlaque sans casser le HTML. Pour la même raison, sa version
 * texte est une liste sr-only et non un <table>. `surface="cream"` prend les
 * teintes assombries lisibles sur la plaque crème.
 */
export function Sparkline({
  ariaLabel,
  values,
  tone = 'gold',
  surface = 'felt',
  labels,
  valueFormatter,
  className,
}: {
  ariaLabel: string
  values: number[]
  tone?: ChartTone
  surface?: 'felt' | 'cream'
  /** Libellé de chaque point pour la version texte (ex. jours) ; sinon leur rang. */
  labels?: string[]
  valueFormatter?: (value: number) => string
  className?: string
}) {
  const fmt = useNumberFormatter(valueFormatter)
  const safe = values.map((v) => positive(v))
  if (safe.length === 0) return null
  const color = chartToneColor(tone, surface)
  const ring = surface === 'cream' ? 'rgb(var(--cream-rgb))' : 'rgb(var(--felt-deep-rgb))'
  const max = Math.max(...safe) || 1
  const top = 3
  const bottom = 1.5
  const x = (i: number) => (safe.length === 1 ? SPARK_W / 2 : (i / (safe.length - 1)) * SPARK_W)
  const y = (v: number) => SPARK_H - bottom - (v / max) * (SPARK_H - top - bottom)
  const line = safe.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ')
  const area = `${line} L${x(safe.length - 1).toFixed(2)},${SPARK_H} L${x(0).toFixed(2)},${SPARK_H} Z`
  const last = safe.length - 1

  return (
    <span className={cn('block min-w-0', className)}>
      {/* mx-1.5 : le point final (8 px + anneau) déborde du tracé sans être rogné. */}
      <span role="img" aria-label={ariaLabel} className="relative mx-1.5 block h-8">
        <svg
          viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full overflow-visible"
          aria-hidden
        >
          <path d={area} fill={color} fillOpacity={0.14} />
          <path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {/* Point final en HTML : dans un SVG étiré (preserveAspectRatio none), un cercle deviendrait ovale. */}
        <span
          aria-hidden
          className="absolute h-2 w-2 -translate-x-1/2 translate-y-1/2 rounded-full"
          style={{
            left: `${(x(last) / SPARK_W) * 100}%`,
            bottom: `${((SPARK_H - y(safe[last])) / SPARK_H) * 100}%`,
            backgroundColor: color,
            boxShadow: `0 0 0 2px ${ring}`,
          }}
        />
      </span>
      <span className="sr-only">
        {safe.map((v, i) => `${labels?.[i] ?? i + 1} : ${fmt(v)}`).join(' ; ')}
      </span>
    </span>
  )
}
