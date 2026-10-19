"use client"

import { type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import type { TvRoomDto } from '@/lib/online-room'
import type { EngineState } from '@/lib/petit-buveur/engine'
import type { TCClientView } from '@/lib/toucher-coule/engine'
import type { CastFrame, CastState, PlinkoCastFrame, PmuCastFrame } from '@/lib/cast-types'
import { TvStage } from './TvStage'
import { TvLobby } from './TvLobby'
import { TvPetitBuveur, TvPetitBuveurCast } from './TvPetitBuveur'
import { TvToucherCoule } from './TvToucherCoule'
import { TvQuiz } from './TvQuiz'
import type { QuizClientView } from '@/lib/quiz/engine'
import { TvMenteur } from './TvMenteur'
import type { MenteurClientView } from '@/lib/menteur/engine'
import { TvImposteur } from './TvImposteur'
import type { ImposteurClientView } from '@/lib/imposteur/engine'
import { TvLoupGarou } from './TvLoupGarou'
import type { LGClientView } from '@/lib/loup-garou/engine'
import { TvVictory } from './TvVictory'
import { TvPlinko } from './TvPlinko'
import { TvPmu } from './TvPmu'
import { TvGame1220 } from './TvGame1220'
import type { Game1220SyncedState } from '@/lib/online-game-state'
import { TvPurple } from './TvPurple'
import type { PurpleSyncedState } from '@/lib/online-game-state'
import { TvBluff } from './TvBluff'
import type { BluffClientView } from '@/lib/bluff/engine'
import { TvEspion } from './TvEspion'
import type { EspionClientView } from '@/lib/espion/engine'
import { TvTabou } from './TvTabou'
import type { TabouClientView } from '@/lib/tabou/engine'
import { TvCrobard } from './TvCrobard'
import type { CrobardClientView } from '@/lib/crobard/engine'
import { TvTelephoneDessine } from './TvTelephoneDessine'
import type { TelephoneClientView } from '@/lib/telephone-dessine/engine'
import { TvSansFiltre } from './TvSansFiltre'
import type { SFClientView } from '@/lib/sans-filtre/engine'
import { TvMotsCodes } from './TvMotsCodes'
import type { MCClientView } from '@/lib/mots-codes/engine'
import { TvDilemmes } from './TvDilemmes'
import type { DilClientView } from '@/lib/dilemmes/engine'
import { TvPetitBac } from './TvPetitBac'
import type { PbcClientView } from '@/lib/petit-bac/engine'
import { TvPresident } from './TvPresident'
import type { PreClientView } from '@/lib/president/engine'

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

type TutorialStep = { title: string; body: string }

/** Les étapes du tuto que chaque téléphone fait défiler pendant le briefing (même source que GameBriefing). */
function TvBriefingSteps({ gameId }: { gameId: string }) {
  const tTutorial = useTranslations(`games.${gameId}.tutorial`)
  let steps: TutorialStep[] = []
  if (tTutorial.has('steps')) {
    const raw = tTutorial.raw('steps') as unknown
    if (Array.isArray(raw)) steps = raw as TutorialStep[]
  }
  if (steps.length === 0) return null
  return (
    <ol
      className="grid min-h-0 gap-5"
      style={{ gridTemplateColumns: `repeat(${Math.min(steps.length, 4)}, minmax(0, 1fr))` }}
    >
      {steps.slice(0, 4).map((step, i) => (
        <li
          key={i}
          className="flex min-w-0 flex-col rounded-3xl border border-[#D8CCAE] bg-cream p-5 text-[#24201A] shadow-[0_14px_30px_-14px_rgba(0,0,0,0.7)]"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold text-2xl font-black text-felt-deep">
              {i + 1}
            </span>
            <p className="min-w-0 font-display text-2xl font-bold leading-tight">{step.title}</p>
          </div>
          <p className="mt-3 text-xl leading-snug text-[#4A443A]">{step.body}</p>
        </li>
      ))}
    </ol>
  )
}

/**
 * Briefing : la partie est lancée, chacun lit les règles sur son téléphone.
 * La télé montre les mêmes règles en grand, pour la table entière ; qui a
 * fini de lire et le décompte des 90 s ne lui parviennent pas (absents du DTO TV).
 */
function TvBriefing({ gameId, playerCount }: { gameId: string | null; playerCount: number }) {
  const t = useTranslations('tv')
  const tBriefing = useTranslations('briefing')
  const tLobby = useTranslations('onlineLobby')
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center gap-6 px-10 py-5">
      <div className="text-center">
        <p className="text-xl font-bold uppercase tracking-[0.3em] text-gold/90">{tBriefing('title')}</p>
        <p className="mt-1 text-5xl font-black text-cream">{t('starting')}</p>
        <p className="mt-2 text-2xl text-white/80">
          {t('startingHint')} · {tLobby('playersCount', { count: playerCount })}
        </p>
      </div>
      {gameId && <TvBriefingSteps gameId={gameId} />}
    </div>
  )
}

/**
 * Rendu TV d'une salle déjà lue (lobby / jeu / victoire), sans réseau : le
 * flux vit dans TvRoomView, l'aperçu de développement y branche des états figés.
 */
export function TvRoomScreen({
  code,
  room,
  notFound,
  frame,
}: {
  code: string
  room: TvRoomDto | null
  notFound: boolean
  frame: CastFrame | null
}) {
  const t = useTranslations('tv')
  const tCatalog = useTranslations('games.catalog')
  const gameTitle = (id: string | null | undefined) =>
    id && tCatalog.has(`${id}.title`) ? tCatalog(`${id}.title`) : t('brand')
  const normalized = code.toUpperCase()

  if (notFound) {
    return (
      <TvStage title={t('brand')} code={normalized}>
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-10 text-center">
          <p className="text-7xl font-black text-cream">{t('notFound')}</p>
          <p className="text-3xl text-white/80">{t('notFoundHint')}</p>
          {/* Sans issue, cet écran était un cul-de-sac : sur une télé, il n'y
              a ni barre d'adresse ni bouton « retour » à portée de main. */}
          <Link
            href="/tv"
            className="mt-2 rounded-2xl border border-gold/50 bg-gold/[0.15] px-10 py-4 text-3xl font-bold text-gold transition-colors hover:bg-gold/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            {t('changeCode')}
          </Link>
        </div>
      </TvStage>
    )
  }

  if (!room) {
    return (
      <TvStage title={t('brand')} code={normalized}>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-5xl font-black text-white/80">{t('loading')}</p>
        </div>
      </TvStage>
    )
  }

  // Salle de CAST (jeu LOCAL diffusé) : rendu par castKind, aucune notion de join.
  if (room.status === 'cast') {
    const castState = parseState(room.gameStateJson) as unknown as CastState | null
    const castTitle = gameTitle(castState?.castKind)
    return (
      <TvStage title={castTitle} code={room.code}>
        {castState?.castKind === 'plinko' ? (
          <TvPlinko state={castState} frame={frame as PlinkoCastFrame | null} />
        ) : castState?.castKind === 'pmu' ? (
          <TvPmu state={castState} frame={frame as PmuCastFrame | null} />
        ) : castState?.castKind === 'petit-buveur' ? (
          // Fin de partie gérée par l'écran lui-même : il attend que le pion gagnant soit arrivé.
          <TvPetitBuveurCast room={room} state={castState} />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-5xl font-black text-white/80">{t('loading')}</p>
          </div>
        )}
      </TvStage>
    )
  }

  const title = gameTitle(room.gameId)
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  // QR/lien SANS préfixe de langue : chaque scanneur atterrit dans SA locale.
  // Via /invite/CODE pour que le lien partagé porte l'aperçu OG de la table.
  const joinUrl = `${origin}/invite/${room.code}`
  const state = parseState(room.gameStateJson)
  const finished = isFinished(state)

  // Chaque jeu gère sa propre fin de partie ; TvVictory (écran historique)
  // ne sert plus qu'au Toucher-Coulé.
  let content: ReactNode
  if (room.status === 'briefing') {
    // Le lancement ne crée PAS l'état de jeu tout de suite : la salle passe en
    // `briefing` (chacun lit les règles sur son téléphone, jusqu'à 90 s) et
    // `gameStateJson` reste nul. Sans ce cas, la TV retombait dans le lobby et
    // affichait « en attente du lancement » pendant tout le briefing, alors
    // que la partie est bel et bien lancée. Aucun trafic en plus : le bus SSE
    // pousse déjà ce changement de statut (`publishRoomChanged` au lancement).
    content = <TvBriefing gameId={room.gameId} playerCount={room.members.length} />
  } else if (room.status === 'waiting' || !state) {
    content = <TvLobby room={room} joinUrl={joinUrl} />
  } else if (room.gameId === 'petit-buveur') {
    // Fin de partie gérée par l'écran lui-même : le moteur la déclare avant que le dé et le pion gagnant soient montrés.
    content = <TvPetitBuveur room={room} state={state as unknown as EngineState} />
  } else if (room.gameId === 'toucher-coule') {
    content = finished ? (
      <TvVictory room={room} gameId="toucher-coule" state={state as unknown as TCClientView} />
    ) : (
      <TvToucherCoule room={room} state={state as unknown as TCClientView} />
    )
  } else if (room.gameId === 'quiz') {
    content = <TvQuiz room={room} state={state as unknown as QuizClientView} />
  } else if (room.gameId === 'menteur') {
    content = <TvMenteur room={room} state={state as unknown as MenteurClientView} />
  } else if (room.gameId === 'imposteur') {
    content = <TvImposteur room={room} state={state as unknown as ImposteurClientView} />
  } else if (room.gameId === 'loup-garou') {
    content = <TvLoupGarou room={room} state={state as unknown as LGClientView} />
  } else if (room.gameId === '1220') {
    content = <TvGame1220 room={room} state={state as unknown as Game1220SyncedState} />
  } else if (room.gameId === 'purple') {
    content = <TvPurple room={room} state={state as unknown as PurpleSyncedState} />
  } else if (room.gameId === 'bluff') {
    content = <TvBluff room={room} state={state as unknown as BluffClientView} />
  } else if (room.gameId === 'espion') {
    content = <TvEspion room={room} state={state as unknown as EspionClientView} />
  } else if (room.gameId === 'tabou') {
    content = <TvTabou room={room} state={state as unknown as TabouClientView} />
  } else if (room.gameId === 'crobard') {
    content = <TvCrobard room={room} state={state as unknown as CrobardClientView} />
  } else if (room.gameId === 'telephone-dessine') {
    content = <TvTelephoneDessine room={room} state={state as unknown as TelephoneClientView} />
  } else if (room.gameId === 'sans-filtre') {
    content = <TvSansFiltre room={room} state={state as unknown as SFClientView} />
  } else if (room.gameId === 'mots-codes') {
    content = <TvMotsCodes room={room} state={state as unknown as MCClientView} />
  } else if (room.gameId === 'dilemmes') {
    content = <TvDilemmes room={room} state={state as unknown as DilClientView} />
  } else if (room.gameId === 'petit-bac') {
    content = <TvPetitBac room={room} state={state as unknown as PbcClientView} />
  } else if (room.gameId === 'president') {
    content = <TvPresident room={room} state={state as unknown as PreClientView} />
  } else {
    content = <TvLobby room={room} joinUrl={joinUrl} />
  }

  // QR persistant en en-tête pendant le jeu ; en lobby, c'est le grand QR central qui sert.
  // Petit Buveur : le moteur déclare la fin avant que la TV montre le dé et le pion gagnants ;
  // retirer le QR à ce moment annoncerait la victoire (et ferait sauter la mise en page).
  const headerJoinUrl =
    room.status !== 'waiting' && (!finished || room.gameId === 'petit-buveur') ? joinUrl : undefined

  return (
    <TvStage title={title} code={room.code} joinUrl={headerJoinUrl}>
      {content}
    </TvStage>
  )
}
