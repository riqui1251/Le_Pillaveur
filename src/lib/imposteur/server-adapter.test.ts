import { describe, expect, it } from 'vitest'
import { createRng } from '@/lib/petit-buveur/rng'
import { phaseKey } from '@/lib/online/phase-clock'
import {
  createImposteurState,
  imposteurAlive,
  isValidClue,
  normalizeClue,
  reduceImposteur,
  IMPOSTEUR_BOT_VOTE_MARGIN_MS,
  IMPOSTEUR_COUNTDOWN_MS,
  IMPOSTEUR_EMPTY_CLUE,
  IMPOSTEUR_SPEECH_CAP,
  type ImposteurLang,
  type ImposteurState,
  type ImposteurWordPair,
} from './engine'
import {
  applyImposteurBotAction,
  applyImposteurRoomAction,
  buildImposteurState,
  imposteurClueBookFor,
  parseImposteurState,
  serializeImposteurState,
  type ImposteurBotDeps,
} from './server-adapter'
import { firstRoundEchoCap } from './bot-clue'

/**
 * Indices des bots par le tick `bot` : chaque bot pioche dans la liste de SON
 * mot (catalogue FACTICE injecté par `deps`, indépendant du contenu fr), au
 * ton de son persona, sans lire son camp. `rand` et `now` injectés : une
 * partie est rejouable à l'identique.
 */

const T0 = 1_000_000
const PAIR: ImposteurWordPair = { a: 'plage', b: 'piscine' }
const LISTS: Record<string, string[]> = {
  plage: ['été', 'serviette', 'sable', 'vagues', 'parasol', 'marée', 'crabe', 'bronzage'],
  piscine: ['été', 'serviette', 'chlore', 'maître-nageur', 'plongeoir', 'bonnet de bain', 'pédiluve', 'toboggan'],
}
const samePair = (p: ImposteurWordPair) =>
  (p.a === PAIR.a && p.b === PAIR.b) || (p.a === PAIR.b && p.b === PAIR.a)
const deps: ImposteurBotDeps = {
  clueListFor: (lang, pair, word) => (lang === 'fr' && samePair(pair) ? (LISTS[word] ?? null) : null),
}
const NONE: ImposteurBotDeps = { clueListFor: () => null }

/** 1 humain + 4 bots à persona (un par trait). */
const TABLE = [
  { id: 'h1', name: 'Léa' },
  { id: 'bot-1', name: 'Barnabé', isBot: true }, // prudent
  { id: 'bot-2', name: 'Raoul', isBot: true }, // agressif
  { id: 'bot-3', name: 'Suzette', isBot: true }, // suiveur
  { id: 'bot-4', name: 'Gépéto', isBot: true }, // farceur
]

/** Partie créée puis countdown consommé : phase indice pile à T0. */
function make(seed: string | number = 'seed', lang?: ImposteurLang): ImposteurState {
  const raw = createImposteurState(TABLE, [PAIR], seed, T0 - IMPOSTEUR_COUNTDOWN_MS, undefined, lang)
  return reduceImposteur(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
}

/** Joue la manche d'indices : les bots par tick, l'humain dit « indice ». */
function playClues(s0: ImposteurState, rand: () => number, d: ImposteurBotDeps = deps): ImposteurState {
  let s = s0
  while (s.phase === 'clue') {
    const actorId = s.clueOrder[s.clueTurnIdx]
    const actor = s.players.find((p) => p.id === actorId)!
    if (actor.isBot) {
      const r = applyImposteurBotAction(s, rand, T0, d)
      if (!r.ok) throw new Error(r.error)
      s = r.state
    } else {
      s = reduceImposteur(s, { type: 'CLUE', playerId: actorId, text: 'indice', now: T0 })
    }
  }
  return s
}

const wordOf = (s: ImposteurState, id: string) => s.players.find((p) => p.id === id)!.word
const botClues = (s: ImposteurState) => s.clues.filter((c) => c.playerId.startsWith('bot-'))

describe('applyImposteurBotAction — indices', () => {
  it('un bot au tour donne un indice de la liste de SON mot, valide pour le moteur', () => {
    const s = playClues(make('seed'), createRng('bots').next)
    expect(s.phase).toBe('vote')
    expect(botClues(s)).toHaveLength(4)
    for (const c of botClues(s)) {
      expect(LISTS[wordOf(s, c.playerId)]).toContain(c.text)
      expect(isValidClue(c.text, wordOf(s, c.playerId))).toBe(true)
    }
  })

  it('un bot IMPOSTEUR pioche aussi dans la liste de son mot : il ignore son camp', () => {
    let found = 0
    for (let seed = 0; seed < 20; seed += 1) {
      const s0 = make(seed)
      const imposteur = s0.players.find((p) => p.team === 'imposteur')!
      if (!imposteur.isBot) continue
      found += 1
      const s = playClues(s0, createRng(`bots-${seed}`).next)
      const clue = s.clues.find((c) => c.playerId === imposteur.id)!
      expect(LISTS[imposteur.word]).toContain(clue.text)
    }
    expect(found).toBeGreaterThan(0)
  })

  it('manche 1 : un indice redit au plus en écho, sans chœur ; manche 2 : rien de redit tant que la liste a du libre', () => {
    const rand = createRng('two-rounds').next
    let s = playClues(make('seed'), rand)
    const first = botClues(s).map((c) => normalizeClue(c.text))
    const cap = firstRoundEchoCap(TABLE.length, LISTS.plage.length)
    for (const text of first) expect(first.filter((t) => t === text).length).toBeLessThanOrEqual(cap)
    // Un civil sort → 4 vivants, l'imposteur n'a pas encore gagné : manche 2.
    const victim = s.players.find((p) => p.team === 'civil')!
    for (const p of imposteurAlive(s)) {
      if (s.phase !== 'vote') break
      const target = p.id === victim.id ? imposteurAlive(s).find((q) => q.id !== p.id)!.id : victim.id
      s = reduceImposteur(s, { type: 'VOTE', playerId: p.id, targetId: target, now: T0 })
    }
    expect(s.phase).toBe('reveal')
    s = reduceImposteur(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: s.phaseEndsAt! })
    expect(s.round).toBe(2)
    s = playClues(s, rand)
    expect(s.phase).toBe('vote')
    const second = botClues(s)
      .filter((c) => c.round === 2)
      .map((c) => normalizeClue(c.text))
    expect(second.every((t) => t !== IMPOSTEUR_EMPTY_CLUE)).toBe(true)
    expect(new Set(second).size).toBe(second.length)
    expect(second.some((t) => first.includes(t))).toBe(false)
  })

  it('liste épuisée : le bot se répète au lieu de dire « … », manche après manche', () => {
    const SHORT: ImposteurBotDeps = {
      clueListFor: (lang, pair, word) => (deps.clueListFor(lang, pair, word) ?? []).slice(0, 3),
    }
    let s = make('seed')
    const rand = createRng('short').next
    for (let round = 1; round <= 3; round += 1) {
      s = playClues(s, rand, SHORT)
      // Personne ne sort : égalité forcée, on rejoue une manche.
      s = reduceImposteur(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: s.phaseEndsAt! })
      s = reduceImposteur(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: s.phaseEndsAt! })
    }
    expect(s.round).toBe(4)
    const said = botClues(s)
    expect(said).toHaveLength(12)
    for (const c of said) {
      expect(c.text).not.toBe(IMPOSTEUR_EMPTY_CLUE)
      expect(LISTS[wordOf(s, c.playerId)].slice(0, 3)).toContain(c.text)
    }
  })

  it('état sans lang ni previousReveal (partie d’avant les champs) : parsé et jouable', () => {
    const { lang: _lang, previousReveal: _previous, ...legacy } = make('seed')
    const parsed = parseImposteurState(serializeImposteurState(legacy as ImposteurState))!
    expect(parsed.lang).toBe('fr')
    expect(parsed.previousReveal).toBeNull()
    const s = playClues(parsed, createRng('legacy').next)
    expect(s.phase).toBe('vote')
    expect(botClues(s).every((c) => c.text !== IMPOSTEUR_EMPTY_CLUE)).toBe(true)
  })

  it('lang inconnue → fr ; langue sans catalogue → « … »', () => {
    expect(parseImposteurState(JSON.stringify({ ...make(), lang: 'de' }))!.lang).toBe('fr')
    const s = playClues(make('seed', 'en'), createRng('en').next)
    expect(botClues(s).every((c) => c.text === IMPOSTEUR_EMPTY_CLUE)).toBe(true)
  })

  it('paire absente du catalogue → « … », comme avant', () => {
    const s = playClues(make('seed'), createRng('none').next, NONE)
    expect(botClues(s)).toHaveLength(4)
    expect(botClues(s).every((c) => c.text === IMPOSTEUR_EMPTY_CLUE)).toBe(true)
  })

  it('filet isValidClue : une liste qui trahit le mot retombe sur « … »', () => {
    const cheat: ImposteurBotDeps = {
      clueListFor: (_lang, _pair, word) => [`${word}s`, word.toUpperCase(), word.slice(0, 4)],
    }
    const s = playClues(make('seed'), createRng('cheat').next, cheat)
    expect(botClues(s).every((c) => c.text === IMPOSTEUR_EMPTY_CLUE)).toBe(true)
  })

  it('rand / now injectés : même graine ⇒ même partie, échéance posée à now', () => {
    const run = () => playClues(make('seed'), createRng('det').next)
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()))
    const s0 = make('seed')
    const firstBot = s0.players.find((p) => p.id === s0.clueOrder[0])!
    if (firstBot.isBot) {
      const r = applyImposteurBotAction(s0, createRng('now').next, T0 + 5_000, deps)
      expect(r.ok && r.state.phaseEndsAt).toBeGreaterThan(T0 + 5_000)
    } else {
      expect(applyImposteurBotAction(s0, createRng('now').next, T0, deps)).toEqual({
        ok: false,
        error: 'NOT_BOT_TURN',
      })
    }
  })

  it('le tick « bot » de la salle passe par les valeurs par défaut (catalogue réel, horloge)', () => {
    // Une table dont le premier à parler est un bot (la graine est cherchée,
    // pas devinée : le test ne dépend pas d'un tirage).
    const firstBot = (pair: ImposteurWordPair): ImposteurState => {
      for (let seed = 0; seed < 50; seed += 1) {
        const raw = createImposteurState(TABLE, [pair], seed, T0 - IMPOSTEUR_COUNTDOWN_MS)
        const s = reduceImposteur(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
        if (s.players.find((p) => p.id === s.clueOrder[0])!.isBot) return s
      }
      throw new Error('aucune graine ne fait parler un bot en premier')
    }
    // Paire étrangère à tout catalogue : le chemin par défaut retombe sur « … »,
    // quel que soit l'état de remplissage des lots.
    const absent = firstBot({ a: 'zorglub', b: 'xylophage' })
    const r0 = applyImposteurRoomAction(absent, 'h1', { type: 'bot' })
    expect(r0.ok && r0.state.clues[0].text).toBe(IMPOSTEUR_EMPTY_CLUE)
    // Paire réelle (fr, lot 1) : stub vide → « … », lot rempli → un indice du
    // catalogue ; dans les deux cas le moteur l'accepte.
    const real = firstBot(PAIR)
    const r1 = applyImposteurRoomAction(real, 'h1', { type: 'bot' })
    expect(r1.ok).toBe(true)
    if (!r1.ok) return
    const actor = real.players.find((p) => p.id === real.clueOrder[0])!
    expect(isValidClue(r1.state.clues[0].text, actor.word)).toBe(true)
    expect(r1.state.phase).not.toBe('countdown')
    // L'humain n'est pas au tour : refus, quel que soit le catalogue.
    expect(applyImposteurRoomAction(real, 'h1', { type: 'clue', text: 'indice' })).toEqual({
      ok: false,
      error: 'NOT_YOUR_TURN',
    })
  })
})

describe('imposteurClueBookFor — le carnet des mots publics', () => {
  it('la liste de son mot ; celle de l’autre mot seulement une fois annoncé à une révélation', () => {
    const s = make('seed')
    const civil = s.players.find((p) => p.team === 'civil' && p.isBot)!
    const imposteur = s.players.find((p) => p.team === 'imposteur')!
    const book = imposteurClueBookFor(s, civil.id, deps)
    expect(book(civil.word)).toEqual(LISTS[civil.word])
    expect(book(imposteur.word)).toBeNull()
    expect(book('mer')).toBeNull()
    // Un civil sort : son mot devient public — pour tous, et pour lui seul.
    const out = s.players.find((p) => p.team === 'civil' && p.id !== civil.id)!
    const after: ImposteurState = {
      ...s,
      players: s.players.map((p) => (p.id === out.id ? { ...p, eliminated: true } : p)),
    }
    expect(imposteurClueBookFor(after, imposteur.id, deps)(civil.word)).toEqual(LISTS[civil.word])
    expect(imposteurClueBookFor(after, civil.id, deps)(imposteur.word)).toBeNull()
  })

  it('paire absente du catalogue : rien, même pour son propre mot', () => {
    const s = make('seed')
    const bot = s.players.find((p) => p.isBot)!
    expect(imposteurClueBookFor(s, bot.id, NONE)(bot.word)).toBeNull()
  })
})

describe('applyImposteurBotAction — vote et révélation', () => {
  it('vote raisonné : chaque bot vote sur SA vue — tous (farceur et imposteur à part) visent l’humain resté muet', () => {
    for (let seed = 0; seed < 10; seed += 1) {
      const rand = createRng(`mute-${seed}`).next
      let s = make(seed)
      while (s.phase === 'clue') {
        const actor = s.players.find((p) => p.id === s.clueOrder[s.clueTurnIdx])!
        if (actor.isBot) {
          const r = applyImposteurBotAction(s, rand, T0, deps)
          if (!r.ok) throw new Error(r.error)
          s = r.state
        } else {
          // L'humain laisse filer son chrono : « … ».
          s = reduceImposteur(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: s.phaseEndsAt! })
        }
      }
      expect(s.clues.find((c) => c.playerId === 'h1')!.text).toBe(IMPOSTEUR_EMPTY_CLUE)
      // À la marge de l'échéance, les bots votent sans plus parler.
      const r = applyImposteurBotAction(s, rand, s.phaseEndsAt! - IMPOSTEUR_BOT_VOTE_MARGIN_MS, deps)
      expect(r.ok).toBe(true)
      if (!r.ok) return
      // Le bot imposteur vote en bluffeur (imposteurBotVote) : lui seul peut viser ailleurs.
      for (const bot of s.players.filter((p) => p.isBot && p.name !== 'Gépéto' && p.team !== 'imposteur')) {
        expect(r.state.pendingVotes[bot.id], `graine ${seed} : ${bot.id}`).toBe('h1')
      }
    }
  })

  it('vote groupé : un tick fait voter tous les bots retardataires, à l’identique pour un même rand, jamais eux-mêmes', () => {
    const s = playClues(make('seed'), createRng('bots').next)
    const late = s.phaseEndsAt! - IMPOSTEUR_BOT_VOTE_MARGIN_MS
    const r = applyImposteurBotAction(s, createRng('vote').next, late, deps)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.state.phase).toBe('vote')
    for (const bot of s.players.filter((p) => p.isBot)) {
      expect(r.state.pendingVotes[bot.id]).toBeDefined()
      expect(r.state.pendingVotes[bot.id]).not.toBe(bot.id)
    }
    expect(r.state.pendingVotes.h1).toBeUndefined()
    const again = applyImposteurBotAction(s, createRng('vote').next, late, deps)
    expect(JSON.stringify(again)).toBe(JSON.stringify(r))
    expect(applyImposteurBotAction(r.state, createRng('x').next, T0, deps)).toEqual({
      ok: false,
      error: 'NOT_BOT_TURN',
    })
  })

  it('révélation : le premier vivant bot « continue » à now', () => {
    let s = playClues(make('seed'), createRng('bots').next)
    // Tout le monde vote l'humain : le premier vivant devient un bot.
    for (const p of imposteurAlive(s)) {
      if (s.phase !== 'vote') break
      const target = p.id === 'h1' ? 'bot-1' : 'h1'
      s = reduceImposteur(s, { type: 'VOTE', playerId: p.id, targetId: target, now: T0 })
    }
    expect(s.phase).toBe('reveal')
    const r = applyImposteurBotAction(s, createRng('reveal').next, T0 + 100, deps)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(['clue', 'finished']).toContain(r.state.phase)
    expect(r.state.version).toBe(s.version + 1)
  })
})

describe('applyImposteurRoomAction — indice d’un humain', () => {
  /** Table où l'humain parle en premier (graine cherchée, pas devinée). */
  const humanFirst = (): ImposteurState => {
    for (let seed = 0; seed < 50; seed += 1) {
      const s = make(seed)
      if (s.clueOrder[0] === 'h1') return s
    }
    throw new Error('aucune graine ne fait parler l’humain en premier')
  }

  it('« … » envoyé par un humain est refusé, même entouré d’espaces ou en points ASCII : l’état ne bouge pas', () => {
    const s = humanFirst()
    for (const text of [IMPOSTEUR_EMPTY_CLUE, `  ${IMPOSTEUR_EMPTY_CLUE} `, '...', '. . .', '..…']) {
      expect(applyImposteurRoomAction(s, 'h1', { type: 'clue', text })).toEqual({
        ok: false,
        error: 'INVALID_CLUE',
      })
    }
    expect(s.clues).toEqual([])
    expect(s.clueTurnIdx).toBe(0)
  })

  it('un vrai indice passe ; à l’échéance, le muet reçoit toujours « … » du moteur', () => {
    const s = humanFirst()
    const said = applyImposteurRoomAction(s, 'h1', { type: 'clue', text: 'soleil' })
    expect(said.ok && said.state.clues[0]).toMatchObject({ playerId: 'h1', text: 'soleil' })
    const silent = applyImposteurRoomAction(s, 'h1', { type: 'advance', phaseKey: phaseKey(s) })
    // L'échéance se juge à l'horloge réelle : la partie seedée à T0 est échue.
    expect(silent.ok && silent.state.clues[0]).toMatchObject({ playerId: 'h1', text: IMPOSTEUR_EMPTY_CLUE })
  })
})

describe('buildImposteurState', () => {
  it('pose la langue de la salle (inconnue ou absente → fr) et comble en bots', () => {
    const members = [{ userId: 'u1', user: { displayName: 'Léa' } }]
    expect(buildImposteurState(members, 'en', 4).lang).toBe('en')
    expect(buildImposteurState(members, 'it', 4).lang).toBe('it')
    expect(buildImposteurState(members, 'de', 4).lang).toBe('fr')
    expect(buildImposteurState(members, null, 4).lang).toBe('fr')
    const s = buildImposteurState(members, 'fr', 4, 'seed')
    expect(s.players).toHaveLength(5)
    expect(s.players.filter((p) => p.isBot)).toHaveLength(4)
    expect(parseImposteurState(serializeImposteurState(s))!.lang).toBe('fr')
  })
})

describe('applyImposteurBotAction — paroles', () => {
  /** Manche d'indices jouée (l'humain dit « indice ») : phase vote ouverte à T0, échéance à T0 + 60 s. */
  const atVote = (seed: string | number = 'seed') => playClues(make(seed), createRng(`c-${seed}`).next)
  const pendingBots = (s: ImposteurState) => imposteurAlive(s).filter((p) => p.isBot && !s.pendingVotes[p.id])

  /** D'un état au suivant, une seule chose : un indice, une parole, le vote groupé ou la suite de la révélation. */
  function expectOneMove(a: ImposteurState, b: ImposteurState) {
    const spoke = (b.speech ?? []).length - (a.speech ?? []).length
    const clued = b.clues.length - a.clues.length
    const voted = a.phase === 'vote' && (b.phase === 'reveal' || Object.keys(b.pendingVotes).length > Object.keys(a.pendingVotes).length)
    const continued = a.phase === 'reveal' && b.phase !== 'reveal'
    const changes = [spoke === 1, clued === 1, voted && spoke === 0, continued].filter(Boolean)
    expect(changes, `${a.phase} → ${b.phase}`).toHaveLength(1)
  }

  it('un tick = un indice OU une parole OU le vote groupé, sur des parties entières', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const rand = createRng(`one-${seed}`).next
      let s = make(seed)
      let now = T0
      for (let step = 0; step < 200 && s.phase !== 'finished'; step += 1) {
        now += 3_000
        const r = applyImposteurBotAction(s, rand, now, deps)
        if (r.ok) {
          expectOneMove(s, r.state)
          s = r.state
          continue
        }
        expect(r.error).toBe('NOT_BOT_TURN')
        // Rien pour les bots : l'humain joue, sinon l'échéance tombe.
        const me = s.players.find((p) => p.id === 'h1')!
        if (s.phase === 'clue' && s.clueOrder[s.clueTurnIdx] === 'h1') {
          s = reduceImposteur(s, { type: 'CLUE', playerId: 'h1', text: seed % 3 ? 'zorglub' : 'sable', now })
        } else if (s.phase === 'vote' && !me.eliminated && !s.pendingVotes.h1) {
          s = reduceImposteur(s, { type: 'VOTE', playerId: 'h1', targetId: imposteurAlive(s).find((p) => p.id !== 'h1')!.id, now })
        } else if (s.phaseEndsAt !== null) {
          now = Math.max(now, s.phaseEndsAt)
          s = reduceImposteur(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now })
        }
      }
      expect(s.phase).toBe('finished')
    }
  })

  it('ANTI-ABSTENTION : en phase vote, tant qu’un bot n’a pas voté, le tick réussit — fil, heure et votes humains quelconques', () => {
    const kinds = ['suspect', 'defend', 'ally', 'rally', 'doubt', 'ask', 'intent'] as const
    let checked = 0
    for (let seed = 0; seed < 300; seed += 1) {
      const g = createRng(`aa-${seed}`)
      let s = atVote(seed % 25)
      for (let k = g.pickIndex(10); k > 0; k -= 1) {
        const alive = imposteurAlive(s)
        const author = alive[g.pickIndex(alive.length)]
        const others = alive.filter((p) => p.id !== author.id)
        const action = {
          type: 'SPEAK' as const,
          playerId: author.id,
          kind: kinds[g.pickIndex(kinds.length)],
          targetId: others[g.pickIndex(others.length)].id,
        }
        try {
          s = reduceImposteur(s, action)
        } catch {
          // Plafond atteint : parole refusée, on continue.
        }
      }
      if (g.chance(0.5)) s = reduceImposteur(s, { type: 'VOTE', playerId: 'h1', targetId: 'bot-2', now: T0 })
      if (g.chance(0.3)) s = reduceImposteur(s, { type: 'VOTE', playerId: 'bot-1', targetId: 'h1', now: T0 })
      if (s.phase !== 'vote' || pendingBots(s).length === 0) continue
      const now = T0 + g.pickIndex(60) * 1_000
      // Toute la chaîne jusqu'au vote des bots : jamais de refus en route.
      for (let i = 0; i < 30 && s.phase === 'vote' && pendingBots(s).length > 0; i += 1) {
        const r = applyImposteurBotAction(s, g.next, now + i * 3_000, deps)
        expect(r.ok, `graine ${seed}, tick ${i}`).toBe(true)
        if (!r.ok) break
        s = r.state
        checked += 1
      }
      expect(s.phase !== 'vote' || pendingBots(s).length === 0).toBe(true)
    }
    expect(checked).toBeGreaterThan(300)
  })

  it(`à ${IMPOSTEUR_BOT_VOTE_MARGIN_MS / 1000} s de l’échéance, les bots votent sans plus parler`, () => {
    const s = atVote()
    const early = applyImposteurBotAction(s, createRng('early').next, T0 + 1_000, deps)
    expect(early.ok && early.state.speech).toHaveLength(1)
    expect(early.ok && Object.keys(early.state.pendingVotes)).toEqual([])
    const late = applyImposteurBotAction(s, createRng('late').next, s.phaseEndsAt! - IMPOSTEUR_BOT_VOTE_MARGIN_MS, deps)
    expect(late.ok && late.state.speech).toEqual([])
    expect(late.ok && pendingBots(late.state)).toEqual([])
  })

  it('après son vote, un bot accusé par un humain se défend encore ; puis plus rien', () => {
    let s = atVote()
    const voted = applyImposteurBotAction(s, createRng('v').next, s.phaseEndsAt! - IMPOSTEUR_BOT_VOTE_MARGIN_MS, deps)
    if (!voted.ok) throw new Error(voted.error)
    s = voted.state
    expect(pendingBots(s)).toEqual([])
    const accused = applyImposteurRoomAction(s, 'h1', { type: 'speak', kind: 'suspect', targetId: 'bot-1' })
    if (!accused.ok) throw new Error(accused.error)
    const r = applyImposteurBotAction(accused.state, createRng('d').next, T0 + 2_000, deps)
    // Barnabé, prudent, se défend face à son accusatrice.
    expect(r.ok && r.state.speech?.at(-1)).toEqual({ playerId: 'bot-1', kind: 'defend', targetId: 'h1', round: 1 })
    expect(r.ok && r.state.pendingVotes).toEqual(s.pendingVotes)
  })

  it('un humain n’a que Accuser / Me défendre : tout autre kind → INVALID_KIND, l’état ne bouge pas', () => {
    const s = atVote()
    for (const kind of ['intent', 'ask', 'rally', 'doubt', 'ally', 'toldYou', 'wrong', 'bogus']) {
      expect(applyImposteurRoomAction(s, 'h1', { type: 'speak', kind, targetId: 'bot-2' }), kind).toEqual({
        ok: false,
        error: 'INVALID_KIND',
      })
    }
    const said = applyImposteurRoomAction(s, 'h1', { type: 'speak', kind: 'suspect', targetId: 'bot-2' })
    expect(said.ok && said.state.speech).toEqual([{ playerId: 'h1', kind: 'suspect', targetId: 'bot-2', round: 1 }])
    const defended = applyImposteurRoomAction(s, 'h1', { type: 'speak', kind: 'defend', targetId: 'bot-2' })
    expect(defended.ok).toBe(true)
    // Hors phase de parole, le moteur refuse ; au-delà du plafond aussi.
    const raw = createImposteurState(TABLE, [PAIR], 'seed', T0)
    expect(applyImposteurRoomAction(raw, 'h1', { type: 'speak', kind: 'suspect', targetId: 'bot-2' })).toEqual({
      ok: false,
      error: 'NOT_SPEECH_PHASE',
    })
    let full = s
    for (let i = 0; i < IMPOSTEUR_SPEECH_CAP; i += 1) {
      const r = applyImposteurRoomAction(full, 'h1', { type: 'speak', kind: 'suspect', targetId: 'bot-2' })
      if (!r.ok) throw new Error(r.error)
      full = r.state
    }
    expect(applyImposteurRoomAction(full, 'h1', { type: 'speak', kind: 'suspect', targetId: 'bot-3' })).toEqual({
      ok: false,
      error: 'ALREADY_SPOKE',
    })
  })

  it('état d’avant le champ : `speech` absent ou corrompu → fil vide, partie jouable', () => {
    const { speech: _speech, ...legacy } = atVote()
    expect(parseImposteurState(serializeImposteurState(legacy as ImposteurState))!.speech).toEqual([])
    expect(parseImposteurState(JSON.stringify({ ...legacy, speech: 'n’importe quoi' }))!.speech).toEqual([])
    const parsed = parseImposteurState(serializeImposteurState(legacy as ImposteurState))!
    const r = applyImposteurBotAction(parsed, createRng('legacy').next, T0 + 1_000, deps)
    expect(r.ok).toBe(true)
  })
})
