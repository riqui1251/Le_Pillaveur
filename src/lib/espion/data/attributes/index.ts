import type { EspionLocationId } from '../locations'
import type { EspionAttributes } from '../questions'
import { ESPION_ATTRIBUTES_LOT_01 } from './lot-01'
import { ESPION_ATTRIBUTES_LOT_02 } from './lot-02'
import { ESPION_ATTRIBUTES_LOT_03 } from './lot-03'
import { ESPION_ATTRIBUTES_LOT_04 } from './lot-04'
import { ESPION_ATTRIBUTES_LOT_05 } from './lot-05'

/**
 * ⚠️ SERVEUR SEUL : le carnet lieu × question → valeur, le même dans les 4
 * langues. Il ne révèle pas le lieu tiré, mais dans le bundle client il
 * donnerait à un espion humain un filtre exact contre les autres humains.
 * Seuls server-adapter.ts et ce dossier l'importent (data/attributes.test.ts,
 * règle G5) ; le cerveau des bots le reçoit en dépendance (`attrsOf`), sans
 * l'importer.
 */
export type EspionAttributeLot = Partial<Record<EspionLocationId, EspionAttributes>>

/** Lieux par lot, pris dans l'ordre de ESPION_LOCATION_IDS (lot-01 = lieux 1 à 15). */
export const ESPION_ATTRIBUTE_LOT_SIZE = 15

/** Les 5 lots dans l'ordre, lus un par un par le validateur et le brief. */
export const ESPION_ATTRIBUTE_LOTS: readonly EspionAttributeLot[] = [
  ESPION_ATTRIBUTES_LOT_01,
  ESPION_ATTRIBUTES_LOT_02,
  ESPION_ATTRIBUTES_LOT_03,
  ESPION_ATTRIBUTES_LOT_04,
  ESPION_ATTRIBUTES_LOT_05,
]

const ESPION_ATTRIBUTES: EspionAttributeLot = Object.assign({}, ...ESPION_ATTRIBUTE_LOTS)

/** Réponses du lieu à chaque question ; null seulement hors du carnet, que le validateur exige complet. */
export function espionAttrsOf(id: EspionLocationId): Readonly<EspionAttributes> | null {
  return ESPION_ATTRIBUTES[id] ?? null
}
