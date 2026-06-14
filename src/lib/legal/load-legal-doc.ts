import fs from 'fs'
import path from 'path'

const LEGAL_DIR = path.join(process.cwd(), 'docs', 'legal')

export type LegalDocId = 'cgu' | 'confidentialite' | 'mentions-legales'

const FILE_MAP: Record<LegalDocId, string> = {
  cgu: 'cgu.md',
  confidentialite: 'confidentialite.md',
  'mentions-legales': 'mentions-legales.md',
}

export function loadLegalDoc(id: LegalDocId): string {
  const filePath = path.join(LEGAL_DIR, FILE_MAP[id])
  return fs.readFileSync(filePath, 'utf-8')
}
