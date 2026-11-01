import { Config } from '../types';

/** Default configuration (NFR-09). Values are starting assumptions to be calibrated; the administrator edits them. */
export const DEFAULT_CONFIG: Config = {
  weights: { susceptibility: 35, rainfall: 30, slope: 20, history: 15 },
  thresholds: { yellow: 30, orange: 55, red: 75 },
  validityHours: 6,
  staleInputHours: 6,
  approachZoneExtentKm: 2.5,
  duplicateWindowMinutes: 30,
  duplicateDistanceKm: 1,
  reportMaxAgeMinutes: 120,
  corridorBufferKm: 2,
  aiConfidenceThreshold: 0.7,
  escalationMinutes: 10,
  retentionDays: 90,
  aiServiceOnline: true
};
