import type { DilCard } from '../engine'

export type DilTone = 'soft' | 'apero' | 'coquin'
export type DilContentCard = DilCard & { tone: DilTone }
