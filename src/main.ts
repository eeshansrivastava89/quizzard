import './styles/main.css'
import { supabase } from './lib/supabase'

// DOM Elements
const hostBtn = document.getElementById('host-btn') as HTMLButtonElement
const joinCode = document.getElementById('join-code') as HTMLInputElement
const joinBtn = document.getElementById('join-btn') as HTMLButtonElement
const joinError = document.getElementById('join-error') as HTMLParagraphElement

// Host button - redirect to host page
hostBtn.addEventListener('click', () => {
  window.location.href = '/host.html'
})

// Join game
joinBtn.addEventListener('click', async () => {
  const code = joinCode.value.toUpperCase().trim()
  if (!code || code.length < 4) {
    showError('Please enter a valid game code')
    return
  }

  joinBtn.disabled = true
  joinBtn.textContent = '...'

  try {
    // Check if session exists
    const { data, error } = await supabase
      .from('quiz_sessions')
      .select('id, state')
      .eq('join_code', code)
      .single()

    if (error || !data) {
      showError('Game not found')
      return
    }

    if (data.state === 'finished') {
      showError('This game has ended')
      return
    }

    // Redirect to play page with code
    window.location.href = `/play.html?code=${code}`
  } catch (e) {
    showError('Could not connect to game')
  } finally {
    joinBtn.disabled = false
    joinBtn.textContent = 'JOIN'
  }
})

// Allow enter key to join
joinCode.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    joinBtn.click()
  }
})

// Auto-uppercase input
joinCode.addEventListener('input', () => {
  joinCode.value = joinCode.value.toUpperCase()
})

function showError(message: string) {
  joinError.textContent = message
  joinError.classList.remove('hidden')
  setTimeout(() => {
    joinError.classList.add('hidden')
  }, 3000)
}
