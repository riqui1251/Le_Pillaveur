import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { BANNABLE_FEATURES, featureBanEventAction } from '@/lib/feature-bans'
import { parseFeatureBanEventAction } from './feature-ban-events'

describe('parseFeatureBanEventAction', () => {
  it('relit chaque action écrite par featureBanEventAction', () => {
    for (const feature of BANNABLE_FEATURES) {
      for (const kind of ['ban', 'unban'] as const) {
        expect(parseFeatureBanEventAction(featureBanEventAction(kind, feature))).toEqual({ kind, feature })
      }
    }
  })

  it.each([['ban'], ['unban'], ['ban_permanent'], ['feature-ban'], ['feature-ban:video'], ['feature-ban:voice:x']])(
    '%s : pas une action de ban de fonctionnalité',
    (action) => {
      expect(parseFeatureBanEventAction(action)).toBeNull()
    }
  )
})
