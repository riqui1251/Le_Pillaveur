"use client"

import { ThemeProvider } from 'next-themes'
import { BrowserCapabilitiesProvider } from '@/components/providers/BrowserCapabilitiesProvider'
import { PlayerEffectsProvider } from '@/components/providers/PlayerEffectsProvider'
import { AuthProvider } from '@/components/providers/AuthProvider'
import { AmbianceAttribute } from '@/components/providers/AmbianceAttribute'
import { OnlineRoomProvider } from '@/components/providers/OnlineRoomProvider'
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
        <OnlineRoomProvider>
          <BrowserCapabilitiesProvider>
            <PlayerEffectsProvider>
              <ToastProvider>
                <AmbianceAttribute />
                <VisitTracker />
                <AgeGate />
                {children}
              </ToastProvider>
            </PlayerEffectsProvider>
          </BrowserCapabilitiesProvider>
        </OnlineRoomProvider>
      </AuthProvider>
    </ThemeProvider>
  )
} 