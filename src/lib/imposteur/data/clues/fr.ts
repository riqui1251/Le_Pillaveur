// ⚠️ SERVER-ONLY : révèle l'autre mot de la paire. Jamais importé côté client.
import type { ImposteurClueSet } from './index'
import { IMPOSTEUR_CLUES_FR_LOT_01 } from './fr/lot-01'
import { IMPOSTEUR_CLUES_FR_LOT_02 } from './fr/lot-02'
import { IMPOSTEUR_CLUES_FR_LOT_03 } from './fr/lot-03'
import { IMPOSTEUR_CLUES_FR_LOT_04 } from './fr/lot-04'
import { IMPOSTEUR_CLUES_FR_LOT_05 } from './fr/lot-05'
import { IMPOSTEUR_CLUES_FR_LOT_06 } from './fr/lot-06'
import { IMPOSTEUR_CLUES_FR_LOT_07 } from './fr/lot-07'
import { IMPOSTEUR_CLUES_FR_LOT_08 } from './fr/lot-08'

/** Les 8 lots dans l'ordre des paires de data/fr.ts (23 chacun) — lus un par un par le validateur. */
export const IMPOSTEUR_CLUES_FR_LOTS: readonly Record<string, ImposteurClueSet>[] = [
  IMPOSTEUR_CLUES_FR_LOT_01,
  IMPOSTEUR_CLUES_FR_LOT_02,
  IMPOSTEUR_CLUES_FR_LOT_03,
  IMPOSTEUR_CLUES_FR_LOT_04,
  IMPOSTEUR_CLUES_FR_LOT_05,
  IMPOSTEUR_CLUES_FR_LOT_06,
  IMPOSTEUR_CLUES_FR_LOT_07,
  IMPOSTEUR_CLUES_FR_LOT_08,
]

export const IMPOSTEUR_CLUES_FR: Record<string, ImposteurClueSet> = {
  ...IMPOSTEUR_CLUES_FR_LOT_01,
  ...IMPOSTEUR_CLUES_FR_LOT_02,
  ...IMPOSTEUR_CLUES_FR_LOT_03,
  ...IMPOSTEUR_CLUES_FR_LOT_04,
  ...IMPOSTEUR_CLUES_FR_LOT_05,
  ...IMPOSTEUR_CLUES_FR_LOT_06,
  ...IMPOSTEUR_CLUES_FR_LOT_07,
  ...IMPOSTEUR_CLUES_FR_LOT_08,
}
