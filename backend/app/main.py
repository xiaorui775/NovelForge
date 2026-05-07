import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.database import engine, Base
from app.routers import models, projects, outlines, chapters, export, characters, worldviews, terminology, backup, prompt_templates, cost_budget, analytics, foreshadowing, chat, cover_images, search, story_templates, scenes, notes, character_arcs, story_bible, writing_goals
from app.services.seed_service import seed_prompt_templates, seed_sample_data
from app.services.story_template_service import seed_templates
from app.database import async_session


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables (dev convenience, use alembic in production)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # Seed default prompt templates, sample data, and story templates
    await seed_prompt_templates()
    await seed_sample_data()
    async with async_session() as session:
        await seed_templates(session)
    yield
    # Shutdown
    await engine.dispose()


app = FastAPI(
    title="NovelForge",
    description="AI 小说生成应用",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

logger = logging.getLogger(__name__)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch-all handler: log full traceback, return safe JSON error."""
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    if settings.DEBUG:
        return JSONResponse(
            status_code=500,
            content={"detail": f"服务器内部错误: {type(exc).__name__}: {str(exc)}"},
        )
    return JSONResponse(
        status_code=500,
        content={"detail": "服务器内部错误，请稍后重试"},
    )


app.include_router(models.router, prefix="/api")
app.include_router(projects.router, prefix="/api")
app.include_router(outlines.router, prefix="/api")
app.include_router(chapters.router, prefix="/api")
app.include_router(export.router, prefix="/api")
app.include_router(characters.router, prefix="/api")
app.include_router(worldviews.router, prefix="/api")
app.include_router(terminology.router, prefix="/api")
app.include_router(backup.router, prefix="/api")
app.include_router(prompt_templates.router, prefix="/api")
app.include_router(cost_budget.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
app.include_router(foreshadowing.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(cover_images.router, prefix="/api")
app.include_router(search.router, prefix="/api")
app.include_router(story_templates.router, prefix="/api")
app.include_router(scenes.router, prefix="/api")
app.include_router(notes.router, prefix="/api")
app.include_router(character_arcs.router, prefix="/api")
app.include_router(story_bible.router, prefix="/api")
app.include_router(writing_goals.router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok"}
