import { describe, expect, it } from 'vitest'
import { phaseKey } from '@/lib/online/phase-clock'
import { BOT_PERSONAS, botDisplayName, personaForBotName } from '@/lib/online/bot-personas'
import { getGameAdapter } from '@/lib/online/game-adapters'
import { buildEspionState } from './server-adapter'
import {
  reduceEspion,
  toEspionSpectatorView,
  ESPION_ACCUSATION_WINDOW_MS,
  ESPION_HUMAN_ASK_PRIORITY_MS,
  ESPION_QUESTION_TIMEOUT_MS,
  type EspionSpeech,
  type EspionState,
} from './engine'
import {
  espionAskTargets,
  espionBotEvents,
  espionBotTempoMs,
  espionBotTickDelayMs,
  espionDueBotEvents,
  espionHash01,
  espionHumanEngaged,
  espionQuestionsOver,
  ESPION_BOT_EARLY_SLACK_MS,
  ESPION_BOT_PAUSE_MIN_MS,
  ESPION_BOT_PAUSE_SPAN_MS,
  ESPION_BOT_TICK_FLOOR_MS,
  ESPION_BOT_TICK_JITTER_MS,
  ESPION_LAST_CALL_GRACE_MS,
  ESPION_LAST_CALL_LATEST_MS,
  ESPION_LAST_CALL_MS,
  ESPION_LAST_CALL_QUIET_MS,
  ESPION_NO_QUESTION_END_MS,
  ESPION_OPENING_MS,
  ESPION_REMARK_OPENING_MS,
  ESPION_REMARK_SPAN_MS,
  ESPION_REMARK_WINDOW_MS,
  ESPION_REVEAL_BOT_TICK_MS,
  ESPION_SPEECH_END_MS,
  ESPION_SPEECH_PAUSE_MS,
  type EspionBotTickInput,
} from './bot-tick'

/**
 * Le calendrier des bots de l'Espion : des instants hachés, ancrés sur le
 * fil public, que le client et le filet serveur calculent pareil.
 */

const zero = () => 0
const one = () => 1
const START = 1_000_000
const DISCUSSION_MS = 180_000
const END = START + DISCUSSION_MS

const bot = (i: number) => ({ id: `bot-${i + 1}`, name: botDisplayName(BOT_PERSONAS[i]), isBot: true, leftAt: null })
const human = (id: string) => ({ id, name: id, isBot: false, leftAt: null })

type Entry = Omit<EspionSpeech, 'round'>

function input(players: EspionBotTickInput['players'], speech: Entry[] = [], extra: Partial<EspionBotTickInput> = {}): EspionBotTickInput {
  return {
    phase: 'discussion',
    round: 1,
    phaseEndsAt: END,
    discussionMs: DISCUSSION_MS,
    activeAccusation: null,
    players,
    speech: speech.map((sp) => ({ ...sp, round: 1 })),
    ...extra,
  }
}

const ask = (playerId: string, targetId: string, at: number, questionId: EspionSpeech['questionId'] = 'where'): Entry => ({
  playerId,
  kind: 'question',
  targetId,
  questionId,
  at,
})
const answer = (playerId: string, targetId: string, at: number, questionId: EspionSpeech['questionId'] = 'where'): Entry => ({
  playerId,
  kind: 'answer',
  targetId,
  questionId,
  value: 'inside',
  at,
})

const SOLO = [human('h1'), bot(0), bot(1), bot(2), bot(3)]
const BOTS = [bot(0), bot(1), bot(2), bot(3), bot(4)]

describe('échéances des bots', () => {
  it('ouverture : la première question 4 s après le début de la manche', () => {
    const [first] = espionBotEvents(input(BOTS), START)
    expect(first).toMatchObject({ kind: 'turn', at: START + ESPION_OPENING_MS })
  })

  it('réponse : un bot interrogé répond à l’instant de la question + son tempo haché, dans la fenêtre de son persona', () => {
    for (const target of BOTS) {
      const askedAt = START + 10_000
      const events = espionBotEvents(input(BOTS, [ask('bot-1' === target.id ? 'bot-2' : 'bot-1', target.id, askedAt)]), askedAt)
      const ev = events.find((e) => e.kind === 'answer')!
      const persona = personaForBotName(target.name)!
      expect(ev).toMatchObject({ botId: target.id, at: askedAt + espionBotTempoMs(target, askedAt) })
      expect(ev.at - askedAt).toBeGreaterThanOrEqual(persona.tempoMinMs)
      expect(ev.at - askedAt).toBeLessThanOrEqual(persona.tempoMaxMs)
    }
  })

  it('question suivante : la main à qui vient de répondre, 3,5 à 6,5 s après sa réponse', () => {
    const answeredAt = START + 15_000
    const speech = [ask('bot-1', 'bot-2', START + 10_000), answer('bot-2', 'bot-1', answeredAt)]
    const turn = espionBotEvents(input(BOTS, speech), answeredAt).find((e) => e.kind === 'turn')!
    expect(turn.botId).toBe('bot-2')
    const pause = ESPION_BOT_PAUSE_MIN_MS + ESPION_BOT_PAUSE_SPAN_MS * espionHash01(`bot-2@${answeredAt}`)
    expect(turn.at).toBe(answeredAt + pause)
    expect(turn.at - answeredAt).toBeGreaterThanOrEqual(3_500)
    expect(turn.at - answeredAt).toBeLessThanOrEqual(6_500)
  })

  it('un humain qui vient de répondre garde la main 12 s ; une question à l’humain sans réponse expire à 25 s', () => {
    const answeredAt = START + 20_000
    const answered = [ask('bot-1', 'h1', START + 10_000), answer('h1', 'bot-1', answeredAt)]
    expect(espionBotEvents(input(SOLO, answered), answeredAt).find((e) => e.kind === 'turn')!.at).toBe(
      answeredAt + ESPION_HUMAN_ASK_PRIORITY_MS
    )
    const askedAt = START + 10_000
    const silent = [ask('bot-1', 'h1', askedAt)]
    const turn = espionBotEvents(input(SOLO, silent), askedAt).find((e) => e.kind === 'turn')!
    expect(turn.at).toBe(askedAt + ESPION_QUESTION_TIMEOUT_MS)
    // À l'expiration, on interroge quelqu'un d'autre.
    expect(espionAskTargets(input(SOLO, silent), turn.botId, turn.at)).not.toContain('h1')
  })

  it('aucune question pendant une accusation, ni dans les 10 dernières secondes', () => {
    const accusation = { accuserId: 'bot-1', targetId: 'bot-2', supporters: ['bot-1'], declined: [], endsAt: START + 20_000 }
    const during = espionBotEvents(input(BOTS, [], { activeAccusation: accusation }), START + 6_000)
    expect(during.some((e) => e.kind === 'turn')).toBe(false)
    const lateAnswer = END - ESPION_NO_QUESTION_END_MS - 1_000
    const late = [ask('bot-1', 'bot-2', lateAnswer - 3_000), answer('bot-2', 'bot-1', lateAnswer)]
    expect(espionBotEvents(input(BOTS, late), lateAnswer).some((e) => e.kind === 'turn')).toBe(false)
  })

  it('décision : chaque bot ni accusé, ni accusateur, ni déjà décidé, à l’ouverture de l’accusation + son tempo', () => {
    const endsAt = START + 30_000
    const openedAt = endsAt - ESPION_ACCUSATION_WINDOW_MS
    const accusation = { accuserId: 'bot-1', targetId: 'bot-2', supporters: ['bot-1', 'bot-3'], declined: ['bot-4'], endsAt }
    const decide = espionBotEvents(input(BOTS, [], { activeAccusation: accusation }), openedAt).filter((e) => e.kind === 'decide')
    expect(decide.map((e) => e.botId)).toEqual(['bot-5'])
    expect(decide[0].at).toBe(openedAt + espionBotTempoMs(BOTS[4], openedAt))
  })

  it('dernier appel : à T − 40 s, repoussé 30 s après la dernière accusation d’un bot, jamais après T − 25 s', () => {
    const quietSpeech = [ask('bot-1', 'bot-2', START + 10_000), answer('bot-2', 'bot-1', START + 12_000)]
    const lastCall = (speech: Entry[], now: number) =>
      espionBotEvents(input(BOTS, speech), now).find((e) => e.kind === 'lastCall')
    expect(lastCall(quietSpeech, START + 20_000)!.at).toBe(END - ESPION_LAST_CALL_MS)
    const accusedAt = END - 65_000
    const recent: Entry[] = [...quietSpeech, { playerId: 'bot-3', kind: 'accuse', targetId: 'bot-4', at: accusedAt }]
    expect(lastCall(recent, accusedAt + 20_000)!.at).toBe(accusedAt + ESPION_LAST_CALL_QUIET_MS)
    expect(lastCall(quietSpeech, END - ESPION_LAST_CALL_LATEST_MS + 1)).toBeUndefined()
    // Le plus audacieux de ceux qui n'ont pas accusé : Raoul (0,85).
    expect(lastCall(quietSpeech, START + 20_000)!.botId).toBe('bot-3')
    // Raoul a accusé ; Gépéto (0,8), seul interrogé de la manche, n'a personne à viser : Marcel (0,7).
    expect(lastCall(recent, accusedAt + 20_000)!.botId).toBe('bot-5')
  })

  it('dernier appel : jamais par un bot qui n’a personne à viser (aucun autre présent interrogé dans la manche)', () => {
    const lastCall = (players: EspionBotTickInput['players'], speech: Entry[]) =>
      espionBotEvents(input(players, speech), END - ESPION_LAST_CALL_MS).find((e) => e.kind === 'lastCall')
    // Aucune question : personne n'est jugé, aucun dernier appel.
    expect(lastCall(BOTS, [])).toBeUndefined()
    // Seul Raoul (bot-3, 0,85) a été interrogé : il n'a personne à viser, Gépéto (0,8) appelle.
    expect(lastCall(BOTS, [ask('bot-1', 'bot-3', START + 10_000), answer('bot-3', 'bot-1', START + 12_000)])!.botId).toBe('bot-2')
    // Le seul interrogé est parti : plus personne à viser.
    const gone = [{ ...human('h1'), leftAt: START + 30_000 }, human('h2'), bot(0)]
    expect(lastCall(gone, [ask('h2', 'h1', START + 10_000), answer('h1', 'h2', START + 12_000)])).toBeUndefined()
    // Aucune question, mais un humain qui accuse à la chaîne : qui a refusé son accusation contre
    // un autre a quelqu'un à viser (équipier : l'accusateur ; espion : la cible) ; la cible, non.
    const table = [human('h1'), bot(0), bot(1), bot(2)]
    const chain: Entry[] = [
      { playerId: 'h1', kind: 'accuse', targetId: 'bot-3', at: START + 5_000 },
      { playerId: 'bot-2', kind: 'doubt', targetId: 'bot-3', at: START + 7_000 },
      { playerId: 'bot-1', kind: 'doubt', targetId: 'bot-3', at: START + 8_000, quiet: true },
    ]
    expect(lastCall(table, chain)!.botId).toBe('bot-2')
    expect(lastCall(table, chain.slice(0, 1))).toBeUndefined()
  })

  it('dernier appel prévu juste avant T − 25 s : encore dû quand le filet serveur arrive (≤ 2,5 s), plus après', () => {
    const quietSpeech = [ask('bot-1', 'bot-2', START + 10_000), answer('bot-2', 'bot-1', START + 12_000)]
    const latest = END - ESPION_LAST_CALL_LATEST_MS
    const accusedAt = latest - 1_000 - ESPION_LAST_CALL_QUIET_MS
    const recent: Entry[] = [...quietSpeech, { playerId: 'bot-3', kind: 'accuse', targetId: 'bot-4', at: accusedAt }]
    const at = accusedAt + ESPION_LAST_CALL_QUIET_MS
    const lastCall = (now: number) => espionBotEvents(input(BOTS, recent), now).find((e) => e.kind === 'lastCall')
    // Tick du client (tirage ≤ 400 ms) ou du serveur (+ 400 ms + 1,5 s de marge) : déjà passé T − 25 s.
    for (const late of [400, 1_900, ESPION_LAST_CALL_GRACE_MS]) expect(lastCall(at + late), `+${late}`).toMatchObject({ at })
    expect(lastCall(at + ESPION_LAST_CALL_GRACE_MS + 1)).toBeUndefined()
  })

  it('dernier appel avancé quand plus aucune question ne viendra (plafond atteint)', () => {
    const speech: Entry[] = []
    let at = START + 5_000
    const ids = BOTS.map((b) => b.id)
    for (let i = 0; i < 10; i += 1) {
      speech.push(ask(ids[i % 5], ids[(i + 1) % 5], at), answer(ids[(i + 1) % 5], ids[i % 5], at + 2_000))
      at += 5_000
    }
    expect(espionQuestionsOver(input(BOTS, speech))).toBe(true)
    const last = espionBotEvents(input(BOTS, speech), at).find((e) => e.kind === 'lastCall')!
    expect(last.at).toBe(speech[speech.length - 1].at + ESPION_BOT_PAUSE_MIN_MS)
    // Un humain qui garde des questions en réserve ne laisse pas abréger la manche.
    const twoBots = [human('h1'), human('h2'), human('h3'), bot(0), bot(1)]
    const exhausted = Array.from({ length: 6 }, (_, i) =>
      ask(i % 2 === 0 ? 'bot-1' : 'bot-2', i % 2 === 0 ? 'bot-2' : 'bot-1', START + i * 5_000)
    )
    expect(espionQuestionsOver(input(twoBots, exhausted))).toBe(false)
  })

  it('révélation menée par un bot : 2,5 s (+ tirage) ; par un humain, ou rien à faire : null', () => {
    const reveal = { phase: 'reveal' as const, phaseEndsAt: null }
    expect(espionBotTickDelayMs(input(BOTS, [], reveal), START, zero)).toBe(ESPION_REVEAL_BOT_TICK_MS)
    expect(espionBotTickDelayMs(input(SOLO, [], reveal), START, zero)).toBeNull()
    for (const phase of ['countdown', 'finished'] as const) {
      expect(espionBotTickDelayMs(input(BOTS, [], { phase }), START, zero)).toBeNull()
    }
    // Discussion sans aucun bot : rien.
    expect(espionBotTickDelayMs(input([human('h1'), human('h2'), human('h3')]), START, zero)).toBeNull()
  })
})

describe('délai du tick', () => {
  it('max(250 ms, prochaine échéance − maintenant) + tirage de 0 à 400 ms ; le serveur (rand = 1) tire après tout client', () => {
    const at = START + ESPION_OPENING_MS
    expect(espionBotTickDelayMs(input(BOTS), START, zero)).toBe(at - START)
    expect(espionBotTickDelayMs(input(BOTS), START, one)).toBe(at - START + ESPION_BOT_TICK_JITTER_MS)
    expect(espionBotTickDelayMs(input(BOTS), at + 5_000, zero)).toBe(ESPION_BOT_TICK_FLOOR_MS)
    for (const r of [0, 0.2, 0.7, 0.999]) {
      expect(espionBotTickDelayMs(input(BOTS), START, () => r)!).toBeLessThanOrEqual(espionBotTickDelayMs(input(BOTS), START, one)!)
    }
  })

  it('une échéance à 1,5 s près est déjà due (horloge du client en avance)', () => {
    const at = START + ESPION_OPENING_MS
    expect(espionDueBotEvents(input(BOTS), at - ESPION_BOT_EARLY_SLACK_MS)).toHaveLength(1)
    expect(espionDueBotEvents(input(BOTS), at - ESPION_BOT_EARLY_SLACK_MS - 1)).toHaveLength(0)
  })
})

describe('à qui poser la question', () => {
  it('solo : l’humain d’office après deux questions ailleurs, jamais deux fois de suite, trois fois au plus', () => {
    const t = START + 60_000
    const two = [ask('bot-1', 'bot-2', START + 5_000), answer('bot-2', 'bot-1', START + 7_000), ask('bot-2', 'bot-3', START + 12_000), answer('bot-3', 'bot-2', START + 14_000)]
    expect(espionAskTargets(input(SOLO, two), 'bot-3', t)).toEqual(['h1'])
    const justAsked = [ask('bot-1', 'h1', START + 5_000), answer('h1', 'bot-1', START + 9_000)]
    expect(espionAskTargets(input(SOLO, justAsked), 'bot-2', t)).not.toContain('h1')
    const thrice = [0, 1, 2].flatMap((i) => [
      ask('bot-1', 'h1', START + i * 20_000),
      answer('h1', 'bot-1', START + i * 20_000 + 3_000),
      ask('bot-2', 'bot-3', START + i * 20_000 + 8_000),
      answer('bot-3', 'bot-2', START + i * 20_000 + 10_000),
    ])
    expect(espionAskTargets(input(SOLO, thrice), 'bot-4', t)).not.toContain('h1')
  })

  it('jamais celui qui vient de m’interroger ; à plusieurs humains, seulement un humain engagé', () => {
    const t = START + 30_000
    const speech = [ask('bot-2', 'bot-1', START + 5_000), answer('bot-1', 'bot-2', START + 8_000)]
    expect(espionAskTargets(input(BOTS, speech), 'bot-1', t)).not.toContain('bot-2')
    const mixed = [human('h1'), human('h2'), bot(0), bot(1), bot(2)]
    expect(espionAskTargets(input(mixed), 'bot-1', t)).toEqual(['bot-2', 'bot-3'])
    const engaged = [ask('h2', 'bot-1', START + 5_000), answer('bot-1', 'h2', START + 8_000)]
    expect(espionHumanEngaged(input(mixed, engaged), 'h2')).toBe(true)
    expect(espionAskTargets(input(mixed, engaged), 'bot-2', t)).toEqual(['h2', 'bot-1', 'bot-3'])
  })
})

describe('serviceTick et client calculent le même délai', () => {
  const adapter = getGameAdapter('espion')!

  /** Ce que passe EspionOnline : la vue (publique ici) et l'heure de la version. */
  const clientDelay = (s: EspionState, now: number, rand: () => number) =>
    espionBotTickDelayMs(toEspionSpectatorView(s), now, rand)

  it('discussion et révélation : borne haute du serveur ≥ tout tirage du client', () => {
    for (let seed = 0; seed < 10; seed += 1) {
      const built = buildEspionState([{ userId: 'h1', user: { displayName: 'Léa' } }], 'fr', 4, seed)
      const now = built.phaseEndsAt!
      const discussion = reduceEspion(built, { type: 'ADVANCE', claimedKey: phaseKey(built), now })
      const reveal = reduceEspion(
        { ...discussion, players: discussion.players.map((p) => (p.id === 'h1' ? { ...p, isBot: true } : p)) },
        { type: 'ADVANCE', claimedKey: phaseKey(discussion), now: discussion.phaseEndsAt! }
      )
      // Une révélation menée par un bot exige un humain présent pour l'arbitrer : on en rajoute un, assis après.
      const revealWithHuman: EspionState = { ...reveal, players: [...reveal.players, { id: 'h2', name: 'Max', isBot: false, leftAt: null, role: 'crew' }] }
      for (const [s, at] of [
        [discussion, now],
        [revealWithHuman, discussion.phaseEndsAt!],
      ] as [EspionState, number][]) {
        const server = adapter.serviceTick!(s, at, { rand: one })
        const bot = clientDelay(s, at, one)
        if (bot === null) continue
        expect(server).not.toBeNull()
        if (server!.body.action === 'bot') expect(server!.dueAt - at).toBe(bot)
        for (const r of [0, 0.3, 0.999]) expect(clientDelay(s, at, () => r)!).toBeLessThanOrEqual(bot)
        expect(adapter.serviceTick!(s, at)).toEqual(server)
      }
    }
  })
})

describe('paroles que la table publique décide (lot 5)', () => {
  const suspect = (playerId: string, targetId: string, at: number): Entry => ({ playerId, kind: 'suspect', targetId, at })
  const speakOf = (events: ReturnType<typeof espionBotEvents>) => events.filter((e) => e.kind === 'speak')

  it('le bot qu’un humain accuse (« louche » ou formellement) se défend contre lui, à l’accusation + son tempo, une seule fois', () => {
    const at = START + 30_000
    for (const kind of ['suspect', 'accuse'] as const) {
      const speech: Entry[] = [{ playerId: 'h1', kind, targetId: 'bot-2', at }]
      const extra = kind === 'accuse' ? { activeAccusation: { accuserId: 'h1', targetId: 'bot-2', supporters: ['h1'], declined: [], endsAt: at + ESPION_ACCUSATION_WINDOW_MS } } : {}
      const [defend] = speakOf(espionBotEvents(input(SOLO, speech, extra), at))
      expect(defend, kind).toEqual({ kind: 'speak', botId: 'bot-2', at: at + espionBotTempoMs(SOLO[2], at), say: { kind: 'defend', targetId: 'h1' } })
      const answered = [...speech, { playerId: 'bot-2', kind: 'defend', targetId: 'h1', at: defend.at } as Entry]
      expect(speakOf(espionBotEvents(input(SOLO, answered, extra), defend.at)), kind).toEqual([])
    }
  })

  it('aucune défense face à un bot, à un accusateur parti, ou sans parole restante au moteur', () => {
    const at = START + 30_000
    expect(speakOf(espionBotEvents(input(BOTS, [suspect('bot-1', 'bot-2', at)]), at))).toEqual([])
    const left = [{ ...human('h1'), leftAt: at + 100 }, ...SOLO.slice(1)]
    expect(speakOf(espionBotEvents(input(left, [suspect('h1', 'bot-2', at)]), at + 200))).toEqual([])
    const spent: Entry[] = [
      { playerId: 'bot-2', kind: 'ally', targetId: 'h1', at: at - 9_000 },
      { playerId: 'bot-2', kind: 'suspect', targetId: 'bot-3', at: at - 5_000 },
      suspect('h1', 'bot-2', at),
    ]
    expect(speakOf(espionBotEvents(input(SOLO, spent), at))).toEqual([])
  })

  it('remarques d’ouverture sur l’espion de la manche d’avant : « je vous l’avais dit », puis « je me suis planté », deux au plus', () => {
    const previous: EspionSpeech[] = [
      { playerId: 'bot-1', kind: 'accuse', targetId: 'bot-3', round: 1, at: START - 100_000 },
      { playerId: 'bot-2', kind: 'rally', targetId: 'bot-4', round: 1, at: START - 90_000, quiet: true },
      { playerId: 'bot-5', kind: 'accuse', targetId: 'bot-4', round: 1, at: START - 80_000 },
    ]
    const round2 = (current: EspionSpeech[] = []): EspionBotTickInput => ({
      ...input(BOTS),
      round: 2,
      speech: [...previous, ...current],
      lastReveal: { round: 1, spyId: 'bot-3' },
    })
    const [first] = speakOf(espionBotEvents(round2(), START))
    expect(first).toMatchObject({ botId: 'bot-1', say: { kind: 'toldYou', targetId: 'bot-3' } })
    expect(first.at).toBeGreaterThanOrEqual(START + ESPION_REMARK_OPENING_MS)
    expect(first.at).toBeLessThanOrEqual(START + ESPION_REMARK_OPENING_MS + ESPION_REMARK_SPAN_MS)
    const once: EspionSpeech = { playerId: 'bot-1', kind: 'toldYou', targetId: 'bot-3', round: 2, at: first.at }
    const [second] = speakOf(espionBotEvents(round2([once]), first.at))
    expect(second).toMatchObject({ botId: 'bot-2', say: { kind: 'wrong', targetId: 'bot-4' } })
    expect(second.at).toBeGreaterThanOrEqual(first.at + ESPION_SPEECH_PAUSE_MS)
    const twice: EspionSpeech = { playerId: 'bot-2', kind: 'wrong', targetId: 'bot-4', round: 2, at: second.at }
    expect(speakOf(espionBotEvents(round2([once, twice]), second.at))).toEqual([])
    // Sans reveal d'avant (partie lancée avant le lot 5), ou en manche 1 : rien.
    expect(speakOf(espionBotEvents({ ...round2(), lastReveal: null }, START))).toEqual([])
    expect(speakOf(espionBotEvents({ ...round2(), round: 1 }, START))).toEqual([])
  })

  it('l’espion démasqué ne revient pas sur ses diversions : pas de « je me suis planté » de sa part', () => {
    // Raoul (bot-3, bavardage 2) a accusé bot-4 en manche 1 ; personne d'autre n'a visé qui que ce soit.
    const previous: EspionSpeech[] = [{ playerId: 'bot-3', kind: 'accuse', targetId: 'bot-4', round: 1, at: START - 100_000 }]
    const round2 = (spyId: string): EspionBotTickInput => ({ ...input(BOTS), round: 2, speech: previous, lastReveal: { round: 1, spyId } })
    expect(speakOf(espionBotEvents(round2('bot-5'), START))).toMatchObject([{ botId: 'bot-3', say: { kind: 'wrong', targetId: 'bot-4' } }])
    expect(speakOf(espionBotEvents(round2('bot-3'), START))).toEqual([])
  })

  it('remarque d’ouverture : jamais passé 20 s, et la question d’ouverture attend qu’on ait lu la bulle', () => {
    const previous: EspionSpeech[] = [{ playerId: 'bot-1', kind: 'accuse', targetId: 'bot-3', round: 1, at: START - 100_000 }]
    const base: EspionBotTickInput = { ...input(BOTS), round: 2, speech: previous, lastReveal: { round: 1, spyId: 'bot-3' } }
    const late = { ...base, speech: [...previous, { playerId: 'bot-2', kind: 'suspect', targetId: 'bot-4', round: 2, at: START + ESPION_REMARK_WINDOW_MS } as EspionSpeech] }
    expect(speakOf(espionBotEvents(late, START + ESPION_REMARK_WINDOW_MS))).toEqual([])
    const remarkAt = START + 3_000
    const said = { ...base, speech: [...previous, { playerId: 'bot-1', kind: 'toldYou', targetId: 'bot-3', round: 2, at: remarkAt } as EspionSpeech] }
    const turn = espionBotEvents(said, remarkAt).find((e) => e.kind === 'turn')!
    expect(turn.at).toBe(Math.max(START + ESPION_OPENING_MS, remarkAt + ESPION_SPEECH_PAUSE_MS))
  })

  it('silence : aucune parole de bot dans les 10 dernières secondes', () => {
    const at = END - ESPION_SPEECH_END_MS - 500
    const speech = [suspect('h1', 'bot-2', at)]
    expect(speakOf(espionBotEvents(input(SOLO, speech), at))).toEqual([])
    const earlier = [suspect('h1', 'bot-2', END - 30_000)]
    expect(speakOf(espionBotEvents(input(SOLO, earlier), END - 29_000))).toHaveLength(1)
    expect(speakOf(espionBotEvents(input(SOLO, earlier), END - ESPION_SPEECH_END_MS))).toEqual([])
  })
})
