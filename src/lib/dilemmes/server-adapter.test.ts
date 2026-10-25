import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applyDilBotAction,
  applyDilRoomAction,
  buildDilState,
  dilBotChoice,
  dilClientViewJson,
  markDilPlayerLeft,
  parseDilState,
  serializeDilState,
} from './server-adapter'
import {
  createDilState,
  dilCurrentCard,
  reduceDil,
  DIL_COUNTDOWN_MS,
  DIL_REVEAL_BOT_TICK_MS,
  DIL_REVEAL_MIN_MS,
  type DilCard,
  type DilState,
} from './engine'
import { phaseKey } from '@/lib/online/phase-clock'
import { BOT_PERSONAS, botDisplayName } from '@/lib/online/bot-personas'
import { getGameAdapter } from '@/lib/online/game-adapters'

const T0 = 1_000_000
const NEVER: DilCard = { kind: 'never', text: 'dormi au travail' }
const PREFER: DilCard = { kind: 'prefer', a: 'option A', b: 'option B' }
const WHO: DilCard = { kind: 'who', text: 'finirait en garde à vue en premier ?' }

/** État en phase vote sur une carte UNIQUE (pas de mélange possible). */
function makeVote(
  players: { id: string; name: string; isBot?: boolean }[],
  card: DilCard
): DilState {
  const raw = createDilState(players, [card], 'seed', T0 - DIL_COUNTDOWN_MS, 1)
  return reduceDil(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
}

function expectOk(result: ReturnType<typeof applyDilBotAction>): DilState {
  if (!result.ok) throw new Error(`tick bot refusé : ${result.error}`)
  return result.state
}

/** Rand stubé : rejoue une séquence de valeurs (la dernière en boucle). */
function seq(...values: number[]): () => number {
  let i = 0
  return () => values[Math.min(i++, values.length - 1)]
}

describe('buildDilState / personas', () => {
  it('les bots de complément portent un persona (nom + emoji) sans doublon, reproductible', () => {
    const members = [{ userId: 'u1', user: { displayName: 'Alice' } }]
    const state = buildDilState(members, 'soft', 3, 'graine-1')
    const bots = state.players.filter((p) => p.isBot)
    expect(bots).toHaveLength(3)
    expect(new Set(bots.map((b) => b.name)).size).toBe(3)
    const displayNames = BOT_PERSONAS.map(botDisplayName)
    for (const bot of bots) expect(displayNames).toContain(bot.name)

    const again = buildDilState(members, 'soft', 3, 'graine-1')
    expect(again.players.map((p) => p.name)).toEqual(state.players.map((p) => p.name))
  })

  it('complète jusqu’au minimum jouable sans option bots', () => {
    const members = [{ userId: 'u1', user: { displayName: 'Alice' } }]
    const state = buildDilState(members, 'soft', 0, 'graine-2')
    expect(state.players).toHaveLength(3)
    expect(state.players.filter((p) => p.isBot)).toHaveLength(2)
  })
})

describe('applyDilBotAction / un tick = un vote', () => {
  it('ne fait voter qu’UN SEUL bot en attente par tick', () => {
    const s = makeVote(
      [
        { id: 'h1', name: 'Alice' },
        { id: 'b1', name: 'Bernadette 🧶', isBot: true },
        { id: 'b2', name: 'Dédé 🎲', isBot: true },
      ],
      NEVER
    )
    expect(s.votes).toEqual({})
    const s1 = expectOk(applyDilBotAction(s, () => 0.5))
    expect(Object.keys(s1.votes)).toEqual(['b1'])
    expect(s1.phase).toBe('vote')
    const s2 = expectOk(applyDilBotAction(s1, () => 0.5))
    expect(Object.keys(s2.votes).sort()).toEqual(['b1', 'b2'])
    // Plus de bot en attente : le tick suivant est un no-op.
    expect(applyDilBotAction(s2, () => 0.5)).toEqual({ ok: false, error: 'NOT_BOT_TURN' })
  })

  it('le dernier vote de bot déclenche la fin anticipée (reveal)', () => {
    let s = makeVote(
      [
        { id: 'h1', name: 'Alice' },
        { id: 'h2', name: 'Bob' },
        { id: 'b1', name: 'Marcel 🍺', isBot: true },
      ],
      NEVER
    )
    s = reduceDil(s, { type: 'VOTE', playerId: 'h1', choice: 'A', now: T0 })
    s = reduceDil(s, { type: 'VOTE', playerId: 'h2', choice: 'B', now: T0 })
    const done = expectOk(applyDilBotAction(s, () => 0.5))
    expect(done.phase).toBe('reveal')
    expect(done.lastReveal).toHaveLength(3)
  })
})

describe('dilBotChoice / heuristiques par persona', () => {
  it('« je n’ai jamais » : P(« je l’ai fait ») = audace — Bernadette sage, Dédé assume', () => {
    const s = makeVote(
      [
        { id: 'h1', name: 'Alice' },
        { id: 'b1', name: 'Bernadette 🧶', isBot: true },
        { id: 'b2', name: 'Dédé 🎲', isBot: true },
      ],
      NEVER
    )
    const bernadette = s.players.find((p) => p.id === 'b1')!
    const dede = s.players.find((p) => p.id === 'b2')!
    const card = dilCurrentCard(s)!
    // rand = 0.5 : au-dessus de l'audace de Bernadette (0.15), sous celle de Dédé (0.9).
    expect(dilBotChoice(s, bernadette, card, () => 0.5)).toBe('B')
    expect(dilBotChoice(s, dede, card, () => 0.5)).toBe('A')
    // Converti sans persona : comportement moyen (audace 0.5).
    const converti = { ...bernadette, name: 'Kevin' }
    expect(dilBotChoice(s, converti, card, () => 0.4)).toBe('A')
    expect(dilBotChoice(s, converti, card, () => 0.6)).toBe('B')
  })

  it('« tu préfères » : le suiveur colle à la majorité, l’agressif contre le premier humain', () => {
    let s = makeVote(
      [
        { id: 'h1', name: 'Alice' },
        { id: 'h2', name: 'Bob' },
        { id: 'h3', name: 'Chloé' },
        { id: 'b1', name: 'Suzette 🌸', isBot: true },
        { id: 'b2', name: 'Raoul 🦊', isBot: true },
      ],
      PREFER
    )
    s = reduceDil(s, { type: 'VOTE', playerId: 'h1', choice: 'B', now: T0 })
    s = reduceDil(s, { type: 'VOTE', playerId: 'h2', choice: 'B', now: T0 })
    s = reduceDil(s, { type: 'VOTE', playerId: 'h3', choice: 'A', now: T0 })
    const suzette = s.players.find((p) => p.id === 'b1')!
    const raoul = s.players.find((p) => p.id === 'b2')!
    const card = dilCurrentCard(s)!
    // Suiveuse : majorité B, quel que soit le hasard.
    expect(dilBotChoice(s, suzette, card, () => 0.99)).toBe('B')
    // Agressif : opposé du PREMIER vote humain (B → A).
    expect(dilBotChoice(s, raoul, card, () => 0.99)).toBe('A')
  })

  it('« qui de la table » : cible un humain 3 fois sur 4, le suiveur copie le premier vote humain', () => {
    const players = [
      { id: 'h1', name: 'Alice' },
      { id: 'h2', name: 'Bob' },
      { id: 'b1', name: 'Gépéto 🤠', isBot: true },
      { id: 'b2', name: 'Suzette 🌸', isBot: true },
    ]
    const s = makeVote(players, WHO)
    const gepeto = s.players.find((p) => p.id === 'b1')!
    const card = dilCurrentCard(s)!
    // 1er tirage < 0.75 → pool humain ; 2e tirage = index dans le pool.
    expect(dilBotChoice(s, gepeto, card, seq(0.5, 0))).toBe('h1')
    expect(dilBotChoice(s, gepeto, card, seq(0.5, 0.6))).toBe('h2')
    // 1er tirage ≥ 0.75 → pool bots (hors soi-même).
    expect(dilBotChoice(s, gepeto, card, seq(0.9, 0))).toBe('b2')

    // La suiveuse copie la cible du premier vote humain déjà posé.
    const withVote = reduceDil(s, { type: 'VOTE', playerId: 'h1', choice: 'b1', now: T0 })
    const suzette = withVote.players.find((p) => p.id === 'b2')!
    expect(dilBotChoice(withVote, suzette, card, () => 0.99)).toBe('b1')
  })

  it('« qui de la table » : jamais soi-même, statistiquement surtout des humains', () => {
    const players = [
      { id: 'h1', name: 'Alice' },
      { id: 'h2', name: 'Bob' },
      { id: 'b1', name: 'Gépéto 🤠', isBot: true },
      { id: 'b2', name: 'Raoul 🦊', isBot: true },
    ]
    const s = makeVote(players, WHO)
    const gepeto = s.players.find((p) => p.id === 'b1')!
    const card = dilCurrentCard(s)!
    let humanHits = 0
    const runs = 400
    for (let i = 0; i < runs; i++) {
      const choice = dilBotChoice(s, gepeto, card)
      expect(choice).not.toBe('b1')
      if (choice === 'h1' || choice === 'h2') humanHits += 1
    }
    // P(humain) = 0.75 : seuil large pour éviter tout flake.
    expect(humanHits / runs).toBeGreaterThan(0.6)
  })
})

describe('reveal : temps de lecture et meneur', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  /** Reveal ouvert à `at` (horloge serveur simulée). */
  function revealAt(players: { id: string; name: string; isBot?: boolean }[], at: number): DilState {
    vi.useFakeTimers()
    vi.setSystemTime(at)
    let s = makeVote(players, NEVER)
    for (const p of players) s = reduceDil(s, { type: 'VOTE', playerId: p.id, choice: 'A', now: at })
    expect(s.phase).toBe('reveal')
    return s
  }

  const TABLE = [
    { id: 'h1', name: 'Alice' },
    { id: 'h2', name: 'Bob' },
    { id: 'h3', name: 'Chloé' },
  ]

  it('« carte suivante » à l’instant du reveal → READING_TIME, accepté après le plancher', () => {
    const s = revealAt(TABLE, T0)
    expect(applyDilRoomAction(s, 'h2', { type: 'continue' })).toEqual({ ok: false, error: 'READING_TIME' })
    vi.setSystemTime(T0 + DIL_REVEAL_MIN_MS - 1)
    expect(applyDilRoomAction(s, 'h2', { type: 'continue' })).toEqual({ ok: false, error: 'READING_TIME' })
    vi.setSystemTime(T0 + DIL_REVEAL_MIN_MS)
    const next = applyDilRoomAction(s, 'h2', { type: 'continue' })
    expect(next.ok && next.state.phase).toBe('finished')
  })

  it('le bot meneur attend le plancher lui aussi quand un humain est assis', () => {
    const s = revealAt(
      [
        { id: 'b1', name: 'Marcel 🍺', isBot: true },
        { id: 'h1', name: 'Alice' },
        { id: 'h2', name: 'Bob' },
      ],
      T0
    )
    expect(applyDilBotAction(s)).toEqual({ ok: false, error: 'READING_TIME' })
    vi.setSystemTime(T0 + DIL_REVEAL_BOT_TICK_MS)
    expect(expectOk(applyDilBotAction(s)).phase).toBe('finished')
  })

  it('personne n’est « au tour » au reveal : replace-afk n’a pas de cible, le tick bot suit le meneur', () => {
    const adapter = getGameAdapter('dilemmes')!
    const humanLead = revealAt(TABLE, T0)
    expect(adapter.currentActorId(humanLead)).toBeNull()
    expect(adapter.serviceTick!(humanLead, T0)).toBeNull()

    const botLead = revealAt(
      [
        { id: 'b1', name: 'Marcel 🍺', isBot: true },
        { id: 'h1', name: 'Alice' },
        { id: 'h2', name: 'Bob' },
      ],
      T0
    )
    expect(adapter.currentActorId(botLead)).toBeNull()
    const tick = adapter.serviceTick!(botLead, T0, { rand: () => 0 })
    expect(tick?.body).toEqual({ action: 'bot' })
    expect(tick!.dueAt).toBeGreaterThanOrEqual(T0 + DIL_REVEAL_BOT_TICK_MS)
  })

  it('la vue publie continueAt ; un état d’avant l’horodatage se relit sans blocage', () => {
    const s = revealAt(TABLE, T0)
    expect(JSON.parse(dilClientViewJson(s, 'h1')).continueAt).toBe(T0 + DIL_REVEAL_MIN_MS)
    const legacy = JSON.parse(serializeDilState(s)) as Record<string, unknown>
    delete legacy.revealAt
    const parsed = parseDilState(JSON.stringify(legacy))!
    expect(parsed.revealAt).toBeNull()
    const next = applyDilRoomAction(parsed, 'h2', { type: 'continue' })
    expect(next.ok).toBe(true)
  })

  it('le départ du dernier votant attendu (markDilPlayerLeft) ouvre le reveal', () => {
    let s = makeVote(TABLE, NEVER)
    s = reduceDil(s, { type: 'VOTE', playerId: 'h1', choice: 'A', now: T0 })
    s = reduceDil(s, { type: 'VOTE', playerId: 'h2', choice: 'B', now: T0 })
    const left = markDilPlayerLeft(s, 'h3', T0 + 1_000)!
    expect(left.phase).toBe('reveal')
    expect(left.lastReveal).toHaveLength(2)
  })
})
