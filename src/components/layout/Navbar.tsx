"use client"

import { Link, usePathname } from '@/i18n/navigation'
import { Menu, X, Home, User, Users, ChevronRight, Shield, MessageCircle, Trophy, Smartphone, Maximize2, Minimize2, Loader2, BookOpen, GraduationCap } from 'lucide-react'
import { Fragment, useState, useEffect, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useLocale, useTranslations } from 'next-intl'
import { useAuth } from '@/hooks/useAuth'
import { isCapacitorApp } from '@/lib/native-app'
import { useFriends, type Friend } from '@/hooks/useFriends'
import { useNavBadges } from '@/hooks/useNavBadges'
import type { ChatUnread } from '@/hooks/useChatUnread'
import { canAccessSupervision } from '@/lib/roles'
import { usePageMeta } from '@/lib/nav-meta'
import { useFullscreen } from '@/hooks/useFullscreen'
import { FeedbackMenuButton } from '@/components/feedback/FeedbackMenuButton'
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher'
import { BrandMark } from '@/components/brand/BrandLogo'
import { openAnalyticsConsent } from '@/components/legal/AgeGate'
import { useTour } from '@/components/tour/TourProvider'
import { useAccountSheets } from '@/components/account/AccountSheets'
import { scrollPageTop } from '@/lib/scroll-page-top'
import { cn } from '@/lib/utils'

/**
 * Panneaux amis / chat et dialogue de retour — chargés À LA DEMANDE.
 *
 * La barre est dans le layout, donc sur TOUTES les pages (vitrine, règles,
 * compte) : importés en dur, les deux panneaux embarquaient framer-motion,
 * le gestionnaire d'amis et le dialogue de signalement dans le premier
 * chargement de chaque visiteur, pour des surcouches qu'il n'ouvrira peut-être
 * jamais. En morceaux séparés, ils ne sont réclamés qu'à la première
 * ouverture (voir SocialPanels, même style que VoiceDock dans games/layout).
 *
 * `ssr: false` : surcouches flottantes fermées au premier rendu — aucun
 * contenu serveur à préserver, rien ne peut sauter.
 */

/**
 * Voile affiché le temps de télécharger un panneau, à sa PREMIÈRE ouverture :
 * sur mobile, le tiroir se referme avant que le morceau n'arrive et, sans ce
 * voile, rien ne répondait au tap tant que le réseau n'avait pas livré (sur
 * desktop, le bouton de la barre passe en style actif ; pas dans le tiroir).
 * Sans framer-motion, sur le même plan que les surcouches des panneaux.
 */
function PanelLoading() {
  const t = useTranslations('nav')
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={t('loading')}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <Loader2 className="h-6 w-6 animate-spin text-white/70" aria-hidden />
    </div>
  )
}

const FriendsPanel = dynamic(
  () => import('@/components/layout/FriendsPanel').then((m) => m.FriendsPanel),
  { ssr: false, loading: PanelLoading }
)
const FeedbackDialog = dynamic(
  () => import('@/components/feedback/FeedbackDialog').then((m) => m.FeedbackDialog),
  { ssr: false, loading: PanelLoading }
)

/**
 * Contrat avec ChatPanel (chantier « chat en delta ») : il ne charge plus sa
 * liste d'amis lui-même — la barre lui passe la sienne, celle du panneau
 * amis, et de quoi la relire. Le type est déclaré ici pour que la barre
 * compile des deux côtés du chantier ; tsc signale toute divergence.
 */
type ChatPanelProps = {
  open: boolean
  onClose: () => void
  unread: ChatUnread
  onRead: () => void
  friends: Friend[]
  refreshFriends: () => Promise<void> | void
}
const ChatPanel = dynamic<ChatPanelProps>(
  () => import('@/components/chat/ChatPanel').then((m) => m.ChatPanel),
  { ssr: false, loading: PanelLoading }
)

function NeutralAccountIcon() {
  return <User className="h-4 w-4 text-amber-300" aria-hidden />
}

// Le catalogue des icônes de compte (≈ 140 Ko de tracés) ne voyage qu'avec
// un compte qui en a choisi une, pas avec chaque page de chaque visiteur.
const AccountIcon = dynamic(
  () => import('@/components/icons/PlayerIcons').then((m) => m.PlayerIconById),
  { ssr: false, loading: NeutralAccountIcon }
)

/**
 * Accès au compte, à droite de la barre : « Se connecter » pour un visiteur,
 * sinon une pastille (icône, pseudo, niveau — ou « Invité », en ambre : c'est
 * le chemin vers la sauvegarde du compte). Les deux ouvrent une feuille. Rien
 * tant que la session n'est pas lue, ni quand elle n'a pas pu l'être (hors
 * ligne) : on ne propose pas de se connecter à qui l'est peut-être déjà.
 */
function AccountControl({ level }: { level: number | null }) {
  const t = useTranslations('nav')
  const tAuth = useTranslations('auth')
  const { user, loading, unavailable } = useAuth()
  const { openAuth, openAccount } = useAccountSheets()

  if (loading || (!user && unavailable)) return null

  if (!user) {
    return (
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => openAuth()}
        className="flex h-11 min-w-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-amber-400/[0.45] bg-amber-500/[0.15] px-3 text-sm font-bold text-amber-200 transition-all duration-200 hover:bg-amber-500/25 active:scale-95 sm:shrink-0 sm:px-3.5"
      >
        <User className="h-4 w-4 shrink-0" aria-hidden />
        <span className="min-w-0 truncate">{tAuth('login.submit')}</span>
      </button>
    )
  }

  const name = user.displayName
  const icon = user.onlinePreferences?.icon
  const label = user.isGuest
    ? t('account.openGuest', { name })
    : level !== null
      ? t('account.openLevel', { name, level })
      : t('account.open', { name })

  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={label}
      title={name}
      onClick={openAccount}
      className={cn(
        'flex h-11 min-w-0 max-w-[13rem] items-center gap-1.5 rounded-xl border pl-1.5 pr-2.5 text-sm font-bold transition-all duration-200 active:scale-95 sm:shrink-0 sm:gap-2',
        user.isGuest
          ? 'border-amber-400/40 bg-amber-500/[0.15] text-amber-100 hover:border-amber-400/60 hover:bg-amber-500/25'
          : 'border-white/10 bg-white/[0.04] text-white hover:border-amber-400/[0.35] hover:bg-amber-500/10'
      )}
    >
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-felt shadow-md ring-2 ring-inset ring-gold"
      >
        {icon ? <AccountIcon id={icon} className="h-5 w-5" /> : <NeutralAccountIcon />}
      </span>
      {/* Le pseudo ne s'affiche que là où il tient sans écraser le titre de
          la page : de `xs` à `sm` (amis et chat sont alors dans le tiroir) et
          dès `lg`. Sous 480 px, il réduisait le titre à « L… » ; entre `sm` et
          `lg`, amis, chat, langue et page active remplissent déjà la barre. Il
          reste toujours dans aria-label et title. */}
      <span className="hidden min-w-0 truncate xs:block sm:hidden lg:block">{name}</span>
      {user.isGuest ? (
        <span className="shrink-0 whitespace-nowrap text-[11px] font-extrabold text-amber-200">{t('account.guest')}</span>
      ) : level !== null ? (
        <span className="shrink-0 whitespace-nowrap text-[11px] font-extrabold tabular-nums text-amber-200">
          {t('levelBadge', { level })}
        </span>
      ) : null}
    </button>
  )
}

const NAV_LINK_KEYS = [
  // Ni Mode Soirée, ni Joueurs, ni Jeux, ni l'ancienne vitrine /decouvrir
  // (choix du 25/11) : on change de jeu ou de joueurs en repassant par les
  // deux cartes de l'accueil.
  { href: '/', key: 'accueil', icon: Home },
  // Français seulement : les articles de /regles n'existent qu'en français
  // (docs/rules/fr/) — le proposer à un anglophone serait une promesse non
  // tenue, même règle que la section règles de la landing.
  { href: '/regles', key: 'regles', icon: BookOpen },
  { href: '/classement', key: 'classement', icon: Trophy },
  { href: '/compte', key: 'compte', icon: User },
  // Masquée dans la coquille Capacitor (on n'envoie pas vers les stores
  // quelqu'un qui est déjà dans l'app).
  { href: '/application', key: 'application', icon: Smartphone },
] as const

type NavLinkKey = (typeof NAV_LINK_KEYS)[number]['key'] | 'supervision'

type NavLinkItem = {
  href: string
  key: NavLinkKey
  icon: typeof User
  label: string
  description: string
}

export default function Navbar() {
  const t = useTranslations('nav')
  const locale = useLocale()
  const [mounted, setMounted] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [friendsOpen, setFriendsOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const { user } = useAuth()
  // Tout ce que la barre affiche (non-lus, amis en ligne, niveau, joueurs
  // actifs) arrive en UNE requête, sondée à 60 s onglet visible seulement ;
  // silencieux en erreur — la pastille ne s'affiche alors pas.
  const {
    unread,
    friendsOnline: onlineFriendsCount,
    progression,
    presenceCount: activeCount,
    refresh: refreshBadges,
  } = useNavBadges()
  const pathname = usePathname()
  const pageMeta = usePageMeta(pathname)
  const { isFullscreen, isSupported: fsSupported, toggleFullscreen } = useFullscreen()
  const { startTour } = useTour()

  const [inApp, setInApp] = useState(false)
  useEffect(() => {
    setInApp(isCapacitorApp())
  }, [])

  // Chaque panneau (et le dialogue) est monté à SA première ouverture
  // seulement — son code n'est pas même téléchargé avant, et ouvrir le chat
  // ne doit pas télécharger le panneau amis —, puis laissé en place : il
  // garde son état (conversation ouverte, brouillon) d'une fois à l'autre.
  const [friendsMounted, setFriendsMounted] = useState(false)
  useEffect(() => {
    if (friendsOpen) setFriendsMounted(true)
  }, [friendsOpen])
  const [chatMounted, setChatMounted] = useState(false)
  useEffect(() => {
    if (chatOpen) setChatMounted(true)
  }, [chatOpen])
  const [feedbackMounted, setFeedbackMounted] = useState(false)
  useEffect(() => {
    if (feedbackOpen) setFeedbackMounted(true)
  }, [feedbackOpen])

  const links = useMemo((): NavLinkItem[] => {
    const base: NavLinkItem[] = NAV_LINK_KEYS.filter(
      ({ key }) => !(inApp && key === 'application') && !(key === 'regles' && locale !== 'fr')
    ).map(({ href, key, icon }) => ({
      href,
      key,
      icon,
      label: t(`links.${key}.label`),
      description: t(`links.${key}.description`),
    }))
    if (user && canAccessSupervision(user.role)) {
      base.push({
        href: '/supervision',
        key: 'supervision',
        icon: Shield,
        label: t('links.supervision.label'),
        description: t('links.supervision.description'),
      })
    }
    return base
  }, [user, t, inApp, locale])

  // « Revoir le tuto » se range sous « Règles » ; hors français, où cette
  // entrée n'existe pas, sous « Accueil ».
  const tourAfter = links.some((l) => l.key === 'regles') ? 'regles' : 'accueil'

  const activeHref =
    links.find((l) => pathname === l.href || pathname.startsWith(`${l.href}/`))?.href ?? null

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!drawerOpen) return
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    document.addEventListener('keydown', onEsc)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onEsc)
      document.body.style.overflow = ''
    }
  }, [drawerOpen])

  useEffect(() => {
    setDrawerOpen(false)
    setFriendsOpen(false)
    setChatOpen(false)
  }, [pathname])

  const toggleDrawer = () => setDrawerOpen((open) => !open)

  // Écran TV : plein écran sans chrome (la barre de nav n'a pas de sens sur une télé).
  if (pathname === '/tv' || pathname.startsWith('/tv/')) {
    return null
  }

  return (
    <>
      {/* safe-x + inset haut : avec `viewportFit: 'cover'` (layout.tsx) la page
          passe SOUS l'encoche — la barre doit se pousser elle-même, sinon le
          titre disparaît derrière la barre d'état / la caméra. */}
      <header className="sticky top-0 z-40 safe-x border-b border-gold/15 bg-felt-deep/85 backdrop-blur-xl supports-[backdrop-filter]:bg-felt-deep/70">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-3 sm:h-[3.75rem] sm:gap-4 sm:px-4">
          <button
            type="button"
            data-tour="nav-burger"
            aria-label={drawerOpen ? t('closeMenu') : t('openMenu')}
            aria-expanded={drawerOpen}
            onClick={toggleDrawer}
            className={cn(
              'touch-target flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all duration-200 active:scale-95 sm:h-11 sm:w-11',
              drawerOpen
                ? 'border-amber-400/40 bg-amber-500/20 text-amber-200 shadow-[0_0_16px_rgba(245,158,11,0.15)]'
                : 'border-white/10 bg-white/[0.04] text-amber-300 hover:border-amber-400/[0.35] hover:bg-amber-500/10'
            )}
          >
            {drawerOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          {/* Amis et chat : masqués sous `sm` (la barre déborderait à 360px) —
              ils sont repris dans le tiroir, badges compris. */}
          {user && (
            <button
              type="button"
              aria-label={t('manageFriends')}
              onClick={() => {
                setFriendsOpen((v) => {
                  if (v) void refreshBadges()
                  return !v
                })
              }}
              className={cn(
                'touch-target relative hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all duration-200 active:scale-95 sm:flex sm:h-11 sm:w-11',
                friendsOpen
                  ? 'border-amber-400/40 bg-amber-500/20 text-amber-200 shadow-[0_0_16px_rgba(217,164,65,0.15)]'
                  : 'border-white/10 bg-white/[0.04] text-amber-300 hover:border-amber-400/[0.35] hover:bg-amber-500/10'
              )}
            >
              <Users className="h-5 w-5" />
              {onlineFriendsCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-emerald-500 px-1 text-[9px] font-bold text-black">
                  {onlineFriendsCount}
                </span>
              )}
            </button>
          )}

          {user && (
            <button
              type="button"
              aria-label={t('chat')}
              onClick={() => setChatOpen((v) => !v)}
              className={cn(
                'touch-target relative hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all duration-200 active:scale-95 sm:flex sm:h-11 sm:w-11',
                chatOpen
                  ? 'border-sky-400/40 bg-sky-500/20 text-sky-200 shadow-[0_0_16px_rgba(56,189,248,0.15)]'
                  : 'border-white/10 bg-white/[0.04] text-sky-300 hover:border-sky-400/[0.35] hover:bg-sky-500/10'
              )}
            >
              <MessageCircle className="h-5 w-5" />
              {unread.total > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                  {unread.total > 9 ? '9+' : unread.total}
                </span>
              )}
            </button>
          )}

          {/* Plancher sous `sm` : c'est le bouton du compte qui cède (pseudo
              tronqué), pas le logo qui le chevauche. Le logo ramène aux deux
              cartes de l'accueil ; déjà dessus, il remonte en haut (sur
              téléphone c'est body qui défile, pas window). */}
          <Link
            href="/"
            onClick={(event) => {
              // Un clic modifié (nouvel onglet, nouvelle fenêtre) suit le lien normalement.
              if (pathname !== '/' || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
              event.preventDefault()
              scrollPageTop()
            }}
            className="flex min-w-[4.5rem] flex-1 items-center gap-2.5 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 sm:min-w-0 sm:gap-3"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gold/40 bg-felt-deep p-1 shadow-md transition-transform duration-200 active:scale-95 sm:h-10 sm:w-10">
              <BrandMark />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold leading-tight text-white sm:text-base">
                {mounted ? pageMeta.title : t('brand')}
              </span>
              <span className="block truncate text-[10px] text-white/45 sm:text-xs">
                {mounted ? pageMeta.subtitle : t('loading')}
              </span>
            </span>
            {/* Après le titre visible, pas à sa place : un aria-label le masquerait au lecteur d'écran. */}
            <span className="sr-only">{t('homeLink')}</span>
          </Link>

          {/* Joueurs actifs sur le site — pastille verte discrète, reprise
              telle quelle dans le tiroir sous `sm`. */}
          {activeCount !== null && activeCount > 0 && (
            <span
              title={t('activePlayers', { count: activeCount })}
              aria-label={t('activePlayers', { count: activeCount })}
              className="hidden h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-white/10 bg-white/[0.04] px-2.5 text-[11px] font-bold tabular-nums text-emerald-200 sm:flex sm:h-11 sm:px-3 sm:text-xs"
            >
              <span aria-hidden className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              {activeCount}
            </span>
          )}

          <AccountControl level={progression?.level ?? null} />

          {mounted && !inApp && fsSupported && (
            <button
              type="button"
              aria-label={isFullscreen ? t('exitFullscreen') : t('fullscreen')}
              title={isFullscreen ? t('exitFullscreen') : t('fullscreen')}
              onClick={() => void toggleFullscreen()}
              className="touch-target flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-amber-300 transition-all duration-200 hover:border-amber-400/[0.35] hover:bg-amber-500/10 active:scale-95 sm:h-11 sm:w-11"
            >
              {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
            </button>
          )}

          <LanguageSwitcher className="hidden h-9 w-[7.5rem] shrink-0 border-white/10 bg-white/[0.04] text-white sm:flex" />

          {activeHref && (
            <span className="hidden rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[10px] font-medium text-amber-200/90 sm:inline-block">
              {links.find((l) => l.href === activeHref)?.label}
            </span>
          )}
        </div>
      </header>

      <div
        className={cn(
          'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-300',
          drawerOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={() => setDrawerOpen(false)}
        aria-hidden={!drawerOpen}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t('menuLabel')}
        className={cn(
          'fixed left-0 top-0 z-[55] flex h-full w-72 max-w-[85vw] flex-col',
          'border-r border-gold/15 bg-felt-deep/[0.98] backdrop-blur-xl',
          'shadow-[4px_0_40px_rgba(0,0,0,0.6)]',
          'transform transition-transform duration-300 ease-out',
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-8 -top-8 h-40 w-40 rounded-full bg-amber-500/10 blur-[60px]" />
          <div className="absolute bottom-16 right-0 h-32 w-32 rounded-full bg-violet-500/10 blur-[50px]" />
        </div>

        <div className="relative flex items-center justify-between border-b border-white/[0.07] px-4 py-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-gold/40 bg-felt-deep p-1 shadow-lg">
              <BrandMark />
            </div>
            <div>
              <p className="text-sm font-bold leading-none text-white">{t('brand')}</p>
              <p className="mt-0.5 text-[10px] text-white/40">{t('menuLabel')}</p>
            </div>
          </div>
          <button
            type="button"
            data-tour="nav-close"
            aria-label={t('closeMenu')}
            onClick={() => setDrawerOpen(false)}
            className="touch-target flex h-9 w-9 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="relative flex-1 overflow-y-auto p-3">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-white/30">
            {t('navigation')}
          </p>
          <ul className="space-y-1">
            {links.map(({ href, key, label, icon: Icon, description }) => {
              const isActive = pathname === href || pathname.startsWith(`${href}/`)
              return (
                <Fragment key={href}>
                <li>
                  <Link
                    href={href}
                    data-tour={key === 'regles' ? 'nav-rules' : undefined}
                    onClick={() => setDrawerOpen(false)}
                    className={cn(
                      'group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-150',
                      isActive
                        ? 'bg-amber-500/[0.15] text-amber-100 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.25)]'
                        : 'text-white/70 hover:bg-white/[0.06] hover:text-white'
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                        isActive
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-white/[0.06] text-white/50 group-hover:bg-white/10 group-hover:text-white/80'
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-none">{label}</p>
                      <p className="mt-0.5 truncate text-[11px] opacity-50">{description}</p>
                    </div>
                    <ChevronRight
                      className={cn(
                        'h-3.5 w-3.5 shrink-0 transition-all',
                        isActive ? 'text-amber-400/60' : 'text-white/20 group-hover:text-white/40'
                      )}
                    />
                  </Link>
                </li>
                {key === tourAfter && (
                  <li>
                    <button
                      type="button"
                      data-tour="nav-tour"
                      onClick={() => {
                        setDrawerOpen(false)
                        startTour()
                      }}
                      className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-white/70 transition-all duration-150 hover:bg-white/[0.06] hover:text-white"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-white/50 transition-colors group-hover:bg-white/10 group-hover:text-white/80">
                        <GraduationCap className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium leading-none">{t('links.tuto.label')}</span>
                        <span className="mt-0.5 block truncate text-[11px] opacity-50">{t('links.tuto.description')}</span>
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/20 transition-all group-hover:text-white/40" />
                    </button>
                  </li>
                )}
                </Fragment>
              )
            })}
          </ul>

          {/* Repli des éléments retirés de la barre sous `sm` : rien n'est
              supprimé, tout redevient accessible ici. */}
          <div className="mt-3 space-y-1 border-t border-white/[0.07] pt-3 sm:hidden">
            {user && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false)
                    setFriendsOpen(true)
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-amber-300">
                    <Users className="h-4 w-4" />
                  </span>
                  <span className="flex-1 text-sm font-medium">{t('manageFriends')}</span>
                  {onlineFriendsCount > 0 && (
                    <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[10px] font-bold text-black">
                      {onlineFriendsCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false)
                    setChatOpen(true)
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-sky-300">
                    <MessageCircle className="h-4 w-4" />
                  </span>
                  <span className="flex-1 text-sm font-medium">{t('chat')}</span>
                  {unread.total > 0 && (
                    <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                      {unread.total > 9 ? '9+' : unread.total}
                    </span>
                  )}
                </button>
              </>
            )}
            {activeCount !== null && activeCount > 0 && (
              <p className="flex items-center gap-2 px-3 pt-1 text-[11px] font-semibold text-emerald-200/80">
                <span aria-hidden className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                {t('activePlayers', { count: activeCount })}
              </p>
            )}
          </div>
        </nav>

        <div className="relative space-y-2 border-t border-white/[0.07] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <FeedbackMenuButton
            onClick={() => {
              setDrawerOpen(false)
              setFeedbackOpen(true)
            }}
          />
          <LanguageSwitcher className="h-10 w-full border-white/10 bg-white/[0.04] text-white" />
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 px-1 pt-1 text-[11px] text-white/30">
            <Link href="/legal/cgu" onClick={() => setDrawerOpen(false)} className="hover:text-amber-400/80">
              {t('legal.cgu')}
            </Link>
            <span aria-hidden>·</span>
            <Link href="/legal/confidentialite" onClick={() => setDrawerOpen(false)} className="hover:text-amber-400/80">
              {t('legal.confidentialite')}
            </Link>
            <span aria-hidden>·</span>
            <Link href="/legal/mentions-legales" onClick={() => setDrawerOpen(false)} className="hover:text-amber-400/80">
              {t('legal.mentionsLegales')}
            </Link>
            <span aria-hidden>·</span>
            {/* Retrait du consentement aussi simple que l'accord : rouvre le
                bandeau statistiques, sans effacer ses cookies. */}
            <button
              type="button"
              onClick={() => {
                setDrawerOpen(false)
                openAnalyticsConsent()
              }}
              className="hover:text-amber-400/80"
            >
              {t('legal.analytics')}
            </button>
          </div>
        </div>
      </aside>

      {feedbackMounted && <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />}

      {user && (friendsMounted || chatMounted) && (
        <SocialPanels
          friendsMounted={friendsMounted}
          chatMounted={chatMounted}
          friendsOpen={friendsOpen}
          chatOpen={chatOpen}
          onCloseFriends={() => {
            setFriendsOpen(false)
            void refreshBadges()
          }}
          onCloseChat={() => {
            setChatOpen(false)
            void refreshBadges()
          }}
          unread={unread}
          onRead={refreshBadges}
        />
      )}
    </>
  )
}

/**
 * Panneaux amis + chat, et la SEULE liste d'amis de la barre. Elle vivait à
 * la racine de la barre — donc chargée sur chaque page, pour un compte que
 * /api/me/nav sert déjà — et le chat en rechargeait une deuxième à lui. Ici,
 * elle ne part qu'à la première ouverture d'un des deux panneaux, et les deux
 * lisent la même. Chaque panneau n'est rendu (donc téléchargé) qu'une fois
 * ouvert au moins une fois — `friendsMounted` / `chatMounted`.
 */
function SocialPanels({
  friendsMounted,
  chatMounted,
  friendsOpen,
  chatOpen,
  onCloseFriends,
  onCloseChat,
  unread,
  onRead,
}: {
  friendsMounted: boolean
  chatMounted: boolean
  friendsOpen: boolean
  chatOpen: boolean
  onCloseFriends: () => void
  onCloseChat: () => void
  unread: ChatUnread
  onRead: () => void
}) {
  // Un seul état d'amis pour le panneau amis (gestionnaire compris), le chat
  // et « Inviter à ma table » : une mutation dans le gestionnaire se voit
  // partout sans relecture.
  const friendsState = useFriends()
  const { friends, refresh: refreshFriends } = friendsState

  // Liste relue à chaque réouverture (pas à la première : le hook vient de la
  // charger) — les amis ne sont pas sondés, c'est le seul moment où un statut
  // en ligne ou une demande reçue entre-temps peut se rafraîchir.
  const anyOpen = friendsOpen || chatOpen
  const firstOpenRef = useRef(true)
  useEffect(() => {
    if (!anyOpen) return
    if (firstOpenRef.current) {
      firstOpenRef.current = false
      return
    }
    void refreshFriends()
  }, [anyOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {friendsMounted && (
        <FriendsPanel open={friendsOpen} onClose={onCloseFriends} friendsState={friendsState} />
      )}
      {chatMounted && (
        <ChatPanel
          open={chatOpen}
          onClose={onCloseChat}
          unread={unread}
          onRead={onRead}
          friends={friends}
          refreshFriends={refreshFriends}
        />
      )}
    </>
  )
}
