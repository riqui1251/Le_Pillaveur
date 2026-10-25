import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Bandeau d'invitation d'un ami et guichet des tables : le nom du jeu s'y lit
 * traduit, titre adouci du mode sans alcool compris (useLocalizedGames). Le
 * catalogue brut (GAMES) ne porte que le titre français, que lisait aussi une
 * tablée anglaise ou une table sans alcool. Relevé statique du source.
 */
const FILES = ['FriendInviteBanner.tsx', 'OpenLobbiesList.tsx']

describe('titres de jeu traduits dans les bandeaux en ligne', () => {
  it.each(FILES)('%s : le titre vient de useLocalizedGames, jamais de GAMES', (file) => {
    const source = readFileSync(join(process.cwd(), 'src', 'components', 'online', file), 'utf8')
    expect(source).toContain('useLocalizedGames()')
    expect(source).not.toMatch(/\bGAMES\b/)
  })
})
