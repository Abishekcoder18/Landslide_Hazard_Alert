"""Sign-in tokens (FR-32, prototype level): HMAC-signed {userId, role}. No passwords yet — a real identity provider
is a later step. Permissions (FR-33) are enforced on every command in app/service.py."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json

from .domain.permissions import ROLES


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def issue(user_id: str, role: str, secret: str) -> dict:
    if role not in ROLES:
        raise ValueError("Unknown role")
    payload = _b64(json.dumps({"u": user_id, "r": role}, separators=(",", ":")).encode())
    sig = _b64(hmac.new(secret.encode(), payload.encode(), hashlib.sha256).digest())
    return {"userId": user_id, "name": user_id, "role": role, "token": f"{payload}.{sig}"}


def verify(token: str, secret: str) -> dict | None:
    try:
        payload, sig = token.split(".", 1)
    except ValueError:
        return None
    expected = _b64(hmac.new(secret.encode(), payload.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, expected):
        return None
    data = json.loads(_unb64(payload))
    if data.get("r") not in ROLES:
        return None
    return {"userId": data["u"], "name": data["u"], "role": data["r"]}
