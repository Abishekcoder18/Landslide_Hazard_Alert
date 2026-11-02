"""RESILION 2.0 backend — FastAPI implementation of docs/API_CONTRACT.md.
Run: uvicorn app.main:app --reload --port 8000  (from backend/)"""
from __future__ import annotations

import base64
import binascii
import logging
import re
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any, Callable, Literal, Optional

from fastapi import BackgroundTasks, Depends, FastAPI, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import auth
from .ai import AIUnavailable, ClaudeAI, Image
from .domain.alerts import render_template
from .seed import SAMPLE_PHOTOS
from .service import ApiError, Workflow, new_state
from .settings import Settings, settings as default_settings
from .store import Store, now_utc

log = logging.getLogger("resilion")

ALLOWED_MEDIA = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}
DATA_URL_RE = re.compile(r"^data:(image/[a-z]+);base64,(.+)$", re.DOTALL)


# ---------- request bodies ----------
class LoginBody(BaseModel):
    userId: str = Field(min_length=1, max_length=80)
    role: Literal["officer", "second_approver", "road_engineer", "patrol", "public_reporter", "admin"]


class PhotoBody(BaseModel):
    kind: Literal["sample", "upload"]
    sampleId: Optional[str] = None
    dataUrl: Optional[str] = None
    fileName: Optional[str] = None


class ReportBody(BaseModel):
    segmentId: str
    lat: Optional[float] = Field(default=None, ge=-90, le=90)
    lon: Optional[float] = Field(default=None, ge=-180, le=180)
    locationText: str = Field(min_length=1, max_length=200)
    note: str = Field(default="", max_length=500)
    photo: PhotoBody
    capturedAt: Optional[str] = None
    reporterName: Optional[str] = Field(default=None, max_length=80)


class ConfirmBody(BaseModel):
    newState: Literal["BLOCKED", "RESTRICTED_HEAVY", "RESTRICTED_ONE_WAY"]


class DecisionBody(BaseModel):
    approve: bool
    closureType: Optional[Literal["FULL", "HEAVY_ONLY", "ONE_WAY"]] = None


class ReopeningBody(BaseModel):
    to: Literal["one_way", "full"]


class TextBody(BaseModel):
    text: str = Field(max_length=1000)


def create_app(cfg: Settings = default_settings, store: Optional[Store] = None, ai: Optional[ClaudeAI] = None,
               clock: Callable[[], datetime] = now_utc) -> FastAPI:
    store = store or Store(cfg.database_url, cfg.db_schema)
    ai = ai or ClaudeAI(cfg.anthropic_api_key, cfg.ai_model)
    cfg.upload_dir.mkdir(parents=True, exist_ok=True)

    def seed_if_needed() -> None:
        store.init_schema()
        with store.connect() as conn:
            conn.execute("SELECT pg_advisory_xact_lock(%s)", (store.lock_key,))
            if not store.is_seeded(conn):
                fresh = new_state(clock())
                Workflow(fresh, clock, cfg.timezone).seed_initial()
                store.save(conn, fresh)
            conn.commit()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        seed_if_needed()
        log.info("AI photo check / alert writer: %s (%s)", "enabled" if ai.enabled else "disabled — no ANTHROPIC_API_KEY", ai.model)
        yield

    app = FastAPI(title="RESILION 2.0 API", version="1.0", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=cfg.cors_origins, allow_methods=["*"], allow_headers=["*"])
    app.mount("/uploads", StaticFiles(directory=str(cfg.upload_dir)), name="uploads")

    @app.exception_handler(ApiError)
    async def api_error(_: Request, exc: ApiError):
        return JSONResponse({"detail": str(exc)}, status_code=exc.status)

    def session_dep(authorization: str = Header(default="")) -> dict:
        token = authorization.removeprefix("Bearer ").strip()
        sess = auth.verify(token, cfg.secret_key) if token else None
        if not sess:
            raise ApiError("Not signed in", 401)
        return sess

    def run(fn: Callable[[Workflow], Any]) -> tuple[Any, list[str]]:
        with store.unit_of_work() as (conn, state):
            wf = Workflow(state, clock, cfg.timezone, store.corridor_distance(conn))
            result = fn(wf)
            return result, list(wf.new_alert_ids)

    def ai_available() -> bool:
        with store.connect() as conn:
            row = conn.execute("SELECT data FROM kv WHERE key = 'config'").fetchone()
        return ai.enabled and bool(row and row[0].get("aiServiceOnline", True))

    def write_alerts_task(alert_ids: list[str]) -> None:
        """FR-28 language-model pass, outside the request transaction. Validation and blocking happen in the service."""
        for alert_id in alert_ids:
            with store.connect() as conn:
                snap_fields = conn.execute("SELECT data->'fields' FROM alerts WHERE id = %s", (alert_id,)).fetchone()
            if not snap_fields:
                continue
            fields = snap_fields[0]
            templates = {lang: render_template(fields, lang) for lang in ("en", "hi", "as", "bn")}
            try:
                generated, model = ai.write_alerts(fields, templates)
            except AIUnavailable as e:
                log.warning("Alert writer unavailable for %s: %s — templates kept", alert_id, e)
                continue
            run(lambda wf: wf.apply_generated_texts(alert_id, generated, model))

    def schedule_alerts(bg: BackgroundTasks, ids: list[str]) -> None:
        if ids and ai_available():
            bg.add_task(write_alerts_task, ids)

    # ---------- endpoints ----------
    @app.get("/api/health")
    def health():
        with store.connect() as conn:
            postgis = conn.execute("SELECT postgis_version()").fetchone()[0]
        return {"ok": True, "postgis": postgis, "ai": {"enabled": ai.enabled, "model": ai.model}}

    @app.post("/api/auth/login")
    def login(body: LoginBody):
        sess = auth.issue(body.userId.strip(), body.role, cfg.secret_key)
        run(lambda wf: wf.audit(wf.actor(sess), body.role, "Signed in", body.role))
        return sess

    @app.get("/api/snapshot")
    def snapshot(sess: dict = Depends(session_dep)):
        snap, _ = run(lambda wf: wf.snapshot())
        return snap

    @app.post("/api/reports")
    def submit_report(body: ReportBody, request: Request, sess: dict = Depends(session_dep)):
        created_at = clock()
        photo_url, image = "", None
        if body.photo.kind == "sample":
            sample = SAMPLE_PHOTOS.get(body.photo.sampleId or "")
            if not sample:
                raise ApiError("Unknown sample photo")
            photo_url, image = sample["url"], Image(url=sample["url"])
        else:
            m = DATA_URL_RE.match(body.photo.dataUrl or "")
            if not m or m.group(1) not in ALLOWED_MEDIA:
                raise ApiError("Photo must be a JPEG, PNG, WebP or GIF image")
            try:
                raw = base64.b64decode(m.group(2), validate=True)
            except binascii.Error as e:
                raise ApiError("Invalid photo encoding") from e
            if len(raw) > cfg.max_upload_mb * 1024 * 1024:
                raise ApiError(f"Photo larger than {cfg.max_upload_mb:g} MB")
            name = f"{uuid.uuid4().hex}.{ALLOWED_MEDIA[m.group(1)]}"
            (cfg.upload_dir / name).write_bytes(raw)
            photo_url = f"{str(request.base_url).rstrip('/')}/uploads/{name}"
            image = Image(media_type=m.group(1), data_b64=m.group(2))

        ai_result, ai_error = None, None
        if not ai_available():
            ai_error = "AI service unavailable"
        else:
            try:
                ai_result = ai.classify_photo(image, note=body.note, location_text=body.locationText, captured_at=body.capturedAt or created_at.isoformat())
            except AIUnavailable as e:
                ai_error = str(e)  # FR-26: report goes to manual review
        queued_at = clock()
        report, _ = run(lambda wf: wf.submit_report(sess, body.model_dump(exclude={"photo"}), photo_url, ai_result, ai_error, created_at, queued_at))
        return report

    @app.post("/api/reports/{rid}/confirm", status_code=204)
    def confirm(rid: str, body: ConfirmBody, sess: dict = Depends(session_dep)):
        run(lambda wf: wf.confirm_report(sess, rid, body.newState))

    @app.post("/api/reports/{rid}/reject", status_code=204)
    def reject(rid: str, sess: dict = Depends(session_dep)):
        run(lambda wf: wf.reject_report(sess, rid))

    @app.post("/api/zones/{zid}/clear-passage", status_code=204)
    def clear_passage(zid: str, sess: dict = Depends(session_dep)):
        run(lambda wf: wf.clear_passage(sess, zid))

    @app.post("/api/segments/{sid}/alerts", status_code=204)
    def draft_alert(sid: str, bg: BackgroundTasks, sess: dict = Depends(session_dep)):
        _, ids = run(lambda wf: wf.draft_alert(sess, sid))
        schedule_alerts(bg, ids)

    @app.post("/api/approvals/{aid}/decision", status_code=204)
    def decide(aid: str, body: DecisionBody, bg: BackgroundTasks, sess: dict = Depends(session_dep)):
        _, ids = run(lambda wf: wf.decide_approval(sess, aid, body.approve, body.closureType))
        schedule_alerts(bg, ids)

    @app.patch("/api/incidents/{iid}", status_code=204)
    def update_incident(iid: str, patch: dict, sess: dict = Depends(session_dep)):
        allowed = {"state", "reopeningEstimate", "crew", "equipment"}
        run(lambda wf: wf.update_incident(sess, iid, {k: v for k, v in patch.items() if k in allowed}))

    @app.post("/api/incidents/{iid}/reopening", status_code=204)
    def reopening(iid: str, body: ReopeningBody, sess: dict = Depends(session_dep)):
        run(lambda wf: wf.request_reopening(sess, iid, body.to))

    @app.put("/api/alerts/{alid}/texts/{lang}", status_code=204)
    def edit_text(alid: str, lang: Literal["en", "hi", "as", "bn"], body: TextBody, sess: dict = Depends(session_dep)):
        run(lambda wf: wf.edit_alert_text(sess, alid, lang, body.text))

    @app.patch("/api/config", status_code=204)
    def update_config(patch: dict, sess: dict = Depends(session_dep)):
        run(lambda wf: wf.update_config(sess, patch))

    @app.patch("/api/zones/{zid}", status_code=204)
    def update_zone(zid: str, patch: dict, sess: dict = Depends(session_dep)):
        run(lambda wf: wf.update_zone(sess, zid, patch))

    @app.patch("/api/segments/{sid}/inputs", status_code=204)
    def update_inputs(sid: str, patch: dict, sess: dict = Depends(session_dep)):
        run(lambda wf: wf.update_segment_inputs(sess, sid, patch))

    @app.post("/api/admin/reset-sample-data", status_code=204)
    def reset(sess: dict = Depends(session_dep)):
        if not cfg.allow_sample_reset:
            raise ApiError("Sample reset disabled", 403)

        def do(wf: Workflow):
            wf.guard(sess, "configure")

        run(do)
        with store.connect() as conn:
            store.wipe(conn)
            conn.commit()
        seed_if_needed()

    return app


app = create_app()
