// ⚠️ SERVEUR SEUL : jamais importé côté client (garde d'import : data/attributes.test.ts, G5).
import type { EspionAttributeLot } from './index'

/**
 * Carnet, lot 04 : lieux 46 à 60 de ESPION_LOCATION_IDS, dans cet ordre.
 * Brief : node scripts/espion-attributes-brief.mjs 4
 * Validation : npx vitest run src/lib/espion/data/attributes.test.ts -t "attributes/lot-04"
 *
 * Lieux attendus : club-de-golf, salle-de-concert, salle-de-mariage, ecole-de-danse, festival-de-musique, foret, gare, jardin-botanique, laboratoire, marche-aux-poissons, mine, monastere, opera, palais-de-justice, parc-national.
 */
export const ESPION_ATTRIBUTES_LOT_04: EspionAttributeLot = {
  // Le repas au club-house ou l'en-cas pendant le parcours : aucun ne domine.
  'club-de-golf': { where: 'outside', when: 'day', price: 'pricey', outfit: 'smart', noise: 'quiet', food: 'any', crowd: 'few', company: 'friends', stay: 'hours', moving: 'moving', entry: 'restricted', mood: 'serious' },
  'salle-de-concert': { where: 'inside', when: 'night', price: 'pricey', outfit: 'casual', noise: 'loud', food: 'none', crowd: 'crowd', company: 'friends', stay: 'hours', moving: 'fixed', entry: 'ticket', mood: 'fun' },
  // L'invité ne paie rien, les mariés paient une fortune ; on dîne assis puis on danse.
  'salle-de-mariage': { where: 'inside', when: 'night', price: 'any', outfit: 'smart', noise: 'loud', food: 'meal', crowd: 'crowd', company: 'family', stay: 'hours', moving: 'any', entry: 'restricted', mood: 'fun' },
  // Cours d'enfants l'après-midi, d'adultes le soir ; on s'y inscrit seul, en couple ou pour son enfant.
  // Tenue any : justaucorps, jogging ou robe de salsa selon la danse.
  'ecole-de-danse': { where: 'inside', when: 'any', price: 'cheap', outfit: 'any', noise: 'loud', food: 'none', crowd: 'few', company: 'any', stay: 'hours', moving: 'moving', entry: 'restricted', mood: 'fun' },
  'festival-de-musique': { where: 'outside', when: 'night', price: 'pricey', outfit: 'casual', noise: 'loud', food: 'snack', crowd: 'crowd', company: 'friends', stay: 'days', moving: 'moving', entry: 'ticket', mood: 'fun' },
  foret: { where: 'outside', when: 'day', price: 'free', outfit: 'casual', noise: 'quiet', food: 'none', crowd: 'few', company: 'any', stay: 'hours', moving: 'moving', entry: 'open', mood: 'fun' },
  // Gratuit et entrée libre : on y attend ou on y accueille quelqu'un sans billet ; le prix du trajet se dit au train.
  // L'aéroport, lui, ne s'entre qu'avec sa carte d'embarquement, d'où son prix.
  // Ambiance any, comme au train et au métro : course au quai pour les uns, attente tranquille pour les autres ;
  // seul l'aéroport, avec ses contrôles de sûreté, se dit tendu sans hésiter.
  gare: { where: 'inside', when: 'day', price: 'free', outfit: 'casual', noise: 'loud', food: 'snack', crowd: 'crowd', company: 'alone', stay: 'minutes', moving: 'moving', entry: 'open', mood: 'any' },
  'jardin-botanique': { where: 'outside', when: 'day', price: 'cheap', outfit: 'casual', noise: 'quiet', food: 'none', crowd: 'few', company: 'family', stay: 'hours', moving: 'moving', entry: 'ticket', mood: 'fun' },
  laboratoire: { where: 'inside', when: 'day', price: 'free', outfit: 'uniform', noise: 'quiet', food: 'none', crowd: 'few', company: 'work', stay: 'hours', moving: 'fixed', entry: 'restricted', mood: 'serious' },
  'marche-aux-poissons': { where: 'outside', when: 'day', price: 'cheap', outfit: 'casual', noise: 'loud', food: 'none', crowd: 'crowd', company: 'alone', stay: 'minutes', moving: 'moving', entry: 'open', mood: 'fun' },
  // Au fond, ni jour ni nuit ; on creuse à son poste puis on parcourt les galeries.
  mine: { where: 'inside', when: 'any', price: 'free', outfit: 'uniform', noise: 'loud', food: 'snack', crowd: 'few', company: 'work', stay: 'hours', moving: 'any', entry: 'restricted', mood: 'tense' },
  // Moment any : les moines y vivent et prient aussi la nuit, comme on monte la garde à la base militaire.
  monastere: { where: 'inside', when: 'any', price: 'free', outfit: 'uniform', noise: 'quiet', food: 'meal', crowd: 'few', company: 'alone', stay: 'days', moving: 'fixed', entry: 'restricted', mood: 'serious' },
  // On y va surtout en couple, ce qu'aucune valeur ne dit.
  opera: { where: 'inside', when: 'night', price: 'pricey', outfit: 'smart', noise: 'quiet', food: 'none', crowd: 'crowd', company: 'any', stay: 'hours', moving: 'fixed', entry: 'ticket', mood: 'serious' },
  // Salle des pas perdus, avocats, public des audiences : un bâtiment public très fréquenté.
  // Entrée any : le public assiste librement aux audiences, les parties y viennent sur convocation.
  'palais-de-justice': { where: 'inside', when: 'day', price: 'free', outfit: 'smart', noise: 'quiet', food: 'none', crowd: 'crowd', company: 'alone', stay: 'hours', moving: 'fixed', entry: 'any', mood: 'tense' },
  'parc-national': { where: 'outside', when: 'day', price: 'free', outfit: 'casual', noise: 'quiet', food: 'snack', crowd: 'few', company: 'family', stay: 'days', moving: 'moving', entry: 'open', mood: 'fun' },
}
