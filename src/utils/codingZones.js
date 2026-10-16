// codingZones.js
// Cities covered by at least one vehicle-coding rule (see admin's codingRules
// collection) — used ONLY to shade a general "heads up, this city has SOME
// coding restriction" zone on the Destination map, before a car/date is even
// picked. This never blocks anything by itself: the exact, date + plate
// accurate check still happens via /api/bookings/check-coding and
// /coding-notice once a car and dates are chosen (see Booking.jsx's
// runCodingCheck / codingNote) — that text warning stays the source of truth.

const BASE_URL = `${process.env.REACT_APP_API_URL}/bookings`;

let citiesCache = null;
let citiesExpiresAt = 0;
const CACHE_MS = 60_000;

/** Resolves to { cities: ["Quezon City", ...] }. Never rejects — resolves to an empty list on failure. */
export const fetchCodingCities = async () => {
  if (citiesCache && Date.now() < citiesExpiresAt) return citiesCache;
  try {
    const res = await fetch(`${BASE_URL}/coding-cities`, { method: "POST", headers: { "Content-Type": "application/json" } });
    if (!res.ok) throw new Error(`Failed to fetch coding cities: ${res.status}`);
    const data = await res.json();
    citiesCache = { cities: Array.isArray(data.cities) ? data.cities : [] };
    citiesExpiresAt = Date.now() + CACHE_MS;
    return citiesCache;
  } catch (err) {
    console.error("[codingZones] fetchCodingCities failed:", err.message);
    return { cities: [] };
  }
};

// ── Outlines for the map — one per coding-rule city, same Nominatim
// strategy as base-area / service-area outlines, own cache key. ──
const LS_KEY = "arl_coding_zone_outlines_v1";
const LS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const outlineMemory = new Map(); // cityName -> { geometry } | null

const readStore = () => {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; }
};
const writeStore = (store) => {
  try { localStorage.setItem(LS_KEY, JSON.stringify(store)); } catch { /* storage full/blocked — memory cache still works */ }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let outlineQueueTail = Promise.resolve();

const fetchCityBoundary = async (name) => {
  const params = new URLSearchParams({
    format: "json",
    polygon_geojson: "1",
    polygon_threshold: "0.003",
    limit: "5",
    countrycodes: "ph",
    "accept-language": "en",
    q: `${name}, Philippines`,
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status} for ${name}`);
  const results = await res.json();
  const isPoly = (r) => r?.geojson && (r.geojson.type === "Polygon" || r.geojson.type === "MultiPolygon");
  const polys = (results || []).filter(isPoly);
  const hit = polys.find((r) => r.class === "boundary") || polys[0];
  return hit ? { geometry: hit.geojson } : null;
};

/**
 * Outline for one coding-rule city → { geometry } | null (no outline found).
 * Throws on a network failure so the caller can tell "no outline" from "try again".
 */
export const getCodingZoneOutline = (cityName) => {
  const key = String(cityName || "").trim().toLowerCase();
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
    const shape = await fetchCityBoundary(key);
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
