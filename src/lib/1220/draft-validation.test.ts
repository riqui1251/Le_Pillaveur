import { describe, expect, it } from 'vitest'
import {
  createGame1220State,
  defaultChoices1220,
  reduceGame1220,
  sanitizeChoices1220,
  type Game1220State,
} from './engine'
import { applyGame1220RoomAction } from './server-adapter'

const PLAYERS = [
  { id: 'a', name: 'Alice' },
  { id: 'b', name: 'Bob' },
]
const T0 = 1_700_000_000_000
const setup = () => createGame1220State(PLAYERS, 'seed-draft', T0)
const CONFIG_KEYS = ['band', 'drinkNumber', 'giveNumber', 'name', 'parity', 'playerId']

/** Ce qu'un client modifié peut poster : le corps arrive tel quel dans `choices`. */
const post = (s: Game1220State, userId: string, choices: unknown) =>
  applyGame1220RoomAction(s, userId, { type: 'set-draft', choices: choices as never })

describe('12-20 — paris reçus du client', () => {
  it('ne retient que les quatre champs d’un pari, aux valeurs admises', () => {
    expect(
      sanitizeChoices1220({
        parity: 'impair',
        band: '21-30',
        drinkNumber: 12,
        giveNumber: 32,
        name: 'Bob (spoof)',
        playerId: 'b',
        extra: 'x'.repeat(5_000),
      })
    ).toEqual({ parity: 'impair', band: '21-30', drinkNumber: 12, giveNumber: 32 })
  })

  it('écarte les valeurs hors plage ou du mauvais type, champ par champ', () => {
    for (const bad of [1, 33, 99, -5, 7.5, '7', null, { evil: 1 }, Number.NaN]) {
      expect(sanitizeChoices1220({ drinkNumber: bad, giveNumber: bad })).toEqual({})
    }
    expect(sanitizeChoices1220({ parity: 'x', band: 'nope' })).toEqual({})
    expect(sanitizeChoices1220({ parity: 42, band: ['2-10'] })).toEqual({})
    for (const raw of [null, undefined, 'pair', 12, []]) expect(sanitizeChoices1220(raw)).toEqual({})
    // Les bornes du jeu sont admises : somme de deux dés, de 2 à 32.
    expect(sanitizeChoices1220({ drinkNumber: 2, giveNumber: 32 })).toEqual({ drinkNumber: 2, giveNumber: 32 })
  })

  it('un brouillon forgé n’entre pas dans l’état partagé de la table', () => {
    const result = post(setup(), 'a', {
      drinkNumber: 99,
      giveNumber: -5,
      parity: 'x',
      name: 'Bob (spoof)',
      playerId: 'b',
    })

    // Rien de valable dans ce corps : refusé, l'état n'est pas réécrit.
    expect(result).toEqual({ ok: false, error: 'INVALID_CHOICES' })
  })

  it('un corps en partie valable : le valable passe, le reste est ignoré', () => {
    const result = post(setup(), 'a', { drinkNumber: 9, giveNumber: 99, parity: 'impair', name: 'x'.repeat(3_000) })

    expect(result.ok && result.state.draft.a).toEqual({ ...defaultChoices1220(), drinkNumber: 9, parity: 'impair' })
  })

  it('un réglage ordinaire de l’écran passe tel quel', () => {
    let s = setup()
    for (const choices of [{ parity: 'impair' }, { band: '2-10' }, { drinkNumber: 4 }, { giveNumber: 30 }]) {
      const r = post(s, 'a', choices)
      expect(r.ok).toBe(true)
      if (r.ok) s = r.state
    }
    expect(s.draft.a).toEqual({ parity: 'impair', band: '2-10', drinkNumber: 4, giveNumber: 30 })
  })
})

describe('12-20 — paris verrouillés', () => {
  it('brouillon déjà faussé en base (partie d’avant le correctif) : assaini au verrouillage', () => {
    // État tel que l'ancien moteur l'acceptait : valeurs impossibles et champs étrangers.
    const legacy: Game1220State = {
      ...setup(),
      draft: {
        a: { drinkNumber: 99, giveNumber: { evil: 1 }, parity: 'x', band: 'nope', name: 'Bob (spoof)', playerId: 'b' } as never,
        b: defaultChoices1220(),
      },
    }
    let s = reduceGame1220(legacy, { type: 'ADVANCE', claimedKey: 'setup#1', now: legacy.phaseEndsAt ?? T0 })

    expect(s.phase).toBe('play')
    for (const config of s.configs ?? []) expect(Object.keys(config).sort()).toEqual(CONFIG_KEYS)
    expect(s.configs?.[0]).toEqual({ playerId: 'a', name: 'Alice', ...defaultChoices1220() })

    // Le lancer ne plante pas et Alice y figure sous son nom.
    s = reduceGame1220(s, { type: 'ROLL', playerId: 'b' })
    expect(s.lastRoll?.results.map((r) => r.name)).toEqual(['Alice', 'Bob'])
  })

  it('joueur remplacé par un bot pendant la mise en place, brouillon « boire = donner » : paris par défaut', () => {
    let s = setup()
    // Bob règle boire = donner : son bouton « prêt » le refuse. Il part, un bot
    // le remplace, prêt d'office — sans jamais passer par ce contrôle.
    s = reduceGame1220(s, { type: 'SET_DRAFT', playerId: 'b', choices: { drinkNumber: 9, giveNumber: 9, parity: 'impair' } })
    s = reduceGame1220(s, { type: 'LEAVE', playerId: 'b', at: T0 + 1_000 })
    s = reduceGame1220(s, { type: 'REPLACE_LEFT', now: T0 + 400_000, graceMs: 180_000 })
    s = reduceGame1220(s, { type: 'READY', playerId: 'a' })
    expect(s.phase).toBe('play')

    const bob = s.configs?.find((c) => c.playerId === 'b')
    // Boire et donner sur le même chiffre : interdit par le jeu, impossible à l'écran.
    expect(bob).toEqual({ playerId: 'b', name: 'Bob', ...defaultChoices1220() })
  })

  it('départ qui complète le quorum alors qu’un présent a un brouillon faussé en base : assaini aussi', () => {
    const base = createGame1220State([...PLAYERS, { id: 'c', name: 'Chris' }], 'seed-draft', T0)
    // Alice est prête ; son brouillon, d'avant le correctif, porte des valeurs impossibles.
    let s: Game1220State = {
      ...base,
      setupReady: ['a', 'b'],
      draft: { ...base.draft, a: { ...defaultChoices1220(), drinkNumber: 99, playerId: 'b' } as never },
    }

    s = reduceGame1220(s, { type: 'LEAVE', playerId: 'c', at: T0 + 1_000 })

    expect(s.phase).toBe('play')
    expect(s.configs?.[0]).toEqual({ playerId: 'a', name: 'Alice', ...defaultChoices1220() })
  })

  it('brouillon faussé en base : le premier réglage ordinaire le nettoie', () => {
    const legacy: Game1220State = {
      ...setup(),
      draft: {
        a: { ...defaultChoices1220(), giveNumber: 99, name: 'Bob (spoof)', playerId: 'b', extra: 'x'.repeat(5_000) } as never,
        b: defaultChoices1220(),
      },
    }

    const result = post(legacy, 'a', { parity: 'impair' })

    // Sans ce ménage, les champs étrangers restaient diffusés à la table jusqu'au verrouillage.
    expect(result.ok && result.state.draft.a).toEqual({ ...defaultChoices1220(), parity: 'impair' })
  })

  it('brouillon faussé en base : « prêt » juge les paris qui seront verrouillés', () => {
    // « Donner » impossible : il retombera sur 13 au verrouillage, le chiffre de « boire ».
    const legacy: Game1220State = {
      ...setup(),
      draft: { a: { ...defaultChoices1220(), drinkNumber: 13, giveNumber: 99 } as never, b: defaultChoices1220() },
    }

    // Accepté, « prêt » verrouillait ensuite les paris par défaut à la place de ceux du joueur.
    expect(applyGame1220RoomAction(legacy, 'a', { type: 'ready' })).toEqual({ ok: false, error: 'CLASH' })
  })

  it('un pari ordinaire est verrouillé tel quel', () => {
    let s = setup()
    s = reduceGame1220(s, { type: 'SET_DRAFT', playerId: 'a', choices: { parity: 'impair', band: '2-10', drinkNumber: 4, giveNumber: 30 } })
    for (const p of PLAYERS) s = reduceGame1220(s, { type: 'READY', playerId: p.id })

    expect(s.configs?.[0]).toEqual({ playerId: 'a', name: 'Alice', parity: 'impair', band: '2-10', drinkNumber: 4, giveNumber: 30 })
  })
})
