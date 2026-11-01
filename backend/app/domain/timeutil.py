from datetime import datetime, timezone


def parse_iso(s: str) -> datetime:
    """Parse an ISO 8601 timestamp (accepts trailing Z)."""
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    d = datetime.fromisoformat(s)
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def to_iso(d: datetime) -> str:
    """ISO 8601 in UTC with milliseconds and Z, matching JavaScript Date.toISOString()."""
    d = d.astimezone(timezone.utc)
    return d.strftime("%Y-%m-%dT%H:%M:%S.") + f"{d.microsecond // 1000:03d}Z"


def ms(d: datetime) -> int:
    return int(d.timestamp() * 1000)
