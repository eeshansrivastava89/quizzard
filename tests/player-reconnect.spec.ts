import { test, expect } from '@playwright/test'
import { createHostSession, createPlayer, hostStartsQuiz, playerAnswers, waitForReveal } from './helpers'

test.describe('Player Reconnect', () => {
  test('player refreshes during lobby - auto-reconnects', async ({ browser }) => {
    const { context: hostCtx, page: hostPage, joinCode } = await createHostSession(browser)

    try {
      const player = await createPlayer(browser, joinCode, 'TestPlayer')

      // Player refreshes
      await player.page.reload()

      // Should auto-reconnect to waiting view (not join form)
      await expect(player.page.locator('#waiting-view')).toBeVisible({ timeout: 5000 })

      await player.context.close()
    } finally {
      await hostCtx.close()
    }
  })

  test('player refreshes during question (not answered) - sees question', async ({ browser }) => {
    const { context: hostCtx, page: hostPage, joinCode } = await createHostSession(browser)

    try {
      const player = await createPlayer(browser, joinCode, 'TestPlayer')
      await hostStartsQuiz(hostPage)

      // Wait for player to see question
      await expect(player.page.locator('#question-view')).toBeVisible()

      // Player refreshes WITHOUT answering
      await player.page.reload()

      // Should see question view again
      await expect(player.page.locator('#question-view')).toBeVisible({ timeout: 5000 })

      await player.context.close()
    } finally {
      await hostCtx.close()
    }
  })

  test('player refreshes during question (already answered) - sees answered view', async ({ browser }) => {
    const { context: hostCtx, page: hostPage, joinCode } = await createHostSession(browser)

    try {
      const player = await createPlayer(browser, joinCode, 'TestPlayer')
      await hostStartsQuiz(hostPage)

      // Player answers
      await playerAnswers(player.page, 0)

      // Small delay to ensure answer is persisted to DB before refresh
      await player.page.waitForTimeout(500)

      // Player refreshes AFTER answering
      await player.page.reload()

      // Should see answered view (not question) - give time for reconnect logic
      await expect(player.page.locator('#answered-view')).toBeVisible({ timeout: 10000 })

      await player.context.close()
    } finally {
      await hostCtx.close()
    }
  })

  test('player uses same name to rejoin - reconnects instead of error', async ({ browser }) => {
    const { context: hostCtx, page: hostPage, joinCode } = await createHostSession(browser)

    try {
      // Player joins
      const player = await createPlayer(browser, joinCode, 'TestPlayer')
      await player.context.close()

      // New browser context, same name
      const newContext = await browser.newContext()
      const newPage = await newContext.newPage()
      await newPage.goto(`/play.html?code=${joinCode}`)

      // Enter same name
      await newPage.fill('#player-name', 'TestPlayer')
      await newPage.click('#join-btn')

      // Should reconnect (not show error)
      await expect(newPage.locator('#waiting-view')).toBeVisible({ timeout: 5000 })

      await newContext.close()
    } finally {
      await hostCtx.close()
    }
  })
})
