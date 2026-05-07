# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NovelForge is an AI-powered novel generation application for personal creators. Chinese-language UI. Monorepo with separate frontend (React/TypeScript) and backend (Python/FastAPI) directories, orchestrated via Docker Compose.

## Commands

### Full Stack (Docker)
```bash
cp .env.example .env        # Configure DB_PASSWORD, ENCRYPTION_KEY
docker-compose up           # Starts postgres, backend, frontend, nginx
```

### Frontend (from `frontend/`)
```bash
npm run dev         # Vite dev server on port 3000 (proxies /api to :8000)
npm run build       # TypeScript check + production build
npm run lint        # ESLint
npm run format      # Prettier
npm test            # Vitest unit tests
npm run test:e2e    # Playwright e2e tests
```

### Backend (from `backend/`)
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload   # Dev server
pytest                                                       # Run tests
ruff check .                                                 # Lint
ruff format .                                                # Format
alembic upgrade head                                         # Run migrations
alembic revision --autogenerate -m "description"             # New migration
```

## Architecture

### Backend Layer Structure (`backend/app/`)

- **routers/** -- FastAPI route handlers (9 modules: models, projects, outlines, chapters, characters, worldviews, terminology, export, backup)
- **services/** -- Business logic, one service per domain
- **models/** -- SQLAlchemy ORM models (all UUID primary keys)
- **schemas/** -- Pydantic v2 request/response models
- **adapters/** -- AI model integration via Adapter + Factory pattern (`BaseModelAdapter` -> `openai_adapter.py`, created by `adapter_factory.py`)
- **utils/encryption.py** -- Fernet-based API key encryption at rest

### Frontend Structure (`frontend/src/`)

- **App.tsx** -- React Router v6 routes
- **api/** -- Typed Axios modules per domain; chapters API uses raw `fetch()` with `ReadableStream` for SSE
- **stores/** -- Zustand stores: `projectStore`, `modelStore`, `uiStore`
- **components/** -- Reusable UI components
- **pages/** -- Route-level page components

### Key Patterns

- **SSE Streaming**: Chapter generation streams tokens via Server-Sent Events. Backend uses `StreamingResponse(text/event-stream)`, frontend parses `data:` prefixed JSON. Event types: `token`, `done`, `error`, `batch_start`, `batch_next`, `batch_done`.
- **Adapter Pattern**: AI providers abstracted behind `BaseModelAdapter`. Currently implements OpenAI-compatible API via httpx. Adding a new provider means implementing the adapter and registering in the factory.
- **Service Layer**: All business logic lives in services, not routers. Routers handle HTTP concerns only.
- **Version History**: Chapter generation creates `ChapterVersion` records with restore capability.
- **API prefix**: All backend routes are under `/api/`. Nginx reverse-proxies `/api/` to backend:8000 and `/` to frontend:3000.

### Database

PostgreSQL 16 with async driver (asyncpg). 14 tables, all UUID PKs. Key relationships: Project -> Outline -> ChapterOutline -> Chapter -> ChapterVersion. Characters and Worldviews are global entities associated with projects through outlines.

### Environment Variables (`.env`)

- `DB_PASSWORD` -- PostgreSQL password (also used in docker-compose)
- `ENCRYPTION_KEY` -- Fernet key for API key encryption
- `DEBUG` -- Enable debug mode
- `LOG_LEVEL` -- Logging level

## Conventions

- Commit messages follow Conventional Commits: `feat(scope): description`
- Frontend dark theme: background `#1a1a2e`, card `#16213e`, accent `#e94560`
- TailwindCSS with custom utility classes in `globals.css` (`.btn-primary`, `.btn-secondary`, `.card`, `.input`)
- TypeScript strict mode enabled
