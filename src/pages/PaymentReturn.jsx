import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";

// ─────────────────────────────────────────────────────────────────────────────
// PaymentReturn.jsx
//
// PayMongo redirects the customer here after they finish checkout.
// We poll our backend to confirm payment status, then redirect accordingly.
//
// URL: /payment-return?paymentID=PAY-xxxx
// ─────────────────────────────────────────────────────────────────────────────

export default function PaymentReturn() {
  const [params]  = useSearchParams();
  const navigate  = useNavigate();
  const paymentID = params.get("paymentID");
  // A penalty payment returns with penaltyCheckoutID instead of paymentID.
  const penaltyCheckoutID = params.get("penaltyCheckoutID");
  const isPenalty = !!penaltyCheckoutID;
  const refID = penaltyCheckoutID || paymentID;

  const [status,  setStatus]  = useState("checking"); // checking | paid | failed | notfound
  const [message, setMessage] = useState("Verifying your payment, please wait…");

  useEffect(() => {
    if (!refID) {
      setStatus("notfound");
      setMessage("No payment ID found. Please check your bookings page.");
      return;
    }

    let attempts   = 0;
    const MAX      = 20;
    const DELAY    = 3000; // 3 seconds between polls (20 * 3s = 60s, plus the initial 3s delay below)
    let cancelled  = false;   // flips true on unmount so the recursive poll() stops rescheduling itself
    let pendingTimer = null;  // whichever setTimeout is currently in flight (initial delay, poll, or the redirect)

    const poll = async () => {
      if (cancelled) return;
      try {
        const token = localStorage.getItem("arl_token");
        const res   = await fetch(
          isPenalty
            ? `${process.env.REACT_APP_API_URL}/paymongo/penalty/status/${penaltyCheckoutID}`
            : `${process.env.REACT_APP_API_URL}/paymongo/status/${paymentID}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();

        if (cancelled) return; // component unmounted while the fetch was in flight

        if (data.status === "paid") {
          setStatus("paid");
          setMessage(isPenalty ? "Penalty payment received! Redirecting to your booking history…" : "Payment confirmed! Redirecting to your bookings…");
          pendingTimer = setTimeout(() => { if (!cancelled) navigate(isPenalty ? "/my-bookings?tab=history" : "/my-bookings"); }, 2500);
          return;
        }

        if (data.status === "failed") {
          setStatus("failed");
          setMessage("Payment failed or was cancelled. Please try again.");
          return;
        }

        // Still pending — keep polling
        attempts++;
        if (attempts < MAX) {
          pendingTimer = setTimeout(poll, DELAY);
        } else {
          // Timed out — still might process via webhook
          setStatus("pending");
          setMessage("Payment is still being processed. Check your bookings page in a few minutes.");
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Payment status check error:", err);
        attempts++;
        if (attempts < MAX) {
          pendingTimer = setTimeout(poll, DELAY);
        } else {
          setStatus("failed");
          setMessage("Could not verify payment. Please check your bookings page.");
        }
      }
    };

    // Give the webhook ~3 seconds to fire before first poll
    pendingTimer = setTimeout(poll, 3000);
    return () => {
      cancelled = true;
      clearTimeout(pendingTimer);
    };
  }, [refID, isPenalty, paymentID, penaltyCheckoutID, navigate]);

  const icons = {
    checking: (
      <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4 animate-pulse">
        <svg className="w-10 h-10 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
        </svg>
      </div>
    ),
    paid: (
      <div className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center mx-auto mb-4">
        <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
    ),
    failed: (
      <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
        <svg className="w-10 h-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
    ),
    pending: (
      <div className="w-20 h-20 rounded-full bg-yellow-100 flex items-center justify-center mx-auto mb-4">
        <svg className="w-10 h-10 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
      </div>
    ),
    notfound: (
      <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
        <svg className="w-10 h-10 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
      </div>
    ),
  };

  const titles = {
    checking: "Verifying Payment",
    paid:     "Payment Confirmed!",
    failed:   "Payment Failed",
    pending:  "Payment Pending",
    notfound: "Not Found",
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-arl-primary/10 to-arl-secondary/10 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl p-10 max-w-md w-full text-center">
        {icons[status] || icons.checking}

        <h2 className="text-2xl font-bold text-arl-dark mb-3">
          {titles[status] || "Please Wait"}
        </h2>

        <p className="text-gray-500 text-sm mb-6">{message}</p>

        {/* Show dots animation while checking */}
        {status === "checking" && (
          <div className="flex justify-center gap-1 mb-6">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-2 h-2 rounded-full bg-arl-primary animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        )}

        {/* Action buttons for terminal states */}
        {(status === "failed" || status === "pending" || status === "notfound") && (
          <div className="flex flex-col gap-3">
            <button
              onClick={() => navigate("/my-bookings")}
              className="w-full bg-arl-primary text-white py-3 rounded-full font-semibold hover:bg-opacity-90 transition">
              View My Bookings
            </button>
            {status === "failed" && !isPenalty && (
              <button
                onClick={() => navigate("/booking")}
                className="w-full border-2 border-arl-cta text-arl-cta py-3 rounded-full font-semibold hover:bg-arl-cta hover:text-white transition">
                Try Again
              </button>
            )}
          </div>
        )}

        {status === "paid" && (
          <p className="text-xs text-gray-400">Redirecting automatically…</p>
        )}
      </div>
    </div>
  );
}