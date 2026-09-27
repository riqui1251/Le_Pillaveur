import { androidAssetLinks } from '@/lib/android-app-links'

/**
 * /.well-known/assetlinks.json — vérification des App Links de l'app Android.
 *
 * Servi par une route (et non depuis public/) pour que le contenu vienne de
 * la liste d'empreintes de src/lib/android-app-links.ts, seul endroit à
 * modifier. Le chemin est exclu du matcher de src/middleware.ts : sinon
 * next-intl le redirigeait (307) vers /fr/.well-known/assetlinks.json, en
 * 404, et Android refuse toute redirection.
 *
 * Dynamique : les en-têtes posés ici partent tels quels, sans passer par le
 * cache de rendu de Next. Une heure de cache suffit — Android ne relit ce
 * fichier qu'à l'installation ou à la re-vérification de l'app.
 */
export const dynamic = 'force-dynamic'

export function GET(): Response {
  return new Response(JSON.stringify(androidAssetLinks()), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
