// ⚠️ SERVER-ONLY : révèle l'autre mot de la paire. Jamais importé côté client.
import type { ImposteurClueSet } from './index'
import { IMPOSTEUR_CLUES_ES_LOT_01 } from './es/lot-01'
import { IMPOSTEUR_CLUES_ES_LOT_02 } from './es/lot-02'
import { IMPOSTEUR_CLUES_ES_LOT_03 } from './es/lot-03'
import { IMPOSTEUR_CLUES_ES_LOT_04 } from './es/lot-04'
import { IMPOSTEUR_CLUES_ES_LOT_05 } from './es/lot-05'
import { IMPOSTEUR_CLUES_ES_LOT_06 } from './es/lot-06'
import { IMPOSTEUR_CLUES_ES_LOT_07 } from './es/lot-07'
import { IMPOSTEUR_CLUES_ES_LOT_08 } from './es/lot-08'

/** Les 8 lots dans l'ordre des paires de data/es.ts (23 chacun) — lus un par un par le validateur. */
export const IMPOSTEUR_CLUES_ES_LOTS: readonly Record<string, ImposteurClueSet>[] = [
  IMPOSTEUR_CLUES_ES_LOT_01,
  IMPOSTEUR_CLUES_ES_LOT_02,
  IMPOSTEUR_CLUES_ES_LOT_03,
  IMPOSTEUR_CLUES_ES_LOT_04,
  IMPOSTEUR_CLUES_ES_LOT_05,
  IMPOSTEUR_CLUES_ES_LOT_06,
  IMPOSTEUR_CLUES_ES_LOT_07,
  IMPOSTEUR_CLUES_ES_LOT_08,
]

export const IMPOSTEUR_CLUES_ES: Record<string, ImposteurClueSet> = {
  ...IMPOSTEUR_CLUES_ES_LOT_01,
  ...IMPOSTEUR_CLUES_ES_LOT_02,
  ...IMPOSTEUR_CLUES_ES_LOT_03,
  ...IMPOSTEUR_CLUES_ES_LOT_04,
  ...IMPOSTEUR_CLUES_ES_LOT_05,
  ...IMPOSTEUR_CLUES_ES_LOT_06,
  ...IMPOSTEUR_CLUES_ES_LOT_07,
  ...IMPOSTEUR_CLUES_ES_LOT_08,
}
