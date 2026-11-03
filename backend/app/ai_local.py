"""Optional free local model (Ollama) for the PHOTO CHECK ONLY, used when no ANTHROPIC_API_KEY is set and
AI_PROVIDER=ollama (owner decisions 2026-11 and 2026-11-03; changes PRD section 9 for that case).

The alert writer is NOT run on a local model: in the owner's tests qwen2.5vl:7b wrote mostly Bengali for Assamese,
dropped "HOLD" and changed place names and times; gemma3:4b only echoed the tokens and put a Russian word in Hindi
(docs/AI_PROMPT_LOG.md). Without a Claude key, alerts use the validated templates. OLLAMA_TEXT_MODEL is accepted
only as "disabled".

Same photo prompt, label set, JSON schema and fail-safe behaviour as app/ai.py (Claude): any error, timeout or invalid
output -> AIUnavailable -> manual review (FR-26). The model name is stored as "local:<model>" and the UI shows
"Local model", never "Claude". Ollama API: POST {OLLAMA_URL}/api/chat with `format` = JSON schema.
"""
from __future__ import annotations

import base64
import json
import logging

import httpx

from .ai import HAZARD_CLASSES, PHOTO_SCHEMA, PHOTO_SYSTEM, AIUnavailable, Image

log = logging.getLogger("resilion.ai.local")


class OllamaAI:
    def __init__(self, model: str = "qwen2.5vl:7b", url: str = "http://localhost:11434", timeout_s: float = 180.0):
        self.base_model = model
        self.model = f"local:{model}"
        self.url = url.rstrip("/")
        self.timeout = timeout_s
        self.enabled = True
        self.photo_enabled = True
        self.writes_alerts = False  # alert text: Claude or templates only

    def _chat(self, *, system: str, user: str, schema: dict, images: list[str] | None = None) -> dict:
        msg = {"role": "user", "content": user}
        if images:
            msg["images"] = images
        body = {"model": self.base_model, "stream": False, "format": schema, "options": {"temperature": 0},
                "messages": [{"role": "system", "content": system}, msg]}
        try:
            r = httpx.post(f"{self.url}/api/chat", json=body, timeout=self.timeout)
        except httpx.TimeoutException as e:
            raise AIUnavailable("Local model timed out") from e
        except httpx.HTTPError as e:
            raise AIUnavailable("Local model unreachable") from e
        if r.status_code != 200:
            log.error("Ollama error %s: %s", r.status_code, r.text[:200])
            raise AIUnavailable(f"Local model error {r.status_code}")
        try:
            return json.loads(r.json()["message"]["content"])
        except (KeyError, ValueError, TypeError) as e:
            raise AIUnavailable("Local model returned invalid JSON") from e

    def _image_b64(self, image: Image) -> str:
        if image.data_b64:
            return image.data_b64
        if image.url:
            try:
                r = httpx.get(image.url, timeout=30, follow_redirects=True)
                r.raise_for_status()
                return base64.b64encode(r.content).decode()
            except httpx.HTTPError as e:
                raise AIUnavailable("Photo could not be fetched for the local model") from e
        raise AIUnavailable("No photo")

    def classify_photo(self, image: Image, *, note: str, location_text: str, captured_at: str) -> dict:
        """FR-21, same contract as ClaudeAI.classify_photo. Report text is passed as delimited data only (BR-10)."""
        meta = json.dumps({"location": location_text, "captured_at": captured_at, "note": note}, ensure_ascii=False)
        out = self._chat(system=PHOTO_SYSTEM, user=f"<report_metadata>\n{meta}\n</report_metadata>\nClassify the photo.",
                         schema=PHOTO_SCHEMA, images=[self._image_b64(image)])
        cls = out.get("hazard_class")
        if cls not in HAZARD_CLASSES:
            raise AIUnavailable("Local model returned an unknown class")
        try:
            share = max(0, min(100, int(out.get("blocked_share", 0))))
            conf = max(0.0, min(1.0, float(out.get("confidence", 0))))
        except (TypeError, ValueError) as e:
            raise AIUnavailable("Local model returned invalid numbers") from e
        if cls in ("clear", "not_relevant"):
            share = 0
        return {"hazardClass": cls, "blockedShare": share, "confidence": round(conf, 2), "model": self.model, "simulated": False}

    def write_alerts(self, fields: dict, templates: dict[str, str]) -> tuple[dict, str]:
        """Never used for alert text (owner decision 2026-11-03): the caller keeps the validated templates."""
        raise AIUnavailable("Local model is not used for alert text; templates kept")
