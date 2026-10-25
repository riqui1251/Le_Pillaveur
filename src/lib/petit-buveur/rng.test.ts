import { describe, it, expect } from 'vitest'
import { chacha20Block, createRng, hashSeed, randomSeed, rngFromState, sha256 } from './rng'

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
const utf8 = (text: string) => new TextEncoder().encode(text)
const STATE_PATTERN = /^[0-9a-f]{80}$/

describe('primitives : vecteurs de test publics', () => {
  it('SHA-256 (FIPS 180-4) : message vide, « abc », message sur deux blocs', () => {
    expect(hex(sha256(utf8('')))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(hex(sha256(utf8('abc')))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(hex(sha256(utf8('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'
    )
  })

  it('ChaCha20 : bloc de référence de la RFC 8439 §2.3.2', () => {
    const key = new Uint32Array([
      0x03020100, 0x07060504, 0x0b0a0908, 0x0f0e0d0c, 0x13121110, 0x17161514, 0x1b1a1918, 0x1f1e1d1c,
    ])
    const block = chacha20Block(key, 0x00000001, 0x09000000, 0x4a000000, 0x00000000)
    expect(Array.from(block, (w) => w.toString(16).padStart(8, '0'))).toEqual([
      'e4e7f110', '15593bd1', '1fdd0f50', 'c47120a3',
      'c7f4d1c7', '0368c033', '9aaa2204', '4e6cd4c3',
      '466482d2', '09aa9f07', '05d7c214', 'a2028bd9',
      'd19c12b5', 'b94e16de', 'e883d0cb', '4e3c50a2',
    ])
  })
})

describe('RNG seedé (ChaCha20)', () => {
  it('est déterministe : même graine ⇒ même séquence', () => {
    const a = createRng('partie-42')
    const b = createRng('partie-42')
    const seqA = Array.from({ length: 50 }, () => a.next())
    const seqB = Array.from({ length: 50 }, () => b.next())
    expect(seqA).toEqual(seqB)
    expect(a.getState()).toBe(b.getState())
  })

  it('graine number ou string équivalente : même suite (String(seed))', () => {
    expect(createRng(123456789).next()).toBe(createRng('123456789').next())
  })

  it('produit des séquences différentes pour des graines différentes', () => {
    const a = Array.from({ length: 20 }, () => createRng('A').next())
    const b = Array.from({ length: 20 }, () => createRng('B').next())
    expect(createRng('A').next()).not.toEqual(createRng('B').next())
    expect(a).not.toEqual(b)
    expect(createRng('A').getState()).not.toBe(createRng('B').getState())
    expect(createRng('partie-1').getState()).not.toBe(createRng('partie-2').getState())
  })

  it("l'état est une string hexadécimale de 256 bits de clé + compteur, jamais un number", () => {
    const rng = createRng('etat')
    const initial = rng.getState()
    expect(typeof initial).toBe('string')
    expect(initial).toMatch(STATE_PATTERN)
    expect((initial as string).slice(64)).toBe('0000000000000000')
    for (let i = 0; i < 37; i += 1) rng.next()
    const after = rng.getState() as string
    expect(after).toMatch(STATE_PATTERN)
    expect(after.slice(0, 64)).toBe((initial as string).slice(0, 64))
    expect(parseInt(after.slice(64), 16)).toBe(37)
  })

  it('les flottants restent dans [0, 1)', () => {
    const rng = createRng('bornes-next')
    for (let i = 0; i < 5000; i += 1) {
      const v = rng.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('int(min,max) reste dans les bornes inclusives', () => {
    const rng = createRng('bornes')
    for (let i = 0; i < 1000; i += 1) {
      const v = rng.int(1, 6)
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(6)
      expect(Number.isInteger(v)).toBe(true)
    }
  })

  it('chance(0) toujours faux, chance(1) toujours vrai', () => {
    const rng = createRng('chance')
    for (let i = 0; i < 100; i += 1) {
      expect(rng.chance(0)).toBe(false)
      expect(rng.chance(1)).toBe(true)
    }
  })

  it('pickIndex reste dans [0, length)', () => {
    const rng = createRng('idx')
    for (let i = 0; i < 500; i += 1) {
      const idx = rng.pickIndex(4)
      expect(idx).toBeGreaterThanOrEqual(0)
      expect(idx).toBeLessThan(4)
    }
  })

  it('shuffle est une permutation (mêmes éléments) et déterministe', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8]
    const s1 = createRng('shuf').shuffle(input)
    const s2 = createRng('shuf').shuffle(input)
    expect(s1).toEqual(s2)
    expect([...s1].sort((a, b) => a - b)).toEqual(input)
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]) // entrée non mutée
  })

  it('weightedPick respecte grossièrement les poids', () => {
    const rng = createRng('weights')
    const entries = [
      { id: 'rare', weight: 1 },
      { id: 'commun', weight: 9 },
    ]
    const counts = { rare: 0, commun: 0 }
    for (let i = 0; i < 2000; i += 1) {
      counts[rng.weightedPick(entries).id as 'rare' | 'commun'] += 1
    }
    expect(counts.commun).toBeGreaterThan(counts.rare)
    // ~90/10 attendu : le commun doit largement dominer
    expect(counts.commun).toBeGreaterThan(1500)
  })

  it('distribution grossière : int(1,6) équilibré, shuffle sans position favorite', () => {
    const rng = createRng('distribution')
    const faces = [0, 0, 0, 0, 0, 0]
    for (let i = 0; i < 60_000; i += 1) faces[rng.int(1, 6) - 1] += 1
    for (const n of faces) expect(n).toBeGreaterThan(9_000)
    for (const n of faces) expect(n).toBeLessThan(11_000)

    const positions = Array.from({ length: 10 }, () => 0)
    const deck = Array.from({ length: 10 }, (_, i) => i)
    for (let i = 0; i < 20_000; i += 1) positions[rng.shuffle(deck).indexOf(0)] += 1
    for (const n of positions) expect(n).toBeGreaterThan(1_600)
    for (const n of positions) expect(n).toBeLessThan(2_400)
  })

  it("permet de reprendre depuis l'état persistant, y compris au-delà d'un bloc", () => {
    const rng = createRng('persist')
    for (let i = 0; i < 30; i += 1) rng.next() // 16 mots par bloc : on chevauche
    const saved = rng.getState()
    const continued = Array.from({ length: 40 }, () => rng.next())

    const resumed = rngFromState(saved)
    const resumedSeq = Array.from({ length: 40 }, () => resumed.next())
    expect(resumedSeq).toEqual(continued)
    expect(resumed.getState()).toBe(rng.getState())
  })

  it('un état string illisible est refusé', () => {
    expect(() => rngFromState('abc')).toThrow()
    expect(() => rngFromState('z'.repeat(80))).toThrow()
  })

  it('un état absent (ancienne ligne) rejoue mulberry32 depuis 0, comme avant', () => {
    const fromZero = rngFromState(0)
    const expected = Array.from({ length: 5 }, () => fromZero.next())
    for (const missing of [undefined, null]) {
      const rng = rngFromState(missing as unknown as number)
      expect(Array.from({ length: 5 }, () => rng.next())).toEqual(expected)
      expect(typeof rng.getState()).toBe('number')
    }
  })

  it('randomSeed : 256 bits en hexadécimal, jamais deux fois la même, acceptée par createRng', () => {
    const a = randomSeed()
    const b = randomSeed()
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(b).toMatch(/^[0-9a-f]{64}$/)
    expect(a).not.toBe(b)
    expect(createRng(a).getState()).toMatch(STATE_PATTERN)
    expect(createRng(a).next()).not.toBe(createRng(b).next())
  })

  it('hashSeed est stable et borné en uint32', () => {
    expect(hashSeed('abc')).toBe(hashSeed('abc'))
    expect(hashSeed('partie-42')).toBe(3871278231)
    const h = hashSeed('quelque-graine')
    expect(h).toBeGreaterThanOrEqual(0)
    expect(h).toBeLessThanOrEqual(0xffffffff)
  })
})

describe('compatibilité : état number = ancien mulberry32 des parties en cours', () => {
  // Valeurs relevées sur le générateur mulberry32 d'origine (état uint32).
  it('rngFromState(number) rejoue exactement la suite mulberry32', () => {
    const rng = rngFromState(12345)
    expect(Array.from({ length: 5 }, () => rng.next())).toEqual([
      0.9797282677609473, 0.3067522644996643, 0.484205421525985, 0.817934412509203, 0.5094283693470061,
    ])
    expect(rng.getState()).toBe(567906818)
    const other = rngFromState(424242)
    expect(Array.from({ length: 3 }, () => other.next())).toEqual([
      0.1287079993635416, 0.23631658218801022, 0.18376533640548587,
    ])
    const dice = rngFromState(12345)
    expect(Array.from({ length: 8 }, () => dice.int(1, 6))).toEqual([6, 2, 3, 5, 4, 3, 1, 5])
  })

  it("l'ancien état reste un number après tirage (la partie continue telle quelle)", () => {
    const rng = rngFromState(424242)
    for (let i = 0; i < 3; i += 1) rng.next()
    const state = rng.getState()
    expect(state).toBe(1200154385)
    const continued = Array.from({ length: 5 }, () => rng.next())
    const resumed = rngFromState(state)
    expect(Array.from({ length: 5 }, () => resumed.next())).toEqual(continued)
    expect(typeof resumed.getState()).toBe('number')
  })

  it('une nouvelle partie ne produit plus jamais un état number', () => {
    const rng = createRng(randomSeed())
    for (let i = 0; i < 100; i += 1) rng.next()
    expect(typeof rng.getState()).toBe('string')
  })
})
