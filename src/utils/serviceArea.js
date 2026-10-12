// serviceArea.js
// Pickup is limited to the regions saved in the Firestore `regions` collection.
// Nothing is hardcoded here or on the server — the backend decides using the
// regions / provinces / municipalities in the database.

const BASE_URL = `${process.env.REACT_APP_API_URL}/location`;

let cache = null;
let cacheExpiresAt = 0;
const CACHE_MS = 5 * 60_000;

/** Resolves to { regions: [{regionID, regionName}] }. Rejects on failure so callers can fail closed. */
export const fetchServiceArea = async () => {
  if (cache && Date.now() < cacheExpiresAt) return cache;
  const res = await fetch(`${BASE_URL}/service-area`);
  if (!res.ok) throw new Error(`Failed to fetch service area: ${res.status}`);
  const data = await res.json();
  cache = { regions: Array.isArray(data.regions) ? data.regions : [] };
  cacheExpiresAt = Date.now() + CACHE_MS;
  return cache;
};

/** Human-readable list of allowed regions from the database. */
export const serviceAreaLabel = (area) =>
  (area?.regions || []).map((r) => r.regionName).join(', ');

/** Asks the server whether this region/province/city is inside the service area. Throws on network failure. */
export const checkInServiceArea = async ({ region = '', province = '', city = '' }) => {
  const params = new URLSearchParams({ region, province, city });
  const res = await fetch(`${BASE_URL}/service-area/check?${params.toString()}`);
  if (!res.ok) throw new Error(`Service area check failed: ${res.status}`);
  const data = await res.json();
  return !!data.allowed;
};
