import { prisma } from '@/lib/prisma'
import { readFileExtraTerms } from './extra-terms-file'
import { rebuildPreparedTerms } from './prepared-terms'

let dbTermsCache: string[] = []
let cacheLoadedAt = 0
const CACHE_TTL_MS = 60_000

export function getFileExtraTermsCount(): number {
  return readFileExtraTerms().length
}

export async function refreshDbExtraTermsCache(): Promise<string[]> {
  try {
    const rows = await prisma.moderationTerm.findMany({
      select: { term: true },
      orderBy: { createdAt: 'desc' },
    })
    dbTermsCache = rows.map((row) => row.term.trim()).filter(Boolean)
    cacheLoadedAt = Date.now()
    rebuildPreparedTerms([...readFileExtraTerms(), ...dbTermsCache])
    return dbTermsCache
  } catch {
    dbTermsCache = []
    rebuildPreparedTerms(readFileExtraTerms())
    return []
  }
}

export async function ensureServerModerationTermsLoaded(): Promise<void> {
  if (Date.now() - cacheLoadedAt < CACHE_TTL_MS && cacheLoadedAt > 0) return
  await refreshDbExtraTermsCache()
}

export async function listDbModerationTerms() {
  return prisma.moderationTerm.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
}
