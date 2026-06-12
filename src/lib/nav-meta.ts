import { GAMES } from '@/lib/games'

export type PageMeta = {
  title: string
  subtitle: string
}

const STATIC_PAGES: Record<string, PageMeta> = {
  '/joueurs': { title: 'Joueurs', subtitle: 'Gérer l\'équipe' },
  '/jeux': { title: 'Jeux', subtitle: 'Choisir un jeu' },
  '/classement': { title: 'Classement', subtitle: 'Scores et stats' },
  '/compte': { title: 'Compte', subtitle: 'Connexion et profil' },
  '/supervision': { title: 'Supervision', subtitle: 'Administration' },
  '/achievements': { title: 'Succès', subtitle: 'Trophées débloqués' },
  '/stats': { title: 'Statistiques', subtitle: 'Historique' },
}

export function getPageMeta(pathname: string): PageMeta {
  if (STATIC_PAGES[pathname]) return STATIC_PAGES[pathname]

  const game = GAMES.find((g) => pathname === g.path || pathname.startsWith(`${g.path}/`))
  if (game) {
    return { title: game.title, subtitle: 'Partie en cours' }
  }

  return { title: 'Le Pillaveur', subtitle: 'Jeux à boire entre amis' }
}

export function getNavHrefMeta(href: string): PageMeta | null {
  return STATIC_PAGES[href] ?? null
}
