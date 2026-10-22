import type { LineTranslator } from './bot-speech-feed'

/**
 * TICS RETOUCHÉS PAR JEU. Les tics des personas sont les copies conformes de
 * ceux du Loup-Garou (`botTic.<clé>`), mais deux cas ne les supportent pas :
 *   • l'ambiance « Sans alcool » : le tic de Marcel trinque (« …tchin ! ») ;
 *     sa variante `botTicSoft.<clé>` le remplace quand `soft` ;
 *   • un tic qui contient un mot de la pioche du jeu (« Minute, papillon ! »
 *     quand on dessine un papillon) : sa variante `botTicAlt.<clé>` le
 *     remplace toujours dans ce jeu.
 * Sans variante, le tic reste tel quel ; le reste du catalogue passe sans
 * détour. Les tests des catalogues tiennent ces variantes à jour.
 */
export function ticOverrides(tr: LineTranslator, soft: boolean): LineTranslator {
  const swap = (key: string) => {
    if (!key.startsWith('botTic.')) return key
    const ticKey = key.slice('botTic.'.length)
    if (soft && tr.has(`botTicSoft.${ticKey}`)) return `botTicSoft.${ticKey}`
    if (tr.has(`botTicAlt.${ticKey}`)) return `botTicAlt.${ticKey}`
    return key
  }
  return { has: (key) => tr.has(swap(key)), format: (key, values) => tr.format(swap(key), values) }
}
