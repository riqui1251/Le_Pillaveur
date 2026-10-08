import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { BellOff, LayoutGrid, UserRound } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { isWellFormedReminderToken } from '@/lib/reminder-token'

/**
 * DÉSINSCRIPTION du rappel du vendredi — l'arrivée du lien « Ne plus recevoir
 * ce rappel » de l'e-mail. Deux états, sans aucune donnée lue en base :
 *
 * - `?token=…` : la page DEMANDE de confirmer, d'un bouton qui envoie un
 *   POST à /api/reminder/unsubscribe. Le lien seul ne coupe rien : les
 *   passerelles de messagerie (Safe Links, Mimecast, Proofpoint) ouvrent
 *   chaque lien à la réception, et désinscrivaient le joueur à son insu.
 *   Formulaire HTML pur, sans JavaScript : il marche dans la vue web d'une
 *   messagerie comme dans un vieux navigateur ;
 * - sans jeton (retour du POST) : « c'est noté, plus de rappel ».
 *
 * La page ne dit RIEN du jeton (connu, inconnu, déjà désinscrit) : elle ne
 * le lit pas, et la route répond la même chose dans tous les cas. Ce qu'elle
 * affirme est vrai pour tous : cette adresse ne recevra plus le rappel.
 *
 * Composant SERVEUR rendu par langue. Non indexée (le layout de /compte pose
 * robots noindex), sans référent (l'URL porte le jeton), sans portail 18+
 * (AgeGate : on y arrive souvent sans le cookie d'âge).
 */

type PageProps = {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/** Jeton de l'URL, s'il a la forme d'un jeton — jamais vérifié en base ici. */
async function tokenFrom(searchParams: PageProps['searchParams']): Promise<string | null> {
  const raw = (await searchParams).token
  const token = Array.isArray(raw) ? raw[0] : raw
  return isWellFormedReminderToken(token) ? token : null
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { locale } = await params
  const token = await tokenFrom(searchParams)
  const t = await getTranslations({ locale, namespace: token ? 'reminder.unsubscribe' : 'reminder.unsubscribed' })
  return { title: t('metaTitle'), referrer: 'no-referrer' }
}

const PRIMARY_BUTTON =
  'inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-gold px-6 text-base font-bold text-felt-deep transition-colors hover:bg-gold-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream/60'
const SECONDARY_BUTTON =
  'inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-gold/30 px-6 text-base font-semibold text-cream transition-colors hover:border-gold/60 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60'

export default async function ReminderUnsubscribePage({ params, searchParams }: PageProps) {
  const { locale } = await params
  setRequestLocale(locale)
  const token = await tokenFrom(searchParams)
  const tDone = await getTranslations({ locale, namespace: 'reminder.unsubscribed' })
  const tAsk = await getTranslations({ locale, namespace: 'reminder.unsubscribe' })

  return (
    <main className="relative flex min-h-[70vh] flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      {/* Lueur d'or sur le feutre, comme la 404 et les autres pages publiques. */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/4 h-72 w-72 -translate-x-1/2 rounded-full bg-gold/10 blur-[110px]" />
      </div>

      <div className="relative w-full max-w-md">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-gold/30 bg-felt-deep/80">
          <BellOff aria-hidden className="h-6 w-6 text-gold" />
        </span>

        {token ? (
          <>
            <h1 className="mt-5 font-display text-2xl font-bold text-cream sm:text-3xl">{tAsk('title')}</h1>
            <p className="mx-auto mt-3 text-sm leading-relaxed text-cream/70">{tAsk('body')}</p>
            <form method="post" action="/api/reminder/unsubscribe" className="mt-8 flex flex-col items-stretch gap-3">
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="lang" value={locale} />
              <button type="submit" className={PRIMARY_BUTTON}>
                <BellOff aria-hidden className="h-4 w-4" />
                {tAsk('button')}
              </button>
              <Link href="/jeux" className={SECONDARY_BUTTON}>
                <LayoutGrid aria-hidden className="h-4 w-4" />
                {tDone('games')}
              </Link>
            </form>
          </>
        ) : (
          <>
            <h1 className="mt-5 font-display text-2xl font-bold text-cream sm:text-3xl">{tDone('title')}</h1>
            <p className="mx-auto mt-3 text-sm leading-relaxed text-cream/70">{tDone('body')}</p>
            <p className="mx-auto mt-2 text-sm leading-relaxed text-cream/60">{tDone('reactivate')}</p>

            <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <Link href="/jeux" className={PRIMARY_BUTTON}>
                <LayoutGrid aria-hidden className="h-4 w-4" />
                {tDone('games')}
              </Link>
              <Link href="/compte" className={SECONDARY_BUTTON}>
                <UserRound aria-hidden className="h-4 w-4" />
                {tDone('account')}
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
