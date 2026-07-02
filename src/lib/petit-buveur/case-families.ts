/**
 * Identité visuelle des cases du Petit Buveur — partagée local + online.
 *
 * Chaque type de case appartient à une FAMILLE (couleur) et porte une icône :
 * on comprend d'un coup d'œil si la case est un cadeau, une punition, un
 * déplacement ou une interaction, avant même de lire le texte.
 */

export type CaseFamily = 'bonus' | 'malus' | 'move' | 'interactive' | 'neutral'

/** Classes Tailwind par famille (bordure/fond/texte accordés au thème sombre). */
export const CASE_FAMILY_STYLE: Record<
  CaseFamily,
  { border: string; bg: string; text: string; chip: string }
> = {
  bonus: {
    border: 'border-emerald-400/40',
    bg: 'bg-gradient-to-br from-emerald-500/15 to-teal-500/10',
    text: 'text-emerald-200',
    chip: 'border-emerald-400/30 bg-emerald-500/15 text-emerald-100',
  },
  malus: {
    border: 'border-red-400/40',
    bg: 'bg-gradient-to-br from-red-500/15 to-rose-500/10',
    text: 'text-red-200',
    chip: 'border-red-400/30 bg-red-500/15 text-red-100',
  },
  move: {
    border: 'border-sky-400/40',
    bg: 'bg-gradient-to-br from-sky-500/15 to-cyan-500/10',
    text: 'text-sky-200',
    chip: 'border-sky-400/30 bg-sky-500/15 text-sky-100',
  },
  interactive: {
    border: 'border-violet-400/40',
    bg: 'bg-gradient-to-br from-violet-500/15 to-purple-500/10',
    text: 'text-violet-200',
    chip: 'border-violet-400/30 bg-violet-500/15 text-violet-100',
  },
  neutral: {
    border: 'border-white/15',
    bg: 'bg-white/5',
    text: 'text-white/70',
    chip: 'border-white/15 bg-white/10 text-white/70',
  },
}

type CaseMeta = { family: CaseFamily; icon: string }

const CASE_META: Record<string, CaseMeta> = {
  // Punitions / boire
  'gorgée': { family: 'malus', icon: '🍺' },
  tous: { family: 'malus', icon: '🍻' },
  solo: { family: 'malus', icon: '🥃' },
  'double-peine': { family: 'malus', icon: '⚡' },
  bombe: { family: 'malus', icon: '💣' },
  'roulette-russe': { family: 'malus', icon: '💥' },
  malediction: { family: 'malus', icon: '👻' },
  piege: { family: 'malus', icon: '🕳️' },
  'passe-tour': { family: 'malus', icon: '⏭️' },
  ancre: { family: 'malus', icon: '⚓' },

  // Cadeaux
  protection: { family: 'bonus', icon: '🛡️' },
  chance: { family: 'bonus', icon: '🍀' },
  'case-bonus': { family: 'bonus', icon: '🎁' },

  // Déplacements
  avance: { family: 'move', icon: '➡️' },
  recul: { family: 'move', icon: '↩️' },
  'recul-groupe': { family: 'move', icon: '👥' },
  grappin: { family: 'move', icon: '🪝' },
  pont: { family: 'move', icon: '🌉' },
  teleport: { family: 'move', icon: '🚀' },

  // Interactions / mini-jeux
  defi: { family: 'interactive', icon: '🎯' },
  'defi-chaine': { family: 'interactive', icon: '🔗' },
  roue: { family: 'interactive', icon: '🎡' },
  'roue-defis': { family: 'interactive', icon: '🎡' },
  'de-honte': { family: 'interactive', icon: '🎲' },
  'pile-face': { family: 'interactive', icon: '🪙' },
  question: { family: 'interactive', icon: '❓' },
  vote: { family: 'interactive', icon: '🗳️' },
  echange: { family: 'interactive', icon: '🔄' },
  copie: { family: 'interactive', icon: '📋' },
  repetition: { family: 'interactive', icon: '🔁' },
  miroir: { family: 'interactive', icon: '🪞' },
  'miroir-inverse': { family: 'interactive', icon: '🪞' },
  melange: { family: 'interactive', icon: '🌀' },
  inversion: { family: 'interactive', icon: '🔃' },
  rewind: { family: 'interactive', icon: '⏪' },
  loterie: { family: 'interactive', icon: '🎰' },
  'double-case': { family: 'interactive', icon: '🎲' },

  // Rien
  normal: { family: 'neutral', icon: '▫️' },
}

export function getCaseMeta(type: string): CaseMeta {
  return CASE_META[type] ?? { family: 'neutral', icon: '▫️' }
}

export function getCaseFamilyStyle(type: string) {
  return CASE_FAMILY_STYLE[getCaseMeta(type).family]
}
