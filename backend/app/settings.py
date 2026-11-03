"""Configuration from environment / backend/.env (never committed)."""
from __future__ import annotations

import os
import secrets
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

BASE = Path(__file__).resolve().parents[1]
load_dotenv(BASE / ".env")


@dataclass
class Settings:
    database_url: str = os.getenv("DATABASE_URL", "postgresql://resilion:resilion@localhost:5432/resilion")
    # RESILION 2.0 tables live only in this schema (the database may be shared with RESILION 1 in `public`).
    db_schema: str = os.getenv("DB_SCHEMA", "resilion2")
    # "auto": real NH-27 corridor from PostGIS when loaded (backend/scripts), else the sample seed. "sample": always sample.
    corridor_source: str = os.getenv("CORRIDOR_SOURCE", "auto")
    # Rainfall date for the real corridor: YYYY-MM-DD (IMD 2010-2025, Open-Meteo archive after) or "live" (Open-Meteo).
    scenario_date: str = os.getenv("SCENARIO_DATE", "2022-05-10")
    # Background feeds (SACHET IMD warnings, live rainfall). Off unless FEEDS_ENABLED=true (tests never poll).
    feeds_enabled: bool = os.getenv("FEEDS_ENABLED", "false").lower() == "true"
    sachet_minutes: float = float(os.getenv("SACHET_POLL_MINUTES", "30"))
    # Open-Meteo live rainfall poll; used only while the rainfall date is "live" (SCENARIO_DATE=live or Configuration).
    rain_minutes: float = float(os.getenv("RAIN_POLL_MINUTES", "60"))
    anthropic_api_key: str | None = os.getenv("ANTHROPIC_API_KEY") or None
    ai_model: str = os.getenv("AI_MODEL", "claude-sonnet-5-5")
    # Claude is used whenever ANTHROPIC_API_KEY is set. Without a key, AI_PROVIDER=ollama runs the PHOTO CHECK ONLY on a
    # free local vision model (owner decision 2026-11-03). Alert text is Claude-only; without a key, validated templates.
    ai_provider: str = os.getenv("AI_PROVIDER", "")
    ollama_model: str = os.getenv("OLLAMA_VISION_MODEL") or os.getenv("OLLAMA_MODEL") or "qwen2.5vl:7b"
    # Accepted only as "disabled": local models failed the hi/as/bn alert tests (docs/AI_PROMPT_LOG.md).
    ollama_text_model: str = os.getenv("OLLAMA_TEXT_MODEL", "disabled")
    ollama_url: str = os.getenv("OLLAMA_URL", "http://localhost:11434")
    ollama_timeout_s: float = float(os.getenv("OLLAMA_TIMEOUT_S", "180"))
    secret_key: str = os.getenv("SECRET_KEY") or secrets.token_hex(32)
    cors_origins: list[str] = field(default_factory=lambda: [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()])
    timezone: str = os.getenv("CONTROL_ROOM_TZ", "Asia/Kolkata")
    upload_dir: Path = Path(os.getenv("UPLOAD_DIR", str(BASE / "uploads")))
    max_upload_mb: float = float(os.getenv("MAX_UPLOAD_MB", "4"))
    allow_sample_reset: bool = os.getenv("ALLOW_SAMPLE_RESET", "true").lower() == "true"


settings = Settings()
