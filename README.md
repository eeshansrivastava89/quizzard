# Quizzard

Real-time quiz app for live events. A Kahoot/Mentimeter alternative.

## Features

- Host quizzes with QR code join
- Real-time participant sync
- Kahoot-style scoring (faster = more points)
- Mobile-friendly player view
- Leaderboard with podium display
- Sound effects

## Tech Stack

- **Frontend:** Vite + TypeScript + Tailwind CSS
- **Backend:** Supabase (Postgres + Realtime)
- **Hosting:** Fly.io

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your Supabase credentials

# Run locally
npm run dev
```

## Configuration

Edit `questions.yaml` to customize your quiz:

```yaml
quiz:
  title: "My Quiz"
  default_time_seconds: 20
  base_points: 1000

questions:
  - text: "What is 2 + 2?"
    options: ["3", "4", "5", "6"]
    correct: 1
    time_seconds: 15
```

## Deployment

```bash
# Deploy to Fly.io
fly launch
fly deploy
```

## Sound Effects Attribution

All sound effects used in this project are **free to use** and **not proprietary**. They are sourced from the following open/free resources:

| Sound | Source | License |
|-------|--------|---------|
| Countdown (tick-tock) | [Orange Free Sounds](https://orangefreesounds.com/tick-tock-sound/) | [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) |
| Time's Up (buzzer) | [Orange Free Sounds](https://orangefreesounds.com/times-up-buzzer-sound-effect/) | [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) |
| Correct Answer | [JimLynchCodes/Game-Sound-Effects](https://github.com/JimLynchCodes/Game-Sound-Effects) | Royalty-free / Open source |
| Wrong Answer | [JimLynchCodes/Game-Sound-Effects](https://github.com/JimLynchCodes/Game-Sound-Effects) | Royalty-free / Open source |
| Winner Celebration | [JimLynchCodes/Game-Sound-Effects](https://github.com/JimLynchCodes/Game-Sound-Effects) | Royalty-free / Open source |
| Leaderboard Reveal | [JimLynchCodes/Game-Sound-Effects](https://github.com/JimLynchCodes/Game-Sound-Effects) | Royalty-free / Open source |

**Disclaimer:** These sound effects are distributed under their respective open licenses. No proprietary or copyrighted audio is included in this project. If you redistribute or modify this project, please maintain appropriate attribution as specified by the original licenses.

## License

MIT
