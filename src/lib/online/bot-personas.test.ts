import { describe, expect, it } from 'vitest'
import { LG_SPEECH_CAP } from '@/lib/loup-garou/engine'
import {
  BOT_PERSONAS,
  DEFAULT_BOT_EMOJI,
  DEFAULT_BOT_TRAITS,
  botAvatarFromName,
  botDisplayName,
  botEmojiFromName,
  botTraitsFor,
  personaForBotName,
} from './bot-personas'

describe('botDisplayName / personaForBotName : le nom nu, l’ancien format toléré', () => {
  it('le nom stocké d’une nouvelle table est le nom seul, sans emoji', () => {
    for (const persona of BOT_PERSONAS) {
      expect(botDisplayName(persona)).toBe(persona.name)
      expect(botDisplayName(persona)).not.toMatch(/\s/)
    }
  })

  it('une table ouverte avant les portraits (« Gépéto 🤠 ») retrouve le même persona', () => {
    expect(personaForBotName('Gépéto')?.ticKey).toBe('gepeto')
    expect(personaForBotName('Gépéto 🤠')?.ticKey).toBe('gepeto')
    expect(personaForBotName('Gépétox')).toBeNull()
    expect(personaForBotName('Kevin_du_93')).toBeNull()
    expect(personaForBotName('')).toBeNull()
  })

  it('botAvatarFromName : le portrait du persona, le 🤖 pour un converti', () => {
    expect(botAvatarFromName('Raoul')).toBe('bot-raoul')
    expect(botAvatarFromName('Raoul 🦊')).toBe('bot-raoul')
    expect(botAvatarFromName('Kevin_du_93')).toBe(DEFAULT_BOT_EMOJI)
    expect(botAvatarFromName(null)).toBe(DEFAULT_BOT_EMOJI)
    expect(botEmojiFromName).toBe(botAvatarFromName)
  })

  it('chaque persona a son portrait, unique, nommé d’après sa clé', () => {
    for (const p of BOT_PERSONAS) expect(p.portraitId, p.name).toBe(`bot-${p.ticKey}`)
    expect(new Set(BOT_PERSONAS.map((p) => p.portraitId)).size).toBe(BOT_PERSONAS.length)
  })
})

describe('botTraitsFor : unique paramètre de personnalité des bots', () => {
  it('un déserteur converti (sans persona) est un suiveur moyen, ni rancunier ni fidèle, à deux paroles', () => {
    expect(botTraitsFor(null)).toEqual(DEFAULT_BOT_TRAITS)
    expect(botTraitsFor(undefined)).toEqual(DEFAULT_BOT_TRAITS)
    expect(botTraitsFor('Kevin_du_93')).toEqual({
      trait: 'suiveur',
      audace: 0.5,
      tempoMinMs: 2000,
      rancune: 0.5,
      loyaute: 0.5,
      bavardage: 2,
    })
  })

  it('retrouve le persona par le nom stocké « Raoul 🦊 »', () => {
    expect(botTraitsFor('Raoul 🦊')).toEqual({
      trait: 'agressif',
      audace: 0.85,
      tempoMinMs: 900,
      rancune: 0.9,
      loyaute: 0.2,
      bavardage: 2,
    })
    expect(botTraitsFor('Huguette 👵').trait).toBe('prudent')
  })

  it('chaque persona se retrouve depuis son nom affiché', () => {
    for (const persona of BOT_PERSONAS) {
      expect(botTraitsFor(botDisplayName(persona))).toEqual({
        trait: persona.trait,
        audace: persona.audace,
        tempoMinMs: persona.tempoMinMs,
        rancune: persona.rancune,
        loyaute: persona.loyaute,
        bavardage: persona.bavardage,
      })
    }
  })
})

describe('caractère chiffré : vingt personnages distincts, dans les bornes', () => {
  it('rancune et loyauté ∈ [0,1], bavardage ∈ {1,2,3} sous le plafond moteur', () => {
    expect(BOT_PERSONAS).toHaveLength(20)
    for (const p of BOT_PERSONAS) {
      expect(p.rancune).toBeGreaterThanOrEqual(0)
      expect(p.rancune).toBeLessThanOrEqual(1)
      expect(p.loyaute).toBeGreaterThanOrEqual(0)
      expect(p.loyaute).toBeLessThanOrEqual(1)
      expect([1, 2, 3]).toContain(p.bavardage)
      expect(p.bavardage).toBeLessThanOrEqual(LG_SPEECH_CAP)
    }
  })

  it('aucun doublon : vingt triplets (rancune, loyauté, bavardage) différents', () => {
    const triplets = new Set(BOT_PERSONAS.map((p) => `${p.rancune}/${p.loyaute}/${p.bavardage}`))
    expect(triplets.size).toBe(BOT_PERSONAS.length)
  })

  it('tic de langage : une clé ASCII par persona (le nom sans accents), unique, devant ou derrière', () => {
    const slug = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    for (const p of BOT_PERSONAS) {
      expect(p.ticKey, p.name).toMatch(/^[a-z]+$/)
      expect(p.ticKey, p.name).toBe(slug(p.name))
      expect(['prefix', 'suffix'], p.name).toContain(p.ticPosition)
    }
    expect(new Set(BOT_PERSONAS.map((p) => p.ticKey)).size).toBe(BOT_PERSONAS.length)
    // Les deux positions coexistent à une table : le fil ne lit pas toujours le tic au même endroit.
    expect(BOT_PERSONAS.filter((p) => p.ticPosition === 'prefix')).toHaveLength(10)
  })

  it('les extrêmes du lore : Germaine n’oublie rien, Lucien n’en veut à personne, Bernadette tient parole, Dédé trahit', () => {
    const by = (name: string) => BOT_PERSONAS.find((p) => p.name === name)!
    expect(by('Germaine')).toMatchObject({ rancune: 1, bavardage: 1 })
    expect(by('Lucien').rancune).toBe(0)
    expect(by('Bernadette').loyaute).toBe(0.95)
    expect(by('Dédé').loyaute).toBe(0.1)
    expect(BOT_PERSONAS.filter((p) => p.bavardage === 3).map((p) => p.name)).toEqual([
      'Gépéto',
      'Marcel',
      'Norbert',
      'Ginette',
      'Kéké',
      'Mauricette',
      'Josiane',
    ])
  })
})
