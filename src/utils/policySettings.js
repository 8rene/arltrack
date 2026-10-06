// policySettings.js
// The admin-managed numbers the Terms & Conditions / Booking Guidelines quote
// (deposit amount, service + gateway fee percentages, the full-refund window),
// fetched from GET /api/policy so those pages never show a stale hardcoded figure.
// Falls back to the defaults if the request fails, so the pages always render.
import { useEffect, useState } from "react";

const BASE_URL = `${process.env.REACT_APP_API_URL}/policy`;
const DEFAULTS = { depositAmount: 1000, serviceFeePercent: 5, gatewayFeePercent: 5, fullRefundHours: 48 };

let cache = null;
let cacheExpiresAt = 0;
const CACHE_MS = 60_000;

const toPolicy = (d = {}) => {
  const n = (v, f) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : f);
  const depositAmount = n(d.depositAmount, DEFAULTS.depositAmount);
  return {
    depositAmount,
    depositText: `₱${depositAmount.toLocaleString("en-PH")}`,
    serviceFeePercent: n(d.serviceFeePercent, DEFAULTS.serviceFeePercent),
    gatewayFeePercent: n(d.gatewayFeePercent, DEFAULTS.gatewayFeePercent),
    fullRefundHours: n(d.fullRefundHours, DEFAULTS.fullRefundHours),
  };
};

// Never rejects — resolves to the defaults on any failure.
export const fetchPolicySettings = async () => {
  if (cache && Date.now() < cacheExpiresAt) return cache;
  try {
    const res = await fetch(BASE_URL);
    if (!res.ok) throw new Error(`status ${res.status}`);
    cache = toPolicy(await res.json());
    cacheExpiresAt = Date.now() + CACHE_MS;
    return cache;
  } catch (err) {
    console.error("[policySettings] fetch failed:", err.message);
    return toPolicy(DEFAULTS);
  }
};

export const usePolicySettings = () => {
  const [policy, setPolicy] = useState(() => cache || toPolicy(DEFAULTS));
  useEffect(() => {
    let alive = true;
    fetchPolicySettings().then((p) => { if (alive) setPolicy(p); });
    return () => { alive = false; };
  }, []);
  return policy;
};
