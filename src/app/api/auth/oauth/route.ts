import { NextResponse } from 'next/server'
import { withApiRoute } from '@/lib/api-route'
import { enabledOAuthProviders } from '@/lib/oauth-server'

/**
 * Fournisseurs configurés sur CE serveur (variables d'environnement lues à
 * l'exécution) : les boutons Discord / Facebook n'apparaissent que pour eux.
 */
export const GET = withApiRoute('auth/oauth GET', async () =>
  NextResponse.json({ providers: enabledOAuthProviders() })
)
