import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { prisma } from '@/lib/prisma'
import { InviteRedirect } from './InviteRedirect'

/**
 * /invite/CODE — la page qu'on PARTAGE (WhatsApp, Discord, SMS…) pour
 * inviter à une table. Son seul rôle : servir un aperçu OpenGraph qui
 * vend LA table (« Rejoins ma table de Loup-Garou ! Code : ABC123 ») au
 * lieu de la carte générique du site, puis rediriger le visiteur vers
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
    ? await prisma.onlineRoom.findUnique({ where: { code }, select: { gameId: true, status: true } })
    : null

  const tShare = await getTranslations({ locale, namespace: 'onlineLobby.share' })
  const tBots = await getTranslations({ locale, namespace: 'tryBots' })

  let title: string | null = null
  if (room && code) {
    try {
      const tCatalog = await getTranslations({ locale, namespace: 'games.catalog' })
      title = tShare('text', { game: tCatalog(`${room.gameId}.title`), code })
    } catch {
      title = null
    }
  }
  if (!title) {
    const tMeta = await getTranslations({ locale, namespace: 'metadata' })
    title = tMeta('titleFull')
  }
  const description = tBots('hint')

  return {
    title: { absolute: title },
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, url: `/${locale}/invite/${code ?? ''}` },
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
