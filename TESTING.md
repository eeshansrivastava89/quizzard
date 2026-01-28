# Quiz Time Testing Plan

## Overview

E2E tests using Playwright with multi-browser-context approach to simulate host and players interacting in real-time.

## Setup

```bash
# Install Playwright browsers (first time only)
npx playwright install chromium

# Run all tests
npm test

# Run with UI (debugging)
npm run test:ui

# Run headed (see browser)
npm run test:headed
```

## Architecture

- **Single worker** - Tests run sequentially to avoid Supabase state conflicts
- **Real Supabase** - Uses existing project (ayosczldjpycqzwrexfu)
- **Multi-context** - Each host/player gets separate browser context with isolated localStorage
- **Auto dev server** - Playwright starts `npm run dev` automatically

## Test Files

| File | Purpose |
|------|---------|
| `helpers.ts` | Shared utilities for creating host/player sessions |
| `game-flow.spec.ts` | Full game flow: create → join → play → leaderboard |
| `host-reconnect.spec.ts` | Host refresh/reconnect at each game state |
| `player-reconnect.spec.ts` | Player refresh/reconnect at each game state |

## Test Scenarios to Cover

### Game Flow
- [ ] Host creates game, players join, full game plays to completion
- [ ] Multiple questions with scoring verification
- [ ] Leaderboard shows correct rankings

### Host Reconnect
- [ ] Refresh during lobby → reconnect modal → continue → same game
- [ ] Refresh during question → reconnect → back to question view
- [ ] Refresh during reveal → reconnect → back to reveal view
- [ ] Abandon game → players see "Game Ended"

### Player Reconnect
- [ ] Refresh during lobby → auto-reconnect to waiting view
- [ ] Refresh during question (not answered) → sees question
- [ ] Refresh during question (answered) → sees "answered" view
- [ ] Same name rejoin → reconnects instead of "name taken" error

### Edge Cases
- [ ] Player cap (180) - 181st player rejected
- [ ] Host leaves without abandoning (session stays active)
- [ ] Player joins finished/abandoned game - sees appropriate message

## Helper Functions (tests/helpers.ts)

```typescript
// Create host and get join code
createHostSession(browser) → { context, page, joinCode }

// Create player and join game
createPlayer(browser, joinCode, name) → { context, page }

// Setup full game: 1 host + N players
setupGame(browser, playerNames[]) → GameContext

// Game actions
hostStartsQuiz(hostPage)
playerAnswers(playerPage, optionIndex)
waitForReveal(hostPage)
hostNextQuestion(hostPage)

// Cleanup
cleanupGame(game)
```

## Notes

- **Timeouts**: Tests use 60s timeout due to question timers (default 20s each)
- **Timer handling**: Currently waits for real time. Future: could mock timers for faster tests
- **Cleanup**: Browser contexts auto-close, but Supabase sessions remain (marked finished/abandoned)
- **Debugging**: Use `npm run test:headed` to watch tests, or `npm run test:ui` for interactive mode

## Running Specific Tests

```bash
# Run single file
npx playwright test game-flow.spec.ts

# Run single test by name
npx playwright test -g "host refreshes during lobby"

# Debug mode
npx playwright test --debug
```

## Known Issues to Fix

1. **Host reconnect spinner bug** - Host clicks "Continue" but spinner keeps showing with countdown sound
   - Likely: `reconnectToSession()` not properly restoring state
   - Check: localStorage cleanup, sound stopping, view switching

## Future Improvements

- Mock Supabase for faster unit tests
- Add visual regression tests for UI
- Parallel test execution with isolated Supabase projects
- CI integration (GitHub Actions)
