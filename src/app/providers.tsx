"use client"

import { ThemeProvider } from 'next-themes'
import { BrowserCapabilitiesProvider } from '@/components/providers/BrowserCapabilitiesProvider'
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
            {children}
          </ToastProvider>
        </PlayerEffectsProvider>
      </BrowserCapabilitiesProvider>
    </ThemeProvider>
  )
} 