const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
const MIN_NOMINATIM_INTERVAL_MS = 1000;

let requestQueue = Promise.resolve();
let lastRequestStartedAt = 0;
let warnedMissingUserAgent = false;
const addressCache = new Map();

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function formatAddress(address = {}) {
  const road = address.road
    || address.pedestrian
    || address.residential
    || address.cycleway
    || address.path;
  const locality = address.suburb
    || address.village
    || address.neighbourhood
    || address.city_district
    || address.town
    || address.city
    || address.municipality;

  if (road && locality) return `${road}, ${locality}`;
  return road || locality || null;
}

async function requestNominatim(lat, lon, userAgent) {
  const request = requestQueue.then(async () => {
    const wait = MIN_NOMINATIM_INTERVAL_MS - (Date.now() - lastRequestStartedAt);
    if (wait > 0) await delay(wait);
    lastRequestStartedAt = Date.now();

    const url = new URL(NOMINATIM_URL);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lon));
    url.searchParams.set('zoom', '17');
    url.searchParams.set('addressdetails', '1');

    const response = await fetch(url, {
      headers: {
        'User-Agent': userAgent,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      console.warn(`[Geocoding] Nominatim HTTP ${response.status} for ${lat},${lon}; location name remains pending.`);
      return null;
    }

    const result = await response.json();
    return formatAddress(result.address);
  });

  requestQueue = request.catch(() => null);
  return request;
}

async function reverseGeocode(lat, lon, roadSegmentName = null) {
  if (typeof roadSegmentName === 'string' && roadSegmentName.trim()) {
    return roadSegmentName.trim();
  }

  const userAgent = process.env.NOMINATIM_USER_AGENT?.trim();
  if (!userAgent || userAgent.startsWith('replace-with-')) {
    if (!warnedMissingUserAgent) {
      console.warn('[Geocoding] Set NOMINATIM_USER_AGENT on the backend service to enable location names outside imported road segments.');
      warnedMissingUserAgent = true;
    }
    return null;
  }
  if (lat == null || lon == null || lat === '' || lon === ''
      || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))
      || Math.abs(Number(lat)) > 90 || Math.abs(Number(lon)) > 180) return null;

  const key = `${Number(lat)},${Number(lon)}`;
  if (addressCache.has(key)) return addressCache.get(key);

  try {
    const name = await requestNominatim(Number(lat), Number(lon), userAgent);
    if (name) {
      if (addressCache.size >= 2000) addressCache.delete(addressCache.keys().next().value);
      addressCache.set(key, name);
    }
    return name;
  } catch (error) {
    console.warn(`[Geocoding] Reverse lookup failed: ${error.message}`);
    return null;
  }
}

module.exports = { reverseGeocode, formatAddress };
