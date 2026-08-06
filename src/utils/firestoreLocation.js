// firestoreLocation.js
// Replaces the hardcoded luzonData.js — all data comes from Firestore
// via the backend API at /api/location/*

const BASE_URL = `${process.env.REACT_APP_API_URL}/location`;

// ── Simple in-memory cache so repeated renders don't re-fetch ──
const cache = {};

const fetchCached = async (key, url) => {
  if (cache[key]) return cache[key];
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const data = await res.json();
  cache[key] = data;
  return data;
};

/** Fetch all regions (sorted by name) */
export const fetchRegions = () =>
  fetchCached("regions", `${BASE_URL}/regions`);

/** Fetch provinces for a given regionID */
export const fetchProvinces = (regionID) =>
  regionID
    ? fetchCached(`provinces_${regionID}`, `${BASE_URL}/provinces?regionID=${regionID}`)
    : Promise.resolve([]);

/** Fetch municipalities for a given provinceID */
export const fetchMunicipalities = (provinceID) =>
  provinceID
    ? fetchCached(
        `municipalities_${provinceID}`,
        `${BASE_URL}/municipalities?provinceID=${provinceID}`
      )
    : Promise.resolve([]);

/** Fetch barangays for a given municipalityID */
export const fetchBarangays = (municipalityID) =>
  municipalityID
    ? fetchCached(
        `barangays_${municipalityID}`,
        `${BASE_URL}/barangays?municipalityID=${municipalityID}`
      )
    : Promise.resolve([]);

/** Look up the postal code for a given municipality/city name (best-effort). */
export const fetchPostalCode = (municipalityName) =>
  municipalityName
    ? fetchCached(
        `postalcode_${municipalityName}`,
        `${BASE_URL}/postal-code?municipality=${encodeURIComponent(municipalityName)}`
      )
    : Promise.resolve({ postalCode: "", found: false });
    