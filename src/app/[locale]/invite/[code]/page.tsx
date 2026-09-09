import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { prisma } from '@/lib/prisma'
import { InviteRedirect } from './InviteRedirect'

/**
 * /invite/CODE — la page qu'on PARTAGE (WhatsApp, Discord, SMS…) pour
 * inviter à une table. Son seul rôle : servir un aperçu OpenGraph qui
 * vend LA table (qui invite, à quel jeu, et qu'un pseudo suffit) au
 * lieu de la carte générique du site — la description parlait des bots à
 * quelqu'un qu'un ami attend déjà, et l'image était celle de la home. Elle
 * est désormais peinte pour la table (/api/og?type=invite), puis on redirige
 * le visiteur vers
 * /jeux?join=CODE (langue du visiteur préservée : le lien se partage sans
 * préfixe, le middleware détecte la locale). noindex : pages éphémères.
 */

function normalizeCode(raw: string): string | null {
  const code = raw.trim().toUpperCase()
  return /^[A-Z0-9]{6}$/.test(code) ? code : null
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; code: string }>
}): Promise<Metadata> {
  const { locale, code: rawCode } = await params
  const code = normalizeCode(rawCode)
  const room = code
    ? await prisma.onlineRoom.findUnique({
        where: { code },
        // L'hôte est le coeur du message : « X t'invite » convainc là où
        // « une table t'attend » reste anonyme. Pseudo en ligne s'il existe.
        select: {
          gameId: true,
          status: true,
          host: { select: { name: true, displayName: true } },
        },
      })
    : null

  const tOg = await getTranslations({ locale, namespace: 'og' })

  let title: string | null = null
  let description: string | null = null
  let ogImage = `/api/og?type=site&locale=${locale}`

  if (room && code) {
    const tCatalog = await getTranslations({ locale, namespace: 'games.catalog' })
    // gameId reste nul tant que l'hôte n'a pas choisi de jeu dans le lobby :
    // on retombe alors sur une invitation sans nom de jeu plutôt que planter.
    let gameTitle: string | null = null
    if (room.gameId) {
      try {
        gameTitle = tCatalog(`${room.gameId}.title`)
      } catch {
        gameTitle = null
      }
    }
    const rawHost = room.host?.name?.trim() || room.host?.displayName?.trim() || ''
    const host = rawHost.length > 0 ? rawHost : null

    title =
      host && gameTitle
        ? tOg('inviteTitle', { host, game: gameTitle })
        : gameTitle
          ? tOg('inviteTitleAnon', { game: gameTitle })
          : tOg('inviteTitleBare')
    description = tOg('inviteDescription', { code })
    const query = new URLSearchParams({ type: 'invite', code, locale })
    if (room.gameId) query.set('game', room.gameId)
    if (host) query.set('host', host)
    ogImage = `/api/og?${query.toString()}`
  }

  if (!title || !description) {
    const tMeta = await getTranslations({ locale, namespace: 'metadata' })
    title = tMeta('titleFull')
    description = tMeta('description')
  }

  const images = [{ url: ogImage, width: 1200, height: 630, alt: title }]

  return {
    title: { absolute: title },
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, url: `/${locale}/invite/${code ?? ''}`, images },
    twitter: { card: 'summary_large_image', title, description, images: [ogImage] },
  }
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code: rawCode } = await params
  const code = normalizeCode(rawCode) ?? ''
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div
        aria-hidden
        className="h-8 w-8 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400"
      />
      <InviteRedirect code={code} />
    </main>
  )
}
