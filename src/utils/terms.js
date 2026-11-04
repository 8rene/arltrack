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
  const res = await fetch(`${BASE_URL}/active`, { method: "POST", headers: { "Content-Type": "application/json" } });
  if (res.status === 404) throw new Error("The Terms & Conditions have not been published yet.");
  if (!res.ok) throw new Error("Could not load the Terms & Conditions. Please try again.");
  cache = await res.json(); // { termsVersionID, version, content, effectiveAt }
  cacheAt = Date.now();
  return cache;
};

export const fetchTermsVersion = async (id) => {
  const res = await fetch(`${BASE_URL}/version/${encodeURIComponent(id)}`, { method: "POST", headers: { "Content-Type": "application/json" } });
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

// ── Pick sections out of the fetched Terms (Markdown) ───────────────────────────────────────
// Used by the short "What you need to know" panels on the booking page, so the words shown there
// are the ones the admin published, not a copy typed into the page.
const plain = (t) => String(t || "")
  .replace(/\*\*([^*]+)\*\*/g, "$1")
  .replace(/\*([^*\s][^*]*)\*/g, "$1")
  .replace(/\[([^\]]+)\]\([^)\s]+\)/g, "$1")
  .trim();
const stripNumber = (t) => String(t || "").replace(/^\d+[.)]\s*/, "");
const norm = (t) => stripNumber(plain(t)).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");

// Markdown → [{ title, text }] — one entry per ## / ### heading; text is plain (no Markdown marks).
export const parseTermsSections = (content) => {
  const sections = [];
  let cur = null;
  String(content || "").replace(/\r\n/g, "\n").split("\n").forEach((raw) => {
    const line = raw.trim();
    const h = line.match(/^#{2,3}\s+(.*)$/);
    if (h) { cur = { title: stripNumber(plain(h[1])), paras: [], items: [] }; sections.push(cur); return; }
    if (/^#\s/.test(line)) { cur = null; return; }
    if (!cur || !line || /^(---|\*\*\*)$/.test(line)) return;
    const li = line.match(/^(?:[-*]|\d+[.)])\s+(.*)$/);
    if (li) cur.items.push(plain(li[1])); else cur.paras.push(plain(line));
  });
  return sections.map((x) => ({ title: x.title, text: x.paras.length ? x.paras.join(" ") : x.items.join("; ") }));
};

// The section whose title matches `ref` (ignores case, "&" vs "and", punctuation, numbering and
// extra words like "(Self-Drive Rentals)"). null when the admin's text has no such section.
export const findTermsSection = (sections, ref) => {
  const n = norm(ref);
  if (!n) return null;
  return sections.find((x) => norm(x.title) === n)
    || sections.find((x) => { const t = norm(x.title); return n.length >= 6 && t.length >= 6 && (t.includes(n) || n.includes(t)); })
    || null;
};

// First sentence(s) of a section, about `max` characters, for a short summary.
export const summarizeTerms = (text, max = 320) => {
  const sentences = String(text || "").replace(/([a-z)"'][.!?])\s+(?=[A-Z])/g, "$1\u0001").split("\u0001");
  let out = "";
  for (const sentence of sentences) {
    if (out && (out + " " + sentence).length > max) break;
    out = out ? out + " " + sentence : sentence;
  }
  if (out.length > max + 80) out = out.slice(0, max).replace(/\s+\S*$/, "") + "…";
  return out;
};
