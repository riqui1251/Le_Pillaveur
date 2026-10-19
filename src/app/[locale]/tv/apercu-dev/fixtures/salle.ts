import {
  advanceTCBots,
  createInitialTCState,
  type TCMode,
  type TCState,
  type TeamId,
} from '@/lib/toucher-coule/engine'
import {
  lobbyRoom,
  onlineRoom,
  previewMembers,
  type PreviewMember,
  type TvPreviewFixture,
} from '../fixture-kit'

/** Noms pour les grandes tablées (au-delà des 12 du kit) : beaucoup de longs, pour éprouver les troncatures. */
const LONG_NAMES = [
  'Jean-Baptiste',
  'Marie-Charlotte',
  'Léa',
  'Maxime-Alexandre',
  'Sofiane',
  'Anne-Sophie',
  'Camille',
  'Pierre-Emmanuel',
  'Inès',
  'Thomas',
  'Marie-Antoinette',
  'Zoé',
  'Hugo',
  'Charles-Henri',
  'Nora',
  'Bastien',
] as const

/** Ids réels du catalogue d'icônes (player-icon-defs.ts) : les emojis du kit retombent tous sur la chope. */
const ICONS = [
  'chope', 'vin', 'flute', 'cocktail', 'whisky', 'bouteille', 'trinque', 'shaker',
  'citron', 'olive', 'tonneau', 'glacon', 'content', 'mdr', 'clin', 'choque',
  'dodo', 'malin', 'robot', 'cool', 'furieux', 'nausee', 'ange', 'diablotin',
]

/** Membres avec de vraies icônes, et quelques écussons de rôle pour vérifier leur taille. */
function members(count: number, names: readonly string[] = LONG_NAMES): PreviewMember[] {
  return previewMembers(count, names).map((m, i) => ({
    ...m,
    displayName: count > names.length ? `${names[i % names.length]} ${Math.floor(i / names.length) + 1}` : m.displayName,
    preferences: { ...m.preferences, icon: ICONS[i % ICONS.length] },
    role: i === 0 ? 'fondateur' : i === 3 ? 'admin' : 'user',
  }))
}

function allReady(list: PreviewMember[]): PreviewMember[] {
  return list.map((m) => ({ ...m, isReady: true }))
}

/** Bataille navale jouée par les bots du moteur ; les joueurs redeviennent humains pour l'affichage. */
function finishedToucherCoule(mode: TCMode, list: PreviewMember[], seed: string): TCState {
  const half = list.length / 2
  let s = createInitialTCState(
    list.map((m, i) => ({
      id: m.userId,
      name: m.displayName,
      team: (i < half ? 'A' : 'B') as TeamId,
      isBot: true,
    })),
    mode,
    seed
  )
  for (let guard = 0; guard < 20 && s.phase !== 'finished'; guard += 1) s = advanceTCBots(s)
  if (s.phase !== 'finished') throw new Error(`Toucher-Coulé non terminé (${seed})`)
  return { ...s, players: s.players.map((p) => ({ ...p, isBot: false })) }
}

/**
 * Écrans communs : chargement, code inconnu, salle d'attente (peu et beaucoup de joueurs), briefing, victoire du
 * Toucher-Coulé (la fin du Petit Buveur appartient à son écran, TvPetitBuveur).
 */
export function build(): TvPreviewFixture[] {
  const tc1 = members(2)
  const tc4 = members(8)

  return [
    { id: 'chargement', label: 'Chargement', steps: [{ label: 'chargement', room: null }] },
    { id: 'introuvable', label: 'Code inconnu', steps: [{ label: 'introuvable', room: null, notFound: true }] },
    {
      id: 'lobby-2',
      label: "Salle d'attente, 2 joueurs",
      steps: [{ label: 'lobby', room: lobbyRoom('quiz', members(2)) }],
    },
    {
      id: 'lobby-3',
      label: "Salle d'attente, 3 joueurs",
      steps: [{ label: 'lobby', room: lobbyRoom('quiz', previewMembers(3)) }],
    },
    {
      id: 'lobby-5',
      label: "Salle d'attente, 5 joueurs (tous prêts)",
      steps: [{ label: 'lobby', room: lobbyRoom('imposteur', allReady(members(5))) }],
    },
    {
      id: 'lobby-10',
      label: "Salle d'attente, 10 joueurs",
      steps: [{ label: 'lobby', room: lobbyRoom('loup-garou', members(10)) }],
    },
    {
      id: 'lobby-12',
      label: "Salle d'attente, 12 joueurs (Loup-Garou plein)",
      steps: [{ label: 'lobby', room: lobbyRoom('loup-garou', members(12)) }],
    },
    {
      id: 'lobby-16',
      label: "Salle d'attente, 16 joueurs (plafond des tables)",
      steps: [{ label: 'lobby', room: lobbyRoom('quiz', members(16)) }],
    },
    {
      id: 'lobby-30',
      label: "Salle d'attente, 30 joueurs (Petit Buveur sans plafond)",
      steps: [{ label: 'lobby', room: lobbyRoom('petit-buveur', members(30)) }],
    },
    {
      id: 'briefing',
      label: 'Briefing (règles sur les téléphones)',
      steps: [{ label: 'briefing', room: lobbyRoom('menteur', previewMembers(4), 'briefing') }],
    },
    {
      id: 'briefing-16',
      label: 'Briefing, 16 joueurs, plafond de la table (Imposteur)',
      steps: [{ label: 'briefing', room: lobbyRoom('imposteur', members(16), 'briefing') }],
    },
    {
      id: 'briefing-president',
      label: 'Briefing, 3 étapes les plus longues, 8 joueurs (Président plein)',
      steps: [{ label: 'briefing', room: lobbyRoom('president', members(8), 'briefing') }],
    },
    {
      id: 'briefing-4-etapes',
      label: 'Briefing, 4 étapes (Sans Filtre)',
      steps: [{ label: 'briefing', room: lobbyRoom('sans-filtre', members(8), 'briefing') }],
    },
    {
      id: 'victoire-tc-1v1',
      label: 'Victoire Toucher-Coulé 1v1',
      steps: [
        {
          label: 'victoire',
          room: onlineRoom('toucher-coule', finishedToucherCoule('1v1', tc1, 'tv-salle-tc-1'), {
            members: tc1,
          }),
        },
      ],
    },
    {
      id: 'victoire-tc-4v4',
      label: 'Victoire Toucher-Coulé 4v4',
      steps: [
        {
          label: 'victoire',
          room: onlineRoom('toucher-coule', finishedToucherCoule('4v4', tc4, 'tv-salle-tc-4'), {
            members: tc4,
          }),
        },
      ],
    },
  ]
}
