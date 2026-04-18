# Technical Design Document

## Overview

WhisperWorld is a mobile-first web application that lets users photograph living things in nature and hold real-time voice conversations with them. The system chains Google Gemini Vision (identification) → ElevenLabs Voice Design + Conversational AI (personality + dialogue) → Supabase (persistence), with GPS-based creature identity, ambient sound, and personality archetypes layered on top.

**Deployment targets (free tiers unless noted):**
- Frontend: Vercel (Next.js)
- Backend API: Railway (Node.js / Express)
- Database + Auth: Supabase (PostgreSQL + Supabase Auth)
- AI / Voice: Google Gemini Vision (free tier), ElevenLabs (paid — only paid service permitted)

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Next.js Frontend (Vercel)           │
│  Camera/Upload → GPS capture → WebSocket client     │
│  Ambient_Sound_Engine (browser AudioContext)        │
└────────────────────┬────────────────────────────────┘
                     │ HTTPS / WebSocket
┌────────────────────▼────────────────────────────────┐
│              Express API Server (Railway)            │
│  /api/identify   → Vision_Engine                    │
│  /api/profile    → Character_Engine + Location_Svc  │
│  /api/sing       → Song_Engine                      │
│  /ws/session     → Conversation_Agent proxy         │
└──────┬──────────────────────────┬───────────────────┘
       │                          │
┌──────▼──────┐          ┌────────▼────────┐
│  Supabase   │          │   ElevenLabs    │
│  (Memory_   │          │  Voice Design   │
│   Store)    │          │  Conversational │
│  + Auth     │          │  TTS v3         │
└─────────────┘          │  Sound Effects  │
                         └─────────────────┘
       │
┌──────▼──────┐
│   Google    │
│  Gemini     │
│  Vision API │
└─────────────┘
```

---

## Component Design

### 1. Vision_Engine

**Location:** `server/services/visionEngine.ts`

**Responsibility:** Submit images to Gemini Vision and parse results.

**Interface:**
```typescript
interface IdentificationResult {
  species: string;
  commonName: string;
  habitat: string;
  confidence: number; // 0.0–1.0
  category: CreatureCategory; // used for archetype lookup
}

type CreatureCategory =
  | 'flower'
  | 'insect'
  | 'tree'
  | 'squirrel'
  | 'bird'
  | 'mushroom'
  | 'default';

async function identify(imageBuffer: Buffer): Promise<IdentificationResult[]>
```

**Prompt strategy:** A structured JSON-mode prompt instructs Gemini to return an array of subjects, each with `species`, `commonName`, `habitat`, `confidence`, and a `category` field constrained to the `CreatureCategory` union. This keeps downstream archetype mapping deterministic.

**Error handling:**
- No subject detected → throw `NoCreatureError`
- API timeout (10 s) → throw `VisionUnavailableError`

---

### 2. Location_Service

**Location:** `server/services/locationService.ts`

**Responsibility:** Find an existing Creature_Profile within 50 m of submitted GPS coordinates.

**Interface:**
```typescript
async function findNearbyProfile(
  userId: string,
  species: string,
  lat: number,
  lng: number
): Promise<CreatureProfile | null>
```

**Implementation:** Uses the Supabase PostGIS `ST_DWithin` function on the `creature_profiles` table. Coordinates are stored as a `GEOGRAPHY(POINT)` column. The query filters by `user_id` and `species` first (index), then applies the 50 m spatial filter.

```sql
SELECT * FROM creature_profiles
WHERE user_id = $1
  AND species = $2
  AND ST_DWithin(location::geography, ST_MakePoint($4, $3)::geography, 50)
ORDER BY created_at DESC
LIMIT 1;
```

If GPS is absent from the request, the service returns `null` and the Character_Engine falls back to species+user matching (Requirement 3, criterion 5).

---

### 3. Character_Engine

**Location:** `server/services/characterEngine.ts`

**Responsibility:** Generate or load a Creature_Profile, applying personality archetypes and persisting to Supabase.

**Personality Archetype Map:**
```typescript
const ARCHETYPES: Record<CreatureCategory, string[]> = {
  flower:   ['warm', 'poetic', 'romantic'],
  insect:   ['anxious', 'hardworking', 'fast-talking'],
  tree:     ['ancient', 'wise', 'slow', 'philosophical'],
  squirrel: ['hyperactive', 'scattered', 'excitable'],
  mushroom: ['mysterious', 'cryptic', 'whispery'],
  bird:     ['free-spirited', 'musical', 'observant'],
  default:  ['curious', 'gentle', 'wondering'],
};
```

**Profile generation flow:**
1. Call `Location_Service.findNearbyProfile()` (GPS path) or query by `user_id + species` (fallback).
2. If existing profile found → return it.
3. Otherwise, call Gemini to generate `{ name, traits, backstory, speakingStyle }` using the archetype traits as seed.
4. Call ElevenLabs Voice Design API with a prompt built from `speakingStyle` + archetype traits.
5. Persist new `CreatureProfile` to Supabase with GPS coordinates.
6. Return profile.

**Interface:**
```typescript
interface CreatureProfile {
  id: string;
  userId: string;
  species: string;
  commonName: string;
  category: CreatureCategory;
  name: string;
  traits: string[];
  backstory: string;
  speakingStyle: string;
  voiceId: string;
  location?: { lat: number; lng: number };
  createdAt: string;
  lastSeenAt: string;
}

async function getOrCreateProfile(
  userId: string,
  identification: IdentificationResult,
  gps?: { lat: number; lng: number }
): Promise<CreatureProfile>
```

---

### 4. Conversation_Agent

**Location:** `server/services/conversationAgent.ts`

**Responsibility:** Proxy WebSocket connections between the browser and ElevenLabs Conversational AI, injecting the creature's system prompt.

**System prompt construction:**
```
You are {name}, a {species}. 
Personality: {traits joined by ", "}.
Backstory: {backstory}
Speaking style: {speakingStyle}
{conversationHistorySummary if exists}
Stay fully in character at all times.
```

**WebSocket flow:**
1. Client connects to `/ws/session?profileId=<id>`.
2. Server loads `CreatureProfile` + conversation history from Supabase.
3. Server opens an ElevenLabs Conversational AI WebSocket with the constructed system prompt and `voiceId`.
4. Server pipes audio frames bidirectionally between client and ElevenLabs.
5. On session end, server saves transcript summary to `session_summaries` table.

**Reconnection:** Client retries up to 3 times with 2 s exponential backoff before surfacing an error.

---

### 5. Song_Engine

**Location:** `server/services/songEngine.ts`

**Responsibility:** Generate a sung audio clip via ElevenLabs TTS v3, with lyrics produced in-character by the ElevenLabs Conversational AI agent.

**Interface:**
```typescript
async function generateSong(profile: CreatureProfile): Promise<Buffer>
```

**Lyric generation:** Rather than using Gemini to write lyrics, the Song_Engine sends a structured turn to the creature's ElevenLabs Conversational AI agent asking it to compose 4–8 lines of song lyrics in character. The agent responds as the creature — drawing on its personality, species, habitat, and speaking style — ensuring the lyrics are tonally consistent with the creature's voice. The returned lyric text is then passed directly to ElevenLabs TTS v3 with the creature's `voiceId` and a `singing` style parameter.

**Flow:**
1. Open a short-lived ElevenLabs ConvAI session for `profile.voiceId` with the creature's system prompt.
2. Send a single user turn: `"Compose a short song (4–8 lines) about yourself, your home, and what you love. Respond with only the lyrics."`.
3. Capture the agent's text response as the lyric string.
4. POST the lyric string to ElevenLabs TTS v3 (`/v1/text-to-speech/{voiceId}`) with `model_id: "eleven_multilingual_v3"` and `voice_settings.style: 1.0` (singing).
5. Return the audio `Buffer`.

**Timeout:** The entire call must complete within 10 s; otherwise a `SongGenerationError` is thrown and the Conversation_Agent informs the user.

---

### 6. Ambient_Sound_Engine

**Location:** `client/services/ambientSoundEngine.ts` (browser)

**Responsibility:** Fetch and loop background nature sounds during active sessions.

**Sound prompt mapping:**
```typescript
const AMBIENT_PROMPTS: Record<CreatureCategory, string> = {
  flower:   'gentle garden breeze with bees and birdsong',
  insect:   'forest floor ambience with rustling leaves',
  tree:     'ancient woodland with wind through tall canopy',
  squirrel: 'lively park with rustling leaves and distant children',
  mushroom: 'damp forest floor with dripping water and distant owls',
  bird:     'open sky with light wind and distant bird calls',
  default:  'peaceful nature ambience with soft wind',
};
```

**Implementation:**
1. On session start, POST `/api/ambient?category=<category>` → server fetches ElevenLabs Sound Effects audio and streams it back.
2. Browser decodes audio into an `AudioBuffer` via the Web Audio API.
3. A `GainNode` keeps ambient volume at 20% of master volume.
4. Audio loops via `AudioBufferSourceNode.loop = true`.
5. On session end, `AudioBufferSourceNode.stop()` is called.
6. If the API call fails, the session proceeds silently (non-blocking).

---

### 7. Group_Conversation_Manager

**Location:** `server/services/groupConversationManager.ts`

**Responsibility:** Orchestrate up to 5 simultaneous Conversation_Agents.

**Response queue:** Each agent's audio response is pushed onto a FIFO queue. A scheduler dequeues and plays responses sequentially, preventing audio overlap. The frontend highlights the currently speaking creature by subscribing to `speaking:<profileId>` events over the WebSocket.

---

## Data Model (Supabase)

### `users` (managed by Supabase Auth)
| column | type |
|---|---|
| id | uuid PK |
| email | text |
| created_at | timestamptz |

### `creature_profiles`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → users.id | |
| species | text | |
| common_name | text | |
| category | text | CreatureCategory enum |
| name | text | generated creature name |
| traits | text[] | |
| backstory | text | |
| speaking_style | text | |
| voice_id | text | ElevenLabs voice ID |
| location | geography(POINT, 4326) | nullable; 5 dp precision |
| created_at | timestamptz | |
| last_seen_at | timestamptz | |

### `session_summaries`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | |
| creature_profile_id | uuid FK | |
| summary | text | |
| duration_seconds | integer | |
| key_topics | text[] | |
| created_at | timestamptz | |

**Retention:** A Supabase scheduled function (pg_cron) deletes `session_summaries` and orphaned `creature_profiles` older than 90 days from `last_seen_at`.

**Indexes:**
- `creature_profiles(user_id, species)` — composite B-tree for species+user lookup
- `creature_profiles(location)` — GIST index for spatial queries

---

## API Routes

| Method | Path | Description |
|---|---|---|
| POST | `/api/identify` | Submit image; returns `IdentificationResult[]` |
| POST | `/api/profile` | Get or create `CreatureProfile` (body: `{ identificationResult, gps? }`) |
| POST | `/api/sing` | Generate song for a profile (body: `{ profileId }`) |
| GET | `/api/ambient` | Stream ambient sound audio for a category (query: `?category=`) |
| WS | `/ws/session` | Bidirectional voice session (query: `?profileId=`) |

All routes require a valid Supabase JWT in the `Authorization: Bearer <token>` header. The server validates the token via `supabase.auth.getUser()`.

---

## Frontend Architecture (Next.js)

### Pages / Routes
```
/                  → Landing / sign-in
/app               → Main camera view (authenticated)
/app/session/[id]  → Active voice session
/app/history       → Past creature encounters
```

### Key Components
```
<CameraCapture />       — camera shutter + file upload, enforces 10 MB / format limits
<CreatureCard />        — displays identified creature name, avatar, archetype badge
<VoiceSession />        — WebSocket audio, speaking indicator, reconnect logic
<GroupSession />        — multi-creature layout with per-creature speaking highlight
<SongPlayer />          — plays song audio inline without interrupting session
<AmbientController />   — mounts/unmounts Ambient_Sound_Engine on session lifecycle
```

### Mobile-First CSS Strategy
- Base styles target 320–480 px portrait; no horizontal scroll at 320 px.
- All interactive targets ≥ 44 × 44 CSS px.
- Body font-size ≥ 16 px (prevents iOS Safari auto-zoom).
- Landscape orientation: CSS `@media (orientation: landscape)` overlay prompts rotation.
- Tailwind CSS with a custom `screens` config: `{ sm: '320px', md: '480px' }`.

---

## External Service Integration

### Google Gemini Vision (free tier)
- Model: `gemini-1.5-flash` (free tier eligible)
- Called via `@google/generative-ai` SDK
- JSON mode enabled; response schema enforced

### ElevenLabs (paid — only paid service)
| Feature | API | Notes |
|---|---|---|
| Voice Design | `POST /v1/voice-generation/generate-voice` | Creates unique voice per creature |
| Conversational AI | WebSocket `wss://api.elevenlabs.io/v1/convai/conversation` | Real-time dialogue |
| TTS v3 | `POST /v1/text-to-speech/{voice_id}` | Song generation |
| Sound Effects | `POST /v1/sound-generation` | Ambient background audio |

### Supabase (free tier)
- Auth: email/password via `supabase-js`
- Database: PostgreSQL with PostGIS extension enabled
- Client: `@supabase/supabase-js` on both server and client

---

## Error Handling Summary

| Error | Service | Behaviour |
|---|---|---|
| No creature detected | Vision_Engine | Return 422 with user-facing message |
| Gemini timeout (>10 s) | Vision_Engine | Return 503 |
| ElevenLabs Voice Design failure | Character_Engine | Fall back to default voice ID, log error |
| GPS unavailable | Location_Service | Skip proximity check, use species+user fallback |
| WebSocket disconnect | Frontend | Retry ×3 with 2 s backoff, then show error |
| Song generation failure | Song_Engine | Conversation_Agent informs user in-character |
| Ambient sound failure | Ambient_Sound_Engine | Session continues silently |
| Free-tier limit reached (non-ElevenLabs) | Any | Return 503, do not incur paid usage |

---

## Security Considerations

- All API routes validate Supabase JWT before processing.
- Image uploads are validated for MIME type and size (≤ 10 MB) server-side before forwarding to Gemini.
- ElevenLabs API key is stored as a Railway environment secret; never exposed to the client.
- Supabase Row Level Security (RLS) policies ensure users can only read/write their own `creature_profiles` and `session_summaries`.
- GPS coordinates are stored only when the user grants location permission; the permission prompt explains why location is used.
