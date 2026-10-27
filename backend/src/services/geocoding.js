const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
const MIN_NOMINATIM_INTERVAL_MS = 1000;

let requestQueue = Promise.resolve();
let lastRequestStartedAt = 0;

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
    if (!response.ok) return null;

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

  const userAgent = process.env.NOMINATIM_USER_AGENT;
  if (!userAgent || userAgent.startsWith('replace-with-')) return null;
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) return null;

  try {
    return await requestNominatim(Number(lat), Number(lon), userAgent);
  } catch (error) {
    console.warn(`[Geocoding] Reverse lookup failed: ${error.message}`);
    return null;
  }
}

module.exports = { reverseGeocode, formatAddress };
