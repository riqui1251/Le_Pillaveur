import { describe, expect, it } from 'vitest'
import { createTranslator, type AbstractIntlMessages } from 'next-intl'
import fr from '../../../messages/fr.json'
import en from '../../../messages/en.json'
import es from '../../../messages/es.json'
import itMessages from '../../../messages/it.json'
import { METHOD_GROUPS, methodGroups, resolveMessage, type MethodParams } from '@/lib/supervision/method'

const PARAMS: MethodParams = {
  onlineMinutes: 5,
  activeMinutes: 2,
  returnCohorts: { d1: { from: 8, to: 2 }, d7: { from: 21, to: 8 } },
  returnMinCohort: 10,
  growthWindows: { registeredShareDays: 30, playersByGameDays: 7 },
}

// Les catalogues portent des tableaux (tutoriels des jeux) que le type de next-intl ne décrit pas.
const CATALOGUES = { fr, en, es, it: itMessages } as unknown as Record<string, AbstractIntlMessages>

/** Toutes les clés de `supervision.*` dont le nom finit par « Def » : les définitions des chiffres. */
function definitionKeys(): string[] {
  const keys: string[] = []
  const walk = (node: unknown, path: string) => {
    if (typeof node !== 'object' || node === null) return
    for (const [name, value] of Object.entries(node)) {
      const next = path ? `${path}.${name}` : name
      if (typeof value === 'string') {
        if (name.endsWith('Def')) keys.push(next)
      } else walk(value, next)
    }
  }
  walk((fr as Record<string, unknown>).supervision, '')
  return keys
}

describe('methodGroups', () => {
  it('rend les quatre thèmes, dans l’ordre, aucun vide', () => {
    const groups = methodGroups(PARAMS)
    expect(groups.map((g) => g.group)).toEqual([...METHOD_GROUPS])
    for (const group of groups) expect(group.entries.length).toBeGreaterThan(0)
  })

  it('identifiants uniques', () => {
    const ids = methodGroups(PARAMS).flatMap((g) => g.entries.map((e) => e.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('aucune définition de chiffre ne manque à la Méthode', () => {
    const used = new Set(methodGroups(PARAMS).flatMap((g) => g.entries.map((e) => e.definition.key)))
    const missing = definitionKeys().filter((key) => !used.has(key))
    expect(missing).toEqual([])
  })

  it('sans croissance chargée, omet ses deux définitions plutôt que d’inventer une durée', () => {
    const keys = methodGroups({ ...PARAMS, growthWindows: null }).flatMap((g) => g.entries.map((e) => e.definition.key))
    expect(keys).not.toContain('growth.registeredShareDef')
    expect(keys).not.toContain('growth.playersByGameDef')
    expect(keys).toContain('growth.abandonedDef')
  })

  for (const [locale, messages] of Object.entries(CATALOGUES)) {
    it(`chaque intitulé et chaque définition se rendent en ${locale}, sans clé ni valeur manquante`, () => {
      const errors: string[] = []
      const t = createTranslator({
        locale,
        messages,
        namespace: 'supervision',
        onError: (error) => errors.push(error.message),
      }) as unknown as (key: string, values?: Record<string, string | number>) => string
      for (const { entries } of methodGroups(PARAMS)) {
        for (const entry of entries) {
          for (const text of [resolveMessage(entry.term, t), resolveMessage(entry.definition, t)]) {
            expect(text.trim()).not.toBe('')
            // Une valeur oubliée ne lève rien : next-intl rend le gabarit brut, « {minutes} ».
            expect(text, `${entry.id} : ${text}`).not.toMatch(/[{}]/)
          }
        }
      }
      expect(errors).toEqual([])
    })
  }
})

describe('resolveMessage', () => {
  it('traduit les valeurs imbriquées avant le message qui les porte', () => {
    const t = (key: string, values?: Record<string, string | number>) =>
      values ? `${key}(${Object.entries(values).map(([k, v]) => `${k}=${v}`).join(',')})` : key
    expect(
      resolveMessage({ key: 'method.windowed', values: { label: { key: 'a' }, window: { key: 'b' } } }, t)
    ).toBe('method.windowed(label=a,window=b)')
    expect(resolveMessage({ key: 'x', values: { days: 7 } }, t)).toBe('x(days=7)')
    expect(resolveMessage({ key: 'y' }, t)).toBe('y')
  })
})
