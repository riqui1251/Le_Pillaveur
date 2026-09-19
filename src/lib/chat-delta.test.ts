import { describe, expect, it } from 'vitest'
import {
  MAX_KEPT_MESSAGES,
  chatCursorQuery,
  compareMessages,
  mergeMessages,
  parseChatCursor,
} from './chat-delta'

/** Un message tel que la route le renvoie, réduit à ce qui compte ici. */
const msg = (id: string, createdAt: string, body = `corps ${id}`) => ({ id, createdAt, body })

const T1 = '2026-09-18T20:00:00.000Z'
const T2 = '2026-09-18T20:00:01.000Z'
const T3 = '2026-09-18T20:00:02.000Z'

describe('mergeMessages — fusion du delta de chat', () => {
  it('rend la liste d’origine, même référence, quand rien de neuf', () => {
    const existing = [msg('a', T1)]
    expect(mergeMessages(existing, [])).toBe(existing)
  })

  it('ajoute les nouveaux messages à la suite, dans l’ordre chronologique', () => {
    const merged = mergeMessages([msg('a', T1)], [msg('c', T3), msg('b', T2)])
    expect(merged.map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })

  it('rend la même référence quand tout le delta est déjà connu (recouvrement du curseur)', () => {
    // La route renvoie les dernières secondes du canal à chaque relève : sans
    // ce garde, chaque sondage de la fenêtre coûtait un rendu et un
    // rafraîchissement du badge.
    const existing = [msg('a', T1), msg('b', T2)]
    expect(mergeMessages(existing, [msg('b', T2), msg('a', T1)])).toBe(existing)
  })

  it('dédoublonne par id : un message est immuable, la version en place reste', () => {
    const merged = mergeMessages([msg('a', T1, 'en place')], [msg('a', T1, 'reçu'), msg('b', T2)])
    expect(merged.map((m) => m.id)).toEqual(['a', 'b'])
    expect(merged[0].body).toBe('en place')
  })

  it('replace un message plus ancien à sa place (sondage parti avant un envoi)', () => {
    // Le sondage a rendu « c » ; « b », validé entre-temps, arrive au tour suivant.
    const merged = mergeMessages([msg('a', T1), msg('c', T3)], [msg('b', T2)])
    expect(merged.map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })

  it('départage deux messages à la même milliseconde par leur id', () => {
    const merged = mergeMessages([msg('z', T1)], [msg('b', T1), msg('a', T1)])
    expect(merged.map((m) => m.id)).toEqual(['a', 'b', 'z'])
  })

  it('ne garde que les plus récents au-delà du plafond', () => {
    const existing = Array.from({ length: MAX_KEPT_MESSAGES }, (_, i) =>
      msg(`m${String(i).padStart(4, '0')}`, new Date(Date.UTC(2026, 8, 18, 20, 0, i)).toISOString())
    )
    const merged = mergeMessages(existing, [msg('nouveau', '2026-09-18T23:59:59.000Z')])
    expect(merged).toHaveLength(MAX_KEPT_MESSAGES)
    expect(merged[0].id).toBe('m0001')
    expect(merged[merged.length - 1].id).toBe('nouveau')
  })

  it('accepte un plafond explicite', () => {
    const merged = mergeMessages([msg('a', T1), msg('b', T2)], [msg('c', T3)], 2)
    expect(merged.map((m) => m.id)).toEqual(['b', 'c'])
  })
})

describe('compareMessages — ordre (createdAt, id)', () => {
  it('trie d’abord par date, puis par id, et vaut 0 pour un même message', () => {
    expect(compareMessages(msg('b', T1), msg('a', T2))).toBeLessThan(0)
    expect(compareMessages(msg('b', T1), msg('a', T1))).toBeGreaterThan(0)
    expect(compareMessages(msg('a', T1), msg('a', T1))).toBe(0)
  })
})

describe('chatCursorQuery — curseur du dernier message connu', () => {
  it('est vide sans message (ouverture : les 50 derniers)', () => {
    expect(chatCursorQuery([])).toBe('')
  })

  it('pointe le message le plus récent, id et date encodés pour l’URL', () => {
    expect(chatCursorQuery([msg('a', T1), msg('b', T2)])).toBe(
      '&after=b&afterAt=2026-09-18T20%3A00%3A01.000Z'
    )
  })

  it('choisit par (createdAt, id), pas par position dans la liste', () => {
    expect(chatCursorQuery([msg('c', T3), msg('a', T1)])).toContain('after=c&')
    expect(chatCursorQuery([msg('b', T1), msg('a', T1)])).toContain('after=b&')
  })

  it('encode un id inattendu plutôt que de casser la requête', () => {
    expect(chatCursorQuery([msg('a&b=c', T1)])).toBe(
      '&after=a%26b%3Dc&afterAt=2026-09-18T20%3A00%3A00.000Z'
    )
  })
})

describe('parseChatCursor — lecture du curseur par la route', () => {
  it('vaut null sans paramètres (ouverture de la conversation)', () => {
    expect(parseChatCursor(null, null)).toBeNull()
    expect(parseChatCursor('abc', null)).toBeNull()
    expect(parseChatCursor(null, T1)).toBeNull()
    expect(parseChatCursor('', T1)).toBeNull()
  })

  it('vaut null si la date est illisible', () => {
    expect(parseChatCursor('abc', 'hier soir')).toBeNull()
  })

  it('vaut null si l’id est démesuré', () => {
    expect(parseChatCursor('x'.repeat(65), T1)).toBeNull()
  })

  it('rend (id, Date) à la milliseconde près, tel que le client l’a reçu', () => {
    const cursor = parseChatCursor('clx123', '2026-09-18T20:00:00.649Z')
    expect(cursor).not.toBeNull()
    expect(cursor!.id).toBe('clx123')
    expect(cursor!.createdAt.toISOString()).toBe('2026-09-18T20:00:00.649Z')
  })
})
