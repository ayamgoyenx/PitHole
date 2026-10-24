// Single place to tune street pins. The API returns these values to the frontend legend.
const STREET_PIN_CONFIG = Object.freeze({
  THRESHOLD_A: 2.0, // open potholes per 100 m >= A -> severe
  THRESHOLD_B: 0.8, // B <= density < A -> medium, 0 < density < B -> safe
  MIN_EFFECTIVE_LENGTH_M: 50, // short segments never count as shorter than this
});

module.exports = { STREET_PIN_CONFIG };
