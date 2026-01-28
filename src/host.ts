import './styles/main.css'
import { supabase } from './lib/supabase'
import type { QuizSession, QuizParticipant, QuizAnswer } from './lib/supabase'
import { generateJoinCode, calculatePoints } from './lib/scoring'
import { loadQuestions, getQuestionTime } from './lib/questions'
import type { QuizConfig, Question } from './lib/questions'
import { sounds } from './lib/sounds'
import QRCode from 'qrcode'

// State
let session: QuizSession | null = null
let participants: QuizParticipant[] = []
let answers: QuizAnswer[] = []
let config: QuizConfig | null = null
let timerInterval: number | null = null

// Subscription channels for cleanup
let participantsChannel: ReturnType<typeof supabase.channel> | null = null
let answersChannel: ReturnType<typeof supabase.channel> | null = null

// DOM Elements
const loadingEl = document.getElementById('loading')!
const lobbyEl = document.getElementById('lobby')!
const questionViewEl = document.getElementById('question-view')!
const revealViewEl = document.getElementById('reveal-view')!
const leaderboardViewEl = document.getElementById('leaderboard-view')!

// Cleanup on page unload to prevent memory leaks
window.addEventListener('beforeunload', cleanup)

function cleanup() {
  // Clear timer
  if (timerInterval) {
    clearInterval(timerInterval)
    timerInterval = null
  }
  // Unsubscribe from channels
  if (participantsChannel) {
    supabase.removeChannel(participantsChannel)
    participantsChannel = null
  }
  if (answersChannel) {
    supabase.removeChannel(answersChannel)
    answersChannel = null
  }
  // Stop sounds
  sounds.stopAll()
}

// Initialize
init()

async function init() {
  try {
    config = await loadQuestions()

    // Validate questions exist
    if (!config.questions || config.questions.length === 0) {
      throw new Error('No questions found in quiz configuration')
    }

    // Check for existing active session
    const existingSession = await checkExistingSession()
    if (existingSession) {
      showReconnectModal(existingSession)
      return
    }

    await createSession()
    setupSubscriptions()
  } catch (e) {
    console.error('Failed to initialize:', e)
    alert('Failed to create quiz session: ' + (e instanceof Error ? e.message : 'Unknown error'))
  }
}

async function checkExistingSession(): Promise<QuizSession | null> {
  const saved = localStorage.getItem('quiz_host_session')
  if (!saved) return null

  try {
    const { sessionId, hostSecret } = JSON.parse(saved)

    // Fetch session from DB
    const { data, error } = await supabase
      .from('quiz_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('host_secret', hostSecret)
      .single()

    if (error || !data) {
      localStorage.removeItem('quiz_host_session')
      return null
    }

    const sessionData = data as QuizSession

    // Only reconnect if session is active (not finished/abandoned)
    if (['lobby', 'question', 'reveal', 'leaderboard'].includes(sessionData.state)) {
      return sessionData
    }

    // Session is finished or abandoned, clear and start fresh
    localStorage.removeItem('quiz_host_session')
    return null
  } catch {
    localStorage.removeItem('quiz_host_session')
    return null
  }
}

function showReconnectModal(existingSession: QuizSession) {
  loadingEl.classList.add('hidden')

  const modal = document.getElementById('reconnect-modal')!
  const codeEl = document.getElementById('reconnect-code')!
  const stateEl = document.getElementById('reconnect-state')!
  const continueBtn = document.getElementById('reconnect-continue') as HTMLButtonElement
  const abandonBtn = document.getElementById('reconnect-abandon') as HTMLButtonElement

  codeEl.textContent = existingSession.join_code
  stateEl.textContent = existingSession.state

  modal.classList.remove('hidden')

  continueBtn.onclick = async () => {
    continueBtn.disabled = true
    abandonBtn.disabled = true
    modal.classList.add('hidden')
    await reconnectToSession(existingSession)
  }

  abandonBtn.onclick = async () => {
    continueBtn.disabled = true
    abandonBtn.disabled = true
    modal.classList.add('hidden')
    loadingEl.classList.remove('hidden')

    // Mark session as abandoned
    await supabase
      .from('quiz_sessions')
      .update({ state: 'abandoned' })
      .eq('id', existingSession.id)

    localStorage.removeItem('quiz_host_session')

    // Create new session
    await createSession()
    setupSubscriptions()
  }
}

async function reconnectToSession(existingSession: QuizSession) {
  session = existingSession

  // Fetch participants
  const { data: participantsData, error: participantsError } = await supabase
    .from('quiz_participants')
    .select('*')
    .eq('session_id', session.id)

  if (participantsError) {
    console.error('Failed to fetch participants:', participantsError)
    alert('Could not restore game state. Starting a new game.')
    localStorage.removeItem('quiz_host_session')
    window.location.reload()
    return
  }

  participants = (participantsData || []) as QuizParticipant[]

  // Fetch answers
  const { data: answersData, error: answersError } = await supabase
    .from('quiz_answers')
    .select('*')
    .eq('session_id', session.id)

  if (answersError) {
    console.error('Failed to fetch answers:', answersError)
    alert('Could not restore game state. Starting a new game.')
    localStorage.removeItem('quiz_host_session')
    window.location.reload()
    return
  }

  answers = (answersData || []) as QuizAnswer[]

  setupSubscriptions()

  // Hide loading before showing restored view
  loadingEl.classList.add('hidden')

  // Restore to appropriate view based on state
  switch (session.state) {
    case 'lobby':
      showLobby()
      break
    case 'question':
      showQuestionReconnect()
      break
    case 'reveal':
      showRevealReconnect()
      break
    case 'leaderboard':
      showLeaderboard()
      break
  }
}

async function createSession() {
  const joinCode = generateJoinCode()

  const { data, error } = await supabase
    .from('quiz_sessions')
    .insert({ join_code: joinCode })
    .select()
    .single()

  if (error || !data) {
    throw new Error('Failed to create session')
  }

  session = data as QuizSession

  // Store session info in localStorage for reconnection
  localStorage.setItem('quiz_host_session', JSON.stringify({
    sessionId: session.id,
    hostSecret: session.host_secret,
    joinCode: session.join_code
  }))

  showLobby()
}

function showLobby() {
  loadingEl.classList.add('hidden')
  lobbyEl.classList.remove('hidden')

  // Display join code
  document.getElementById('join-code-display')!.textContent = session!.join_code

  // Generate QR code
  const url = `${window.location.origin}/play.html?code=${session!.join_code}`
  QRCode.toCanvas(document.getElementById('qr-code'), url, {
    width: 200,
    margin: 0,
    color: { dark: '#000000', light: '#ffffff' }
  })

  // Update participant display (important for reconnect with existing participants)
  updateParticipantDisplay()

  // Start button
  document.getElementById('start-btn')!.addEventListener('click', startQuiz)
}

function setupSubscriptions() {
  // Subscribe to participants joining
  participantsChannel = supabase
    .channel('participants')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'quiz_participants',
        filter: `session_id=eq.${session!.id}`
      },
      (payload) => {
        const participant = payload.new as QuizParticipant
        participants.push(participant)
        updateParticipantDisplay()
      }
    )
    .subscribe()

  // Subscribe to answers
  answersChannel = supabase
    .channel('answers')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'quiz_answers',
        filter: `session_id=eq.${session!.id}`
      },
      (payload) => {
        const answer = payload.new as QuizAnswer
        answers.push(answer)
        updateAnswerCount()
      }
    )
    .subscribe()
}

function updateParticipantDisplay() {
  const countEl = document.getElementById('participant-count')!
  const listEl = document.getElementById('participant-list')!
  const startBtn = document.getElementById('start-btn') as HTMLButtonElement

  countEl.textContent = participants.length.toString()

  listEl.innerHTML = participants
    .map(
      (p) =>
        `<span class="bg-gray-800 px-3 py-1 rounded-full text-sm animate-slide-up">${p.name}</span>`
    )
    .join('')

  startBtn.disabled = participants.length === 0
}

function updateAnswerCount() {
  const currentQAnswers = answers.filter(
    (a) => a.question_index === session!.current_question
  )
  document.getElementById('answer-count')!.textContent =
    currentQAnswers.length.toString()
}

async function startQuiz() {
  // Double-check we have participants
  if (participants.length === 0) {
    alert('Need at least one player to start!')
    return
  }

  await updateSessionState('question')
  showQuestion()
}

async function updateSessionState(
  state: QuizSession['state'],
  currentQuestion?: number
) {
  const update: Partial<QuizSession> = { state }
  if (currentQuestion !== undefined) {
    update.current_question = currentQuestion
  }
  if (state === 'question') {
    update.question_started_at = new Date().toISOString()
  }

  const { error } = await supabase
    .from('quiz_sessions')
    .update(update)
    .eq('id', session!.id)

  if (error) {
    console.error('Failed to update session:', error)
    return
  }

  session = { ...session!, ...update } as QuizSession
}

function displayQuestion(question: Question, answerCount: number) {
  // Hide other views, show question
  lobbyEl.classList.add('hidden')
  revealViewEl.classList.add('hidden')
  questionViewEl.classList.remove('hidden')

  // Update question display
  document.getElementById('q-number')!.textContent = (
    session!.current_question + 1
  ).toString()
  document.getElementById('q-total')!.textContent =
    config!.questions.length.toString()
  document.getElementById('question-text')!.textContent = question.text

  // Image handling
  const imageContainer = document.getElementById('question-image-container')!
  const imageEl = document.getElementById('question-image') as HTMLImageElement
  const spacer = document.getElementById('question-spacer')!
  if (question.image) {
    imageEl.src = question.image
    imageContainer.classList.remove('hidden')
    spacer.classList.add('hidden')
  } else {
    imageContainer.classList.add('hidden')
    spacer.classList.remove('hidden')
  }

  // Options
  question.options.forEach((option, i) => {
    document.querySelector(`#option-${i} .option-text`)!.textContent = option
  })

  // Answer count
  document.getElementById('answer-count')!.textContent = answerCount.toString()
  document.getElementById('total-participants')!.textContent =
    participants.length.toString()
}

function showQuestion() {
  // Bounds check for question index
  if (session!.current_question >= config!.questions.length) {
    console.error('Invalid question index:', session!.current_question)
    showLeaderboard()
    return
  }

  const question = config!.questions[session!.current_question]
  const timeMs = getQuestionTime(question, config!)

  displayQuestion(question, 0)
  startTimer(timeMs)
  sounds.play('countdown')
}

function showQuestionReconnect() {
  // Bounds check for question index
  if (session!.current_question >= config!.questions.length) {
    console.error('Invalid question index:', session!.current_question)
    showLeaderboard()
    return
  }

  const question = config!.questions[session!.current_question]
  const totalTimeMs = getQuestionTime(question, config!)

  // Calculate remaining time
  const startedAt = new Date(session!.question_started_at!).getTime()
  const remainingMs = Math.max(0, totalTimeMs - (Date.now() - startedAt))

  // If time already expired, go to reveal
  if (remainingMs <= 0) {
    showReveal()
    return
  }

  const currentQAnswers = answers.filter(
    (a) => a.question_index === session!.current_question
  )

  displayQuestion(question, currentQAnswers.length)
  startTimer(totalTimeMs, startedAt)
  sounds.play('countdown')
}

function renderAnswerDistribution(question: Question, questionAnswers: QuizAnswer[]) {
  const distributionEl = document.getElementById('answer-distribution')!
  const colors = ['answer-red', 'answer-blue', 'answer-yellow', 'answer-green']

  distributionEl.innerHTML = question.options
    .map((option, i) => {
      const count = questionAnswers.filter((a) => a.selected_option === i).length
      const percent =
        questionAnswers.length > 0 ? (count / questionAnswers.length) * 100 : 0
      const isCorrect = i === question.correct

      return `
        <div class="flex items-center gap-4">
          <div class="w-8 text-right">${count}</div>
          <div class="flex-1 h-12 bg-gray-800 rounded-lg overflow-hidden relative">
            <div class="${colors[i]} h-full transition-all duration-500 ${
        isCorrect ? 'ring-4 ring-white' : 'opacity-50'
      }" style="width: ${percent}%"></div>
            <span class="absolute inset-0 flex items-center px-4 font-bold ${
              isCorrect ? '' : 'opacity-50'
            }">${option} ${isCorrect ? '✓' : ''}</span>
          </div>
        </div>
      `
    })
    .join('')
}

function setupNextButton() {
  const nextBtn = document.getElementById('next-btn')!
  const isLastQuestion =
    session!.current_question >= config!.questions.length - 1

  nextBtn.textContent = isLastQuestion ? 'SHOW RESULTS' : 'NEXT QUESTION'
  nextBtn.onclick = isLastQuestion ? showLeaderboard : nextQuestion
}

function showRevealReconnect() {
  questionViewEl.classList.add('hidden')
  revealViewEl.classList.remove('hidden')

  const question = config!.questions[session!.current_question]
  const questionAnswers = answers.filter(
    (a) => a.question_index === session!.current_question
  )

  document.getElementById('reveal-question')!.textContent = question.text
  renderAnswerDistribution(question, questionAnswers)
  setupNextButton()
}

function startTimer(totalTimeMs: number, startedAt?: number) {
  const timerEl = document.getElementById('timer')!
  const timerBarEl = document.getElementById('timer-bar')!
  const endTime = startedAt ? startedAt + totalTimeMs : Date.now() + totalTimeMs

  // Clear existing timer
  if (timerInterval) {
    clearInterval(timerInterval)
    timerInterval = null
  }

  timerInterval = setInterval(() => {
    const remaining = Math.max(0, endTime - Date.now())
    const seconds = Math.ceil(remaining / 1000)
    const percent = (remaining / totalTimeMs) * 100

    timerEl.textContent = seconds.toString()
    timerBarEl.style.width = `${percent}%`

    // Color changes
    timerBarEl.classList.remove('warning', 'danger')
    if (percent < 20) {
      timerBarEl.classList.add('danger')
    } else if (percent < 50) {
      timerBarEl.classList.add('warning')
    }

    if (remaining === 0) {
      clearInterval(timerInterval!)
      timerInterval = null
      sounds.stop('countdown')
      sounds.play('timesUp')
      showReveal()
    }
  }, 100) as unknown as number
}

async function showReveal() {
  questionViewEl.classList.add('hidden')
  revealViewEl.classList.remove('hidden')

  const question = config!.questions[session!.current_question]
  const questionAnswers = answers.filter(
    (a) => a.question_index === session!.current_question
  )

  document.getElementById('reveal-question')!.textContent = question.text

  // Calculate points and update participants
  await calculateAndUpdateScores(question, questionAnswers)

  renderAnswerDistribution(question, questionAnswers)
  await updateSessionState('reveal')
  setupNextButton()
}

async function calculateAndUpdateScores(
  question: Question,
  questionAnswers: QuizAnswer[]
) {
  const timeMs = getQuestionTime(question, config!)

  // Process all answers and calculate points
  const updates: { answerId: string; participantId: string; points: number }[] = []

  for (const answer of questionAnswers) {
    const isCorrect = answer.selected_option === question.correct
    const points = calculatePoints(
      isCorrect,
      answer.response_time_ms,
      timeMs,
      config!.quiz.base_points
    )

    updates.push({
      answerId: answer.id,
      participantId: answer.participant_id,
      points
    })
  }

  // Update answers with points earned
  for (const update of updates) {
    await supabase
      .from('quiz_answers')
      .update({ points_earned: update.points })
      .eq('id', update.answerId)
  }

  // Update participant scores using atomic increment to prevent race conditions
  for (const update of updates) {
    if (update.points > 0) {
      // Try atomic increment via RPC function
      const { error } = await supabase.rpc('increment_score', {
        participant_id: update.participantId,
        points_to_add: update.points
      })

      // If RPC failed (function doesn't exist), fall back to direct update
      if (error) {
        console.warn('RPC increment_score failed, using fallback:', error.message)
        const { data: current } = await supabase
          .from('quiz_participants')
          .select('score')
          .eq('id', update.participantId)
          .single()

        if (current) {
          await supabase
            .from('quiz_participants')
            .update({ score: current.score + update.points })
            .eq('id', update.participantId)
        }
      }

      // Update local state
      const participant = participants.find((p) => p.id === update.participantId)
      if (participant) {
        participant.score += update.points
      }
    }
  }
}

async function nextQuestion() {
  answers = answers.filter((a) => a.question_index !== session!.current_question)
  await updateSessionState('question', session!.current_question + 1)
  showQuestion()
}

async function showLeaderboard() {
  // Clear timer if still running
  if (timerInterval) {
    clearInterval(timerInterval)
    timerInterval = null
  }

  questionViewEl.classList.add('hidden')
  revealViewEl.classList.add('hidden')
  leaderboardViewEl.classList.remove('hidden')

  await updateSessionState('leaderboard')

  // Fetch fresh scores from database to ensure accuracy
  const { data: freshParticipants } = await supabase
    .from('quiz_participants')
    .select('*')
    .eq('session_id', session!.id)
    .order('score', { ascending: false })

  const sorted = freshParticipants || [...participants].sort((a, b) => b.score - a.score)

  // Podium (top 3)
  const podiumEl = document.getElementById('podium')!
  const podiumColors = ['podium-gold', 'podium-silver', 'podium-bronze']
  const podiumHeights = ['h-32', 'h-24', 'h-20']
  const podiumOrder = [1, 0, 2] // Show 2nd, 1st, 3rd for visual effect

  podiumEl.innerHTML = podiumOrder
    .map((place) => {
      const p = sorted[place]
      if (!p) return ''
      return `
        <div class="flex flex-col items-center animate-slide-up" style="animation-delay: ${place * 0.2}s">
          <div class="text-lg font-bold mb-2">${p.name}</div>
          <div class="text-sm text-gray-400 mb-2">${p.score.toLocaleString()}</div>
          <div class="w-24 ${podiumHeights[place]} ${podiumColors[place]} rounded-t-lg flex items-start justify-center pt-4">
            <span class="text-2xl font-bold">${place + 1}</span>
          </div>
        </div>
      `
    })
    .join('')

  // Full rankings (4th place and beyond)
  const rankingsEl = document.getElementById('rankings')!
  rankingsEl.innerHTML = sorted
    .slice(3)
    .map(
      (p, i) => `
        <div class="flex items-center bg-gray-800 rounded-lg px-4 py-2">
          <span class="w-8 text-gray-400">${i + 4}</span>
          <span class="flex-1">${p.name}</span>
          <span class="font-bold">${p.score.toLocaleString()}</span>
        </div>
      `
    )
    .join('')

  // Play celebration sound
  sounds.play('winner')

  // New game button
  document.getElementById('new-game-btn')!.onclick = () => {
    cleanup()
    window.location.href = '/host.html'
  }

  // Mark session as finished and clear localStorage
  await updateSessionState('finished')
  localStorage.removeItem('quiz_host_session')
}
