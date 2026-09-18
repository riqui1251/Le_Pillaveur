/**
 * Squelette des pages de jeu, affiché par Next le temps que le jeu arrive
 * (loading.tsx = frontière Suspense du segment /games, préchargée avec le
 * lien). Il se rend À L'INTÉRIEUR de la coquille feutre de games/layout.tsx :
 * le cadre or et le fond sont donc déjà là, seul le contenu est esquissé.
 *
 * Les jeux n'ont pas tous la même mise en page ; on esquisse celle qui
 * suit dans la grande majorité des cas : les seize jeux en ligne enchaînent
 * sur OnlineGameSkeleton (tuile d'icône, titre et accroche CENTRÉS dans une
 * colonne `max-w-lg`, puis deux barres), et leur lobby comme leur vitrine
 * « essayer avec des bots » gardent cette colonne centrée. Même silhouette
 * ici, aux mêmes cotes — sinon le titre sautait de la gauche au centre
 * entre les deux squelettes, avant même que le lobby n'arrive. Les quelques
 * jeux locaux à en-tête aligné à gauche remplacent un squelette plausible
 * plutôt qu'un écran vide.
 *
 * Aucun texte : rien à traduire, et `aria-busy` suffit à un lecteur d'écran.
 * Pulsation sous `motion-safe:` seulement.
 */
export default function GamesLoading() {
  return (
    <div aria-busy="true" className="flex w-full flex-1 flex-col items-center px-3 py-8 motion-safe:animate-pulse sm:py-12">
      <div className="w-full max-w-lg text-center">
        {/* Tuile d'icône (h-16 w-16), titre display text-3xl (≈ h-9) et
            accroche sur une ligne — les cotes de l'en-tête réel. */}
        <div className="mx-auto mb-4 h-16 w-16 rounded-2xl border border-gold/30 bg-gold/10" />
        <div className="mx-auto h-9 w-48 rounded-md bg-gold/20" />
        <div className="mx-auto mt-2 h-4 w-64 max-w-[80%] rounded bg-cream/10" />

        {/* La place du bouton principal et de la liste des tables. */}
        <div className="mt-8 space-y-3">
          <div className="h-12 w-full rounded-2xl bg-cream/10" />
          <div className="mx-auto h-12 w-3/4 rounded-2xl bg-cream/[0.06]" />
        </div>
      </div>
    </div>
  )
}
