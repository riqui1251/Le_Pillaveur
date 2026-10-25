import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import {
  displayNameKey,
  foldConfusables,
  foldConfusablesLower,
  hasInvisibleChars,
  mixesConfusableScripts,
} from './confusables'

describe('foldConfusables', () => {
  it('ramène pleine chasse, lettres mathématiques et petites capitales à l’ASCII', () => {
    expect(foldConfusables('ｃｏｎｎａｒｄ')).toBe('connard')
    expect(foldConfusables('𝐜𝐨𝐧𝐧𝐚𝐫𝐝')).toBe('connard')
    expect(foldConfusables('ᴄᴏɴɴᴀʀᴅ')).toBe('connard')
  })

  it('ramène les homoglyphes cyrilliques et grecs à la lettre latine', () => {
    expect(foldConfusables('cоnnаrd')).toBe('connard')
    expect(foldConfusables('Kеvin')).toBe('Kevin')
    expect(foldConfusables('Κενιη')).toBe('Kevin')
  })

  it('garde les accents, y compris d’une lettre repliée', () => {
    expect(foldConfusables('Élodie')).toBe('Élodie')
    expect(foldConfusables('Noёl')).toBe('Noël')
  })

  it('retire bidi, jointures, séparateurs invisibles et remplissages Hangul', () => {
    for (const invisible of ['​', '⁣', '᠎', '‮', '⁦', '﻿', '­', 'ㅤ', 'ᅟ', 'ᅠ', 'ﾠ']) {
      expect(foldConfusables(`con${invisible}nard`), `U+${invisible.codePointAt(0)?.toString(16)}`).toBe('connard')
    }
  })

  it('laisse intacts un texte latin et les autres alphabets', () => {
    expect(foldConfusables('Jean-Pierre, ça va ?')).toBe('Jean-Pierre, ça va ?')
    expect(foldConfusables('王小明')).toBe('王小明')
  })

  it('lit un П cyrillique comme le п qu’il devient en minuscules', () => {
    expect(foldConfusablesLower('Пaul')).toBe(foldConfusablesLower('пaul'))
  })
})

describe('displayNameKey', () => {
  it('confond casse et espaces, accents compris (LOWER() de SQLite ne le faisait pas)', () => {
    expect(displayNameKey('Élodie')).toBe('élodie')
    expect(displayNameKey('  ÉLODIE ')).toBe('élodie')
  })

  it('confond les sosies visuels d’un pseudo', () => {
    const key = displayNameKey('Kevin')
    expect(displayNameKey('Kеvin')).toBe(key)
    expect(displayNameKey('ｋｅｖｉｎ')).toBe(key)
    expect(displayNameKey('𝐊𝐞𝐯𝐢𝐧')).toBe(key)
    expect(displayNameKey('Kev​in')).toBe(key)
    expect(displayNameKey('Κενιη')).toBe(key)
  })

  it('distingue des pseudos qui ne se confondent pas', () => {
    expect(displayNameKey('Elodie')).not.toBe(displayNameKey('Élodie'))
    expect(displayNameKey('Kevin')).not.toBe(displayNameKey('Kevin2'))
  })

  it('est stable : la clé d’une clé est elle-même', () => {
    for (const name of ['Élodie', 'Kеvin', '𝐊𝐞𝐯𝐢𝐧', 'Пaul', 'Ὀδυσσεύς', 'İstanbul']) {
      expect(displayNameKey(displayNameKey(name))).toBe(displayNameKey(name))
    }
  })

  it('vaut lower(trim()) de SQLite pour tout pseudo en ASCII imprimable (remplissage de la migration)', () => {
    const printable = Array.from({ length: 0x7f - 0x20 }, (_, i) => String.fromCharCode(0x20 + i)).join('')
    const sqliteLowerTrim = (text: string) => text.replace(/^ +| +$/g, '').replace(/[A-Z]/g, (c) => c.toLowerCase())
    const samples = [printable, `  ${printable}  `, 'KEVIN  Dupont ', ' x ', '']
    for (const sample of samples) expect(displayNameKey(sample)).toBe(sqliteLowerTrim(sample))
  })
})

describe('hasInvisibleChars / mixesConfusableScripts', () => {
  it('repère les invisibles que les classes \\p{L} et \\s laissent passer', () => {
    expect(hasInvisibleChars('ㅤ')).toBe(true)
    expect(hasInvisibleChars('Kev﻿in')).toBe(true)
    expect(hasInvisibleChars('Kevin Dupont')).toBe(false)
  })

  it('repère le mélange d’alphabets confondables, pas un alphabet seul', () => {
    expect(mixesConfusableScripts('Kеvin')).toBe(true)
    expect(mixesConfusableScripts('pуte')).toBe(true)
    expect(mixesConfusableScripts('Дмитрий')).toBe(false)
    expect(mixesConfusableScripts('Κενιη')).toBe(false)
    expect(mixesConfusableScripts('Zoé 王')).toBe(false)
  })
})

// scripts/backfill-display-name-keys.mjs charge ce module avec Node, hors de
// Next : il ne doit rien importer.
const nodeStripsTypes = Boolean((process.features as { typescript?: unknown }).typescript)

describe('chargement hors de Next', () => {
  it.skipIf(!nodeStripsTypes)('se charge tel quel avec Node (script de remplissage)', () => {
    const moduleUrl = new URL('./confusables.ts', import.meta.url).href
    const output = execFileSync(
      process.execPath,
      [
        '--no-warnings',
        '--input-type=module',
        '-e',
        `import { displayNameKey } from ${JSON.stringify(moduleUrl)}; process.stdout.write(displayNameKey(' ÉLODIE '))`,
      ],
      { encoding: 'utf8' }
    )
    expect(output).toBe('élodie')
  })
})
