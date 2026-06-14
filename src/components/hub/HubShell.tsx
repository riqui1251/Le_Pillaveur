"use client"

import { ReactNode } from "react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"

type HubStep = "joueurs" | "jeux"

interface HubShellProps {
  step: HubStep
  title: string
  subtitle: string
  children: ReactNode
  headerExtra?: ReactNode
}

export function HubShell({ step, title, subtitle, children, headerExtra }: HubShellProps) {
  const t = useTranslations('hub')
  const steps = [
    { id: "joueurs" as const, label: t('steps.joueurs'), number: 1 },
    { id: "jeux" as const, label: t('steps.jeux'), number: 2 },
  ]
  const activeIndex = steps.findIndex((s) => s.id === step)

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
        <nav aria-label={t('stepsAria')} className="mb-8 flex items-center justify-center gap-2 sm:gap-4">
          {steps.map((s, index) => {
            const isActive = s.id === step
            const isDone = index < activeIndex

            return (
              <div key={s.id} className="flex items-center gap-2 sm:gap-4">
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-all sm:px-4",
                    isActive && "border-amber-400/50 bg-amber-500/15 text-amber-100 shadow-[0_0_24px_rgba(245,158,11,0.2)]",
                    isDone && "border-emerald-400/40 bg-emerald-500/10 text-emerald-100",
                    !isActive && !isDone && "border-white/10 bg-white/[0.03] text-white/50"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                      isActive && "bg-amber-500 text-black",
                      isDone && "bg-emerald-500 text-black",
                      !isActive && !isDone && "bg-white/10 text-white/60"
                    )}
                  >
                    {isDone ? "✓" : s.number}
                  </span>
                  <span className="font-medium">{s.label}</span>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={cn(
                      "hidden h-px w-8 sm:block sm:w-14",
                      index < activeIndex ? "bg-emerald-500/50" : "bg-white/10"
                    )}
                  />
                )}
              </div>
            )
          })}
        </nav>

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
