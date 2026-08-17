// storeLocation.js
// Fetches the in-store pickup location from the admin-managed
// systemSettings doc, via GET /api/location/store. Replaces the old
// REACT_APP_STORE_LABEL / REACT_APP_STORE_LAT / REACT_APP_STORE_LNG env
// vars — the admin can now change the store location without a redeploy.

const BASE_URL = `${process.env.REACT_APP_API_URL}/location`;

let cache = null;
let cacheExpiresAt = 0;
const CACHE_MS = 60_000; // matches the backend's own 60s cache

/**
 * Fetch the current store pickup location.
 * Resolves to { storeName, storeLat, storeLng, configured } — always,
 * never rejects. On any failure it resolves to the "not configured"
 * shape so callers can render without a try/catch.
 */
export const fetchStoreLocation = async () => {
  if (cache && Date.now() < cacheExpiresAt) return cache;

  try {
    const res = await fetch(`${BASE_URL}/store`);
    if (!res.ok) throw new Error(`Failed to fetch store location: ${res.status}`);
    const data = await res.json();

    const storeName = data.storeName || "";
    const storeLat  = typeof data.storeLat === "number" ? data.storeLat : null;
    const storeLng  = typeof data.storeLng === "number" ? data.storeLng : null;

    cache = {
      storeName,
      storeLat,
      storeLng,
      // Computed here rather than trusted from data.configured — some
      // deployed builds of the backend endpoint only return
      // storeName/storeLat/storeLng with no configured field at all, which
      // silently broke the checkbox (undefined → falsy) even though the
      // location data itself was fully populated and correct.
      configured: !!storeName && storeLat !== null && storeLng !== null,
    };
    cacheExpiresAt = Date.now() + CACHE_MS;
    return cache;
  } catch (err) {
    console.error("[storeLocation] fetchStoreLocation failed:", err.message);
    return { storeName: "", storeLat: null, storeLng: null, configured: false };
  }
};