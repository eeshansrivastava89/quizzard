/**
 * Kahoot-style scoring algorithm
 * Faster correct answers get more points
 */
export function calculatePoints(
  isCorrect: boolean,
  responseTimeMs: number,
  timeLimitMs: number,
  basePoints: number = 1000
): number {
  if (!isCorrect) return 0

  // Points = BasePoints × (1 - (responseTime / timeLimit) × 0.5)
  // This gives a range from 50% to 100% of base points for correct answers
  const timeFactor = Math.min(responseTimeMs / timeLimitMs, 1)
  const points = Math.round(basePoints * (1 - timeFactor * 0.5))

  // Minimum 50% of base points for any correct answer
  return Math.max(points, Math.round(basePoints * 0.5))
}

/**
 * Generate a random join code (6 characters, uppercase)
 */
export function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // Removed ambiguous chars
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}
