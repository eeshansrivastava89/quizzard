import yaml from 'js-yaml'

export interface Question {
  text: string
  options: string[]
  correct: number
  time_seconds?: number
  image?: string
}

export interface QuizConfig {
  quiz: {
    title: string
    default_time_seconds: number
    base_points: number
  }
  questions: Question[]
}

let cachedConfig: QuizConfig | null = null

export async function loadQuestions(): Promise<QuizConfig> {
  if (cachedConfig) return cachedConfig

  const response = await fetch('/questions.yaml')
  const text = await response.text()
  cachedConfig = yaml.load(text) as QuizConfig
  return cachedConfig
}

export function getQuestionTime(question: Question, config: QuizConfig): number {
  return (question.time_seconds ?? config.quiz.default_time_seconds) * 1000
}
