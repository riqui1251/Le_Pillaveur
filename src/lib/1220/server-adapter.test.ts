import { describe, expect, it } from 'vitest'
import { getGameAdapter } from '@/lib/online/game-adapters'
import { buildGame1220State, parseGame1220State, serializeGame1220State } from './server-adapter'
import { defaultChoices1220, type Game1220State } from './engine'

const adapter = getGameAdapter('1220')!

const MEMBERS = [
  { userId: 'evil', user: { displayName: 'Tricheur' } },
  { userId: 'honest', user: { displayName: 'Honnête' } },
]

function apply(state: Game1220State, userId: string, json: string) {
  return adapter.applyAction(state, userId, JSON.parse(json) as Record<string, unknown>)
}

function okState(result: ReturnType<typeof apply>): Game1220State {
  if (!result.ok) throw new Error(`refusé : ${result.error}`)
  return result.state as Game1220State
}

function playing(): Game1220State {
  let s = buildGame1220State(MEMBERS, 0, 'seed-1220-adapter')
  s = okState(apply(s, 'evil', '{"action":"ready"}'))
  return okState(apply(s, 'honest', '{"action":"ready"}'))
}

const INVALID = { ok: false, error: 'invalid_action', status: 400 }

describe('adaptateur 1220 — set-draft', () => {
  it('refuse un pari sous forme d’objet (il faisait planter l’écran de toute la table)', () => {
    const s = buildGame1220State(MEMBERS, 0, 'seed')
    expect(apply(s, 'evil', '{"action":"set-draft","choices":{"drinkNumber":{"boom":1},"giveNumber":13}}')).toEqual(INVALID)
  })

  it('refuse un chiffre en chaîne ou hors bornes (jamais boire) et une clé inconnue (état gonflé)', () => {
    const s = buildGame1220State(MEMBERS, 0, 'seed')
    for (const choices of ['{"drinkNumber":"7"}', '{"drinkNumber":99}', `{"k1":"${'x'.repeat(7000)}"}`]) {
      expect(apply(s, 'evil', `{"action":"set-draft","choices":${choices}}`)).toEqual(INVALID)
    }
  })

  it('accepte un pari valide', () => {
    const s = okState(apply(buildGame1220State(MEMBERS, 0, 'seed'), 'evil', '{"action":"set-draft","choices":{"drinkNumber":4}}'))
    expect(s.draft.evil).toEqual({ ...defaultChoices1220(), drinkNumber: 4 })
  })
})

describe('adaptateur 1220 — set-bets (paris modifiables en jeu)', () => {
  it('remplace les paris du joueur en phase play', () => {
    const s = okState(
      apply(playing(), 'honest', '{"action":"set-bets","choices":{"parity":"impair","band":"2-10","drinkNumber":5,"giveNumber":16}}')
    )
    expect(s.configs?.find((c) => c.playerId === 'honest')).toMatchObject({ drinkNumber: 5, giveNumber: 16, parity: 'impair' })
  })

  it('refuse des paris piégés (400) ou sans corps (400)', () => {
    expect(
      apply(playing(), 'evil', '{"action":"set-bets","choices":{"parity":"pair","band":"2-10","drinkNumber":{"boom":1},"giveNumber":16}}')
    ).toEqual(INVALID)
    expect(apply(playing(), 'evil', '{"action":"set-bets"}')).toEqual(INVALID)
  })
})

describe('adaptateur 1220 — état stocké avant la validation', () => {
  it('assainit au parse un pari piégé déjà verrouillé : la vue ne porte plus d’objet ni de clé en trop', () => {
    const raw = JSON.parse(serializeGame1220State(playing())) as Record<string, unknown>
    const configs = raw.configs as Record<string, unknown>[]
    configs[0] = { ...configs[0], drinkNumber: { boom: 1 }, k1: 'x'.repeat(5000) }
    raw.draft = { ...(raw.draft as object), evil: { drinkNumber: '7', giveNumber: 13, k2: 'y' } }

    const parsed = parseGame1220State(JSON.stringify(raw))!
    for (const json of [adapter.clientViewJson(parsed, 'honest'), adapter.spectatorViewJson(parsed)]) {
      expect(json).not.toContain('boom')
      expect(json).not.toContain('k1')
      expect(json).not.toContain('k2')
      expect(json).not.toContain('rngState')
    }
    expect(parsed.configs?.[0]).toMatchObject({ playerId: 'evil', drinkNumber: defaultChoices1220().drinkNumber })
    expect(parsed.draft.evil.drinkNumber).toBe(defaultChoices1220().drinkNumber)
    // Le lancer passe toujours sur l'état assaini.
    expect(okState(apply(parsed, 'honest', '{"action":"roll"}')).lastRoll?.results).toHaveLength(2)
  })

  it('un état honnête est relu à l’identique', () => {
    const s = playing()
    expect(parseGame1220State(serializeGame1220State(s))).toEqual(s)
  })
})
