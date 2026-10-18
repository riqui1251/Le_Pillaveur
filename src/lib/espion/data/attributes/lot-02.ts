// ⚠️ SERVEUR SEUL : jamais importé côté client (garde d'import : data/attributes.test.ts, G5).
import type { EspionAttributeLot } from './index'

/**
 * Carnet, lot 02 : lieux 16 à 30 de ESPION_LOCATION_IDS, dans cet ordre.
 * Brief : node scripts/espion-attributes-brief.mjs 2
 * Validation : npx vitest run src/lib/espion/data/attributes.test.ts -t "attributes/lot-02"
 *
 * Lieux attendus : universite, zoo, bibliotheque, cathedrale, camping, bateau-de-croisiere, studio-de-cinema, ferme, station-de-ski, hotel, musee, parc-d-attractions, prison, restaurant-japonais, salle-de-sport.
 */
export const ESPION_ATTRIBUTES_LOT_02: EspionAttributeLot = {
  // price any : frais d'inscription presque nuls en France, très chers au Royaume-Uni.
  universite: { where: 'inside', when: 'day', price: 'any', outfit: 'casual', noise: 'quiet', food: 'snack', crowd: 'crowd', company: 'friends', stay: 'hours', moving: 'fixed', entry: 'open', mood: 'serious' },
  zoo: { where: 'outside', when: 'day', price: 'cheap', outfit: 'casual', noise: 'quiet', food: 'snack', crowd: 'crowd', company: 'family', stay: 'hours', moving: 'moving', entry: 'ticket', mood: 'fun' },
  bibliotheque: { where: 'inside', when: 'day', price: 'free', outfit: 'casual', noise: 'quiet', food: 'none', crowd: 'few', company: 'alone', stay: 'hours', moving: 'fixed', entry: 'open', mood: 'serious' },
  // Messe ou visite : la tenue, l'affluence et la station assise en dépendent.
  cathedrale: { where: 'inside', when: 'day', price: 'free', outfit: 'any', noise: 'quiet', food: 'none', crowd: 'any', company: 'family', stay: 'minutes', moving: 'any', entry: 'open', mood: 'serious' },
  camping: { where: 'outside', when: 'any', price: 'cheap', outfit: 'casual', noise: 'any', food: 'meal', crowd: 'crowd', company: 'family', stay: 'days', moving: 'any', entry: 'ticket', mood: 'fun' },
  // Véhicule fermé : cabines, restaurants et spectacles. Tenue any : maillot au bord de la piscine le jour, gala le soir.
  'bateau-de-croisiere': { where: 'inside', when: 'any', price: 'pricey', outfit: 'any', noise: 'loud', food: 'meal', crowd: 'crowd', company: 'family', stay: 'days', moving: 'moving', entry: 'ticket', mood: 'fun' },
  // Costumes pour les acteurs, vêtements de tous les jours pour l'équipe.
  'studio-de-cinema': { where: 'inside', when: 'day', price: 'free', outfit: 'any', noise: 'quiet', food: 'snack', crowd: 'crowd', company: 'work', stay: 'hours', moving: 'moving', entry: 'restricted', mood: 'serious' },
  ferme: { where: 'outside', when: 'day', price: 'free', outfit: 'uniform', noise: 'quiet', food: 'meal', crowd: 'few', company: 'family', stay: 'days', moving: 'moving', entry: 'any', mood: 'any' },
  // Tenue any : la combinaison de ski ne se dit ni « en uniforme » ni « en tenue de travail ».
  'station-de-ski': { where: 'outside', when: 'day', price: 'pricey', outfit: 'any', noise: 'any', food: 'meal', crowd: 'crowd', company: 'friends', stay: 'days', moving: 'moving', entry: 'ticket', mood: 'fun' },
  hotel: { where: 'inside', when: 'night', price: 'pricey', outfit: 'casual', noise: 'quiet', food: 'meal', crowd: 'few', company: 'any', stay: 'days', moving: 'fixed', entry: 'ticket', mood: 'fun' },
  musee: { where: 'inside', when: 'day', price: 'cheap', outfit: 'casual', noise: 'quiet', food: 'none', crowd: 'any', company: 'any', stay: 'hours', moving: 'moving', entry: 'ticket', mood: 'serious' },
  'parc-d-attractions': { where: 'outside', when: 'day', price: 'pricey', outfit: 'casual', noise: 'loud', food: 'snack', crowd: 'crowd', company: 'family', stay: 'hours', moving: 'moving', entry: 'ticket', mood: 'fun' },
  prison: { where: 'inside', when: 'any', price: 'free', outfit: 'uniform', noise: 'loud', food: 'meal', crowd: 'crowd', company: 'alone', stay: 'days', moving: 'fixed', entry: 'restricted', mood: 'tense' },
  'restaurant-japonais': { where: 'inside', when: 'any', price: 'pricey', outfit: 'casual', noise: 'quiet', food: 'meal', crowd: 'any', company: 'friends', stay: 'hours', moving: 'fixed', entry: 'open', mood: 'fun' },
  // Tenue any : la tenue de sport ne se dit ni « en maillot de bain » ni « comme tous les jours ».
  'salle-de-sport': { where: 'inside', when: 'any', price: 'cheap', outfit: 'any', noise: 'loud', food: 'none', crowd: 'crowd', company: 'alone', stay: 'hours', moving: 'moving', entry: 'restricted', mood: 'serious' },
}
