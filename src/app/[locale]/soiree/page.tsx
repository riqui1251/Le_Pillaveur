"use client"

import { Suspense } from 'react'
import { SoireeApp } from '@/components/soiree/SoireeApp'

/** useSearchParams (nombre de joueurs, bande) réclame sa frontière Suspense, sans quoi le build statique échoue. */
export default function SoireePage() {
  return (
    <Suspense fallback={null}>
      <SoireeApp />
    </Suspense>
  )
}
