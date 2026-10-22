import { expect } from '../support/fixtures'
import { ANY, escapeRegExp } from '../support/i18n'
import { firstVisible } from '../support/online'
import type { GameCtx } from '../support/scenario'
import { MENTEUR_REVEAL_MIN_MS } from '../../src/lib/menteur/engine'

/**
 * Jeux EN LIGNE uniquement (info cachée : chacun son téléphone). Un seul
 * navigateur ne fait qu'un joueur :
 * - jeux `botsFillable` : « Essayer avec des bots » de bout en bout (compte
 *   invité, table privée, lobby, lancement, briefing) puis une à deux
 *   actions de la partie contre les bots ;
 * - autres jeux : vitrine, compte invité, table ouverte — le lobby attend ses
 *   vrais joueurs (Toucher-Coulé se lance seul : les bots comblent l'équipe
 *   adverse, on y joue un tir) ;
 * - jeux sans cartes dans la langue (Sans Filtre, Dilemmes hors français) :
 *   la vitrine seule, qui ne doit proposer que la connexion.
 */
export type OnlineScenario = {
  id: string
  mode: 'bots' | 'guest'
  play?: (ctx: GameCtx) => Promise<void>
}

export const ONLINE_SCENARIOS: OnlineScenario[] = [
  {
    id: 'toucher-coule',
    mode: 'guest',
    play: async ({ page, t, g, ui, button, step }) => {
      await page.getByRole('button', { name: t('onlineLobby.launch.cta'), exact: true }).click()
      await page.getByRole('button', { name: t('briefing.skip'), exact: true }).click({ timeout: 30_000 })

      await expect(ui.getByText(g('game.phasePlacement'))).toBeVisible({ timeout: 30_000 })
      await button(g('game.random')).click()
      await step('placement')
      await button(g('game.confirmPlacement')).click()

      await expect(ui.getByText(g('game.aimPrompt'))).toBeVisible({ timeout: 60_000 })
      await step('partie')
      // Viser D4 dans les eaux ennemies, puis « Tirer en D4 » : la case
      // prend son état (touché / à l'eau) dans son nom accessible.
      const enemy = ui.getByRole('group', { name: g('game.enemyWaters') })
      await enemy.getByRole('button', { name: 'D4', exact: true }).click()
      await step('visee')
      await button(g('game.fireAt', { cell: 'D4' })).click()
      await expect(enemy.getByLabel(/^D4, /)).toBeVisible({ timeout: 30_000 })
      await step('action-1')
    },
  },
  {
    id: 'menteur',
    mode: 'bots',
    play: async (ctx) => {
      const { page, g, ui, step } = ctx
      const bid = ui.getByRole('button', { name: prefixOf(g('game.bidAria', { qty: 2, face: 3 })) })
      const nextRound = ctx.button(g('game.reveal.continue'))
      // « Tes dés » : présent à chaque tour (l'enchère en cours, elle, manque
      // quand c'est nous qui ouvrons la manche).
      await expect(ui.getByText(g('game.yourDice'), { exact: true })).toBeVisible({ timeout: 30_000 })
      await step('partie')
      // Un bot a crié « Menteur ! » avant notre tour : le moteur refuse la
      // manche suivante pendant le temps de lecture (403 reading_time), on
      // lit d'abord, puis on enchaîne.
      while ((await firstVisible([bid, nextRound], 90_000)) === 1) {
        await page.waitForTimeout(MENTEUR_REVEAL_MIN_MS + 500)
        if (await nextRound.isVisible()) await nextRound.click()
      }
      await step('mon-tour')
      await bid.click()
      await expect(bid).toBeHidden()
      await step('action-1')
    },
  },
  {
    id: 'imposteur',
    mode: 'bots',
    play: async ({ page, g, ui, step }) => {
      await expect(ui.getByText(g('game.yourWord'), { exact: true })).toBeVisible({ timeout: 30_000 })
      await step('partie')
      const clue = page.getByPlaceholder(g('game.cluePlaceholder'))
      await expect(clue).toBeVisible({ timeout: 90_000 })
      await clue.fill('mystère')
      await step('mon-indice')
      await ui.getByRole('button', { name: g('game.clueSend') }).click()
      await expect(clue).toBeHidden()
      await step('action-1')
    },
  },
  {
    id: 'quiz',
    mode: 'bots',
    play: async ({ g, gp, ui, step }) => {
      // Le symbole de la réponse est aria-hidden : il compte dans le texte, pas dans le nom.
      const answers = ui.getByRole('button').filter({ hasText: /^▲/ })
      await expect(answers).toBeEnabled({ timeout: 30_000 })
      await expect(ui.getByText(gp('game.progress', { n: ANY, total: ANY }))).toBeVisible()
      await step('partie')
      await answers.click()
      await expect(ui.getByText(g('game.answerSent'))).toBeVisible()
      await step('action-1')
    },
  },
  {
    id: 'loup-garou',
    mode: 'bots',
    play: async ({ g, ui, button, step }) => {
      await expect(ui.getByText(g('game.yourRole'))).toBeVisible({ timeout: 30_000 })
      await step('partie')
      // Légende des rôles : panneau repliable de l'en-tête, ouvert puis refermé.
      await ui.getByRole('button', { name: g('game.legend.title') }).click()
      const close = button(g('game.legend.close'))
      await expect(close).toBeVisible()
      await step('action-1')
      await close.click()
      await expect(close).toBeHidden()
      // Première phase après la révélation (élection du maire ou nuit) :
      // l'écran suivant du joueur, quel que soit son rôle.
      await expect(ui.getByText(g('game.revealPrompt'))).toBeHidden({ timeout: 60_000 })
      await step('action-2')
    },
  },
  {
    id: 'bluff',
    mode: 'bots',
    play: async ({ page, g, ui, step }) => {
      const fake = page.getByPlaceholder(g('game.submitPlaceholder'))
      await expect(fake).toBeVisible({ timeout: 30_000 })
      await step('partie')
      await fake.fill('Atlantide')
      await ui.getByRole('button', { name: g('game.submitSend') }).click()
      await expect(ui.getByText(g('game.myFakeLabel'))).toBeVisible()
      await step('action-1')

      const confirm = ui.getByRole('button', { name: g('game.voteConfirm') })
      // Son propre bluff est désactivé : on vote pour la première autre réponse.
      const pick = choices(ui).and(ui.locator(':enabled'))
      await expect(pick.first()).toBeVisible({ timeout: 90_000 })
      await pick.first().click()
      await confirm.click()
      await expect(confirm).toBeHidden()
      await step('action-2')
    },
  },
  {
    id: 'espion',
    mode: 'bots',
    play: async ({ g, gp, ui, button, step }) => {
      const ask = button(g('game.askButton'))
      const askedYou = ui.getByText(gp('game.askedYou', { name: ANY }))
      await expect(ui.getByText(g('game.yourLocation'), { exact: true }).or(ui.getByText(g('game.youAreSpy'), { exact: true })).first()).toBeVisible({ timeout: 30_000 })
      await step('partie')
      // Un bot peut nous interroger le premier : on lui répond (première
      // réponse proposée) avant de poser sa propre question.
      if ((await firstVisible([ask, askedYou], 60_000)) === 1) {
        await askedYou.last().locator('xpath=following::button[1]').click()
        await step('reponse')
      }
      await ask.click()
      await expect(ui.getByText(g('game.askWho'))).toBeVisible()
      await step('action-1')
    },
  },
  {
    id: 'crobard',
    mode: 'bots',
    play: async ({ page, g, ui, button, step }) => {
      // Les bots ne dessinent pas : leurs manches sont écourtées. On attend
      // NOTRE tour de dessiner, ou la saisie d'une proposition, en passant
      // les bilans de manche (« Manche suivante », l'hôte, c'est nous).
      const words = ui.getByText(g('game.choosing.pickWord'))
      const guess = ui.getByRole('textbox', { name: g('game.guessLabel') })
      const nextRound = button(g('game.roundEnd.continue'))
      let screen = await firstVisible([words, guess, nextRound], 60_000)
      while (screen === 2) {
        await nextRound.click()
        screen = await firstVisible([words, guess, nextRound], 60_000)
      }
      const drawer = screen === 0
      await step('partie')
      if (drawer) {
        // Choisir le premier mot proposé, puis tracer un trait sur la toile.
        await words.locator('xpath=following::button[1]').click()
        const canvas = ui.locator('canvas').first()
        await expect(canvas).toBeVisible()
        const box = (await canvas.boundingBox())!
        await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3)
        await page.mouse.down()
        await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.6, { steps: 8 })
        await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.3, { steps: 8 })
        await page.mouse.up()
      } else {
        // Une proposition fausse reste dans le champ (« Faux ! » clignote
        // 1,2 s) : on vérifie que le serveur l'a bien reçue.
        await guess.fill('soleil')
        const sent = page.waitForResponse((r) => /\/action$/.test(r.url()) && (r.request().postData() ?? '').includes('"guess"'))
        await guess.press('Enter')
        expect((await sent).status()).toBe(200)
      }
      await step('action-1')
    },
  },
  {
    id: 'sans-filtre',
    mode: 'bots',
    play: async ({ g, ui, button, step }) => {
      await expect(ui.getByText(g('game.blackLabel'))).toBeVisible({ timeout: 30_000 })
      await step('partie')
      // Juge : couronner une réponse une fois les cartes abattues. Joueur :
      // abattre une carte de sa main.
      const choice = choices(ui).first()
      await expect(choice).toBeVisible({ timeout: 90_000 })
      await choice.click()
      const confirm = button(g('game.crownCard')).or(button(g('game.playCard')))
      await expect(confirm).toBeEnabled()
      await step('choix')
      await confirm.click()
      await expect(confirm).toBeHidden({ timeout: 30_000 })
      await step('action-1')
    },
  },
  {
    id: 'dilemmes',
    mode: 'bots',
    play: async ({ g, gp, ui, step }) => {
      const choice = choices(ui).first()
      await expect(choice).toBeVisible({ timeout: 30_000 })
      await step('partie')
      await choice.click()
      const confirm = ui.getByRole('button', { name: gp('game.designate', { name: ANY }) }).or(ui.getByRole('button', { name: g('game.confirmVote') }))
      await confirm.click()
      await expect(ui.getByText(gp('game.voted', { count: ANY, total: ANY }))).toBeVisible()
      await step('action-1')
    },
  },
  {
    id: 'president',
    mode: 'bots',
    play: async ({ g, gp, ui, button, step }) => {
      const hand = ui.getByRole('group', { name: g('game.myHand') })
      await expect(hand).toBeVisible({ timeout: 30_000 })
      await step('partie')
      // À son tour : passer si on suit un pli ; si l'on mène (pli libre),
      // poser sa plus petite carte, toujours jouable.
      const pass = button(g('game.pass'))
      const lead = ui.getByText(g('game.leadHint'))
      if ((await firstVisible([pass.and(ui.locator(':enabled')), lead], 90_000)) === 0) {
        await pass.click()
      } else {
        await hand.getByRole('button', { pressed: false }).first().click()
        await ui.getByRole('button', { name: gp('game.playCards', { cards: ANY }) }).click()
      }
      await step('action-1')
    },
  },
  { id: 'tabou', mode: 'guest' },
  { id: 'mots-codes', mode: 'guest' },
  { id: 'petit-bac', mode: 'guest' },
  { id: 'telephone-dessine', mode: 'guest' },
]

/**
 * Cartes et options à cocher (aria-pressed) portant du texte et VISIBLES : les
 * bascules d'en-tête (vocal, aide) sont aussi des boutons aria-pressed, sans
 * texte, et un panneau replié peut en cacher d'autres en tête de liste.
 */
function choices(ui: GameCtx['ui']) {
  return ui.getByRole('button', { pressed: false }).filter({ hasText: /\p{L}{2,}/u, visible: true })
}

/** Début fixe d'un libellé à variables : « Enchérir : » de « Enchérir : 2 dés de 3 ». */
function prefixOf(text: string): RegExp {
  return new RegExp(`^${escapeRegExp(text.split(/\d/)[0])}`)
}
