import { DEFAULT_ONLINE_PREFERENCES } from '@/lib/online-preferences'
import { stripEngineSecretForSpectator, type TvRoomDto } from '@/lib/online-room'
import type { CastFrame, CastState } from '@/lib/cast-types'

/**
 * Outils des fixtures de l'aperçu TV (développement seulement). Un état de jeu
 * EN LIGNE passe par le même masquage spectateur que la vraie TV
 * (`stripEngineSecretForSpectator`, comme `buildTvRoomDto`) : ce que montre
 * l'aperçu est ce qu'une télé recevrait, secrets retirés.
 */

export type TvPreviewStep = {
  /** Ce que montre cette étape (« question », « révélation »…). */
  label: string
  /** Null = salle pas encore lue (écran de chargement), ou introuvable avec `notFound`. */
  room: TvRoomDto | null
  notFound?: boolean
  frame?: CastFrame | null
}

export type TvPreviewFixture = {
  /** Identifiant d'URL, unique dans le jeu (`?f=<jeu>:<id>`). */
  id: string
  label: string
  /** Une étape = un état figé ; plusieurs = une séquence (← / → dans l'aperçu). */
  steps: TvPreviewStep[]
}

export const PREVIEW_CODE = 'APERCU'

/** Noms de démonstration — dont un long, pour éprouver les débordements. */
export const PREVIEW_NAMES = [
  'Léa',
  'Maxime',
  'Sofiane',
  'Camille',
  'Jean-Baptiste',
  'Inès',
  'Thomas',
  'Zoé',
  'Marie-Charlotte',
  'Hugo',
  'Nora',
  'Bastien',
] as const

const PREVIEW_ICONS = ['🦊', '🐼', '🐸', '🦁', '🐙', '🦄', '🐯', '🐧', '🐨', '🦉', '🐻', '🐵']

export type PreviewMember = TvRoomDto['members'][number]

/** `count` membres humains `u1…uN` (u1 = hôte). */
export function previewMembers(count: number, names: readonly string[] = PREVIEW_NAMES): PreviewMember[] {
  return Array.from({ length: count }, (_, i) => ({
    userId: `u${i + 1}`,
    displayName: names[i % names.length] ?? `Joueur ${i + 1}`,
    isHost: i === 0,
    isReady: i % 3 !== 2,
    preferences: { ...DEFAULT_ONLINE_PREFERENCES, icon: PREVIEW_ICONS[i % PREVIEW_ICONS.length] },
    level: 0,
    role: 'user',
  }))
}

/** Salle en ligne en partie : l'état brut du moteur est masqué comme pour une vraie TV. */
export function onlineRoom(
  gameId: string,
  rawState: unknown,
  opts: {
    members: PreviewMember[]
    status?: string
    currentTurnUserId?: string | null
    stateVersion?: number
  }
): TvRoomDto {
  return {
    code: PREVIEW_CODE,
    status: opts.status ?? 'playing',
    gameId,
    hostUserId: opts.members[0]?.userId ?? 'u1',
    members: opts.members,
    settings: {},
    stateVersion: opts.stateVersion ?? 1,
    currentTurnUserId: opts.currentTurnUserId ?? null,
    gameStateJson: stripEngineSecretForSpectator(gameId, JSON.stringify(rawState)),
  }
}

/** Salle d'attente ou briefing (pas d'état de jeu). */
export function lobbyRoom(gameId: string | null, members: PreviewMember[], status: 'waiting' | 'briefing' = 'waiting'): TvRoomDto {
  return {
    code: PREVIEW_CODE,
    status,
    gameId,
    hostUserId: members[0]?.userId ?? 'u1',
    members,
    settings: {},
    stateVersion: 0,
    currentTurnUserId: null,
    gameStateJson: null,
  }
}

/** Salle de diffusion d'un jeu LOCAL (Plinko, PMU, Petit Buveur local). */
export function castRoom(state: CastState): TvRoomDto {
  return {
    code: PREVIEW_CODE,
    status: 'cast',
    gameId: null,
    hostUserId: 'u1',
    members: [],
    settings: {},
    stateVersion: 1,
    currentTurnUserId: null,
    gameStateJson: JSON.stringify(state),
  }
}
