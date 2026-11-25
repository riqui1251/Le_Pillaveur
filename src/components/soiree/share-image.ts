"use client"

/**
 * L'image de l'addition, dessinée sur l'appareil : rien ne part au serveur.
 * Deux formats : 'feed' (1080 × 1350, portrait des groupes de discussion et
 * du fil) et 'story' (1080 × 1920, stories Instagram et Snapchat).
 */
export type AdditionFormat = 'feed' | 'story'

export const ADDITION_FORMATS: readonly AdditionFormat[] = ['feed', 'story']

/** Rangées de l'addition dessinées au plus (l'écran, lui, les montre toutes). */
export const ADDITION_MAX_ROWS = 8

export type AdditionLayout = {
  width: number
  height: number
  brand: { y: number; size: number }
  title: { y: number; size: number }
  subtitle: { y: number; size: number }
  receipt: { x: number; y: number; width: number; height: number; firstRow: number; rowHeight: number; font: number }
  payer: { gap: number; lineHeight: number; font: number }
  awards: { gap: number; lineHeight: number; spacing: number; font: number }
  moment: { gap: number; lineHeight: number; font: number; maxY: number }
  footer: { y: number; size: number }
  /** Second filet et enseignes d'angle, comme une carte à jouer : la story a la hauteur pour eux. */
  corners: boolean
}

/**
 * La mise en page de chaque format. Story : le haut (~250 px, profil et barre
 * de progression) et le bas (~220 px, champ de réponse) sont couverts par
 * l'appli, le contenu reste entre les deux ; le ticket descend de la moitié
 * de la place libre, pour qu'une petite table ne laisse pas un trou sous
 * l'addition.
 */
export function additionLayout(format: AdditionFormat, rowCount: number, awardCount: number, hasMoment: boolean): AdditionLayout {
  const rows = Math.max(0, Math.min(rowCount, ADDITION_MAX_ROWS))
  const W = 1080
  if (format === 'feed') {
    const H = 1350
    const y = 320
    return {
      width: W,
      height: H,
      brand: { y: 108, size: 30 },
      title: { y: 218, size: 96 },
      subtitle: { y: 272, size: 32 },
      receipt: { x: 150, y, width: W - 300, height: 170 + rows * 58, firstRow: y + 70, rowHeight: 58, font: 38 },
      payer: { gap: 68, lineHeight: 44, font: 36 },
      awards: { gap: 100, lineHeight: 52, spacing: 10, font: 42 },
      moment: { gap: 30, lineHeight: 48, font: 36, maxY: H - 230 },
      footer: { y: H - 80, size: 34 },
      corners: false,
    }
  }
  const H = 1920
  const footerY = H - 240
  const crowded = rows > 6
  const rowHeight = crowded ? 56 : 74
  const receiptHeight = 194 + rows * rowHeight
  const awards = { gap: 120, lineHeight: 58, spacing: 14, font: 46 }
  const moment = { gap: 40, lineHeight: 54, font: 40, maxY: footerY - 150 }
  const top = 530
  const content =
    receiptHeight +
    awards.gap +
    Math.min(awardCount, 3) * (awards.lineHeight + awards.spacing) +
    (hasMoment ? moment.gap + 2 * moment.lineHeight : 0)
  const slack = Math.max(0, footerY - 90 - top - content)
  const y = top + Math.round(slack / 2)
  return {
    width: W,
    height: H,
    brand: { y: 290, size: 34 },
    title: { y: 412, size: 112 },
    subtitle: { y: 474, size: 36 },
    receipt: { x: 120, y, width: W - 240, height: receiptHeight, firstRow: y + 84, rowHeight, font: crowded ? 40 : 42 },
    payer: { gap: 76, lineHeight: 50, font: 40 },
    awards,
    moment,
    footer: { y: footerY, size: 38 },
    corners: true,
  }
}

export type AdditionImageInput = {
  brand: string
  title: string
  subtitle: string
  date: string
  rows: { name: string; value: string }[]
  payer: string
  awards: string[]
  moment: string | null
  footer: string
  soft: boolean
  format?: AdditionFormat
}

/** Les familles réelles des polices du site (next/font les renomme) : le canvas ne lit pas les variables CSS. */
function siteFont(variable: string, fallback: string): string {
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim()
    return value ? `${value}, ${fallback}` : fallback
  } catch {
    return fallback
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number): number {
  const words = text.split(' ')
  let line = ''
  let lines = 0
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      lines++
      if (lines >= maxLines) {
        ctx.fillText(`${line}…`, x, y)
        return y + lineHeight
      }
      ctx.fillText(line, x, y)
      line = word
      y += lineHeight
    } else {
      line = test
    }
  }
  if (line) ctx.fillText(line, x, y)
  return y + lineHeight
}

export async function drawAdditionImage(input: AdditionImageInput): Promise<{ url: string; blob: Blob }> {
  try {
    await document.fonts?.ready
  } catch {
    // Polices de repli : l'image reste lisible.
  }
  const rows = input.rows.slice(0, ADDITION_MAX_ROWS)
  const awards = input.awards.slice(0, 3)
  const L = additionLayout(input.format ?? 'feed', rows.length, awards.length, Boolean(input.moment))
  const W = L.width
  const H = L.height
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas indisponible')

  const display = siteFont('--font-display', 'Georgia, serif')
  const sans = siteFont('--font-sans', 'system-ui, sans-serif')
  const mono = '"Courier New", ui-monospace, monospace'

  const felt = input.soft ? ['#24406B', '#152238'] : ['#17533F', '#0A2C22']
  const bg = ctx.createRadialGradient(W / 2, -200, 100, W / 2, 300, H - 50)
  bg.addColorStop(0, felt[0])
  bg.addColorStop(1, felt[1])
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = 'rgba(217,164,65,0.55)'
  ctx.lineWidth = 4
  ctx.strokeRect(36, 36, W - 72, H - 72)
  if (L.corners) {
    ctx.strokeStyle = 'rgba(217,164,65,0.3)'
    ctx.lineWidth = 2
    ctx.strokeRect(52, 52, W - 104, H - 104)
    ctx.textAlign = 'center'
    ctx.font = `700 64px ${display}`
    ctx.fillStyle = 'rgba(243,234,211,0.5)'
    ctx.fillText('♠', 118, 160)
    ctx.save()
    ctx.translate(W - 118, H - 160)
    ctx.rotate(Math.PI)
    ctx.fillStyle = 'rgba(214,74,62,0.65)'
    ctx.fillText('♥', 0, 0)
    ctx.restore()
  }

  ctx.textAlign = 'center'
  ctx.fillStyle = '#D9A441'
  ctx.font = `800 ${L.brand.size}px ${sans}`
  ctx.fillText(input.brand.toLocaleUpperCase(), W / 2, L.brand.y)
  ctx.fillStyle = '#F3EAD3'
  ctx.font = `700 ${L.title.size}px ${display}`
  ctx.fillText(input.title, W / 2, L.title.y)
  ctx.font = `600 ${L.subtitle.size}px ${sans}`
  ctx.fillStyle = 'rgba(243,234,211,0.78)'
  ctx.fillText(`${input.subtitle} · ${input.date}`, W / 2, L.subtitle.y)

  const { x: px, y: py, width: pw, height: ph, firstRow, rowHeight } = L.receipt
  ctx.fillStyle = '#F7F0DE'
  ctx.fillRect(px, py, pw, ph)
  ctx.font = `400 ${L.receipt.font}px ${mono}`
  rows.forEach((row, i) => {
    const y = firstRow + i * rowHeight
    ctx.fillStyle = '#2A251C'
    ctx.textAlign = 'left'
    ctx.fillText(row.name, px + 40, y)
    ctx.textAlign = 'right'
    ctx.fillText(row.value, px + pw - 40, y)
    const from = px + 60 + ctx.measureText(row.name).width
    const to = px + pw - 60 - ctx.measureText(row.value).width
    ctx.fillStyle = 'rgba(42,37,28,0.35)'
    for (let x = from; x < to; x += 16) ctx.fillRect(x, y - 6, 5, 5)
  })
  ctx.setLineDash([14, 10])
  ctx.strokeStyle = 'rgba(42,37,28,0.4)'
  ctx.lineWidth = 3
  const ly = firstRow + rows.length * rowHeight - Math.round(rowHeight * 0.45)
  ctx.beginPath()
  ctx.moveTo(px + 40, ly)
  ctx.lineTo(px + pw - 40, ly)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.textAlign = 'center'
  ctx.fillStyle = '#2A251C'
  ctx.font = `700 ${L.payer.font}px ${mono}`
  wrap(ctx, input.payer, W / 2, ly + L.payer.gap, pw - 80, L.payer.lineHeight, 2)
  const zig = py + ph
  ctx.fillStyle = '#F7F0DE'
  ctx.beginPath()
  ctx.moveTo(px, zig)
  for (let x = px; x < px + pw; x += 24) {
    ctx.lineTo(x + 12, zig + 14)
    ctx.lineTo(x + 24, zig)
  }
  ctx.closePath()
  ctx.fill()

  let y = zig + L.awards.gap
  ctx.fillStyle = '#E7C97D'
  ctx.font = `700 ${L.awards.font}px ${display}`
  for (const award of awards) {
    y = wrap(ctx, award, W / 2, y, W - 220, L.awards.lineHeight, 1) + L.awards.spacing
  }
  if (input.moment) {
    ctx.fillStyle = 'rgba(243,234,211,0.88)'
    ctx.font = `italic 700 ${L.moment.font}px ${display}`
    // Espaces insécables autour des guillemets : le « » ne reste jamais seul en bout de ligne.
    const nbsp = String.fromCharCode(160)
    wrap(ctx, `«${nbsp}${input.moment}${nbsp}»`, W / 2, Math.min(y + L.moment.gap, L.moment.maxY), W - 220, L.moment.lineHeight, 3)
  }
  ctx.fillStyle = '#D9A441'
  ctx.font = `800 ${L.footer.size}px ${sans}`
  ctx.fillText(input.footer, W / 2, L.footer.y)

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('image vide'))), 'image/png')
  )
  return { url: URL.createObjectURL(blob), blob }
}
