import { test, expect } from '@playwright/test'
import { setupGame, cleanupGame, hostStartsQuiz, playerAnswers, waitForReveal, hostNextQuestion } from './helpers'

test.describe('Full Game Flow', () => {
  test('host creates game, 2 players join, play 1 question, see reveal', async ({ browser }) => {
    // Setup: 1 host + 2 players
    const game = await setupGame(browser, ['Alice', 'Bob'])

    try {
      // Verify players joined
      await expect(game.hostPage.locator('#participant-count')).toHaveText('2')

      // Host starts quiz
      await hostStartsQuiz(game.hostPage)

      // Both players should see question
      await expect(game.playerPages[0].locator('#question-view')).toBeVisible()
      await expect(game.playerPages[1].locator('#question-view')).toBeVisible()

      // Players answer (Alice correct, Bob wrong - first question correct is index 0)
      await playerAnswers(game.playerPages[0], 0) // Alice answers correct
      await playerAnswers(game.playerPages[1], 1) // Bob answers wrong

      // Wait for reveal
      await waitForReveal(game.hostPage)

      // Verify reveal shows correct answer distribution
      await expect(game.hostPage.locator('#reveal-view')).toBeVisible()
      await expect(game.hostPage.locator('#next-btn')).toBeVisible()

      // Next button should say "NEXT QUESTION" (not last question)
      await expect(game.hostPage.locator('#next-btn')).toHaveText('NEXT QUESTION')

      // Players should see reveal view with their results
      await expect(game.playerPages[0].locator('#reveal-view')).toBeVisible({ timeout: 5000 })
      await expect(game.playerPages[1].locator('#reveal-view')).toBeVisible({ timeout: 5000 })

    } finally {
      await cleanupGame(game)
    }
  })
})
