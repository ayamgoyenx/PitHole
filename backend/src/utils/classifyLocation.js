const { STREET_PIN_CONFIG } = require('../config/streetPin');

/**
 * Classify a road location by open potholes per 100 m.
 * Returns { density, level } where level is "severe" | "medium" | "safe" | null (no potholes -> no pin).
 */
function classifyLocation(lengthM, holes, config = STREET_PIN_CONFIG) {
  const holeCount = Number(holes);
  if (!Number.isFinite(holeCount) || holeCount <= 0) {
    return { density: 0, level: null };
  }

  const length = Number.isFinite(Number(lengthM)) ? Number(lengthM) : 0;
  const effectiveLength = Math.max(length, config.MIN_EFFECTIVE_LENGTH_M);
  const density = holeCount / (effectiveLength / 100);

  let level = 'safe';
  if (density >= config.THRESHOLD_A) level = 'severe';
  else if (density >= config.THRESHOLD_B) level = 'medium';
  return { density, level };
}

module.exports = { classifyLocation };
