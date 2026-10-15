// terms.js
// The Terms & Conditions come from the server (GET /api/terms/active), which reads the newest
// version the ADMIN published in termsVersions. The text is Markdown (content). When a customer
// accepts at signup or at booking, the browser sends that version's termsVersionID and the server
// records it — so the exact words they agreed to can be shown again later
// (GET /api/terms/version/:id).
import { useCallback, useEffect, useState } from "react";

const BASE_URL = `${process.env.REACT_APP_API_URL}/terms`;
const CACHE_MS = 30_000;

let cache = null;
let cacheAt = 0;

// Rejects on failure (callers show a retry — there is deliberately NO hard-coded fallback:
// a fallback would be a text the server never recorded).
export const fetchActiveTerms = async ({ force = false } = {}) => {
  if (!force && cache && Date.now() - cacheAt < CACHE_MS) return cache;
  const res = await fetch(`${BASE_URL}/active`);
  if (res.status === 404) throw new Error("The Terms & Conditions have not been published yet.");
  if (!res.ok) throw new Error("Could not load the Terms & Conditions. Please try again.");
  cache = await res.json(); // { termsVersionID, version, content, effectiveAt }
  cacheAt = Date.now();
  return cache;
};

export const fetchTermsVersion = async (id) => {
  const res = await fetch(`${BASE_URL}/version/${encodeURIComponent(id)}`);
  if (res.status === 404) throw new Error("That version of the Terms & Conditions was not found.");
  if (!res.ok) throw new Error("Could not load that version. Please try again.");
  return res.json();
};

// versionID = null → the current terms; otherwise the exact version with that ID
// (a termsVersionID, or — for bookings made before this change — an old text hash).
export const useTermsDocument = (versionID = null) => {
  const [state, setState] = useState({ terms: versionID ? null : cache, loading: true, error: "" });

  const load = useCallback(async (force = false) => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const terms = versionID ? await fetchTermsVersion(versionID) : await fetchActiveTerms({ force });
      setState({ terms, loading: false, error: "" });
      return terms;
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err.message || "Could not load the Terms & Conditions." }));
      return null;
    }
  }, [versionID]);

  useEffect(() => { load(); }, [load]);

  return { ...state, reload: () => load(true) };
};

export const useActiveTerms = () => useTermsDocument(null);
