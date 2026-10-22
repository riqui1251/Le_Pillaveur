import { describe, expect, it } from 'vitest'
import { IntlMessageFormat } from 'intl-messageformat'
import { TC_SPEECH_KINDS } from '@/lib/toucher-coule/engine'
import {
  SPEECH_LOCALES,
  describeSpeechCatalogue,
  flattenSpeechCatalogue,
  speechCatalogueOf,
} from '../bot-speech/catalogue-spec'

/**
 * Catalogue des paroles du Touché-Coulé (games.toucher-coule.game), dans les
 * 4 langues : les exigences communes aux jeux à paroles (catalogue-spec.ts),
 * puis les règles propres au jeu.
 *
 * Aucune phrase ne situe un navire : ni case, ni ligne, ni colonne, ni
 * voisinage — un bot touché râle, il ne dit pas où sont ses autres bateaux.
 * Jeu joué aussi Sans alcool (drinkFree) : ni mot de boisson ni chiffre.
 */

const NODE = 'games.toucher-coule.game'

describeSpeechCatalogue({
  node: NODE,
  kinds: TC_SPEECH_KINDS,
  traitKinds: ['sunk', 'taunt'],
  personaKind: 'sunk',
  maxChars: 70,
  drinkFree: true,
})

/** Ce qui situerait un navire sur la grille. */
const WHERE: Record<string, RegExp> = {
  fr: /gauche|droite|en haut|en bas|ligne|colonne|\bcoin\b|à côté|voisin|tout près|pas loin|\bcase/i,
  en: /\bleft\b|\bright\b|\brows?\b|columns?|corners?|next to|nearby|\bnear\b|above|below|\bcells?\b/i,
  es: /izquierda|derecha|arriba|abajo|\bfila|columna|esquina|al lado|\bcerca\b|\blejos\b|casilla/i,
  it: /sinistra|destra|sopra|sotto|\briga\b|colonna|angolo|accanto|vicino|lontano|casella/i,
}
const GENRES = ['f', 'm', 'other'] as const

describe.each(SPEECH_LOCALES)('toucher-coule/%s', (locale) => {
  const game = speechCatalogueOf(NODE, locale)
  const flat = flattenSpeechCatalogue(game)
  const sayKeys = Object.keys(flat).filter((key) => !key.startsWith('botTic.'))

  it('les mêmes clés que le français, tics compris', () => {
    const fr = flattenSpeechCatalogue(speechCatalogueOf(NODE, 'fr'))
    expect(Object.keys(flat).sort()).toEqual(Object.keys(fr).sort())
  })

  it('aucune position de navire, dans aucune phrase rendue (tics exclus)', () => {
    for (const key of sayKeys) {
      const format = new IntlMessageFormat(flat[key], locale)
      for (const genre of GENRES) {
        const line = String(format.format({ name: 'Mauricette', speaker: genre, target: genre }))
        expect(line, `${key} : ${line}`).not.toMatch(WHERE[locale])
      }
    }
  })
})
