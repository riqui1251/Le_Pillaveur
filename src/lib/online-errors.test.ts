import { describe, expect, it } from 'vitest'
import fr from '../../messages/fr.json'
import en from '../../messages/en.json'
import es from '../../messages/es.json'
// `it` est déjà le nom du test runner : l'italien est importé sous un alias.
import itMessages from '../../messages/it.json'
import { ONLINE_ERROR_CODES, resolveOnlineErrorCode } from './online-errors'

/**
 * Les routes online ne renvoient plus que des codes stables : si l'un d'eux
 * n'a pas de traduction, le joueur lit « room_full » à l'écran. Ce test tient
 * l'invariant à chaque ajout de code, dans les 4 langues.
 */
const LANGUES = { fr, en, es, it: itMessages } as Record<
  string,
  { onlineLobby: { errors: Record<string, string> } }
>

describe('codes d’erreur online', () => {
  for (const [langue, messages] of Object.entries(LANGUES)) {
    it(`${langue} : chaque code a une traduction`, () => {
      const manquantes = ONLINE_ERROR_CODES.filter((code) => !messages.onlineLobby.errors[code])
      expect(manquantes).toEqual([])
    })
  }

  it('aucune traduction n’est recopiée du français', () => {
    for (const [langue, messages] of Object.entries(LANGUES)) {
      if (langue === 'fr') continue
      const recopiees = ONLINE_ERROR_CODES.filter((code) => {
        const texte = messages.onlineLobby.errors[code]
        const source = fr.onlineLobby.errors[code as keyof typeof fr.onlineLobby.errors]
        // Un mot isolé peut légitimement coïncider (« Action ») : on ne
        // signale que les phrases entières identiques.
        return typeof texte === 'string' && texte === source && texte.length > 20
      })
      expect({ langue, recopiees }).toEqual({ langue, recopiees: [] })
    }
  })

  it('résout les alias hérités et rejette l’inconnu', () => {
    expect(resolveOnlineErrorCode('room_not_found')).toBe('room_not_found')
    expect(resolveOnlineErrorCode('pas-un-code')).toBeNull()
    expect(resolveOnlineErrorCode(undefined)).toBeNull()
  })
})
