import { test, expect } from '@playwright/test'
import { createHostSession, createPlayer, hostStartsQuiz, playerAnswers, cleanupGame } from './helpers'

test.describe('Host Reconnect', () => {
  test('host refreshes during lobby - reconnects to same game', async ({ browser }) => {
    const { context, page: hostPage, joinCode } = await createHostSession(browser)

    try {
      // Add a player
      const player = await createPlayer(browser, joinCode, 'TestPlayer')

      // Verify player joined
      await expect(hostPage.locator('#participant-count')).toHaveText('1')

      // Host refreshes
      await hostPage.reload()

      // Should see reconnect modal
      await expect(hostPage.locator('#reconnect-modal')).toBeVisible()
      await expect(hostPage.locator('#reconnect-code')).toHaveText(joinCode)

      // Click continue
      await hostPage.click('#reconnect-continue')

      // Should be back in lobby with same player
      await expect(hostPage.locator('#lobby')).toBeVisible()
      // Wait for participant list to be restored (may take a moment to fetch from DB)
      await expect(hostPage.locator('#participant-count')).toHaveText('1', { timeout: 10000 })

      await player.context.close()
    } finally {
      await context.close()
    }
  })

  test('host refreshes during question - reconnects to question view', async ({ browser }) => {
    const { context, page: hostPage, joinCode } = await createHostSession(browser)

    try {
      const player = await createPlayer(browser, joinCode, 'TestPlayer')
      await hostStartsQuiz(hostPage)

      // Host refreshes during question
      await hostPage.reload()

      // Should see reconnect modal
      await expect(hostPage.locator('#reconnect-modal')).toBeVisible()

      // Click continue
      await hostPage.click('#reconnect-continue')

      // Should be back in question view
      await expect(hostPage.locator('#question-view')).toBeVisible()

      await player.context.close()
    } finally {
      await context.close()
    }
  })

  test('host abandons game - players see abandoned message', async ({ browser }) => {
    const { context, page: hostPage, joinCode } = await createHostSession(browser)

    try {
      const player = await createPlayer(browser, joinCode, 'TestPlayer')
      await hostStartsQuiz(hostPage)

      // Host refreshes
      await hostPage.reload()
      await expect(hostPage.locator('#reconnect-modal')).toBeVisible()

      // Host abandons
      await hostPage.click('#reconnect-abandon')

      // Player should see abandoned view
      await expect(player.page.locator('#abandoned-view')).toBeVisible({ timeout: 10000 })

      await player.context.close()
    } finally {
      await context.close()
    }
  })
})
