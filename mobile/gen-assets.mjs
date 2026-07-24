import sharp from 'sharp'
import { mkdirSync } from 'fs'

/**
 * Génère les sources d'icônes/splash (1024/2732) à partir du MÊME dessin que
 * le favicon du site (src/app/icon.tsx) : cartes en éventail sur feutre.
 * Ensuite : `npx @capacitor/assets generate --android`.
 */

const CARDS = `
  <rect x="14.5" y="6.5" width="22" height="31" rx="3.5" transform="rotate(9 25.5 22)" fill="#0A2C22" stroke="#D9A441" stroke-width="1.8"/>
  <rect x="10" y="9" width="22" height="31" rx="3.5" transform="rotate(-6 21 24.5)" fill="#F3EAD3" stroke="#D9A441" stroke-width="1.8"/>
  <g transform="rotate(-6 21 24.5)">
    <path d="M21 15.5 c3.4 4 5.6 6.1 5.6 8.9 a3.4 3.4 0 0 1 -5 3 c.3 1.7 .9 2.9 1.8 3.9 h-4.8 c.9 -1 1.5 -2.2 1.8 -3.9 a3.4 3.4 0 0 1 -5 -3 c0 -2.8 2.2 -4.9 5.6 -8.9 z" fill="#B3382E"/>
  </g>`

const FELT = `<radialGradient id="felt" cx="0.5" cy="0" r="1.2"><stop offset="0" stop-color="#0E3B2E"/><stop offset="1" stop-color="#0A2C22"/></radialGradient>`

const svgs = {
  // Icône pleine (stores / secours).
  'icon-only': `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 64 64"><defs>${FELT}</defs><rect width="64" height="64" fill="url(#felt)"/><g transform="translate(8 8)">${CARDS}</g></svg>`,
  // Adaptive : premier plan (cartes seules, zone sûre ~62 %) sur fond transparent.
  'icon-foreground': `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 64 64"><g transform="translate(17 17) scale(0.62)">${CARDS}</g></svg>`,
  // Adaptive : arrière-plan feutre seul.
  'icon-background': `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 64 64"><defs>${FELT}</defs><rect width="64" height="64" fill="url(#felt)"/></svg>`,
}

const splash = (size) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64"><defs>${FELT}</defs><rect width="64" height="64" fill="url(#felt)"/><g transform="translate(20.8 20.8) scale(0.466)">${CARDS}</g></svg>`

mkdirSync('assets', { recursive: true })
for (const [name, svg] of Object.entries(svgs)) {
  await sharp(Buffer.from(svg)).resize(1024, 1024).png().toFile(`assets/${name}.png`)
  console.log(name, 'ok')
}
await sharp(Buffer.from(splash(2732))).resize(2732, 2732).png().toFile('assets/splash.png')
await sharp(Buffer.from(splash(2732))).resize(2732, 2732).png().toFile('assets/splash-dark.png')
console.log('splash ok')
