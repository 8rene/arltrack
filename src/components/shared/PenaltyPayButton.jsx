import { useState } from "react";
import { createPortal } from "react-dom";

// ─────────────────────────────────────────────────────────────────────────────
// PenaltyPayButton
//
// "Pay ₱X penalty" → pick GCash / Maya / QR Ph → redirect to PayMongo checkout.
// Used on the My Bookings history card and on Booking Details. The amount shown
// is for display only: the server recomputes what is owed when it creates the
// checkout and never trusts a figure from the browser.
// ─────────────────────────────────────────────────────────────────────────────

const METHODS = [
  { key: "gcash", label: "GCash" },
  { key: "maya",  label: "Maya" },
  { key: "qrph",  label: "QR Ph" },
];
const MIN_ONLINE = 20; // PayMongo minimum charge, in pesos
const peso = (n) => `₱${Number(n || 0).toLocaleString()}`;

export default function PenaltyPayButton({ bookingID, amount, className = "", label }) {
  const [open, setOpen]     = useState(false);
  const [method, setMethod] = useState("gcash");
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState("");

  if (!(amount > 0)) return null;
  const tooSmall = amount < MIN_ONLINE;

  const pay = async () => {
    setBusy(true); setError("");
    try {
      const token = localStorage.getItem("arl_token");
      const res = await fetch(`${process.env.REACT_APP_API_URL}/paymongo/penalty/create-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bookingID, paymentMethod: method }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Could not open the payment page.");
      if (json.alreadyPaid) { window.location.href = "/my-bookings?tab=history"; return; }
      window.location.href = json.checkoutUrl;
    } catch (e) {
      setError(e.message || "Could not connect to PayMongo. Please try again.");
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => { setError(""); setOpen(true); }}
        className={className || "text-xs font-bold text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-lg transition"}>
        {label || `Pay ${peso(amount)} penalty`}
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => !busy && setOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-arl-dark">Pay penalty online</h3>
                <p className="text-xs text-gray-400 mt-0.5">Booking {bookingID}</p>
              </div>
              <button onClick={() => !busy && setOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
            </div>

            <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 flex items-baseline justify-between">
              <span className="text-sm text-gray-600">Amount due</span>
              <span className="text-lg font-bold text-red-600">{peso(amount)}</span>
            </div>

            {tooSmall ? (
              <p className="text-xs text-gray-500">Online payment needs at least ₱20.00. Please pay this small balance in store.</p>
            ) : (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Pay with</p>
                <div className="grid grid-cols-3 gap-2">
                  {METHODS.map((m) => (
                    <button key={m.key} onClick={() => setMethod(m.key)} disabled={busy}
                      className={`py-2 rounded-xl text-sm font-semibold border transition ${
                        method === m.key ? "bg-arl-primary text-white border-arl-primary" : "text-gray-600 border-gray-200 hover:bg-gray-50"
                      }`}>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button onClick={() => setOpen(false)} disabled={busy}
                className="flex-1 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
              <button onClick={pay} disabled={busy || tooSmall}
                className="flex-1 py-2 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed">
                {busy ? "Opening…" : `Pay ${peso(amount)}`}
              </button>
            </div>
            <p className="text-[11px] text-gray-400 text-center">You'll be taken to PayMongo's secure checkout.</p>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}