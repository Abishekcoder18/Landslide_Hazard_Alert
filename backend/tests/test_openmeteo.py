"""Phase 4: Open-Meteo rainfall - pure parsing / window rules (no network)."""
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from app import openmeteo

IST = ZoneInfo("Asia/Kolkata")


def hours(start: datetime, n: int, mm=1.0):
    return [(start + timedelta(hours=i)).strftime("%Y-%m-%dT%H:%M") for i in range(n)], [mm] * n


def test_live_totals_stop_at_last_completed_hour():
    t, mm = hours(datetime(2026, 10, 27, 0, 0), 8 * 24)  # 7 past days + today incl. forecast hours
    now = datetime(2026, 11, 3, 10, 30, tzinfo=IST)
    totals, last = openmeteo.live_totals(t, mm, now)
    assert last == datetime(2026, 11, 3, 10, 0, tzinfo=IST)  # 11:00 (future) not counted
    assert totals == {"rainfall24h": 24.0, "rainfall3d": 72.0, "rainfall7d": 168.0}


def test_live_missing_hour_is_none_not_zero():
    t, mm = hours(datetime(2026, 10, 27, 0, 0), 8 * 24)
    mm[-20] = None  # inside the last 24 h window before 'now'
    now = datetime(2026, 11, 3, 23, 59, tzinfo=IST)
    totals, _ = openmeteo.live_totals(t, mm, now)
    assert totals["rainfall24h"] is None and totals["rainfall7d"] is None


def test_window_totals_need_every_day():
    d = date(2026, 6, 21)
    rows = [("C1", d - timedelta(days=i), 10.0) for i in range(7)] + [("C2", d, 5.0)]
    w = openmeteo.window_totals(rows, d)
    assert w["C1"] == {"rainfall24h": 10.0, "rainfall3d": 30.0, "rainfall7d": 70.0}
    assert w["C2"] == {"rainfall24h": 5.0, "rainfall3d": None, "rainfall7d": None}


class _Client:
    def __init__(self, payload):
        self.payload, self.params = payload, None

    def get(self, url, params=None):
        self.params = params
        p = self.payload

        class R:
            def raise_for_status(self):
                pass

            def json(self):
                return p
        return R()


def test_fetch_archive_multi_location_and_nulls_dropped():
    loc = lambda vals: {"daily": {"time": ["2026-06-20", "2026-06-21"], "precipitation_sum": vals}}  # noqa: E731
    c = _Client([loc([1.5, None]), loc([0.0, 80.2])])
    rows = openmeteo.fetch_archive([("A", 25.0, 92.75), ("B", 25.25, 93.0)], date(2026, 6, 20), date(2026, 6, 21), c)
    assert rows == [("A", date(2026, 6, 20), 1.5), ("B", date(2026, 6, 20), 0.0), ("B", date(2026, 6, 21), 80.2)]
    assert c.params["latitude"] == "25.0000,25.2500" and c.params["timezone"] == "Asia/Kolkata"


def test_fetch_live_single_location_object():
    t, mm = hours(datetime(2026, 10, 27, 0, 0), 8 * 24, 0.5)
    c = _Client({"hourly": {"time": t, "precipitation": mm}})
    out = openmeteo.fetch_live([("A", 25.0, 92.75)], datetime(2026, 11, 3, 5, 0, tzinfo=timezone.utc), c)
    assert out["A"]["rainfall24h"] == 12.0 and c.params["past_days"] == 7
