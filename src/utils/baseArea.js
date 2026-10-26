// baseArea.js
// The "base area" is the set of places (cities / provinces) the admin lists under
// System Settings → Base Area Keywords. A pickup or destination OUTSIDE it costs an
// extra fee, and a chauffeur's fee is higher there.
//
// The server (utils/pricing.js) is the only authority on what a booking is charged —
// everything here is display: it shades the base area on the map and tells the
// customer, as they pick a spot, whether that spot is inside or outside.

const API = process.env.REACT_APP_API_URL;

// ── Config from the server (keywords + fee amounts) ─────────────────────────
let configCache = null;
let configExpiresAt = 0;
const CONFIG_MS = 60_000;

/** Resolves to { baseAreaKeywords, basis, extraFeeOutsideArea, driversFeeBaseArea, driversFeeOutsideArea, bookingLeadHours }
 *  (bookingLeadHours = minimum notice before pickup, in hours; null if the server did not say). Rejects on failure. */
export const fetchBaseAreaConfig = async () => {
  if (configCache && Date.now() < configExpiresAt) return configCache;
  const res = await fetch(`${API}/bookings/base-area`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error(`Failed to load base area: ${res.status}`);
  const data = await res.json();
  configCache = {
    baseAreaKeywords: Array.isArray(data.baseAreaKeywords) ? data.baseAreaKeywords : [],
    basis: data.basis || 'either',
    extraFeeOutsideArea: Number(data.extraFeeOutsideArea) || 0,
    driversFeeBaseArea: Number(data.driversFeeBaseArea) || 0,
    driversFeeOutsideArea: Number(data.driversFeeOutsideArea) || 0,
    bookingLeadHours: data.bookingLeadHours != null && Number.isFinite(Number(data.bookingLeadHours)) && Number(data.bookingLeadHours) >= 0 ? Number(data.bookingLeadHours) : null,
  };
  configExpiresAt = Date.now() + CONFIG_MS;
  return configCache;
};

// ── Inside / outside — same normalisation as the server's isOutsideByPin() ───
// "City of Manila" / "Manila City" / "Province of Bulacan" → "manila" / "manila" / "bulacan".
// An EXACT match is still required, so "New Manila" does not match "manila".
const normalizePlace = (v) =>
  String(v || '')
    .toLowerCase()
    .replace(/\b(city|province|municipality) of\b/g, ' ')
    .replace(/\bcity\b/g, ' ')
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** true = inside the base area, false = outside, null = can't tell (no city/province on the pin). */
export const isInsideBaseArea = ({ city, province, county } = {}, keywords = []) => {
  const c = normalizePlace(city);
  const p = normalizePlace(province);
  const n = normalizePlace(county); // geocoder "county" — often the province itself
  if (!c && !p && !n) return null;
  const ks = (keywords || []).map(normalizePlace).filter(Boolean);
  return ks.some((k) => c === k || p === k || n === k);
};

// ── Outlines for the map (OpenStreetMap / Nominatim) ────────────────────────
// Cached in memory and in localStorage (outlines almost never change), and fetched
// one at a time ~1.1 s apart to respect Nominatim's public-usage limit — so a
// returning visitor sees the shading instantly and never hits Nominatim again.
const LS_KEY = 'arl_base_area_outlines_v1';
const LS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const memory = new Map(); // keyword -> { geometry } | null (null = the place has no outline)

const readStore = () => {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
};
const writeStore = (store) => {
  try { localStorage.setItem(LS_KEY, JSON.stringify(store)); } catch { /* storage full/blocked — memory cache still works */ }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let queueTail = Promise.resolve();

const fetchBoundary = async (name) => {
  const params = new URLSearchParams({
    format: 'json',
    polygon_geojson: '1',
    polygon_threshold: '0.002', // simplifies the outline so a whole province stays light
    limit: '5',                 // limit=1 often returns a point instead of an outline
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
 * Outline for one keyword → { geometry } | null (no outline exists). Throws on a
 * network failure so the caller can tell "no outline" from "try again".
 */
export const getBaseAreaOutline = (keyword) => {
  const key = String(keyword || '').trim().toLowerCase();
  if (!key) return Promise.resolve(null);
  if (memory.has(key)) return Promise.resolve(memory.get(key));

  const store = readStore();
  const saved = store[key];
  if (saved && Date.now() - saved.at < LS_TTL_MS) {
    memory.set(key, saved.shape);
    return Promise.resolve(saved.shape);
  }

  const run = queueTail.then(async () => {
    if (memory.has(key)) return memory.get(key); // another caller got it while we waited
    const shape = await fetchBoundary(key);
    memory.set(key, shape);
    const next = readStore();
    next[key] = { shape, at: Date.now() };
    writeStore(next);
    await sleep(1100);
    return shape;
  });
  queueTail = run.catch(() => sleep(1100)); // a failed lookup must not jam the queue
  return run;
};
