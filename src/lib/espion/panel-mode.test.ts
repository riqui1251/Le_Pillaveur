import { describe, expect, it } from 'vitest'
import { espionOffersGuess, espionPanelMode, type EspionPanelState } from './panel-mode'

const base: EspionPanelState = {
  isSpy: false,
  hasBot: true,
  questionForMe: false,
  accusation: false,
  askable: true,
  askOpen: false,
  myHand: false,
  askDismissed: false,
  showAccuseGrid: false,
  showGuessGrid: false,
  speakMode: false,
}

const modeAndGuess = (s: Partial<EspionPanelState>) => {
  const state = { ...base, ...s }
  const mode = espionPanelMode(state)
  return { mode, guess: espionOffersGuess(mode, state.isSpy) }
}

describe('espionPanelMode : la devinette de l’espion pendant une accusation', () => {
  it('espion accusé : volet d’accusation, avec le bouton de devinette', () => {
    expect(modeAndGuess({ isSpy: true, accusation: true })).toEqual({ mode: 'accusation', guess: true })
  })

  it('espion non accusé pendant l’accusation d’un autre : même accès', () => {
    expect(modeAndGuess({ isSpy: true, accusation: true, askOpen: true })).toEqual({
      mode: 'accusation',
      guess: true,
    })
  })

  it('grille ouverte avant l’accusation : elle reste ouverte', () => {
    expect(modeAndGuess({ isSpy: true, accusation: true, showGuessGrid: true })).toEqual({
      mode: 'guess',
      guess: false,
    })
  })

  it('l’espion referme la grille : retour au volet d’accusation', () => {
    expect(modeAndGuess({ isSpy: true, accusation: true, showGuessGrid: false }).mode).toBe('accusation')
  })

  it('non-espion : aucun bouton de devinette, ni au repos ni pendant une accusation', () => {
    expect(modeAndGuess({ accusation: true })).toEqual({ mode: 'accusation', guess: false })
    expect(modeAndGuess({ accusation: true, showGuessGrid: true })).toEqual({ mode: 'accusation', guess: false })
    expect(modeAndGuess({})).toEqual({ mode: 'idle', guess: false })
  })

  it('les autres volets ne passent pas devant une accusation', () => {
    expect(modeAndGuess({ isSpy: true, accusation: true, showAccuseGrid: true }).mode).toBe('accusation')
    expect(modeAndGuess({ isSpy: true, accusation: true, speakMode: true }).mode).toBe('accusation')
    expect(modeAndGuess({ isSpy: true, accusation: true, myHand: true }).mode).toBe('accusation')
  })

  it('question en attente : elle passe devant tout, grille ouverte ou non', () => {
    expect(modeAndGuess({ isSpy: true, questionForMe: true, accusation: true, showGuessGrid: true })).toEqual({
      mode: 'question',
      guess: false,
    })
    expect(modeAndGuess({ questionForMe: true })).toEqual({ mode: 'question', guess: false })
  })
})

describe('espionPanelMode hors accusation : ordre inchangé', () => {
  it('au repos, l’espion a son bouton de devinette', () => {
    expect(modeAndGuess({ isSpy: true })).toEqual({ mode: 'idle', guess: true })
  })

  it('ma main pour poser passe devant la grille, sauf si je l’ai écartée', () => {
    expect(modeAndGuess({ isSpy: true, myHand: true, showGuessGrid: true }).mode).toBe('ask')
    expect(modeAndGuess({ isSpy: true, myHand: true, askDismissed: true, showGuessGrid: true }).mode).toBe('guess')
    expect(modeAndGuess({ isSpy: true, myHand: true, askable: false, showGuessGrid: true }).mode).toBe('guess')
  })

  it('accuser, deviner, parler, dans cet ordre', () => {
    expect(modeAndGuess({ isSpy: true, showAccuseGrid: true }).mode).toBe('accuse')
    expect(modeAndGuess({ isSpy: true, showGuessGrid: true }).mode).toBe('guess')
    expect(modeAndGuess({ speakMode: true }).mode).toBe('speak')
    expect(modeAndGuess({ speakMode: true, hasBot: false }).mode).toBe('idle')
  })
})
