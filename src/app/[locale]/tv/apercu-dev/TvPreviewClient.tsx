"use client"

import { useEffect, useState } from 'react'
import { TvRoomScreen } from '@/components/tv/TvRoomScreen'
import type { TvPreviewFixture } from './fixture-kit'

/** Rejoue une fixture : ← / → (ou PageUp / PageDown) passe d'une étape à l'autre, comme des états poussés par le serveur. */
export function TvPreviewClient({
  fixture,
  initialStep,
  chrome,
}: {
  fixture: TvPreviewFixture
  initialStep: number
  chrome: boolean
}) {
  const last = Math.max(0, fixture.steps.length - 1)
  const [step, setStep] = useState(Math.min(Math.max(0, initialStep), last))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') setStep((s) => Math.min(last, s + 1))
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') setStep((s) => Math.max(0, s - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [last])

  // Comme la vraie TV, qui ne lit la salle qu'une fois montée : rendue côté
  // serveur, l'URL du QR (origine du navigateur) ne correspondrait pas.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const current = fixture.steps[step]
  if (!current || !mounted) return null

  return (
    <>
      <TvRoomScreen
        code={current.room?.code ?? 'APERCU'}
        room={current.room}
        notFound={Boolean(current.notFound)}
        frame={current.frame ?? null}
      />
      {chrome && (
        <div
          data-tv-preview-step={step}
          className="pointer-events-none fixed bottom-2 left-2 z-[100] rounded-md bg-black/80 px-2 py-1 font-mono text-[12px] text-white"
        >
          {fixture.label} · {step + 1}/{fixture.steps.length} · {current.label} · ← →
        </div>
      )}
    </>
  )
}
