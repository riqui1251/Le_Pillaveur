import { PC_BANK as EN_BANK } from './data/en'
import { PC_BANK as ES_BANK } from './data/es'
import { PC_BANK as FR_BANK } from './data/fr'
import { PC_BANK as IT_BANK } from './data/it'
import { pcChallengeSource, pcLangOf, type PcLang } from './load'
import type { PcChallengeSource } from './engine'

/**
 * Banques de défis côté SERVEUR (partie en ligne) : les quatre langues, importées statiquement.
 * Seul server-adapter.ts l'importe ; l'écran en ligne et la TV reçoivent le défi courant dans la
 * vue, jamais la banque.
 */

const SOURCES: Record<PcLang, PcChallengeSource> = {
  fr: pcChallengeSource(FR_BANK),
  en: pcChallengeSource(EN_BANK),
  es: pcChallengeSource(ES_BANK),
  it: pcChallengeSource(IT_BANK),
}

/** Défis d'une langue de salle ; inconnue ou absente → français. */
export function pcServerSource(lang: string | null | undefined): PcChallengeSource {
  return SOURCES[pcLangOf(lang)]
}
