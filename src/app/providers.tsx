"use client"

import { ThemeProvider } from 'next-themes'
import { BrowserCapabilitiesProvider } from '@/components/providers/BrowserCapabilitiesProvider'
import { PlayerEffectsProvider } from '@/components/providers/PlayerEffectsProvider'
import { AuthProvider } from '@/components/providers/AuthProvider'
import { VisitTracker } from '@/components/analytics/VisitTracker'
import { ToastProvider } from '@/components/ui/toast'
import { AgeGate } from '@/components/legal/AgeGate'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      forcedTheme="dark"
      themes={['dark']}
    >
      <AuthProvider>
        <BrowserCapabilitiesProvider>
          <PlayerEffectsProvider>
            <ToastProvider>
              <VisitTracker />
              <AgeGate />
              {children}
            </ToastProvider>
          </PlayerEffectsProvider>
        </BrowserCapabilitiesProvider>
      </AuthProvider>
    </ThemeProvider>
  )
} 