import sharp from 'sharp'
import { mkdirSync } from 'fs'

/**
 * Génère les sources d'icônes/splash (1024/2732) à partir du MÊME dessin que
 * le favicon du site (src/app/icon.tsx) : cartes en éventail sur feutre.
 * Ensuite : `npx @capacitor/assets generate --android`.
 *
 * Écrit aussi la couche monochrome des icônes à thème (Android 13+) directement
 * dans android/app/src/main/res : @capacitor/assets ne la connaît pas. Elle est
 * branchée par mipmap-anydpi-v33/, que l'outil ne réécrit pas.
 */

const CARDS = `
  <rect x="14.5" y="6.5" width="22" height="31" rx="3.5" transform="rotate(9 25.5 22)" fill="#0A2C22" stroke="#D9A441" stroke-width="1.8"/>
  <rect x="10" y="9" width="22" height="31" rx="3.5" transform="rotate(-6 21 24.5)" fill="#F3EAD3" stroke="#D9A441" stroke-width="1.8"/>
  <g transform="rotate(-6 21 24.5)">
    <path d="M21 15.5 c3.4 4 5.6 6.1 5.6 8.9 a3.4 3.4 0 0 1 -5 3 c.3 1.7 .9 2.9 1.8 3.9 h-4.8 c.9 -1 1.5 -2.2 1.8 -3.9 a3.4 3.4 0 0 1 -5 -3 c0 -2.8 2.2 -4.9 5.6 -8.9 z" fill="#B3382E"/>
  </g>`

// Silhouette une couleur (le système n'en garde que l'alpha et la teinte lui-même) :
// carte de devant pleine, pique évidé ; carte de derrière réduite à son contour,
// effacée autour de la carte de devant pour que les deux cartes restent lisibles.
const CARDS_MONO = `
  <mask id="mono" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
    <rect x="14.5" y="6.5" width="22" height="31" rx="3.5" transform="rotate(9 25.5 22)" fill="none" stroke="#fff" stroke-width="2.4"/>
    <rect x="10" y="9" width="22" height="31" rx="3.5" transform="rotate(-6 21 24.5)" fill="#000" stroke="#000" stroke-width="3.6"/>
    <rect x="10" y="9" width="22" height="31" rx="3.5" transform="rotate(-6 21 24.5)" fill="#fff"/>
    <g transform="rotate(-6 21 24.5)">
      <path d="M21 15.5 c3.4 4 5.6 6.1 5.6 8.9 a3.4 3.4 0 0 1 -5 3 c.3 1.7 .9 2.9 1.8 3.9 h-4.8 c.9 -1 1.5 -2.2 1.8 -3.9 a3.4 3.4 0 0 1 -5 -3 c0 -2.8 2.2 -4.9 5.6 -8.9 z" fill="#000"/>
    </g>
  </mask>
  <rect width="64" height="64" fill="#fff" mask="url(#mono)"/>`

const FELT = `<radialGradient id="felt" cx="0.5" cy="0" r="1.2"><stop offset="0" stop-color="#0E3B2E"/><stop offset="1" stop-color="#0A2C22"/></radialGradient>`

// Couches adaptatives : le XML (mipmap-anydpi-v26/v33) ajoute déjà un inset de 16,7 %,
// la couche remplit donc exactement la zone visible (72dp). On n'y réduit plus les cartes
// (l'ancien scale 0.62 s'ajoutait à l'inset : logo minuscule dans le tiroir). À l'échelle 1,
// même composition que l'icône pleine ; le point le plus éloigné du dessin reste à ~72 %
// du rayon de la zone sûre (cercle de 66dp). Translation = centre de la couche (32) moins
// le centre mesuré du dessin (23.54, 23.09 dans le repère 64).
const ADAPTIVE = 'translate(8.46 8.91) scale(1)'

const svgs = {
  // Icône pleine (stores / secours).
  'icon-only': `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 64 64"><defs>${FELT}</defs><rect width="64" height="64" fill="url(#felt)"/><g transform="translate(8 8)">${CARDS}</g></svg>`,
  // Adaptive : premier plan (cartes seules) sur fond transparent.
  'icon-foreground': `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 64 64"><g transform="${ADAPTIVE}">${CARDS}</g></svg>`,
  // Adaptive : arrière-plan feutre seul.
  'icon-background': `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 64 64"><defs>${FELT}</defs><rect width="64" height="64" fill="url(#felt)"/></svg>`,
  // Adaptive : couche monochrome (icônes à thème), même cadrage que le premier plan.
  'icon-monochrome': `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 64 64"><g transform="${ADAPTIVE}">${CARDS_MONO}</g></svg>`,
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

// Monochrome par densité, à la taille de la zone visible (72dp) où l'inset la place :
// affichée sans agrandissement, donc nette.
const DENSITES = { ldpi: 0.75, mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
for (const [densite, facteur] of Object.entries(DENSITES)) {
  const cote = Math.round(72 * facteur)
  const dossier = `android/app/src/main/res/mipmap-${densite}`
  mkdirSync(dossier, { recursive: true })
  await sharp(Buffer.from(svgs['icon-monochrome'])).resize(cote, cote).png().toFile(`${dossier}/ic_launcher_monochrome.png`)
}
console.log('monochrome ok')
