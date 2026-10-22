import { describe, expect, it } from 'vitest'
import { DRINK_TIC_KEYS, botLine, genreOfId, softLineTranslator } from './bot-speech-feed'
import { DRINK_WORDS, SPEECH_LOCALES, flattenSpeechCatalogue, icuTranslator, speechCatalogueOf } from './catalogue-spec'

describe('softLineTranslator : un écran Sans alcool tait les tics qui trinquent', () => {
  const tr = icuTranslator({
    'botSay.proud': 'Mon bluff est prêt, {name}.',
    'botTic.marcel': '…tchin !',
    'botTic.gepeto': '…véridique !',
  })
  const riqui = { name: 'Riqui', isBot: false }

  it('la phrase reste, sans le tic de Marcel ; les autres tics ne bougent pas', () => {
    const soft = softLineTranslator(tr, true)
    expect(botLine('proud', { name: 'Marcel', isBot: true }, riqui, tr)).toBe('Mon bluff est prêt, Riqui. …tchin !')
    expect(botLine('proud', { name: 'Marcel', isBot: true }, riqui, soft)).toBe('Mon bluff est prêt, Riqui.')
    expect(botLine('proud', { name: 'Gépéto', isBot: true }, riqui, soft)).toBe('Mon bluff est prêt, Riqui. …véridique !')
    expect(softLineTranslator(tr, false)).toBe(tr)
  })

  it('DRINK_TIC_KEYS : exactement les tics du Loup-Garou qui parlent de boire, dans au moins une langue', () => {
    const drinking = new Set<string>()
    for (const locale of SPEECH_LOCALES) {
      const flat = flattenSpeechCatalogue(speechCatalogueOf('games.loup-garou.game', locale))
      for (const [key, text] of Object.entries(flat)) {
        if (key.startsWith('botTic.') && DRINK_WORDS[locale].test(text)) drinking.add(key)
      }
    }
    expect([...drinking].sort()).toEqual([...DRINK_TIC_KEYS].sort())
  })
})

const TABLE = [
  { id: 'h', name: 'Riqui', isBot: false },
  { id: 'h2', name: 'Bernadette', isBot: false },
  { id: 'b1', name: 'Bernadette', isBot: true },
  { id: 'b2', name: 'Raoul', isBot: true },
  { id: 'b3', name: 'Gépéto 🤠', isBot: true },
  { id: 'c', name: 'Kevin_du_93', isBot: true },
]

describe('genreOfId : le genre du joueur nommé par une annonce', () => {
  it('un bot de naissance prend le genre de son persona (ancien format « Nom 🤠 » compris)', () => {
    expect(genreOfId(TABLE, 'b1')).toBe('f')
    expect(genreOfId(TABLE, 'b2')).toBe('m')
    expect(genreOfId(TABLE, 'b3')).toBe('m')
  })

  it('other pour un humain, même au pseudo d’un persona, et pour un converti', () => {
    expect(genreOfId(TABLE, 'h')).toBe('other')
    expect(genreOfId(TABLE, 'h2')).toBe('other')
    expect(genreOfId(TABLE, 'c')).toBe('other')
  })

  it('other pour un id absent de la table ou nul : l’annonce reste épicène', () => {
    expect(genreOfId(TABLE, 'parti')).toBe('other')
    expect(genreOfId(TABLE, null)).toBe('other')
    expect(genreOfId(TABLE, undefined)).toBe('other')
    expect(genreOfId([], 'b1')).toBe('other')
  })
})
