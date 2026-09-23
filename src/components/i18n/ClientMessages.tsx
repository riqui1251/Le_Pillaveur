'use client'

import { useMemo } from 'react'
import { NextIntlClientProvider, useLocale, useMessages, type AbstractIntlMessages } from 'next-intl'
import { mergeMessages } from '@/i18n/messages-slices'

/**
 * Fournisseur de messages IMBRIQUÉ : ajoute une tranche du catalogue (les
 * textes d'un jeu, la supervision, tous les jeux pour la TV) à ce que le
 * layout de langue fournit déjà — voir src/i18n/messages-slices.ts.
 *
 * Pourquoi ce composant et pas un NextIntlClientProvider posé tel quel dans
 * chaque layout de segment : en next-intl 4.13 (use-intl/react, IntlProvider),
 * un fournisseur enfant REMPLACE les messages du parent — `messages` omis, il
 * hérite du parent ; fourni, il ne fusionne rien. Et sa variante serveur
 * retombe sur `getMessages()`, le catalogue COMPLET, dès qu'on oublie la prop.
 * Donner « socle + tranche » à l'enfant marcherait, mais sérialiserait le socle
 * une seconde fois dans le HTML de chaque page de jeu. Ici seule la tranche
 * voyage : la fusion avec le socle se fait au rendu, à partir du contexte
 * parent — même entrée, même résultat sur le serveur et dans le navigateur,
 * donc rien à réconcilier à l'hydratation.
 *
 * Formats, fuseau et gestion d'erreur ne sont pas repassés : non fournis, le
 * fournisseur enfant les hérite du parent.
 */
export function ClientMessages({
  messages,
  children,
}: {
  messages: AbstractIntlMessages
  children: React.ReactNode
}) {
  const locale = useLocale()
  const base = useMessages()
  const merged = useMemo(() => mergeMessages(base, messages), [base, messages])
  return (
    <NextIntlClientProvider locale={locale} messages={merged}>
      {children}
    </NextIntlClientProvider>
  )
}
