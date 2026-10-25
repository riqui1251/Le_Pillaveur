import { describe, expect, it, vi } from 'vitest'
import { TV_CODE_MISS_LIMIT, lookupTvCode } from './code-lookup'

/**
 * Budget de codes inconnus des routes TV publiques. Vrai limiteur (mémoire du
 * processus) : chaque test prend un réseau neuf pour ne pas hériter du budget
 * d'un autre.
 */

let seq = 0
/** Un /64 neuf ; `host` fait varier l'adresse DANS ce /64. */
const network = () => {
  seq += 1
  return (host: number) =>
    new Request('http://localhost/api/tv/ABCDEF/state', {
      headers: { 'cf-connecting-ip': `2001:db8:${seq.toString(16)}:1::${host.toString(16)}` },
    })
}

const missing = async () => null
const found = async () => ({ id: 'room-1' })

describe('lookupTvCode', () => {
  it('codes NOUVEAUX inconnus depuis un même /64 : budget épuisé, même en changeant d’adresse', async () => {
    const from = network()
    const results = []
    for (let i = 0; i < TV_CODE_MISS_LIMIT + 20; i += 1) {
      results.push(await lookupTvCode(from(i + 1), `C${String(i).padStart(5, '0')}`, missing))
    }
    expect(results.filter((r) => r.ok)).toHaveLength(TV_CODE_MISS_LIMIT)
    expect(results.at(-1)).toMatchObject({ ok: false })
  })

  it('budget épuisé : même un code valide est refusé (le 429 ne devient pas la réponse « libre »)', async () => {
    const from = network()
    for (let i = 0; i < TV_CODE_MISS_LIMIT; i += 1) {
      await lookupTvCode(from(1), `D${String(i).padStart(5, '0')}`, missing)
    }
    const find = vi.fn(found)
    const result = await lookupTvCode(from(2), 'GOOD22', find)
    expect(result).toMatchObject({ ok: false })
    expect(find).not.toHaveBeenCalled()
  })

  it('une télé qui resonde le même code disparu n’use pas le budget de la maison', async () => {
    const from = network()
    for (let i = 0; i < TV_CODE_MISS_LIMIT * 3; i += 1) {
      expect(await lookupTvCode(from(1), 'GONE22', missing)).toEqual({ ok: true, value: null })
    }
    expect(await lookupTvCode(from(2), 'LIVE22', found)).toEqual({ ok: true, value: { id: 'room-1' } })
  })

  it('les codes trouvés ne comptent pas', async () => {
    const from = network()
    for (let i = 0; i < TV_CODE_MISS_LIMIT * 3; i += 1) {
      expect((await lookupTvCode(from(1), 'LIVE22', found)).ok).toBe(true)
    }
  })

  it('une panne de lecture rend l’unité prise et remonte l’erreur', async () => {
    const from = network()
    const broken = () => Promise.reject(new Error('base indisponible'))
    for (let i = 0; i < TV_CODE_MISS_LIMIT + 5; i += 1) {
      await expect(lookupTvCode(from(1), `E${String(i).padStart(5, '0')}`, broken)).rejects.toThrow()
    }
    expect((await lookupTvCode(from(1), 'NEW222', missing)).ok).toBe(true)
  })

  it('un autre réseau garde son propre budget', async () => {
    const first = network()
    for (let i = 0; i < TV_CODE_MISS_LIMIT; i += 1) {
      await lookupTvCode(first(1), `F${String(i).padStart(5, '0')}`, missing)
    }
    expect((await lookupTvCode(first(1), 'F99999', missing)).ok).toBe(false)
    const second = network()
    expect((await lookupTvCode(second(1), 'F99999', missing)).ok).toBe(true)
  })
})
