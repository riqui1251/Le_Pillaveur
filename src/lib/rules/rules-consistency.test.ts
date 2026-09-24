import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { getGameById } from '@/lib/games'
import { RULES_GAME_IDS, RULES_META } from './rules-content'

/**
 * Cohérence des articles de règles (docs/rules/fr/) avec le registre des jeux.
 *
 * Les articles sont écrits à la main ; le registre (src/lib/games.ts) est ce
 * que le lobby applique vraiment. Cinq d'entre eux annonçaient un effectif
 * périmé (« Purple, 2 à 10 joueurs » pour une table qui en accepte 16) :
 * personne ne relit dix-sept pages à chaque réglage d'un moteur. Ce test
 * tient donc l'intro de chaque article — la phrase « X à Y joueurs » — égale
 * aux bornes EN LIGNE du registre, et pareil pour les descriptions SEO de
 * RULES_META qui répètent l'effectif.
 *
 * Il garde aussi la forme éditoriale que les pages promettent : une FAQ de
 * quatre à six questions par article (ce que Google cite en « autres
 * questions »), une section « Variantes et effectifs » là où le nombre de
 * joueurs change vraiment le jeu, et un fichier par page — ni page sans
 * article, ni article orphelin (sauf celui d'un jeu masqué, retiré avec lui).
 */

const RULES_DIR = resolve(fileURLToPath(new URL('../../../docs/rules/fr/', import.meta.url)))

/** Articles où l'effectif change la composition ou le rythme : la section est due. */
const VARIANTES_ATTENDUES = ['loup-garou', 'imposteur', 'mots-codes', 'tabou', 'president', 'sans-filtre'] as const

const FAQ_HEADING = '## Questions fréquentes'
const VARIANTES_HEADING = '## Variantes et effectifs'
const FAQ_MIN = 4
const FAQ_MAX = 6

/** « X à Y joueurs », espace insécable admise (typographie française). */
const PLAYERS_RANGE = /(\d+)[\s\u00a0]à[\s\u00a0](\d+)[\s\u00a0]joueurs/g

/**
 * Fins de ligne ramenées à LF : le dépôt normalise le texte (`* text=auto`),
 * et un checkout Windows (`core.autocrlf=true`) écrit les articles en CRLF —
 * `section()` ne trouverait plus son titre suivi d'un saut de ligne, et le
 * test bloquerait le déploiement pour une fin de ligne.
 */
function readDoc(id: string): string {
  return readFileSync(join(RULES_DIR, `${id}.md`), 'utf8').replace(/\r\n?/g, '\n')
}

/** Le chapeau : tout ce qui précède la première section « ## ». */
function intro(markdown: string): string {
  const firstSection = markdown.search(/^## /m)
  return firstSection === -1 ? markdown : markdown.slice(0, firstSection)
}

/** Le corps d'une section « ## titre », jusqu'à la section suivante ou la fin. */
function section(markdown: string, heading: string): string | null {
  const start = markdown.indexOf(`${heading}\n`)
  if (start === -1) return null
  const body = markdown.slice(start + heading.length)
  const next = body.search(/^## /m)
  return next === -1 ? body : body.slice(0, next)
}

function ranges(text: string): string[] {
  return [...text.matchAll(PLAYERS_RANGE)].map((m) => `${m[1]} à ${m[2]}`)
}

const docFiles = readdirSync(RULES_DIR)
  .filter((name) => name.endsWith('.md'))
  .map((name) => name.slice(0, -'.md'.length))
  .sort()

describe('pages de règles et fichiers docs/rules/fr', () => {
  it('chaque page de règles a son article', () => {
    const manquants = RULES_GAME_IDS.filter((id) => !existsSync(join(RULES_DIR, `${id}.md`)))
    expect(manquants, 'ids de RULES_GAME_IDS sans fichier .md').toEqual([])
  })

  it('chaque article a sa page — sauf celui d’un jeu masqué, retiré du catalogue avec lui', () => {
    const orphelins = docFiles
      .filter((id) => !(RULES_GAME_IDS as readonly string[]).includes(id))
      .filter((id) => !getGameById(id)?.hidden)
    expect(orphelins, 'articles sans page /regles/<id> alors que le jeu est visible').toEqual([])
  })

  it('ne vise que des jeux du registre, visibles et jouables en ligne', () => {
    for (const id of RULES_GAME_IDS) {
      const game = getGameById(id)
      expect(game, `${id} absent du registre`).toBeDefined()
      expect(game?.hidden, `${id} est masqué du hub : sa page règles doit partir avec lui`).toBeFalsy()
      expect(game?.onlineReady, `${id} n'a pas de version en ligne`).toBe(true)
      expect(game?.minPlayers, `${id} sans minPlayers au registre`).toBeTypeOf('number')
      expect(game?.maxPlayers, `${id} sans maxPlayers au registre`).toBeTypeOf('number')
    }
  })
})

describe('effectif annoncé = bornes en ligne du registre', () => {
  for (const id of docFiles) {
    it(`${id}.md`, () => {
      const game = getGameById(id)
      expect(game?.minPlayers && game?.maxPlayers, `${id} : bornes absentes du registre`).toBeTruthy()
      const attendu = `${game!.minPlayers} à ${game!.maxPlayers}`
      const trouves = ranges(intro(readDoc(id)))
      expect(trouves.length, `${id}.md : aucun « X à Y joueurs » dans le chapeau`).toBeGreaterThan(0)
      for (const range of trouves) {
        expect(range, `${id}.md annonce « ${range} joueurs », le registre dit « ${attendu} »`).toBe(attendu)
      }
    })
  }

  it('les descriptions SEO de RULES_META ne contredisent pas le registre', () => {
    const ecarts: string[] = []
    for (const id of RULES_GAME_IDS) {
      const game = getGameById(id)!
      const attendu = `${game.minPlayers} à ${game.maxPlayers}`
      for (const range of ranges(RULES_META[id].description)) {
        if (range !== attendu) ecarts.push(`${id} : « ${range} » (registre : « ${attendu} »)`)
      }
    }
    expect(ecarts).toEqual([])
  })
})

describe('forme éditoriale des articles', () => {
  for (const id of docFiles) {
    it(`${id}.md : une FAQ de ${FAQ_MIN} à ${FAQ_MAX} questions`, () => {
      const faq = section(readDoc(id), FAQ_HEADING)
      expect(faq, `${id}.md : section « ${FAQ_HEADING} » absente`).not.toBeNull()
      const questions = faq!.match(/^### .+\?\s*$/gm) ?? []
      expect(
        questions.length,
        `${id}.md : ${questions.length} question(s) en « ### … ? » dans la FAQ`
      ).toBeGreaterThanOrEqual(FAQ_MIN)
      expect(questions.length, `${id}.md : FAQ trop longue`).toBeLessThanOrEqual(FAQ_MAX)
    })
  }

  for (const id of VARIANTES_ATTENDUES) {
    it(`${id}.md : une section « Variantes et effectifs »`, () => {
      expect(docFiles, `${id}.md introuvable`).toContain(id)
      const variantes = section(readDoc(id), VARIANTES_HEADING)
      expect(variantes, `${id}.md : section « ${VARIANTES_HEADING} » absente`).not.toBeNull()
      expect(variantes!.trim().length, `${id}.md : section « ${VARIANTES_HEADING} » vide`).toBeGreaterThan(0)
    })
  }

  it('chaque article commence par un titre « Règles … »', () => {
    for (const id of docFiles) {
      expect(readDoc(id).startsWith('# Règles'), `${id}.md : premier titre inattendu`).toBe(true)
    }
  })
})
