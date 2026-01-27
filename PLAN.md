# Quizzard Implementation Plan

> Real-time quiz app for live events. Mentimeter/Kahoot alternative.
> Target: 200 concurrent participants, Kahoot-style scoring, open source.

## Overview

**Tech Stack:**
- Frontend: Vite + TypeScript + Tailwind CSS
- Backend: Supabase (Postgres + Realtime)
- Hosting: Fly.io (static nginx)
- Config: YAML for questions

**Key URLs:**
- Repository: `~/dev/quizzard` → github.com/eeshans/quizzard
- Production: quizzard.fly.dev (or similar)
- Supabase: Reuse `ucla-starbucks-challenge` project with `quiz_` prefixed tables

---

## Phase 1: Project Setup

### 1.1 Create Project Structure

```bash
mkdir -p ~/dev/quizzard
cd ~/dev/quizzard

# Initialize with Vite
npm create vite@latest . -- --template vanilla-ts

# Install dependencies
npm install @supabase/supabase-js js-yaml qrcode
npm install -D tailwindcss postcss autoprefixer @types/js-yaml @types/qrcode
npx tailwindcss init -p
```

### 1.2 Project Structure

```
quizzard/
├── public/
│   ├── images/              # Question images
│   └── sounds/              # Countdown sounds (optional)
├── src/
│   ├── index.html           # Landing: Join or Host
│   ├── host.html            # Organizer dashboard
│   ├── play.html            # Participant view
│   ├── main.ts              # Landing page logic
│   ├── host.ts              # Host logic + realtime subscriptions
│   ├── play.ts              # Player logic + realtime subscriptions
│   ├── lib/
│   │   ├── supabase.ts      # Supabase client init
│   │   ├── scoring.ts       # Kahoot scoring algorithm
│   │   ├── questions.ts     # Load + parse questions.yaml
│   │   └── sounds.ts        # Audio management
│   └── styles/
│       └── main.css         # Tailwind imports
├── questions.yaml           # Quiz content (loaded at build)
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
├── Dockerfile
├── fly.toml
├── .env.example
├── .gitignore
└── README.md
```

### 1.3 Git + GitHub Setup

```bash
cd ~/dev/quizzard
git init
gh repo create quizzard --public --source=. --remote=origin
```

---

## Phase 2: Supabase Schema

### 2.1 Tables (in existing ucla-starbucks-challenge project)

```sql
-- Quiz sessions
create table quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  join_code text unique not null,
  host_secret uuid default gen_random_uuid(),
  state text default 'lobby' check (state in ('lobby', 'question', 'reveal', 'leaderboard', 'finished')),
  current_question int default 0,
  question_started_at timestamptz,
  created_at timestamptz default now()
);

-- Participants
create table quiz_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references quiz_sessions(id) on delete cascade,
  name text not null,
  score int default 0,
  joined_at timestamptz default now(),
  unique(session_id, name)
);

-- Answers
create table quiz_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references quiz_sessions(id) on delete cascade,
  participant_id uuid references quiz_participants(id) on delete cascade,
  question_index int not null,
  selected_option int not null,
  response_time_ms int not null,
  points_earned int default 0,
  answered_at timestamptz default now(),
  unique(participant_id, question_index)
);

-- Indexes for performance
create index idx_quiz_sessions_join_code on quiz_sessions(join_code);
create index idx_quiz_participants_session on quiz_participants(session_id);
create index idx_quiz_answers_session on quiz_answers(session_id);

-- Enable realtime
alter publication supabase_realtime add table quiz_sessions;
alter publication supabase_realtime add table quiz_participants;
alter publication supabase_realtime add table quiz_answers;
```

### 2.2 Row Level Security

```sql
-- Sessions: anyone can read, only host can update (via host_secret check in app)
alter table quiz_sessions enable row level security;
create policy "Sessions are publicly readable" on quiz_sessions for select using (true);
create policy "Sessions can be created by anyone" on quiz_sessions for insert with check (true);
create policy "Sessions can be updated by anyone" on quiz_sessions for update using (true);

-- Participants: anyone can join (insert), read all in session
alter table quiz_participants enable row level security;
create policy "Participants are publicly readable" on quiz_participants for select using (true);
create policy "Anyone can join" on quiz_participants for insert with check (true);
create policy "Scores can be updated" on quiz_participants for update using (true);

-- Answers: participants can insert their own, readable for stats
alter table quiz_answers enable row level security;
create policy "Answers are publicly readable" on quiz_answers for select using (true);
create policy "Participants can submit answers" on quiz_answers for insert with check (true);
create policy "Points can be updated" on quiz_answers for update using (true);
```

---

## Phase 3: Core Implementation

### 3.1 Questions YAML Format

```yaml
# questions.yaml
quiz:
  title: "Starbucks Data Challenge Icebreaker"
  default_time_seconds: 20
  base_points: 1000

questions:
  - text: "What year was Starbucks founded?"
    options: ["1965", "1971", "1982", "1990"]
    correct: 1
    time_seconds: 15

  - text: "Which city is this Starbucks located in?"
    image: "/images/tokyo-starbucks.jpg"
    options: ["Tokyo", "Seoul", "Shanghai", "Singapore"]
    correct: 0

  - text: "How many Starbucks locations exist worldwide (approx)?"
    options: ["15,000", "25,000", "35,000", "45,000"]
    correct: 2
    time_seconds: 20
```

### 3.2 Supabase Client (`src/lib/supabase.ts`)

```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

### 3.3 Scoring Algorithm (`src/lib/scoring.ts`)

```typescript
export function calculatePoints(
  isCorrect: boolean,
  responseTimeMs: number,
  timeLimitMs: number,
  basePoints: number = 1000
): number {
  if (!isCorrect) return 0

  // Kahoot-style: faster answers get more points
  // Points = BasePoints × (1 - (responseTime / timeLimit) × 0.5)
  const timeFactor = Math.min(responseTimeMs / timeLimitMs, 1)
  const points = Math.round(basePoints * (1 - timeFactor * 0.5))

  return Math.max(points, basePoints * 0.5) // Minimum 50% for correct
}
```

### 3.4 Key User Flows

**Host Flow:**
1. Click "Host Quiz" → Create session in DB → Get join_code + host_secret
2. Display QR code + join_code, subscribe to `quiz_participants` for live count
3. Click "Start" → Update session state to 'question', set question_started_at
4. Subscribe to `quiz_answers` for live answer count
5. Timer expires → Update state to 'reveal', show correct answer
6. Click "Next" → Increment current_question, back to step 3
7. After last question → Update state to 'leaderboard', show final rankings

**Player Flow:**
1. Enter join_code or scan QR → Validate session exists
2. Enter name → Insert into `quiz_participants`
3. Subscribe to `quiz_sessions` for state changes
4. When state='question' → Show question + options + timer
5. Tap answer → Insert into `quiz_answers` with response_time_ms
6. When state='reveal' → Show if correct + points earned
7. When state='leaderboard' → Show final rank

---

## Phase 4: UI Implementation

### 4.1 Landing Page (`src/index.html`)

- Large "HOST QUIZ" button (purple/primary)
- Join code input + "JOIN" button
- Clean, centered layout
- Mobile-first

### 4.2 Host View (`src/host.html`)

**Lobby State:**
- Large QR code (use qrcode.js library)
- Join code in big text (e.g., "SBUX42")
- Live participant list with count
- "Start Quiz" button (disabled until 1+ participants)

**Question State:**
- Question text (large, readable from back of room)
- Image if present (centered, max 50% screen)
- 4 answer options (colored bars: red, blue, yellow, green)
- Live answer count bars (animate as answers come in)
- Countdown timer (circular or bar)

**Reveal State:**
- Correct answer highlighted (green border/glow)
- Wrong answers dimmed
- Points animation
- "Next Question" button

**Leaderboard State:**
- Top 5 with scores
- Podium style for top 3 (gold/silver/bronze)
- Confetti animation for winner

### 4.3 Player View (`src/play.html`)

**Join State:**
- Name input
- "Join" button
- Session title displayed

**Waiting State:**
- "Waiting for host to start..."
- Their name displayed
- Participant count

**Question State:**
- Question text (smaller, they see image on projector)
- 4 large tap-friendly buttons (full width, stacked)
- Countdown timer
- Vibration on tap (mobile)

**Answered State:**
- "Answer locked in!" message
- Waiting for reveal

**Reveal State:**
- Big checkmark (green) or X (red)
- Points earned: "+850 points"
- Current rank: "You're #3"

**Final State:**
- Final rank + total score
- Celebration animation if top 3

### 4.4 Styling Notes

- Use Tailwind's default color palette
- Primary: purple-600 (wizard theme)
- Answer colors: red-500, blue-500, yellow-500, green-500
- Large touch targets (min 48px) for mobile
- Readable fonts at distance for host view
- Dark mode support (prefers-color-scheme)

---

## Phase 5: Sound Effects (Optional)

### 5.1 Sound Files

```
public/sounds/
├── countdown.mp3      # Tick-tock during question (loop)
├── times-up.mp3       # Buzzer when timer ends
├── correct.mp3        # Ding for correct answer
├── wrong.mp3          # Buzz for wrong answer
├── leaderboard.mp3    # Dramatic reveal music
└── winner.mp3         # Celebration for #1
```

Source: Free sound effects from mixkit.co or similar

### 5.2 Audio Manager

```typescript
// src/lib/sounds.ts
export const sounds = {
  countdown: new Audio('/sounds/countdown.mp3'),
  timesUp: new Audio('/sounds/times-up.mp3'),
  // ...
}

sounds.countdown.loop = true

export function playCountdown() {
  sounds.countdown.currentTime = 0
  sounds.countdown.play()
}

export function stopCountdown() {
  sounds.countdown.pause()
}
```

---

## Phase 6: Deployment

### 6.1 Dockerfile

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
```

### 6.2 nginx.conf

```nginx
server {
    listen 8080;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### 6.3 fly.toml

```toml
app = 'quizzard'
primary_region = 'lax'

[build]

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = 'stop'
  auto_start_machines = true
  min_machines_running = 0

[[vm]]
  memory = '256mb'
  cpu_kind = 'shared'
  cpus = 1
```

### 6.4 Environment Variables

```bash
# .env.example (for local dev)
VITE_SUPABASE_URL=https://ayosczldjpycqzwrexfu.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Note: For static hosting, env vars are baked into the build. This is fine since anon key is public.

---

## Phase 7: Implementation Order

### Step 1: Project Scaffolding
- [ ] Create ~/dev/quizzard directory
- [ ] Initialize Vite + TypeScript
- [ ] Configure Tailwind CSS
- [ ] Set up project structure
- [ ] Create .gitignore, .env.example
- [ ] Initialize git repo
- [ ] Create GitHub repo

### Step 2: Supabase Setup
- [ ] Apply migration for quiz tables
- [ ] Enable RLS policies
- [ ] Enable realtime
- [ ] Test with Supabase dashboard

### Step 3: Core Library Code
- [ ] supabase.ts - client init
- [ ] scoring.ts - Kahoot algorithm
- [ ] questions.ts - YAML loader
- [ ] sounds.ts - audio manager (optional)

### Step 4: Landing Page
- [ ] index.html layout
- [ ] main.ts - host/join logic
- [ ] Tailwind styling

### Step 5: Host View
- [ ] host.html layout
- [ ] host.ts - session creation
- [ ] QR code generation
- [ ] Realtime subscriptions (participants, answers)
- [ ] Game state machine
- [ ] Answer distribution visualization
- [ ] Leaderboard display

### Step 6: Player View
- [ ] play.html layout
- [ ] play.ts - join flow
- [ ] Realtime subscription (session state)
- [ ] Answer submission
- [ ] Score display
- [ ] Mobile optimization

### Step 7: Polish
- [ ] Sound effects
- [ ] Animations (confetti, transitions)
- [ ] Error handling
- [ ] Loading states

### Step 8: Deployment
- [ ] Create Dockerfile + nginx.conf
- [ ] Create fly.toml
- [ ] Deploy to Fly.io
- [ ] Test with real devices

### Step 9: Documentation
- [ ] README.md with setup instructions
- [ ] Sample questions.yaml
- [ ] Screenshots

---

## Verification

### Local Testing
```bash
cd ~/dev/quizzard
npm run dev
# Open localhost:5173 in two browser windows
# One as host, one as player
# Verify realtime sync works
```

### Production Testing
```bash
fly deploy
# Test with phone + laptop
# Verify QR code works
# Verify 200 concurrent connections
```

### Checklist
- [ ] Host can create session and see QR code
- [ ] Players can join via QR code or join code
- [ ] Participant count updates in real-time
- [ ] Questions display correctly (text + images)
- [ ] Timer counts down
- [ ] Answers are recorded with timing
- [ ] Correct answer reveal works
- [ ] Scoring is calculated correctly (Kahoot-style)
- [ ] Leaderboard updates after each question
- [ ] Final leaderboard shows top 3
- [ ] Works on mobile (responsive)
- [ ] Sounds play correctly (if enabled)

---

## Dependencies

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.x",
    "js-yaml": "^4.x",
    "qrcode": "^1.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "vite": "^5.x",
    "tailwindcss": "^3.x",
    "postcss": "^8.x",
    "autoprefixer": "^10.x",
    "@types/js-yaml": "^4.x",
    "@types/qrcode": "^1.x"
  }
}
```

---

## Open Items Resolved

| Question | Decision |
|----------|----------|
| Questions source | YAML config file, images in /public/images |
| Scoring | Kahoot-style (faster = more points) |
| Reusability | Open source on GitHub, clean README |
| Hosting | New Fly app (quizzard), separate from data challenge |
| Styling | Tailwind, generic but polished |
| Supabase | Reuse existing project with quiz_ prefix |
| Sounds | Include free sound effects |

---

## Session Continuity

If Claude context runs out, start a new session with:

```
Read ~/dev/quizzard/PLAN.md and continue implementation from where we left off.
Check git status to see what's been completed.
```
