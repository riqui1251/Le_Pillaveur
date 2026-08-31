import fs from 'fs'
import path from 'path'

/**
 * Pages « règles » SEO : un article markdown par jeu EN LIGNE, en français
 * (le gisement de recherche visé est francophone — les autres langues
 * viendront si la demande existe). Les fichiers vivent dans docs/rules/fr/
 * comme les documents légaux (embarqués tels quels dans l'image Docker).
 */

import { RULES_GAME_IDS, isRulesGameId, type RulesGameId } from './rules-ids'

export { RULES_GAME_IDS, isRulesGameId, type RulesGameId }

/** Métadonnées SEO par page (titre + description, français). */
export const RULES_META: Record<RulesGameId, { title: string; description: string }> = {
  'loup-garou': {
    title: 'Règles du Loup-Garou — apprendre et jouer en ligne gratuit',
    description:
      'Rôles (Voyante, Sorcière, Chasseur…), nuits, votes et maire expliqués. Puis joues-y gratuitement : 4 à 12 joueurs, chat vocal — ou seul avec des bots.',
  },
  imposteur: {
    title: "Règles de L'Imposteur — apprendre et jouer en ligne gratuit",
    description:
      'Un mot secret, un imposteur, des indices et un vote : les règles en 2 minutes. Puis joues-y gratuitement : 3 à 16 joueurs, chat vocal — ou seul avec des bots.',
  },
  quiz: {
    title: 'Règles du Grand Pillaveur — comprendre le quiz puis jouer',
    description:
      'Buzzer, rapidité, points et podium : le quiz expliqué en un clin d’œil. Puis joues-y gratuitement : 2 à 16 joueurs, chat vocal — ou seul contre les bots.',
  },
  menteur: {
    title: 'Règles du Menteur — apprendre le jeu de dés puis jouer',
    description:
      'Dés cachés, enchères et quand crier « Menteur ! » : les règles en 2 minutes. Puis joues-y gratuitement : 2 à 6 joueurs, chat vocal — ou seul avec des bots.',
  },
  'petit-buveur': {
    title: 'Règles du Petit Buveur — apprendre et jouer en ligne gratuit',
    description:
      'Plateau, cases à effets, défis et gorgées : les règles en un clin d’œil. Puis joues-y gratuitement en ligne : 2 à 99 joueurs, chat vocal, sans installation.',
  },
  'toucher-coule': {
    title: 'Règles du Toucher-Coulé — apprendre puis jouer gratuit',
    description:
      'Placement des navires, tirs en équipes, touché ou coulé : règles simples. Puis joues-y gratuitement en ligne : 1 à 8 joueurs, chat vocal, sans installation.',
  },
  bluff: {
    title: 'Règles du Grand Bluff — apprendre et jouer en ligne gratuit',
    description:
      'Inventer une fausse réponse, voter pour la vraie, marquer : règles et astuces. Puis joues-y gratuitement : 3 à 16 joueurs, chat vocal — ou seul avec des bots.',
  },
  espion: {
    title: "Règles de Qui est l'Espion ? — apprendre et jouer gratuit",
    description:
      'Un lieu secret, des questions, une accusation : les règles en 2 minutes. Puis joues-y gratuitement : 3 à 16 joueurs, chat vocal — ou seul avec des bots.',
  },
  // Tabou masqué pour l'instant — réactiver cette entrée avec l'id dans rules-ids.ts.
  // tabou: {
  //   title: 'Règles du Tabou Vocal — faire deviner sans les mots interdits',
  //   description:
  //     'Le Tabou du Pillaveur : faites deviner un mot au chat vocal sans prononcer les mots interdits, en équipes. Règles complètes, 4 à 12 joueurs.',
  // },
  crobard: {
    title: 'Règles du Crobard — apprendre et jouer en ligne gratuit',
    description:
      'Dessin en direct, devinettes chronométrées, comptage des points : tout y est. Puis joues-y gratuitement : 3 à 16 joueurs, chat vocal — ou seul avec des bots.',
  },
  'telephone-dessine': {
    title: 'Règles du Téléphone Dessiné — apprendre et jouer gratuit',
    description:
      'Une phrase, un dessin, une devinette : le téléphone arabe en dessins expliqué. Puis joues-y gratuitement : 3 à 8 joueurs, chat vocal, sans installation.',
  },
  purple: {
    title: 'Règles du Purple — apprendre et jouer en ligne gratuit',
    description:
      'Rouge, noir ou purple : les paris, les gorgées et l’alternance expliqués. Puis joues-y gratuitement : 2 à 16 joueurs, chat vocal — ou seul avec des bots.',
  },
  '1220': {
    title: 'Règles du 1220 — apprendre les paris puis jouer gratuit',
    description:
      'Un dé 12, un dé 20, parité, plage de somme et chiffres clés : règles complètes. Puis joues-y gratuitement : 2 à 16 joueurs, chat vocal — ou seul avec des bots.',
  },
  'sans-filtre': {
    title: 'Règles de Sans Filtre — apprendre et jouer en ligne gratuit',
    description:
      'Carte à trou, réponses anonymes, juge du tour : les règles en 2 minutes. Puis joues-y gratuitement : 4 à 16 joueurs, chat vocal — ou seul avec des bots.',
  },
  'mots-codes': {
    title: 'Règles de Mots Codés — apprendre et jouer en ligne gratuit',
    description:
      '25 mots, deux équipes, un indice chiffré, gare à l’assassin : tout est expliqué. Puis joues-y gratuitement : 4 à 16 joueurs, chat vocal, sans installation.',
  },
  dilemmes: {
    title: 'Règles de Dilemmes — apprendre et jouer en ligne gratuit',
    description:
      'Tu préfères, Je n’ai jamais, Qui de la table, votes secrets : règles éclair. Puis joues-y gratuitement : 3 à 16 joueurs, chat vocal — ou seul avec des bots.',
  },
  'petit-bac': {
    title: 'Règles du Petit Bac — apprendre et jouer en ligne gratuit',
    description:
      'Lettre, catégories, STOP, comptage et contestations : les règles complètes. Puis joues-y gratuitement : 2 à 16 joueurs, chat vocal, sans installation.',
  },
  president: {
    title: 'Règles du Président en ligne — combos, coupe au 2 et Trou',
    description:
      'Le Président en ligne : combos strictement plus forts, le 2 coupe le pli, premier sorti = Président, dernier = Trou. Échange automatique entre manches. Règles complètes, 4 à 8 joueurs, gratuit.',
  },
}

const RULES_ROOT = path.join(process.cwd(), 'docs', 'rules', 'fr')

export function loadRulesDoc(id: RulesGameId): string | null {
  try {
    return fs.readFileSync(path.join(RULES_ROOT, `${id}.md`), 'utf-8')
  } catch {
    return null
  }
}
