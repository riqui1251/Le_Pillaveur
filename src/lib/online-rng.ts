/** Générateur pseudo-aléatoire déterministe (seed partagée en ligne) */

export function createSeededRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff)
}

export function shuffleWithRng<T>(items: T[], rng: () => number): T[] {
  const s = [...items]
  for (let i = s.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[s[i], s[j]] = [s[j], s[i]]
  }
  return s
}

export function randomIntWithRng(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min
}
