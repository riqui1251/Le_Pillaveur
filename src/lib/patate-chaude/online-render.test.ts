import React, { createElement, type ComponentProps, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import fr from '../../../messages/fr.json'
import { phaseKey } from '@/lib/online/phase-clock'
import { DEFAULT_ONLINE_PREFERENCES } from '@/lib/online-preferences'
import type { RoomDto, TvRoomDto } from '@/lib/online-room'
import { PatateChaudeOnline } from '@/components/online/PatateChaudeOnline'
import { TvPatateChaude } from '@/components/tv/TvPatateChaude'
import type { PcChallenge } from './engine'
import { toPcClientView, type PcClientView, type PcOnlineState } from './online-shared'
import {
  applyPcRoomAction,
  buildPcState,
  markPcPlayerLeft,
  pcClientViewJson,
  type PcRoomActionInput,
} from './server-adapter'

/**
 * Rendu à blanc de l'écran en ligne et de la TV, phase par phase : aucune exception, ni mèche ni
 * graine dans le HTML, les bons gestes au bon joueur. Les contextes du site (session, salle,
 * vocal, dialogues) sont remplacés par des doublures ; un texte absent du catalogue s'afficherait
 * sous sa clé. Les textes attendus des gestes se lisent dans le catalogue fusionné (onlineText).
 */

;(globalThis as { React?: typeof React }).React = React

const harness = vi.hoisted(() => ({
  user: { id: 'u1', ambianceMode: 'alcool' as string },
  room: null as unknown,
}))

vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ user: harness.user, loading: false, setAmbianceMode: () => undefined }),
}))
vi.mock('@/hooks/useOnlineRoom', async () => {
  const react = await import('react')
  return {
    OnlineRoomContext: react.createContext(null),
    useOnlineRoom: () => ({ room: harness.room, voteRematch: async () => null, leaveRoom: async () => null }),
  }
})
vi.mock('@/components/voice/voice-dock-store', () => ({
  useVoiceDockStatus: () => ({ available: false }),
  useVoiceDockAnchored: () => false,
}))
vi.mock('@/components/voice/VoiceDockButton', () => ({ VoiceDockButton: () => null }))
vi.mock('@/components/game/ConfirmActionDialog', () => ({ useConfirmAction: () => [null, async () => false] }))
vi.mock('@/components/online/GameOnlineLobby', () => ({ GameOnlineLobby: () => null }))
vi.mock('@/components/online/XpGainBanner', () => ({ XpGainBanner: () => null }))
vi.mock('@/components/online/GameTutorialModal', () => ({
  GameTutorialModal: () => null,
  TutorialReopenButton: () => null,
  useGameTutorial: () => ({ open: false, close: () => undefined, reopen: () => undefined }),
}))
vi.mock('@/components/online/OnlineEndScreen', async () => {
  const react = await import('react')
  return {
    OnlineEndScreen: (props: { header: ReactNode; ranking?: ReactNode }) =>
      react.createElement('div', null, props.header, props.ranking),
  }
})
// Le dessin de la bombe (styled-jsx) n'a rien à vérifier ici.
vi.mock('@/app/[locale]/games/patate-chaude/components/bomb', async () => {
  const react = await import('react')
  return {
    BombArt: react.forwardRef(function BombArt() {
      return null
    }),
    BoomBurst: () => null,
  }
})

const T0 = 1_700_000_000_000
const IDS = ['u1', 'u2', 'u3', 'u4']
const MEMBERS = IDS.map((userId) => ({ userId, user: { displayName: `Joueur ${userId}` } }))
const THEME: PcChallenge = { kind: 'theme', id: 'fruit', value: 'Un fruit' }

function act(state: PcOnlineState, userId: string, input: PcRoomActionInput, now: number): PcOnlineState {
  const result = applyPcRoomAction(state, userId, input, now)
  if (!result.ok) throw new Error(result.error)
  return result.state
}

const ready = () => buildPcState(MEMBERS, {}, 'fr', 'rendu', T0)
const lit = (): PcOnlineState => {
  const state = ready()
  const burning = act(state, '__service__', { type: 'advance', phaseKey: phaseKey(state) }, state.phaseEndsAt!)
  return { ...burning, game: { ...burning.game, challenge: THEME } }
}
/** u1 a passé « Brocoli » : la bombe est chez u2, le mot est contestable. */
const passed = () => act(lit(), 'u1', { type: 'pass', word: 'Brocoli' }, T0 + 6_000)
const struck = () =>
  act(act(passed(), 'u3', { type: 'contest', index: 0 }, T0 + 7_000), 'u4', { type: 'contest', index: 0 }, T0 + 7_500)
const boom = () => {
  const state = passed()
  return act(state, '__service__', { type: 'advance', phaseKey: phaseKey(state) }, state.game.explodeAt!)
}
const finished = () => act(passed(), 'u1', { type: 'end' }, T0 + 8_000)
/** u4 a explosé deux fois sans jouer : la bombe le saute jusqu'à son « Je suis là ». */
const setAside = (): PcOnlineState => {
  const state = passed()
  return { ...state, game: { ...state.game, absent: ['u4'] } }
}
/** u4 est parti tôt, sans explosion ; tous les autres ont sauté au moins une fois. */
const finishedAfterDeparture = (): PcOnlineState => {
  const state = finished()
  return {
    ...state,
    players: state.players.map((p) => (p.id === 'u4' ? { ...p, leftAt: T0 + 1_000 } : p)),
    game: { ...state.game, absent: ['u4'], explosions: { u1: 1, u2: 2, u3: 2, u4: 0 } },
  }
}
/** Trois joueurs sont partis : la partie s'arrête à l'échéance, déjà échue. */
const closing = (): PcOnlineState =>
  ['u2', 'u3', 'u4'].reduce((state, id) => markPcPlayerLeft(state, id, T0 + 6_000) ?? state, lit())

function members() {
  return IDS.map((userId) => ({
    userId,
    displayName: `Joueur ${userId}`,
    isHost: userId === 'u1',
    isReady: true,
    isSelf: userId === harness.user.id,
    preferences: DEFAULT_ONLINE_PREFERENCES,
    level: 1,
    role: 'user',
    present: true,
  }))
}

function withIntl(node: ReactNode): string {
  return renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      {
        locale: 'fr',
        messages: fr as unknown as AbstractIntlMessages,
        timeZone: 'Europe/Paris',
        onError: () => undefined,
        getMessageFallback: ({ namespace, key }: { namespace?: string; key: string }) =>
          [namespace, key].filter(Boolean).join('.'),
      } as unknown as ComponentProps<typeof NextIntlClientProvider>,
      node
    )
  )
}

/** games.patate-chaude.<section>.<key> du catalogue français, échappé comme le rend React ; lève si la clé manque. */
function sliceText(section: 'online' | 'game', key: string, word?: string): string {
  const texts = (fr as unknown as { games: Record<string, Record<string, Record<string, unknown>>> }).games[
    'patate-chaude'
  ][section]
  const text = texts[key]
  if (typeof text !== 'string') throw new Error(`games.patate-chaude.${section}.${key} absent du catalogue`)
  return (word === undefined ? text : text.replace('{word}', word))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

const onlineText = (key: string, word?: string) => sliceText('online', key, word)

/** Le HTML sans ce qui n'est lu qu'au lecteur d'écran. */
const visible = (html: string) => html.replace(/<span class="sr-only">.*?<\/span>/g, '')

/** Classe de la ligne de liste (<li>) qui porte ce nom. */
function rowClass(html: string, name: string): string {
  const row = html
    .split('<li ')
    .slice(1)
    .find((chunk) => chunk.split('</li>')[0].includes(name))
  return /^class="([^"]*)"/.exec(row ?? '')?.[1] ?? ''
}

function renderPhone(state: PcOnlineState, viewerId: string, ambiance: 'alcool' | 'soft' = 'alcool'): string {
  harness.user = { id: viewerId, ambianceMode: ambiance }
  const room: RoomDto = {
    id: 'room-1',
    code: 'ABCD',
    status: 'playing',
    visibility: 'private',
    gameId: 'patate-chaude',
    hostUserId: 'u1',
    members: members(),
    allReady: true,
    canLaunch: false,
    settings: { difficulty: 'normal', lang: 'fr' },
    stateVersion: state.version,
    currentTurnUserId: null,
    gameStateJson: pcClientViewJson(state),
    briefing: null,
  }
  harness.room = room
  return withIntl(createElement(PatateChaudeOnline))
}

function renderTv(state: PcOnlineState): { html: string; view: PcClientView } {
  const view = toPcClientView(state)
  const room: TvRoomDto = {
    code: 'ABCD',
    status: 'playing',
    gameId: 'patate-chaude',
    hostUserId: 'u1',
    members: members(),
    settings: { difficulty: 'normal', lang: 'fr' },
    stateVersion: state.version,
    currentTurnUserId: null,
    gameStateJson: JSON.stringify(view),
  }
  return { html: withIntl(createElement(TvPatateChaude, { room, state: view })), view }
}

const PHASES: [string, () => PcOnlineState][] = [
  ['compte à rebours', ready],
  ['mèche', lit],
  ['mot contestable', passed],
  ['mot rayé', struck],
  ['joueur mis de côté', setAside],
  ['BOUM', boom],
  ['table vidée', closing],
  ['fin', finished],
]

describe('Patate Chaude en ligne — écran du téléphone', () => {
  it.each(PHASES)('%s : rendu sans erreur, sans mèche ni graine', (_label, build) => {
    const state = build()
    for (const viewer of IDS) {
      const html = renderPhone(state, viewer)
      expect(html.length).toBeGreaterThan(0)
      if (state.game.explodeAt !== null) expect(html).not.toContain(String(state.game.explodeAt))
      expect(html).not.toContain('rngState')
    }
  })

  it('le porteur a le champ de saisie ; les autres non', () => {
    const state = lit()
    expect(renderPhone(state, 'u1')).toContain('<input')
    expect(renderPhone(state, 'u2')).not.toContain('<input')
  })

  it('mot contestable : les joueurs hors jeu le contestent ; ni son auteur, ni le porteur', () => {
    const state = passed()
    const contest = onlineText('contest', 'Brocoli')
    // Les consignes se reconnaissent à leur début (avant le premier argument).
    const callToContest = onlineText('contestHint').split('{')[0]
    const tableMayContest = onlineText('contestHintOthers').split('{')[0]
    for (const viewer of ['u3', 'u4']) {
      const html = renderPhone(state, viewer)
      expect(html).toContain(contest)
      expect(html).toContain(callToContest)
    }
    for (const viewer of ['u1', 'u2']) {
      const html = renderPhone(state, viewer)
      expect(html).not.toContain(contest)
      expect(html).not.toContain(onlineText('contestShort'))
      // Aucun appel à un geste impossible : ils lisent seulement que la table peut contester.
      expect(html).not.toContain(callToContest)
      expect(html).toContain(tableMayContest)
    }
    // Le porteur, à qui le mot vient d'être passé, garde son champ : il ne peut que jouer.
    expect(renderPhone(state, 'u2')).toContain('<input')
  })

  it('compte à rebours : la consigne du jeu en ligne (taper, envoyer), pas celle du jeu local', () => {
    const html = renderPhone(ready(), 'u2')
    expect(html).toContain(onlineText('readyHint'))
    expect(html).not.toContain(sliceText('game', 'readyHint'))
  })

  it('« Déjà dit » : chaque mot montre en clair le nom de son auteur', () => {
    // Tous les comptes démarrent avec la même icône : sans le nom, on ne sait pas qui a dit quoi.
    const html = renderPhone(passed(), 'u3')
    const start = html.indexOf('id="pc-said"')
    const said = visible(html.slice(start, html.indexOf('</section>', start)))
    expect(said).toContain('Brocoli')
    expect(said).toContain('Joueur u1')
  })

  it('à trois, pas de contestation : aucun bouton, aucune consigne', () => {
    const trio = buildPcState(MEMBERS.slice(0, 3), {}, 'fr', 'rendu', T0)
    const burning = act(trio, '__service__', { type: 'advance', phaseKey: phaseKey(trio) }, trio.phaseEndsAt!)
    const state = act({ ...burning, game: { ...burning.game, challenge: THEME } }, 'u1', { type: 'pass', word: 'Brocoli' }, T0 + 6_000)
    for (const viewer of ['u1', 'u2', 'u3']) {
      const html = renderPhone(state, viewer)
      // « Contester » couvre les deux libellés du bouton ; la consigne se reconnaît à son début.
      expect(html).not.toContain(onlineText('contestShort'))
      expect(html).not.toContain(onlineText('contestHint').split('{')[0])
      expect(html).not.toContain(onlineText('contestHintOthers').split('{')[0])
    }
  })

  it('BOUM : gorgées ou points selon l’ambiance du téléphone', () => {
    const state = boom()
    expect(renderPhone(state, 'u3', 'alcool')).toContain('Joueur u2 boit 3 gorgées')
    expect(renderPhone(state, 'u3', 'soft')).toContain('Joueur u2 prend 1 point de pénalité')
  })

  it('tout joueur actif peut terminer la partie (le serveur l’accepte de chacun)', () => {
    const state = lit()
    for (const viewer of IDS) expect(renderPhone(state, viewer)).toContain(onlineText('endGame'))
    expect(renderPhone(state, 'u2')).not.toContain('games.patate-chaude.online.hostEnds')
  })

  it('mis de côté : « Je suis là » chez lui, une marque chez les autres, plus de « Terminer »', () => {
    const state = setAside()
    const aside = renderPhone(state, 'u4')
    expect(aside).toContain(onlineText('asideMine'))
    expect(aside).toContain(onlineText('resume'))
    expect(aside).not.toContain(onlineText('endGame'))
    const other = renderPhone(state, 'u3')
    expect(other).not.toContain(onlineText('resume'))
    expect(other).toContain(onlineText('asideTag'))
  })

  it('table vidée : « plus assez de joueurs », sans compte à rebours ni bouton', () => {
    const html = renderPhone(closing(), 'u1')
    expect(html).toContain(onlineText('notEnough'))
    expect(html).toContain('Fin de la partie')
    expect(html).not.toContain(onlineText('startsMine'))
    expect(html).not.toContain(onlineText('endGame'))
  })

  it('fin : classement des explosions', () => {
    const html = renderPhone(finished(), 'u2')
    expect(html).toContain('Fin de la partie')
    for (const id of IDS) expect(html).toContain(`Joueur ${id}`)
  })

  it('classement : le nom a sa ligne, deux au besoin ; « toi » et l’état passent dessous', () => {
    // À 375 px, en ligne avec « toi », l'icône « en pause » et les deux colonnes de chiffres, le nom
    // tombait à deux lettres (« Re… »).
    const ended = finished()
    const html = renderPhone({ ...ended, game: { ...ended.game, absent: ['u2'] } }, 'u2')
    const row =
      html
        .split('<li ')
        .slice(1)
        .map((chunk) => chunk.split('</li>')[0])
        .find((chunk) => chunk.includes('Joueur u2')) ?? ''
    const nameClass = /<span class="([^"]*)">Joueur u2<\/span>/.exec(row)?.[1] ?? ''
    expect(nameClass).toContain('line-clamp-2')
    expect(nameClass).not.toContain('truncate')
    expect(row).toMatch(new RegExp(`Joueur u2</span><span class="flex flex-wrap[^"]*"><span>${onlineText('you')}</span>`))
    expect(row).toContain(onlineText('asideTag'))
  })

  it('fin : un joueur parti n’est jamais vainqueur, même sans explosion', () => {
    const html = renderPhone(finishedAfterDeparture(), 'u2')
    expect(html).toContain('Joueur u1 gagne')
    expect(html).not.toContain('Joueur u4 gagne')
    expect(rowClass(html, 'Joueur u1')).toContain('border-gold/60')
    // Toujours listé (ses explosions comptent pour ses gorgées), mais sans or.
    expect(rowClass(html, 'Joueur u4')).not.toContain('border-gold/60')
    expect(rowClass(html, 'Joueur u4')).toContain('opacity-60')
  })
})

describe('Patate Chaude en ligne — TV', () => {
  it.each(PHASES)('%s : rendu sans erreur, lisible de loin, sans mèche', (_label, build) => {
    const state = build()
    const { html, view } = renderTv(state)
    expect(html.length).toBeGreaterThan(0)
    expect(html).not.toMatch(/\btext-(?:xs|sm)\b/)
    expect(JSON.stringify(view)).not.toMatch(/"explodeAt"|"rngState"|"usedChallenges"|"winner"/)
    if (state.game.explodeAt !== null) expect(html).not.toContain(String(state.game.explodeAt))
  })

  it('pendant la mèche : le défi, le porteur et les mots déjà dits', () => {
    const { html } = renderTv(passed())
    expect(html).toContain('Un fruit')
    expect(html).toContain('Joueur u2')
    expect(html).toContain('Brocoli')
  })

  it('BOUM puis fin : le perdant, puis tous les joueurs au classement', () => {
    expect(renderTv(boom()).html).toContain('Joueur u2')
    const { html } = renderTv(finished())
    for (const id of IDS) expect(html).toContain(`Joueur ${id}`)
  })

  it('fin : un joueur parti n’est jamais vainqueur, même sans explosion', () => {
    const { html } = renderTv(finishedAfterDeparture())
    expect(html).toContain('Joueur u1 gagne')
    expect(html).not.toContain('Joueur u4 gagne')
    expect(rowClass(html, 'Joueur u1')).toContain('ring-gold/60')
    expect(rowClass(html, 'Joueur u4')).not.toContain('ring-gold/60')
  })

  it('« Déjà dit » : le nom de chaque auteur, le mot le plus récent en haut', () => {
    const state = act(passed(), 'u2', { type: 'pass', word: 'Cerise' }, T0 + 6_500)
    const { html } = renderTv(state)
    const words = html.slice(html.indexOf('<aside'), html.indexOf('</aside>'))
    expect(words).toContain('Joueur u1')
    expect(words).toContain('Joueur u2')
    expect(words.indexOf('Cerise')).toBeLessThan(words.indexOf('Brocoli'))
  })

  it('un thème long descend d’un cran ou deux : la colonne tient dans la télé', () => {
    const challengeClass = (value: string) => {
      const state = passed()
      const { html } = renderTv({ ...state, game: { ...state.game, challenge: { kind: 'theme', id: 'x', value } } })
      return /<p class="([^"]*font-extrabold[^"]*)">/.exec(html)?.[1] ?? ''
    }
    expect(challengeClass('Un fruit')).toContain('text-6xl')
    expect(challengeClass('Quelque chose de minuscule')).toContain('text-5xl')
    expect(challengeClass('Quelque chose qu’on trouve à la plage')).toContain('text-4xl')
    expect(challengeClass('Quelque chose qu’on trouve au fond d’un sac à main')).toContain('text-4xl')
  })

  it('table vidée et joueur mis de côté : dits à l’écran', () => {
    expect(renderTv(closing()).html).toContain(onlineText('notEnough'))
    expect(renderTv(setAside()).html).toContain(onlineText('asideTag'))
  })
})
