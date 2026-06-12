"use client"

import { ThemeProvider } from 'next-themes'
import { BrowserCapabilitiesProvider } from '@/components/providers/BrowserCapabilitiesProvider'
import { PlayerEffectsProvider } from '@/components/providers/PlayerEffectsProvider'
import { AuthProvider } from '@/components/providers/AuthProvider'
import { VisitTracker } from '@/components/analytics/VisitTracker'
import { ToastProvider } from '@/components/ui/toast'

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
              {children}
            </ToastProvider>
          </PlayerEffectsProvider>
        </BrowserCapabilitiesProvider>
      </AuthProvider>
    </ThemeProvider>
  )
} 