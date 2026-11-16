const { test } = require('node:test');
const assert = require('node:assert/strict');
const { reverseGeocode, formatAddress } = require('../src/services/geocoding');

test('location lookup uses road metadata without requiring an external service', async () => {
  assert.equal(await reverseGeocode(-7.77, 110.37, ' Jalan Uji '), 'Jalan Uji');
  assert.equal(formatAddress({ cycleway: 'Jalur Sepeda', suburb: 'Bulaksumur' }), 'Jalur Sepeda, Bulaksumur');
  assert.equal(formatAddress({ village: 'Sinduadi' }), 'Sinduadi');
  assert.equal(formatAddress({}), null);
});

test('missing configuration and invalid coordinates do not fetch; successful lookup is cached', async () => {
  const originalFetch = global.fetch;
  const originalAgent = process.env.NOMINATIM_USER_AGENT;
  let requests = 0;
  global.fetch = async (url, options) => {
    requests++;
    assert.equal(url.searchParams.get('lat'), '-7.773467');
    assert.equal(options.headers['User-Agent'], 'PitHole-test');
    return { ok: true, json: async () => ({ address: { road: 'Jalan Uji', suburb: 'Sinduadi' } }) };
  };
  try {
    delete process.env.NOMINATIM_USER_AGENT;
    assert.equal(await reverseGeocode(-7.773467, 110.371966), null);
    process.env.NOMINATIM_USER_AGENT = 'PitHole-test';
    assert.equal(await reverseGeocode(null, 110), null);
    assert.equal(await reverseGeocode(91, 110), null);
    assert.equal(requests, 0);
    assert.equal(await reverseGeocode(-7.773467, 110.371966), 'Jalan Uji, Sinduadi');
    assert.equal(await reverseGeocode(-7.773467, 110.371966), 'Jalan Uji, Sinduadi');
    assert.equal(requests, 1);
  } finally {
    global.fetch = originalFetch;
    if (originalAgent === undefined) delete process.env.NOMINATIM_USER_AGENT;
    else process.env.NOMINATIM_USER_AGENT = originalAgent;
  }
});
