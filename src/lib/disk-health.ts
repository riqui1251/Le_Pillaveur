import { statfs as fsStatfs } from 'node:fs/promises'
import path from 'node:path'

/**
 * ESPACE DISQUE vu par /api/health — la partie PURE (calcul, seuil, choix du
 * répertoire) est ici et testée ; la mesure elle-même passe par `fs.statfs`,
 * injectable pour les tests.
 *
 * Pourquoi dans la sonde de santé : le VPS était à 79 % le 21/09/2026 et rien
 * ne le mesurait. Un disque plein casse d'abord la sauvegarde de 03:00 (gzip
 * tronqué) puis SQLite (écritures refusées), et la base répond encore aux
 * lectures : la sonde restait verte pendant que tout échouait. En rendant
 * `ok: false` sous 5 % libre, la sonde externe par mot-clé `"ok":true`
 * attrape aussi ce cas, sans nouvel outil ni nouvelle route.
 */

/**
 * Sous ce pourcentage d'espace LIBRE, la sonde rend 503. 5 % et non 10 : sur
 * le disque de 77 Go du VPS c'est encore ~4 Go, de quoi tenir une nuit de
 * sauvegardes ; plus haut, le seuil se déclencherait sur le cache de build
 * docker (que prod-deploy.sh purge) et ferait crier la sonde pour rien. La
 * veille disque du cron (scripts/vps-disk-watch.sh), elle, prévient à 80 %
 * d'occupation : ici c'est le dernier filet, pas le premier.
 */
export const DISK_FREE_MIN_PCT = 5

/** Ce que la sonde expose : un pourcentage, jamais un chemin ni une taille. */
export type DiskHealth = { freePct: number }

/** Les deux compteurs de `fs.statfs` utilisés (nombres ou bigint, selon l'option). */
export type DiskCounts = { blocks: number | bigint; bavail: number | bigint }

/**
 * Pourcentage d'espace libre DISPONIBLE (bavail : ce qu'un processus non
 * privilégié peut encore écrire — l'application tourne en 1001, la réserve
 * root de 5 % ne lui sert à rien), arrondi VERS LE BAS : afficher 5 % quand
 * il reste 4,9 % ferait passer le seuil. Null si les compteurs n'ont pas de
 * sens (système de fichiers qui répond 0 bloc) : mieux vaut « pas de
 * mesure » qu'un faux 100 %.
 */
export function computeFreePct({ blocks, bavail }: DiskCounts): number | null {
  const total = Number(blocks)
  const avail = Number(bavail)
  if (!Number.isFinite(total) || !Number.isFinite(avail) || total <= 0 || avail < 0) return null
  return Math.min(100, Math.floor((avail / total) * 100))
}

/** Strictement sous le seuil : à 5 % pile, la sonde reste verte. */
export function isDiskCritical(freePct: number, minPct: number = DISK_FREE_MIN_PCT): boolean {
  return freePct < minPct
}

/**
 * Répertoires où mesurer, dans l'ordre : celui de la base (c'est le volume
 * docker qui compte, pas la couche image), puis le répertoire courant en
 * repli. En production les deux sont sur le même disque ; ailleurs, le repli
 * évite de rendre `disk: null` parce qu'une URL relative n'a pas été résolue
 * comme Prisma le fait (par rapport au fichier schema.prisma, pas au cwd).
 */
export function diskProbeDirs(databaseUrl: string | undefined, cwd: string): string[] {
  const dirs: string[] = []
  const file = sqliteFilePath(databaseUrl)
  if (file) dirs.push(path.dirname(path.resolve(cwd, file)))
  const cwdResolved = path.resolve(cwd)
  if (!dirs.includes(cwdResolved)) dirs.push(cwdResolved)
  return dirs
}

/**
 * Chemin porté par une URL `file:…` de Prisma, sans ses paramètres
 * (src/lib/prisma.ts ajoute `?connection_limit=1&…`) ; null pour tout autre
 * schéma ou une URL vide.
 */
function sqliteFilePath(url: string | undefined): string | null {
  if (!url || !url.startsWith('file:')) return null
  const withoutScheme = url.slice('file:'.length)
  const query = withoutScheme.indexOf('?')
  const file = (query === -1 ? withoutScheme : withoutScheme.slice(0, query)).trim()
  return file || null
}

/**
 * Mesure sur le premier répertoire qui répond. `fs.statfs` peut manquer
 * (système de fichiers exotique, chemin absent) : on essaie le suivant, et
 * null si aucun ne répond — la sonde dit alors `disk: null` sans changer
 * `ok`, plutôt que de déclarer le site malade pour une mesure qu'on n'a pas.
 */
export async function measureDiskHealth(
  dirs: readonly string[],
  statfs: (dir: string) => Promise<DiskCounts> = fsStatfs
): Promise<DiskHealth | null> {
  for (const dir of dirs) {
    try {
      const freePct = computeFreePct(await statfs(dir))
      if (freePct !== null) return { freePct }
    } catch {
      // Chemin absent ou statfs non pris en charge : on passe au repli.
    }
  }
  return null
}
