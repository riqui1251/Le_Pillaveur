import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(__dirname, 'GameOnlineLobby.tsx'), 'utf8')

describe('réglages de table du lobby', () => {
  // L'option retenue n'était signalée que par la couleur (optionTone) : un lecteur d'écran ne savait pas laquelle.
  it('chaque bouton d’option annonce son état à un lecteur d’écran', () => {
    const toneButtons = source.match(/optionTone\(active, isHost\)/g) ?? []
    const pressed = source.match(/aria-pressed=\{active\}/g) ?? []
    expect(toneButtons.length).toBeGreaterThan(0)
    expect(pressed.length).toBe(toneButtons.length)
  })
})
