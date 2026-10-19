import type { TvPreviewFixture } from '../fixture-kit'
import { build as salle } from './salle'
import { build as petitBuveur } from './petit-buveur'
import { build as petitBuveurLocal } from './petit-buveur-local'
import { build as toucherCoule } from './toucher-coule'
import { build as quiz } from './quiz'
import { build as menteur } from './menteur'
import { build as imposteur } from './imposteur'
import { build as loupGarou } from './loup-garou'
import { build as game1220 } from './game-1220'
import { build as purple } from './purple'
import { build as bluff } from './bluff'
import { build as espion } from './espion'
import { build as tabou } from './tabou'
import { build as crobard } from './crobard'
import { build as telephoneDessine } from './telephone-dessine'
import { build as sansFiltre } from './sans-filtre'
import { build as motsCodes } from './mots-codes'
import { build as dilemmes } from './dilemmes'
import { build as petitBac } from './petit-bac'
import { build as president } from './president'
import { build as plinko } from './plinko'
import { build as pmu } from './pmu'

/** Un module par jeu : chacun construit ses états à la demande (une fixture cassée n'empêche pas les autres). */
export const PREVIEW_GAMES: { game: string; build: () => TvPreviewFixture[] }[] = [
  { game: 'salle', build: salle },
  { game: 'petit-buveur', build: petitBuveur },
  { game: 'petit-buveur-local', build: petitBuveurLocal },
  { game: 'toucher-coule', build: toucherCoule },
  { game: 'quiz', build: quiz },
  { game: 'menteur', build: menteur },
  { game: 'imposteur', build: imposteur },
  { game: 'loup-garou', build: loupGarou },
  { game: '1220', build: game1220 },
  { game: 'purple', build: purple },
  { game: 'bluff', build: bluff },
  { game: 'espion', build: espion },
  { game: 'tabou', build: tabou },
  { game: 'crobard', build: crobard },
  { game: 'telephone-dessine', build: telephoneDessine },
  { game: 'sans-filtre', build: sansFiltre },
  { game: 'mots-codes', build: motsCodes },
  { game: 'dilemmes', build: dilemmes },
  { game: 'petit-bac', build: petitBac },
  { game: 'president', build: president },
  { game: 'plinko', build: plinko },
  { game: 'pmu', build: pmu },
]
