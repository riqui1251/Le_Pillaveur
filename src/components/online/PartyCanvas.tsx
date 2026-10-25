"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Eraser, Trash2, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useConfirmAction } from '@/components/game/ConfirmActionDialog'
import { cn } from '@/lib/utils'
import { compactStroke } from '@/lib/crobard/simplify'

/**
 * Canvas de dessin partagé (Crobard, Téléphone Dessiné). Rendu « par traits
 * complets » : le dessinateur voit son propre trait en local INSTANTANÉMENT
 * (aucun réseau requis pendant le tracé) ; un trait terminé (`pointerup`)
 * est remonté via `onStrokeComplete` comme UNE action — le serveur fait
 * autorité, les autres le voient au prochain refresh (poll/SSE).
 *
 * Coordonnées des points NORMALISÉES [0,1] (indépendantes de la résolution)
 * pour rester cohérentes entre l'écran du dessinateur et celui des autres
 * (mobile, TV…). Le trait EN COURS est dessiné brut, point par point ; le
 * trait TERMINÉ part simplifié et arrondi (cf. lib/crobard/simplify.ts) :
 * c'est lui qui est réécrit dans l'état de la salle et retéléchargé par
 * chaque téléphone à chaque nouveau trait.
 *
 * Outils : sous la toile par défaut. Un jeu qui veut les poser dans sa barre
 * fixe du bas (zone du pouce) pilote l'outil avec `usePartyCanvasTool()`, le
 * passe en `tool` et rend lui-même `<PartyCanvasTools>`.
 */

export type Stroke = {
  /** [x0, y0, x1, y1, …] normalisés [0,1]. */
  points: number[]
  color: string
  width: number
}

/**
 * Couleur de fond du canvas — un trait de cette couleur agit comme une gomme.
 * Crème de la carte : le blanc froid #f8fafc éblouissait dans une pièce sombre.
 */
const BG_COLOR = '#F3EAD3'
/** Gomme des dessins tracés avant le passage au crème : repeinte en fond actuel. */
const LEGACY_ERASER = '#f8fafc'
/** Encres lisibles sur le crème (≥ 4:1), du thème quand il en a une. */
const COLORS = [
  { id: 'ink', hex: '#24201A' },
  { id: 'red', hex: '#B3382E' },
  { id: 'blue', hex: '#274B8F' },
  { id: 'green', hex: '#2E7D32' },
  { id: 'orange', hex: '#C2410C' },
  { id: 'purple', hex: '#7E22CE' },
] as const
const WIDTHS = [
  { id: 'thin', px: 3 },
  { id: 'medium', px: 6 },
  { id: 'thick', px: 12 },
] as const

/**
 * Traits prêts à peindre. Ce qui arrive du serveur n'est pas toujours un
 * trait propre (état écrit avant l'assainissement serveur, état abîmé) : un
 * trait sans couleur faisait lever `toLowerCase` dans l'effet de rendu, et
 * tout l'écran — maillon reçu, révélation, TV — tombait sur la page d'erreur.
 * Les traits inexploitables sont écartés, la gomme d'avant le crème repeinte
 * en fond actuel.
 */
export function drawableStrokes(raw: unknown): Stroke[] {
  if (!Array.isArray(raw)) return []
  const out: Stroke[] = []
  for (const item of raw) {
    const s = item as Partial<Stroke> | null
    if (!s || !Array.isArray(s.points)) continue
    const points: number[] = []
    for (let i = 0; i + 1 < s.points.length; i += 2) {
      const x: unknown = s.points[i]
      const y: unknown = s.points[i + 1]
      if (typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y)) {
        points.push(x, y)
      }
    }
    if (points.length < 4) continue
    const color = typeof s.color === 'string' ? s.color : COLORS[0].hex
    const width =
      typeof s.width === 'number' && Number.isFinite(s.width) ? Math.min(24, Math.max(1, s.width)) : WIDTHS[1].px
    out.push({ points, color: color.toLowerCase() === LEGACY_ERASER ? BG_COLOR : color, width })
  }
  return out
}

export type PartyCanvasTool = {
  color: string
  width: number
  setColor: (color: string) => void
  setWidth: (width: number) => void
}

/** Couleur et épaisseur du pinceau, partagées entre la toile et sa barre d'outils. */
export function usePartyCanvasTool(): PartyCanvasTool {
  const [color, setColor] = useState<string>(COLORS[0].hex)
  const [width, setWidth] = useState<number>(WIDTHS[1].px)
  return { color, width, setColor, setWidth }
}

export function PartyCanvas({
  strokes,
  readOnly,
  onStrokeComplete,
  onClear,
  onUndo,
  tool: controlledTool,
  className,
}: {
  strokes: Stroke[]
  /** true pour les devineurs / la TV — lecture seule, aucune interaction. */
  readOnly: boolean
  onStrokeComplete?: (stroke: Stroke) => void
  /** Vide la toile (demandé après confirmation). */
  onClear?: () => void
  /** Retire le dernier trait. Absent : pas de bouton « Annuler ». */
  onUndo?: () => void
  /**
   * Outil piloté par le jeu (`usePartyCanvasTool`), qui rend alors lui-même
   * `<PartyCanvasTools>` où il veut. Absent : outils sous la toile.
   */
  tool?: PartyCanvasTool
  className?: string
}) {
  const ownTool = usePartyCanvasTool()
  const tool = controlledTool ?? ownTool
  const { color, width } = tool
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const drawingRef = useRef<number[] | null>(null)
  const paintable = useMemo(() => drawableStrokes(strokes), [strokes])

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = BG_COLOR
    ctx.fillRect(0, 0, w, h)

    const drawStroke = (points: number[], strokeColor: string, strokeWidth: number) => {
      if (points.length < 4) return
      ctx.strokeStyle = strokeColor
      ctx.lineWidth = strokeWidth * (w / 600)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(points[0] * w, points[1] * h)
      for (let i = 2; i < points.length; i += 2) {
        ctx.lineTo(points[i] * w, points[i + 1] * h)
      }
      ctx.stroke()
    }

    for (const s of paintable) drawStroke(s.points, s.color, s.width)
    if (drawingRef.current) drawStroke(drawingRef.current, color, width)
  }, [paintable, color, width])

  // Le redimensionnement appelle le DERNIER redraw : celui capturé au montage
  // repeignait les traits du montage, et un canvas élargi (barre de défilement
  // qui apparaît, rotation) perdait le dessin jusqu'au trait suivant.
  const redrawRef = useRef(redraw)
  redrawRef.current = redraw

  useEffect(() => {
    redraw()
  }, [redraw])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const resize = () => {
      const rect = container.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.max(1, Math.round(rect.width * dpr))
      canvas.height = Math.max(1, Math.round(rect.height * dpr))
      redrawRef.current()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const y = (e.clientY - rect.top) / rect.height
    return [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))]
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const [x, y] = pointFromEvent(e)
    drawingRef.current = [x, y]
    redraw()
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (readOnly || !drawingRef.current) return
    const [x, y] = pointFromEvent(e)
    drawingRef.current.push(x, y)
    redraw()
  }

  const handlePointerUp = () => {
    if (readOnly || !drawingRef.current) return
    const points = drawingRef.current
    drawingRef.current = null
    // Simplifié + arrondi ICI et pas au fil du tracé : le doigt en cours
    // garde sa fluidité, et seul ce qui part sur le réseau est allégé (un
    // trait de 300 points bruts pèse ~10 Ko, ~300 octets une fois compacté).
    // Le premier et le dernier point sont toujours gardés : un trait de
    // 2 points le reste, le seuil d'envoi ne change pas.
    if (points.length >= 4) onStrokeComplete?.({ points: compactStroke(points), color, width })
    redraw()
  }

  return (
    <div className={className}>
      {/* touch-none seulement pour qui dessine : en lecture seule, la toile
          occupe la moitié de l'écran et un glissé dessus doit faire défiler. */}
      <div
        ref={containerRef}
        className={cn(
          'relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-gold/30 bg-cream shadow-inner',
          !readOnly && 'touch-none'
        )}
      >
        <canvas
          ref={canvasRef}
          className={cn('h-full w-full', !readOnly && 'cursor-crosshair touch-none')}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
      </div>
      {!readOnly && !controlledTool && (
        <PartyCanvasTools
          tool={tool}
          hasStrokes={paintable.length > 0}
          onClear={onClear}
          onUndo={onUndo}
          className="mt-3"
        />
      )}
    </div>
  )
}

/** Pastille de couleur : 40 px dessinés, 44 px au doigt (`touch-target`). */
const SWATCH =
  'touch-target flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-cream/40 transition-transform motion-reduce:transition-none'
/** Sélection : anneau d'or décalé (une forme, pas seulement une couleur) + léger grossissement. */
const SWATCH_ON = 'scale-110 ring-[3px] ring-gold ring-offset-2 ring-offset-felt-deep'

/**
 * Barre d'outils du dessinateur, en deux rangées pour tenir à 375 px :
 * gomme + 6 encres, puis épaisseurs, « Annuler » (dernier trait) et
 * « Tout effacer ». Tout effacer passe par une confirmation : posé à côté de
 * la grosse épaisseur, un toucher raté vidait le dessin (chez tous les
 * devineurs au Crobard) sans aucun retour possible.
 */
export function PartyCanvasTools({
  tool,
  hasStrokes,
  onClear,
  onUndo,
  className,
}: {
  tool: PartyCanvasTool
  /** Au moins un trait sur la toile : sans trait, Annuler et Tout effacer s'éteignent. */
  hasStrokes: boolean
  onClear?: () => void
  onUndo?: () => void
  className?: string
}) {
  const t = useTranslations('partyCanvas')
  const [confirmDialog, confirm] = useConfirmAction()

  const askClear = async () => {
    if (!onClear || !hasStrokes) return
    const ok = await confirm({
      title: t('clearConfirm.title'),
      description: t('clearConfirm.description'),
      confirmLabel: t('clearConfirm.confirm'),
      cancelLabel: t('clearConfirm.cancel'),
      tone: 'danger',
    })
    if (ok) onClear()
  }

  const eraserOn = tool.color === BG_COLOR

  return (
    <div role="group" aria-label={t('toolsLabel')} className={className}>
      {confirmDialog}
      <div role="group" aria-label={t('colorsLabel')} className="flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={() => tool.setColor(BG_COLOR)}
          aria-label={t('eraser')}
          aria-pressed={eraserOn}
          title={t('eraser')}
          className={cn(SWATCH, 'bg-cream text-[#24201A]', eraserOn && SWATCH_ON)}
        >
          <Eraser className="h-5 w-5" aria-hidden />
        </button>
        {COLORS.map(({ id, hex }) => {
          const on = tool.color === hex
          return (
            <button
              key={id}
              type="button"
              onClick={() => tool.setColor(hex)}
              aria-label={t(`colors.${id}`)}
              aria-pressed={on}
              title={t(`colors.${id}`)}
              className={cn(SWATCH, on && SWATCH_ON)}
              style={{ backgroundColor: hex }}
            >
              {on && <Check className="h-5 w-5 text-cream" strokeWidth={3} aria-hidden />}
            </button>
          )
        })}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div role="group" aria-label={t('widthsLabel')} className="flex shrink-0 gap-2">
          {WIDTHS.map(({ id, px }) => {
            const on = tool.width === px
            return (
              <button
                key={id}
                type="button"
                onClick={() => tool.setWidth(px)}
                aria-label={t(`widths.${id}`)}
                aria-pressed={on}
                title={t(`widths.${id}`)}
                className={cn(
                  'flex h-12 w-12 items-center justify-center rounded-2xl border-2 transition-colors',
                  on ? 'border-gold bg-gold/20' : 'border-cream/[0.25] bg-black/20 hover:bg-black/30'
                )}
              >
                <span className="rounded-full bg-cream" style={{ width: px + 4, height: px + 4 }} />
              </button>
            )
          })}
        </div>
        {onUndo && (
          <Button
            type="button"
            variant="quiet"
            size="game"
            onClick={onUndo}
            disabled={!hasStrokes}
            aria-label={t('undoLabel')}
            className="min-w-0 flex-1 gap-1.5 px-3"
          >
            <Undo2 className="h-5 w-5 shrink-0" aria-hidden />
            <span className="truncate">{t('undo')}</span>
          </Button>
        )}
        {onClear && (
          <Button
            type="button"
            variant="quiet"
            size="game"
            onClick={() => void askClear()}
            disabled={!hasStrokes}
            aria-label={t('clear')}
            title={t('clear')}
            className={cn(
              'gap-1.5 border-red-400/40 text-red-300 hover:bg-suit-red/20 hover:text-red-300',
              onUndo ? 'w-12 shrink-0 px-0' : 'min-w-0 flex-1 px-3'
            )}
          >
            <Trash2 className="h-5 w-5 shrink-0" aria-hidden />
            {!onUndo && <span className="truncate">{t('clear')}</span>}
          </Button>
        )}
      </div>
    </div>
  )
}
