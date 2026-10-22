import { describe, expect, it } from 'vitest'
import type { BotSpeech, SpeechPlayer } from './bot-speech'
import { REACTION_TALK_MAX, reactionSay, reactionTalkChance, readReactionTable, type ReactionOption } from './reaction-speech'

/**
 * Socle des paroles de réaction : une réaction au plus par fait, un orateur
 * tiré parmi les bots éligibles, le dé au bavardage, les plafonds par bot et
 * par manche, et le silence d'une table sans humain.
 */

type K = 'cheer' | 'boo'
const seat = (id: string, name: string, isBot = true, alive = true): SpeechPlayer => ({ id, name, isBot, alive })
const HUMAN = seat('h', 'Riqui', false)
const JOSIANE = seat('j', 'Josiane') // bavardage 3
const GERMAINE = seat('g', 'Germaine') // bavardage 1
const CONVERT = seat('c', 'Paulo') // déserteur converti : bavardage 2
const sp = (playerId: string, kind: K, round = 1): BotSpeech<K> => ({ playerId, kind, targetId: 'h', round })
const table = (players: SpeechPlayer[], speech: BotSpeech<K>[] = []) => readReactionTable(players, speech, 1, 2)
/** Une suite de tirages fixée à l'avance (puis 0). */
const draws = (...values: number[]) => () => values.shift() ?? 0

describe('reactionTalkChance', () => {
  it('base × bavardage / 2, bornée à REACTION_TALK_MAX', () => {
    expect(reactionTalkChance(0.4, { bavardage: 2 })).toBeCloseTo(0.4)
    expect(reactionTalkChance(0.4, { bavardage: 1 })).toBeCloseTo(0.2)
    expect(reactionTalkChance(0.4, { bavardage: 3 })).toBeCloseTo(0.6)
    expect(reactionTalkChance(1, { bavardage: 3 })).toBe(REACTION_TALK_MAX)
  })
})

describe('reactionSay', () => {
  const cheer = (speakers: SpeechPlayer[], base = 0.5): ReactionOption<K, SpeechPlayer> => ({
    speakers,
    kind: 'cheer',
    targetId: 'h',
    base,
  })

  it('tire un orateur parmi les éligibles, puis le dé de parole', () => {
    const t = table([HUMAN, CONVERT, JOSIANE])
    // 0,6 → 2e des deux orateurs (Josiane), dé 0,7 < 0,75 : elle parle.
    expect(reactionSay(t, [cheer([CONVERT, JOSIANE])], 4, draws(0.6, 0.7))).toEqual({
      playerId: 'j',
      kind: 'cheer',
      targetId: 'h',
    })
    // Le converti tiré, dé 0,7 ≥ 0,5 : silence, et l'option suivante n'est pas lue.
    expect(reactionSay(t, [cheer([CONVERT, JOSIANE])], 4, draws(0.1, 0.7))).toBeNull()
  })

  it('options par priorité : la première qui parle l’emporte, une seule réaction', () => {
    const t = table([HUMAN, CONVERT, GERMAINE])
    const options: ReactionOption<K, SpeechPlayer>[] = [
      { speakers: [GERMAINE], kind: 'boo', targetId: 'h', base: 0.5 },
      cheer([CONVERT]),
    ]
    // Germaine tirée, dé 0,3 ≥ 0,25 : elle se tait ; le converti passe son dé.
    expect(reactionSay(t, options, 4, draws(0, 0.3, 0, 0.3))).toEqual({ playerId: 'c', kind: 'cheer', targetId: 'h' })
    expect(reactionSay(t, options, 4, draws(0, 0.1))).toEqual({ playerId: 'g', kind: 'boo', targetId: 'h' })
  })

  it('kind et cible selon l’orateur tiré', () => {
    const t = table([HUMAN, seat('h2', 'Lulu', false), CONVERT])
    const said = reactionSay(
      t,
      [{ speakers: [CONVERT], kind: () => 'boo', targetId: (b) => (b.id === 'c' ? 'h2' : 'h'), base: 1 }],
      4,
      draws(0, 0)
    )
    expect(said).toEqual({ playerId: 'c', kind: 'boo', targetId: 'h2' })
  })

  it('jamais un humain, un parti, un bot à son plafond, ni une parole à soi ou vers un absent', () => {
    const gone = seat('x', 'Gaston', true, false)
    const t = table([HUMAN, gone, GERMAINE, CONVERT], [sp('g', 'cheer'), sp('c', 'cheer'), sp('c', 'boo')])
    expect(reactionSay(t, [cheer([HUMAN, gone, GERMAINE, CONVERT], 1)], 9, draws())).toBeNull()
    const fresh = table([HUMAN, CONVERT])
    expect(reactionSay(fresh, [{ ...cheer([CONVERT], 1), targetId: 'c' }], 9, draws())).toBeNull()
    expect(reactionSay(fresh, [{ ...cheer([CONVERT], 1), targetId: 'nobody' }], 9, draws())).toBeNull()
  })

  it('plafond de la table par manche ; les manches passées ne comptent pas', () => {
    const t = table([HUMAN, CONVERT, JOSIANE], [sp('j', 'cheer'), sp('c', 'cheer', 0), sp('c', 'cheer', 0)])
    expect(reactionSay(t, [cheer([CONVERT], 1)], 1, draws())).toBeNull()
    expect(reactionSay(t, [cheer([CONVERT], 1)], 2, draws())).toEqual({ playerId: 'c', kind: 'cheer', targetId: 'h' })
  })

  it('une table sans humain assis se tait', () => {
    const t = table([seat('h', 'Riqui', false, false), CONVERT, JOSIANE])
    expect(reactionSay(t, [cheer([CONVERT, JOSIANE], 1)], 9, draws())).toBeNull()
  })
})
