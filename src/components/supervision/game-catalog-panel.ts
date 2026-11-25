import type { AdminGameCatalogResponse, AdminGameCatalogRow } from '@/app/api/admin/game-catalog/route'
import type { GameDifficulty, GameDrinkLevel } from '@/lib/games'

/**
 * Lecture défensive de GET/PATCH /api/admin/game-catalog : une page d'erreur du
 * proxy ou la réponse d'un serveur plus ancien doit donner une erreur, jamais
 * un catalogue vide qui laisserait croire qu'aucun jeu n'existe.
 */

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isRank(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 1)
}

function isLevel(value: unknown): value is GameDifficulty & GameDrinkLevel {
  return value === 1 || value === 2 || value === 3
}

function parseRow(raw: unknown): AdminGameCatalogRow | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const plays = row.plays as Record<string, unknown> | null | undefined
  if (
    typeof row.id !== 'string' ||
    typeof row.hidden !== 'boolean' ||
    !isLevel(row.difficulty) ||
    !isLevel(row.defaultDifficulty) ||
    !isLevel(row.drinkLevel) ||
    !isLevel(row.defaultDrinkLevel) ||
    !plays ||
    typeof plays !== 'object' ||
    !isCount(plays.online) ||
    !isCount(plays.local) ||
    !isCount(plays.total) ||
    !isRank(row.popularLocalRank) ||
    !isRank(row.popularOnlineRank)
  ) {
    return null
  }
  return {
    id: row.id,
    hidden: row.hidden,
    difficulty: row.difficulty,
    defaultDifficulty: row.defaultDifficulty,
    drinkLevel: row.drinkLevel,
    defaultDrinkLevel: row.defaultDrinkLevel,
    plays: { online: plays.online, local: plays.local, total: plays.total },
    popularLocalRank: row.popularLocalRank,
    popularOnlineRank: row.popularOnlineRank,
  }
}

export function parseAdminGameCatalog(body: unknown): AdminGameCatalogResponse | null {
  if (!body || typeof body !== 'object') return null
  const value = body as Record<string, unknown>
  if (typeof value.canEdit !== 'boolean' || !isCount(value.retiredCount) || !Array.isArray(value.games)) return null
  const games: AdminGameCatalogRow[] = []
  for (const raw of value.games) {
    const row = parseRow(raw)
    if (!row) return null
    games.push(row)
  }
  return { canEdit: value.canEdit, retiredCount: value.retiredCount, games }
}

export function countHidden(rows: readonly AdminGameCatalogRow[]): number {
  return rows.filter((row) => row.hidden).length
}
