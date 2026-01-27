# Quiz Time

Real-time quiz app for live events. A Kahoot/Mentimeter alternative.

**Live:** https://quizzard.fly.dev

## Features

- QR code join for players
- Real-time sync (Supabase Realtime)
- Kahoot-style scoring (faster = more points)
- Image question support
- 180 player cap (Supabase free tier)
- Auto-deploy via GitHub Actions

## Requirements

- **Supabase** project (Postgres + Realtime) - set up your own tables
- **Fly.io** or any static host (Vercel, Netlify, etc.)

## Quick Start

```bash
npm install
cp .env.example .env  # Add your Supabase credentials
npm run dev
```

- Host: http://localhost:5173
- Player: http://localhost:5173/play.html

## Questions Format

Edit `public/questions.yaml`:

```yaml
quiz:
  title: "My Quiz"
  default_time_seconds: 20

questions:
  - text: "What is 2 + 2?"
    options: ["3", "4", "5", "6"]
    correct: 1
    time_seconds: 15

  - text: "What animal is this?"
    image: "/images/cat.jpg"
    options: ["Dog", "Cat", "Rabbit"]
    correct: 1
```

Images go in `public/images/`.

## Deploy

Push to `main` → auto-deploys to Fly.io via GitHub Actions.

Manual: `fly deploy`

## Sound Effects

Sourced from [Orange Free Sounds](https://orangefreesounds.com) (CC BY-NC 4.0) and [JimLynchCodes/Game-Sound-Effects](https://github.com/JimLynchCodes/Game-Sound-Effects) (royalty-free).

## License

MIT
