# WhisperWorld 🌿

**Talk to nature's creatures using AI!** Photograph any living thing in nature and hold real-time voice conversations with them. WhisperWorld uses Google Gemini Vision to identify creatures, then ElevenLabs Conversational AI to give each one a unique voice and personality.

## 🎯 Live Demo

- **Frontend**: https://whisperworld.onrender.com
- **Backend**: https://whisperworld-backend.onrender.com

## ✨ Features

- 📸 **Camera Capture**: Take photos of plants and animals
- 🤖 **AI Identification**: Google Gemini Vision identifies creatures
- 🗣️ **Voice Conversations**: Real-time chat using ElevenLabs ConvAI
- 🎵 **Creature Singing**: Ask creatures to sing personalized songs
- 📍 **GPS Memory**: Creatures remember you at specific locations
- 🎨 **Beautiful UI**: Dark nature theme with green accents
- 📱 **Mobile-First**: Optimized for phone screens

## 🏆 ElevenLabs x Kiro Hackathon

This project was built for the **ElevenLabs x Kiro Hackathon** using:

### ElevenLabs APIs:
- **Voice Design API** - Unique creature voices
- **Conversational AI** - Real-time voice chat
- **TTS v3** - Creature singing feature  
- **Sound Effects API** - Ambient nature sounds

### Kiro Features:
- **Spec-driven development** - Complete requirements → design → tasks workflow
- **Steering docs** - Development conventions and best practices
- **Vibe coding** - Built entire full-stack app through conversation

## 🚀 Quick Start

### 🎯 **INSTANT DEMO - NO SIGNUP REQUIRED!**

1. **Visit**: https://whisperworld.onrender.com
2. **Click**: "🚀 Try Demo (No signup needed!)" 
3. **Take a photo** of any plant or animal
4. **Chat with your creature!**

**That's it!** No email, no password, no hassle. Perfect for hackathon judges and quick testing.

---

### 1. Database Setup (Required First!)

Go to your Supabase dashboard and run these SQL migrations in order:

```sql
-- 1. Run supabase/migrations/001_initial_schema.sql
-- 2. Run supabase/migrations/002_rls_policies.sql  
-- 3. Run supabase/migrations/003_retention_job.sql
-- 4. Run supabase/migrations/004_find_nearby_profile_fn.sql
```

### 2. Environment Variables

The app is already configured with API keys. Just set these in your Render dashboard:

**Backend Service** (`whisperworld-backend`):
```
SUPABASE_URL=https://tunktgbkragjuxcfwfmg.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1bmt0Z2JrcmFnanV4Y2Z3Zm1nIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjUwNDA5OSwiZXhwIjoyMDkyMDgwMDk5fQ.NhK1Q-wzPh0Mg4RBVtwJ6JS4qJ_FjzJRApAnxk8K-_Y
ELEVENLABS_API_KEY=sk_e8cbf828f8933c524dc29f4f5bf0195a97c0326852884bb7
GEMINI_API_KEY=AIzaSyD6LhS_YX1xwlTkkS-Jp0jtMQ9hVarLgbU
ALLOWED_ORIGINS=https://whisperworld.onrender.com
```

**Frontend Service** (`whisperworld-frontend`):
```
VITE_SUPABASE_URL=https://tunktgbkragjuxcfwfmg.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1bmt0Z2JrcmFnanV4Y2Z3Zm1nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1MDQwOTksImV4cCI6MjA5MjA4MDA5OX0.jp-mXHi_YKG6V2grozaekWHXq4E01gCQnqoIQ2TDSbs
VITE_API_BASE_URL=https://whisperworld-backend.onrender.com
```

### 3. Test the App!

1. Visit https://whisperworld.onrender.com
2. Click "🚀 Try Demo" for instant access (no signup!)
3. Take a photo of a plant or animal
4. Chat with your creature!

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| Backend | FastAPI (Python 3.11) + Uvicorn |
| Database | Supabase (PostgreSQL + PostGIS + Auth) |
| AI Vision | Google Gemini Vision (free tier) |
| Voice AI | ElevenLabs (Voice Design, ConvAI, TTS v3, Sound Effects) |
| Deployment | Render (both frontend & backend) |

## 📁 Project Structure

```
whisperworld/
├── .kiro/
│   ├── specs/whisper-world/     # Complete spec-driven development
│   └── steering/                # Development conventions
├── frontend/                    # React + TypeScript app
├── backend/                     # FastAPI Python app  
├── supabase/migrations/         # Database schema migrations
└── render.yaml                  # Deployment configuration
```

## 🎨 UI Design

- **Dark Nature Theme**: Beautiful gradients with emerald green accents
- **Glass Effects**: Frosted glass components with subtle borders
- **Mobile-First**: Optimized for portrait phone usage
- **Animations**: Speaking indicators, loading states, button effects
- **Accessibility**: 44px touch targets, proper contrast ratios

## 🔧 Development

### Local Setup

```bash
# Frontend
cd frontend
npm install
npm run dev

# Backend  
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Key Features Implemented

- ✅ **Camera capture** with environment camera
- ✅ **Photo identification** via Gemini Vision API
- ✅ **Creature profiles** with ElevenLabs Voice Design
- ✅ **Real-time voice chat** via ElevenLabs ConvAI WebSocket
- ✅ **Creature singing** with TTS v3
- ✅ **Ambient sounds** during conversations
- ✅ **GPS-based memory** for creature persistence
- ✅ **Group conversations** with multiple creatures
- ✅ **Mobile-optimized UI** with dark theme

## 🏆 Hackathon Submission

This project demonstrates:

- **Deep ElevenLabs Integration**: Uses 4 different ElevenLabs APIs
- **Advanced Kiro Usage**: Spec-driven development, steering docs, vibe coding
- **Creative Concept**: Unique nature + AI conversation experience
- **Production Quality**: Full deployment, error handling, mobile optimization
- **Technical Innovation**: GPS memory, ambient sounds, group conversations

## 📄 License

MIT © 2025 WhisperWorld
