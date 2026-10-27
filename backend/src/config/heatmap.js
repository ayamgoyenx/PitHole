// Single place to tune the road heat map. The API exposes these values to the legend.
const HEATMAP_CONFIG = Object.freeze({
  SEVERE_MAX_M_PER_HOLE: 45, // <= 45 m of road per pothole -> red (severe)
  MIN_EFFECTIVE_LENGTH_M: 100, // short segments never count as shorter than this
});

module.exports = { HEATMAP_CONFIG };
