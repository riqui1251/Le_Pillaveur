import { sanitizePlayerName, isValidPlayerName } from '@/lib/players'

export const MAX_VISITOR_LOCAL_PLAYER_NAMES = 30

export type BotSignals = {
  suspicious: boolean
  reasons: string[]
}

export function parseLocalPlayerNamesInput(raw: unknown): string[] | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!Array.isArray(raw)) return undefined

  const names: string[] = []
  const seen = new Set<string>()

  for (const item of raw) {
    if (typeof item !== 'string') continue
    const name = sanitizePlayerName(item)
    if (!name || !isValidPlayerName(name)) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    names.push(name)
    if (names.length >= MAX_VISITOR_LOCAL_PLAYER_NAMES) break
  }

  return names
}

export function parseStoredLocalPlayerNamesJson(json: string | null | undefined): string[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json) as unknown
    if (!Array.isArray(parsed)) return []
    return (
      parseLocalPlayerNamesInput(parsed.map((item) => (typeof item === 'string' ? item : ''))) ??
      []
    )
  } catch {
    return []
  }
}

export function extractNamesFromUserLocalPlayersJson(
  json: string | null | undefined
): string[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json) as Array<{ name?: string }>
    if (!Array.isArray(parsed)) return []
    return (
      parseLocalPlayerNamesInput(
        parsed.map((p) => (typeof p.name === 'string' ? p.name : ''))
      ) ?? []
    )
  } catch {
    return []
  }
}

const GENERIC_NAME =
  /^(joueur|player|user|test|bot|invite|invité|invit[eé]|anonymous|anonyme|guest)\s*\d*$/i

export function analyzePlayerNamesForBot(names: string[]): BotSignals {
  const reasons: string[] = []
  if (names.length === 0) {
    return { suspicious: false, reasons }
  }

  if (names.length >= 16) {
    reasons.push(`${names.length} joueurs locaux (volume élevé)`)
  }

  const genericCount = names.filter((name) => GENERIC_NAME.test(name.trim())).length
  if (genericCount >= 3) {
    reasons.push(`${genericCount} noms génériques (test, joueur…)`)
  }

  const shortCount = names.filter((name) => name.trim().length <= 2).length
  if (shortCount >= 3) {
    reasons.push(`${shortCount} noms très courts`)
  }

  const unique = new Set(names.map((name) => name.toLowerCase()))
  if (names.length >= 5 && unique.size <= 2) {
    reasons.push('Peu de variété dans les noms')
  }

  const repeatedChar = names.filter((name) => /^(.)\1{2,}$/i.test(name.replace(/\s/g, ''))).length
  if (repeatedChar >= 2) {
    reasons.push('Noms répétitifs (aaa, xxx…)')
  }

  return { suspicious: reasons.length > 0, reasons }
}
