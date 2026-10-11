import type { Metadata } from 'next'

// Page personnelle ou utilitaire : à ne pas indexer par les moteurs.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  // Marqueur lu par le service worker (src/app/sw.js/route.ts) : la page des
  // joueurs est protégée, et sans réseau il ne doit la servir que s'il a bien
  // mémorisé ELLE — pas la page compte que le middleware rend à sa place.
  other: { 'lp-page': 'joueurs' },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
