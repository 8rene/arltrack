// firestoreLocation.js
// Replaces the hardcoded luzonData.js — all data comes from Firestore
// via the backend API at /api/location/*

const BASE_URL = `${process.env.REACT_APP_API_URL}/location`;

// ── Simple in-memory cache so repeated renders don't re-fetch ──
const cache = {};

const fetchCached = async (key, path, params = {}) => {
  if (cache[key]) return cache[key];
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Failed to fetch ${BASE_URL}${path}: ${res.status}`);
  const data = await res.json();
  cache[key] = data;
  return data;
};

/** Fetch all regions (sorted by name) */
export const fetchRegions = () =>
  fetchCached("regions", "/regions");

/** Fetch provinces for a given regionID */
export const fetchProvinces = (regionID) =>
  regionID
    ? fetchCached(`provinces_${regionID}`, "/provinces", { regionID })
    : Promise.resolve([]);

/** Fetch municipalities for a given provinceID */
export const fetchMunicipalities = (provinceID) =>
  provinceID
    ? fetchCached(`municipalities_${provinceID}`, "/municipalities", { provinceID })
    : Promise.resolve([]);

/** Fetch barangays for a given municipalityID */
export const fetchBarangays = (municipalityID) =>
  municipalityID
    ? fetchCached(`barangays_${municipalityID}`, "/barangays", { municipalityID })
    : Promise.resolve([]);

/** Look up the postal code for a given municipality/city (+ optional barangay
 *  for more precise results, e.g. NCR districts each have their own code). */
export const fetchPostalCode = (municipalityName, barangayName = "") => {
  if (!municipalityName) return Promise.resolve({ postalCode: "", found: false });
  return fetchCached(
    `postalcode_${municipalityName}_${barangayName}`,
    "/postal-code",
    { municipality: municipalityName, ...(barangayName ? { barangay: barangayName } : {}) }
  );
};
