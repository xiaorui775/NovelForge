import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://novelforge:novelforge@localhost:5432/novelforge"
    ENCRYPTION_KEY: str = ""
    SECRET_KEY: str = "novelforge-secret-key-change-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    # Optional password protection for personal-use deployments.
    # When set, all API endpoints (except health/auth) require a token.
    ADMIN_PASSWORD: str | None = None
    # Comma-separated allowed CORS origins. Empty = same-origin only.
    # Example: "http://localhost:5173,http://localhost:3000"
    CORS_ORIGINS: str = ""
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    # Cost control (Phase 3.1)
    # Hard limit per single generation (in tokens). 0 = no limit.
    MAX_TOKENS_PER_GENERATION: int = 0
    # Soft limit per single generation (in USD). 0 = no limit. Triggers confirmation.
    MAX_COST_PER_GENERATION: float = 0.0
    # If estimated cost > this, auto downgrade to a cheaper model if available.
    AUTO_DOWNGRADE_THRESHOLD: float = 0.0

    class Config:
        env_file = ".env"
        extra = "ignore"

    def allowed_origins(self) -> list[str]:
        """Parse CORS_ORIGINS into a clean list. Wildcard "*" is disallowed."""
        origins = [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]
        return [o for o in origins if o != "*"]


settings = Settings()
