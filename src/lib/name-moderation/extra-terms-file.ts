import { readFileSync } from 'fs'
import { join } from 'path'
import type { ModerationLocale } from './terms'

type ExtraTermsFile = {
  all?: string[]
  fr?: string[]
  en?: string[]
  es?: string[]
  it?: string[]
}

const FILE_PATH = join(process.cwd(), 'data', 'moderation-extra-terms.json')

function parseExtraTermsFile(raw: string): ExtraTermsFile {
  try {
    return JSON.parse(raw) as ExtraTermsFile
  } catch {
    return {}
  }
}

export function readFileExtraTerms(): string[] {
  try {
    const parsed = parseExtraTermsFile(readFileSync(FILE_PATH, 'utf8'))
    const locales: ModerationLocale[] = ['fr', 'en', 'es', 'it']
    const merged = new Set<string>()

    for (const term of parsed.all ?? []) {
      if (typeof term === 'string' && term.trim()) merged.add(term.trim())
    }
    for (const locale of locales) {
      for (const term of parsed[locale] ?? []) {
        if (typeof term === 'string' && term.trim()) merged.add(term.trim())
      }
    }

    return [...merged]
  } catch {
    return []
  }
}
