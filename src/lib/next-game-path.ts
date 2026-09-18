import { GAMES, type GameMeta } from '@/lib/games'

/**
 * Paramètre `?next=` de /joueurs : le jeu que le groupe avait choisi AVANT
 * d'être envoyé constituer sa table. Sans lui, « Commencer » ramenait au hub
 * et il fallait re-toucher la carte — un aller-retour de trop pour une tablée
 * qui se passe le téléphone.
 *
 * La valeur vient de l'URL, donc de n'importe qui : on n'accepte que le chemin
 * EXACT d'un jeu publié du catalogue (src/lib/games.ts), jamais une URL
 * externe, un chemin arbitraire, une variante avec slash final ou requête.
 * Un jeu masqué (`hidden`) n'est pas une destination proposée : il retombe
 * sur le hub comme les autres refus.
 */
export function resolveNextGame(raw: string | null | undefined): GameMeta | null {
  if (!raw) return null
  return GAMES.find((game) => !game.hidden && game.path === raw) ?? null
}

/** Même garde, réduite au chemin : ce que router.push reçoit. */
export function resolveNextGamePath(raw: string | null | undefined): string | null {
  return resolveNextGame(raw)?.path ?? null
}
