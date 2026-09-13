import { AccountFile } from '@/components/supervision/AccountFile'

export const dynamic = 'force-dynamic'

/**
 * Fiche d'un compte en pleine page — un lien stable par joueur, que le
 * rechargement et le retour du navigateur conservent (le dialogue
 * « Historique » se refermait sur la Vue d'ensemble).
 *
 * L'accès est déjà gardé par supervision/layout.tsx (staff seulement) et
 * chaque route de données applique sa propre garde : l'activité en ligne
 * reste réservée aux admins et plus.
 */
export default async function AccountFilePage({
  params,
}: {
  params: Promise<{ locale: string; userId: string }>
}) {
  const { userId } = await params
  return <AccountFile userId={userId} />
}
