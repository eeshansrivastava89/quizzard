import './styles/main.css'
import { supabase } from './lib/supabase'
import type { QuizSession, QuizParticipant } from './lib/supabase'
import { loadQuestions, getQuestionTime } from './lib/questions'
import type { QuizConfig } from './lib/questions'
import { sounds } from './lib/sounds'

// State
let session: QuizSession | null = null
let participant: QuizParticipant | null = null
let config: QuizConfig | null = null
let timerInterval: number | null = null
let questionStartTime: number = 0
let hasAnswered = false

// DOM Elements
const joinViewEl = document.getElementById('join-view')!
const waitingViewEl = document.getElementById('waiting-view')!
const questionViewEl = document.getElementById('question-view')!
const answeredViewEl = document.getElementById('answered-view')!
const revealViewEl = document.getElementById('reveal-view')!
const finalViewEl = document.getElementById('final-view')!

// Get join code from URL
const urlParams = new URLSearchParams(window.location.search)
const joinCode = urlParams.get('code')

if (!joinCode) {
  window.location.href = '/'
} else {
  document.getElementById('game-code')!.textContent = joinCode
  init()
}

async function init() {
  try {
    config = await loadQuestions()
    await loadSession()
    setupJoinForm()
  } catch (e) {
    console.error('Failed to initialize:', e)
    alert('Could not connect to game')
    window.location.href = '/'
  }
}

async function loadSession() {
  const { data, error } = await supabase
    .from('quiz_sessions')
    .select('*')
    .eq('join_code', joinCode)
    .single()

  if (error || !data) {
    throw new Error('Session not found')
  }

  session = data as QuizSession
}

function setupJoinForm() {
  const nameInput = document.getElementById('player-name') as HTMLInputElement
  const joinBtn = document.getElementById('join-btn') as HTMLButtonElement
  const joinError = document.getElementById('join-error') as HTMLParagraphElement

  joinBtn.addEventListener('click', async () => {
    const name = nameInput.value.trim()
    if (!name) {
      showError(joinError, 'Please enter your name')
      return
    }

    joinBtn.disabled = true
    joinBtn.textContent = 'Joining...'

    try {
      const { data, error } = await supabase
        .from('quiz_participants')
        .insert({
          session_id: session!.id,
          name: name
        })
        .select()
        .single()

      if (error) {
        if (error.code === '23505') {
          showError(joinError, 'Name already taken')
        } else {
          showError(joinError, 'Could not join game')
        }
        return
      }

      participant = data as QuizParticipant
      localStorage.setItem(`quiz_player_${session!.id}`, participant.id)

      showWaiting()
      subscribeToSession()
    } catch (e) {
      showError(joinError, 'Could not join game')
    } finally {
      joinBtn.disabled = false
      joinBtn.textContent = 'JOIN GAME'
    }
  })

  nameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinBtn.click()
  })
}

function showError(el: HTMLElement, message: string) {
  el.textContent = message
  el.classList.remove('hidden')
  setTimeout(() => el.classList.add('hidden'), 3000)
}

function showWaiting() {
  joinViewEl.classList.add('hidden')
  waitingViewEl.classList.remove('hidden')
  document.getElementById('player-name-display')!.textContent = participant!.name
}

function subscribeToSession() {
  supabase
    .channel('session')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'quiz_sessions',
        filter: `id=eq.${session!.id}`
      },
      (payload) => {
        const newSession = payload.new as QuizSession
        handleStateChange(session!.state, newSession.state, newSession)
        session = newSession
      }
    )
    .subscribe()
}

function handleStateChange(
  _oldState: QuizSession['state'],
  newState: QuizSession['state'],
  newSession: QuizSession
) {
  if (newState === 'question') {
    questionStartTime = new Date(newSession.question_started_at!).getTime()
    hasAnswered = false
    showQuestion(newSession.current_question)
  } else if (newState === 'reveal') {
    showReveal()
  } else if (newState === 'leaderboard') {
    showFinal()
  }
}

function showQuestion(questionIndex: number) {
  const question = config!.questions[questionIndex]
  const timeMs = getQuestionTime(question, config!)

  // Hide other views
  waitingViewEl.classList.add('hidden')
  answeredViewEl.classList.add('hidden')
  revealViewEl.classList.add('hidden')
  questionViewEl.classList.remove('hidden')

  // Update display
  document.getElementById('question-text')!.textContent = question.text

  // Options
  question.options.forEach((option, i) => {
    const btn = document.getElementById(`answer-${i}`) as HTMLButtonElement
    btn.querySelector('.option-text')!.textContent = option
    btn.disabled = false
    btn.onclick = () => submitAnswer(i)
  })

  // Timer (sync with server time)
  const elapsed = Date.now() - questionStartTime
  const remainingMs = Math.max(0, timeMs - elapsed)
  startTimer(remainingMs, timeMs)
}

function startTimer(remainingMs: number, totalMs: number) {
  const timerEl = document.getElementById('timer')!
  const timerBarEl = document.getElementById('timer-bar')!
  const endTime = Date.now() + remainingMs

  if (timerInterval) clearInterval(timerInterval)

  timerInterval = setInterval(() => {
    const remaining = Math.max(0, endTime - Date.now())
    const seconds = Math.ceil(remaining / 1000)
    const percent = (remaining / totalMs) * 100

    timerEl.textContent = seconds.toString()
    timerBarEl.style.width = `${percent}%`

    timerBarEl.classList.remove('warning', 'danger')
    if (percent < 20) {
      timerBarEl.classList.add('danger')
    } else if (percent < 50) {
      timerBarEl.classList.add('warning')
    }

    if (remaining === 0) {
      clearInterval(timerInterval!)
      if (!hasAnswered) {
        disableAnswerButtons()
      }
    }
  }, 100) as unknown as number
}

async function submitAnswer(optionIndex: number) {
  if (hasAnswered) return
  hasAnswered = true

  const responseTimeMs = Date.now() - questionStartTime

  // Disable all buttons
  disableAnswerButtons()

  // Vibrate on mobile
  if (navigator.vibrate) {
    navigator.vibrate(50)
  }

  // Show answered view
  questionViewEl.classList.add('hidden')
  answeredViewEl.classList.remove('hidden')

  // Submit to database
  try {
    await supabase.from('quiz_answers').insert({
      session_id: session!.id,
      participant_id: participant!.id,
      question_index: session!.current_question,
      selected_option: optionIndex,
      response_time_ms: responseTimeMs
    })
  } catch (e) {
    console.error('Failed to submit answer:', e)
  }
}

function disableAnswerButtons() {
  for (let i = 0; i < 4; i++) {
    const btn = document.getElementById(`answer-${i}`) as HTMLButtonElement
    btn.disabled = true
  }
}

async function showReveal() {
  if (timerInterval) clearInterval(timerInterval)

  answeredViewEl.classList.add('hidden')
  questionViewEl.classList.add('hidden')
  revealViewEl.classList.remove('hidden')

  // Get our answer for this question
  const { data: answerData } = await supabase
    .from('quiz_answers')
    .select('selected_option, points_earned')
    .eq('participant_id', participant!.id)
    .eq('question_index', session!.current_question)
    .single()

  // Get updated participant data
  const { data: participantData } = await supabase
    .from('quiz_participants')
    .select('score')
    .eq('id', participant!.id)
    .single()

  if (participantData) {
    participant!.score = participantData.score
  }

  // Get current rank
  const { data: allParticipants } = await supabase
    .from('quiz_participants')
    .select('id, score')
    .eq('session_id', session!.id)
    .order('score', { ascending: false })

  const rank =
    (allParticipants?.findIndex((p) => p.id === participant!.id) ?? 0) + 1

  // Update display
  const question = config!.questions[session!.current_question]
  const isCorrect = answerData?.selected_option === question.correct
  const points = answerData?.points_earned ?? 0

  const resultIconEl = document.getElementById('result-icon')!
  const pointsEl = document.getElementById('points-earned')!

  if (answerData) {
    if (isCorrect) {
      resultIconEl.className =
        'w-32 h-32 rounded-full flex items-center justify-center bg-green-500'
      resultIconEl.innerHTML = '<span class="text-6xl">&#10003;</span>'
      pointsEl.textContent = `+${points.toLocaleString()} points`
      pointsEl.className = 'text-4xl font-bold text-green-500 mb-4'
      sounds.play('correct')
    } else {
      resultIconEl.className =
        'w-32 h-32 rounded-full flex items-center justify-center bg-red-500'
      resultIconEl.innerHTML = '<span class="text-6xl">&#10007;</span>'
      pointsEl.textContent = 'Wrong!'
      pointsEl.className = 'text-4xl font-bold text-red-500 mb-4'
      sounds.play('wrong')
    }
  } else {
    resultIconEl.className =
      'w-32 h-32 rounded-full flex items-center justify-center bg-gray-600'
    resultIconEl.innerHTML = '<span class="text-6xl">?</span>'
    pointsEl.textContent = 'No answer'
    pointsEl.className = 'text-4xl font-bold text-gray-400 mb-4'
  }

  document.getElementById('total-score')!.textContent =
    participant!.score.toLocaleString()
  document.getElementById('current-rank')!.textContent = `#${rank}`
}

async function showFinal() {
  revealViewEl.classList.add('hidden')
  finalViewEl.classList.remove('hidden')

  // Get final standings
  const { data: allParticipants } = await supabase
    .from('quiz_participants')
    .select('id, score')
    .eq('session_id', session!.id)
    .order('score', { ascending: false })

  const rank =
    (allParticipants?.findIndex((p) => p.id === participant!.id) ?? 0) + 1
  const finalScore = participant!.score

  // Trophy for top 3
  const trophyEl = document.getElementById('trophy-container')!
  if (rank <= 3) {
    const trophies = ['&#127942;', '&#129352;', '&#129353;'] // 🏆 🥈 🥉
    trophyEl.innerHTML = `<div class="text-8xl animate-pulse-scale">${trophies[rank - 1]}</div>`
    sounds.play('winner')
  } else {
    trophyEl.innerHTML = ''
  }

  document.getElementById('final-rank')!.textContent = `#${rank}`
  document.getElementById('final-score')!.textContent =
    finalScore.toLocaleString()

  // Play again button
  document.getElementById('play-again-btn')!.onclick = () => {
    window.location.href = '/'
  }
}
