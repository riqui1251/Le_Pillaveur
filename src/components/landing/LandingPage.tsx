import { getTranslations } from 'next-intl/server'
import { Bot, Droplets, Globe2, Mic, Tv, Zap } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { BrandLogo } from '@/components/brand/BrandLogo'
import { GAMES, type GameSuit } from '@/lib/games'
import { RULES_GAME_IDS } from '@/lib/rules/rules-ids'
import { SITE_URL } from '@/lib/site'
import { GET as getPresenceCount } from '@/app/api/presence/count/route'
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

/**
 * Code de table de la maquette d'aperçu. Ni traduit ni tiré d'une vraie
 * partie : c'est un décor, au même titre que les enseignes ♠♥♦♣ ci-dessus.
 */
const PREVIEW_CODE = 'PLXK29'

/** Le domaine tel qu'il s'affiche sur l'écran TV du produit, sans le protocole. */
const SITE_HOST = SITE_URL.replace(/^https?:\/\//, '')

/** Jeu servant de décor à l'aperçu : celui que le héros promet en premier. */
const PREVIEW_GAME_ID = 'loup-garou'

function suitIsRed(suit: GameSuit): boolean {
  return suit === 'heart' || suit === 'diamond'
}

/**
 * Joueurs actifs en ce moment. On appelle le handler public déjà utilisé par
 * la navbar plutôt que de refaire la requête : même définition (RGPD compris)
 * et même cache de 15 s, sans aller-retour HTTP. Base indisponible ou table
 * vide → 0, et la vitrine se tait : elle n'affiche jamais « 0 joueur ».
 */
async function readPlayersOnline(): Promise<number> {
  try {
    const res = await getPresenceCount()
    const json = (await res.json()) as { count?: number }
    return typeof json.count === 'number' ? json.count : 0
  } catch {
    return 0
  }
}

export async function LandingPage({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: 'landing' })
  const tCatalog = await getTranslations({ locale, namespace: 'games.catalog' })
  const tMeta = await getTranslations({ locale, namespace: 'metadata' })
  const tNavLegal = await getTranslations({ locale, namespace: 'nav.legal' })

  const visibleGames = GAMES.filter((g) => !g.hidden)
  // Les jeux phares ouvrent la grille : le héros promet « Loup-Garou, quiz,
  // dessin, bluff » alors que l'ordre brut du tableau démarre sur des jeux de
  // dés locaux. Tri stable — le reste du catalogue garde son ordre d'origine.
  const games = [
    ...visibleGames.filter((g) => g.featured),
    ...visibleGames.filter((g) => !g.featured),
  ]

  const playersOnline = await readPlayersOnline()
  const previewGameTitle = tCatalog(`${PREVIEW_GAME_ID}.title`)
  const previewSeats = [
    t('preview.seat1'),
    t('preview.seat2'),
    t('preview.seat3'),
    t('preview.seat4'),
  ]

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
            href={{ pathname: '/jeux', query: { solo: '1' } }}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-violet-400/40 bg-violet-500/15 px-8 text-base font-semibold text-violet-100 transition-colors hover:bg-violet-500/25"
          >
            <Bot aria-hidden className="h-4 w-4" />
            {t('hero.ctaSolo')}
          </Link>
        </div>
        {/* Preuve sociale : le compteur de présence réel, jamais un chiffre
            inventé. Personne en ligne → rien du tout, plutôt que « 0 joueur ». */}
        {playersOnline > 0 && (
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {t('hero.live', { count: playersOnline })}
          </p>
        )}
        <p className="mt-4 text-xs text-white/40">{t('hero.trust')}</p>
      </section>

      {/* ── Aperçu ──
          Maquette HTML/CSS, pas une capture d'écran : le dépôt n'en héberge
          aucune. Elle reprend les tokens du produit (feutre, or, crème,
          Playfair) et la légende dit explicitement que c'est une illustration.
          Purement décorative → aria-hidden, la légende porte le sens. */}
      <section className="py-8">
        <h2 className="text-center font-display text-xl font-bold text-gold sm:text-2xl">
          {t('preview.title')}
        </h2>
        <p className="mx-auto mt-1 max-w-xl text-center text-xs text-white/45">
          {t('preview.subtitle')}
        </p>

        <div className="mt-6 flex flex-col items-center gap-5 sm:flex-row sm:items-end sm:justify-center sm:gap-6">
          {/* Écran TV */}
          <div aria-hidden className="w-full max-w-sm sm:max-w-md">
            <div className="rounded-xl border-2 border-gold/35 bg-felt-deep p-3 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.9)] sm:p-4">
              <div className="flex items-center justify-between gap-2 text-[9px] font-bold uppercase tracking-[0.2em] text-gold/70">
                <span className="truncate">{tMeta('title')}</span>
                <span className="truncate text-cream/55">♠ {previewGameTitle}</span>
              </div>
              <div className="mt-3 rounded-lg border border-gold/20 bg-felt px-3 py-4 text-center">
                <p className="font-display text-[10px] uppercase tracking-[0.2em] text-cream/55">
                  {t('preview.tvJoin')}
                </p>
                <p className="mt-1 font-display text-2xl font-black tracking-[0.3em] text-gold sm:text-3xl">
                  {PREVIEW_CODE}
                </p>
                <p className="mt-1 text-[10px] tracking-wide text-cream/40">{SITE_HOST}</p>
              </div>
              <ul className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
                {previewSeats.map((name) => (
                  <li
                    key={name}
                    className="rounded-full border border-gold/20 bg-white/5 px-2 py-0.5 text-[9px] font-semibold text-cream/80"
                  >
                    {name}
                  </li>
                ))}
                <li className="rounded-full border border-violet-400/30 bg-violet-500/15 px-2 py-0.5 text-[9px] font-semibold text-violet-100">
                  🤖 {t('preview.seatBot')}
                </li>
              </ul>
            </div>
            <div className="mx-auto h-2 w-20 rounded-b-lg bg-black/40" />
          </div>

          {/* Téléphone du joueur */}
          <div aria-hidden className="w-[136px] shrink-0 sm:w-[150px]">
            <div className="rounded-[1.6rem] border-4 border-black/50 bg-felt-deep p-2 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.9)]">
              <div className="mx-auto mb-2 h-1 w-8 rounded-full bg-white/15" />
              <p className="text-center text-[8px] font-bold uppercase tracking-[0.18em] text-gold/70">
                {t('preview.phoneLabel')}
              </p>
              <div className="mt-1.5 rounded-lg border border-[#D8CCAE] bg-cream px-2 pb-2 pt-1 text-[#24201A]">
                <span className="font-display text-[9px] font-black leading-none">
                  A
                  <br />♠
                </span>
                <p className="pb-1 pt-0.5 text-center text-2xl">🐺</p>
                <p className="text-center font-display text-[11px] font-bold leading-tight">
                  {previewGameTitle}
                </p>
              </div>
              <p className="mt-1.5 text-center text-[8px] leading-tight text-white/40">
                {t('preview.phoneHint')}
              </p>
            </div>
          </div>
        </div>

        <p className="mx-auto mt-4 max-w-xl text-center text-[11px] leading-snug text-white/35">
          {t('preview.caption', { game: previewGameTitle })}
        </p>
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
            href={{ pathname: '/jeux', query: { solo: '1' } }}
            className="mt-5 inline-flex h-11 items-center justify-center rounded-2xl border border-violet-400/40 bg-violet-500/20 px-6 text-sm font-bold text-violet-100 transition-colors hover:bg-violet-500/30"
          >
            {t('solo.cta')}
          </Link>
          {/* Le bouton mène à la grille filtrée : on annonce le filtre AVANT le
              clic, mot pour mot comme le bandeau du hub (hub.jeux.soloBanner). */}
          <p className="mt-2 text-xs text-white/45">{t('solo.hint')}</p>
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
                className={cn(
                  'group relative overflow-hidden rounded-2xl border bg-cream p-3 text-[#24201A] shadow-[0_8px_18px_-10px_rgba(0,0,0,0.6)] transition-transform hover:-translate-y-0.5',
                  game.featured ? 'border-gold' : 'border-[#D8CCAE]'
                )}
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
                {game.featured && (
                  <span className="absolute right-2 top-1.5 rounded-full bg-gold/25 px-1.5 py-0.5 text-[8px] font-black uppercase leading-tight tracking-tight text-[#6B4E0F]">
                    ★ {t('catalog.featured')}
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
                  {/* L'accroche traduite existait déjà mais n'était jamais rendue :
                      le catalogue n'annonçait que des titres. */}
                  <p className="mt-1.5 line-clamp-3 text-[11px] leading-snug text-[#4A443A]">
                    {tCatalog(`${game.id}.description`)}
                  </p>
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

      {/* ── Règles (maillage interne SEO) ──
          Les articles de /regles n'existent QU'EN FRANÇAIS (docs/rules/fr/, et
          leur canonique pointe déjà sur /fr). Les proposer à un anglophone était
          une promesse non tenue : la section ne sort donc qu'en français. */}
      {locale === 'fr' && (
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
      )}

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
