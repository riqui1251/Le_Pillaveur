import type { Metadata } from 'next'
// Cosmétiques en ligne (pseudo animé, cadre, écusson et collection de la fiche
// compte) — servis à ce segment seulement, sortis de globals.css pour alléger
// la vitrine et les règles.
import '@/styles/online-cosmetics.css'

// Page personnelle ou utilitaire : à ne pas indexer par les moteurs.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
