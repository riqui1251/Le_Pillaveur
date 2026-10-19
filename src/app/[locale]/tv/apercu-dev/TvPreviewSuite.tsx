"use client"

import { useEffect, useState } from 'react'
import type { TvPreviewFixture } from './fixture-kit'
import { TvPreviewClient } from './TvPreviewClient'

declare global {
  interface Window {
    __tvSuite?: { ids: string[]; steps: number[]; show: (index: number) => void }
  }
}

/** Toutes les fixtures d'un jeu dans une seule page : `window.__tvSuite.show(i)` passe de l'une à l'autre (contrôles automatisés). */
export function TvPreviewSuite({ fixtures }: { fixtures: TvPreviewFixture[] }) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    window.__tvSuite = {
      ids: fixtures.map((f) => f.id),
      steps: fixtures.map((f) => f.steps.length),
      show: (i) => setIndex(Math.min(Math.max(0, i), fixtures.length - 1)),
    }
    return () => {
      delete window.__tvSuite
    }
  }, [fixtures])

  const fixture = fixtures[index]
  if (!fixture) return null
  return <TvPreviewClient key={fixture.id} fixture={fixture} initialStep={0} chrome />
}
