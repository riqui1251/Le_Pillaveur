/**
 * Squelette du hub /jeux, affiché par Next le temps que la page arrive
 * (loading.tsx = frontière Suspense du segment, préchargée avec le lien).
 * Sur réseau de soirée, toucher « Jeux » laissait l'écran précédent figé
 * sans rien : ici la vitrine se dessine au premier tap.
 *
 * Mêmes conteneurs, au pixel, que HubShell (mode compact) + GamesGrid :
 * largeur `max-w-6xl`, gouttières, barre de soirée de 56 px (hauteur que la
 * page garde tant que l'auth n'a pas répondu), barre de recherche collée
 * et grille 3/4/6 colonnes de cartes crème — pour qu'aucun bloc ne saute
 * quand le contenu remplace le squelette. L'en-tête serveur (h1 + accroche)
 * est rendu par le layout du segment et reste affiché au-dessus.
 *
 * Aucun texte : rien à traduire, et `aria-busy` suffit à un lecteur d'écran.
 * Pulsation sous `motion-safe:` seulement — un joueur qui a demandé moins
 * d'animations voit un squelette immobile.
 */

/** Trois familles esquissées, six cartes chacune : deux rangées sur mobile. */
const SECTIONS = [6, 6, 6] as const

export default function JeuxLoading() {
  return (
    <main aria-busy="true" className="relative min-h-screen overflow-x-clip text-white">
      {/* Lueurs sur le feutre : identiques à HubShell, sinon le fond change
          de teinte à l'arrivée du contenu. */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-gold/10 blur-[100px]" />
        <div className="absolute right-0 top-32 h-80 w-80 rounded-full bg-gold/[0.07] blur-[110px]" />
        <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-suit-red/[0.06] blur-[90px]" />
      </div>

      <div className="container relative mx-auto max-w-6xl px-4 pb-16 pt-3 motion-safe:animate-pulse sm:px-6 sm:pt-4">
        {/* Barre de soirée (h-14, PartyBar) puis puces des collections : la
            page garde la hauteur de la barre tant que l'auth n'a pas répondu
            — même réserve ici. `mt-2` : sur la page, la région muette
            d'OfflineBanner précède la barre dans le même `space-y-2`. */}
        <div className="mb-3 space-y-2">
          <div className="mt-2 h-14 rounded-2xl border border-gold/30 bg-felt-deep/90" />
          <div className="flex gap-1.5">
            <div className="h-[30px] w-24 shrink-0 rounded-full border border-gold/20" />
            <div className="h-[30px] w-24 shrink-0 rounded-full border border-gold/20" />
            <div className="h-[30px] w-28 shrink-0 rounded-full border border-gold/20" />
          </div>
        </div>

        {/* Barre de recherche collée sous la navbar — mêmes marges négatives,
            même fond plein et même hauteur de champ (h-11) que GamesGrid. */}
        <div className="sticky top-14 z-30 -mx-4 mb-3 border-b border-gold/20 bg-felt-deep px-4 pb-2 pt-1.5 sm:top-[3.75rem] sm:-mx-6 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="h-11 flex-1 rounded-md border border-gold/20 bg-white/[0.05]" />
            <div className="h-3 w-10 shrink-0 rounded bg-white/10" />
          </div>
        </div>

        <div className="space-y-5">
          {SECTIONS.map((count, i) => (
            <section key={i}>
              {/* Intertitre : la hauteur d'un h2 en 12-13 px avec son filet or. */}
              <div className="mb-1.5 flex h-5 items-center gap-2">
                <span className="h-2.5 w-24 rounded bg-gold/25" />
                <span aria-hidden className="h-px flex-1 bg-gold/15" />
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-2.5 lg:grid-cols-6">
                {Array.from({ length: count }, (_, j) => (
                  // Même boîte qu'une PlayingCard du hub : bord de 1px autour
                  // d'un article de 7,5rem.
                  <div
                    key={j}
                    className="min-h-[calc(7.5rem+2px)] rounded-xl border border-[#D8CCAE]/60 bg-cream/75"
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  )
}
