// ⚠️ SERVEUR SEUL : jamais importé côté client (garde d'import : data/attributes.test.ts, G5).
import type { EspionAttributeLot } from './index'

/**
 * Carnet, lot 03 : lieux 31 à 45 de ESPION_LOCATION_IDS, dans cet ordre.
 * Brief : node scripts/espion-attributes-brief.mjs 3
 * Validation : npx vitest run src/lib/espion/data/attributes.test.ts -t "attributes/lot-03"
 *
 * Lieux attendus : stade-de-football, station-spatiale, marche-bio, train, usine, cave-a-vin, yacht, aire-d-autoroute, banque, bureau, caserne-de-pompiers, donjon-medieval, chantier-de-construction, chateau, cimetiere.
 */
export const ESPION_ATTRIBUTES_LOT_03: EspionAttributeLot = {
  // Moment any : matchs du samedi après-midi autant que du soir sous les projecteurs.
  'stade-de-football': { where: 'outside', when: 'any', price: 'pricey', outfit: 'casual', noise: 'loud', food: 'snack', crowd: 'crowd', company: 'friends', stay: 'hours', moving: 'fixed', entry: 'ticket', mood: 'fun' },
  // Prix any : l'astronaute n'y paie rien, comme au sous-marin, mais le voyage coûte une fortune.
  // Repas any : des plats en sachet, vrai repas pour les uns, en-cas pour les autres.
  'station-spatiale': { where: 'inside', when: 'any', price: 'any', outfit: 'uniform', noise: 'quiet', food: 'any', crowd: 'few', company: 'work', stay: 'days', moving: 'moving', entry: 'restricted', mood: 'serious' },
  'marche-bio': { where: 'outside', when: 'day', price: 'pricey', outfit: 'casual', noise: 'quiet', food: 'snack', crowd: 'crowd', company: 'family', stay: 'minutes', moving: 'moving', entry: 'open', mood: 'fun' },
  train: { where: 'inside', when: 'day', price: 'any', outfit: 'casual', noise: 'quiet', food: 'snack', crowd: 'crowd', company: 'alone', stay: 'hours', moving: 'fixed', entry: 'ticket', mood: 'any' },
  usine: { where: 'inside', when: 'day', price: 'free', outfit: 'uniform', noise: 'loud', food: 'snack', crowd: 'crowd', company: 'work', stay: 'hours', moving: 'fixed', entry: 'restricted', mood: 'serious' },
  'cave-a-vin': { where: 'inside', when: 'any', price: 'pricey', outfit: 'casual', noise: 'quiet', food: 'snack', crowd: 'few', company: 'friends', stay: 'hours', moving: 'fixed', entry: 'ticket', mood: 'fun' },
  // Moment any : on y dort, comme sur un bateau de croisière ; bronzage le jour, fête le soir.
  yacht: { where: 'outside', when: 'any', price: 'pricey', outfit: 'swim', noise: 'any', food: 'meal', crowd: 'few', company: 'friends', stay: 'days', moving: 'fixed', entry: 'restricted', mood: 'fun' },
  'aire-d-autoroute': { where: 'any', when: 'day', price: 'cheap', outfit: 'casual', noise: 'loud', food: 'snack', crowd: 'crowd', company: 'family', stay: 'minutes', moving: 'moving', entry: 'open', mood: 'any' },
  // Tenue du client, comme le reste de la ligne (seul, quelques minutes) : le costume est celui du banquier.
  banque: { where: 'inside', when: 'day', price: 'free', outfit: 'casual', noise: 'quiet', food: 'none', crowd: 'few', company: 'alone', stay: 'minutes', moving: 'fixed', entry: 'open', mood: 'tense' },
  bureau: { where: 'inside', when: 'day', price: 'free', outfit: 'smart', noise: 'quiet', food: 'snack', crowd: 'few', company: 'work', stay: 'hours', moving: 'fixed', entry: 'restricted', mood: 'serious' },
  'caserne-de-pompiers': { where: 'inside', when: 'any', price: 'free', outfit: 'uniform', noise: 'loud', food: 'meal', crowd: 'few', company: 'work', stay: 'days', moving: 'moving', entry: 'restricted', mood: 'tense' },
  'donjon-medieval': { where: 'inside', when: 'any', price: 'free', outfit: 'any', noise: 'quiet', food: 'snack', crowd: 'few', company: 'alone', stay: 'days', moving: 'fixed', entry: 'restricted', mood: 'tense' },
  'chantier-de-construction': { where: 'outside', when: 'day', price: 'free', outfit: 'uniform', noise: 'loud', food: 'snack', crowd: 'few', company: 'work', stay: 'hours', moving: 'moving', entry: 'restricted', mood: 'serious' },
  chateau: { where: 'inside', when: 'day', price: 'pricey', outfit: 'casual', noise: 'quiet', food: 'none', crowd: 'any', company: 'family', stay: 'hours', moving: 'moving', entry: 'ticket', mood: 'fun' },
  // Tenue any, comme à la cathédrale : chic pour un enterrement, de tous les jours pour fleurir une tombe.
  cimetiere: { where: 'outside', when: 'day', price: 'free', outfit: 'any', noise: 'quiet', food: 'none', crowd: 'few', company: 'family', stay: 'minutes', moving: 'fixed', entry: 'open', mood: 'serious' },
}
