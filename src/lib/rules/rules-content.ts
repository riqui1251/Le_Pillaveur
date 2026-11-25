import fs from 'fs'
import path from 'path'

/**
 * Pages « règles » SEO : un article markdown par jeu EN LIGNE, et par jeu à
 * boire sur un seul téléphone (Pyramide, Coupe du Roi…), en français
 * (le gisement de recherche visé est francophone — les autres langues
 * viendront si la demande existe). Les fichiers vivent dans docs/rules/fr/
 * comme les documents légaux (embarqués tels quels dans l'image Docker).
 */

import type { GameMeta } from '@/lib/games'
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
      'Plateau, cases à effets, défis et gorgées : les règles en un clin d’œil. Puis joues-y gratuitement : 2 à 99 joueurs, chat vocal — ou seul avec des bots.',
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
  tabou: {
    title: 'Règles du Tabou Vocal — faire deviner sans mot interdit',
    description:
      'Faire deviner un mot au chat vocal sans dire les mots tabous, en équipes : les règles. Puis joues-y gratuitement : 4 à 16 joueurs, 2 par équipe, chat vocal.',
  },
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
  blackjack: {
    title: 'Règles du Black Jack — apprendre et jouer en ligne gratuit',
    description:
      'Tirer, rester, doubler, séparer, le croupier à 17 : les règles en 2 minutes. Puis joues-y gratuitement : 1 à 7 joueurs, chat vocal — ou seul avec des bots.',
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
    // Raccourcie sous 160 caractères (193 avant : Google tronquait l'extrait
    // avant l'effectif et la gratuité) — même style que les autres entrées.
    description:
      'Combos, coupe au 2, Président et Trou, échange automatique : règles éclair. Puis joues-y gratuitement : 4 à 8 joueurs, chat vocal — ou seul avec des bots.',
  },
  'chiffre-piege': {
    title: 'Règles du Chiffre Piégé — apprendre puis jouer gratuit',
    description:
      'Un nombre piège, un intervalle qui fond, un joker : les règles en 2 minutes. Puis joues-y gratuitement : 2 à 16 joueurs, chat vocal — ou seul avec des bots.',
  },
  'vue-de-nez': {
    title: 'Règles d’À Vue de Nez — le jeu d’estimation en ligne',
    description:
      'Une question chiffrée, des estimations secrètes, la règle tranche. Puis joues-y gratuitement : 2 à 16 joueurs, chat vocal — ou seul avec des bots.',
  },
  'patate-chaude': {
    title: 'Règles de Patate Chaude — apprendre et jouer gratuit',
    description:
      'Un défi, une bombe à mèche secrète, un mot à trouver avant le BOUM : les règles. Puis joues-y gratuitement : 2 à 12 joueurs, chat vocal, sans installation.',
  },
  pyramide: {
    title: 'Règles de la Pyramide, le jeu à boire aux cartes',
    description:
      'Mode Cartes ou Classique, étages, pré-jeu et mémorisation : les règles. Puis joues-y gratuitement : dès 2 joueurs, sur un seul téléphone, sans appli.',
  },
  'coupe-du-roi': {
    title: 'Règles de la Coupe du Roi (King), le jeu à boire',
    description:
      'Les 13 cartes du jeu du roi, pouce, binôme, Valet et quatrième roi expliqués. Puis joues-y gratuitement : dès 2 joueurs, sur un seul téléphone, sans appli.',
  },
  pmu: {
    title: 'Course PMU : règles de la course de chevaux à boire',
    description:
      'Quatre chevaux, mode Libre ou Paris, mises et gains doublés : les règles. Puis joues-y gratuitement : dès 2 joueurs, sur un seul téléphone, sans appli.',
  },
  'cap-ou-pas-cap': {
    title: 'Règles de Cap ou Pas Cap, l’action ou vérité à boire',
    description:
      'Vérité ou action, prix de 1 à 5, niveaux, thèmes et joker : les règles. Puis joues-y gratuitement : dès 2 joueurs, sur un seul téléphone, sans appli.',
  },
  'hi-lo': {
    title: 'Règles du Hi-Lo, le plus ou moins aux cartes à boire',
    description:
      'Plus haut, plus bas ou égalité, mise qui grimpe, mode Traversée : les règles. Puis joues-y gratuitement : dès 2 joueurs, sur un seul téléphone, sans appli.',
  },
  'monsieur-3': {
    title: 'Règles de Monsieur 3, le jeu de dés à boire',
    description:
      'Monsieur 3 désigné au dé, les 3, les 5, les sommes 3, 5 et 8 : les règles. Puis joues-y gratuitement : dès 2 joueurs, sur un seul téléphone, sans appli.',
  },
  'front-colle': {
    title: 'Règles de Front Collé, le jeu du mot sur le front',
    description:
      'Décris, mime ou fredonne, téléphone sur le front, équipes et thèmes : les règles. Puis joues-y gratuitement : dès 2 joueurs, sur un seul téléphone, sans appli.',
  },
  plinko: {
    title: 'Règles du Plinko à boire : billes, cases et pions',
    description:
      'Bille rouge qui fait boire, verte qui distribue, pions spéciaux : les règles. Puis joues-y gratuitement : dès 2 joueurs, sur un seul téléphone, sans appli.',
  },
  'pile-poil': {
    title: 'Règles de Pile Poil, le défi du chrono à 10 secondes',
    description:
      'Arrêter le chrono pile à 10 s sans voir les chiffres : les règles. Puis joues-y gratuitement : dès 2 joueurs, sur un seul téléphone, sans appli.',
  },
  degaine: {
    title: 'Dégaine ! : règles du duel de réflexes à boire',
    description:
      'Au signal, le plus rapide gagne ; faux départs, leurres et tournoi : les règles. Puis joues-y gratuitement : dès 2 joueurs, sur un seul téléphone, sans appli.',
  },
  'doigt-du-destin': {
    title: 'Règles du Doigt du Destin, le tirage au doigt',
    description:
      'Un doigt chacun sur l’écran, victime, camps, ordre ou survie : les règles. Puis joues-y gratuitement : dès 2 joueurs, sur un seul téléphone, sans appli.',
  },
}

/**
 * Effectif qu'une page de règles annonce : les bornes EN LIGNE d'un jeu en
 * ligne, celles du téléphone qui tourne pour un jeu sans version en ligne
 * (sans `max` tant qu'aucun plafond local n'existe). Null si le registre
 * n'en dit rien.
 */
export function rulesPlayerBounds(
  game: Pick<GameMeta, 'onlineReady' | 'minPlayers' | 'maxPlayers' | 'localMinPlayers' | 'localMaxPlayers'>
): { min: number; max?: number } | null {
  if (game.onlineReady) {
    return game.minPlayers && game.maxPlayers ? { min: game.minPlayers, max: game.maxPlayers } : null
  }
  if (!game.localMinPlayers) return null
  return game.localMaxPlayers
    ? { min: game.localMinPlayers, max: game.localMaxPlayers }
    : { min: game.localMinPlayers }
}

const RULES_ROOT = path.join(process.cwd(), 'docs', 'rules', 'fr')

export function loadRulesDoc(id: RulesGameId): string | null {
  try {
    return fs.readFileSync(path.join(RULES_ROOT, `${id}.md`), 'utf-8')
  } catch {
    return null
  }
}
