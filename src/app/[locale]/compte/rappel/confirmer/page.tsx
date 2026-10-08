import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { BellRing, CircleAlert, LayoutGrid, UserRound } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { isWellFormedReminderToken } from '@/lib/reminder-token'

/**
 * CONFIRMATION de l'accord au rappel du vendredi (double opt-in,
 * src/lib/reminder-server.ts) — l'arrivée du lien de l'e-mail de
 * confirmation. Trois états, sans aucune donnée lue en base :
 *
 * - `?token=…` : ce qu'on accepte (un e-mail le vendredi vers 17 h, heure de
 *   Paris, au plus un par semaine), puis un bouton qui envoie un POST à
 *   /api/reminder/confirm. Le lien seul ne confirme rien : un antivirus de
 *   messagerie qui l'ouvre ne doit pas donner l'accord à la place du joueur ;
 * - `?etat=actif` (retour du POST) : rappel activé ;
 * - autre (`?etat=invalide`, rien) : lien expiré ou déjà utilisé — on le
 *   redemande depuis la page Compte.
 *
 * Formulaire HTML pur, sans JavaScript, sans connexion : l'e-mail s'ouvre
 * souvent sur un autre appareil que celui où l'on joue. Non indexée (layout
 * de /compte), sans référent (l'URL porte le jeton), sans portail 18+
 * (AgeGate).
 */

type PageProps = {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

type View = { kind: 'ask'; token: string } | { kind: 'active' } | { kind: 'invalid' }

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

async function viewFrom(searchParams: PageProps['searchParams']): Promise<View> {
  const query = await searchParams
  const token = first(query.token)
  if (isWellFormedReminderToken(token)) return { kind: 'ask', token }
  return first(query.etat) === 'actif' ? { kind: 'active' } : { kind: 'invalid' }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'reminder.confirm' })
  return { title: t('metaTitle'), referrer: 'no-referrer' }
}

const PRIMARY_BUTTON =
  'inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-gold px-6 text-base font-bold text-felt-deep transition-colors hover:bg-gold-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream/60'
const SECONDARY_BUTTON =
  'inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-gold/30 px-6 text-base font-semibold text-cream transition-colors hover:border-gold/60 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60'

export default async function ReminderConfirmPage({ params, searchParams }: PageProps) {
  const { locale } = await params
  setRequestLocale(locale)
  const view = await viewFrom(searchParams)
  const t = await getTranslations({ locale, namespace: 'reminder.confirm' })
  // « Voir les jeux », « Mon compte » : les mêmes mots que la page de désinscription.
  const tLinks = await getTranslations({ locale, namespace: 'reminder.unsubscribed' })

  const Icon = view.kind === 'invalid' ? CircleAlert : BellRing
  const title = view.kind === 'ask' ? t('title') : view.kind === 'active' ? t('activeTitle') : t('invalidTitle')
  const body = view.kind === 'ask' ? t('body') : view.kind === 'active' ? t('activeBody') : t('invalidBody')

  return (
    <main className="relative flex min-h-[70vh] flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      {/* Lueur d'or sur le feutre, comme la 404 et les autres pages publiques. */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/4 h-72 w-72 -translate-x-1/2 rounded-full bg-gold/10 blur-[110px]" />
      </div>

      <div className="relative w-full max-w-md">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-gold/30 bg-felt-deep/80">
          <Icon aria-hidden className="h-6 w-6 text-gold" />
        </span>
        <h1 className="mt-5 font-display text-2xl font-bold text-cream sm:text-3xl">{title}</h1>
        <p className="mx-auto mt-3 text-sm leading-relaxed text-cream/70">{body}</p>

        {view.kind === 'ask' ? (
          <form method="post" action="/api/reminder/confirm" className="mt-8 flex flex-col items-stretch gap-3">
            <input type="hidden" name="token" value={view.token} />
            <input type="hidden" name="lang" value={locale} />
            <button type="submit" className={PRIMARY_BUTTON}>
              <BellRing aria-hidden className="h-4 w-4" />
              {t('button')}
            </button>
            <Link href="/jeux" className={SECONDARY_BUTTON}>
              <LayoutGrid aria-hidden className="h-4 w-4" />
              {tLinks('games')}
            </Link>
          </form>
        ) : (
          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Link href={view.kind === 'active' ? '/jeux' : '/compte?focus=rappel'} className={PRIMARY_BUTTON}>
              {view.kind === 'active' ? (
                <LayoutGrid aria-hidden className="h-4 w-4" />
              ) : (
                <UserRound aria-hidden className="h-4 w-4" />
              )}
              {view.kind === 'active' ? tLinks('games') : tLinks('account')}
            </Link>
            <Link href={view.kind === 'active' ? '/compte?focus=rappel' : '/jeux'} className={SECONDARY_BUTTON}>
              {view.kind === 'active' ? (
                <UserRound aria-hidden className="h-4 w-4" />
              ) : (
                <LayoutGrid aria-hidden className="h-4 w-4" />
              )}
              {view.kind === 'active' ? tLinks('account') : tLinks('games')}
            </Link>
          </div>
        )}
      </div>
    </main>
  )
}
