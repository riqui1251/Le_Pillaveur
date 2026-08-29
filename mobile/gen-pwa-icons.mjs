import sharp from 'sharp'
import { mkdirSync } from 'fs'

/**
 * Icônes PWA du SITE (public/icons/icon-*.png) — même dessin que le favicon
 * et l'app Capacitor : cartes en éventail sur feutre. Déclarées « any
 * maskable » dans public/manifest.json : le motif est centré à ~62 % pour
 * rester dans la zone sûre des masques Android.
 * Usage : node gen-pwa-icons.mjs (depuis mobile/, sharp y est installé).
 */

const CARDS = `
  <rect x="14.5" y="6.5" width="22" height="31" rx="3.5" transform="rotate(9 25.5 22)" fill="#0A2C22" stroke="#D9A441" stroke-width="1.8"/>
  <rect x="10" y="9" width="22" height="31" rx="3.5" transform="rotate(-6 21 24.5)" fill="#F3EAD3" stroke="#D9A441" stroke-width="1.8"/>
  <g transform="rotate(-6 21 24.5)">
    <path d="M21 15.5 c3.4 4 5.6 6.1 5.6 8.9 a3.4 3.4 0 0 1 -5 3 c.3 1.7 .9 2.9 1.8 3.9 h-4.8 c.9 -1 1.5 -2.2 1.8 -3.9 a3.4 3.4 0 0 1 -5 -3 c0 -2.8 2.2 -4.9 5.6 -8.9 z" fill="#B3382E"/>
  </g>`

const FELT = `<radialGradient id="felt" cx="0.5" cy="0" r="1.2"><stop offset="0" stop-color="#0E3B2E"/><stop offset="1" stop-color="#0A2C22"/></radialGradient>`

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 64 64"><defs>${FELT}</defs><rect width="64" height="64" fill="url(#felt)"/><g transform="translate(17.3 17.3) scale(0.62)">${CARDS}</g></svg>`

const SIZES = [72, 96, 128, 144, 152, 192, 384, 512]
const OUT = '../public/icons'
mkdirSync(OUT, { recursive: true })
for (const size of SIZES) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(`${OUT}/icon-${size}x${size}.png`)
  console.log(`icon-${size}x${size}.png ok`)
}
