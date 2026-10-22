import { readFileSync } from 'node:fs'
import { createElement, type ComponentProps, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import { toLGClientView, type LGPhase, type LGPlayer, type LGState } from '@/lib/loup-garou/engine'
import { LoupGarouOnline } from '../LoupGarouOnline'

/**
 * L'écran téléphone du Loup-Garou rendu côté serveur, hooks de salle simulés,
 * avec le VRAI catalogue des 4 langues : une clé absente ou un argument ICU
 * mal nommé fait échouer le rendu. Ce qu'on vérifie, c'est l'ergonomie
 * posée par l'audit : même silhouette la nuit pour l'acteur et le dormeur,
 * vote en deux temps dans la barre du bas, panneau « Le village » absent
 * quand une grille le montre déjà.
 */

const room = vi.hoisted(() => ({ current: null as unknown }))

vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'h', ambianceMode: 'normal' } }),
}))
vi.mock('@/hooks/useOnlineRoom', () => ({
  useOnlineRoom: () => ({
    room: room.current,
    voteRematch: () => {},
    leaveRoom: () => {},
    fetchRoom: async () => null,
  }),
}))
vi.mock('@/hooks/useGameAction', () => ({
  useGameAction: () => ({ busy: false, actionError: null, sendAction: async () => null }),
}))
vi.mock('@/hooks/useBotReferee', () => ({ useBotReferee: () => {}, useAdvanceTick: () => {} }))
vi.mock('@/i18n/navigation', () => ({ Link: () => null, usePathname: () => '/', useRouter: () => ({ push: () => {} }) }))
vi.mock('@/components/online/GameTutorialModal', () => ({
  useGameTutorial: () => ({ open: false, reopen: () => {}, close: () => {} }),
  GameTutorialModal: () => null,
  TutorialReopenButton: () => null,
}))
vi.mock('@/components/online/GameOnlineLobby', () => ({ GameOnlineLobby: () => null }))
vi.mock('@/components/online/OnlineEndScreen', () => ({ OnlineEndScreen: () => null }))
vi.mock('@/components/online/XpGainBanner', () => ({ XpGainBanner: () => null }))

const LOCALES = ['fr', 'en', 'es', 'it'] as const
const catalogue = (locale: string): AbstractIntlMessages =>
  JSON.parse(readFileSync(new URL(`../../../../messages/${locale}.json`, import.meta.url), 'utf8'))
/** Un texte du Loup-Garou, par chemin pointé sous `games.loup-garou.game`. */
const lg = (path: string, locale: string = 'fr'): string =>
  path
    .split('.')
    .reduce<unknown>(
      (node, key) => (node as Record<string, unknown> | undefined)?.[key],
      (catalogue(locale) as { games: Record<string, { game: unknown }> }).games['loup-garou'].game
    ) as string

const IntlProvider = NextIntlClientProvider as FunctionComponent<
  Omit<ComponentProps<typeof NextIntlClientProvider>, 'children'>
>

const P = (id: string, name: string, role: LGPlayer['role'], extra: Partial<LGPlayer> = {}): LGPlayer => ({
  id,
  name,
  isBot: false,
  leftAt: null,
  role,
  alive: true,
  sips: 0,
  ...extra,
})

/** Riqui (h) et cinq voisins ; Marcel est mort la nuit dernière. */
const table = (myRole: LGPlayer['role']): LGPlayer[] => [
  P('h', 'Riqui', myRole),
  P('g', 'Gaston', myRole === 'salvateur' ? 'villageois' : 'salvateur', { isBot: true }),
  P('w', 'Raoul', myRole === 'loup' ? 'voyante' : 'loup', { isBot: true }),
  P('s', 'Suzette', 'sorciere', { isBot: true }),
  P('v', 'Paulette', 'villageois', { isBot: true }),
  P('m', 'Marcel', 'chasseur', { isBot: true, alive: false }),
]

function craft(players: LGPlayer[], phase: LGPhase, over: Partial<LGState> = {}): LGState {
  return {
    version: 7,
    phase,
    phaseSeq: 3,
    phaseEndsAt: Date.now() + 30_000,
    players,
    round: 1,
    debateMs: 120_000,
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

function render(state: LGState, locale: string = 'fr', errors: unknown[] = []): string {
  room.current = {
    id: 'r',
    gameId: 'loup-garou',
    status: 'playing',
    stateVersion: state.version,
    currentTurnUserId: null,
    gameStateJson: JSON.stringify(toLGClientView(state, 'h')),
    members: [],
  }
  return renderToStaticMarkup(
    createElement(
      IntlProvider,
      {
        locale,
        messages: catalogue(locale),
        timeZone: 'Europe/Paris',
        onError: (error: unknown) => {
          errors.push(error)
        },
      },
      createElement(LoupGarouOnline)
    )
  )
}

/** Début du titre du panneau « Le village (4/6 vivants) ». */
const VILLAGE_TITLE = 'Le village ('

/** Cartes crème de la page : grille de cibles, village posé, mini-carte du rôle. */
const creamCards = (html: string) => html.match(/border-\[#D8CCAE\] bg-cream/g)?.length ?? 0

describe('LoupGarouOnline : écrans de partie dans les 4 langues', () => {
  it('se rend sans clé manquante à chaque phase jouée', () => {
    const states = [
      craft(table('salvateur'), 'night-guard'),
      craft(table('villageois'), 'night-wolves'),
      craft(table('sorciere'), 'night-witch', { nightVictimId: 'v' }),
      craft(table('villageois'), 'day-debate', {
        debateSpeech: [{ playerId: 'w', kind: 'suspect', targetId: 'h', round: 1 }],
      }),
      craft(table('villageois'), 'day-vote', {
        debateSpeech: [{ playerId: 'w', kind: 'suspect', targetId: 'g', round: 1 }],
        ravenTargetId: 'g',
      }),
      craft(table('villageois'), 'mayor-election', { round: 0 }),
      // Deux loups : la ligne des complices et celle de la meute ont leurs arguments.
      craft(
        table('loup').map((p) => (p.id === 'g' ? { ...p, role: 'loup' as const } : p)),
        'night-wolves',
        { wolfVotes: { g: 'v' } }
      ),
      craft(table('villageois'), 'dawn', { lastNightDeaths: [{ playerId: 'm', role: 'chasseur', cause: 'loups', round: 1 }] }),
    ]
    for (const locale of LOCALES) {
      for (const state of states) {
        const errors: unknown[] = []
        render(state, locale, errors)
        expect(errors, `${locale} ${state.phase}`).toEqual([])
      }
    }
  })

  it('la nuit, l’acteur et le dormeur ont la même silhouette : même cadre, autant de cartes crème, même ligne d’état', () => {
    const actor = render(craft(table('salvateur'), 'night-guard'))
    const sleeper = render(craft(table('villageois'), 'night-guard'))
    for (const html of [actor, sleeper]) {
      expect(html).toContain('border-chip-blue/50 bg-felt-deep/80')
      expect(html).toContain(lg('sleepHint'))
      // Le panneau « Le village » ne double pas la grille.
      expect(html).not.toContain(VILLAGE_TITLE)
      expect(html).not.toMatch(/text-white|🌙/)
    }
    expect(creamCards(actor)).toBe(creamCards(sleeper))
    // L'acteur choisit dans la grille et valide dans la barre ; le dormeur n'a rien à toucher.
    expect(actor).toContain(lg('pickPlayer'))
    expect(actor.match(/aria-pressed="false"/g)).toHaveLength(5)
    expect(sleeper).not.toContain('aria-pressed')
    expect(sleeper).toContain(lg('sleep'))
  })

  it('la nuit, la sorcière et le loup ne se distinguent pas non plus : village posé, barre de même hauteur, pas de couleur de rôle', () => {
    const sleeper = render(craft(table('villageois'), 'night-witch', { nightVictimId: 'v' }))
    const witch = render(craft(table('sorciere'), 'night-witch', { nightVictimId: 'v' }))
    // Les potions s'ajoutent au village posé, elles ne le remplacent pas.
    expect(witch).toContain(lg('witchNone'))
    expect(creamCards(witch)).toBe(creamCards(sleeper))
    // Barre du bas : une rangée de 56 px chez tous, boutons chez l'acteur,
    // rangée inerte chez le dormeur et le loup (qui vote d'un toucher).
    const INERT_ROW = 'aria-hidden="true" class="flex h-14 w-full'
    expect(sleeper).toContain(INERT_ROW)
    expect(witch).not.toContain(INERT_ROW)
    expect(render(craft(table('loup'), 'night-wolves'))).toContain(INERT_ROW)
    const seer = render(craft(table('voyante'), 'night-seer', { seerPeeks: [{ round: 1, targetId: 'w', team: 'loups' }] }))
    expect(seer).toContain(INERT_ROW)
    // Seule l'icône du titre porte la couleur du rôle, pas l'encadré de la vision.
    expect(seer).not.toMatch(/(bg|border)-purple-/)
  })

  it('bandeau : « Nuit 1 » la nuit, « Jour 1 » le jour, la phase en entier', () => {
    const night = render(craft(table('villageois'), 'night-wolves'))
    expect(night).toContain('Nuit 1')
    expect(night).toContain(lg('phases.night-wolves'))
    expect(render(craft(table('villageois'), 'day-vote'))).toContain('Jour 1')
  })

  it('vote du jour : choisir dans la grille, valider dans la barre ; accusations sur les cartes, débat à revoir', () => {
    const html = render(
      craft(table('villageois'), 'day-vote', {
        debateSpeech: [
          { playerId: 'w', kind: 'suspect', targetId: 'g', round: 1 },
          { playerId: 'v', kind: 'rally', targetId: 'g', round: 1 },
        ],
      })
    )
    expect(html).toContain(lg('pickSuspect'))
    expect(html).toContain('2 accusations')
    expect(html).toContain(lg('reviewDebate'))
    // Je ne vote pas contre moi : ma carte est interdite, pas absente.
    expect(html).toContain('aria-disabled="true"')
    expect(html).not.toContain(VILLAGE_TITLE)
    expect(html).not.toMatch(/text-white/)
  })

  it('débat : « Passer au vote » dans la barre, fil qui n’annonce que ce qui me vise', () => {
    const html = render(
      craft(table('villageois'), 'day-debate', {
        debateSpeech: [{ playerId: 'w', kind: 'suspect', targetId: 'h', round: 1 }],
      })
    )
    expect(html).toContain('<ul aria-live="off"')
    expect(html).toContain('role="status" aria-live="polite" aria-atomic="true" class="sr-only"')
    expect(html).toContain(lg('skipToVote').replace('{n}', '0').replace('{total}', '5'))
    // Accusé : « Me défendre face à Raoul » en pleine largeur.
    expect(html).toContain('Raoul')
    expect(html).toContain(lg('speakDefendAgainst').replace(' {name}', ''))
  })
})
