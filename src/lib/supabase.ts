import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Types for our quiz tables
export interface QuizSession {
  id: string
  join_code: string
  host_secret: string
  state: 'lobby' | 'question' | 'reveal' | 'leaderboard' | 'finished'
  current_question: number
  question_started_at: string | null
  created_at: string
}

export interface QuizParticipant {
  id: string
  session_id: string
  name: string
  score: number
  joined_at: string
}

export interface QuizAnswer {
  id: string
  session_id: string
  participant_id: string
  question_index: number
  selected_option: number
  response_time_ms: number
  points_earned: number
  answered_at: string
}
