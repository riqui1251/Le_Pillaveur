"use client"

import type { ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useTvRoom } from '@/hooks/useTvRoom'
import type { EngineState } from '@/lib/petit-buveur/engine'
import type { TCClientView } from '@/lib/toucher-coule/engine'
import type { CastState, PlinkoCastFrame, PmuCastFrame } from '@/lib/cast-types'
import { TvStage } from './TvStage'
import { TvLobby } from './TvLobby'
import { TvPetitBuveur } from './TvPetitBuveur'
import { TvToucherCoule } from './TvToucherCoule'
import { TvVictory } from './TvVictory'
import { TvPlinko } from './TvPlinko'
import { TvPmu } from './TvPmu'

const GAME_TITLES: Record<string, string> = {
  'petit-buveur': 'Le Petit Buveur',
  'toucher-coule': 'Toucher-Coulé',
}

type ParsedState = (Record<string, unknown> & { phase?: string; winner?: unknown }) | null

function parseState(json: string | null): ParsedState {
  if (!json) return null
  try {
    return JSON.parse(json) as ParsedState
  } catch {
    return null
  }
}

function isFinished(state: ParsedState): boolean {
  if (!state) return false
  return state.phase === 'finished' || Boolean(state.winner)
}

/** Orchestrateur TV : lit la salle par code et affiche l'écran adapté (lobby / jeu / victoire). */
export function TvRoomView({ code }: { code: string }) {
  const t = useTranslations('tv')
  const locale = useLocale()
  const normalized = code.toUpperCase()
  const { room, notFound, frame } = useTvRoom(normalized)

  if (notFound) {
    return (
      <TvStage title={t('brand')} code={normalized}>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-5xl font-black text-white/70">{t('notFound')}</p>
          <p className="text-white/40">{t('notFoundHint')}</p>
        </div>
      </TvStage>
    )
  }

  if (!room) {
    return (
      <TvStage title={t('brand')} code={normalized}>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-3xl text-white/50">{t('loading')}</p>
        </div>
      </TvStage>
    )
  }

  // Salle de CAST (jeu LOCAL diffusé) : rendu par castKind, aucune notion de join.
  if (room.status === 'cast') {
    const castState = parseState(room.gameStateJson) as unknown as CastState | null
    const castTitle =
      castState?.castKind === 'plinko'
        ? 'Plinko'
        : castState?.castKind === 'pmu'
          ? 'Course PMU'
          : castState?.castKind === 'petit-buveur'
            ? 'Le Petit Buveur'
            : t('brand')
    return (
      <TvStage title={castTitle} code={room.code}>
        {castState?.castKind === 'plinko' ? (
          <TvPlinko state={castState} frame={frame as PlinkoCastFrame | null} />
        ) : castState?.castKind === 'pmu' ? (
          <TvPmu state={castState} frame={frame as PmuCastFrame | null} />
        ) : castState?.castKind === 'petit-buveur' ? (
          castState.winner ? (
            <TvVictory room={room} gameId="petit-buveur" state={castState as unknown as EngineState} />
          ) : (
            <TvPetitBuveur room={room} state={castState as unknown as EngineState} />
          )
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-3xl text-white/50">{t('loading')}</p>
          </div>
        )}
      </TvStage>
    )
  }

  const title = (room.gameId && GAME_TITLES[room.gameId]) || t('brand')
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const joinUrl = `${origin}/${locale}/jeux?join=${room.code}`
  const state = parseState(room.gameStateJson)
  const finished = isFinished(state)

  let content: ReactNode
  if (room.status === 'waiting' || !state) {
    content = <TvLobby room={room} joinUrl={joinUrl} />
  } else if (finished) {
    content = <TvVictory room={room} gameId={room.gameId ?? ''} state={state as unknown as EngineState | TCClientView} />
  } else if (room.gameId === 'petit-buveur') {
    content = <TvPetitBuveur room={room} state={state as unknown as EngineState} />
  } else if (room.gameId === 'toucher-coule') {
    content = <TvToucherCoule room={room} state={state as unknown as TCClientView} />
  } else {
    content = <TvLobby room={room} joinUrl={joinUrl} />
  }

  // QR persistant en en-tête pendant le jeu ; en lobby, c'est le grand QR central qui sert.
  const headerJoinUrl = room.status !== 'waiting' && !finished ? joinUrl : undefined

  return (
    <TvStage title={title} code={room.code} joinUrl={headerJoinUrl}>
      {content}
    </TvStage>
  )
}
