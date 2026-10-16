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
  const res = await fetch(`${BASE_URL}/service-area`, { method: "POST", headers: { "Content-Type": "application/json" } });
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
  const res = await fetch(`${BASE_URL}/service-area/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ region, province, city }),
  });
  if (!res.ok) throw new Error(`Service area check failed: ${res.status}`);
  const data = await res.json();
  return !!data.allowed;
};

// ── Outlines for the map (OpenStreetMap / Nominatim) — one per allowed
// region, so MapPicker can shade the ALLOWED pickup regions and fog out
// everything else. Separate cache from base-area outlines (different
// purpose: this is the pickup restriction, not the fee zone), but same
// strategy — cached in memory + localStorage, fetched ~1.1s apart to
// respect Nominatim's public-usage limit.
const LS_KEY = 'arl_service_area_outlines_v1';
const LS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const outlineMemory = new Map(); // regionName -> { geometry } | null

const readStore = () => {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
};
const writeStore = (store) => {
  try { localStorage.setItem(LS_KEY, JSON.stringify(store)); } catch { /* storage full/blocked — memory cache still works */ }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let outlineQueueTail = Promise.resolve();

const fetchRegionBoundary = async (name) => {
  const params = new URLSearchParams({
    format: 'json',
    polygon_geojson: '1',
    polygon_threshold: '0.005', // regions are large — a looser simplification keeps the outline light
    limit: '5',
    countrycodes: 'ph',
    'accept-language': 'en',
    q: `${name}, Philippines`,
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status} for ${name}`);
  const results = await res.json();
  const isPoly = (r) => r?.geojson && (r.geojson.type === 'Polygon' || r.geojson.type === 'MultiPolygon');
  const polys = (results || []).filter(isPoly);
  const hit = polys.find((r) => r.class === 'boundary') || polys[0];
  return hit ? { geometry: hit.geojson } : null;
};

/**
 * Outline for one allowed region → { geometry } | null (no outline found).
 * Throws on a network failure so the caller can tell "no outline" from "try again".
 */
export const getServiceAreaOutline = (regionName) => {
  const key = String(regionName || '').trim().toLowerCase();
  if (!key) return Promise.resolve(null);
  if (outlineMemory.has(key)) return Promise.resolve(outlineMemory.get(key));

  const store = readStore();
  const saved = store[key];
  if (saved && Date.now() - saved.at < LS_TTL_MS) {
    outlineMemory.set(key, saved.shape);
    return Promise.resolve(saved.shape);
  }

  const run = outlineQueueTail.then(async () => {
    if (outlineMemory.has(key)) return outlineMemory.get(key);
    const shape = await fetchRegionBoundary(key);
    outlineMemory.set(key, shape);
    const next = readStore();
    next[key] = { shape, at: Date.now() };
    writeStore(next);
    await sleep(1100);
    return shape;
  });
  outlineQueueTail = run.catch(() => sleep(1100));
  return run;
};
