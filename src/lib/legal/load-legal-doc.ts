import fs from 'fs'
import path from 'path'

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

  const fallbackPath = path.join(LEGAL_ROOT, 'fr', FILE_MAP[id])
  if (fs.existsSync(fallbackPath)) {
    return fs.readFileSync(fallbackPath, 'utf-8')
  }

  const legacyPath = path.join(LEGAL_ROOT, FILE_MAP[id])
  return fs.readFileSync(legacyPath, 'utf-8')
}
