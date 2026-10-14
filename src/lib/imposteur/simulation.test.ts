import { describe, expect, it } from 'vitest'
import { createRng } from '@/lib/petit-buveur/rng'
import { phaseKey } from '@/lib/online/phase-clock'
import { BOT_PERSONAS, DEFAULT_BOT_TRAITS } from '@/lib/online/bot-personas'
import {
  createImposteurState,
  imposteurAlive,
  normalizeClue,
  reduceImposteur,
  toImposteurClientView,
  IMPOSTEUR_EMPTY_CLUE,
  IMPOSTEUR_INTENTS_MAX,
  IMPOSTEUR_SPEECH_CAP,
  type ImposteurSpeech,
  type ImposteurState,
  type ImposteurWordPair,
} from './engine'
import { applyImposteurBotAction, imposteurClueBookFor, type ImposteurBotDeps } from './server-adapter'
import { imposteurBotClue, imposteurBotVoteNow } from './bot-brain'
import { getImposteurPairs } from './data'

/**
 * Parties complètes jouées par les bots (échéances simulées), rejouables à
 * l'identique (`rand` seedé). Le catalogue est FACTICE — 10 paires
 * synthétiques bâties comme le vrai (7 indices par mot, les 2 premiers
 * communs aux deux mots) — pour ne mesurer que le cerveau des bots ; le
 * verrou d'équilibre, lui, joue avec le vrai catalogue fr.
 */

const SHARED = ['commun', 'partage']
const SIDE_A = ['ananas', 'abricot', 'avocat', 'airelle', 'amande']
const SIDE_B = ['brocoli', 'betterave', 'bambou', 'basilic', 'bourrache']
const SYNTH = Array.from({ length: 10 }, (_, i) => ({
  pair: { a: `alpha${i}`, b: `bravo${i}` } as ImposteurWordPair,
  a: [...SHARED, ...SIDE_A].map((w) => `${w}${i}`),
  b: [...SHARED, ...SIDE_B].map((w) => `${w}${i}`),
}))
const SYNTH_PAIRS = SYNTH.map((s) => s.pair)
const fakeDeps: ImposteurBotDeps = {
  clueListFor: (_lang, pair, word) => {
    const entry = SYNTH.find(
      (s) => (s.pair.a === pair.a && s.pair.b === pair.b) || (s.pair.a === pair.b && s.pair.b === pair.a)
    )
    if (!entry) return null
    if (word === entry.pair.a) return [...entry.a]
    if (word === entry.pair.b) return [...entry.b]
    return null
  },
}

type Seat = { id: string; name: string; isBot: boolean }

/** `count` bots à persona, la distribution des traits variant avec `offset`. */
function botTable(count: number, offset = 0): Seat[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `bot-${i + 1}`,
    name: BOT_PERSONAS[(i + offset) % BOT_PERSONAS.length].name,
    isBot: true,
  }))
}

type Options = {
  pairs?: ImposteurWordPair[]
  /** Absent : le catalogue réel, valeur par défaut de l'adaptateur. */
  deps?: ImposteurBotDeps
  imposteurCount?: number
  /** Joueur humain scripté : renvoie l'état tel quel s'il n'a rien à faire. */
  human?: (s: ImposteurState, rand: () => number) => ImposteurState
  /** Étalon : les bots votent au hasard uniforme (l'ancien comportement). */
  uniformVotes?: boolean
}

/**
 * Enchaîne les ticks « bot » (et l'humain scripté) jusqu'au refus, puis
 * l'échéance de phase. Un refus autre que NOT_BOT_TURN serait une erreur
 * moteur avalée par l'adaptateur : il fait échouer le test.
 */
function playFullGame(players: Seat[], seed: string, opts: Options = {}): ImposteurState {
  let s = createImposteurState(players, opts.pairs ?? SYNTH_PAIRS, seed, 0, opts.imposteurCount)
  const rand = createRng(`bots-${seed}`).next
  const botStep = (st: ImposteurState): ImposteurState | null => {
    const at = st.phaseEndsAt !== null ? st.phaseEndsAt - 1 : 0
    if (opts.uniformVotes && st.phase === 'vote') {
      const bot = imposteurAlive(st).find((p) => p.isBot && !st.pendingVotes[p.id])
      if (!bot) return null
      const targets = imposteurAlive(st).filter((p) => p.id !== bot.id)
      const target = targets[Math.min(targets.length - 1, Math.floor(rand() * targets.length))]
      return reduceImposteur(st, { type: 'VOTE', playerId: bot.id, targetId: target.id, now: at })
    }
    const r = opts.deps ? applyImposteurBotAction(st, rand, at, opts.deps) : applyImposteurBotAction(st, rand, at)
    if (!r.ok && r.error !== 'NOT_BOT_TURN') throw new Error(`refus inattendu : ${r.error}`)
    return r.ok ? r.state : null
  }
  for (let steps = 0; s.phase !== 'finished'; steps += 1) {
    if (steps > 2_000) throw new Error(`partie sans fin : ${seed}, manche ${s.round}`)
    const byHuman = opts.human?.(s, rand)
    if (byHuman && byHuman !== s) {
      s = byHuman
      continue
    }
    const byBot = botStep(s)
    if (byBot) {
      s = byBot
      continue
    }
    if (s.phaseEndsAt === null) break
    s = reduceImposteur(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: s.phaseEndsAt })
  }
  return s
}

const civilWinRate = (games: ImposteurState[]) =>
  games.filter((g) => g.winnerTeam === 'civil').length / games.length

/** Victoire cohérente avec les vivants (règle de afterReveal). */
function expectCoherentWinner(s: ImposteurState) {
  expect(s.phase).toBe('finished')
  const alive = imposteurAlive(s)
  const imposteurs = alive.filter((p) => p.team === 'imposteur').length
  if (s.winnerTeam === 'civil') {
    expect(imposteurs).toBe(0)
    return
  }
  expect(s.winnerTeam).toBe('imposteur')
  expect(imposteurs).toBeGreaterThan(0)
  const winAt = s.players.length <= 3 ? 2 : 3
  expect(imposteurs >= alive.length - imposteurs || alive.length <= winAt).toBe(true)
}

describe('simulation : des bots seuls finissent toujours une partie', () => {
  for (const count of [3, 4, 6, 9, 16]) {
    it(`table de ${count} bots × 10 graines`, () => {
      for (let seed = 0; seed < 10; seed += 1) {
        expectCoherentWinner(playFullGame(botTable(count, seed), `${seed}`, { deps: fakeDeps }))
      }
    })
  }

  it('même graine ⇒ même partie', () => {
    const run = () => JSON.stringify(playFullGame(botTable(6, 3), 'replay', { deps: fakeDeps }))
    expect(run()).toBe(run())
  })
})

/**
 * Humain scripté : il donne un indice CONCORDANT (de la liste de son mot,
 * vers le milieu) et vote le muet de la manche, sinon celui dont l'indice
 * n'est pas dans sa liste, sinon au hasard.
 */
function scriptedHuman(deps: ImposteurBotDeps) {
  return (s: ImposteurState, rand: () => number): ImposteurState => {
    const me = s.players.find((p) => p.id === 'h1')!
    if (me.eliminated) return s
    const words = [...new Set(s.players.map((p) => p.word))]
    const list = deps.clueListFor('fr', { a: words[0], b: words[1] }, me.word) ?? []
    const at = (s.phaseEndsAt ?? 0) - 1
    if (s.phase === 'clue' && s.clueOrder[s.clueTurnIdx] === 'h1') {
      const said = new Set(s.clues.map((c) => normalizeClue(c.text)))
      const free = list.filter((c) => !said.has(normalizeClue(c)))
      const text = free.length > 0 ? free[Math.min(free.length - 1, 3)] : `trouvaille${s.clues.length}`
      return reduceImposteur(s, { type: 'CLUE', playerId: 'h1', text, now: at })
    }
    if (s.phase === 'vote' && !s.pendingVotes.h1) {
      const others = imposteurAlive(s).filter((p) => p.id !== 'h1')
      const clueOf = (id: string) => s.clues.find((c) => c.playerId === id && c.round === s.round)?.text ?? ''
      const known = new Set(list.map(normalizeClue))
      const target =
        others.find((p) => clueOf(p.id) === IMPOSTEUR_EMPTY_CLUE) ??
        others.find((p) => !known.has(normalizeClue(clueOf(p.id)))) ??
        others[Math.min(others.length - 1, Math.floor(rand() * others.length))]
      return reduceImposteur(s, { type: 'VOTE', playerId: 'h1', targetId: target.id, now: at })
    }
    return s
  }
}

describe('simulation : mesures du vote raisonné', () => {
  it('6 bots, 1 imposteur, 100 graines : victoire civile entre 30 % et 85 %', () => {
    // Le bot imposteur est trahi par un indice précis, jamais systématiquement.
    // Mesure du 14/10/2026 : 74 % (82 % le 13/10, avant prudence de manche 1).
    const games = Array.from({ length: 100 }, (_, seed) =>
      playFullGame(botTable(6, seed), `rate-${seed}`, { deps: fakeDeps, imposteurCount: 1 })
    )
    games.forEach(expectCoherentWinner)
    const rate = civilWinRate(games)
    expect(rate).toBeGreaterThanOrEqual(0.3)
    expect(rate).toBeLessThanOrEqual(0.85)
  })

  it('1 humain scripté + 4 bots : le bot imposteur sort bien plus souvent qu’au vote uniforme', () => {
    // Seuils fixés après mesure (14/10/2026, 200 graines, 164 bots
    // imposteurs) : vote raisonné 76 % démasqués, vote uniforme 60 %. Le
    // 13/10 : 85 % et 48 % — la prudence de manche 1 et le perroquet à +3
    // cachent mieux l'imposteur, et la redite allonge les parties (le vote
    // uniforme a plus de manches pour tomber juste). Sur six jeux de 200
    // graines, le raisonné va de 72 à 78 % et l'écart de 14 à 25 points :
    // le plancher à 65 % laisse au tirage sa marge, l'écart reste le vrai
    // verrou.
    const outRate = (uniformVotes: boolean) => {
      let botImposteurs = 0
      let caught = 0
      for (let seed = 0; seed < 200; seed += 1) {
        const players = [{ id: 'h1', name: 'Léa', isBot: false }, ...botTable(4, seed)]
        const s = playFullGame(players, `human-${seed}`, {
          deps: fakeDeps,
          human: scriptedHuman(fakeDeps),
          uniformVotes,
        })
        expectCoherentWinner(s)
        const imposteur = s.players.find((p) => p.team === 'imposteur')!
        if (!imposteur.isBot) continue
        botImposteurs += 1
        if (imposteur.eliminated) caught += 1
      }
      return caught / botImposteurs
    }
    const reasoned = outRate(false)
    const uniform = outRate(true)
    expect(reasoned).toBeGreaterThan(0.65)
    expect(reasoned - uniform).toBeGreaterThan(0.1)
  })
})

/**
 * Humain simulé « moyen » : il décide comme un bot aux traits par défaut,
 * sur SA vue, avec la liste de son mot et le carnet des mots publics — il
 * n'en sait pas plus qu'un humain à sa place. Sans `deps`, le vrai catalogue.
 */
function averageHuman(deps?: ImposteurBotDeps) {
  return (s: ImposteurState, rand: () => number): ImposteurState => {
    const me = s.players.find((p) => p.id === 'h1')!
    if (me.eliminated) return s
    const at = (s.phaseEndsAt ?? 0) - 1
    const book = imposteurClueBookFor(s, 'h1', deps)
    const own = book(me.word) ?? []
    const view = toImposteurClientView(s, 'h1')
    if (s.phase === 'clue' && s.clueOrder[s.clueTurnIdx] === 'h1') {
      const text = imposteurBotClue(view, 'h1', own, DEFAULT_BOT_TRAITS, rand, book)
      return reduceImposteur(s, { type: 'CLUE', playerId: 'h1', text, now: at })
    }
    if (s.phase === 'vote' && !s.pendingVotes.h1) {
      const target = imposteurBotVoteNow(view, 'h1', own, DEFAULT_BOT_TRAITS, rand, book)
      return target ? reduceImposteur(s, { type: 'VOTE', playerId: 'h1', targetId: target, now: at }) : s
    }
    return s
  }
}

/**
 * ÉQUILIBRE VERROUILLÉ (« répète + bluff informé », 14/10/2026), vrai
 * catalogue fr, nombre d'imposteurs par défaut, 200 graines par table. Les
 * bornes sont les cibles du propriétaire, pas les mesures : aucune table sous
 * 25 % ni au-dessus de 90 % de victoires du village, la table solo (1 humain
 * + 4 bots) entre 55 et 85 %. Mesures du 14/10, tables dans l'ordre
 * ci-dessous (6, 9, 16 bots, 1 + 4, 1 + 8) :
 *   avant (sans redite ni bluff informé, 300 graines) : 86 / 0,3 / 0 / 91 / 40 %,
 *   « … » par partie 1,5 / 31 / 129 / 0,4 / 19 ;
 *   ces 200 graines, après : 76 / 69 / 84 / 67,5 / 63,5 %, aucun « … ».
 * Hors bornes : revoir les réglages retenus — prudence et écho de manche 1
 * (bot-clue.ts), poids du perroquet (bot-brain.ts) —, jamais le catalogue.
 */
describe('simulation : équilibre au vrai catalogue fr', () => {
  const FR = getImposteurPairs('fr')
  const withHuman = (bots: number) => (seed: number) => [{ id: 'h1', name: 'Léa', isBot: false }, ...botTable(bots, seed)]
  const tables = [
    { name: '6 bots', seats: (seed: number) => botTable(6, seed), human: false, min: 0.25, max: 0.9 },
    { name: '9 bots', seats: (seed: number) => botTable(9, seed), human: false, min: 0.25, max: 0.9 },
    { name: '16 bots', seats: (seed: number) => botTable(16, seed), human: false, min: 0.25, max: 0.9 },
    { name: '1 humain + 4 bots', seats: withHuman(4), human: true, min: 0.55, max: 0.85 },
    { name: '1 humain + 8 bots', seats: withHuman(8), human: true, min: 0.25, max: 0.9 },
  ]
  for (const table of tables) {
    it(`${table.name}, 200 graines : village entre ${table.min * 100} et ${table.max * 100} %, jamais « … »`, () => {
      const games = Array.from({ length: 200 }, (_, seed) =>
        playFullGame(table.seats(seed), `equilibre-${table.name}-${seed}`, {
          pairs: FR,
          human: table.human ? averageHuman() : undefined,
        })
      )
      games.forEach(expectCoherentWinner)
      const rate = civilWinRate(games)
      expect(rate).toBeGreaterThanOrEqual(table.min)
      expect(rate).toBeLessThanOrEqual(table.max)
      // Chaque mot fr a sa liste : plus aucun « … », la redite a pris sa place.
      const mutes = games.reduce((n, g) => n + g.clues.filter((c) => c.text === IMPOSTEUR_EMPTY_CLUE).length, 0)
      expect(mutes).toBe(0)
    }, 60_000)
  }
})

/**
 * Parties jouées à une horloge RÉALISTE — un tick bot toutes les 3 s, l'échéance
 * seulement quand plus rien n'est dû — pour que les bots aient le temps de
 * parler (à `phaseEndsAt − 1`, ils votent sans un mot). Rend l'état final et
 * le journal de toutes les paroles (le fil de l'état est élagué à deux manches).
 */
function playTalkingGame(
  players: Seat[],
  seed: string,
  human?: (s: ImposteurState, now: number) => ImposteurState
): { final: ImposteurState; log: ImposteurSpeech[]; spokenIn: string[]; abstentions: number } {
  let s = createImposteurState(players, SYNTH_PAIRS, seed, 0)
  const rand = createRng(`talk-${seed}`).next
  const log: ImposteurSpeech[] = []
  const spokenIn: string[] = []
  let abstentions = 0
  let now = 0
  const record = (before: ImposteurState, after: ImposteurState) => {
    const added = (after.speech ?? []).length - (before.speech ?? []).length
    if (added > 0 && (after.speech ?? []).length > 0 && after.round === before.round) {
      log.push(...(after.speech ?? []).slice(-added))
      spokenIn.push(before.phase)
    }
  }
  for (let steps = 0; s.phase !== 'finished'; steps += 1) {
    if (steps > 3_000) throw new Error(`partie sans fin : ${seed}, manche ${s.round}`)
    now += 3_000
    const byHuman = human?.(s, now)
    if (byHuman && byHuman !== s) {
      record(s, byHuman)
      s = byHuman
      continue
    }
    const r = applyImposteurBotAction(s, rand, now, fakeDeps)
    if (r.ok) {
      record(s, r.state)
      s = r.state
      continue
    }
    if (r.error !== 'NOT_BOT_TURN') throw new Error(`refus inattendu : ${r.error}`)
    if (s.phaseEndsAt === null) break
    if (s.phase === 'vote') abstentions += imposteurAlive(s).filter((p) => p.isBot && !s.pendingVotes[p.id]).length
    now = Math.max(now, s.phaseEndsAt)
    s = reduceImposteur(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now })
  }
  return { final: s, log, spokenIn, abstentions }
}

/**
 * Humain scripté bavard : son indice (concordant, ou il laisse filer une fois
 * sur trois), puis au vote il attend deux annonces, accuse le bot le plus
 * annoncé — une fois par manche — et vote deux ticks plus tard.
 */
function chattyHuman(deps: ImposteurBotDeps) {
  let waited = 0
  return (s: ImposteurState, now: number): ImposteurState => {
    const me = s.players.find((p) => p.id === 'h1')!
    if (me.eliminated) return s
    if (s.phase === 'clue' && s.clueOrder[s.clueTurnIdx] === 'h1') {
      if (s.round % 3 === 0) return s
      const words = [...new Set(s.players.map((p) => p.word))]
      const list = deps.clueListFor('fr', { a: words[0], b: words[1] }, me.word) ?? []
      const said = new Set(s.clues.map((c) => normalizeClue(c.text)))
      const text = list.find((c) => !said.has(normalizeClue(c))) ?? `trouvaille${s.clues.length}`
      return reduceImposteur(s, { type: 'CLUE', playerId: 'h1', text, now })
    }
    if (s.phase !== 'vote' || s.pendingVotes.h1) return s
    const round = (s.speech ?? []).filter((x) => x.round === s.round)
    const intents = round.filter((x) => x.kind === 'intent' && x.targetId !== 'h1')
    if (intents.length < 2) return s
    const accused = round.some((x) => x.playerId === 'h1')
    if (!accused) {
      const target = intents[0].targetId!
      return reduceImposteur(s, { type: 'SPEAK', playerId: 'h1', kind: 'suspect', targetId: target })
    }
    waited += 1
    if (waited % 3 !== 0) return s
    const target = round.find((x) => x.playerId === 'h1')!.targetId!
    return reduceImposteur(s, { type: 'VOTE', playerId: 'h1', targetId: target, now })
  }
}

describe('simulation : les paroles', () => {
  const humanTable = (seed: number): Seat[] => [{ id: 'h1', name: 'Léa', isBot: false }, ...botTable(4, seed)]

  it('1 humain + 4 bots × 60 graines : paroles en indices et vote seulement, plafonnées, jamais une abstention de bot, partie finie', () => {
    let spoken = 0
    for (let seed = 0; seed < 60; seed += 1) {
      const { final, log, spokenIn, abstentions } = playTalkingGame(humanTable(seed), `chat-${seed}`, chattyHuman(fakeDeps))
      expectCoherentWinner(final)
      expect(abstentions, `graine ${seed}`).toBe(0)
      expect(spokenIn.every((phase) => phase === 'clue' || phase === 'vote'), spokenIn.join(',')).toBe(true)
      const rounds = new Set(log.map((x) => x.round))
      for (const round of rounds) {
        const inRound = log.filter((x) => x.round === round)
        const bots = inRound.filter((x) => x.playerId.startsWith('bot-'))
        expect(bots.length).toBeLessThanOrEqual(IMPOSTEUR_SPEECH_CAP * 4)
        for (const id of new Set(inRound.map((x) => x.playerId))) {
          expect(inRound.filter((x) => x.playerId === id).length).toBeLessThanOrEqual(IMPOSTEUR_SPEECH_CAP)
        }
        expect(inRound.filter((x) => x.kind === 'intent').length).toBeLessThanOrEqual(IMPOSTEUR_INTENTS_MAX)
      }
      spoken += log.length
    }
    // Les bots parlent vraiment (annonces au moins), sans se taire tous.
    expect(spoken).toBeGreaterThan(60 * 4)
  })

  it('même graine ⇒ même fil, même partie', () => {
    const run = () => JSON.stringify(playTalkingGame(humanTable(7), 'replay-talk', chattyHuman(fakeDeps)))
    expect(run()).toBe(run())
  })

  it('tables de bots seuls à l’horloge réaliste : finies, sans abstention (personne à éclairer, ils votent d’emblée)', () => {
    for (const count of [3, 6, 9]) {
      for (let seed = 0; seed < 10; seed += 1) {
        const { final, log, abstentions } = playTalkingGame(botTable(count, seed), `solo-bots-${count}-${seed}`)
        expectCoherentWinner(final)
        expect(abstentions).toBe(0)
        expect(log.filter((x) => x.kind === 'intent' || x.kind === 'ask')).toEqual([])
      }
    }
  })
})
