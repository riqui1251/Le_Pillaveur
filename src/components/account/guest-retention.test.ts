import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GUEST_INACTIVITY_DAYS, ORPHAN_GUEST_INACTIVITY_DAYS } from './guest-retention'

/**
 * Les délais affichés à l'invité (encart d'expiration, confirmation de
 * déconnexion) doivent être ceux de la purge réelle. Le module serveur
 * importe Prisma : on lit sa source plutôt que de l'importer.
 */
const sweepSource = readFileSync(new URL('../../lib/retention-sweep.ts', import.meta.url), 'utf8')

function serverValue(name: string): number {
  const match = sweepSource.match(new RegExp(`export const ${name} = (\\d+)`))
  if (!match) throw new Error(`${name} introuvable dans src/lib/retention-sweep.ts`)
  return Number(match[1])
}

describe('délais de purge des comptes invités', () => {
  it('le délai d’inactivité affiché est celui de la purge', () => {
    expect(GUEST_INACTIVITY_DAYS).toBe(serverValue('GUEST_INACTIVITY_DAYS'))
  })

  it('le délai après déconnexion affiché est celui de la purge des orphelins', () => {
    expect(ORPHAN_GUEST_INACTIVITY_DAYS).toBe(serverValue('ORPHAN_GUEST_INACTIVITY_DAYS'))
  })
})
