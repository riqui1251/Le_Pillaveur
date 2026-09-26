import { readdirSync, readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

// Les scripts d'exploitation (scripts/*.sh) passent de longs blocs à
// `sh -c '…'` / `bash -c '…'`, entre apostrophes, avec des commentaires en
// français dedans. Une seule apostrophe dans ce texte (« d'écriture ») referme
// le bloc en plein milieu : la suite s'exécute alors sur l'HÔTE au lieu du
// conteneur, et `bash -n` ne voit rien, les apostrophes restant appariées plus
// loin dans le fichier. Vécu le 25/09/2026 : vps-secure-max.sh mourait sur
// « ls: cannot access '/data/' ». La règle vérifiée ici : un bloc ouvert en fin
// de ligne se referme sur une ligne qui COMMENCE par l'apostrophe fermante.
const SCRIPTS_DIR = path.join(process.cwd(), 'scripts')
const OPENER = /\b(?:sh|bash) -c '[ \t]*$/gm

function earlyClosedBlocks(source: string): string[] {
  const problems: string[] = []
  for (const match of source.matchAll(OPENER)) {
    const blockStart = (match.index ?? 0) + match[0].length
    const closing = source.indexOf("'", blockStart)
    const lineStart = source.lastIndexOf('\n', closing) + 1
    if (closing === -1 || source.slice(lineStart, closing).trim() !== '') {
      const line = source.slice(0, Math.max(closing, 0)).split('\n').length
      const text = source.slice(lineStart, source.indexOf('\n', closing)).trim()
      problems.push(`ligne ${line} : ${text}`)
    }
  }
  return problems
}

describe('scripts shell : blocs entre apostrophes', () => {
  const scripts = readdirSync(SCRIPTS_DIR).filter((f) => f.endsWith('.sh'))

  it('trouve bien des scripts à vérifier', () => {
    expect(scripts.length).toBeGreaterThan(5)
  })

  it.each(scripts)('%s : aucun bloc refermé par une apostrophe du texte', (file) => {
    const source = readFileSync(path.join(SCRIPTS_DIR, file), 'utf8').replace(/\r\n/g, '\n')
    expect(earlyClosedBlocks(source)).toEqual([])
  })

  it('repère le piège (garde du test lui-même)', () => {
    const broken = "docker run alpine sh -c '\n  # le seul bit d'écriture\n  ls /data\n'\n"
    const fixed = "docker run alpine sh -c '\n  # le seul droit en écriture\n  ls /data\n'\n"
    expect(earlyClosedBlocks(broken)).toHaveLength(1)
    expect(earlyClosedBlocks(fixed)).toEqual([])
  })
})
