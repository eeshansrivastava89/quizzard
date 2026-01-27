// Audio manager for quiz sounds
// Sounds are optional - will gracefully degrade if files don't exist

class SoundManager {
  private sounds: Map<string, HTMLAudioElement> = new Map()
  private enabled = true

  constructor() {
    this.preload('countdown', '/sounds/countdown.mp3', true)
    this.preload('timesUp', '/sounds/times-up.mp3')
    this.preload('correct', '/sounds/correct.wav')
    this.preload('wrong', '/sounds/wrong.wav')
    this.preload('leaderboard', '/sounds/leaderboard.wav')
    this.preload('winner', '/sounds/winner.wav')
  }

  private preload(name: string, src: string, loop = false) {
    const audio = new Audio(src)
    audio.loop = loop
    audio.preload = 'auto'
    // Silently fail if sound doesn't exist
    audio.onerror = () => {
      console.log(`Sound ${name} not available`)
    }
    this.sounds.set(name, audio)
  }

  play(name: string) {
    if (!this.enabled) return
    const sound = this.sounds.get(name)
    if (sound) {
      sound.currentTime = 0
      sound.play().catch(() => {
        // Autoplay blocked - user needs to interact first
      })
    }
  }

  stop(name: string) {
    const sound = this.sounds.get(name)
    if (sound) {
      sound.pause()
      sound.currentTime = 0
    }
  }

  stopAll() {
    this.sounds.forEach((sound) => {
      sound.pause()
      sound.currentTime = 0
    })
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled
    if (!enabled) this.stopAll()
  }
}

export const sounds = new SoundManager()
