import type { LineTranslator } from './bot-speech-feed'

/**
 * TICS RETOUCHÉS PAR JEU. Les tics des personas sont les copies conformes de
 * ceux du Loup-Garou (`botTic.<clé>`), mais un tic qui contient un mot de la
 * pioche du jeu (« Minute, papillon ! » quand on dessine un papillon) ne se
 * dit pas : sa variante `botTicAlt.<clé>` le remplace toujours dans ce jeu.
 * Sans variante, le tic reste tel quel ; le reste du catalogue passe sans
 * détour. Le tic qui trinque, lui, se tait en Sans alcool comme dans tous les
 * jeux (ambianceLineTranslator, à composer par-dessus).
 */
export function ticOverrides(tr: LineTranslator): LineTranslator {
  const swap = (key: string) => {
    if (!key.startsWith('botTic.')) return key
    const alt = `botTicAlt.${key.slice('botTic.'.length)}`
    return tr.has(alt) ? alt : key
  }
  return { has: (key) => tr.has(swap(key)), format: (key, values) => tr.format(swap(key), values) }
}
