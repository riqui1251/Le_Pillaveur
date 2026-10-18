// ⚠️ SERVEUR SEUL : jamais importé côté client (garde d'import : data/attributes.test.ts, G5).
import type { EspionAttributeLot } from './index'

/**
 * Carnet, lot 05 : lieux 61 à 75 de ESPION_LOCATION_IDS, dans cet ordre.
 * Brief : node scripts/espion-attributes-brief.mjs 5
 * Validation : npx vitest run src/lib/espion/data/attributes.test.ts -t "attributes/lot-05"
 *
 * Lieux attendus : patinoire, phare, piscine-municipale, plateau-de-television, poste-frontiere, base-militaire, refuge-de-montagne, salle-des-fetes, salon-de-coiffure, sauna, station-de-metro, station-service, studio-de-tatouage, village-de-vacances, observatoire-volcanique.
 */
export const ESPION_ATTRIBUTES_LOT_05: EspionAttributeLot = {
  // Moment any : séances l'après-midi, nocturnes le soir.
  patinoire: { where: 'inside', when: 'any', price: 'cheap', outfit: 'casual', noise: 'loud', food: 'snack', crowd: 'crowd', company: 'friends', stay: 'hours', moving: 'moving', entry: 'ticket', mood: 'fun' },
  // Moment any : on le visite de jour, mais il ne sert que la nuit.
  // Seul : l'image du gardien de phare ; on grimpe dans la tour pour la vue du dehors, d'où le any.
  phare: { where: 'any', when: 'any', price: 'cheap', outfit: 'casual', noise: 'quiet', food: 'none', crowd: 'few', company: 'alone', stay: 'minutes', moving: 'moving', entry: 'ticket', mood: 'fun' },
  'piscine-municipale': { where: 'inside', when: 'day', price: 'cheap', outfit: 'swim', noise: 'loud', food: 'none', crowd: 'crowd', company: 'any', stay: 'hours', moving: 'moving', entry: 'ticket', mood: 'fun' },
  'plateau-de-television': { where: 'inside', when: 'any', price: 'free', outfit: 'smart', noise: 'loud', food: 'none', crowd: 'crowd', company: 'work', stay: 'hours', moving: 'fixed', entry: 'restricted', mood: 'any' },
  'poste-frontiere': { where: 'outside', when: 'any', price: 'free', outfit: 'any', noise: 'quiet', food: 'none', crowd: 'few', company: 'any', stay: 'minutes', moving: 'fixed', entry: 'restricted', mood: 'tense' },
  // Moment any : on y vit et on y monte la garde jour et nuit, comme à la caserne de pompiers.
  'base-militaire': { where: 'outside', when: 'any', price: 'free', outfit: 'uniform', noise: 'loud', food: 'meal', crowd: 'crowd', company: 'work', stay: 'days', moving: 'moving', entry: 'restricted', mood: 'serious' },
  'refuge-de-montagne': { where: 'inside', when: 'night', price: 'cheap', outfit: 'any', noise: 'quiet', food: 'meal', crowd: 'few', company: 'friends', stay: 'days', moving: 'fixed', entry: 'open', mood: 'fun' },
  'salle-des-fetes': { where: 'inside', when: 'night', price: 'cheap', outfit: 'casual', noise: 'loud', food: 'meal', crowd: 'crowd', company: 'family', stay: 'hours', moving: 'any', entry: 'open', mood: 'fun' },
  'salon-de-coiffure': { where: 'inside', when: 'day', price: 'cheap', outfit: 'casual', noise: 'quiet', food: 'none', crowd: 'few', company: 'alone', stay: 'any', moving: 'fixed', entry: 'open', mood: 'fun' },
  sauna: { where: 'inside', when: 'any', price: 'cheap', outfit: 'swim', noise: 'quiet', food: 'none', crowd: 'few', company: 'any', stay: 'minutes', moving: 'fixed', entry: 'ticket', mood: 'fun' },
  // Métro, boulot, dodo : on le prend d'abord pour aller travailler.
  'station-de-metro': { where: 'inside', when: 'day', price: 'cheap', outfit: 'casual', noise: 'loud', food: 'none', crowd: 'crowd', company: 'work', stay: 'minutes', moving: 'moving', entry: 'ticket', mood: 'any' },
  'station-service': { where: 'outside', when: 'day', price: 'pricey', outfit: 'casual', noise: 'quiet', food: 'snack', crowd: 'few', company: 'alone', stay: 'minutes', moving: 'any', entry: 'open', mood: 'any' },
  // Tendue : l'aiguille, la douleur, le motif qu'on gardera à vie.
  'studio-de-tatouage': { where: 'inside', when: 'day', price: 'pricey', outfit: 'casual', noise: 'quiet', food: 'none', crowd: 'few', company: 'alone', stay: 'hours', moving: 'fixed', entry: 'ticket', mood: 'tense' },
  // Moment any : on y vit jour et nuit, comme au camping. Entrée sur réservation, comme à l'hôtel.
  // En place : allongé sur un transat au bord de la piscine, à l'inverse du paquebot qu'on arpente.
  'village-de-vacances': { where: 'outside', when: 'any', price: 'pricey', outfit: 'swim', noise: 'loud', food: 'meal', crowd: 'crowd', company: 'family', stay: 'days', moving: 'fixed', entry: 'ticket', mood: 'fun' },
  'observatoire-volcanique': { where: 'outside', when: 'day', price: 'free', outfit: 'uniform', noise: 'quiet', food: 'none', crowd: 'few', company: 'work', stay: 'hours', moving: 'moving', entry: 'restricted', mood: 'tense' },
}
