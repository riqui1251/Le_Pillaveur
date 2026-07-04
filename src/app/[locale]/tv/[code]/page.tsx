import { TvRoomView } from '@/components/tv/TvRoomView'

export const dynamic = 'force-dynamic'

/** Écran TV d'une salle donnée (par code). Public — aucune authentification requise. */
export default async function TvRoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  return <TvRoomView code={code} />
}
