import { describe, expect, it } from 'vitest'
import { createRng } from '@/lib/petit-buveur/rng'
import { botTraitsFor, pickBotPersonas, botDisplayName } from '@/lib/online/bot-personas'
import {
  LG_DEBATE_DEFAULT_MS,
  LG_SPEECH_CAP,
  LGEngineError,
  reduceLG,
  type LGAction,
  type LGDebateSpeech,
  type LGPlayer,
  type LGRole,
  type LGState,
} from './engine'
import {
  LG_ASK_MAX_PER_ROUND,
  OPENING_ALLY_SHARE_MIN,
  OPENING_ALLY_SHARE_SPAN,
  SECOND_REACTION_MIN_AUDACE,
  STANDS_BY_ALLY_MIN_LOYAUTE,
  lgBotDebateMove,
} from './bot-debate'

/**
 * Lot 3 : les cibles d'ouverture viennent du score public (lgSuspicion), la
 * voyante bot joue ses visions sans les dire, et les bots commentent la
 * manche écoulée avant d'ouvrir — voir les describe « (b) ouverture par le
 * score public » et « (b0) remarques d'ouverture » en fin de fichier.
 */

/**
 * Planificateur du débat : un coup par tick, réactions au trait, ouvertures
 * par tempo, interpellation d'un humain muet, skip groupé — et terminaison.
 */

const T0 = 1_000_000
const ENDS = T0 + LG_DEBATE_DEFAULT_MS
const fixed = (v: number) => () => v

/** Identifiant commençant par `b` = bot. Le nom porte le persona. */
const P = (id: string, name: string, role: LGRole = 'villageois'): LGPlayer => ({
  id,
  name,
  isBot: id.startsWith('b'),
  leftAt: null,
  role,
  alive: true,
  sips: 0,
})

function craft(players: LGPlayer[], over: Partial<LGState> = {}): LGState {
  return {
    version: 1,
    phase: 'day-debate',
    phaseSeq: 1,
    phaseEndsAt: ENDS,
    players,
    round: 1,
    debateMs: LG_DEBATE_DEFAULT_MS,
    wolfVotes: {},
    seerPeeks: [],
    witchSaveUsed: false,
    witchKillUsed: false,
    witchActed: false,
    nightVictimId: null,
    witchSavedId: null,
    witchKillId: null,
    guardProtectedId: null,
    guardLastProtectedId: null,
    ravenTargetId: null,
    elderLifeUsed: false,
    elderAttackedRound: null,
    mayorId: null,
    mayorVotes: {},
    dayVotes: {},
    debateSkips: [],
    debateSpeech: [],
    revoteCandidates: null,
    pendingHunterId: null,
    afterHunter: null,
    lastNightDeaths: [],
    lastVoteResult: null,
    deaths: [],
    winnerTeam: null,
    rematchVotes: [],
    rngState: 424242,
    ...over,
  }
}

const say = (
  playerId: string,
  kind: LGDebateSpeech['kind'],
  targetId: string | null,
  round = 1
): LGDebateSpeech => ({ playerId, kind, targetId, round })

const speakAction = (playerId: string, kind: LGDebateSpeech['kind'], targetId: string | null): LGAction =>
  ({ type: 'DEBATE_SPEAK', playerId, kind, targetId })

/**
 * Fixtures : trait / audace — tempo — bavardage (paroles par manche) /
 * loyauté. Le lot A a rendu Huguette taiseuse (1 parole) et Suzette fidèle :
 * les tests qui veulent une seconde réaction ou une interpellation prennent
 * un bavard (Kéké, Mauricette, Norbert), ceux qui veulent un rallye contre
 * l'allié du jour prennent un traître (Dédé, Raoul).
 */
const H = P('h', 'Moi')
const DEDE = P('b1', 'Dédé 🎲') // agressif 0,9 — tempo 800 — 2 paroles, loyauté 0,1
const HUGUETTE = P('b2', 'Huguette 👵') // prudent 0,1 — tempo 3200 — 1 parole, loyauté 0,75
const SUZETTE = P('b3', 'Suzette 🌸') // suiveur 0,45 — tempo 1800 — 2 paroles, loyauté 0,85
const GEPETO = P('b4', 'Gépéto 🤠') // farceur 0,8 — tempo 1200 — 3 paroles, loyauté 0,3
const BARNABE = P('b5', 'Barnabé 🎩') // prudent 0,25 — tempo 2500 — 2 paroles, loyauté 0,75
const KEKE = P('b6', 'Kéké 🛵') // agressif 0,8 — tempo 900 — 3 paroles, loyauté 0,65
const MAURICETTE = P('b7', 'Mauricette 🐔') // suiveur 0,5 — tempo 1900 — 3 paroles, loyauté 0,9
const NORBERT = P('b8', 'Norbert 🤓') // suiveur 0,35 — tempo 2000 — 3 paroles, loyauté 0,5
const RAOUL = P('b10', 'Raoul 🦊') // agressif 0,85 — tempo 900 — 2 paroles, loyauté 0,2

/** Chaque bot a ouvert par une alliance (aucune accusation en jeu). */
function opened(bots: LGPlayer[]): LGDebateSpeech[] {
  return bots.map((b, i) => say(b.id, 'ally', bots[(i + 1) % bots.length].id))
}

function table(bots: LGPlayer[], extra: LGDebateSpeech[] = [], over: Partial<LGState> = {}): LGState {
  return craft([H, ...bots], {
    debateSpeech: [...opened(bots), ...extra],
    debateSkips: bots.map((b) => b.id),
    ...over,
  })
}

function apply(state: LGState, actions: LGAction[] | null): LGState {
  let s = state
  for (const a of actions ?? []) s = reduceLG(s, a)
  return s
}

describe('(0) majorité des humains passée au vote → skip groupé immédiat', () => {
  it('en solo, dès le skip humain, tous les bots skippent en une écriture, même muets', () => {
    const s = craft([H, DEDE, HUGUETTE, SUZETTE], { debateSkips: ['h'] })
    const moves = lgBotDebateMove(s, T0, fixed(0.5))
    expect(moves).toEqual([
      { type: 'DEBATE_SKIP', playerId: 'b1', now: T0 },
      { type: 'DEBATE_SKIP', playerId: 'b2', now: T0 },
      { type: 'DEBATE_SKIP', playerId: 'b3', now: T0 },
    ])
    expect(apply(s, moves).phase).toBe('day-vote')
  })

  it('à trois humains, un seul skip ne suffit pas : les bots continuent d’ouvrir', () => {
    const s = craft([H, P('h2', 'Lui'), P('h3', 'Elle'), DEDE, HUGUETTE], { debateSkips: ['h'] })
    const moves = lgBotDebateMove(s, T0, fixed(0.5))
    expect(moves).toHaveLength(1)
    expect(moves?.[0].type).toBe('DEBATE_SPEAK')
  })

  it('après le skip groupé, une parole humaine relance une réaction, puis plus rien', () => {
    const s = craft([H, P('h2', 'Lui'), DEDE, BARNABE, SUZETTE], {
      debateSkips: ['h', 'b1', 'b5', 'b3'],
      debateSpeech: [...opened([DEDE, BARNABE, SUZETTE]), say('h2', 'suspect', 'b5')],
    })
    const first = lgBotDebateMove(s, T0, fixed(0.5))
    expect(first).toEqual([speakAction('b5', 'defend', 'h2')])
    const second = lgBotDebateMove(apply(s, first), T0, fixed(0.5))
    expect(second).toEqual([speakAction('b1', 'rally', 'b5')])
    expect(lgBotDebateMove(apply(apply(s, first), second), T0, fixed(0.5))).toBeNull()
  })
})

describe('(a) réaction de l’accusé selon son trait', () => {
  const bots = [DEDE, BARNABE, SUZETTE, GEPETO]

  it('prudent → se défend ; suiveur → se défend', () => {
    expect(lgBotDebateMove(table(bots, [say('h', 'suspect', 'b5')]), T0, fixed(0.5))).toEqual([
      speakAction('b5', 'defend', 'h'),
    ])
    expect(lgBotDebateMove(table(bots, [say('h', 'suspect', 'b3')]), T0, fixed(0.5))).toEqual([
      speakAction('b3', 'defend', 'h'),
    ])
  })

  it('agressif → contre-accuse l’accusateur', () => {
    expect(lgBotDebateMove(table(bots, [say('h', 'suspect', 'b1')]), T0, fixed(0.5))).toEqual([
      speakAction('b1', 'suspect', 'h'),
    ])
  })

  it('farceur → contre-accuse si rand < audace, sinon se défend', () => {
    const s = table(bots, [say('h', 'suspect', 'b4')])
    expect(lgBotDebateMove(s, T0, fixed(0.5))).toEqual([speakAction('b4', 'suspect', 'h')])
    expect(lgBotDebateMove(s, T0, fixed(0.95))).toEqual([speakAction('b4', 'defend', 'h')])
  })

  it('un déserteur converti (sans persona) réagit en suiveur', () => {
    const ZOZO = P('b9', 'Zozo')
    expect(
      lgBotDebateMove(table([DEDE, ZOZO, HUGUETTE], [say('h', 'suspect', 'b9')]), T0, fixed(0.5))
    ).toEqual([speakAction('b9', 'defend', 'h')])
  })

  it('un accusé au cap ne répond plus : un autre bot prend la parole', () => {
    const s = table(bots, [
      say('h', 'suspect', 'b4'),
      say('b4', 'defend', 'h'),
      say('h', 'suspect', 'b4'),
      say('b4', 'defend', 'h'),
      say('h', 'suspect', 'b4'),
    ])
    expect(s.debateSpeech.filter((sp) => sp.playerId === 'b4')).toHaveLength(LG_SPEECH_CAP)
    expect(lgBotDebateMove(s, T0, fixed(0.5))).toEqual([speakAction('b1', 'rally', 'b4')])
  })

  it('un taiseux (Huguette, une parole) accusé après son ouverture se défend quand même, puis un autre bot abonde', () => {
    const s = table([HUGUETTE, DEDE], [say('h', 'suspect', 'b2')])
    const defended = lgBotDebateMove(s, T0, fixed(0.5))
    expect(defended).toEqual([speakAction('b2', 'defend', 'h')])
    expect(lgBotDebateMove(apply(s, defended), T0, fixed(0.5))).toEqual([speakAction('b1', 'rally', 'b2')])
  })
})

describe('(a) un second bot abonde ou doute, selon son trait, dans l’ordre du tempo', () => {
  it('suiveur/agressif → rally sur la cible de l’humain', () => {
    // Suzette s'est alliée à Barnabé, pas à Huguette : elle abonde.
    const s = table([SUZETTE, BARNABE, HUGUETTE], [say('h', 'suspect', 'b2'), say('b2', 'defend', 'h')])
    expect(lgBotDebateMove(s, T0, fixed(0.5))).toEqual([speakAction('b3', 'rally', 'b2')])
    const s2 = table([DEDE, HUGUETTE], [say('h', 'suspect', 'b2'), say('b2', 'defend', 'h')])
    expect(lgBotDebateMove(s2, T0, fixed(0.5))).toEqual([speakAction('b1', 'rally', 'b2')])
  })

  it('prudent → doubt', () => {
    const s = table([DEDE, BARNABE, HUGUETTE], [say('h', 'suspect', 'b1'), say('b1', 'suspect', 'h')])
    expect(lgBotDebateMove(s, T0, fixed(0.5))).toEqual([speakAction('b5', 'doubt', 'b1')])
  })

  it('farceur → rally si rand < audace, sinon rien', () => {
    const s = table([DEDE, GEPETO, HUGUETTE], [say('h', 'suspect', 'b1'), say('b1', 'suspect', 'h')])
    expect(lgBotDebateMove(s, T0, fixed(0.1))).toEqual([speakAction('b4', 'rally', 'b1')])
    expect(lgBotDebateMove(s, T0, fixed(0.9))).toBeNull()
  })

  it('l’humain accuse un autre humain : un bot suit quand même', () => {
    const s = craft([H, P('h2', 'Lui'), SUZETTE, HUGUETTE], {
      debateSpeech: [...opened([SUZETTE, HUGUETTE]), say('h', 'suspect', 'h2')],
      debateSkips: ['b3', 'b2'],
    })
    expect(lgBotDebateMove(s, T0, fixed(0.5))).toEqual([speakAction('b3', 'rally', 'h2')])
  })

  it('anti-fuite : la réaction ne dépend pas des rôles secrets (un loup abonde même contre son complice)', () => {
    const reactions = [say('h', 'suspect', 'b1'), say('b1', 'suspect', 'h')]
    const wolves = table(
      [P('b1', 'Dédé 🎲', 'loup'), P('b3', 'Suzette 🌸', 'loup'), HUGUETTE],
      reactions
    )
    const permuted = table(
      [P('b1', 'Dédé 🎲', 'villageois'), P('b3', 'Suzette 🌸', 'villageois'), P('b2', 'Huguette 👵', 'loup')],
      reactions
    )
    expect(lgBotDebateMove(wolves, T0, fixed(0.5))).toEqual([speakAction('b3', 'rally', 'b1')])
    expect(lgBotDebateMove(permuted, T0, fixed(0.5))).toEqual(lgBotDebateMove(wolves, T0, fixed(0.5)))
  })

  it('au plus deux paroles de bots après une parole humaine', () => {
    const s = table(
      [DEDE, HUGUETTE, SUZETTE, GEPETO],
      [say('h', 'suspect', 'b2'), say('b2', 'defend', 'h'), say('b1', 'rally', 'b2')]
    )
    expect(lgBotDebateMove(s, T0, fixed(0.5))).toBeNull()
  })
})

describe('(a) seconde réaction selon l’audace (lot 5)', () => {
  it('audace 0,35 (Norbert) : jamais de seconde défense, même le dé en main ; un autre bot abonde', () => {
    const s = table(
      [DEDE, NORBERT, SUZETTE],
      [say('h', 'suspect', 'b8'), say('b8', 'defend', 'h'), say('h', 'suspect', 'b8')]
    )
    expect(SECOND_REACTION_MIN_AUDACE).toBe(0.4)
    expect(lgBotDebateMove(s, T0, fixed(0.5))).toEqual([speakAction('b1', 'rally', 'b8')])
    expect(lgBotDebateMove(s, T0, fixed(0))).toEqual([speakAction('b1', 'rally', 'b8')])
  })

  it('audace 0,8 (Kéké) : revient à la charge si rand < audace, sinon se tait — et Huguette aussi', () => {
    const s = table(
      [KEKE, HUGUETTE],
      [say('h', 'suspect', 'b6'), say('b6', 'suspect', 'h'), say('b2', 'doubt', 'b6'), say('h', 'suspect', 'b6')]
    )
    expect(lgBotDebateMove(s, T0, fixed(0.5))).toEqual([speakAction('b6', 'suspect', 'h')])
    expect(lgBotDebateMove(s, T0, fixed(0.95))).toBeNull()
  })

  it('suiveur 0,5 (Mauricette) : c’est le dé qui tranche', () => {
    const s = table(
      [MAURICETTE, HUGUETTE],
      [say('h', 'suspect', 'b7'), say('b7', 'defend', 'h'), say('b2', 'doubt', 'b7'), say('h', 'suspect', 'b7')]
    )
    expect(lgBotDebateMove(s, T0, fixed(0.1))).toEqual([speakAction('b7', 'defend', 'h')])
    expect(lgBotDebateMove(s, T0, fixed(0.5))).toBeNull()
  })

  it('le cap de 3 tient : une ouverture et deux réactions, puis l’accusé laisse la place', () => {
    const s = table(
      [KEKE, SUZETTE, HUGUETTE],
      [
        say('h', 'suspect', 'b6'),
        say('b6', 'suspect', 'h'),
        say('h', 'suspect', 'b6'),
        say('b6', 'suspect', 'h'),
        say('h', 'suspect', 'b6'),
      ]
    )
    expect(s.debateSpeech.filter((sp) => sp.playerId === 'b6')).toHaveLength(LG_SPEECH_CAP)
    expect(lgBotDebateMove(s, T0, fixed(0))).toEqual([speakAction('b3', 'rally', 'b6')])
  })

  it('le second bot suit la même règle : un audacieux déjà engagé abonde, sinon le suivant par tempo', () => {
    const s = table(
      [HUGUETTE, KEKE, RAOUL],
      [say('h', 'suspect', 'b2'), say('b2', 'defend', 'h'), say('b6', 'rally', 'b2'), say('h', 'suspect', 'b2')]
    )
    expect(lgBotDebateMove(s, T0, fixed(0.5))).toEqual([speakAction('b6', 'rally', 'b2')])
    expect(lgBotDebateMove(s, T0, fixed(0.95))).toEqual([speakAction('b10', 'rally', 'b2')])
  })

  it('une alliance rendue compte aussi : le suiveur déjà engagé ne la rend qu’au dé', () => {
    const s = table(
      [DEDE, MAURICETTE],
      [say('h', 'suspect', 'b7'), say('b7', 'defend', 'h'), say('h', 'ally', 'b7')]
    )
    expect(lgBotDebateMove(s, T0, fixed(0.1))).toEqual([speakAction('b7', 'ally', 'h')])
    expect(lgBotDebateMove(s, T0, fixed(0.5))).toBeNull()
  })

  it('un seul dé par accusation : l’engagé qui s’est tu au tick précédent ne rejoue pas', () => {
    // Mauricette (0,5) a déjà réagi ; au tick 1 le dé est contre elle, Dédé abonde.
    let s = table(
      [DEDE, BARNABE, MAURICETTE],
      [say('h', 'suspect', 'b7'), say('b7', 'defend', 'h'), say('h', 'suspect', 'b7')]
    )
    const first = lgBotDebateMove(s, T0, fixed(0.5))
    expect(first).toEqual([speakAction('b1', 'rally', 'b7')])
    s = apply(s, first)
    // Tick 2 : même le dé en main, Mauricette reste muette ; Barnabé (frais) doute.
    expect(lgBotDebateMove(s, T0, fixed(0.1))).toEqual([speakAction('b5', 'doubt', 'b7')])
  })

  it('après la défense d’un accusé frais, un engagé peut encore abonder — à un seul dé', () => {
    const s = table(
      [KEKE, HUGUETTE, SUZETTE],
      [
        say('h', 'suspect', 'b2'),
        say('b2', 'defend', 'h'),
        say('b6', 'rally', 'b2'),
        say('h', 'suspect', 'b3'),
        say('b3', 'defend', 'h'),
      ]
    )
    expect(lgBotDebateMove(s, T0, fixed(0.5))).toEqual([speakAction('b6', 'rally', 'b3')])
    expect(lgBotDebateMove(s, T0, fixed(0.95))).toBeNull()
  })

  it('l’interpellation ne compte pas : un bot qui a ouvert puis interpellé répond encore librement', () => {
    const s = table([MAURICETTE, DEDE], [say('b7', 'ask', 'h'), say('h', 'suspect', 'b7')], { debateSkips: [] })
    expect(lgBotDebateMove(s, T0, fixed(0.95))).toEqual([speakAction('b7', 'defend', 'h')])
  })
})

describe('(a) alliance et défense humaines', () => {
  it('une alliance proposée à un suiveur ou un farceur est rendue', () => {
    expect(
      lgBotDebateMove(table([DEDE, SUZETTE, HUGUETTE], [say('h', 'ally', 'b3')]), T0, fixed(0.5))
    ).toEqual([speakAction('b3', 'ally', 'h')])
    expect(
      lgBotDebateMove(table([DEDE, GEPETO, HUGUETTE], [say('h', 'ally', 'b4')]), T0, fixed(0.5))
    ).toEqual([speakAction('b4', 'ally', 'h')])
  })

  it('un prudent ou un agressif ne rend pas l’alliance ; une défense ne fait réagir personne', () => {
    const bots = [DEDE, HUGUETTE, SUZETTE]
    expect(lgBotDebateMove(table(bots, [say('h', 'ally', 'b2')]), T0, fixed(0.5))).toBeNull()
    expect(lgBotDebateMove(table(bots, [say('h', 'ally', 'b1')]), T0, fixed(0.5))).toBeNull()
    expect(lgBotDebateMove(table(bots, [say('h', 'defend', 'b1')]), T0, fixed(0.5))).toBeNull()
  })
})

describe('(b) ouvertures : un bot par tick, par tempo croissant puis ordre de table', () => {
  it('Dédé (800) ouvre avant le converti (2000) avant Huguette (3200)', () => {
    const ZOZO = P('b9', 'Zozo')
    let s = craft([H, HUGUETTE, ZOZO, DEDE])
    const order: string[] = []
    for (let i = 0; i < 3; i += 1) {
      const moves = lgBotDebateMove(s, T0, fixed(0.5))
      expect(moves).toHaveLength(1)
      const a = moves![0]
      expect(a.type).toBe('DEBATE_SPEAK')
      if (a.type === 'DEBATE_SPEAK') order.push(a.playerId)
      s = apply(s, moves)
    }
    expect(order).toEqual(['b1', 'b9', 'b2'])
  })

  it('accusation ou alliance selon la loyauté (Dédé, traître : 18 % d’alliance), jamais soi-même ; un loup n’accuse pas un loup', () => {
    const wolf = P('b1', 'Dédé 🎲', 'loup')
    const wolf2 = P('b3', 'Suzette 🌸', 'loup')
    const s = craft([H, wolf, HUGUETTE, wolf2])
    const ally = lgBotDebateMove(s, T0, fixed(0.1))![0]
    expect(ally.type === 'DEBATE_SPEAK' && ally.kind).toBe('ally')
    for (const r of [0.31, 0.6, 0.99]) {
      const a = lgBotDebateMove(s, T0, fixed(r))![0]
      expect(a.type).toBe('DEBATE_SPEAK')
      if (a.type !== 'DEBATE_SPEAK') continue
      expect(a.playerId).toBe('b1')
      expect(a.kind).toBe('suspect')
      expect(['h', 'b2']).toContain(a.targetId)
    }
  })

  it('un bot accusé avant son ouverture ouvre par sa défense', () => {
    const s = craft([H, DEDE, HUGUETTE], { debateSpeech: [say('b1', 'ally', 'h'), say('b1', 'suspect', 'b2')] })
    expect(lgBotDebateMove(s, T0, fixed(0.5))).toEqual([speakAction('b2', 'defend', 'b1')])
  })
})

describe('(c) interpellation d’un humain muet', () => {
  /** Interpelle qui garde une parole : l'interpellation peut être la dernière d'un bot. */
  const bots = [GEPETO, HUGUETTE, MAURICETTE]

  it('tous les bots ont ouvert, l’humain n’a rien dit : le plus audacieux à qui il reste une parole lui demande', () => {
    const s = table(bots, [], { debateSkips: [] })
    expect(lgBotDebateMove(s, T0, fixed(0.5))).toEqual([speakAction('b4', 'ask', 'h')])
  })

  it('un bot à deux paroles interpelle aussi (sa dernière) ; une table de taiseux seuls n’interpelle jamais : skip groupé', () => {
    const s = table([DEDE, HUGUETTE, SUZETTE], [], { debateSkips: [] })
    expect(lgBotDebateMove(s, T0, fixed(0.5))).toEqual([speakAction('b1', 'ask', 'h')])
    const GERMAINE = P('b11', 'Germaine ⚡') // agressif 0,7 — 1 parole
    const mute = table([HUGUETTE, GERMAINE], [], { debateSkips: [] })
    expect(lgBotDebateMove(mute, T0, fixed(0.5))?.every((a) => a.type === 'DEBATE_SKIP')).toBe(true)
  })

  it('pas avant que tous aient ouvert, pas sous 20 s restantes, pas si l’humain a parlé ou skippé', () => {
    const notAllOpened = craft([H, DEDE, HUGUETTE], { debateSpeech: [say('b1', 'ally', 'b2')] })
    expect(lgBotDebateMove(notAllOpened, T0, fixed(0.4))).toEqual([speakAction('b2', 'suspect', 'h')])

    const late = table(bots, [], { debateSkips: [] })
    expect(lgBotDebateMove(late, ENDS - 15_000, fixed(0.5))?.every((a) => a.type === 'DEBATE_SKIP')).toBe(true)

    const spoke = table(bots, [say('h', 'ally', 'b2')])
    expect(lgBotDebateMove(spoke, T0, fixed(0.5))).toBeNull()

    const three = craft([H, P('h2', 'Lui'), P('h3', 'Elle'), GEPETO, MAURICETTE], {
      debateSpeech: [...opened([GEPETO, MAURICETTE]), say('h2', 'ally', 'b4'), say('b4', 'ally', 'h2')],
      debateSkips: ['h'],
    })
    // Gépéto (0,8) garde une parole sur trois : c'est lui qui interpelle, pas Mauricette (0,5).
    expect(lgBotDebateMove(three, T0, fixed(0.5))).toEqual([speakAction('b4', 'ask', 'h3')])
  })

  it('une fois par humain, au plus deux par manche, puis skip groupé', () => {
    const asked = table(bots, [say('b4', 'ask', 'h')], { debateSkips: [] })
    expect(lgBotDebateMove(asked, T0, fixed(0.5))?.every((a) => a.type === 'DEBATE_SKIP')).toBe(true)

    const humans = [H, P('h2', 'Lui'), P('h3', 'Elle')]
    const s = craft([...humans, ...bots], { debateSpeech: opened(bots) })
    let cur = s
    const asks: LGAction[] = []
    for (let i = 0; i < 4; i += 1) {
      const moves = lgBotDebateMove(cur, T0, fixed(0.5))
      if (!moves || moves[0].type !== 'DEBATE_SPEAK') break
      asks.push(moves[0])
      cur = apply(cur, moves)
    }
    // Gépéto a déjà interpellé : la seconde revient à Mauricette, jamais deux fois le même bot.
    expect(asks).toEqual([speakAction('b4', 'ask', 'h'), speakAction('b7', 'ask', 'h2')])
    expect(asks).toHaveLength(LG_ASK_MAX_PER_ROUND)
    expect(lgBotDebateMove(cur, T0, fixed(0.5))?.every((a) => a.type === 'DEBATE_SKIP')).toBe(true)
  })

  it('l’émetteur est le plus audacieux qui garde une parole (compte < bavardage) ; au cap, le suivant prend le relais', () => {
    const s = table(bots, [say('b4', 'suspect', 'b2'), say('b2', 'defend', 'b4')], { debateSkips: [] })
    // Gépéto (0,8) est à 2 paroles sur 3 : il interpelle ; Huguette (0,1) n'a plus de parole.
    expect(lgBotDebateMove(s, T0, fixed(0.5))).toEqual([speakAction('b4', 'ask', 'h')])
    const full = table(
      bots,
      [say('b4', 'suspect', 'b2'), say('b2', 'defend', 'b4'), say('b4', 'doubt', 'b2')],
      { debateSkips: [] }
    )
    // Gépéto au cap : Mauricette (0,5) interpelle.
    expect(lgBotDebateMove(full, T0, fixed(0.5))).toEqual([speakAction('b7', 'ask', 'h')])
  })

  it('jamais en table 100 % bots', () => {
    const s = craft([DEDE, HUGUETTE, SUZETTE, GEPETO], { debateSpeech: opened([DEDE, HUGUETTE, SUZETTE, GEPETO]) })
    const moves = lgBotDebateMove(s, T0, fixed(0.5))
    expect(moves?.map((a) => a.type)).toEqual(['DEBATE_SKIP', 'DEBATE_SKIP', 'DEBATE_SKIP', 'DEBATE_SKIP'])
    expect(apply(s, moves).phase).toBe('day-vote')
  })
})

describe('(d) skip groupé en une seule écriture, puis null', () => {
  it('tous ont ouvert, rien n’attend : un seul tableau de DEBATE_SKIP, ensuite rien', () => {
    const s = table([DEDE, HUGUETTE, SUZETTE], [say('h', 'ally', 'b1')], { debateSkips: [] })
    const moves = lgBotDebateMove(s, T0, fixed(0.5))
    expect(moves).toEqual([
      { type: 'DEBATE_SKIP', playerId: 'b1', now: T0 },
      { type: 'DEBATE_SKIP', playerId: 'b2', now: T0 },
      { type: 'DEBATE_SKIP', playerId: 'b3', now: T0 },
    ])
    const after = apply(s, moves)
    expect(after.phase).toBe('day-debate')
    expect(lgBotDebateMove(after, T0, fixed(0.5))).toBeNull()
  })

  it('hors débat : null', () => {
    expect(lgBotDebateMove(craft([H, DEDE, HUGUETTE], { phase: 'day-vote' }), T0, fixed(0.5))).toBeNull()
  })
})

describe('propriété : terminaison, aucune erreur moteur, déterminisme', () => {
  function play(count: number, seed: string): { iterations: number; state: LGState } {
    const rng = createRng(seed)
    const humansCount = count >= 8 ? 2 : 1
    const personas = pickBotPersonas(count - humansCount, rng.next)
    const players: LGPlayer[] = []
    for (let i = 0; i < humansCount; i += 1) players.push(P(`h${i}`, `Humain ${i}`))
    personas.forEach((persona, i) => {
      const role: LGRole = i < (count >= 6 ? 2 : 1) ? 'loup' : 'villageois'
      players.push(P(`b${i}`, botDisplayName(persona), role))
    })
    let state = craft(players)
    let iterations = 0
    const run = () => {
      for (;;) {
        const moves = lgBotDebateMove(state, T0, rng.next)
        if (!moves) return
        expect(moves.length).toBeGreaterThan(0)
        for (const a of moves) state = reduceLG(state, a)
        iterations += 1
      }
    }
    run()
    // Les humains ont tout laissé passer : l'un d'eux accuse enfin un bot,
    // puis insiste — seuls les audacieux reviennent à la charge (lot 5).
    state = reduceLG(state, { type: 'DEBATE_SPEAK', playerId: 'h0', kind: 'suspect', targetId: 'b0' })
    run()
    state = reduceLG(state, { type: 'DEBATE_SPEAK', playerId: 'h0', kind: 'suspect', targetId: 'b0' })
    run()
    return { iterations, state }
  }

  /** Ouvertures et réactions d'un bot : ses paroles hors remarque et interpellation. */
  const replies = (state: LGState, id: string) =>
    state.debateSpeech.filter(
      (sp) => sp.playerId === id && sp.kind !== 'toldYou' && sp.kind !== 'wrong' && sp.kind !== 'ask'
    ).length

  it('50 graines × tables de 4 à 12 : ≤ 3×bots + 3 ticks, jamais de LGEngineError, même graine ⇒ même fil', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      for (const count of [4, 5, 6, 7, 8, 9, 10, 11, 12]) {
        const key = `debat-${count}-${seed}`
        let first: ReturnType<typeof play>
        try {
          first = play(count, key)
        } catch (e) {
          if (e instanceof LGEngineError) throw new Error(`${key} : ${e.message}`)
          throw e
        }
        const bots = count - (count >= 8 ? 2 : 1)
        expect(first.iterations).toBeLessThanOrEqual(3 * bots + 3)
        expect(first.state.phase).toBe('day-debate')
        for (const b of first.state.players.filter((p) => p.isBot)) {
          expect(first.state.debateSpeech.filter((sp) => sp.playerId === b.id).length).toBeLessThanOrEqual(
            LG_SPEECH_CAP
          )
          // Un timide ne revient jamais une seconde fois à la charge.
          if (botTraitsFor(b.name).audace < SECOND_REACTION_MIN_AUDACE) {
            expect(replies(first.state, b.id)).toBeLessThanOrEqual(2)
          }
        }
        expect(first.state.debateSpeech.filter((sp) => sp.kind === 'ask').length).toBeLessThanOrEqual(
          LG_ASK_MAX_PER_ROUND
        )
        // Tous les bots ont ouvert puis sont passés au vote.
        expect(first.state.debateSkips.filter((id) => id.startsWith('b'))).toHaveLength(bots)
        const second = play(count, key)
        expect(second.state.debateSpeech).toEqual(first.state.debateSpeech)
      }
    }
  })
})

describe('(b) ouverture par le score public (lot 3)', () => {
  it('l’accusation d’ouverture vise le plus suspect — celui que la table a déjà nommé — et non le hasard', () => {
    const s = craft([H, DEDE, HUGUETTE, SUZETTE], { debateSpeech: [say('b1', 'suspect', 'h')] })
    const first = lgBotDebateMove(s, T0, fixed(0.5))
    expect(first).toEqual([speakAction('b3', 'suspect', 'h')])
    expect(lgBotDebateMove(apply(s, first), T0, fixed(0.99))).toEqual([speakAction('b2', 'suspect', 'h')])
  })

  it('le marqué du Corbeau est visé avant les autres ; une alliance d’ouverture épargne qui est déjà accablé', () => {
    const marked = craft([H, DEDE, HUGUETTE, SUZETTE], { ravenTargetId: 'b2' })
    expect(lgBotDebateMove(marked, T0, fixed(0.5))).toEqual([speakAction('b1', 'suspect', 'b2')])
    const accused = craft([H, DEDE, HUGUETTE, SUZETTE], { debateSpeech: [say('b1', 'suspect', 'h')] })
    const ally = lgBotDebateMove(accused, T0, fixed(0.1))![0]
    expect(ally).toMatchObject({ type: 'DEBATE_SPEAK', playerId: 'b3', kind: 'ally' })
    expect(ally.type === 'DEBATE_SPEAK' && ally.targetId).not.toBe('h')
  })

  it('mémoire d’une manche : qui a poussé le lynchage d’un innocent devient le suspect du lendemain', () => {
    const X = { ...P('x', 'Victime'), alive: false }
    const s = craft([H, DEDE, HUGUETTE, X], {
      round: 2,
      deaths: [{ playerId: 'x', role: 'villageois', cause: 'vote', round: 1 }],
      debateSpeech: [say('h', 'suspect', 'x'), say('b1', 'suspect', 'b2'), say('b2', 'defend', 'b1')],
    })
    expect(lgBotDebateMove(s, T0, fixed(0.5))).toEqual([speakAction('b1', 'suspect', 'h')])
  })

  it('les timides (audace < 0,4) n’accusent jamais le maire ; les audacieux si', () => {
    const timid = craft([H, DEDE, HUGUETTE], {
      mayorId: 'h',
      debateSpeech: [say('b1', 'suspect', 'h'), say('b1', 'rally', 'h')],
    })
    // h : +4 −2 (maire) = 2 > Dédé 0 — Huguette (0,1) accuse quand même Dédé.
    expect(lgBotDebateMove(timid, T0, fixed(0.5))).toEqual([speakAction('b2', 'suspect', 'b1')])
    const bold = craft([H, HUGUETTE, DEDE], {
      mayorId: 'h',
      debateSpeech: [say('b2', 'suspect', 'h'), say('b2', 'rally', 'h')],
    })
    expect(lgBotDebateMove(bold, T0, fixed(0.5))).toEqual([speakAction('b1', 'suspect', 'h')])
  })

  it('la voyante bot ouvre sur le loup qu’elle a vu — même quand le hasard voudrait une alliance — sans le dire', () => {
    const seer = P('b3', 'Suzette 🌸', 'voyante')
    const s = craft([H, DEDE, seer], {
      debateSpeech: [say('b1', 'ally', 'b3')],
      seerPeeks: [{ round: 1, targetId: 'h', team: 'loups' }],
    })
    expect(lgBotDebateMove(s, T0, fixed(0.1))).toEqual([speakAction('b3', 'suspect', 'h')])
  })

  it('la voyante bot doute d’une accusation visant un villageois qu’elle a vu, à l’ouverture comme en réaction ; un loup vu, elle abonde', () => {
    const seer = P('b3', 'Suzette 🌸', 'voyante')
    const opening = craft([H, DEDE, HUGUETTE, seer], {
      debateSpeech: [say('b1', 'suspect', 'b2')],
      seerPeeks: [{ round: 1, targetId: 'b2', team: 'village' }],
    })
    expect(lgBotDebateMove(opening, T0, fixed(0.5))).toEqual([speakAction('b3', 'doubt', 'b2')])

    const reacting = craft([H, HUGUETTE, seer], {
      debateSpeech: [...opened([HUGUETTE, seer]), say('h', 'suspect', 'b2'), say('b2', 'defend', 'h')],
      seerPeeks: [{ round: 1, targetId: 'b2', team: 'village' }],
    })
    expect(lgBotDebateMove(reacting, T0, fixed(0.5))).toEqual([speakAction('b3', 'doubt', 'b2')])

    // Barnabé (fidèle, allié à Dédé dans la manche) a VU que Dédé est loup : la vision prime sur la loyauté.
    const seerBarnabe = P('b5', 'Barnabé 🎩', 'voyante')
    const wolfSeen = craft([H, DEDE, seerBarnabe], {
      debateSpeech: [...opened([DEDE, seerBarnabe]), say('h', 'suspect', 'b1'), say('b1', 'suspect', 'h')],
      seerPeeks: [{ round: 1, targetId: 'b1', team: 'loups' }],
    })
    expect(lgBotDebateMove(wolfSeen, T0, fixed(0.5))).toEqual([speakAction('b5', 'rally', 'b1')])
  })
})

describe('(b0) remarques d’ouverture sur la manche écoulée', () => {
  const X = { ...P('x', 'Victime'), alive: false }
  const lynched = (role: LGRole) => ({ playerId: 'x', role, cause: 'vote' as const, round: 1 })

  it('un bot par tick, dans l’ordre de table, deux au plus, avant les ouvertures ; la remarque compte dans le cap — un taiseux s’en passe', () => {
    const s = craft([H, HUGUETTE, SUZETTE, DEDE, X], {
      round: 2,
      deaths: [lynched('villageois')],
      debateSpeech: [say('b2', 'suspect', 'x'), say('b3', 'suspect', 'x'), say('b1', 'suspect', 'x')],
    })
    // Huguette (une parole) la garde pour ouvrir : Suzette puis Dédé regrettent à sa place.
    const first = lgBotDebateMove(s, T0, fixed(0.5))
    expect(first).toEqual([speakAction('b3', 'wrong', 'x')])
    const s1 = apply(s, first)
    const second = lgBotDebateMove(s1, T0, fixed(0.5))
    expect(second).toEqual([speakAction('b1', 'wrong', 'x')])
    let cur = apply(s1, second)
    // Deux remarques : Dédé ouvre (premier par tempo) avec sa dernière parole.
    const third = lgBotDebateMove(cur, T0, fixed(0.5))
    expect(third).toHaveLength(1)
    expect(third![0]).toMatchObject({ type: 'DEBATE_SPEAK', playerId: 'b1', kind: 'suspect' })
    cur = apply(cur, third)
    for (;;) {
      const moves = lgBotDebateMove(cur, T0, fixed(0.5))
      if (!moves) break
      cur = apply(cur, moves)
    }
    const today = cur.debateSpeech.filter((sp) => sp.round === 2)
    expect(today.filter((sp) => sp.kind === 'wrong' || sp.kind === 'toldYou')).toHaveLength(2)
    for (const b of ['b1', 'b2', 'b3']) {
      const mine = today.filter((sp) => sp.playerId === b)
      expect(mine.length).toBeLessThanOrEqual(LG_SPEECH_CAP)
      expect(mine.some((sp) => sp.kind === 'suspect' || sp.kind === 'ally' || sp.kind === 'defend')).toBe(true)
    }
    expect(today.filter((sp) => sp.playerId === 'b2')).toHaveLength(1)
    expect(today.filter((sp) => sp.playerId === 'b1')).toHaveLength(2)
    expect(cur.debateSkips).toEqual(['b2', 'b3', 'b1'])
  })

  it('« je l’avais dit » sur un loup démasqué ; un bot qui a déjà ouvert ne revient pas dessus', () => {
    const s = craft([H, DEDE, HUGUETTE, X], {
      round: 2,
      deaths: [lynched('loup')],
      debateSpeech: [say('b1', 'suspect', 'x'), say('b2', 'ally', 'x'), say('b2', 'ally', 'h', 2)],
    })
    const brag = lgBotDebateMove(s, T0, fixed(0.5))
    expect(brag).toEqual([speakAction('b1', 'toldYou', 'x')])
    // Huguette s'était alliée au loup mais a déjà ouvert : pas de remarque ; Dédé ouvre.
    expect(lgBotDebateMove(apply(s, brag), T0, fixed(0.5))![0]).toMatchObject({ playerId: 'b1', kind: 'suspect' })
  })
})

describe('(lot A) caractère chiffré : bavardage, loyauté, rancune', () => {
  it('bavardage 1 (Huguette) : une parole par manche — son ouverture —, ni remarque, ni interpellation ; accusée, elle répond quand même', () => {
    // Accusée après son ouverture : la réponse échappe au bavardage, Dédé abonde ensuite.
    const accused = table([HUGUETTE, DEDE], [say('h', 'suspect', 'b2')])
    const defended = lgBotDebateMove(accused, T0, fixed(0.5))
    expect(defended).toEqual([speakAction('b2', 'defend', 'h')])
    expect(lgBotDebateMove(apply(accused, defended), T0, fixed(0.5))).toEqual([speakAction('b1', 'rally', 'b2')])
    // Seule face à un humain muet : elle ouvre, puis passe au vote sans l'interpeller.
    let s = craft([H, HUGUETTE])
    const opening = lgBotDebateMove(s, T0, fixed(0.5))
    expect(opening).toEqual([speakAction('b2', 'suspect', 'h')])
    s = apply(s, opening)
    expect(lgBotDebateMove(s, T0, fixed(0.5))).toEqual([{ type: 'DEBATE_SKIP', playerId: 'b2', now: T0 }])
    expect(s.debateSpeech.filter((sp) => sp.playerId === 'b2')).toHaveLength(1)
    // Elle a poussé le lynchage d'un innocent hier : pas de « je me suis planté », sa parole va à l'ouverture.
    const X = { ...P('x', 'Victime'), alive: false }
    const wrong = craft([H, HUGUETTE, X], {
      round: 2,
      deaths: [{ playerId: 'x', role: 'villageois', cause: 'vote', round: 1 }],
      debateSpeech: [say('b2', 'suspect', 'x')],
    })
    expect(lgBotDebateMove(wrong, T0, fixed(0.5))).toEqual([speakAction('b2', 'suspect', 'h')])
  })

  it('loyauté > 0,5 : un fidèle doute au lieu d’abonder contre l’allié qu’il s’est choisi ; un traître l’enfonce', () => {
    expect(STANDS_BY_ALLY_MIN_LOYAUTE).toBe(0.5)
    // Suzette (0,85) s'est alliée à Huguette ; l'humain accuse Huguette, qui s'est déjà défendue.
    const accusedHuguette = [say('h', 'suspect', 'b2'), say('b2', 'defend', 'h')]
    const loyal = table([SUZETTE, HUGUETTE], accusedHuguette)
    expect(lgBotDebateMove(loyal, T0, fixed(0.5))).toEqual([speakAction('b3', 'doubt', 'b2')])
    // Dédé (0,1) s'est allié à Huguette aussi : il abonde quand même.
    const traitor = table([DEDE, HUGUETTE], accusedHuguette)
    expect(lgBotDebateMove(traitor, T0, fixed(0.5))).toEqual([speakAction('b1', 'rally', 'b2')])
    // Un converti (0,5 pile) n'est pas fidèle : le seuil est strict.
    const ZOZO = P('b9', 'Zozo')
    const convert = table([ZOZO, HUGUETTE], accusedHuguette)
    expect(lgBotDebateMove(convert, T0, fixed(0.5))).toEqual([speakAction('b9', 'rally', 'b2')])
    // L'alliance reçue n'engage pas : Huguette s'est alliée à Suzette, pas l'inverse.
    const received = craft([H, SUZETTE, HUGUETTE], {
      debateSpeech: [say('b2', 'ally', 'b3'), say('b3', 'suspect', 'h'), ...accusedHuguette],
      debateSkips: ['b3', 'b2'],
    })
    expect(lgBotDebateMove(received, T0, fixed(0.5))).toEqual([speakAction('b3', 'rally', 'b2')])
  })

  it('loyauté : accusé par l’allié qu’il s’est choisi, un fidèle se défend sans le contre-accuser (Kéké 0,65, Marcel 0,6) ; un traître l’accuse (Dédé, Gépéto)', () => {
    const MARCEL = P('b14', 'Marcel 🍺') // farceur 0,7 — loyauté 0,6
    const betrayed = (bot: LGPlayer) =>
      craft([H, bot, HUGUETTE], {
        debateSpeech: [say(bot.id, 'ally', 'h'), say('b2', 'ally', bot.id), say('h', 'suspect', bot.id)],
        debateSkips: [bot.id, 'b2'],
      })
    expect(lgBotDebateMove(betrayed(KEKE), T0, fixed(0.5))).toEqual([speakAction('b6', 'defend', 'h')])
    expect(lgBotDebateMove(betrayed(MARCEL), T0, fixed(0.1))).toEqual([speakAction('b14', 'defend', 'h')])
    expect(lgBotDebateMove(betrayed(DEDE), T0, fixed(0.5))).toEqual([speakAction('b1', 'suspect', 'h')])
    expect(lgBotDebateMove(betrayed(GEPETO), T0, fixed(0.1))).toEqual([speakAction('b4', 'suspect', 'h')])
    // L'alliance reçue n'engage pas : Kéké, à qui l'humain s'est allié, le contre-accuse quand même.
    const received = craft([H, KEKE, HUGUETTE], {
      debateSpeech: [say('h', 'ally', 'b6'), say('b6', 'suspect', 'b2'), say('b2', 'defend', 'b6'), say('h', 'suspect', 'b6')],
      debateSkips: ['b6', 'b2'],
    })
    expect(lgBotDebateMove(received, T0, fixed(0.5))).toEqual([speakAction('b6', 'suspect', 'h')])
  })

  it('loyauté : la part d’alliance à l’ouverture va de 15 % à 45 % — Bernadette (0,95) s’allie au dé 0,4, Dédé (0,1) accuse', () => {
    expect(OPENING_ALLY_SHARE_MIN + OPENING_ALLY_SHARE_SPAN * botTraitsFor('Dédé 🎲').loyaute).toBeCloseTo(0.18)
    expect(OPENING_ALLY_SHARE_MIN + OPENING_ALLY_SHARE_SPAN * botTraitsFor('Zozo').loyaute).toBeCloseTo(0.3)
    const BERNADETTE = P('b13', 'Bernadette 🧶')
    const s = craft([H, BERNADETTE, DEDE])
    const first = lgBotDebateMove(s, T0, fixed(0.4))
    expect(first![0]).toMatchObject({ playerId: 'b1', kind: 'suspect' })
    const second = lgBotDebateMove(apply(s, first), T0, fixed(0.4))
    expect(second![0]).toMatchObject({ playerId: 'b13', kind: 'ally' })
  })

  it('rancune : accusé hier, Germaine (1) ouvre contre son accusateur ; Lucien (0) n’en veut à personne', () => {
    const GERMAINE = P('b11', 'Germaine ⚡')
    const LUCIEN = P('b12', 'Lucien 🎷')
    const grudge = (bot: LGPlayer) =>
      craft([H, bot, HUGUETTE], { round: 2, debateSpeech: [say('h', 'suspect', bot.id)] })
    expect(lgBotDebateMove(grudge(GERMAINE), T0, fixed(0.99))).toEqual([speakAction('b11', 'suspect', 'h')])
    // Rien ne départage h et Huguette : le dé (0,99) prend la dernière de l'ordre de table.
    expect(lgBotDebateMove(grudge(LUCIEN), T0, fixed(0.99))).toEqual([speakAction('b12', 'suspect', 'b2')])
  })
})
