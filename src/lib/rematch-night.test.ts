import { describe, expect, it } from 'vitest'
import {
  REMATCH_REMINDER_DECLINE_MS,
  addableTablemateIds,
  isFillerBotId,
  isReminderDeclineActive,
  isMultiHumanTable,
  otherHumanIds,
  parseTableFriendRequestsResult,
  rematchNightView,
} from './rematch-night'

describe('isFillerBotId', () => {
  it('reconnaît les bots de remplissage, personas compris (même identifiant bot-N)', () => {
    expect(isFillerBotId('bot-1')).toBe(true)
    expect(isFillerBotId('bot-12')).toBe(true)
  })

  it('ne prend pas un compte pour un bot', () => {
    expect(isFillerBotId('clx9bot-1')).toBe(false)
    expect(isFillerBotId('bot-')).toBe(false)
    expect(isFillerBotId('robot-3x')).toBe(false)
  })
})

describe('otherHumanIds', () => {
  it('retire le joueur local, les bots et les doublons, dans l’ordre de la table', () => {
    expect(otherHumanIds(['moi', 'bot-1', 'alice', 'bob', 'alice', 'bot-2'], 'moi')).toEqual(['alice', 'bob'])
  })

  it('sans joueur local connu, garde tous les humains', () => {
    expect(otherHumanIds(['alice', 'bot-1'], null)).toEqual(['alice'])
  })
})

describe('isMultiHumanTable', () => {
  it('vrai à partir de deux comptes humains, le joueur local compris', () => {
    expect(isMultiHumanTable(['moi', 'alice'], 'moi')).toBe(true)
  })

  it('faux contre des bots seulement', () => {
    expect(isMultiHumanTable(['moi', 'bot-1', 'bot-2'], 'moi')).toBe(false)
  })

  it('faux quand le joueur local n’est pas (ou plus) à la table', () => {
    expect(isMultiHumanTable(['alice', 'bob'], 'moi')).toBe(false)
    expect(isMultiHumanTable(['alice', 'bob'], null)).toBe(false)
  })

  it('faux seul à la table', () => {
    expect(isMultiHumanTable(['moi'], 'moi')).toBe(false)
  })
})

describe('addableTablemateIds', () => {
  const ids = ['alice', 'bob', 'carla', 'dede', 'emma']

  it('écarte les amis (dans les deux sens) et les demandes déjà envoyées', () => {
    const addable = addableTablemateIds('moi', ids, [
      { requesterId: 'moi', addresseeId: 'alice', status: 'accepted' },
      { requesterId: 'bob', addresseeId: 'moi', status: 'accepted' },
      { requesterId: 'moi', addresseeId: 'carla', status: 'pending' },
    ])
    expect(addable).toEqual(['dede', 'emma'])
  })

  it('garde une demande REÇUE en attente : le geste l’accepte', () => {
    expect(
      addableTablemateIds('moi', ['alice'], [{ requesterId: 'alice', addresseeId: 'moi', status: 'pending' }])
    ).toEqual(['alice'])
  })

  it('reste aveugle aux refus : le bouton ne doit pas trahir qui a dit non', () => {
    expect(
      addableTablemateIds('moi', ['alice', 'bob'], [
        { requesterId: 'moi', addresseeId: 'alice', status: 'declined' },
        { requesterId: 'bob', addresseeId: 'moi', status: 'declined' },
      ])
    ).toEqual(['alice', 'bob'])
  })
})

describe('rematchNightView', () => {
  const member = { isGuest: false, hasEmail: true }

  it('propose les deux gestes quand il y a quelqu’un à ajouter et pas encore de rappel', () => {
    expect(rematchNightView({ ...member, addable: 2, reminder: 'off' })).toEqual({
      friends: true,
      reminder: 'offer',
    })
  })

  it('tablée déjà amie mais rappel à accepter : la carte reste, pour le rappel seul', () => {
    expect(rematchNightView({ ...member, addable: 0, reminder: 'off' })).toEqual({
      friends: false,
      reminder: 'offer',
    })
  })

  it('rien à faire (tous amis, rappel déjà accepté) : pas de carte', () => {
    expect(rematchNightView({ ...member, addable: 0, reminder: 'on' })).toBeNull()
  })

  it('déjà inscrit avec quelqu’un à ajouter : « activé » à côté du bouton d’amis', () => {
    expect(rematchNightView({ ...member, addable: 1, reminder: 'on' })).toEqual({
      friends: true,
      reminder: 'on',
    })
  })

  it('invité : aucune ligne de rappel — sa sauvegarde est déjà proposée sous l’XP', () => {
    expect(rematchNightView({ addable: 1, reminder: 'unavailable', isGuest: true, hasEmail: false })).toEqual({
      friends: true,
      reminder: 'none',
    })
  })

  it('envoi d’e-mails non configuré : pas de promesse de rappel, pas de carte pour lui seul', () => {
    expect(rematchNightView({ ...member, addable: 1, reminder: 'unavailable' })).toEqual({
      friends: true,
      reminder: 'none',
    })
    expect(rematchNightView({ ...member, addable: 0, reminder: 'unavailable' })).toBeNull()
  })

  it('« Non merci » récent : la question ne revient pas, la carte seulement s’il reste des amis à ajouter', () => {
    expect(rematchNightView({ ...member, addable: 0, reminder: 'off', declined: true })).toBeNull()
    expect(rematchNightView({ ...member, addable: 2, reminder: 'off', declined: true })).toEqual({
      friends: true,
      reminder: 'none',
    })
  })

  it('confirmation envoyée : « e-mail envoyé » à côté du bouton d’amis, jamais seule', () => {
    expect(rematchNightView({ ...member, addable: 1, reminder: 'pending' })).toEqual({
      friends: true,
      reminder: 'pending',
    })
    expect(rematchNightView({ ...member, addable: 0, reminder: 'pending' })).toBeNull()
  })

  it('invité sans personne à ajouter : pas de carte (sa ligne de sauvegarde est déjà sous l’XP)', () => {
    expect(rematchNightView({ addable: 0, reminder: 'unavailable', isGuest: true, hasEmail: false })).toBeNull()
  })

  it('statut du rappel illisible : aucun geste de rappel proposé', () => {
    expect(rematchNightView({ ...member, addable: 1, reminder: 'error' })).toEqual({
      friends: true,
      reminder: 'none',
    })
    expect(rematchNightView({ ...member, addable: 0, reminder: 'error' })).toBeNull()
  })
})

describe('isReminderDeclineActive', () => {
  const NOW = Date.parse('2026-10-09T19:00:00Z')

  it('tient douze semaines, pas une de plus', () => {
    expect(isReminderDeclineActive(String(NOW - 1000), NOW)).toBe(true)
    expect(isReminderDeclineActive(String(NOW - REMATCH_REMINDER_DECLINE_MS + 1), NOW)).toBe(true)
    expect(isReminderDeclineActive(String(NOW - REMATCH_REMINDER_DECLINE_MS), NOW)).toBe(false)
  })

  it('ignore une valeur absente, illisible ou datée de l’avenir', () => {
    for (const raw of [null, undefined, '', 'oui', '-5', String(NOW + 60_000)]) {
      expect(isReminderDeclineActive(raw, NOW)).toBe(false)
    }
  })
})

describe('parseTableFriendRequestsResult', () => {
  it('lit les deux compteurs', () => {
    expect(parseTableFriendRequestsResult({ requested: 2, accepted: 1 })).toEqual({ requested: 2, accepted: 1 })
  })

  it('refuse une réponse illisible', () => {
    expect(parseTableFriendRequestsResult(null)).toBeNull()
    expect(parseTableFriendRequestsResult({ requested: '2', accepted: 1 })).toBeNull()
  })
})
