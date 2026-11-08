// storePlace.js
// The in-store pickup is a pin like any other, but it only carries coordinates: nothing says which city / province
// the shop is in, so the "outside the base area" check could not judge it and always treated it as inside. This works
// out the shop's own city / province / county from its coordinates, the same way the map picker does for a pin
// (OpenStreetMap / Nominatim reverse geocoding), so the shop is judged against the admin's base-area keywords too.
//
// The answer is kept for a day (the shop does not move), so this is one request per visitor per day.

const STORAGE_KEY = "arl_store_place_v1";
const MAX_AGE_MS  = 24 * 60 * 60 * 1000;

const idOf = (lat, lng) => `${lat.toFixed(5)},${lng.toFixed(5)}`;

/**
 * Resolves to { city, province, county } for the store's coordinates, or null when it can't be worked out
 * (no coordinates, offline, or the geocoder returned nothing). Never rejects.
 */
export const resolveStorePlace = async (lat, lng) => {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  const id = idOf(lat, lng);

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved && saved.id === id && Date.now() - saved.at < MAX_AGE_MS && saved.place) return saved.place;
  } catch { /* unreadable cache: just ask again */ }

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&zoom=18`,
      { headers: { "Accept-Language": "en" } }
    );
    if (!res.ok) return null;
    const a = (await res.json()).address || {};
    // Same fields, in the same order, as MapPicker uses for a pin.
    const place = {
      city:     a.city || a.town || a.municipality || a.village || "",
      province: a.province || a.state || "",
      county:   a.county || "",
    };
    if (!place.city && !place.province && !place.county) return null;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ id, at: Date.now(), place })); } catch { /* private mode etc. */ }
    return place;
  } catch {
    return null;
  }
};
