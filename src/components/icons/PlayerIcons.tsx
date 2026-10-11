import { BOT_PORTRAITS } from '@/lib/online/bot-portrait-defs'
import { PLAYER_ICON_SERIES } from '@/lib/online/player-icon-defs'

/**
 * Icône SVG joueur EN LIGNE — un tracé complet par id (pas de `currentColor`,
 * palette fixe : l'avatar garde ses couleurs sur feutre comme sur crème).
 * Contenu injecté via `dangerouslySetInnerHTML` : le markup vient de
 * catalogues statiques versionnés (player-icon-defs.ts, bot-portrait-defs.ts),
 * jamais d'une saisie utilisateur — équivalent d'un composant par icône sans
 * la verbosité de 118 composants React distincts.
 *
 * Les portraits de bots ne sont fusionnés QU'ICI, pour le rendu : ils
 * restent hors de PLAYER_ICON_SERIES et donc hors cosmétiques (ni
 * déblocables, ni acceptés comme icône de compte).
 */

const ALL_ICONS = [...PLAYER_ICON_SERIES.flatMap((series) => series.icons), ...BOT_PORTRAITS]
const ICON_SVG = new Map(ALL_ICONS.map((icon) => [icon.id, icon.svg]))
const ICON_LABEL = new Map(ALL_ICONS.map((icon) => [icon.id, icon.label]))

export function playerIconLabel(id: string): string | undefined {
  return ICON_LABEL.get(id)
}

export function PlayerIconById({ id, className }: { id?: string | null; className?: string }) {
  const svg = (id && ICON_SVG.get(id)) ?? ICON_SVG.get('chope')!
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

/**
 * Glyphe joueur générique pour les écrans de jeu/TV : `value` peut être soit
 * un id de cosmétique ou de portrait de bot connu (→ icône SVG), soit un
 * emoji brut (converti 🤖, silhouette 👤…) affiché tel quel — un seul point
 * d'entrée pour remplacer
 * les anciens `{iconOf(p)}` textuels sans distinguer les deux cas au site
 * d'appel. Taille en `1em` : hérite du `font-size`/`text-*` du conteneur
 * existant (remplace un glyphe emoji en place, mêmes classes de taille).
 */
export function PlayerAvatarGlyph({ value, className }: { value?: string | null; className?: string }) {
  if (!value) return null
  if (ICON_SVG.has(value)) {
    return (
      <PlayerIconById
        id={value}
        className={className ?? 'inline-block h-[1em] w-[1em] shrink-0 align-[-0.15em]'}
      />
    )
  }
  return <>{value}</>
}
