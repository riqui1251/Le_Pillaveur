/**
 * RNG déterministe seedé des moteurs de jeu en ligne (Petit Buveur d'abord,
 * puis tous les jeux serveur-autoritaires).
 *
 * Objectif : le serveur fait autorité. Toute opération aléatoire (dé, type de
 * case, mélange, rôles…) passe par ce RNG, dérivé d'une graine de partie.
 * L'état interne est sérialisable afin de persister la position du
 * générateur entre deux actions/tours et garantir une partie reproductible.
 *
 * Générateur : ChaCha20 en TypeScript pur, synchrone, sans API propre à Node
 * (les moteurs tournent aussi dans le navigateur). La clé de 256 bits est
 * dérivée de la graine par SHA-256 ; l'état est la clé plus un compteur de
 * mots. Les sorties publiques (dés révélés, cartes retournées, ordre de
 * parole…) ne permettent pas de retrouver la clé, donc ni les tirages cachés
 * ni les tirages à venir. L'ancien mulberry32 (état sur 32 bits, retrouvable
 * par force brute à partir de quelques sorties) ne sert plus qu'aux parties
 * en cours dont l'état persisté est encore un number.
 */

/**
 * État interne sérialisable du générateur : string hexadécimale (clé ChaCha20
 * + compteur) pour toute partie créée depuis cette version, number (uint32
 * mulberry32) pour une partie plus ancienne encore en cours.
 */
export type RngState = number | string

export interface SeededRng {
  /** Flottant dans [0, 1). */
  next(): number
  /** Entier dans [min, max] inclus. */
  int(min: number, max: number): number
  /** Vrai avec une probabilité p (0..1). */
  chance(p: number): boolean
  /** Élément aléatoire d'un tableau non vide. */
  pick<T>(arr: readonly T[]): T
  /** Index aléatoire dans [0, length). */
  pickIndex(length: number): number
  /** Tirage pondéré parmi des entrées { weight }. */
  weightedPick<T extends { weight: number }>(entries: readonly T[]): T
  /** Copie mélangée (Fisher–Yates), sans muter l'entrée. */
  shuffle<T>(arr: readonly T[]): T[]
  /** État interne courant (pour persistance). */
  getState(): RngState
}

/**
 * Hash 32 bits d'une graine string/number (xfnv1a-like), toujours
 * déterministe. Ne sert plus à initialiser un générateur (32 bits ne suffisent
 * pas) : il reste pour les choix cosmétiques partagés (variantes de bulles).
 */
export function hashSeed(seed: string | number): number {
  const str = typeof seed === 'number' ? String(seed) : seed
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// ─── SHA-256 (dérivation de la clé à partir de la graine) ────────────────────

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n))

/** SHA-256 d'une suite d'octets : 32 octets. */
export function sha256(input: Uint8Array): Uint8Array {
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ])
  const padded = new Uint8Array(Math.ceil((input.length + 9) / 64) * 64)
  padded.set(input)
  padded[input.length] = 0x80
  const view = new DataView(padded.buffer)
  const bitLength = input.length * 8
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000), false)
  view.setUint32(padded.length - 4, bitLength >>> 0, false)

  const w = new Uint32Array(64)
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4, false)
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = w[i - 16] + s0 + w[i - 7] + s1
    }
    let a = h[0]
    let b = h[1]
    let c = h[2]
    let d = h[3]
    let e = h[4]
    let f = h[5]
    let g = h[6]
    let hh = h[7]
    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const t1 = (hh + S1 + ch + SHA256_K[i] + w[i]) >>> 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + maj) >>> 0
      hh = g
      g = f
      f = e
      e = (d + t1) >>> 0
      d = c
      c = b
      b = a
      a = (t1 + t2) >>> 0
    }
    h[0] += a
    h[1] += b
    h[2] += c
    h[3] += d
    h[4] += e
    h[5] += f
    h[6] += g
    h[7] += hh
  }

  const out = new Uint8Array(32)
  const outView = new DataView(out.buffer)
  for (let i = 0; i < 8; i += 1) outView.setUint32(i * 4, h[i], false)
  return out
}

// ─── ChaCha20 (générateur) ───────────────────────────────────────────────────

const CHACHA_CONSTANTS = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574]
const CHACHA_WORDS_PER_BLOCK = 16

const rotl = (x: number, n: number): number => (x << n) | (x >>> (32 - n))

function quarterRound(x: Uint32Array, a: number, b: number, c: number, d: number): void {
  x[a] += x[b]
  x[d] = rotl(x[d] ^ x[a], 16)
  x[c] += x[d]
  x[b] = rotl(x[b] ^ x[c], 12)
  x[a] += x[b]
  x[d] = rotl(x[d] ^ x[a], 8)
  x[c] += x[d]
  x[b] = rotl(x[b] ^ x[c], 7)
}

/**
 * Un bloc ChaCha20 (20 tours) : 16 mots de 32 bits pour une clé de 8 mots et
 * les mots 12 à 15 de l'état initial (compteur et nonce, selon la convention).
 */
export function chacha20Block(key: Uint32Array, w12: number, w13: number, w14: number, w15: number): Uint32Array {
  if (key.length !== 8) throw new Error('chacha20Block: clé de 8 mots attendue')
  const input = new Uint32Array(CHACHA_WORDS_PER_BLOCK)
  input.set(CHACHA_CONSTANTS, 0)
  input.set(key, 4)
  input[12] = w12
  input[13] = w13
  input[14] = w14
  input[15] = w15
  const x = new Uint32Array(input)
  for (let round = 0; round < 10; round += 1) {
    quarterRound(x, 0, 4, 8, 12)
    quarterRound(x, 1, 5, 9, 13)
    quarterRound(x, 2, 6, 10, 14)
    quarterRound(x, 3, 7, 11, 15)
    quarterRound(x, 0, 5, 10, 15)
    quarterRound(x, 1, 6, 11, 12)
    quarterRound(x, 2, 7, 8, 13)
    quarterRound(x, 3, 4, 9, 14)
  }
  for (let i = 0; i < CHACHA_WORDS_PER_BLOCK; i += 1) x[i] += input[i]
  return x
}

// ─── Encodage de l'état : 32 octets de clé + compteur 64 bits, en hexadécimal ─

const KEY_BYTES = 32
const STATE_HEX_PATTERN = /^[0-9a-f]{80}$/

function toHex(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 1) out += bytes[i].toString(16).padStart(2, '0')
  return out
}

function hex32(value: number): string {
  return (value >>> 0).toString(16).padStart(8, '0')
}

function keyWordsFromBytes(bytes: Uint8Array): Uint32Array {
  const words = new Uint32Array(8)
  for (let i = 0; i < 8; i += 1) {
    words[i] = bytes[4 * i] | (bytes[4 * i + 1] << 8) | (bytes[4 * i + 2] << 16) | (bytes[4 * i + 3] << 24)
  }
  return words
}

function encodeState(keyHex: string, index: number): string {
  return keyHex + hex32(Math.floor(index / 0x100000000)) + hex32(index)
}

function decodeState(state: string): { keyHex: string; index: number } {
  if (!STATE_HEX_PATTERN.test(state)) throw new Error('rngFromState: état illisible')
  const keyHex = state.slice(0, KEY_BYTES * 2)
  const hi = parseInt(state.slice(KEY_BYTES * 2, KEY_BYTES * 2 + 8), 16)
  const lo = parseInt(state.slice(KEY_BYTES * 2 + 8), 16)
  return { keyHex, index: hi * 0x100000000 + lo }
}

function bytesFromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16)
  return out
}

// ─── Fabrique commune ────────────────────────────────────────────────────────

function makeRng(next: () => number, getState: () => RngState): SeededRng {
  const int = (min: number, max: number): number => {
    if (max < min) [min, max] = [max, min]
    const span = Math.floor(max) - Math.ceil(min) + 1
    return Math.ceil(min) + Math.floor(next() * span)
  }

  const pickIndex = (length: number): number => {
    if (length <= 0) throw new Error('pickIndex: longueur nulle')
    return Math.floor(next() * length)
  }

  const pick = <T,>(arr: readonly T[]): T => {
    if (arr.length === 0) throw new Error('pick: tableau vide')
    return arr[pickIndex(arr.length)]
  }

  const chance = (p: number): boolean => next() < p

  const weightedPick = <T extends { weight: number }>(entries: readonly T[]): T => {
    if (entries.length === 0) throw new Error('weightedPick: aucune entrée')
    const total = entries.reduce((s, e) => s + e.weight, 0)
    let r = next() * total
    for (const entry of entries) {
      r -= entry.weight
      if (r <= 0) return entry
    }
    return entries[entries.length - 1]
  }

  const shuffle = <T,>(arr: readonly T[]): T[] => {
    const out = [...arr]
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(next() * (i + 1))
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
  }

  return {
    next,
    int,
    chance,
    pick,
    pickIndex,
    weightedPick,
    shuffle,
    getState,
  }
}

/** Générateur ChaCha20 : `index` est le nombre de mots de 32 bits déjà consommés. */
function chachaRng(keyHex: string, initialIndex: number): SeededRng {
  const key = keyWordsFromBytes(bytesFromHex(keyHex))
  let index = initialIndex
  let blockIndex = -1
  let block: Uint32Array = new Uint32Array(CHACHA_WORDS_PER_BLOCK)

  const next = (): number => {
    const wanted = Math.floor(index / CHACHA_WORDS_PER_BLOCK)
    if (wanted !== blockIndex) {
      block = chacha20Block(key, wanted >>> 0, Math.floor(wanted / 0x100000000) >>> 0, 0, 0)
      blockIndex = wanted
    }
    const value = block[index % CHACHA_WORDS_PER_BLOCK] / 4294967296
    index += 1
    return value
  }

  return makeRng(next, () => encodeState(keyHex, index))
}

// ─── Ancien générateur (parties en cours dont l'état est un number) ──────────

/** Avance l'état mulberry32 et retourne [état suivant, flottant [0,1)]. */
function mulberry32Step(state: number): [number, number] {
  let a = state | 0
  a = (a + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  return [a >>> 0, value]
}

/**
 * mulberry32, état sur 32 bits : prévisible à partir de quelques sorties, il
 * ne reprend que les parties lancées avant ChaCha20, pour qu'elles se jouent
 * jusqu'au bout telles quelles. Aucune nouvelle partie ne l'utilise.
 */
function legacyMulberry32Rng(initialState: number): SeededRng {
  let state = initialState >>> 0
  const next = (): number => {
    const [nextState, value] = mulberry32Step(state)
    state = nextState
    return value
  }
  return makeRng(next, () => state)
}

// ─── API publique ────────────────────────────────────────────────────────────

/** Crée un RNG à partir d'une graine (string ou number) : même graine, même suite. */
export function createRng(seed: string | number): SeededRng {
  const text = typeof seed === 'number' ? String(seed) : seed
  return chachaRng(toHex(sha256(new TextEncoder().encode(text))), 0)
}

/** Reprend un RNG depuis un état persistant (string ChaCha20, ou number mulberry32 d'une ancienne partie). */
export function rngFromState(state: RngState): SeededRng {
  if (typeof state === 'string') {
    const { keyHex, index } = decodeState(state)
    return chachaRng(keyHex, index)
  }
  // Un état absent d'une ligne ancienne valait 0 pour mulberry32 (`>>> 0`) :
  // même repli, plutôt qu'une exception qui figerait la partie en cours.
  return legacyMulberry32Rng(typeof state === 'number' ? state : 0)
}

/** Génère une graine de partie aléatoire de 256 bits (utilisée à la création d'une salle). */
export function randomSeed(): string {
  const cryptoApi = globalThis.crypto
  if (!cryptoApi?.getRandomValues) throw new Error('randomSeed: crypto.getRandomValues indisponible')
  const bytes = new Uint8Array(KEY_BYTES)
  cryptoApi.getRandomValues(bytes)
  return toHex(bytes)
}
