import fs from 'fs'
import path from 'path'

/**
 * Pages « règles » SEO : un article markdown par jeu EN LIGNE et par langue,
 * sous docs/rules/<langue>/ comme les documents légaux (embarqués tels quels
 * dans l'image Docker). Le français fait référence : les trois autres langues
 * en sont traduites, et un test tient les quatre versions alignées (mêmes
 * articles, même effectif, même forme). Titre et extrait SEO vivent dans le
 * catalogue de messages, sous `rules.articles.<id>`.
 */

import { RULES_GAME_IDS, isRulesGameId, type RulesGameId } from './rules-ids'

export { RULES_GAME_IDS, isRulesGameId, type RulesGameId }

const RULES_ROOT = path.join(process.cwd(), 'docs', 'rules')

const SUPPORTED_LOCALES = new Set(['fr', 'en', 'es', 'it'])

/**
 * L'article dans la langue demandée, le français en repli si la traduction
 * manque (une langue inconnue vaut le français).
 */
export function loadRulesDoc(id: RulesGameId, locale = 'fr'): string | null {
  const lang = SUPPORTED_LOCALES.has(locale) ? locale : 'fr'
  for (const candidate of lang === 'fr' ? ['fr'] : [lang, 'fr']) {
    try {
      return fs.readFileSync(path.join(RULES_ROOT, candidate, `${id}.md`), 'utf-8')
    } catch {
      // langue suivante
    }
  }
  return null
}
