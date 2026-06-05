import type { GamePlayer } from './case-types'
import { getPlayerGameBoost } from '@/lib/players'

export type CaseType =
  | 'normal'
  | 'defi'
  | 'gorgée'
  | 'recul'
  | 'avance'
  | 'tous'
  | 'roue'
  | 'echange'
  | 'bombe'
  | 'protection'
  | 'malediction'
  | 'chance'
  | 'repetition'
  | 'miroir'
  | 'defi-chaine'
  | 'piege'
  | 'melange'
  | 'passe-tour'
  | 'double-peine'
  | 'solo'
  | 'copie'
  | 'roulette-russe'
  | 'teleport'
  | 'grappin'
  | 'ancre'
  | 'case-bonus'
  | 'recul-groupe'
  | 'pont'
  | 'question'
  | 'vote'
  | 'miroir-inverse'
  | 'rewind'
  | 'loterie'
  | 'inversion'
  | 'double-case'
  | 'roue-defis'
  | 'de-honte'
  | 'pile-face'

export type Difficulty = 'facile' | 'normal' | 'difficile' | 'extreme'

export interface Case {
  type: CaseType
  description: string
  effect: number
}

const difficultyMultipliers: Record<Difficulty, number> = {
  facile: 1,
  normal: 2,
  difficile: 3,
  extreme: 4,
}

const DEFIS = [
  { text: 'Fais 10 pompes', drinks: 3 },
  { text: 'Raconte une blague', drinks: 3 },
  { text: 'Chante une chanson', drinks: 3 },
  { text: 'Imite un animal', drinks: 3 },
  { text: 'Fais 10 squats', drinks: 3 },
  { text: 'Fais 30 secondes de gainage', drinks: 3 },
  { text: 'Mime un film sans parler', drinks: 2 },
  { text: 'Imite un autre joueur', drinks: 2 },
  { text: 'Fais 10 tours sur toi-même', drinks: 2 },
  { text: 'Danse pendant 20 secondes', drinks: 2 },
  { text: 'Raconte ton souvenir de soirée le plus gênant', drinks: 3 },
  { text: 'Parle avec un accent pendant 2 tours', drinks: 2 },
  { text: 'Fais le poirier contre un mur', drinks: 3 },
  { text: 'Fais deviner un mot sans parler', drinks: 2 },
  { text: "Récite l'alphabet à l'envers", drinks: 3 },
  { text: 'Fais 5 sauts de grenouille', drinks: 2 },
  { text: 'Ne touche pas ton téléphone pendant 3 tours', drinks: 8 },
  { text: 'Bois sans utiliser tes mains', drinks: 2 },
]

/** Poids relatifs — cases courantes un peu plus fréquentes */
const CASE_TYPE_POOL: { type: CaseType; weight: number }[] = [
  { type: 'gorgée', weight: 7 },
  { type: 'defi', weight: 5 },
  { type: 'normal', weight: 4 },
  { type: 'recul', weight: 3 },
  { type: 'avance', weight: 3 },
  { type: 'tous', weight: 3 },
  { type: 'roue', weight: 2 },
  { type: 'echange', weight: 2 },
  { type: 'bombe', weight: 2 },
  { type: 'protection', weight: 2 },
  { type: 'malediction', weight: 2 },
  { type: 'chance', weight: 2 },
  { type: 'repetition', weight: 2 },
  { type: 'miroir', weight: 2 },
  { type: 'defi-chaine', weight: 2 },
  { type: 'piege', weight: 2 },
  { type: 'melange', weight: 2 },
  { type: 'passe-tour', weight: 2 },
  { type: 'double-peine', weight: 2 },
  { type: 'solo', weight: 2 },
  { type: 'copie', weight: 2 },
  { type: 'roulette-russe', weight: 2 },
  { type: 'teleport', weight: 2 },
  { type: 'grappin', weight: 2 },
  { type: 'ancre', weight: 2 },
  { type: 'case-bonus', weight: 2 },
  { type: 'recul-groupe', weight: 2 },
  { type: 'pont', weight: 2 },
  { type: 'question', weight: 2 },
  { type: 'vote', weight: 2 },
  { type: 'miroir-inverse', weight: 2 },
  { type: 'rewind', weight: 2 },
  { type: 'loterie', weight: 2 },
  { type: 'inversion', weight: 2 },
  { type: 'double-case', weight: 1 },
  { type: 'roue-defis', weight: 2 },
  { type: 'de-honte', weight: 2 },
  { type: 'pile-face', weight: 2 },
]

export const CASE_TYPE_LABELS: Record<CaseType, string> = {
  normal: 'Normale',
  defi: 'Défi',
  gorgée: 'Gorgées',
  recul: 'Recul',
  avance: 'Avance',
  tous: 'Tout le monde',
  roue: 'Roue des gorgées',
  echange: 'Échange',
  bombe: 'Bombe',
  protection: 'Protection',
  malediction: 'Malédiction',
  chance: 'Chance',
  repetition: 'Répétition',
  miroir: 'Miroir',
  'defi-chaine': 'Défi en chaîne',
  piege: 'Piège',
  melange: 'Mélange',
  'passe-tour': 'Passe-ton-tour',
  'double-peine': 'Double peine',
  solo: 'Solo',
  copie: 'Copie',
  'roulette-russe': 'Roulette russe',
  teleport: 'Téléport',
  grappin: 'Grappin',
  ancre: 'Ancre',
  'case-bonus': 'Case bonus',
  'recul-groupe': 'Recul groupé',
  pont: 'Pont',
  question: 'Question',
  vote: 'Vote',
  'miroir-inverse': 'Miroir inversé',
  rewind: 'Rewind',
  loterie: 'Loterie',
  inversion: 'Inversion',
  'double-case': 'Double case',
  'roue-defis': 'Roue des défis',
  'de-honte': 'Dé de la honte',
  'pile-face': 'Pile ou face',
}

export function getCaseTypeLabel(type: CaseType): string {
  return CASE_TYPE_LABELS[type] ?? type
}

export function pickCaseType(): CaseType {
  const total = CASE_TYPE_POOL.reduce((s, e) => s + e.weight, 0)
  let r = Math.random() * total
  for (const entry of CASE_TYPE_POOL) {
    r -= entry.weight
    if (r <= 0) return entry.type
  }
  return 'gorgée'
}

/** Cases sans choix de cible (résolues au lancer / après le dé) */
export const CASES_NO_TARGET = new Set<CaseType>([
  'solo',
  'case-bonus',
  'recul-groupe',
  'grappin',
  'pont',
  'loterie',
])

/** Ouvre une modale dédiée avant effet */
export const CASES_SPECIAL_MODAL = new Set<CaseType>([
  'roue',
  'roue-defis',
  'de-honte',
  'pile-face',
  'teleport',
  'vote',
  'chance',
  'echange',
  'defi-chaine',
  'double-case',
])

export function generateCase(difficulty: Difficulty, currentPlayer?: GamePlayer): Case {
  const boost = currentPlayer ? getPlayerGameBoost(currentPlayer, 'petit-buveur') : 0
  if (boost > 0 && Math.random() * 100 < boost) {
    const avanceSpaces = Math.floor(Math.random() * 3) + 1
    return {
      type: 'avance',
      description: `Avance de ${avanceSpaces} case${avanceSpaces > 1 ? 's' : ''} !`,
      effect: avanceSpaces,
    }
  }

  const type = pickCaseType()
  const multiplier = difficultyMultipliers[difficulty]

  switch (type) {
    case 'normal':
      return { type, description: 'Case safe', effect: 0 }
    case 'gorgée': {
      const baseGorgees = Math.floor(Math.random() * 3) + 1
      let finalDrinks = baseGorgees * multiplier
      if (difficulty === 'difficile' && finalDrinks > 8) finalDrinks = 8
      const description =
        difficulty === 'extreme' && finalDrinks >= 12
          ? 'Cul sec ! 🍺'
          : `Bois ${finalDrinks} gorgée${finalDrinks > 1 ? 's' : ''} !`
      return { type, description, effect: finalDrinks }
    }
    case 'defi': {
      const defi = DEFIS[Math.floor(Math.random() * DEFIS.length)]
      const drinks = Math.min(defi.drinks * multiplier, 4)
      return {
        type,
        description: `Défi : ${defi.text} ou bois ${drinks} gorgée${drinks > 1 ? 's' : ''} !`,
        effect: drinks,
      }
    }
    case 'recul':
      return { type, description: 'Recule de 1 case !', effect: -1 }
    case 'avance':
      return { type, description: 'Avance de 1 case !', effect: 1 }
    case 'tous': {
      const drinks = Math.min((Math.floor(Math.random() * 2) + 1) * multiplier, 3)
      return {
        type,
        description: `Tout le monde boit ${drinks} gorgée${drinks > 1 ? 's' : ''} sauf la personne ciblée ! 🍻`,
        effect: drinks,
      }
    }
    case 'roue':
      return { type, description: '🎯 Case spéciale : Roue des gorgées !', effect: 0 }
    case 'roue-defis':
      return { type, description: '🎭 Roue des défis !', effect: 0 }
    case 'de-honte':
      return { type, description: '🎲 Dé de la honte ! Lance le dé du destin.', effect: 0 }
    case 'pile-face':
      return { type, description: '🪙 Pile ou face ! La cible choisit et tente sa chance.', effect: 0 }
    case 'echange':
      return { type, description: '🔄 Échange ta position avec un autre joueur !', effect: 0 }
    case 'bombe':
      return { type, description: '💣 Bombe ! Tout le monde boit, la cible boit double !', effect: 2 }
    case 'protection':
      return {
        type,
        description: '🛡️ Protection : immunisé pendant un tour de table complet !',
        effect: 0,
      }
    case 'malediction':
      return { type, description: '👻 Malédiction ! 1 gorgée par tour pendant 3 tours !', effect: 3 }
    case 'chance':
      return { type, description: '🍀 Chance ! Relance le dé ou avance de 2 cases !', effect: 0 }
    case 'repetition':
      return { type, description: "🔄 Répète l'action de la case précédente !", effect: 0 }
    case 'miroir':
      return { type, description: '🪞 Miroir ! Les positions sont inversées !', effect: 0 }
    case 'defi-chaine':
      return { type, description: '🔗 Défi en chaîne ! Lié 5 tours à un partenaire !', effect: 5 }
    case 'piege':
      return {
        type,
        description: '🕳️ Piège ! Bois autant de gorgées que ta position !',
        effect: 0,
      }
    case 'melange':
      return { type, description: '🔀 Mélange ! Les positions sont mélangées !', effect: 0 }
    case 'passe-tour':
      return {
        type,
        description: '⏭️ Passe-ton-tour ! La cible ne lancera pas au prochain tour.',
        effect: 0,
      }
    case 'double-peine': {
      const drinks = Math.min((Math.floor(Math.random() * 3) + 2) * multiplier, 8)
      return {
        type,
        description: `💥 Double peine ! La cible boit ${drinks} gorgées × 2 !`,
        effect: drinks,
      }
    }
    case 'solo':
      return {
        type,
        description: '🎯 Solo ! Tout le monde est safe, toi tu bois 1 gorgée.',
        effect: 1,
      }
    case 'copie':
      return {
        type,
        description: '👯 Copie ! La cible subit le même déplacement que toi ce tour.',
        effect: 0,
      }
    case 'roulette-russe':
      return {
        type,
        description: '🔫 Roulette russe ! 1 chance sur 3 : 6 gorgées ou safe.',
        effect: 6,
      }
    case 'teleport':
      return {
        type,
        description: '🌀 Téléport ! Échange avec le 1er ou le dernier du classement.',
        effect: 0,
      }
    case 'grappin':
      return {
        type,
        description: '🪝 Grappin ! Tu rejoins la case du joueur juste devant toi.',
        effect: 0,
      }
    case 'ancre':
      return {
        type,
        description: '⚓ Ancre ! La cible ne peut pas avancer au prochain tour.',
        effect: 0,
      }
    case 'case-bonus':
      return { type, description: '✨ Case bonus ! +1 case immédiatement.', effect: 1 }
    case 'recul-groupe':
      return {
        type,
        description: '⬅️ Recul groupé ! Tous ceux derrière toi reculent d\'1 case.',
        effect: -1,
      }
    case 'pont':
      return {
        type,
        description: '🌉 Pont ! Sur ta case : tout le monde +1 ou −1 (pile ou face).',
        effect: 0,
      }
    case 'question': {
      const drinks = Math.min(2 * multiplier, 4)
      return {
        type,
        description: `❓ Question ! Réponds à voix haute ou bois ${drinks} gorgées.`,
        effect: drinks,
      }
    }
    case 'vote': {
      const drinks = Math.min((Math.floor(Math.random() * 2) + 2) * multiplier, 5)
      return {
        type,
        description: `🗳️ Vote ! Désignez qui boit ${drinks} gorgées.`,
        effect: drinks,
      }
    }
    case 'miroir-inverse':
      return {
        type,
        description: '🪞 Miroir inversé ! Quand tu bois, la cible boit aussi (1 tour).',
        effect: 1,
      }
    case 'rewind':
      return {
        type,
        description: '⏪ Rewind ! Rejoue la dernière case enregistrée.',
        effect: 0,
      }
    case 'loterie':
      return {
        type,
        description: '🎰 Loterie ! 2 joueurs tirés : l\'un boit, l\'autre avance.',
        effect: 0,
      }
    case 'inversion': {
      const drinks = Math.min((Math.floor(Math.random() * 2) + 1) * multiplier, 4)
      return {
        type,
        description: `🔃 Inversion ! Le dernier du classement boit ${drinks} gorgées à la place.`,
        effect: drinks,
      }
    }
    case 'double-case':
      return {
        type,
        description: '🎲 Double case ! Deux effets d\'affilée après le ciblage.',
        effect: 0,
      }
    default:
      return { type: 'normal', description: 'Case safe', effect: 0 }
  }
}

export const DEFI_WHEEL_CHALLENGES = [
  'Imite un animal',
  'Danse 15 secondes',
  'Raconte une blague',
  'Chante le refrain d\'une chanson',
  'Pompes × 5',
  'Squats × 5',
  'Parle en rimes 30 secondes',
  'Sans prénoms 1 tour',
  'Selfie de groupe',
  'Compliment sincère à gauche',
  'Tu bois 2 gorgées',
  'SAFE',
]
