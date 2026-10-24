const { HEATMAP_CONFIG } = require('../config/heatmap');

/**
 * Classify a road segment by meters of road per active pothole.
 * Returns { lengthPerHole, level } where level is "severe" | "mid" | null.
 */
function classifySegment(lengthM, holes, config = HEATMAP_CONFIG) {
  const holeCount = Number(holes);
  if (!Number.isFinite(holeCount) || holeCount <= 0) {
    return { lengthPerHole: null, level: null };
  }

  const length = Number.isFinite(Number(lengthM)) ? Number(lengthM) : 0;
  const effectiveLength = Math.max(length, config.MIN_EFFECTIVE_LENGTH_M);
  const lengthPerHole = effectiveLength / holeCount;
  const level = lengthPerHole <= config.SEVERE_MAX_M_PER_HOLE ? 'severe' : 'mid';
  return { lengthPerHole, level };
}

module.exports = { classifySegment };
