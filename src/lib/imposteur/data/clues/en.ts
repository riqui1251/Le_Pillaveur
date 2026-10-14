// ⚠️ SERVER-ONLY : révèle l'autre mot de la paire. Jamais importé côté client.
import type { ImposteurClueSet } from './index'
import { IMPOSTEUR_CLUES_EN_LOT_01 } from './en/lot-01'
import { IMPOSTEUR_CLUES_EN_LOT_02 } from './en/lot-02'
import { IMPOSTEUR_CLUES_EN_LOT_03 } from './en/lot-03'
import { IMPOSTEUR_CLUES_EN_LOT_04 } from './en/lot-04'
import { IMPOSTEUR_CLUES_EN_LOT_05 } from './en/lot-05'
import { IMPOSTEUR_CLUES_EN_LOT_06 } from './en/lot-06'
import { IMPOSTEUR_CLUES_EN_LOT_07 } from './en/lot-07'
import { IMPOSTEUR_CLUES_EN_LOT_08 } from './en/lot-08'

/** Les 8 lots dans l'ordre des paires de data/en.ts (23 chacun) — lus un par un par le validateur. */
export const IMPOSTEUR_CLUES_EN_LOTS: readonly Record<string, ImposteurClueSet>[] = [
  IMPOSTEUR_CLUES_EN_LOT_01,
  IMPOSTEUR_CLUES_EN_LOT_02,
  IMPOSTEUR_CLUES_EN_LOT_03,
  IMPOSTEUR_CLUES_EN_LOT_04,
  IMPOSTEUR_CLUES_EN_LOT_05,
  IMPOSTEUR_CLUES_EN_LOT_06,
  IMPOSTEUR_CLUES_EN_LOT_07,
  IMPOSTEUR_CLUES_EN_LOT_08,
]

export const IMPOSTEUR_CLUES_EN: Record<string, ImposteurClueSet> = {
  ...IMPOSTEUR_CLUES_EN_LOT_01,
  ...IMPOSTEUR_CLUES_EN_LOT_02,
  ...IMPOSTEUR_CLUES_EN_LOT_03,
  ...IMPOSTEUR_CLUES_EN_LOT_04,
  ...IMPOSTEUR_CLUES_EN_LOT_05,
  ...IMPOSTEUR_CLUES_EN_LOT_06,
  ...IMPOSTEUR_CLUES_EN_LOT_07,
  ...IMPOSTEUR_CLUES_EN_LOT_08,
}
