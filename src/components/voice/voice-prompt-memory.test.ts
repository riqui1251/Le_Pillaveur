import { describe, expect, it } from 'vitest'
import { deferVoicePrompt, isVoicePromptDeferred, VOICE_PROMPT_LATER_KEY } from './voice-prompt-memory'

function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
    data,
  }
}

describe('mémoire « Plus tard » de la question du micro', () => {
  it('retient le refus pour CETTE salle seulement', () => {
    const store = memoryStore()
    expect(isVoicePromptDeferred('salle-a', store)).toBe(false)
    deferVoicePrompt('salle-a', store)
    expect(isVoicePromptDeferred('salle-a', store)).toBe(true)
    expect(isVoicePromptDeferred('salle-b', store)).toBe(false)
  })

  it('ne garde que les 20 dernières salles, sans doublon', () => {
    const store = memoryStore()
    for (let i = 0; i < 25; i += 1) deferVoicePrompt(`salle-${i}`, store)
    deferVoicePrompt('salle-24', store)
    const saved = JSON.parse(store.data.get(VOICE_PROMPT_LATER_KEY) ?? '[]') as string[]
    expect(saved).toHaveLength(20)
    expect(new Set(saved).size).toBe(20)
    expect(isVoicePromptDeferred('salle-0', store)).toBe(false)
    expect(isVoicePromptDeferred('salle-24', store)).toBe(true)
  })

  it('valeur corrompue ou stockage qui lève : aucune erreur, rien de retenu', () => {
    expect(isVoicePromptDeferred('x', memoryStore({ [VOICE_PROMPT_LATER_KEY]: '{pas du json' }))).toBe(false)
    const throwing = {
      getItem: () => {
        throw new Error('bloqué')
      },
      setItem: () => {
        throw new Error('bloqué')
      },
    }
    expect(isVoicePromptDeferred('x', throwing)).toBe(false)
    expect(() => deferVoicePrompt('x', throwing)).not.toThrow()
    expect(isVoicePromptDeferred('x', null)).toBe(false)
    expect(() => deferVoicePrompt('x', null)).not.toThrow()
  })
})
