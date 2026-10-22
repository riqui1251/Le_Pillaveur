import { cn } from '@/lib/utils'
import { getCaseMeta, CASE_FAMILY_TOKEN_RING } from '@/lib/petit-buveur/case-families'

/**
 * Jeton d'une case — partagé local + en ligne (fenêtre d'effet, carte de la
 * dernière case, historique).
 *
 * L'emoji de la case était posé sur la tuile teintée de sa famille : sur le
 * rouge à 15 % des malus, 💣 🕳️ ⚓ 🪝 tombaient vers 1,3:1 (on ne voyait que
 * la mèche de la bombe). Il est posé ici sur un centre crème, la famille
 * passant à l'anneau (vert bonus, rouge malus, bleu déplacement, or
 * interaction) : l'icône la plus sombre reste au-dessus de 10:1.
 */
export function CaseToken({
  caseType,
  size = 48,
  className,
}: {
  caseType: string
  /** Diamètre en px, anneau compris. */
  size?: number
  className?: string
}) {
  const meta = getCaseMeta(caseType)
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full bg-cream leading-none shadow-[0_2px_8px_rgba(0,0,0,0.35)]',
        size >= 36 ? 'border-[3px]' : 'border-2',
        CASE_FAMILY_TOKEN_RING[meta.family],
        className
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}
    >
      {meta.icon}
    </span>
  )
}
