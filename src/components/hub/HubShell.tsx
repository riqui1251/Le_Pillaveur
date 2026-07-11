"use client"

import { ReactNode } from "react"
import { useTranslations } from "next-intl"

interface HubShellProps {
  title: string
  subtitle: string
  children: ReactNode
  headerExtra?: ReactNode
}

export function HubShell({ title, subtitle, children, headerExtra }: HubShellProps) {
  const t = useTranslations('hub')
  return (
    // overflow-x-clip (pas hidden) : hidden créerait un scroll-container
    // qui casserait le position:sticky des enfants (recherche du hub).
    <main className="relative min-h-screen overflow-x-clip text-white">
      {/* Lueurs sur le feutre (le fond radial vient du layout .app-felt). */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-gold/10 blur-[100px]" />
        <div className="absolute right-0 top-32 h-80 w-80 rounded-full bg-gold/[0.07] blur-[110px]" />
        <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-suit-red/[0.06] blur-[90px]" />
      </div>

      <div className="relative container mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
        <header className="mb-8 space-y-3 text-center sm:mb-10">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-gold/80">
            {t('brand')}
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
            <span className="bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-300 bg-clip-text text-transparent">
              {title}
            </span>
          </h1>
          <p className="mx-auto max-w-xl text-sm text-white/65 sm:text-base">{subtitle}</p>
          {headerExtra && <div className="pt-2">{headerExtra}</div>}
        </header>

        {children}
      </div>
    </main>
  )
}
