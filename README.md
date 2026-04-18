# WhisperWorld

Photograph living things in nature and hold real-time voice conversations with them. WhisperWorld uses Google Gemini Vision to identify creatures, then ElevenLabs Conversational AI to give each one a unique voice and personality.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite, deployed to Vercel |
| Backend | FastAPI (Python 3.12) + Uvicorn, deployed to Railway |
| Database / Auth | Supabase (PostgreSQL + PostGIS + Supabase Auth) |
| AI Vision | Google Gemini Vision (`gemini-1.5-flash`, free tier) |
| Voice / AI | ElevenLabs (Voice Design, Conversational AI, TTS v3, Sound Effects) |

## Project Structure

```
whisperworld/
├── frontend/          # React + Vite app
├── backend/           # FastAPI app
├── package.json       # Root workspace (frontend only — backend is Python)
├── LICENSE
└── README.md
```

## Setup

### Prerequisites

- Node.js 18+
- Python 3.12+
- A Supabase project with PostGIS enabled
- ElevenLabs API key
- Google Gemini API key

### Frontend

```bash
cd frontend
cp .env.example .env
# Fill in your values in .env
npm install
npm run dev
```

### Backend

```bash
cd backend
cp .env.example .env
# Fill in your values in .env
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Environment Variables

### Frontend (`frontend/.env`)

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon/public key |
| `VITE_API_BASE_URL` | Backend API base URL (default: `http://localhost:8000`) |

### Backend (`backend/.env`)

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (keep secret) |
| `GEMINI_API_KEY` | Google Gemini API key |
| `ELEVENLABS_API_KEY` | ElevenLabs API key |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins |

## Deployment

### Vercel (Frontend)

The frontend is configured to deploy from the `frontend/` directory using the `vercel.json` configuration at the repository root.

#### Required Environment Variables

Set the following environment variables in your Vercel project settings:

| Variable | Description | Example |
|---|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL | `https://xxxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon/public key | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `VITE_BACKEND_URL` | Railway backend URL (without trailing slash) | `https://your-app.railway.app` |

#### Deployment Configuration

The `vercel.json` file at the repository root configures:
- Build command: `cd frontend && npm install && npm run build`
- Output directory: `frontend/dist`
- API proxy: `/api/*` routes are proxied to the Railway backend
- WebSocket proxy: `/ws/*` routes are proxied to the Railway backend

After deploying to Railway, update the `destination` URLs in `vercel.json` to point to your actual Railway backend URL.

### Railway (Backend)

The backend is deployed to Railway using Docker. Railway will automatically build the Docker image from the `backend/Dockerfile` and deploy it according to the `railway.toml` configuration at the repository root.

#### Required Environment Variables

Set the following environment secrets in your Railway service settings:

| Variable | Description | Example |
|---|---|---|
| `ELEVENLABS_API_KEY` | ElevenLabs API key for voice and audio services | `sk_...` |
| `GEMINI_API_KEY` | Google Gemini API key for vision identification | `AIza...` |
| `SUPABASE_URL` | Your Supabase project URL | `https://xxxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (keep secret) | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins | `https://your-app.vercel.app` |

#### Deployment Configuration

The `railway.toml` file at the repository root configures:
- Docker builder using `backend/Dockerfile`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port 8000`
- Health check endpoint: `/health`
- Restart policy: on failure with max 10 retries

After deploying to Railway, copy your Railway backend URL and update:
1. The `VITE_BACKEND_URL` environment variable in your Vercel project
2. The `destination` URLs in `vercel.json` to point to your Railway backend

## License

MIT © 2025 WhisperWorld
