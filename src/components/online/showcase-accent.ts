/**
 * Bouton principal des vitrines de jeu : « en attente » de GameShowcase,
 * « Passer en ligne » des pages et TryBotsGate. Encre sur or (7,2:1), le même
 * rendu que `Button variant="primary"`.
 *
 * Chaque page avait son dégradé (ciel, cyan, indigo, fuchsia…) avec un texte
 * blanc qui tombait à 2,3-4,5:1 au milieu du bouton, et aucun ne venait de la
 * palette : d'un jeu à l'autre, le bouton principal ne ressemblait plus au
 * site. L'identité du jeu passe par son enseigne en tête de vitrine.
 *
 * C'est une chaîne de classes posée sur un `<Button>` de taille par défaut
 * (`h-9`, que tailwind-merge garde à côté d'un `py-5`, d'où des boutons de
 * 40 px) : `h-14` le remplace et rend au bouton la hauteur prévue. L'anneau
 * de focus du Button (`ring-1`, l'or de `--ring`) se fond dans un bouton or :
 * il passe en crème, détaché du bouton.
 */
export const SHOWCASE_ACCENT =
  'h-14 w-full rounded-2xl bg-amber-500 px-5 text-base font-bold text-[#24201A] shadow-[0_10px_22px_-12px_rgba(217,164,65,0.7)] hover:bg-amber-400 active:scale-[0.98] disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2 focus-visible:ring-offset-felt-deep'
