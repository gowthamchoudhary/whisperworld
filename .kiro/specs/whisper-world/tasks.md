# Implementation Plan: WhisperWorld

## Overview

Incremental build from project scaffold → data layer → backend services → frontend → deployment config.
Each task wires into the previous one; no orphaned code. The stack is React + Vite (frontend) and FastAPI (backend), deployed to Vercel and Railway respectively.

## Tasks

- [x] 1. Project scaffolding
  - [x] 1.1 Initialise monorepo structure
    - Create root `package.json` (workspaces: `["frontend","backend"]`)
    - Create `frontend/` with `npm create vite@latest` (React + TypeScript template)
    - Create `backend/` with `pyproject.toml` / `requirements.txt` for FastAPI, Uvicorn, python-dotenv, supabase-py, httpx, websockets
    - Add `MIT LICENSE` and `README.md` at repo root
    - Create `.kiro/` directory stubs (`.kiro/specs/whisper-world/` already exists)
    - Create `.env.example` files in both `frontend/` and `backend/` listing all required env vars
    - _Requirements: 11.3, 11.4_

  - [x] 1.2 Configure frontend tooling
    - Add Tailwind CSS with custom `screens: { sm: '320px', md: '480px' }`
    - Add `vite.config.ts` with proxy rule: `/api` and `/ws` → `http://localhost:8000`
    - Add ESLint + Prettier configs
    - _Requirements: 12.1_

  - [x] 1.3 Configure backend skeleton
    - Create `backend/app/main.py` with FastAPI app, CORS middleware (allow Vercel origin + localhost), and health-check route `GET /health`
    - Create `backend/app/routers/` directory with empty `__init__.py`
    - Create `backend/app/services/` directory with empty `__init__.py`
    - _Requirements: 11.4_

- [x] 2. Supabase data layer
  - [x] 2.1 Write database migration SQL
    - Enable PostGIS extension: `CREATE EXTENSION IF NOT EXISTS postgis;`
    - Create `creature_profiles` table with all columns from the data model (including `location geography(POINT,4326)`)
    - Create `session_summaries` table
    - Add composite B-tree index on `creature_profiles(user_id, species)`
    - Add GIST index on `creature_profiles(location)`
    - _Requirements: 9.6, 5.6_

  - [x] 2.2 Write RLS policies
    - Enable RLS on `creature_profiles` and `session_summaries`
    - Policy: users can SELECT/INSERT/UPDATE/DELETE only rows where `user_id = auth.uid()`
    - _Requirements: 8.3_

  - [x] 2.3 Write pg_cron retention job
    - Schedule daily job: delete `session_summaries` and orphaned `creature_profiles` where `last_seen_at < NOW() - INTERVAL '90 days'`
    - _Requirements: 5.6_

  - [x] 2.4 Create Supabase client helper
    - Create `backend/app/db/supabase_client.py` initialising `supabase-py` from env vars `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
    - Create `frontend/src/lib/supabaseClient.ts` initialising `@supabase/supabase-js` from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
    - _Requirements: 8.6_

- [x] 3. Vision Engine
  - [x] 3.1 Implement `visionEngine.py`
    - Create `backend/app/services/vision_engine.py`
    - Implement `identify(image_bytes: bytes) -> list[IdentificationResult]` using `google-generativeai` SDK with `gemini-1.5-flash`
    - Enable JSON mode; enforce response schema with `species`, `commonName`, `habitat`, `confidence`, `category` fields
    - Map raw category string to `CreatureCategory` literal; default to `"default"` for unknown values
    - Raise `NoCreatureError` (→ 422) when list is empty; raise `VisionUnavailableError` (→ 503) on timeout > 10 s
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 3.2 Wire `/api/identify` route
    - Create `backend/app/routers/identify.py` with `POST /api/identify` accepting multipart image upload
    - Validate MIME type (JPEG, PNG, WebP, HEIC) and size ≤ 10 MB server-side; return 422 on violation
    - Validate Supabase JWT via `Authorization: Bearer` header before processing
    - Call `vision_engine.identify()` and return JSON response
    - _Requirements: 1.3, 1.4, 1.5, 2.1, 11.1_

  - [ ]* 3.3 Write unit tests for Vision Engine
    - Mock Gemini SDK responses; test single-subject, multi-subject, empty, and timeout cases
    - Test category normalisation to `CreatureCategory` literals
    - _Requirements: 2.3, 2.4, 2.5, 2.6_

- [x] 4. Location Service
  - [x] 4.1 Implement `locationService.py`
    - Create `backend/app/services/location_service.py`
    - Implement `find_nearby_profile(user_id, species, lat, lng) -> CreatureProfile | None`
    - Execute PostGIS `ST_DWithin` query via supabase-py RPC or raw SQL; 50 m radius
    - Return `None` when GPS is absent (caller passes `None` for lat/lng)
    - _Requirements: 9.2, 9.3, 9.5_

  - [ ]* 4.2 Write unit tests for Location Service
    - Mock Supabase responses; test hit within 50 m, miss beyond 50 m, and null GPS path
    - _Requirements: 9.2, 9.3, 9.5_

- [x] 5. Character Engine
  - [x] 5.1 Implement archetype map and profile generation
    - Create `backend/app/services/character_engine.py`
    - Define `ARCHETYPES` dict mapping each `CreatureCategory` to trait list
    - Implement `get_or_create_profile(user_id, identification, gps?) -> CreatureProfile`
    - Step 1: call `location_service.find_nearby_profile()` (GPS path) or query Supabase by `user_id + species` (fallback)
    - Step 2: if existing profile found, update `last_seen_at` and return
    - Step 3: call Gemini to generate `{ name, traits, backstory, speakingStyle }` seeded with archetype traits
    - Step 4: call ElevenLabs Voice Design API (`POST /v1/voice-generation/generate-voice`) with prompt from `speakingStyle` + traits
    - Step 5: persist new `CreatureProfile` to Supabase; return profile
    - Fall back to default voice ID if Voice Design API fails; log error
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 9.3, 9.4, 13.1–13.9_

  - [x] 5.2 Wire `/api/profile` route
    - Create `backend/app/routers/profile.py` with `POST /api/profile`
    - Accept `{ identificationResult, gps? }` JSON body; validate JWT
    - Call `character_engine.get_or_create_profile()` and return `CreatureProfile` JSON
    - _Requirements: 3.7, 9.1_

  - [ ]* 5.3 Write unit tests for Character Engine
    - Test existing-profile retrieval (GPS path and species fallback)
    - Test new profile generation with archetype seeding
    - Test Voice Design API failure fallback
    - _Requirements: 3.5, 3.6, 13.2–13.8_

- [x] 6. Checkpoint — ensure all backend service unit tests pass
  - Run `pytest backend/` and confirm zero failures before proceeding.

- [x] 7. Conversation Agent
  - [x] 7.1 Implement WebSocket proxy
    - Create `backend/app/services/conversation_agent.py`
    - Implement `build_system_prompt(profile, history_summary?) -> str` using the template from the design
    - Implement `run_session(websocket, profile_id)`:
      - Load `CreatureProfile` + latest `session_summaries` from Supabase
      - Open ElevenLabs ConvAI WebSocket (`wss://api.elevenlabs.io/v1/convai/conversation`) with system prompt and `voiceId`
      - Bidirectionally pipe binary audio frames between client WebSocket and ElevenLabs WebSocket
      - On session close, save transcript summary to `session_summaries`
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 5.1, 5.3_

  - [x] 7.2 Wire `/ws/session` route
    - Create `backend/app/routers/session.py` with FastAPI `WebSocket` endpoint at `/ws/session?profileId=`
    - Validate JWT from query param or first message before upgrading connection
    - Delegate to `conversation_agent.run_session()`
    - _Requirements: 4.2, 8.4_

  - [ ]* 7.3 Write integration tests for Conversation Agent
    - Use `httpx` async test client with WebSocket support
    - Mock ElevenLabs WebSocket; verify system prompt construction and transcript save
    - _Requirements: 4.1, 4.5, 5.3_

- [x] 8. Song Engine
  - [x] 8.1 Implement `songEngine.py`
    - Create `backend/app/services/song_engine.py`
    - Implement `generate_song(profile: CreatureProfile) -> bytes`:
      1. Open short-lived ElevenLabs ConvAI session with creature's system prompt
      2. Send single user turn: `"Compose a short song (4–8 lines) about yourself, your home, and what you love. Respond with only the lyrics."`
      3. Capture agent text response as lyric string
      4. POST lyric string to ElevenLabs TTS v3 (`/v1/text-to-speech/{voiceId}`) with `model_id: "eleven_multilingual_v3"` and `voice_settings.style: 1.0`
      5. Return audio bytes
    - Raise `SongGenerationError` if total time exceeds 10 s
    - _Requirements: 7.1, 7.2, 7.3, 7.5, 7.6_

  - [x] 8.2 Wire `/api/sing` route
    - Create `backend/app/routers/sing.py` with `POST /api/sing` accepting `{ profileId }` JSON body; validate JWT
    - Call `song_engine.generate_song()` and stream audio bytes back with `Content-Type: audio/mpeg`
    - Return 504 with user-facing message on `SongGenerationError`
    - _Requirements: 7.4, 7.5, 7.6_

  - [ ]* 8.3 Write unit tests for Song Engine
    - Mock ConvAI lyric response and TTS v3 response; verify audio bytes returned
    - Test timeout path raises `SongGenerationError`
    - _Requirements: 7.5, 7.6_

- [x] 9. Ambient Sound Engine
  - [x] 9.1 Implement `/api/ambient` backend route
    - Create `backend/app/routers/ambient.py` with `GET /api/ambient?category=`
    - Map `category` to prompt string using `AMBIENT_PROMPTS` dict from design
    - POST to ElevenLabs Sound Effects API (`/v1/sound-generation`); stream audio bytes back
    - Return 200 with audio on success; return 204 (no content) on ElevenLabs failure so frontend can proceed silently
    - _Requirements: 10.1, 10.5, 10.6_

  - [x] 9.2 Implement `ambientSoundEngine.ts` (browser)
    - Create `frontend/src/services/ambientSoundEngine.ts`
    - `start(category)`: fetch `/api/ambient?category=`, decode into `AudioBuffer` via `AudioContext.decodeAudioData()`
    - Create `GainNode` at 0.2 (20% gain); connect source → gain → destination
    - Set `AudioBufferSourceNode.loop = true`; call `.start()`
    - `stop()`: call `AudioBufferSourceNode.stop()`; disconnect nodes
    - Swallow fetch/decode errors silently (non-blocking)
    - _Requirements: 10.2, 10.3, 10.4, 10.5_

  - [ ]* 9.3 Write unit tests for Ambient Sound Engine backend route
    - Mock ElevenLabs Sound Effects API; test success path and failure → 204 path
    - _Requirements: 10.5, 10.6_

- [x] 10. Group Conversation Manager
  - [x] 10.1 Implement `groupConversationManager.py`
    - Create `backend/app/services/group_conversation_manager.py`
    - Implement `GroupSession` class:
      - Accept up to 5 `CreatureProfile` objects; reject additional with error
      - Maintain a FIFO `asyncio.Queue` for audio response chunks
      - On user speech, fan out to all active `ConversationAgent` instances concurrently
      - Dequeue and emit audio sequentially; emit `speaking:<profileId>` event over client WebSocket before each creature's audio
      - If one profile fails to initialise, continue with remaining and send error event to client
    - _Requirements: 6.1, 6.2, 6.3, 6.6, 6.7_

  - [x] 10.2 Wire group session into `/ws/session`
    - Extend `session.py` router: if `profileIds` query param contains multiple IDs (comma-separated), delegate to `GroupSession` instead of single `ConversationAgent`
    - _Requirements: 6.1, 6.2_

  - [ ]* 10.3 Write unit tests for Group Conversation Manager
    - Test FIFO ordering of responses from 3 concurrent agents
    - Test max-5 enforcement
    - Test partial failure: one agent fails, others continue
    - _Requirements: 6.3, 6.6, 6.7_

- [x] 11. Checkpoint — ensure all backend tests pass
  - Run `pytest backend/` and confirm zero failures before proceeding.

- [x] 12. Frontend — auth flows
  - [x] 12.1 Implement sign-up and sign-in pages
    - Create `frontend/src/pages/SignIn.tsx` and `SignUp.tsx`
    - Use `supabase.auth.signInWithPassword()` and `supabase.auth.signUp()`
    - On success, redirect to `/app`; on failure, display inline error message
    - All inputs ≥ 44 × 44 px touch targets; body font ≥ 16 px
    - _Requirements: 8.1, 8.2, 12.2, 12.5_

  - [x] 12.2 Implement auth guard and sign-out
    - Create `frontend/src/components/AuthGuard.tsx` — redirect unauthenticated users to `/`
    - Add sign-out button in app header: call `supabase.auth.signOut()`, terminate active session, clear local state
    - _Requirements: 8.4, 8.5_

- [x] 13. Frontend — camera capture and identification
  - [x] 13.1 Implement `<CameraCapture />` component
    - Create `frontend/src/components/CameraCapture.tsx`
    - Render camera shutter button (uses `getUserMedia`) and file-upload input
    - Validate MIME type (JPEG, PNG, WebP, HEIC) and size ≤ 10 MB client-side; show inline error on violation
    - On valid selection, show loading spinner and POST multipart form to `/api/identify` with GPS coords in body
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 9.1_

  - [x] 13.2 Implement `<CreatureCard />` component
    - Create `frontend/src/components/CreatureCard.tsx`
    - Display creature name, common name, archetype badge (colour-coded by category), and confidence score
    - On mount, POST to `/api/profile` with identification result + GPS; show loading state
    - _Requirements: 2.2, 13.1_

- [x] 14. Frontend — voice session
  - [x] 14.1 Implement `<VoiceSession />` component
    - Create `frontend/src/components/VoiceSession.tsx`
    - Open WebSocket to `/ws/session?profileId=` on mount
    - Stream microphone audio via `MediaRecorder`; pipe binary frames to WebSocket
    - Receive audio frames from WebSocket; play via `AudioContext`
    - Display speaking indicator: "Creature speaking" vs "You speaking" based on frame type
    - Implement reconnect logic: retry ×3 with 2 s exponential backoff; show error after 3 failures
    - Mount `<AmbientController />` on session start; unmount on session end
    - _Requirements: 4.2, 4.3, 4.4, 4.6_

  - [x] 14.2 Implement `<AmbientController />` component
    - Create `frontend/src/components/AmbientController.tsx`
    - On mount, call `ambientSoundEngine.start(category)`; on unmount, call `ambientSoundEngine.stop()`
    - _Requirements: 10.1, 10.3, 10.4_

  - [x] 14.3 Implement `<SongPlayer />` component
    - Create `frontend/src/components/SongPlayer.tsx`
    - Render "Ask to sing" button; on click, POST to `/api/sing` with `profileId`
    - Decode returned audio bytes and play via `AudioContext` without interrupting session WebSocket
    - Show loading state during fetch; show error message on 504 response
    - _Requirements: 7.4, 7.5_

- [x] 15. Frontend — group session
  - [x] 15.1 Implement `<GroupSession />` component
    - Create `frontend/src/components/GroupSession.tsx`
    - Accept array of `CreatureProfile` objects (max 5)
    - Open WebSocket to `/ws/session?profileIds=<id1,id2,...>`
    - Render avatar + name card for each creature; highlight currently speaking creature on `speaking:<profileId>` event
    - Reuse `<AmbientController />` and `<SongPlayer />` per creature
    - _Requirements: 6.4, 6.5, 6.6_

- [x] 16. Frontend — main app page and routing
  - [x] 16.1 Implement app routing and pages
    - Create `frontend/src/pages/Landing.tsx` (sign-in/sign-up entry)
    - Create `frontend/src/pages/App.tsx` (camera view, wrapped in `<AuthGuard />`) — renders `<CameraCapture />`, then `<CreatureCard />` list, then routes to session
    - Create `frontend/src/pages/Session.tsx` — renders `<VoiceSession />` or `<GroupSession />` based on creature count
    - Create `frontend/src/pages/History.tsx` — lists past `session_summaries` fetched from Supabase
    - Wire React Router routes: `/` → Landing, `/app` → App, `/app/session/:id` → Session, `/app/history` → History
    - _Requirements: 8.4, 12.1, 12.3, 12.4_

  - [x] 16.2 Apply mobile-first layout and orientation guard
    - Wrap app in single-column flex layout; max-width 480 px centred
    - Add `@media (orientation: landscape)` overlay component prompting rotation
    - Ensure no horizontal scroll at 320 px viewport width
    - _Requirements: 12.1, 12.3, 12.4_

- [x] 17. Checkpoint — manual smoke test of full flow
  - Ensure all automated tests pass (`pytest backend/`, `npm test -- --run` in frontend).
  - Verify identify → profile → session → song flow works end-to-end in local dev.

- [x] 18. Deployment configuration
  - [x] 18.1 Configure Vercel deployment
    - Add `vercel.json` at repo root: `{ "buildCommand": "cd frontend && npm run build", "outputDirectory": "frontend/dist", "rewrites": [{ "source": "/api/(.*)", "destination": "https://<RAILWAY_URL>/api/$1" }, { "source": "/ws/(.*)", "destination": "https://<RAILWAY_URL>/ws/$1" }] }`
    - Document all required Vercel environment variables in `README.md`
    - _Requirements: 11.3_

  - [x] 18.2 Configure Railway deployment
    - Add `Dockerfile` in `backend/`: Python 3.12 slim, install deps, `CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]`
    - Add `railway.toml` with `[build] builder = "dockerfile"` and `[deploy] healthcheckPath = "/health"`
    - Document all required Railway environment secrets in `README.md` (`ELEVENLABS_API_KEY`, `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)
    - _Requirements: 11.4_

- [x] 19. Final checkpoint — ensure all tests pass
  - Run `pytest backend/` and `npm test -- --run` in `frontend/`; confirm zero failures.
  - Ensure all tasks pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation before moving to the next layer
- The Song Engine uses ConvAI for in-character lyric generation before passing to TTS v3 (per design update)
- Frontend stack is React + Vite (not Next.js) and backend is FastAPI (not Express/Node.js)
