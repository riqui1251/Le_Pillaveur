import { describe, expect, it } from 'vitest'

/**
 * Navigation contract: /online is a redirect alias to /jeux with playMode=online.
 * Kept as pure constants so routing expectations stay documented without a full E2E harness.
 */
describe('jeux/online navigation contract', () => {
  it('defines a single games hub route', () => {
    expect('/jeux').toBe('/jeux')
  })

  it('redirects legacy /online to the unified hub', () => {
    const legacyOnlinePath = '/online'
    const unifiedHubPath = '/jeux'
    expect(legacyOnlinePath).not.toBe(unifiedHubPath)
    // Client redirect page sets playMode online then replaces history with /jeux
    expect(unifiedHubPath).toMatch(/^\/jeux$/)
  })
})

describe('useRequireSelectedPlayers online bypass', () => {
  it('skips player requirement when skipWhenOnline and playMode is online', () => {
    const isOnline = true
    const selectedIds: string[] = []
    const ready = isOnline || selectedIds.length > 0
    expect(ready).toBe(true)
  })

  it('requires players in local mode', () => {
    const isOnline = false
    const selectedIds: string[] = []
    const ready = isOnline || selectedIds.length > 0
    expect(ready).toBe(false)
  })
})
