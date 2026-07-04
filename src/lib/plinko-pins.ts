/**
 * Définitions PARTAGÉES des pins spéciaux Plinko (type + couleur + pictogramme).
 * Extrait du jeu pour être réutilisé par le rendu TV (cast) sans dupliquer.
 */

export type SpecialPinType =
  | 'multiplier'
  | 'addBall'
  | 'addSip'
  | 'subtractSip'
  | 'cancellation'
  | 'colorSwap'
  | 'mystery'
  | 'shake'
  | 'roundDrinks'
  | 'jackpot'
  | 'teleportation'
  | 'gravityFlip'
  | 'slowMotion'
  | 'split'
  | 'scoreSwap'
  | 'doubleEffect'
  | 'magnetLeft'
  | 'magnetRight'

/**
 * Couleurs ET pictogramme de chaque pin spécial. Le pictogramme (glyph) est
 * l'identifiant PRIMAIRE : la couleur seule ne suffit pas à distinguer 18 types
 * (et est inaccessible aux daltoniens). magnetLeft / magnetRight partagent la
 * même famille de couleur : c'est la flèche (← / →) qui les distingue.
 */
export const SPECIAL_PIN_COLORS: Record<SpecialPinType, { border: string; bg: string; glyph: string }> = {
  multiplier:   { border: 'border-red-900',     bg: 'bg-red-400',     glyph: '×2' },
  addBall:      { border: 'border-blue-900',    bg: 'bg-blue-400',    glyph: '🎱' },
  addSip:       { border: 'border-green-900',   bg: 'bg-green-400',   glyph: '+1' },
  subtractSip:  { border: 'border-orange-900',  bg: 'bg-orange-400',  glyph: '−1' },
  cancellation: { border: 'border-gray-900',    bg: 'bg-gray-300',    glyph: '🚫' },
  colorSwap:    { border: 'border-pink-900',    bg: 'bg-pink-400',    glyph: '🎨' },
  mystery:      { border: 'border-indigo-900',  bg: 'bg-indigo-400',  glyph: '❓' },
  shake:        { border: 'border-yellow-900',  bg: 'bg-yellow-300',  glyph: '🔀' },
  roundDrinks:  { border: 'border-teal-900',    bg: 'bg-teal-400',    glyph: '🍻' },
  jackpot:      { border: 'border-amber-900',   bg: 'bg-amber-300',   glyph: '💰' },
  teleportation:{ border: 'border-purple-900',  bg: 'bg-purple-400',  glyph: '🌀' },
  gravityFlip:  { border: 'border-sky-900',     bg: 'bg-sky-400',     glyph: '↕' },
  slowMotion:   { border: 'border-cyan-900',    bg: 'bg-cyan-300',    glyph: '🐌' },
  split:        { border: 'border-lime-900',    bg: 'bg-lime-400',    glyph: '✂️' },
  scoreSwap:    { border: 'border-fuchsia-900', bg: 'bg-fuchsia-400', glyph: '🔄' },
  doubleEffect: { border: 'border-rose-900',    bg: 'bg-rose-400',    glyph: '💥' },
  magnetLeft:   { border: 'border-slate-900',   bg: 'bg-slate-400',   glyph: '←' },
  magnetRight:  { border: 'border-zinc-900',    bg: 'bg-zinc-500',    glyph: '→' },
}
