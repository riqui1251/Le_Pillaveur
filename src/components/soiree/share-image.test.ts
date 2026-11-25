import { describe, expect, it } from 'vitest'
import { ADDITION_FORMATS, ADDITION_MAX_ROWS, additionLayout } from './share-image'

/** Bas du bloc « moment » au pire : trois lignes sous son point de départ. */
function momentBottom(layout: ReturnType<typeof additionLayout>, awards: number): number {
  const zig = layout.receipt.y + layout.receipt.height
  const afterAwards = zig + layout.awards.gap + awards * (layout.awards.lineHeight + layout.awards.spacing)
  return Math.min(afterAwards + layout.moment.gap, layout.moment.maxY) + 2 * layout.moment.lineHeight
}

describe("image de l'addition : mise en page par format", () => {
  it('deux formats, fil puis story', () => {
    expect([...ADDITION_FORMATS]).toEqual(['feed', 'story'])
  })

  it('fil : 1080 × 1350, la mise en page historique', () => {
    const layout = additionLayout('feed', 4, 3, true)
    expect([layout.width, layout.height]).toEqual([1080, 1350])
    expect(layout.receipt).toEqual({ x: 150, y: 320, width: 780, height: 170 + 4 * 58, firstRow: 390, rowHeight: 58, font: 38 })
    expect(layout.footer).toEqual({ y: 1270, size: 34 })
    expect(layout.corners).toBe(false)
  })

  it('story : 1080 × 1920, plus grand que le fil et pas un simple agrandissement', () => {
    const feed = additionLayout('feed', 4, 3, true)
    const story = additionLayout('story', 4, 3, true)
    expect([story.width, story.height]).toEqual([1080, 1920])
    expect(story.title.size).toBeGreaterThan(feed.title.size)
    expect(story.receipt.rowHeight).toBeGreaterThan(feed.receipt.rowHeight)
    expect(story.receipt.width).toBeGreaterThan(feed.receipt.width)
    expect(story.corners).toBe(true)
  })

  it('story : rien sous les barres de l’appli (250 px en haut, 220 en bas)', () => {
    for (let rows = 1; rows <= ADDITION_MAX_ROWS; rows++) {
      const layout = additionLayout('story', rows, 3, true)
      expect(layout.brand.y - layout.brand.size, `${rows} rangées`).toBeGreaterThanOrEqual(250)
      expect(layout.footer.y + 10, `${rows} rangées`).toBeLessThanOrEqual(layout.height - 220)
      expect(layout.receipt.y).toBeGreaterThan(layout.subtitle.y)
      expect(layout.receipt.y + layout.receipt.height, `${rows} rangées`).toBeLessThan(layout.footer.y - 200)
    }
  })

  it('story : le moment tient entre les distinctions et le pied, même à huit joueurs', () => {
    for (let rows = 1; rows <= ADDITION_MAX_ROWS; rows++) {
      const layout = additionLayout('story', rows, 3, true)
      expect(momentBottom(layout, 3), `${rows} rangées`).toBeLessThan(layout.footer.y - layout.footer.size)
      const zig = layout.receipt.y + layout.receipt.height
      const lastAward = zig + layout.awards.gap + 2 * (layout.awards.lineHeight + layout.awards.spacing)
      const momentStart = Math.min(lastAward + layout.awards.lineHeight + layout.awards.spacing + layout.moment.gap, layout.moment.maxY)
      expect(momentStart - layout.moment.font, `${rows} rangées`).toBeGreaterThan(lastAward)
    }
  })

  it('story : une petite table descend le ticket au lieu de laisser un trou', () => {
    const small = additionLayout('story', 2, 1, false)
    const full = additionLayout('story', ADDITION_MAX_ROWS, 3, true)
    expect(small.receipt.y).toBeGreaterThan(full.receipt.y)
    expect(full.receipt.y).toBe(530)
  })

  it('au-delà de huit joueurs, le ticket garde la taille de huit', () => {
    for (const format of ADDITION_FORMATS) {
      expect(additionLayout(format, 12, 3, true)).toEqual(additionLayout(format, ADDITION_MAX_ROWS, 3, true))
    }
  })
})
