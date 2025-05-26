"use client"

import { ThemeProvider } from 'next-themes'
import { BrowserCapabilitiesProvider } from '@/components/providers/BrowserCapabilitiesProvider'
import { MobileClassProvider } from '@/components/providers/MobileClassProvider'
import { PlayerEffectsProvider } from '@/components/providers/PlayerEffectsProvider'
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
      <BrowserCapabilitiesProvider>
        <PlayerEffectsProvider>
          <ToastProvider>
            <MobileClassProvider />
            {children}
          </ToastProvider>
        </PlayerEffectsProvider>
      </BrowserCapabilitiesProvider>
    </ThemeProvider>
  )
} 