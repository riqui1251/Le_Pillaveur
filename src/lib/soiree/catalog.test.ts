import { describe, expect, it } from 'vitest'
import { GAMES } from '@/lib/games'
import {
  SOIREE_CANDIDATE_IDS,
  SOIREE_GAME_IDS,
  isSoireeCandidate,
  isSoireeGame,
  playableSoireeGameIds,
  soireeCounting,
  soireeGameIdsWith,
  soireeMinPlayers,
  soireeMinutes,
} from './catalog'

const added = SOIREE_CANDIDATE_IDS.filter((id) => !SOIREE_GAME_IDS.includes(id))
const retired = GAMES.find((g) => g.hidden)!
const onlineOnly = GAMES.find((g) => !g.hidden && g.onlineOnly)!

describe('SOIREE_CANDIDATE_IDS', () => {
  it('Pyramide et Dégaine sont candidats sans être dans la liste par défaut', () => {
    for (const id of ['pyramide', 'degaine']) {
      expect(SOIREE_CANDIDATE_IDS, id).toContain(id)
      expect(SOIREE_GAME_IDS, id).not.toContain(id)
      expect(isSoireeCandidate(id), id).toBe(true)
      expect(isSoireeGame(id), id).toBe(false)
    }
  })

  it('exclut les jeux retirés du code et ceux en ligne uniquement', () => {
    expect(isSoireeCandidate(retired.id)).toBe(false)
    expect(isSoireeCandidate(onlineOnly.id)).toBe(false)
    expect(SOIREE_CANDIDATE_IDS).not.toContain(retired.id)
    expect(SOIREE_CANDIDATE_IDS).not.toContain(onlineOnly.id)
    expect(isSoireeCandidate('jeu-inexistant')).toBe(false)
  })

  it('suit l’ordre du catalogue et contient la liste par défaut', () => {
    const order = GAMES.map((g) => g.id)
    const positions = SOIREE_CANDIDATE_IDS.map((id) => order.indexOf(id))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    for (const id of SOIREE_GAME_IDS) expect(SOIREE_CANDIDATE_IDS).toContain(id)
    expect(added.length).toBeGreaterThan(0)
  })
})

describe('soireeGameIdsWith', () => {
  it('sans écart : la liste par défaut du code', () => {
    expect(soireeGameIdsWith({})).toEqual([...SOIREE_GAME_IDS])
  })

  it('un candidat ajouté entre dans l’ordre du catalogue, un jeu sorti disparaît', () => {
    const [extra] = added
    const [first] = SOIREE_GAME_IDS
    const ids = soireeGameIdsWith({ [extra]: true, [first]: false })
    expect(ids).toContain(extra)
    expect(ids).not.toContain(first)
    const positions = ids.map((id) => SOIREE_CANDIDATE_IDS.indexOf(id))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('ignore un id qui n’est pas candidat, même à true', () => {
    expect(soireeGameIdsWith({ [onlineOnly.id]: true, [retired.id]: true, nope: true })).toEqual([...SOIREE_GAME_IDS])
  })

  it('un écart égal au défaut ne change rien', () => {
    const [first] = SOIREE_GAME_IDS
    expect(soireeGameIdsWith({ [first]: true, [added[0]]: false })).toEqual([...SOIREE_GAME_IDS])
  })
})

describe('jeu ajouté par l’équipe', () => {
  it('Dégaine remonte lui-même ses gorgées, la Pyramide seulement sa partie', () => {
    expect(soireeCounting('degaine')).toBe('auto')
    expect(soireeCounting('pyramide')).toBe('manual')
    expect(isSoireeGame('degaine')).toBe(false)
    expect(isSoireeGame('pyramide')).toBe(false)
  })

  it('un jeu candidat sans fiche prend les défauts : 10 minutes, ardoise manuelle', () => {
    const bare = added.filter((id) => !['degaine', 'pyramide'].includes(id))
    for (const id of bare) {
      expect(soireeMinutes(id), id).toBe(10)
      expect(soireeCounting(id), id).toBe('manual')
    }
  })
})

describe('playableSoireeGameIds', () => {
  it('par défaut, la liste du code', () => {
    expect(playableSoireeGameIds(99)).toEqual([...SOIREE_GAME_IDS])
  })

  it('travaille sur la liste fournie, filtrée par joueurs et jeux cachés', () => {
    const list = soireeGameIdsWith({ [added[0]]: true })
    expect(playableSoireeGameIds(99, [], list)).toEqual(list)
    expect(playableSoireeGameIds(99, [added[0]], list)).not.toContain(added[0])
    const needy = list.find((id) => soireeMinPlayers(id) > 1)!
    expect(playableSoireeGameIds(soireeMinPlayers(needy) - 1, [], list)).not.toContain(needy)
    expect(playableSoireeGameIds(99, [], [])).toEqual([])
  })
})
