/**
 * Taille du mot d'une tuile de Mots codés, selon sa longueur.
 *
 * À 375 px, une tuile mesure ~67 px de large, ~57 px utiles : « CHAT » tient
 * en 16 px, « ORDINATEUR » non (les banques montent à 12 lettres,
 * « interruttore »). Tout était figé à 11 px ; on grandit les mots courts, sans
 * jamais descendre sous 12 px, le plancher d'une information de jeu. Au-delà
 * de 7 lettres, la césure (hyphens) coupe le mot sur deux lignes.
 *
 * `roomy` : la grille de jeu, qui s'élargit dès `sm` (max-w-lg, ~94 px par
 * tuile). Sans lui : la grille résolue de l'écran de fin, bornée à max-w-sm,
 * qui garde la taille téléphone.
 */
export function mcTileTextClass(word: string, roomy = false): string {
  const length = Array.from(word.trim()).length
  if (length <= 5) return roomy ? 'text-base sm:text-xl' : 'text-base'
  if (length <= 7) return roomy ? 'text-[13px] sm:text-base' : 'text-[13px]'
  return roomy ? 'text-xs sm:text-sm' : 'text-xs'
}
