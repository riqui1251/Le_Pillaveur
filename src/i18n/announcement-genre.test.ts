import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
// Le moteur ICU de next-intl (next-intl → use-intl → intl-messageformat) : ce
// qui se rend ici se rend pareil à l'écran.
import { IntlMessageFormat } from 'intl-messageformat'
import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser'
import fr from '../../messages/fr.json'
import en from '../../messages/en.json'
import es from '../../messages/es.json'
import it_ from '../../messages/it.json'

/**
 * ANNONCES ACCORDÉES AU GENRE DU JOUEUR NOMMÉ — « Bernadette est éliminée »,
 * pas « éliminé ». Chaque texte dont un bot peut être le sujet porte un
 * `{genre, select, f {…} m {…} other {…}}` : f/m pour un bot (genre de son
 * persona), other — tournure épicène — pour un humain ou un converti.
 *
 * Trois filets : chaque clé se rend proprement dans les 4 langues pour les 3
 * genres ; l'accord existe vraiment là où la langue l'exige (sinon le select
 * ne sert à rien) ; chaque site d'appel passe `genre` — next-intl affiche la
 * clé brute quand un argument de select manque, et rien ne le typerait.
 */

const MESSAGES: Record<string, unknown> = { fr, en, es, it: it_ }
const LOCALES = Object.keys(MESSAGES)
const GENRES = ['f', 'm', 'other'] as const

type Announcement = {
  ns: string
  key: string
  /** Langues où la forme féminine diffère de la masculine. */
  agrees: string[]
}

const IMP = 'games.imposteur.game'
const LG = 'games.loup-garou.game'
const PRE = 'games.president.game'
const ESP = 'games.espion.game'
const MEN = 'games.menteur.game'
const TAB = 'games.tabou.game'

const ANNOUNCEMENTS: Announcement[] = [
  { ns: IMP, key: 'reveal.outTitle', agrees: ['fr', 'es', 'it'] },
  { ns: IMP, key: 'reveal.outWord', agrees: ['en'] },
  { ns: IMP, key: 'reveal.wasImposteur', agrees: ['en', 'es', 'it'] },
  { ns: IMP, key: 'reveal.wasCivil', agrees: ['fr', 'en'] },
  { ns: IMP, key: 'victory.teamCivil', agrees: ['fr'] },
  { ns: IMP, key: 'victory.teamImposteur', agrees: ['es', 'it'] },
  { ns: LG, key: 'mayorBanner', agrees: ['fr', 'en', 'es', 'it'] },
  { ns: LG, key: 'mayorBadge', agrees: ['en', 'es', 'it'] },
  { ns: LG, key: 'dawnDeath', agrees: ['fr', 'en', 'it'] },
  { ns: LG, key: 'dawnDeathSoft', agrees: ['fr', 'en', 'it'] },
  { ns: LG, key: 'voteBanner', agrees: ['fr', 'en', 'es', 'it'] },
  { ns: LG, key: 'ravenMarkBanner', agrees: ['fr', 'en', 'it'] },
  { ns: LG, key: 'ravenMarkBadge', agrees: ['fr', 'es', 'it'] },
  { ns: LG, key: 'guardForbidden', agrees: ['fr', 'es', 'it'] },
  { ns: LG, key: 'hunterWaiting', agrees: ['en'] },
  { ns: PRE, key: 'finished.subtitle', agrees: ['fr', 'es'] },
  { ns: PRE, key: 'roles.president', agrees: ['fr', 'es'] },
  { ns: PRE, key: 'roles.vicePresident', agrees: ['fr', 'es'] },
  { ns: ESP, key: 'reveal.outcome.spyCaught', agrees: ['fr', 'es', 'it'] },
  { ns: MEN, key: 'eliminated', agrees: ['fr', 'es', 'it'] },
  { ns: MEN, key: 'reveal.eliminatedMsg', agrees: ['fr', 'es', 'it'] },
  { ns: MEN, key: 'reveal.eliminatedMsgSoft', agrees: ['fr', 'es', 'it'] },
  // L'italien « segnalala » vise la parole interdite, pas le joueur : rien à accorder.
  { ns: TAB, key: 'opponentHint', agrees: ['fr', 'es'] },
]

/** Les écrans téléphone et TV des six jeux, seuls à afficher ces clés. */
const CALL_SITES = [
  'src/components/online/ImposteurOnline.tsx',
  'src/components/tv/TvImposteur.tsx',
  'src/components/online/LoupGarouOnline.tsx',
  'src/components/tv/TvLoupGarou.tsx',
  'src/components/online/PresidentOnline.tsx',
  'src/components/tv/TvPresident.tsx',
  'src/components/online/EspionOnline.tsx',
  'src/components/tv/TvEspion.tsx',
  'src/components/online/MenteurOnline.tsx',
  'src/components/tv/TvMenteur.tsx',
  'src/components/online/TabouOnline.tsx',
  'src/components/tv/TvTabou.tsx',
]

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const VALUES = { name: 'Bernadette', role: 'Voyante', word: 'pomme' }

/** Le texte d'une clé ; le chemin se lit segment par segment (`loup-garou` reste entier). */
function messageOf(locale: string, { ns, key }: Announcement): string {
  let cursor: unknown = MESSAGES[locale]
  for (const segment of [...ns.split('.'), ...key.split('.')]) {
    cursor = (cursor as Record<string, unknown> | undefined)?.[segment]
  }
  if (typeof cursor !== 'string') throw new Error(`${locale}:${ns}.${key} absent`)
  return cursor
}

function genreSelects(elements: MessageFormatElement[]): string[][] {
  const found: string[][] = []
  for (const element of elements) {
    if (element.type === TYPE.select) {
      if (element.value === 'genre') found.push(Object.keys(element.options).sort())
      for (const option of Object.values(element.options)) found.push(...genreSelects(option.value))
    }
    if (element.type === TYPE.plural) {
      for (const option of Object.values(element.options)) found.push(...genreSelects(option.value))
    }
  }
  return found
}

const render = (locale: string, a: Announcement, genre: string) =>
  String(new IntlMessageFormat(messageOf(locale, a), locale).format({ ...VALUES, genre }))

describe('annonces accordées au genre du joueur nommé', () => {
  it('chaque clé porte un seul select `genre` à trois branches f, m, other, dans les 4 langues', () => {
    for (const locale of LOCALES) {
      for (const a of ANNOUNCEMENTS) {
        expect(genreSelects(parse(messageOf(locale, a))), `${locale}:${a.key}`).toEqual([['f', 'm', 'other']])
      }
    }
  })

  it('se rend pour f, m et other : arguments substitués, aucune accolade, ni point médian ni « (e) »', () => {
    for (const locale of LOCALES) {
      for (const a of ANNOUNCEMENTS) {
        const template = messageOf(locale, a)
        for (const genre of GENRES) {
          const line = render(locale, a, genre)
          const label = `${locale}:${a.key}:${genre} → ${line}`
          expect(line, label).not.toMatch(/[{}]/)
          expect(line, label).not.toMatch(/·|\(\p{L}{1,4}\)/u)
          for (const [arg, value] of Object.entries(VALUES)) {
            if (template.includes(`{${arg}}`)) expect(line, label).toContain(value)
          }
        }
      }
    }
  })

  it('l’apostrophe typographique seule : une ASCII avalerait un {name} qui la suit', () => {
    for (const locale of LOCALES) {
      for (const a of ANNOUNCEMENTS) expect(messageOf(locale, a), `${locale}:${a.key}`).not.toContain("'")
    }
  })

  it('le féminin diffère du masculin là où la langue accorde', () => {
    for (const a of ANNOUNCEMENTS) {
      for (const locale of a.agrees) {
        expect(render(locale, a, 'f'), `${locale}:${a.key}`).not.toBe(render(locale, a, 'm'))
      }
    }
  })

  it('en français, la bannière d’élimination vue à l’écran s’accorde', () => {
    const outTitle = ANNOUNCEMENTS[0]
    expect(render('fr', outTitle, 'f')).toBe('Bernadette est éliminée !')
    expect(render('fr', outTitle, 'm')).toBe('Bernadette est éliminé !')
    expect(render('fr', outTitle, 'other')).toBe('Bernadette est hors jeu !')
  })

  it('en français, la sortie du Menteur et l’indice du Tabou s’accordent', () => {
    const find = (ns: string, key: string) => ANNOUNCEMENTS.find((a) => a.ns === ns && a.key === key)!
    const out = find(MEN, 'reveal.eliminatedMsg')
    expect(render('fr', out, 'f')).toBe('💀 Bernadette n’a plus de dés — cul sec, éliminée !')
    expect(render('fr', out, 'm')).toBe('💀 Bernadette n’a plus de dés — cul sec, éliminé !')
    expect(render('fr', out, 'other')).toBe('💀 Bernadette n’a plus de dés — cul sec, hors jeu !')
    const outSoft = find(MEN, 'reveal.eliminatedMsgSoft')
    expect(render('fr', outSoft, 'f')).toBe('💀 Bernadette n’a plus de dés — éliminée !')
    expect(render('fr', outSoft, 'm')).toBe('💀 Bernadette n’a plus de dés — éliminé !')
    expect(render('fr', outSoft, 'other')).toBe('💀 Bernadette n’a plus de dés — hors jeu !')
    const hint = find(TAB, 'opponentHint')
    expect(render('fr', hint, 'f')).toBe('Écoute bien : si Bernadette prononce un mot interdit, dénonce-la !')
    expect(render('fr', hint, 'm')).toBe('Écoute bien : si Bernadette prononce un mot interdit, dénonce-le !')
    expect(render('fr', hint, 'other')).toBe('Écoute bien : si Bernadette prononce un mot interdit, crie au tabou !')
  })

  it('chaque site d’appel des téléphones et de la TV passe `genre`', () => {
    const sources = CALL_SITES.map((path) => [path, readFileSync(`${ROOT}${path}`, 'utf8')] as const)
    for (const a of ANNOUNCEMENTS) {
      let calls = 0
      for (const [path, source] of sources) {
        for (const call of translatorCalls(source, a.key)) {
          calls += 1
          expect(call, `${path} : ${a.key}`).toMatch(/\bgenre\b/)
        }
      }
      expect(calls, `${a.key} : aucun site d’appel trouvé`).toBeGreaterThan(0)
    }
  })
})

/**
 * Les appels `t(…)` qui citent la clé, parenthèses équilibrées — y compris
 * `t(isSoft ? 'dawnDeathSoft' : 'dawnDeath', {…})`, où la clé n'ouvre pas l'appel.
 */
function translatorCalls(source: string, key: string): string[] {
  const calls: string[] = []
  const needle = `'${key}'`
  for (let at = source.indexOf(needle); at !== -1; at = source.indexOf(needle, at + needle.length)) {
    const start = source.lastIndexOf('t(', at)
    let depth = 0
    for (let i = start + 1; i < source.length; i += 1) {
      if (source[i] === '(') depth += 1
      else if (source[i] === ')' && --depth === 0) {
        calls.push(source.slice(start, i + 1))
        break
      }
    }
  }
  return calls
}
