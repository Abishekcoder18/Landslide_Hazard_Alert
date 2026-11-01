"""Default configuration (NFR-09). Starting assumptions to be calibrated; the administrator edits them."""

DEFAULT_CONFIG: dict = {
    "weights": {"susceptibility": 35, "rainfall": 30, "slope": 20, "history": 15},
    "thresholds": {"yellow": 30, "orange": 55, "red": 75},
    "validityHours": 6,
    "staleInputHours": 6,
    "approachZoneExtentKm": 2.5,
    "duplicateWindowMinutes": 30,
    "duplicateDistanceKm": 1,
    "reportMaxAgeMinutes": 120,
    "corridorBufferKm": 2,
    "aiConfidenceThreshold": 0.7,
    "escalationMinutes": 10,
    "retentionDays": 90,
    "aiServiceOnline": True,
}
