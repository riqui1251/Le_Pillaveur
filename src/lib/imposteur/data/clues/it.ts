// ⚠️ SERVER-ONLY : révèle l'autre mot de la paire. Jamais importé côté client.
import type { ImposteurClueSet } from './index'
import { IMPOSTEUR_CLUES_IT_LOT_01 } from './it/lot-01'
import { IMPOSTEUR_CLUES_IT_LOT_02 } from './it/lot-02'
import { IMPOSTEUR_CLUES_IT_LOT_03 } from './it/lot-03'
import { IMPOSTEUR_CLUES_IT_LOT_04 } from './it/lot-04'
import { IMPOSTEUR_CLUES_IT_LOT_05 } from './it/lot-05'
import { IMPOSTEUR_CLUES_IT_LOT_06 } from './it/lot-06'
import { IMPOSTEUR_CLUES_IT_LOT_07 } from './it/lot-07'
import { IMPOSTEUR_CLUES_IT_LOT_08 } from './it/lot-08'

/** Les 8 lots dans l'ordre des paires de data/it.ts (23 chacun) — lus un par un par le validateur. */
export const IMPOSTEUR_CLUES_IT_LOTS: readonly Record<string, ImposteurClueSet>[] = [
  IMPOSTEUR_CLUES_IT_LOT_01,
  IMPOSTEUR_CLUES_IT_LOT_02,
  IMPOSTEUR_CLUES_IT_LOT_03,
  IMPOSTEUR_CLUES_IT_LOT_04,
  IMPOSTEUR_CLUES_IT_LOT_05,
  IMPOSTEUR_CLUES_IT_LOT_06,
  IMPOSTEUR_CLUES_IT_LOT_07,
  IMPOSTEUR_CLUES_IT_LOT_08,
]

export const IMPOSTEUR_CLUES_IT: Record<string, ImposteurClueSet> = {
  ...IMPOSTEUR_CLUES_IT_LOT_01,
  ...IMPOSTEUR_CLUES_IT_LOT_02,
  ...IMPOSTEUR_CLUES_IT_LOT_03,
  ...IMPOSTEUR_CLUES_IT_LOT_04,
  ...IMPOSTEUR_CLUES_IT_LOT_05,
  ...IMPOSTEUR_CLUES_IT_LOT_06,
  ...IMPOSTEUR_CLUES_IT_LOT_07,
  ...IMPOSTEUR_CLUES_IT_LOT_08,
}
