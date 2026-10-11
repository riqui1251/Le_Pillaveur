import fr from '../../../messages/fr.json'
import en from '../../../messages/en.json'
import es from '../../../messages/es.json'
import it from '../../../messages/it.json'
import { normalizeAppLocale } from '@/lib/locale-utils'

/**
 * Les trois textes de la page de secours MINIMALE du service worker (rendue
 * quand même la page hors ligne n'est pas en cache), lus dans les catalogues
 * JSON comme le fait src/i18n/request.ts — le worker n'a pas next-intl.
 */
const catalogs = { fr, en, es, it } as const

type OfflineMessages = { title: string; lead: string; retry: string }

export function offlineStrings(locale: string): OfflineMessages {
  const { offline } = catalogs[normalizeAppLocale(locale)]
  return { title: offline.title, lead: offline.lead, retry: offline.retry }
}
