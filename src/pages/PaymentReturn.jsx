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

  const [status,  setStatus]  = useState("checking"); // checking | paid | failed | notfound
  const [message, setMessage] = useState("Verifying your payment, please wait…");

  useEffect(() => {
    if (!paymentID) {
      setStatus("notfound");
      setMessage("No payment ID found. Please check your bookings page.");
      return;
    }

    let attempts = 0;
    const MAX    = 10;
    const DELAY  = 3000; // 3 seconds between polls

    const poll = async () => {
      try {
        const token = localStorage.getItem("arl_token");
        const res   = await fetch(
          `${process.env.REACT_APP_API_URL}/paymongo/status/${paymentID}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();

        if (data.status === "paid") {
          setStatus("paid");
          setMessage("Payment confirmed! Redirecting to your bookings…");
          setTimeout(() => navigate("/my-bookings"), 2500);
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
          setTimeout(poll, DELAY);
        } else {
          // Timed out — still might process via webhook
          setStatus("pending");
          setMessage("Payment is still being processed. Check your bookings page in a few minutes.");
        }
      } catch (err) {
        console.error("Payment status check error:", err);
        attempts++;
        if (attempts < MAX) {
          setTimeout(poll, DELAY);
        } else {
          setStatus("failed");
          setMessage("Could not verify payment. Please check your bookings page.");
        }
      }
    };

    // Give the webhook ~3 seconds to fire before first poll
    const timer = setTimeout(poll, 3000);
    return () => clearTimeout(timer);
  }, [paymentID, navigate]);

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
        <span className="text-4xl">⏳</span>
      </div>
    ),
    notfound: (
      <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
        <span className="text-4xl">🔍</span>
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
            {status === "failed" && (
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
