import { getTranslations } from 'next-intl/server'
import { Bot, Droplets, Globe2, Mic, Tv, Zap } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { BrandLogo } from '@/components/brand/BrandLogo'
import { GAMES, type GameSuit } from '@/lib/games'
import { RULES_GAME_IDS } from '@/lib/rules/rules-ids'
import { cn } from '@/lib/utils'

/**
 * Landing publique — la vitrine que voit un visiteur SANS session ni mode
 * local (les habitués sont redirigés vers /jeux, voir app/[locale]/page.tsx).
 * 100 % rendue serveur : c'est la page que Google et les réseaux indexent.
 */

const SUIT_GLYPH: Record<GameSuit, string> = {
  spade: '♠',
  heart: '♥',
  diamond: '♦',
  club: '♣',
}

function suitIsRed(suit: GameSuit): boolean {
  return suit === 'heart' || suit === 'diamond'
}

export async function LandingPage({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'landing' })
  const tCatalog = await getTranslations({ locale, namespace: 'games.catalog' })
  const tNavLegal = await getTranslations({ locale, namespace: 'nav.legal' })

  const games = GAMES.filter((g) => !g.hidden)

  const features = [
    { Icon: Mic, title: t('features.voice'), desc: t('features.voiceDesc') },
    { Icon: Tv, title: t('features.tv'), desc: t('features.tvDesc') },
    { Icon: Bot, title: t('features.bots'), desc: t('features.botsDesc') },
    { Icon: Droplets, title: t('features.soft'), desc: t('features.softDesc') },
    { Icon: Globe2, title: t('features.languages'), desc: t('features.languagesDesc') },
    { Icon: Zap, title: t('features.free'), desc: t('features.freeDesc') },
  ]

  const steps = [
    { n: '1', title: t('how.step1Title'), body: t('how.step1Body', { count: games.length }) },
    { n: '2', title: t('how.step2Title'), body: t('how.step2Body') },
    { n: '3', title: t('how.step3Title'), body: t('how.step3Body') },
  ]

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-16 text-white">
      {/* ── Héros ── */}
      <section className="pb-10 pt-10 text-center sm:pt-16">
        <BrandLogo className="mx-auto w-72 max-w-full sm:w-96" />
        <h1 className="mx-auto mt-6 max-w-2xl text-balance font-display text-3xl font-bold text-cream sm:text-4xl">
          {t('hero.title')}
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-pretty text-sm leading-relaxed text-white/70 sm:text-base">
          {t('hero.subtitle')}
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/jeux"
            className="inline-flex h-12 items-center justify-center rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 px-8 text-base font-bold text-white shadow-lg shadow-amber-500/25 transition-all hover:from-amber-400 hover:to-orange-500"
          >
            {t('hero.ctaPlay')}
          </Link>
          <Link
            href="/jeux"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-violet-400/40 bg-violet-500/15 px-8 text-base font-semibold text-violet-100 transition-colors hover:bg-violet-500/25"
          >
            <Bot aria-hidden className="h-4 w-4" />
            {t('hero.ctaSolo')}
          </Link>
        </div>
        <p className="mt-4 text-xs text-white/40">{t('hero.trust')}</p>
      </section>

      {/* ── Comment ça marche ── */}
      <section className="py-8">
        <h2 className="text-center font-display text-xl font-bold text-gold sm:text-2xl">
          {t('how.title')}
        </h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {steps.map((step) => (
            <div
              key={step.n}
              className="rounded-2xl border border-gold/15 bg-felt-deep/70 p-5 text-center"
            >
              <span className="font-display text-3xl font-black text-gold/80">{step.n}</span>
              <h3 className="mt-1.5 font-display text-base font-bold text-cream">{step.title}</h3>
              <p className="mt-1 text-sm leading-snug text-white/60">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-8">
        <h2 className="text-center font-display text-xl font-bold text-gold sm:text-2xl">
          {t('features.title')}
        </h2>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {features.map(({ Icon, title, desc }) => (
            <div key={title} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <Icon aria-hidden className="h-5 w-5 text-amber-300" />
              <h3 className="mt-2 text-sm font-bold text-white/90">{title}</h3>
              <p className="mt-0.5 text-xs leading-snug text-white/50">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Joue même seul — persona « je m'ennuie maintenant » ── */}
      <section className="py-8">
        <div className="rounded-3xl border border-violet-400/25 bg-violet-500/[0.08] p-6 text-center sm:p-8">
          <span aria-hidden className="text-3xl">🤖</span>
          <h2 className="mt-2 font-display text-xl font-bold text-cream sm:text-2xl">
            {t('solo.title')}
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-white/65">
            {t('solo.body')}
          </p>
          <Link
            href="/jeux"
            className="mt-5 inline-flex h-11 items-center justify-center rounded-2xl border border-violet-400/40 bg-violet-500/20 px-6 text-sm font-bold text-violet-100 transition-colors hover:bg-violet-500/30"
          >
            {t('solo.cta')}
          </Link>
        </div>
      </section>

      {/* ── Catalogue complet (online inclus — la vitrine ne cache rien) ── */}
      <section id="catalogue" className="scroll-mt-20 py-8">
        <h2 className="text-center font-display text-xl font-bold text-gold sm:text-2xl">
          {t('catalog.title')}
        </h2>
        <p className="mt-1 text-center text-xs text-white/45">{t('catalog.subtitle')}</p>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {games.map((game) => {
            const red = game.suit ? suitIsRed(game.suit) : false
            return (
              <Link
                key={game.id}
                href={game.path}
                className="group relative overflow-hidden rounded-2xl border border-[#D8CCAE] bg-cream p-3 text-[#24201A] shadow-[0_8px_18px_-10px_rgba(0,0,0,0.6)] transition-transform hover:-translate-y-0.5"
              >
                {game.suit && (
                  <span
                    aria-hidden
                    className={cn(
                      'absolute left-2 top-1.5 font-display text-xs font-black leading-tight',
                      red ? 'text-suit-red' : 'text-[#24201A]'
                    )}
                  >
                    {game.rank}
                    <br />
                    {SUIT_GLYPH[game.suit]}
                  </span>
                )}
                <div className="px-4 pt-4 text-center">
                  <h3 className="truncate font-display text-sm font-bold">
                    {tCatalog(`${game.id}.title`)}
                  </h3>
                  {game.minPlayers && game.maxPlayers && (
                    <p className="mt-0.5 text-[10px] text-[#6B6455]">
                      {t('catalog.players', { min: game.minPlayers, max: game.maxPlayers })}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-1">
                    {game.onlineReady && (
                      <span className="rounded-full bg-emerald-700/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-800">
                        {t('catalog.online')}
                      </span>
                    )}
                    {!game.onlineOnly && (
                      <span className="rounded-full bg-[#24201A]/8 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#4A443A]">
                        {t('catalog.local')}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      {/* ── Règles (maillage interne SEO) ── */}
      <section className="py-8">
        <h2 className="text-center font-display text-xl font-bold text-gold sm:text-2xl">
          {t('rules.title')}
        </h2>
        <p className="mt-1 text-center text-xs text-white/45">{t('rules.subtitle')}</p>
        <ul className="mt-4 flex flex-wrap justify-center gap-2">
          {RULES_GAME_IDS.map((id) => (
            <li key={id}>
              <Link
                href={`/regles/${id}`}
                className="inline-flex rounded-full border border-gold/25 px-3 py-1.5 text-xs font-semibold text-cream/75 transition-colors hover:border-gold/50 hover:text-cream"
              >
                {t('rules.linkLabel', { game: tCatalog(`${id}.title`) })}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ── CTA final ── */}
      <section className="py-10 text-center">
        <p className="font-display text-2xl font-bold text-cream sm:text-3xl">
          {t('finalCta.title')}
        </p>
        <Link
          href="/jeux"
          className="mt-4 inline-flex h-12 items-center justify-center rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 px-10 text-base font-bold text-white shadow-lg shadow-amber-500/25 transition-all hover:from-amber-400 hover:to-orange-500"
        >
          {t('finalCta.cta')}
        </Link>
      </section>

      {/* ── Pied légal ── */}
      <footer className="border-t border-white/10 pt-5 text-center text-xs text-white/35">
        <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          <Link href="/legal/cgu" className="hover:text-white/70">
            {tNavLegal('cgu')}
          </Link>
          <Link href="/legal/confidentialite" className="hover:text-white/70">
            {tNavLegal('confidentialite')}
          </Link>
          <Link href="/legal/mentions-legales" className="hover:text-white/70">
            {tNavLegal('mentionsLegales')}
          </Link>
        </nav>
      </footer>
    </main>
  )
}
