const test = require('node:test');
const assert = require('node:assert/strict');
const { classifySegment } = require('../src/utils/classifySegment');
const { HEATMAP_CONFIG } = require('../src/config/heatmap');

test('0 holes -> no color', () => {
  assert.deepEqual(classifySegment(125, 0, HEATMAP_CONFIG), { lengthPerHole: null, level: null });
});

test('1 hole on a short segment uses the minimum effective length (mid)', () => {
  const result = classifySegment(40, 1, HEATMAP_CONFIG);
  assert.equal(result.lengthPerHole, 100);
  assert.equal(result.level, 'mid');
});

test('1 hole on a 150 m segment -> 150 m per hole (mid)', () => {
  const result = classifySegment(150, 1, HEATMAP_CONFIG);
  assert.equal(result.lengthPerHole, 150);
  assert.equal(result.level, 'mid');
});

test('4 holes on a 125 m segment -> severe', () => {
  const result = classifySegment(125, 4, HEATMAP_CONFIG);
  assert.equal(result.lengthPerHole, 31.25);
  assert.equal(result.level, 'severe');
});

test('exactly at the threshold is severe, just above is mid', () => {
  assert.equal(classifySegment(180, 4, HEATMAP_CONFIG).level, 'severe');
  assert.equal(classifySegment(181, 4, HEATMAP_CONFIG).level, 'mid');
});
