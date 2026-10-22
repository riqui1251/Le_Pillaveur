import { expect } from '../support/fixtures'
import { ANY, escapeRegExp } from '../support/i18n'
import { TABLE } from '../support/local'
import type { GameCtx } from '../support/scenario'

/**
 * Jeux LOCAUX (un téléphone qui passe de main en main) : table de trois
 * joueurs composée par l'interface, options par défaut, puis une à deux
 * actions représentatives. Chaque étape passe les contrôles communs
 * (checkScreen) et laisse une capture dans e2e/screenshots/<langue>/.
 */
export type LocalScenario = {
  id: string
  entry?: 'game' | 'hub'
  play: (ctx: GameCtx) => Promise<void>
}

export const LOCAL_SCENARIOS: LocalScenario[] = [
  {
    id: 'monsieur-3',
    play: async ({ g, gp, ui, button, step }) => {
      const roll = (name: string) => button(g('rollSetupNamed', { name }))
      await expect(roll(TABLE[0])).toBeEnabled()
      await expect(ui.getByText(g('messages.setupStart'))).toBeVisible()
      await step('mise-en-place')

      await roll(TABLE[0]).click()
      await expect(button(g('history', { count: 1 }))).toBeVisible()
      await step('action-1')

      // Au tour suivant (ou relance de Monsieur 3 trouvé) : le bouton de
      // lancer, quel que soit son libellé, se réactive après l'animation.
      const anyRoll = ui.getByRole('button', {
        name: new RegExp([gp('rollSetupNamed', { name: ANY }), gp('rollPlayNamed', { name: ANY }), gp('rollAgainNamed', { name: ANY })].map((r) => r.source).join('|')),
      })
      await anyRoll.click()
      await expect(button(g('history', { count: 2 }))).toBeVisible()
      await step('action-2')
    },
  },
  {
    id: 'pmu',
    play: async ({ g, ui, button, step }) => {
      await expect(ui.getByText(g('chooseMode'))).toBeVisible()
      await step('mise-en-place')
      await ui.getByRole('button', { name: startsWith(g('modes.libre.title')) }).click()
      await expect(ui.getByText(g('setup.defaultHint'))).toBeVisible()
      // Alice sur Tonnerre : toucher le joueur, puis le cheval.
      await ui.getByRole('button', { name: endsWith(TABLE[0]) }).click()
      await button(g('setup.assignTo', { name: TABLE[0], horse: g('horses.tonnerre') })).click()
      await expect(button(g('setup.nextRace'))).toBeEnabled()
      await step('action-1')
      await button(g('setup.nextRace')).click()
      await expect(button(g('results.replay'))).toBeVisible({ timeout: 60_000 })
      await step('action-2')
    },
  },
  {
    id: 'petit-buveur',
    play: async ({ t, g, ui, button, step }) => {
      await expect(button(startsWith(g('page.difficulties.normal.label')))).toBeVisible()
      await step('mise-en-place')
      await button(t('players.startGame')).click()
      const roll = button(g('game.rollDiceFor', { name: TABLE[0] }))
      await expect(roll).toBeEnabled({ timeout: 30_000 })
      await step('partie')
      await roll.click()
      await expect(roll).toBeHidden()
      await expect(ui.getByText(g('game.ranking'), { exact: true })).toBeVisible()
      await step('action-1')
    },
  },
  {
    id: 'hi-lo',
    play: async ({ t, g, gp, ui, button, step }) => {
      await expect(button(g('page.modes.standard'))).toBeVisible()
      await step('mise-en-place')
      await button(t('players.startGame')).click()
      const higher = button(g('higher'))
      await expect(higher).toBeEnabled({ timeout: 30_000 })
      await step('partie')
      // Bien vu : le même joueur continue et la mise monte ; raté : il boit
      // et passe la main (« Au tour de … »).
      const next = ui.getByRole('button', { name: gp('nextTurnButton', { name: ANY }) })
      await higher.click()
      await expect(next.or(ui.getByText(g('cardsPlayedLabel', { count: 1 }))).first()).toBeVisible({ timeout: 15_000 })
      await step('action-1')
      if (await next.isVisible()) {
        await next.click()
        await expect(ui.getByText(gp('guessPrompt', { name: ANY }))).toBeVisible()
      } else {
        await higher.click()
        await expect(next.or(ui.getByText(g('cardsPlayedLabel', { count: 2 }))).first()).toBeVisible({ timeout: 15_000 })
      }
      await step('action-2')
    },
  },
  {
    id: 'purple',
    play: async ({ page, t, g, gp, ui, button, step }) => {
      await step('mise-en-place')
      await button(t('players.startGame')).click()
      // Le premier joueur est tiré au sort.
      const prompt = ui.getByRole('heading', { name: gp('chooseBetFor', { name: ANY }) })
      await expect(prompt).toBeVisible({ timeout: 30_000 })
      await step('partie')
      // Pari « Rouge » : bonne pioche → continuer ou passer ; mauvaise → main suivante.
      await ui.getByRole('button', { name: startsWith(g('bets.rouge')) }).first().click()
      const pass = ui.getByRole('button', { name: gp('decision.pass', { name: ANY, count: 1 }) })
      // Le raté s'annonce dans une modale (portail hors du contenu).
      const next = page.getByRole('dialog').getByRole('button', { name: gp('nextTurn', { name: ANY }) })
      await expect(pass.or(next).first()).toBeVisible({ timeout: 15_000 })
      await step('action-1')
      await pass.or(next).first().click()
      await expect(prompt).toBeVisible({ timeout: 15_000 })
      await step('action-2')
    },
  },
  {
    id: 'pyramide',
    play: async ({ t, g, ui, button, step }) => {
      await expect(ui.getByText(g('page.rowsCards', { rows: 5, cards: 15 })).first()).toBeVisible()
      await step('mise-en-place')
      await button(t('players.startGame')).click()
      await expect(button(g('game.flipBy', { name: TABLE[0] }))).toBeEnabled({ timeout: 30_000 })
      await step('partie')
      await button(g('game.flipBy', { name: TABLE[0] })).click()
      await expect(ui.getByText(g('game.progress', { flipped: 1, total: 15 }))).toBeVisible()
      await step('action-1')
      await button(g('game.flipBy', { name: TABLE[1] })).click()
      await expect(ui.getByText(g('game.progress', { flipped: 2, total: 15 }))).toBeVisible()
      await step('action-2')
    },
  },
  {
    id: 'plinko',
    play: async ({ t, g, button, step }) => {
      await expect(button(startsWith(g('page.difficulties.medium.label')))).toBeVisible()
      await step('mise-en-place')
      await button(t('players.startGame')).click()
      await expect(button(g('game.launchFor', { name: TABLE[0] }))).toBeEnabled({ timeout: 30_000 })
      await step('partie')
      await button(g('game.launchFor', { name: TABLE[0] })).click()
      // Les balles tombent, le plateau compte, la main passe à Bruno.
      await expect(button(g('game.launchFor', { name: TABLE[1] }))).toBeEnabled({ timeout: 60_000 })
      await step('action-1')
    },
  },
  {
    id: '1220',
    play: async ({ g, ui, button, step }) => {
      await expect(button(g('validateBets'))).toBeVisible({ timeout: 30_000 })
      await step('mise-en-place')
      await button(g('validateBets')).click()
      await expect(button(g('rollDice'))).toBeEnabled()
      await step('partie')
      await button(g('rollDice')).click()
      await expect(ui.getByText(g('results'), { exact: true })).toBeVisible({ timeout: 15_000 })
      await step('action-1')
    },
  },
  {
    id: 'roue-des-gorgees',
    play: async ({ t, g, button, step }) => {
      await expect(button(t('players.startGame'))).toBeEnabled()
      await step('mise-en-place')
      await button(t('players.startGame')).click()
      await expect(button(g('spin'))).toBeEnabled({ timeout: 15_000 })
      await step('partie')
      await button(g('spin')).click()
      // La roue tourne quelques secondes, puis se rend pour le tour suivant.
      await expect(button(g('spinning'))).toBeDisabled()
      await expect(button(g('spin'))).toBeEnabled({ timeout: 30_000 })
      await step('action-1')
    },
  },
  {
    id: 'ballon-surprise',
    entry: 'hub',
    play: async ({ g, ui, button, step }) => {
      await expect(ui.getByText(g('selection.pickTurn', { name: TABLE[0] }))).toBeVisible()
      await step('mise-en-place')
      // Chacun son ballon : toucher le joueur dans la liste, puis une couleur.
      const colors = ['red', 'blue', 'green'] as const
      for (const [i, name] of TABLE.entries()) {
        await ui.getByText(name, { exact: true }).click()
        await expect(ui.getByText(g('selection.pickTurn', { name }))).toBeVisible()
        await button(g('selection.balloonAria', { color: g(`colors.${colors[i]}`) })).click()
      }
      await expect(button(g('selection.startRace'))).toBeEnabled()
      await step('action-1')
      await button(g('selection.startRace')).click()
      await expect(button(g('results.replay'))).toBeVisible({ timeout: 60_000 })
      await step('action-2')
    },
  },
  {
    id: 'petits-points',
    play: async ({ page, g, ui, button, step }) => {
      await expect(button(g('page.start'))).toBeEnabled()
      await step('mise-en-place')
      await button(g('page.start')).click()
      await expect(ui.getByText(g('game.placingTurn', { name: TABLE[0] }))).toBeVisible()
      await step('partie')
      // Pas de rôle ni de texte sur le plateau rond : seul repère, son test id.
      const board = page.getByTestId('petits-points-board')
      const box = (await board.boundingBox())!
      await board.click({ position: { x: box.width * 0.35, y: box.height * 0.4 } })
      await expect(ui.getByText(g('game.placingTurn', { name: TABLE[1] }))).toBeVisible()
      await step('action-1')
      await board.click({ position: { x: box.width * 0.65, y: box.height * 0.6 } })
      await expect(ui.getByText(g('game.placingTurn', { name: TABLE[2] }))).toBeVisible()
      await step('action-2')
    },
  },
  {
    id: 'pendu',
    play: async ({ g, gp, ui, button, step }) => {
      await expect(button(g('page.start'))).toBeEnabled()
      await step('mise-en-place')
      await button(g('page.start')).click()
      const letter = button('E')
      await expect(letter).toBeEnabled({ timeout: 15_000 })
      await step('partie')
      await letter.click()
      await expect(letter).toBeDisabled()
      await expect(ui.getByText(gp('game.errors', { count: ANY, max: ANY }))).toBeVisible()
      await step('action-1')
    },
  },
  {
    id: 'trial-poursuite',
    entry: 'hub',
    play: async ({ page, g, gp, button, step }) => {
      await expect(button(g('page.startRace'))).toBeEnabled()
      await step('mise-en-place')
      await button(g('page.startRace')).click()
      await expect(button(g('challengeSuccess'))).toBeVisible({ timeout: 15_000 })
      await step('partie')
      await button(g('challengeSuccess')).click()
      // Le verdict s'affiche dans une boîte de dialogue (portail hors du contenu).
      await expect(page.getByText(gp('successMessage', { name: TABLE[0], category: ANY }))).toBeVisible()
      await step('action-1')
    },
  },
]

/** Nom accessible qui commence par ce texte (titre d'une option suivi de sa description). */
function startsWith(text: string): RegExp {
  return new RegExp(`^\\P{L}*${escapeRegExp(text)}`, 'u')
}

/** Nom accessible qui finit par ce texte (prénom précédé de son emoji). */
function endsWith(text: string): RegExp {
  return new RegExp(`${escapeRegExp(text)}$`)
}
