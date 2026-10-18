// ⚠️ SERVEUR SEUL : jamais importé côté client (garde d'import : data/attributes.test.ts, G5).
import type { EspionAttributeLot } from './index'

/**
 * Carnet, lot 01 : lieux 1 à 15 de ESPION_LOCATION_IDS, dans cet ordre.
 * Brief : node scripts/espion-attributes-brief.mjs 1
 * Validation : npx vitest run src/lib/espion/data/attributes.test.ts -t "attributes/lot-01"
 *
 * Lieux attendus : plage, hopital, ecole, aeroport, restaurant, cinema, casino, sous-marin, cirque, ambassade, boite-de-nuit, commissariat-de-police, spa, supermarche, theatre.
 */
export const ESPION_ATTRIBUTES_LOT_01: EspionAttributeLot = {
  plage: { where: 'outside', when: 'day', price: 'free', outfit: 'swim', noise: 'any', food: 'snack', crowd: 'crowd', company: 'any', stay: 'hours', moving: 'fixed', entry: 'open', mood: 'fun' },
  hopital: { where: 'inside', when: 'any', price: 'free', outfit: 'uniform', noise: 'quiet', food: 'meal', crowd: 'crowd', company: 'any', stay: 'days', moving: 'fixed', entry: 'open', mood: 'serious' },
  ecole: { where: 'inside', when: 'day', price: 'free', outfit: 'casual', noise: 'loud', food: 'meal', crowd: 'crowd', company: 'any', stay: 'hours', moving: 'fixed', entry: 'restricted', mood: 'serious' },
  aeroport: { where: 'inside', when: 'any', price: 'pricey', outfit: 'casual', noise: 'loud', food: 'snack', crowd: 'crowd', company: 'any', stay: 'hours', moving: 'moving', entry: 'ticket', mood: 'tense' },
  restaurant: { where: 'inside', when: 'any', price: 'pricey', outfit: 'casual', noise: 'any', food: 'meal', crowd: 'crowd', company: 'friends', stay: 'hours', moving: 'fixed', entry: 'open', mood: 'fun' },
  cinema: { where: 'inside', when: 'night', price: 'cheap', outfit: 'casual', noise: 'quiet', food: 'snack', crowd: 'crowd', company: 'friends', stay: 'hours', moving: 'fixed', entry: 'ticket', mood: 'fun' },
  casino: { where: 'inside', when: 'night', price: 'pricey', outfit: 'smart', noise: 'loud', food: 'none', crowd: 'crowd', company: 'friends', stay: 'hours', moving: 'fixed', entry: 'restricted', mood: 'any' },
  // Affluence any : une centaine de marins serrés dans un tube, « quelques-uns » pour les uns, « on se marche
  // dessus » pour les autres ; la station spatiale (une poignée) et la base militaire (des centaines) tranchent, elles.
  'sous-marin': { where: 'inside', when: 'any', price: 'free', outfit: 'uniform', noise: 'quiet', food: 'meal', crowd: 'any', company: 'work', stay: 'days', moving: 'fixed', entry: 'restricted', mood: 'tense' },
  cirque: { where: 'inside', when: 'any', price: 'cheap', outfit: 'casual', noise: 'loud', food: 'snack', crowd: 'crowd', company: 'family', stay: 'hours', moving: 'fixed', entry: 'ticket', mood: 'fun' },
  ambassade: { where: 'inside', when: 'day', price: 'free', outfit: 'smart', noise: 'quiet', food: 'none', crowd: 'few', company: 'alone', stay: 'hours', moving: 'fixed', entry: 'restricted', mood: 'serious' },
  'boite-de-nuit': { where: 'inside', when: 'night', price: 'pricey', outfit: 'smart', noise: 'loud', food: 'none', crowd: 'crowd', company: 'friends', stay: 'hours', moving: 'moving', entry: 'ticket', mood: 'fun' },
  'commissariat-de-police': { where: 'inside', when: 'any', price: 'free', outfit: 'uniform', noise: 'any', food: 'none', crowd: 'few', company: 'any', stay: 'hours', moving: 'fixed', entry: 'open', mood: 'tense' },
  spa: { where: 'inside', when: 'day', price: 'pricey', outfit: 'swim', noise: 'quiet', food: 'none', crowd: 'few', company: 'any', stay: 'hours', moving: 'fixed', entry: 'ticket', mood: 'fun' },
  supermarche: { where: 'inside', when: 'day', price: 'cheap', outfit: 'casual', noise: 'any', food: 'none', crowd: 'crowd', company: 'alone', stay: 'minutes', moving: 'moving', entry: 'open', mood: 'any' },
  // Compagnie any, comme à l'opéra : on y va souvent en couple, ce qu'aucune valeur ne dit.
  // Tenue any : on s'habille pour une première, pas pour une comédie du samedi soir ; l'opéra, lui, reste chic.
  theatre: { where: 'inside', when: 'night', price: 'pricey', outfit: 'any', noise: 'quiet', food: 'none', crowd: 'crowd', company: 'any', stay: 'hours', moving: 'fixed', entry: 'ticket', mood: 'serious' },
}
