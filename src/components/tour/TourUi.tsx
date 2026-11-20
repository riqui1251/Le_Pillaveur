"use client"

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Check, ChevronLeft, ChevronRight, SkipForward } from 'lucide-react'
import { BrandMark } from '@/components/brand/BrandLogo'
import { TOUR_CHAPTERS, type ChapterProgress } from '@/lib/tour/steps'
import { cn } from '@/lib/utils'

/**
 * Pièces visuelles du tuto, communes à ses deux temps (vrais écrans et
 * démonstration) : la bulle crème d'une étape, l'anneau d'or posé sur
 * l'élément visé, et la carte centrée des écrans d'accueil, de pause et de fin.
 */

export type Box = { top: number; left: number; width: number; height: number }

/** Premier élément `data-tour` de ce nom réellement rendu (un jumeau masqué ne compte pas). */
export function findAnchor(name: string, root: ParentNode = document): HTMLElement | null {
  for (const el of root.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return el
  }
  return null
}

/**
 * Boîte de l'élément visé, dans le repère de la fenêtre, tenue à jour : la
 * page défile, le clavier s'ouvre, une carte s'ajoute — l'anneau suit.
 */
export function useAnchorBox(name: string | null, root?: ParentNode | null): Box | null {
  const [box, setBox] = useState<Box | null>(null)

  useEffect(() => {
    if (!name) {
      setBox(null)
      return
    }
    let frame = 0
    const read = () => {
      const el = findAnchor(name, root ?? document)
      if (!el) {
        setBox((prev) => (prev === null ? prev : null))
        return
      }
      const r = el.getBoundingClientRect()
      setBox((prev) =>
        prev &&
        Math.abs(prev.top - r.top) < 0.5 &&
        Math.abs(prev.left - r.left) < 0.5 &&
        Math.abs(prev.width - r.width) < 0.5 &&
        Math.abs(prev.height - r.height) < 0.5
          ? prev
          : { top: r.top, left: r.left, width: r.width, height: r.height }
      )
    }
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(read)
    }
    read()
    const timer = window.setInterval(read, 200)
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      window.clearInterval(timer)
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
    }
  }, [name, root])

  return box
}

/** Taille de la fenêtre, tenue à jour. */
export function useViewport(): { width: number; height: number } {
  const [size, setSize] = useState(() =>
    typeof window === 'undefined' ? { width: 375, height: 667 } : { width: window.innerWidth, height: window.innerHeight }
  )
  useEffect(() => {
    const read = () => setSize({ width: window.innerWidth, height: window.innerHeight })
    read()
    window.addEventListener('resize', read)
    return () => window.removeEventListener('resize', read)
  }, [])
  return size
}

const PAD = 5
const EDGE = 12

export type Dock = 'top' | 'bottom'

/**
 * Voile + anneau d'or. Le voile arrête tous les touchers, sauf dans la boîte
 * de l'élément visé quand l'étape est `interactive` : le doigt atteint alors
 * le vrai bouton. Sans boîte, tout l'écran est voilé.
 *
 * `limit` borne l'anneau du côté de la bulle (cible plus haute que la place
 * libre, sur un petit téléphone) : il s'arrête au bord de la bulle.
 */
export function TourSpot({
  box,
  interactive,
  dock,
  bubbleHeight,
  viewport,
  frame,
  onHit,
  hitLabel,
}: {
  box: Box | null
  interactive: boolean
  dock: Dock
  bubbleHeight: number
  viewport: { width: number; height: number }
  /** Cadre dans lequel le tuto s'affiche (la démonstration, sur grand écran) ; par défaut la fenêtre. */
  frame?: Box
  /** Démonstration : toucher l'élément entouré d'or vaut « Suivant ». */
  onHit?: () => void
  hitLabel?: string
}) {
  const area = frame ?? { top: 0, left: 0, width: viewport.width, height: viewport.height }
  if (!box) {
    return <div className="pointer-events-auto fixed inset-0 bg-[rgba(3,14,10,0.5)]" />
  }

  let top = Math.max(area.top + 4, box.top - PAD)
  let bottom = Math.min(area.top + area.height - 4, box.top + box.height + PAD)
  const left = Math.max(area.left + 4, box.left - PAD)
  const right = Math.min(area.left + area.width - 4, box.left + box.width + PAD)
  if (dock === 'bottom') bottom = Math.min(bottom, area.top + area.height - EDGE - bubbleHeight - 10)
  else top = Math.max(top, area.top + EDGE + bubbleHeight + 10)
  const width = Math.max(0, right - left)
  const height = Math.max(0, bottom - top)

  const hole = interactive
    ? `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${left}px ${top}px, ${left}px ${bottom}px, ${right}px ${bottom}px, ${right}px ${top}px, ${left}px ${top}px)`
    : undefined

  return (
    <>
      <div className="pointer-events-auto fixed inset-0" style={hole ? { clipPath: hole } : undefined} />
      <div
        aria-hidden
        className="pointer-events-none fixed rounded-[14px] shadow-[0_0_0_200vmax_rgba(3,14,10,0.44)]"
        style={{ top, left, width, height }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed rounded-[14px] border-2 border-gold"
        style={{ top, left, width, height }}
      >
        <span className="absolute -inset-1.5 rounded-[18px] border-[3px] border-gold/40 motion-safe:animate-pulse" />
      </div>
      {onHit && (
        <button
          type="button"
          aria-label={hitLabel}
          onClick={onHit}
          className="pointer-events-auto fixed rounded-[14px] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-cream"
          style={{ top, left, width, height }}
        />
      )}
    </>
  )
}

/** Barre de progression en sept segments, un par chapitre ; celui en cours se remplit étape par étape. */
function Segments({ progress }: { progress: ChapterProgress }) {
  const t = useTranslations('tour')
  return (
    <div
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={TOUR_CHAPTERS.length}
      aria-valuenow={progress.chapter + 1}
      aria-label={t('progressAria', {
        n: progress.chapter + 1,
        total: TOUR_CHAPTERS.length,
        step: progress.step,
        steps: progress.steps,
      })}
      className="mt-0.5 flex gap-[3px]"
    >
      {TOUR_CHAPTERS.map((chapter, k) => (
        <span key={chapter} className="h-1 flex-1 overflow-hidden rounded-sm bg-[#24201A]/[0.14]">
          <span
            className="block h-full rounded-sm bg-gold-strong"
            style={{
              width: `${k < progress.chapter ? 100 : k > progress.chapter ? 0 : Math.round((progress.step / progress.steps) * 100)}%`,
            }}
          />
        </span>
      ))}
    </div>
  )
}

const NEXT_BUTTON =
  'flex h-[46px] flex-1 items-center justify-center gap-1 rounded-[14px] bg-amber-500 text-[15px] font-bold text-[#24201A] shadow-[0_10px_22px_-12px_rgba(184,134,47,0.9)] transition-colors hover:bg-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#24201A] active:scale-[0.98]'
const QUIET_BUTTON =
  'flex h-[46px] items-center justify-center gap-1 rounded-[14px] border border-[#24201A]/20 text-sm font-semibold text-[#4A443A] transition-colors hover:bg-[#24201A]/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#24201A]'

export type TourBubbleProps = {
  /** Rang du chapitre et de l'étape ; absent : ni pastille ni progression (dernier rappel, après le tuto). */
  progress?: ChapterProgress
  title: string
  body: string
  /** Rappel sous le texte quand « Suivant » ne peut pas encore avancer. */
  nudge?: string | null
  hint?: string | null
  nextLabel?: string
  onNext: () => void
  /** Absent : pas de bouton « Retour ». */
  onBack?: () => void
  backDisabled?: boolean
  /** Absent : pas de « Passer le tuto » (dernier rappel). */
  onSkip?: () => void
  box: Box | null
  dock: Dock
  viewport: { width: number; height: number }
  frame?: Box
  onHeight: (height: number) => void
}

/**
 * La bulle d'une étape : chapitre, progression, « Passer le tuto », titre,
 * texte, « Retour » et « Suivant ». Amarrée en bas de l'écran, ou en haut
 * quand l'élément visé est en bas — jamais dessus.
 */
export function TourBubble({
  progress,
  title,
  body,
  nudge,
  hint,
  nextLabel,
  onNext,
  onBack,
  backDisabled,
  onSkip,
  box,
  dock,
  viewport,
  frame,
  onHeight,
}: TourBubbleProps) {
  const t = useTranslations('tour')
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    onHeight(el.offsetHeight)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => onHeight(el.offsetHeight))
    observer.observe(el)
    return () => observer.disconnect()
  }, [onHeight])

  const area = frame ?? { top: 0, left: 0, width: viewport.width, height: viewport.height }
  const wide = area.width >= 640
  const width = wide ? 380 : area.width - EDGE * 2
  const center = box ? box.left + box.width / 2 : area.left + area.width / 2
  const left = wide
    ? Math.min(Math.max(center - width / 2, area.left + EDGE), area.left + area.width - width - EDGE)
    : area.left + EDGE

  const height = ref.current?.offsetHeight ?? 0
  const bubbleTop = dock === 'bottom' ? area.top + area.height - EDGE - height : area.top + EDGE
  const gap = box
    ? dock === 'bottom'
      ? bubbleTop - (box.top + box.height + PAD)
      : box.top - PAD - (bubbleTop + height)
    : Infinity
  const arrow = box && height > 0 && gap >= 4 && gap <= 64
  const arrowLeft = Math.min(Math.max(center - left, 24), width - 24)

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={t('dialogLabel')}
      aria-live="polite"
      className="pointer-events-auto fixed select-text rounded-[18px] border border-[#D8CCAE] bg-cream px-3.5 pb-3 pt-2.5 text-left text-[#24201A] shadow-[0_0_0_1px_rgba(217,164,65,0.55),0_20px_44px_-14px_rgba(0,0,0,0.85)]"
      style={{
        left,
        width,
        ...(dock === 'bottom'
          ? { bottom: `max(${viewport.height - (area.top + area.height) + EDGE}px, env(safe-area-inset-bottom))` }
          : { top: `max(${area.top + EDGE}px, env(safe-area-inset-top))` }),
      }}
    >
      {arrow && (
        <span
          aria-hidden
          className={cn(
            'absolute h-3.5 w-3.5 -translate-x-1/2 rotate-45 border-[#D8CCAE] bg-cream',
            dock === 'bottom' ? '-top-2 border-l border-t' : '-bottom-2 border-b border-r'
          )}
          style={{ left: arrowLeft }}
        />
      )}
      {(progress || onSkip) && (
        <div className="flex min-h-[36px] items-center justify-between gap-2">
          {progress ? (
            <span className="min-w-0 truncate rounded-full border border-[#24201A]/[0.14] bg-[#24201A]/5 px-2 py-0.5 font-display text-xs font-bold text-[#4A443A]">
              {t('chapterLabel', {
                n: progress.chapter + 1,
                total: TOUR_CHAPTERS.length,
                name: t(`chapters.${TOUR_CHAPTERS[progress.chapter]}`),
              })}
            </span>
          ) : (
            <span />
          )}
          {onSkip && <SkipLink onClick={onSkip} />}
        </div>
      )}
      {progress && <Segments progress={progress} />}
      <h3 className="mt-2.5 font-display text-lg font-bold leading-tight">{title}</h3>
      <p className="mt-1 text-[14.5px] leading-snug text-[#4A443A]">{body}</p>
      {nudge && (
        <p role="status" className="mt-1.5 text-sm font-semibold text-suit-red">
          {nudge}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            disabled={backDisabled}
            className={cn(QUIET_BUTTON, 'shrink-0 bg-[#24201A]/5 pl-2.5 pr-3.5 disabled:opacity-40')}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            {t('back')}
          </button>
        )}
        <button type="button" onClick={onNext} className={NEXT_BUTTON}>
          {nextLabel ?? t('next')}
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {hint && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-[#6B6455]">
          <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded border-2 border-gold-strong" />
          {hint}
        </p>
      )}
    </div>
  )
}

export function SkipLink({ onClick, className }: { onClick: () => void; className?: string }) {
  const t = useTranslations('tour')
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        '-my-1 -mr-2 flex min-h-[44px] shrink-0 items-center gap-1 rounded-lg px-2 text-[13px] font-semibold text-[#6B6455] underline underline-offset-[3px] transition-colors hover:text-[#24201A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#24201A]',
        className
      )}
    >
      {t('skip')}
      <SkipForward className="h-3.5 w-3.5" aria-hidden />
    </button>
  )
}

export type TourModalAction = { label: string; onClick: () => void; primary?: boolean; withArrow?: boolean }

/** Carte centrée : accueil, pause à mi-chemin, fin, confirmation de « Passer le tuto ». */
export function TourModal({
  kicker,
  title,
  body,
  items,
  note,
  actions,
  onSkip,
  mark = false,
}: {
  kicker: string
  title: string
  body?: string
  /** Liste cochée (écran de fin). */
  items?: string[]
  note?: string
  actions: TourModalAction[]
  onSkip?: () => void
  /** Le monogramme de la marque en tête (accueil). */
  mark?: boolean
}) {
  const primary = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    primary.current?.focus({ preventScroll: true })
  }, [title])

  return (
    <div className="pointer-events-auto fixed inset-0 flex items-center justify-center bg-[rgba(3,14,10,0.62)] p-3">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-[360px] select-text rounded-[18px] border border-[#D8CCAE] bg-cream px-[18px] pb-4 pt-[18px] text-center text-[#24201A] shadow-[0_0_0_1px_rgba(217,164,65,0.55),0_20px_44px_-14px_rgba(0,0,0,0.85)]"
      >
        {onSkip && <SkipLink onClick={onSkip} className="absolute right-3 top-2" />}
        {mark && (
          <div className="mx-auto mb-2 h-14 w-14">
            <BrandMark />
          </div>
        )}
        <p className={cn('font-display text-[11px] font-semibold uppercase tracking-[0.26em] text-gold-strong', onSkip && 'mt-6')}>
          {kicker}
        </p>
        <h3 className="mt-1.5 font-display text-[23px] font-bold leading-tight" style={{ textWrap: 'balance' }}>
          {title}
        </h3>
        {body && <p className="mt-2 text-[15px] leading-snug text-[#4A443A]">{body}</p>}
        {items && (
          <ul className="mt-3 grid gap-1.5 text-left">
            {items.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm leading-snug text-[#4A443A]">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex flex-col gap-2">
          {actions.map((action, k) => (
            <button
              key={action.label}
              ref={k === 0 ? primary : undefined}
              type="button"
              onClick={action.onClick}
              className={cn(action.primary ? NEXT_BUTTON : QUIET_BUTTON, 'h-[50px] w-full flex-none')}
            >
              {action.label}
              {action.withArrow && <ChevronRight className="h-4 w-4" aria-hidden />}
            </button>
          ))}
        </div>
        {note && <p className="mt-2.5 text-[12.5px] leading-snug text-[#6B6455]">{note}</p>}
      </div>
    </div>
  )
}

/** Conteneur du tuto : au-dessus de tout le site, sans capter ce que ses enfants ne captent pas. */
export function TourStage({ children }: { children: ReactNode }) {
  return <div className="pointer-events-none fixed inset-0 z-[130] font-sans">{children}</div>
}
