import { describe, expect, it } from 'vitest'
import { PBC_KEYBOARD_MIN_PX, PBC_NO_KEYBOARD, pbcEnterAction, pbcKeyboardInset } from './write-ui'

describe('pbcEnterAction', () => {
  const allValid = [true, true, true, true, true]

  it('passe à la case suivante tant que ce n’est pas la dernière', () => {
    expect(pbcEnterAction(0, [false, false, false, false, false], false)).toEqual({ type: 'focus', index: 1 })
    expect(pbcEnterAction(3, allValid, true)).toEqual({ type: 'focus', index: 4 })
  })

  it('crie STOP au dernier champ quand la copie est recevable', () => {
    expect(pbcEnterAction(4, allValid, true)).toEqual({ type: 'stop' })
  })

  it('renvoie à la première case encore vide au dernier champ', () => {
    expect(pbcEnterAction(4, [true, false, true, false, true], false)).toEqual({ type: 'focus', index: 1 })
  })

  it('reste sur le dernier champ s’il est le seul à remplir', () => {
    expect(pbcEnterAction(4, [true, true, true, true, false], false)).toEqual({ type: 'stay' })
  })

  it('ferme le clavier si tout est rempli mais le STOP encore verrouillé', () => {
    expect(pbcEnterAction(4, allValid, false)).toEqual({ type: 'blur' })
  })
})

describe('pbcKeyboardInset', () => {
  const base = { stageTop: 56, stageBottom: 800, viewportTop: 0, viewportHeight: 800, scale: 1 }

  it('ne bouge rien sans clavier', () => {
    expect(pbcKeyboardInset(base)).toEqual(PBC_NO_KEYBOARD)
  })

  it('remonte la barre de la hauteur du clavier', () => {
    expect(pbcKeyboardInset({ ...base, viewportHeight: 500 })).toEqual({ bottom: 300, top: 0 })
  })

  it('suit la fenêtre visible qui a glissé vers le bas (iOS)', () => {
    expect(pbcKeyboardInset({ ...base, viewportTop: 120, viewportHeight: 400 })).toEqual({ bottom: 280, top: 64 })
  })

  it('ignore un petit écart (barres du navigateur)', () => {
    expect(pbcKeyboardInset({ ...base, viewportHeight: 800 - PBC_KEYBOARD_MIN_PX + 1 })).toEqual(PBC_NO_KEYBOARD)
  })

  it('ignore le zoom au pincement', () => {
    expect(pbcKeyboardInset({ ...base, viewportHeight: 400, scale: 2 })).toEqual(PBC_NO_KEYBOARD)
  })

  it('coque Android (adjustResize) : la scène rétrécit avec la fenêtre', () => {
    expect(pbcKeyboardInset({ ...base, stageBottom: 500, viewportHeight: 500 })).toEqual(PBC_NO_KEYBOARD)
  })
})
