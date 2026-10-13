/**
 * Identité visuelle des cases du Petit Buveur — partagée local + online.
 *
 * Chaque type de case appartient à une FAMILLE (couleur) et porte une icône :
 * on comprend d'un coup d'œil si la case est un cadeau, une punition, un
 * déplacement ou une interaction, avant même de lire le texte.
 */

export type CaseFamily = 'bonus' | 'malus' | 'move' | 'interactive' | 'neutral'

/** Classes Tailwind par famille (palette « Cartes sur Table » : rouge, vert, bleu jeton, or, crème). */
export const CASE_FAMILY_STYLE: Record<
  CaseFamily,
  { border: string; bg: string; text: string; chip: string }
> = {
  bonus: {
    border: 'border-emerald-400/40',
    bg: 'bg-emerald-600/20',
    text: 'text-emerald-200',
    chip: 'border-emerald-400/30 bg-emerald-600/20 text-emerald-100',
  },
  malus: {
    border: 'border-suit-red/50',
    bg: 'bg-suit-red/[0.15]',
    text: 'text-red-200',
    chip: 'border-suit-red/40 bg-suit-red/20 text-cream',
  },
  move: {
    border: 'border-chip-blue/60',
    bg: 'bg-chip-blue/30',
    text: 'text-sky-100',
    chip: 'border-chip-blue/50 bg-chip-blue/30 text-cream',
  },
  interactive: {
    border: 'border-gold/50',
    bg: 'bg-gold/[0.12]',
    text: 'text-gold',
    chip: 'border-gold/40 bg-gold/[0.15] text-gold',
  },
  neutral: {
    border: 'border-gold/20',
    bg: 'bg-black/20',
    text: 'text-cream/70',
    chip: 'border-gold/20 bg-black/25 text-cream/70',
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
