"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Eraser } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Canvas de dessin partagé (Crobard, Téléphone Dessiné). Rendu « par traits
 * complets » : le dessinateur voit son propre trait en local INSTANTANÉMENT
 * (aucun réseau requis pendant le tracé) ; un trait terminé (`pointerup`)
 * est remonté via `onStrokeComplete` comme UNE action — le serveur fait
 * autorité, les autres le voient au prochain refresh (poll/SSE).
 *
 * Coordonnées des points NORMALISÉES [0,1] (indépendantes de la résolution)
 * pour rester cohérentes entre l'écran du dessinateur et celui des autres
 * (mobile, TV…).
 */

export type Stroke = {
  /** [x0, y0, x1, y1, …] normalisés [0,1]. */
  points: number[]
  color: string
  width: number
}

/** Couleur de fond du canvas — un trait de cette couleur agit comme une gomme. */
const BG_COLOR = '#f8fafc'
const COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#020617']
const WIDTHS = [3, 6, 12] as const

export function PartyCanvas({
  strokes,
  readOnly,
  onStrokeComplete,
  onClear,
  className,
}: {
  strokes: Stroke[]
  /** true pour les devineurs / la TV — lecture seule, aucune interaction. */
  readOnly: boolean
  onStrokeComplete?: (stroke: Stroke) => void
  onClear?: () => void
  className?: string
}) {
  const t = useTranslations('partyCanvas')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [color, setColor] = useState<string>(COLORS[COLORS.length - 1])
  const [width, setWidth] = useState<number>(WIDTHS[1])
  const drawingRef = useRef<number[] | null>(null)

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

    for (const s of strokes) drawStroke(s.points, s.color, s.width)
    if (drawingRef.current) drawStroke(drawingRef.current, color, width)
  }, [strokes, color, width])

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
      redraw()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(container)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (points.length >= 4) onStrokeComplete?.({ points, color, width })
    redraw()
  }

  return (
    <div className={className}>
      <div
        ref={containerRef}
        className="relative aspect-[4/3] w-full touch-none overflow-hidden rounded-2xl border border-white/10 bg-white shadow-inner"
      >
        <canvas
          ref={canvasRef}
          className="h-full w-full touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      </div>
      {!readOnly && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setColor(BG_COLOR)}
              aria-label={t('eraser')}
              title={t('eraser')}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full border-2 bg-white transition-transform',
                color === BG_COLOR ? 'scale-110 border-emerald-400' : 'border-white/20'
              )}
            >
              <Eraser className="h-3.5 w-3.5 text-slate-500" />
            </button>
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={c}
                className={cn(
                  'h-7 w-7 rounded-full border-2 transition-transform',
                  color === c ? 'scale-110 border-emerald-400' : 'border-white/20'
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            {WIDTHS.map((wd) => (
              <button
                key={wd}
                type="button"
                onClick={() => setWidth(wd)}
                aria-label={`${wd}px`}
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full border',
                  width === wd ? 'border-emerald-400 bg-emerald-500/10' : 'border-white/20'
                )}
              >
                <span
                  className="rounded-full bg-white"
                  style={{ width: Math.min(16, wd + 2), height: Math.min(16, wd + 2) }}
                />
              </button>
            ))}
            <button
              type="button"
              onClick={onClear}
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/10"
            >
              {t('clear')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
