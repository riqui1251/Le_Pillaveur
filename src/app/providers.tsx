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
import { FirstGameDeviceInit } from '@/components/feedback/FirstGameDeviceInit'
import { ServiceWorkerRegistration } from '@/components/pwa/ServiceWorkerRegistration'
import { TourProvider } from '@/components/tour/TourProvider'
import { AccountSheetsProvider } from '@/components/account/AccountSheets'

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
                {/* En tête des frères : son effet passe avant ceux de la page
                    (une première visite qui atterrit sur un jeu reste « neuve »). */}
                <FirstGameDeviceInit />
                <AmbianceAttribute />
                <VisitTracker />
                <AgeGate />
                {/* Jeux locaux hors ligne : enregistre le service worker après le
                    chargement — voir src/lib/offline/. */}
                <ServiceWorkerRegistration />
                {/* Tuto des nouveaux joueurs : un booléen et une fonction ici,
                    le reste se télécharge à l'ouverture (TourLayer). */}
                <TourProvider>
                  {/* Connexion et « Mon compte » en feuilles, ouvertes depuis
                      la barre ou l'accueil (src/components/account). */}
                  <AccountSheetsProvider>{children}</AccountSheetsProvider>
                </TourProvider>
              </ToastProvider>
            </PlayerEffectsProvider>
          </BrowserCapabilitiesProvider>
        </OnlineRoomProvider>
      </AuthProvider>
    </ThemeProvider>
  )
} 