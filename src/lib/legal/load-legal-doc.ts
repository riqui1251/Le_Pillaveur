import fs from 'fs'
import path from 'path'

/**
 * Documents légaux : un markdown par langue sous docs/legal/<langue>/, le
 * français faisant foi quand une langue manque. Les copies « legacy » à la
 * racine de docs/legal/ (identiques octet pour octet à celles de fr/) et le
 * repli qui les lisait ont été retirés : deux sources pour un même texte
 * juridique, c'est une divergence qui attend son heure.
 */

const LEGAL_ROOT = path.join(process.cwd(), 'docs', 'legal')

export type LegalDocId = 'cgu' | 'confidentialite' | 'mentions-legales'

const FILE_MAP: Record<LegalDocId, string> = {
  cgu: 'cgu.md',
  confidentialite: 'confidentialite.md',
  'mentions-legales': 'mentions-legales.md',
}

const SUPPORTED_LOCALES = new Set(['fr', 'en', 'es', 'it'])

export function loadLegalDoc(id: LegalDocId, locale = 'fr'): string {
  const normalizedLocale = SUPPORTED_LOCALES.has(locale) ? locale : 'fr'
  const localizedPath = path.join(LEGAL_ROOT, normalizedLocale, FILE_MAP[id])

  if (fs.existsSync(localizedPath)) {
    return fs.readFileSync(localizedPath, 'utf-8')
  }

  return fs.readFileSync(path.join(LEGAL_ROOT, 'fr', FILE_MAP[id]), 'utf-8')
}
