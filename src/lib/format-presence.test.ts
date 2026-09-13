import { describe, expect, it } from 'vitest'
import { formatPresenceDuration } from '@/lib/format-presence'

describe('formatPresenceDuration', () => {
  it('garde les unités françaises par défaut', () => {
    expect(formatPresenceDuration(42)).toBe('42 s')
    expect(formatPresenceDuration(5 * 60)).toBe('5 min')
    expect(formatPresenceDuration(2 * 3600 + 10 * 60)).toBe('2 h 10 min')
    expect(formatPresenceDuration(31 * 3600)).toBe('1 j 7 h')
  })

  it('emploie les unités fournies (Supervision traduite)', () => {
    const en = { s: 's', min: 'min', h: 'h', d: 'd' }
    expect(formatPresenceDuration(31 * 3600, en)).toBe('1 d 7 h')
    expect(formatPresenceDuration(48 * 3600, { ...en, d: 'g' })).toBe('2 g')
  })
})
