"""Background input feeds (enabled with FEEDS_ENABLED=true; off in tests).

Each feed runs on its own timer, fetches outside the database transaction, then applies its result through the
normal workflow unit of work (audited, serialised by the advisory lock). Any failure is logged and the last values
are kept; BR-06 / BR-12 then turn stale data into No data on their own.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Any, Callable

log = logging.getLogger("resilion.feeds")


async def every(minutes: float, name: str, job: Callable[[], Any]) -> None:
    while True:
        try:
            result = await asyncio.to_thread(job)
            log.info("feed %s: %s", name, result)
        except Exception as e:  # noqa: BLE001 - keep last values, retry next cycle
            log.warning("feed %s failed: %s: %s", name, type(e).__name__, e)
        await asyncio.sleep(minutes * 60)


def sachet_job(run: Callable, clock: Callable[[], datetime]) -> Callable[[], str]:
    from . import sachet

    def job() -> str:
        alerts = sachet.fetch_alerts()
        w = sachet.corridor_warning(alerts, clock())
        changed, _ = run(lambda wf: wf.apply_imd_feed(w["imdWarning"], w["label"]))
        return f"{len(alerts)} alerts, corridor {w['imdWarning']} ({w['label']}), changed={changed}"
    return job


def rain_job(run: Callable, store, clock: Callable[[], datetime]) -> Callable[[], str]:
    """Open-Meteo live rainfall. Fetches only while the configured rainfall date is "live"."""
    from . import openmeteo

    def job() -> str:
        with store.connect() as conn:
            row = conn.execute(f"SELECT data->>'scenarioDate' FROM {store.t('kv')} WHERE key = 'config'").fetchone()
            if not row or row[0] != openmeteo.LIVE:
                return "rainfall date is not live - skipped"
            cs = openmeteo.cells(conn, store.schema)
        now = clock()
        totals = openmeteo.fetch_live(cs, now)
        with store.connect() as conn:
            openmeteo.store_live(conn, store.schema, totals, now)
            conn.commit()
        changed, _ = run(lambda wf: wf.apply_rain_feed())
        return f"{len(totals)} cells, applied={changed}"
    return job
