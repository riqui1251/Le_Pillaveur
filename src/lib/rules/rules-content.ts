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
    title: 'Règles du Loup-Garou en ligne — rôles, nuits et votes',
    description:
      'Toutes les règles du Loup-Garou en ligne : rôles (Voyante, Sorcière, Chasseur, Salvateur, Corbeau, Ancien), déroulé des nuits, votes, maire et conditions de victoire. Jouez gratuitement à 4-12 avec chat vocal.',
  },
  imposteur: {
    title: "Règles de L'Imposteur — le jeu du mot secret",
    description:
      "Les règles complètes de L'Imposteur : un mot secret pour le village, un imposteur qui bluffe, des indices et un vote. Jouable gratuitement en ligne de 3 à 10 joueurs.",
  },
  quiz: {
    title: 'Règles du Grand Pillaveur — quiz de rapidité entre amis',
    description:
      'Le quiz en ligne du Pillaveur : des centaines de questions, un buzzer, des points à la vitesse. Règles, score et astuces pour jouer gratuitement entre amis.',
  },
  menteur: {
    title: 'Règles du Menteur (dés) — enchères et bluff au gobelet',
    description:
      'Les règles du Menteur en ligne : dés cachés sous le gobelet, enchères sur les dés de la table, et « MENTEUR ! » pour démasquer. Gratuit, de 2 à 6 joueurs.',
  },
  'petit-buveur': {
    title: 'Règles du Petit Buveur — le jeu de plateau des soirées',
    description:
      'Le Petit Buveur en ligne : un plateau, un dé, des cases à effets et des défis. Règles complètes, mode soft sans alcool, jouable gratuitement entre amis.',
  },
  'toucher-coule': {
    title: 'Règles du Toucher-Coulé — bataille navale en équipes',
    description:
      'La bataille navale du Pillaveur : placement des navires, tirs en équipes, bots de remplacement. Règles complètes pour jouer gratuitement en ligne.',
  },
  bluff: {
    title: 'Règles du Grand Bluff — inventez la meilleure fausse réponse',
    description:
      'Le Grand Bluff en ligne : chacun invente une fausse réponse crédible, puis on vote pour la vraie. Règles, points et astuces, de 3 à 10 joueurs.',
  },
  espion: {
    title: "Règles de Qui est l'Espion ? — trouvez qui ignore le lieu",
    description:
      "Qui est l'Espion ? en ligne : tout le monde connaît le lieu sauf l'espion. Questions, soupçons, accusation publique. Règles complètes, 3 à 8 joueurs.",
  },
  tabou: {
    title: 'Règles du Tabou Vocal — faire deviner sans les mots interdits',
    description:
      'Le Tabou du Pillaveur : faites deviner un mot au chat vocal sans prononcer les mots interdits, en équipes. Règles complètes, 4 à 12 joueurs.',
  },
  crobard: {
    title: 'Règles du Crobard — dessinez, devinez, marquez',
    description:
      'Le Crobard en ligne : un joueur dessine, les autres devinent au plus vite. Règles, points et astuces pour jouer gratuitement de 3 à 12 joueurs.',
  },
  'telephone-dessine': {
    title: 'Règles du Téléphone Dessiné — le téléphone arabe en dessins',
    description:
      'Le Téléphone Dessiné en ligne : une phrase devient un dessin, qui redevient une phrase… et tout dérape. Règles complètes, 3 à 8 joueurs.',
  },
  purple: {
    title: 'Règles du Purple — rouge, noir ou purple ?',
    description:
      'Le Purple en ligne : pariez sur la couleur de la prochaine carte — rouge, noir, ou l’alternance purple. Règles complètes et jouable gratuitement.',
  },
  '1220': {
    title: 'Règles du 1220 — deux dés, quatre paris',
    description:
      'Le 1220 en ligne : un dé 12 et un dé 20, des paris sur la parité, la plage et deux chiffres clés. Règles complètes du jeu d’apéro du Pillaveur.',
  },
  'sans-filtre': {
    title: 'Règles de Sans Filtre — cartes à trous et mauvaise foi',
    description:
      'Sans Filtre en ligne : une carte noire à compléter, des réponses anonymes, un juge qui couronne la plus drôle. Règles complètes, 4 à 16 joueurs, gratuit avec chat vocal.',
  },
  'mots-codes': {
    title: 'Règles de Mots Codés — indices, équipes et assassin',
    description:
      'Mots Codés en ligne : 25 mots, deux équipes, un Maître-mot par camp qui relie plusieurs mots d’un seul indice. Règles complètes, 4 à 16 joueurs, gratuit avec chat vocal.',
  },
  dilemmes: {
    title: 'Règles de Dilemmes — votes secrets et révélations',
    description:
      'Dilemmes en ligne : Tu préfères, Je n’ai jamais et Qui de la table en votes secrets révélés d’un coup — la minorité trinque. Règles complètes, 3 à 16 joueurs, gratuit.',
  },
  'petit-bac': {
    title: 'Règles du Petit Bac en ligne — lettre, STOP et comptage',
    description:
      'Le Petit Bac du Pillaveur : une lettre, cinq catégories, le premier qui finit crie STOP. Comptage automatique, contestations à la majorité. Règles complètes, 2 à 16 joueurs, gratuit.',
  },
  // Président masqué pour l'instant — réactiver cette entrée avec l'id dans rules-ids.ts.
  // president: {
  //   title: 'Règles du Président en ligne — combos, coupe au 2 et Trou',
  //   description:
  //     'Le Président en ligne : combos strictement plus forts, le 2 coupe le pli, premier sorti = Président, dernier = Trou. Échange automatique entre manches. Règles complètes, 4 à 8 joueurs, gratuit.',
  // },
}

const RULES_ROOT = path.join(process.cwd(), 'docs', 'rules', 'fr')

export function loadRulesDoc(id: RulesGameId): string | null {
  try {
    return fs.readFileSync(path.join(RULES_ROOT, `${id}.md`), 'utf-8')
  } catch {
    return null
  }
}
