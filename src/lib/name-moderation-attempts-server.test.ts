import { describe, expect, it } from 'vitest'
import {
  NAME_MODERATION_WARNING_THRESHOLD,
  shouldShowNameModerationWarning,
} from '@/lib/name-moderation-attempts-server'

describe('name moderation warning threshold', () => {
  it('does not warn below threshold', () => {
    expect(NAME_MODERATION_WARNING_THRESHOLD).toBe(3)
    expect(shouldShowNameModerationWarning(0)).toBe(false)
    expect(shouldShowNameModerationWarning(1)).toBe(false)
    expect(shouldShowNameModerationWarning(2)).toBe(false)
  })

  it('warns at threshold and above', () => {
    expect(shouldShowNameModerationWarning(3)).toBe(true)
    expect(shouldShowNameModerationWarning(10)).toBe(true)
  })
})
