import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import fr from '../../messages/fr.json'
import en from '../../messages/en.json'
import es from '../../messages/es.json'
// `it` est déjà le nom du test runner : l'italien est importé sous un alias.
import itMessages from '../../messages/it.json'
import {
  DEPARTURE_MESSAGE_KEYS,
  DEPARTURE_REASONS,
  ONLINE_ERROR_CODES,
  resolveDepartureReason,
  resolveOnlineErrorCode,
} from './online-errors'

/**
 * Les routes online ne renvoient plus que des codes stables : si l'un d'eux
 * n'a pas de traduction, le joueur lit « room_full » à l'écran. Ce test tient
 * l'invariant à chaque ajout de code, dans les 4 langues.
 */
const LANGUES = { fr, en, es, it: itMessages } as Record<
  string,
  { onlineLobby: { errors: Record<string, string> } }
>

/** Tous les fichiers de route sous un dossier d'API, récursivement. */
function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return routeFiles(full)
    return entry.name === 'route.ts' ? [full] : []
  })
}

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

  /**
   * Les routes auth et amis ne renvoient plus de phrase française mais un
   * code, passé à `apiError`. Un code inventé dans une route et jamais déclaré
   * ici échapperait à l'invariant de traduction au-dessus : le joueur lirait
   * « user_not_fond » à l'écran. Ce test relit les routes et refuse l'écart.
   */
  it('les routes auth et amis n’emploient que des codes déclarés', () => {
    const fichiers = [
      ...routeFiles(join(process.cwd(), 'src', 'app', 'api', 'auth')),
      ...routeFiles(join(process.cwd(), 'src', 'app', 'api', 'friends')),
    ]
    expect(fichiers.length).toBeGreaterThan(0)

    const inconnus = new Set<string>()
    for (const fichier of fichiers) {
      const source = readFileSync(fichier, 'utf8')
      for (const found of source.matchAll(/apiError\(\s*'([a-z0-9_]+)'/g)) {
        if (!ONLINE_ERROR_CODES.includes(found[1] as (typeof ONLINE_ERROR_CODES)[number])) {
          inconnus.add(found[1])
        }
      }
    }
    expect([...inconnus]).toEqual([])
  })

  /**
   * Le 403 d'un départ forcé porte sa raison (online/departures.ts) et le
   * client en affiche la phrase : une raison sans traduction serait lue
   * « left_kicked » à l'écran par le joueur qu'on vient de retirer.
   */
  for (const [langue, messages] of Object.entries(LANGUES)) {
    it(`${langue} : chaque raison de départ forcé a sa phrase`, () => {
      const manquantes = DEPARTURE_REASONS.filter(
        (reason) => !messages.onlineLobby.errors[DEPARTURE_MESSAGE_KEYS[reason]]
      )
      expect(manquantes).toEqual([])
    })
  }

  it('résout les raisons de départ connues et rejette le reste', () => {
    for (const reason of DEPARTURE_REASONS) expect(resolveDepartureReason(reason)).toBe(reason)
    expect(resolveDepartureReason('left')).toBeNull()
    expect(resolveDepartureReason(42)).toBeNull()
    expect(resolveDepartureReason(undefined)).toBeNull()
  })

  it('résout les alias hérités et rejette l’inconnu', () => {
    expect(resolveOnlineErrorCode('room_not_found')).toBe('room_not_found')
    expect(resolveOnlineErrorCode('pas-un-code')).toBeNull()
    expect(resolveOnlineErrorCode(undefined)).toBeNull()
  })

  /**
   * Ces noms sont levés TELS QUELS par les moteurs (`throw new XEngineError(…)`)
   * et voyagent jusqu'au client via `result.error`. Sans alias ils retombaient
   * sur « Action impossible » : le joueur voyait un refus sans savoir ce qu'on
   * lui demandait. Le tableau tient la correspondance nom moteur → code stable.
   */
  it('les refus des moteurs ont chacun leur code stable', () => {
    const attendus = {
      READING_TIME: 'reading_time',
      STOP_TOO_EARLY: 'stop_too_early',
      INCOMPLETE_STOP: 'incomplete_stop',
      CONTEST_NEEDS_MORE_PLAYERS: 'contest_needs_more_players',
    } as const
    for (const [nomMoteur, code] of Object.entries(attendus)) {
      expect(resolveOnlineErrorCode(nomMoteur)).toBe(code)
      // Un code non déclaré passerait le test précédent en silence.
      expect(ONLINE_ERROR_CODES).toContain(code)
    }
  })
})
