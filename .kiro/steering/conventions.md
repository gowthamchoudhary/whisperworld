---
inclusion: always
---

# WhisperWorld Development Conventions

## Async / Await
- Always use `async/await` for asynchronous code — never use callbacks or raw `.then()` chains.
- Frontend (TypeScript): all async functions must be declared with `async` and awaited at call sites.
- Backend (Python): use `async def` for all FastAPI route handlers and service functions; use `await` for all I/O operations.

## ElevenLabs API Calls
- Every call to any ElevenLabs API (Voice Design, Conversational AI, TTS v3, Sound Effects) must be wrapped in a `try/catch` (TS) or `try/except` (Python) block.
- Implement retry logic with a maximum of 3 attempts and exponential backoff (1 s, 2 s, 4 s) before raising/throwing the final error.
- Log each failed attempt with the attempt number and error message before retrying.

## Environment Variables
- All secrets and configuration values (API keys, URLs, credentials) must be stored in `.env` files.
- Never hardcode any environment variable value in source code.
- Frontend env vars must be prefixed with `VITE_` and accessed via `import.meta.env`.
- Backend env vars must be loaded via `python-dotenv` at application startup.
- Every project directory must have a `.env.example` file listing all required variables with placeholder values.

## Mobile-First CSS
- All CSS and Tailwind styles must be written mobile-first: base styles target a minimum viewport width of 320 px.
- Use `min-width` media queries to progressively enhance for larger screens — never use `max-width` as the primary breakpoint strategy.
- All interactive elements (buttons, inputs, links) must have a minimum touch target size of 44 × 44 CSS px.
- Body and input font sizes must be at least 16 px to prevent automatic zoom on iOS Safari.
- No view may require horizontal scrolling at 320 px viewport width.

## Backend Error Handling
- Every FastAPI route handler must have a `try/except` block covering the full handler body.
- On expected errors (validation, not found, service unavailable), return the appropriate HTTP status code with a JSON body: `{ "detail": "<human-readable message>" }`.
- On unexpected errors, return HTTP 500 and log the full traceback server-side.
- Never let an unhandled exception propagate to the ASGI layer.

## TypeScript (Frontend)
- All frontend source files must use TypeScript (`.ts` / `.tsx`). No plain `.js` files in `src/`.
- All function parameters and return types must be explicitly typed.
- Use `interface` for object shapes and `type` for unions/aliases.
- Enable `strict` mode in `tsconfig.json`.

## Python Type Hints (Backend)
- All Python functions must include type hints for every parameter and the return type.
- Use `from __future__ import annotations` at the top of every module for forward-reference support.
- Use `pydantic` `BaseModel` for all request/response schemas in FastAPI routes.

## Paid API Policy
- The only paid external service permitted is ElevenLabs.
- Never call any other paid API tier. Use free tiers for Google Gemini Vision, Supabase, Vercel, and Railway.
- If a free-tier rate limit is reached for any non-ElevenLabs service, return HTTP 503 to the client — do not fall back to a paid tier.
