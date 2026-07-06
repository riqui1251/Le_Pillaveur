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
    <main className="relative min-h-screen overflow-hidden bg-[#07060b] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-amber-500/20 blur-[100px]" />
        <div className="absolute right-0 top-32 h-80 w-80 rounded-full bg-violet-600/25 blur-[110px]" />
        <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-rose-500/15 blur-[90px]" />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      <div className="relative container mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
        <header className="mb-8 space-y-3 text-center sm:mb-10">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300/80">
            {t('brand')}
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl md:text-5xl">
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
