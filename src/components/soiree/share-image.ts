"use client"

/**
 * L'image de l'addition (1080 × 1350, format portrait des groupes de
 * discussion), dessinée sur l'appareil : rien ne part au serveur.
 */
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
  const W = 1080
  const H = 1350
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas indisponible')

  const display = siteFont('--font-display', 'Georgia, serif')
  const sans = siteFont('--font-sans', 'system-ui, sans-serif')
  const mono = '"Courier New", ui-monospace, monospace'

  const felt = input.soft ? ['#24406B', '#152238'] : ['#17533F', '#0A2C22']
  const bg = ctx.createRadialGradient(W / 2, -200, 100, W / 2, 300, 1300)
  bg.addColorStop(0, felt[0])
  bg.addColorStop(1, felt[1])
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = 'rgba(217,164,65,0.55)'
  ctx.lineWidth = 4
  ctx.strokeRect(36, 36, W - 72, H - 72)

  ctx.textAlign = 'center'
  ctx.fillStyle = '#D9A441'
  ctx.font = `800 30px ${sans}`
  ctx.fillText(input.brand.toLocaleUpperCase(), W / 2, 108)
  ctx.fillStyle = '#F3EAD3'
  ctx.font = `700 96px ${display}`
  ctx.fillText(input.title, W / 2, 218)
  ctx.font = `600 32px ${sans}`
  ctx.fillStyle = 'rgba(243,234,211,0.78)'
  ctx.fillText(`${input.subtitle} · ${input.date}`, W / 2, 272)

  const px = 150
  const pw = W - 300
  const py = 320
  const rows = input.rows
  const ph = 170 + rows.length * 58
  ctx.fillStyle = '#F7F0DE'
  ctx.fillRect(px, py, pw, ph)
  ctx.font = `400 38px ${mono}`
  rows.forEach((row, i) => {
    const y = py + 70 + i * 58
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
  const ly = py + 70 + rows.length * 58 - 26
  ctx.beginPath()
  ctx.moveTo(px + 40, ly)
  ctx.lineTo(px + pw - 40, ly)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.textAlign = 'center'
  ctx.fillStyle = '#2A251C'
  ctx.font = `700 36px ${mono}`
  wrap(ctx, input.payer, W / 2, ly + 68, pw - 80, 44, 2)
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

  let y = zig + 100
  ctx.fillStyle = '#E7C97D'
  ctx.font = `700 42px ${display}`
  for (const award of input.awards) {
    y = wrap(ctx, award, W / 2, y, W - 220, 52, 1) + 10
  }
  if (input.moment) {
    ctx.fillStyle = 'rgba(243,234,211,0.88)'
    ctx.font = `italic 700 36px ${display}`
    // Espaces insécables autour des guillemets : le « » ne reste jamais seul en bout de ligne.
    const nbsp = String.fromCharCode(160)
    wrap(ctx, `«${nbsp}${input.moment}${nbsp}»`, W / 2, Math.min(y + 30, H - 230), W - 220, 48, 3)
  }
  ctx.fillStyle = '#D9A441'
  ctx.font = `800 34px ${sans}`
  ctx.fillText(input.footer, W / 2, H - 80)

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('image vide'))), 'image/png')
  )
  return { url: URL.createObjectURL(blob), blob }
}
