import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { GAMES } from '@/lib/games'
import { COLLECTION_SLUGS } from '@/lib/collections'

const COLLECTION_LABELS: Record<
  (typeof COLLECTION_SLUGS)[number],
  'drinking' | 'noAlcohol' | 'duo' | 'bigGroup' | 'solo'
> = {
  'jeux-a-boire': 'drinking',
  'sans-alcool': 'noAlcohol',
  'a-2-joueurs': 'duo',
  'en-grand-groupe': 'bigGroup',
  'seul-avec-des-bots': 'solo',
}

export async function HomeSiteLinks({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'homeLinks' })
  const count = GAMES.filter((g) => !g.hidden).length
  const links = [
    { href: '/jeux', label: t('links.all') },
    ...COLLECTION_SLUGS.map((slug) => ({ href: `/jeux/${slug}`, label: t(`links.${COLLECTION_LABELS[slug]}`) })),
    { href: '/decouvrir', label: t('links.remote') },
    { href: '/regles', label: t('links.rules') },
    { href: '/idees', label: t('links.ideas') },
  ] as const

  return (
    <section className="flex flex-col gap-2 border-t border-white/10 pt-5 text-center">
      <h2 className="font-display text-base text-cream/90">{t('title')}</h2>
      <p className="text-[13px] leading-relaxed text-cream/70">{t('p1', { count })}</p>
      <p className="text-[13px] leading-relaxed text-cream/70">{t('p2')}</p>
      <nav aria-label={t('navLabel')}>
        <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-[13px]">
          {links.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="text-amber-300 hover:underline">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  )
}
