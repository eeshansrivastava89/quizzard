import { Browser, Page, BrowserContext } from '@playwright/test'

export interface GameContext {
  hostContext: BrowserContext
  hostPage: Page
  playerContexts: BrowserContext[]
  playerPages: Page[]
  joinCode: string
}

/**
 * Creates a host session and returns the join code
 */
export async function createHostSession(browser: Browser): Promise<{ context: BrowserContext; page: Page; joinCode: string }> {
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.goto('/host.html')

  // Wait for either reconnect modal or lobby to appear
  const reconnectModal = page.locator('#reconnect-modal')
  const lobby = page.locator('#lobby')

  // If reconnect modal appears, abandon and start new
  if (await reconnectModal.isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.click('#reconnect-abandon')
  }

  // Wait for lobby with join code
  await lobby.waitFor({ state: 'visible', timeout: 10000 })
  const joinCode = await page.locator('#join-code-display').textContent() || ''

  return { context, page, joinCode: joinCode.trim() }
}

/**
 * Creates a player and joins the game
 */
export async function createPlayer(browser: Browser, joinCode: string, playerName: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.goto(`/play.html?code=${joinCode}`)

  // Wait for join form to be ready (page loaded and form visible)
  await page.locator('#join-view').waitFor({ state: 'visible', timeout: 10000 })
  await page.locator('#join-btn').waitFor({ state: 'visible' })

  // Enter name and join
  await page.fill('#player-name', playerName)
  await page.click('#join-btn')

  // Wait for waiting view (increased timeout for Supabase latency)
  await page.locator('#waiting-view').waitFor({ state: 'visible', timeout: 15000 })

  return { context, page }
}

/**
 * Creates full game setup: 1 host + N players
 */
export async function setupGame(browser: Browser, playerNames: string[]): Promise<GameContext> {
  const { context: hostContext, page: hostPage, joinCode } = await createHostSession(browser)

  const playerContexts: BrowserContext[] = []
  const playerPages: Page[] = []

  for (const name of playerNames) {
    const { context, page } = await createPlayer(browser, joinCode, name)
    playerContexts.push(context)
    playerPages.push(page)
  }

  return { hostContext, hostPage, playerContexts, playerPages, joinCode }
}

/**
 * Cleanup game contexts
 */
export async function cleanupGame(game: GameContext) {
  await game.hostContext.close()
  for (const ctx of game.playerContexts) {
    await ctx.close()
  }
}

/**
 * Host clicks start quiz
 */
export async function hostStartsQuiz(hostPage: Page) {
  await hostPage.click('#start-btn')
  await hostPage.locator('#question-view').waitFor({ state: 'visible' })
}

/**
 * Player answers current question
 */
export async function playerAnswers(playerPage: Page, optionIndex: number) {
  await playerPage.locator('#question-view').waitFor({ state: 'visible' })
  await playerPage.click(`#answer-${optionIndex}`)
  await playerPage.locator('#answered-view').waitFor({ state: 'visible' })
}

/**
 * Wait for timer to expire and reveal to show on host
 */
export async function waitForReveal(hostPage: Page) {
  await hostPage.locator('#reveal-view').waitFor({ state: 'visible', timeout: 30000 })
}

/**
 * Host advances to next question
 */
export async function hostNextQuestion(hostPage: Page) {
  await hostPage.click('#next-btn')
}
