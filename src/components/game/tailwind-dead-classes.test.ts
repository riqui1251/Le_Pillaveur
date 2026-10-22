import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Classes Tailwind qui NE GÉNÈRENT RIEN en 3.3 (version du dépôt) sur les
 * écrans de jeu. Le piège est silencieux : la classe a l'air juste en revue,
 * mais le fond d'une sélection, la bordure d'un champ ou l'atténuation d'un
 * joueur éliminé disparaissent — l'audit d'ergonomie en a relevé des dizaines.
 *
 * - opacités hors échelle (/4 /8 /12 /15 /35 /45 /55 /65 /85) sur un fond, une
 *   bordure, un anneau ou un dégradé, et `opacity-15/35/45/55/65/85` : écrire
 *   une valeur arbitraire (`bg-gold/[0.15]`) ou un cran de l'échelle ;
 * - `min-h-<n>` / `min-w-<n>` de l'échelle d'espacement et `size-<n>` (arrivés
 *   en 3.4) : écrire `min-h-[3rem]`, `h-12`, `w-11 h-11`.
 *
 * Toléré par convention du site : `border-gold/15`, filet décoratif des
 * panneaux (la bordure par défaut --border prend le relais). Les opacités de
 * TEXTE ne sont pas visées (rendu plein, sans perte d'information).
 */

const SRC = resolve(fileURLToPath(new URL('../../', import.meta.url)))
const ROOTS = [
  'app/[locale]/games',
  'components/online',
  'components/game',
  'components/petit-buveur',
  'components/hub',
  'components/feedback',
  'components/voice',
  'components/chat',
  'components/tv',
]

const DEAD_ALPHA = /\b(?:bg|border(?:-[trblxy])?|ring|ring-offset|from|via|to|divide|outline|shadow)-[a-z][a-z0-9-]*\/(?:4|8|12|15|35|45|55|65|85)(?![\d.\]])/g
const DEAD_OPACITY = /\bopacity-(?:15|35|45|55|65|85)\b/g
const DEAD_MIN = /\b(?:min-h|min-w)-(?:[1-9]\d*(?:\.5)?|px)\b|\bsize-\d+(?:\.5)?\b/g
const TOLERATED = new Set(['border-gold/15'])

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return tsxFiles(full)
    return name.endsWith('.tsx') && !name.includes('.test.') ? [full] : []
  })
}

/** Retire les commentaires : on y cite les anciennes classes pour expliquer le correctif. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

describe('classes Tailwind 3.3 sans effet sur les écrans de jeu', () => {
  const offenders: string[] = []
  for (const root of ROOTS) {
    for (const file of tsxFiles(join(SRC, root))) {
      const lines = stripComments(readFileSync(file, 'utf8')).split('\n')
      lines.forEach((line, i) => {
        const hits = [
          ...(line.match(DEAD_ALPHA) ?? []).filter((c) => !TOLERATED.has(c)),
          ...(line.match(DEAD_OPACITY) ?? []),
          ...(line.match(DEAD_MIN) ?? []),
        ]
        for (const hit of hits) offenders.push(`${relative(SRC, file)}:${i + 1} ${hit}`)
      })
    }
  }

  it('aucune classe morte', () => {
    expect(offenders).toEqual([])
  })
})
