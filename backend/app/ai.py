"""Claude integration — the only two AI uses in RESILION 2.0 (PRD section 9):
  1. Photo check (FR-21): class, share of road blocked, confidence. Advisory only; never changes state (BR-07).
  2. Alert writer (FR-28): fills/translates approved templates into en/hi/as/bn. Output is validated (BR-09) by the caller.
Both fail safe: any error, timeout or refusal -> AIUnavailable -> manual review / plain template.
Model: Claude Sonnet 5.5 (named in the PRD). The API key is read from the environment only."""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Optional

import anthropic

log = logging.getLogger("resilion.ai")

HAZARD_CLASSES = ["debris", "crack", "fallen_tree", "water", "clear", "not_relevant"]

# Server-side refusal fallback (Claude API): if a safety classifier declines, the API re-runs the request on a
# fallback model inside the same call. Routed by refusal category, so no model list is maintained here.
FALLBACK_KW = {"betas": ["server-side-fallback-2026-07-01"], "fallbacks": "default"}

PHOTO_SYSTEM = """You check field photos for a hill-road landslide control room (NH-27, Dima Hasao, Assam).
Classify the road condition shown in the photo into exactly one class:
- debris: soil, mud, rocks or boulders on the carriageway
- crack: cracks or subsidence in the road surface or retaining structure
- fallen_tree: a tree or large vegetation lying on the road
- water: flowing or standing water over the road
- clear: the road is visible and passable with no hazard
- not_relevant: the photo does not show a road condition
Estimate blocked_share: the percentage (0-100) of the carriageway width that is blocked. Use 0 for clear or not_relevant.
confidence: your confidence in the class, from 0 to 1.
Judge only what the photo shows. You receive the photo only, never the reporter's text. Your answer is advisory; an
officer makes every decision."""

PHOTO_SCHEMA = {
    "type": "object",
    "properties": {
        "hazard_class": {"type": "string", "enum": HAZARD_CLASSES},
        "blocked_share": {"type": "integer"},
        "confidence": {"type": "number"},
    },
    "required": ["hazard_class", "blocked_share", "confidence"],
    "additionalProperties": False,
}

ALERT_SYSTEM = """You write short public safety alerts (SMS length) for a hill-road landslide control room in Assam, India.
You receive the approved English template and a reference template for each language. Write each alert as clear,
natural text for local road users in English (en), Hindi (hi, Devanagari), Assamese (as) and Bengali (bn).
Hard rules — an automatic validator rejects any alert that breaks them:
- Keep the segment ID (for example S-07) and every place name exactly as written, in Roman script.
- Keep the clock time exactly as written (for example 4:00 PM). Add no other times.
- Keep the Latin keywords that appear in the reference text (CLOSED, REOPENED, HOLD, DIVERT, GO) exactly once per use.
- Keep the direction words exactly as they appear in each language's reference text.
- Keep the "no safe diversion" sentence exactly as in each reference text when present.
- Add no new facts, places, routes, numbers or advice. Never tell anyone to hurry or go now."""

ALERT_SCHEMA = {
    "type": "object",
    "properties": {lang: {"type": "string"} for lang in ("en", "hi", "as", "bn")},
    "required": ["en", "hi", "as", "bn"],
    "additionalProperties": False,
}


class AIUnavailable(Exception):
    """Raised for any reason the model result cannot be used; callers fall back (FR-26, BR-09)."""


@dataclass
class Image:
    media_type: Optional[str] = None
    data_b64: Optional[str] = None
    url: Optional[str] = None


class ClaudeAI:
    def __init__(self, api_key: Optional[str], model: str = "claude-sonnet-5-5", timeout_s: float = 45.0):
        self.model = model
        self.enabled = bool(api_key)
        self.client = anthropic.Anthropic(api_key=api_key, timeout=timeout_s, max_retries=2) if api_key else None
        # Claude does both AI uses; without a key neither runs (manual review / plain templates).
        self.photo_enabled = self.enabled
        self.writes_alerts = self.enabled

    def _call(self, *, system: str, content: list, schema: dict, effort: str, max_tokens: int) -> tuple[dict, str]:
        if not self.client:
            raise AIUnavailable("AI service not configured")
        try:
            resp = self.client.beta.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                system=system,
                messages=[{"role": "user", "content": content}],
                output_config={"effort": effort, "format": {"type": "json_schema", "schema": schema}},
                **FALLBACK_KW,
            )
        except anthropic.AuthenticationError as e:
            log.error("Anthropic authentication failed: %s", e)
            raise AIUnavailable("AI key rejected") from e
        except anthropic.RateLimitError as e:
            raise AIUnavailable("AI rate limited") from e
        except anthropic.APITimeoutError as e:
            raise AIUnavailable("AI timed out") from e
        except anthropic.APIStatusError as e:
            log.error("Anthropic API error %s: %s", e.status_code, e.message)
            raise AIUnavailable(f"AI error {e.status_code}") from e
        except anthropic.APIConnectionError as e:
            raise AIUnavailable("AI unreachable") from e

        if resp.stop_reason == "refusal":
            raise AIUnavailable("AI declined")
        if resp.stop_reason == "max_tokens":
            raise AIUnavailable("AI output truncated")
        text = next((b.text for b in resp.content if getattr(b, "type", None) == "text"), None)
        if text is None:
            raise AIUnavailable("AI returned no text")
        try:
            return json.loads(text), resp.model
        except json.JSONDecodeError as e:
            raise AIUnavailable("AI returned invalid JSON") from e

    def classify_photo(self, image: Image, *, note: str, location_text: str, captured_at: str) -> dict:
        """FR-21. Returns an AiClassification dict. BR-10 (owner decision 2026-11-03): the model receives the PHOTO ONLY -
        the reporter's note, location text and time are never sent (free text from the public is an injection channel;
        the local-model evaluation showed a hostile note flipping 13 of 20 hazard photos to "clear"). The arguments are
        kept for the shared interface; the officer still sees them in the review queue."""
        if image.url:
            source = {"type": "url", "url": image.url}
        else:
            source = {"type": "base64", "media_type": image.media_type, "data": image.data_b64}
        content = [
            {"type": "image", "source": source},
            {"type": "text", "text": "Classify the photo."},
        ]
        out, served_by = self._call(system=PHOTO_SYSTEM, content=content, schema=PHOTO_SCHEMA, effort="low", max_tokens=4000)
        cls = out.get("hazard_class")
        if cls not in HAZARD_CLASSES:
            raise AIUnavailable("AI returned an unknown class")
        share = max(0, min(100, int(out.get("blocked_share", 0))))
        conf = max(0.0, min(1.0, float(out.get("confidence", 0))))
        if cls in ("clear", "not_relevant"):
            share = 0
        return {"hazardClass": cls, "blockedShare": share, "confidence": round(conf, 2), "model": served_by, "simulated": False}

    def write_alerts(self, fields: dict, templates: dict[str, str]) -> tuple[dict, str]:
        """FR-28. Returns ({lang: text}, model). The caller validates every text and blocks mismatches (BR-09)."""
        payload = json.dumps({"fields": fields, "reference_templates": templates}, ensure_ascii=False, indent=2)
        content = [{"type": "text", "text": f"<alert_input>\n{payload}\n</alert_input>\nWrite the four alerts."}]
        out, served_by = self._call(system=ALERT_SYSTEM, content=content, schema=ALERT_SCHEMA, effort="medium", max_tokens=8000)
        return {k: str(out[k]) for k in ("en", "hi", "as", "bn") if isinstance(out.get(k), str)}, served_by
