import { NextResponse } from 'next/server'
import type { AbstractIntlMessages } from 'next-intl'
import { routing } from '@/i18n/routing'
import { tourSlice } from '@/i18n/messages-slices'
import { apiError, withApiRoute } from '@/lib/api-route'
import fr from '../../../../../messages/fr.json'
import en from '../../../../../messages/en.json'
import es from '../../../../../messages/es.json'
import it from '../../../../../messages/it.json'

// Les étapes de tutoriel des jeux sont des tableaux, que le type des messages
// de next-intl ne décrit pas : même conversion que src/i18n/request.ts laisse
// faire à next-intl.
const CATALOGUES = { fr, en, es, it } as unknown as Record<string, AbstractIntlMessages>

/**
 * Textes du tuto des nouveaux joueurs, dans une langue. Le socle ne les porte
 * pas (ON_DEMAND_PATHS, src/i18n/messages-slices.ts) : le navigateur les
 * réclame ici au lancement du tuto. Aucune donnée de compte : même réponse
 * pour tout le monde, donc mise en cache.
 */
export const GET = withApiRoute('tour/messages GET', async (request: Request) => {
  const locale = new URL(request.url).searchParams.get('locale') ?? ''
  if (!(routing.locales as readonly string[]).includes(locale)) return apiError('invalid_locale', 400)

  return NextResponse.json(tourSlice(CATALOGUES[locale]), {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  })
})
