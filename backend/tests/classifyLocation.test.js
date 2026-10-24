const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyLocation } = require('../src/utils/classifyLocation');

const CONFIG = { THRESHOLD_A: 2.0, THRESHOLD_B: 0.8, MIN_EFFECTIVE_LENGTH_M: 50 };

test('0 holes -> no pin', () => {
  assert.deepEqual(classifyLocation(100, 0, CONFIG), { density: 0, level: null });
});

test('density exactly at threshold A is severe', () => {
  const result = classifyLocation(100, 2, CONFIG);
  assert.equal(result.density, 2);
  assert.equal(result.level, 'severe');
});

test('density just below threshold A is medium', () => {
  assert.equal(classifyLocation(100, 1.99, CONFIG).level, 'medium');
});

test('density exactly at threshold B is medium', () => {
  assert.equal(classifyLocation(100, 0.8, CONFIG).level, 'medium');
});

test('density just below threshold B is safe', () => {
  assert.equal(classifyLocation(100, 0.79, CONFIG).level, 'safe');
});

test('tiny segment uses the minimum effective length', () => {
  const result = classifyLocation(10, 1, CONFIG);
  assert.equal(result.density, 2);
  assert.equal(result.level, 'severe');
});

test('long road with one hole is safe', () => {
  assert.equal(classifyLocation(500, 1, CONFIG).level, 'safe');
});

test('repaired potholes are excluded by passing only the open count', () => {
  const open = 3 - 3;
  assert.equal(classifyLocation(100, open, CONFIG).level, null);
});

test('missing length falls back to the minimum effective length', () => {
  assert.equal(classifyLocation(null, 1, CONFIG).density, 2);
});
