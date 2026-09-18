/**
 * Squelette du hub /jeux, affiché par Next le temps que la page arrive
 * (loading.tsx = frontière Suspense du segment, préchargée avec le lien).
 * Sur réseau de soirée, toucher « Jeux » laissait l'écran précédent figé
 * sans rien : ici la vitrine se dessine au premier tap.
 *
 * Mêmes conteneurs, au pixel, que HubShell (mode compact) + GamesGrid :
 * largeur `max-w-6xl`, gouttières, hauteur RÉSERVÉE des bascules (celle que
 * la page garde tant que l'auth n'a pas répondu), barre de recherche collée
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
        {/* Bascules mode / ambiance : la page réserve cette hauteur tant que
            l'auth n'a pas répondu — même réserve ici, contenu plus bas
            qu'elle pour que ce soit elle qui fasse foi. */}
        <div className="mb-3">
          <div className="flex min-h-[6.75rem] flex-col gap-2 sm:min-h-[4.75rem] sm:flex-row sm:items-start sm:gap-3">
            <div className="h-12 rounded-xl bg-white/[0.05] sm:max-w-sm sm:flex-1" />
            <div className="h-12 rounded-xl bg-white/[0.05] sm:max-w-sm sm:flex-1" />
          </div>
        </div>

        {/* Barre de recherche collée sous la navbar — mêmes marges négatives
            et même hauteur de champ (h-10) que GamesGrid. */}
        <div className="sticky top-14 z-30 -mx-4 mb-3 border-b border-gold/10 bg-felt-deep/85 px-4 pb-2 pt-1.5 backdrop-blur-md sm:top-[3.75rem] sm:-mx-6 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="h-10 flex-1 rounded-md border border-white/10 bg-white/[0.05]" />
            <div className="h-3 w-10 shrink-0 rounded bg-white/10" />
          </div>
        </div>

        <div className="space-y-4">
          {SECTIONS.map((count, i) => (
            <section key={i}>
              {/* Titre de famille : la hauteur d'un h2 en 11px avec son filet or. */}
              <div className="mb-1.5 flex h-4 items-center gap-2">
                <span className="h-2.5 w-24 rounded bg-gold/25" />
                <span aria-hidden className="h-px flex-1 bg-gold/15" />
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-2.5 lg:grid-cols-6">
                {Array.from({ length: count }, (_, j) => (
                  // Même boîte qu'une PlayingCard du hub : bord de 1px autour
                  // d'un article de 7rem (7,5rem dès `sm`).
                  <div
                    key={j}
                    className="min-h-[calc(7rem+2px)] rounded-xl border border-[#D8CCAE]/60 bg-cream/75 sm:min-h-[calc(7.5rem+2px)]"
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
