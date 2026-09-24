import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../context/ToastContext";

// ── Date formatter — handles Firestore Timestamps, JS Dates, ISO strings ──
const fmtDT = (val) => {
  if (!val) return "—";
  if (val?.toDate) return val.toDate().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  if (val?._seconds !== undefined) return new Date(val._seconds * 1000).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const d = new Date(val);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

// Small inline calendar glyph for the Upcoming tab — used instead of the
// 📅 emoji, which on some Android builds renders with a baked-in day
// number fixed into the glyph itself (this is what was showing up as a
// stray "17" floating near the tab bar). currentColor lets it pick up
// the tab's active/inactive text color automatically.
const CalendarGlyph = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
    <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
    <line x1="3" y1="9.5" x2="21" y2="9.5" />
    <line x1="8" y1="2.5" x2="8" y2="6.5" />
    <line x1="16" y1="2.5" x2="16" y2="6.5" />
  </svg>
);

const peso = (v) => `₱${Number(v || 0).toLocaleString()}`;

// ── Payment status config (badge shown on each booking card) ──
const PAYMENT_STATUS_CONFIG = {
  due:       { label: "Payment Due",       bg: "bg-yellow-100", text: "text-yellow-700", border: "border-yellow-300", icon: "⏳" },
  partial:   { label: "Partial",           bg: "bg-orange-100", text: "text-orange-700", border: "border-orange-300", icon: "🟠" },
  paid:      { label: "Fully Paid",        bg: "bg-green-100",  text: "text-green-700",  border: "border-green-300",  icon: "✅" },
  refunded:  { label: "Refunded",          bg: "bg-blue-100",   text: "text-blue-700",   border: "border-blue-300",   icon: "↩️" },
  failed:    { label: "Payment Failed",    bg: "bg-red-100",    text: "text-red-600",    border: "border-red-300",    icon: "❌" },
  cancelled: { label: "Payment Cancelled", bg: "bg-gray-100",   text: "text-gray-500",   border: "border-gray-300",   icon: "🚫" },
};

// Mirrors admin's computeAmounts() in payments.service.js, so the customer
// sees the same paid/balance math the admin dashboard uses. Uses the real
// two-phase payment state (status/balanceStatus/payNow — see
// utils/bookings/bookingStatus.util.js on the backend) rather than
// guessing amountPaid purely from methodOfPayment, which used to claim a
// booking was "Partial — balance due" even when the deposit itself hadn't
// actually been paid yet (methodOfPayment is set at booking creation,
// before any charge happens).
const getPaymentInfo = (payment) => {
  if (!payment) return { key: "due", extra: "", amountPaid: 0 };

  // Preferred: the backend's own derivation (getUserBookings → derivePaymentStatus),
  // built on the same shared math the admin dashboard uses — it knows about a
  // balance paid online, one staff collected in person, cash-confirmed payments
  // and staff discounts, none of which this file can see from here. The local
  // logic below is only a fallback for a response that doesn't carry it.
  const derived = payment.paymentStatus;
  if (derived && derived.key) {
    return {
      key: derived.key,
      extra: derived.key === "partial" ? peso(derived.balance) : "",
      amountPaid: Number(derived.amountPaid) || 0,
    };
  }

  const amount = Number(payment.amount) || 0;
  const status = (payment.status || "").toLowerCase();
  const method = (payment.methodOfPayment || "").toLowerCase();

  if (status === "refunded") return { key: "refunded", extra: "", amountPaid: 0 };
  if (status === "failed" || status === "rejected") return { key: "failed", extra: "", amountPaid: 0 };
  if (status === "cancelled") return { key: "cancelled", extra: "", amountPaid: 0 };
  if (status !== "paid" && status !== "approved") return { key: "due", extra: "", amountPaid: 0 }; // deposit not paid yet
  if (payment.balanceCollected) return { key: "paid", extra: "", amountPaid: amount }; // staff collected the rest in person

  if (method.includes("full")) return { key: "paid", extra: "", amountPaid: amount };

  // Partial: deposit has cleared (status === "paid") — the only remaining
  // question is whether the balance phase has cleared too.
  const balanceStatus = (payment.balanceStatus || "").toLowerCase();
  if (balanceStatus === "paid") return { key: "paid", extra: "", amountPaid: amount };

  // payNow is the actual amount charged for the deposit (stored since this
  // two-phase flow was added); Math.floor(amount/2) is only a fallback for
  // any older payment record saved before that field existed.
  const amountPaid = Number(payment.payNow) || Math.floor(amount / 2);
  return { key: "partial", extra: peso(amount - amountPaid), amountPaid };
};

const PaymentStatusBadge = ({ payment }) => {
  const { key, extra } = getPaymentInfo(payment);
  const cfg = PAYMENT_STATUS_CONFIG[key];
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {cfg.icon} {cfg.label}{extra ? ` — ${extra} due` : ""}
    </span>
  );
};

// ── Skeleton ──
const Skeleton = () => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-pulse">
    <div className="flex gap-4 p-5">
      <div className="w-28 h-20 bg-gray-200 rounded-xl flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-gray-200 rounded w-1/3" />
        <div className="h-3 bg-gray-100 rounded w-1/2" />
        <div className="h-3 bg-gray-100 rounded w-2/3" />
      </div>
    </div>
  </div>
);

// ── Detail row ──
const DR = ({ label, value, mono = false }) =>
  value ? (
    <div>
      <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">{label}</p>
      <p className={`text-sm text-gray-700 font-medium break-all ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  ) : null;

// ── Refund reasons + status config ──
const REFUND_REASONS = [
  "Cancelled trip",
  "Overcharged",
  "Service issue",
  "Duplicate payment",
  "Other",
];

// ── Refund request status config (badge shown once a refund is requested) ──
const REFUND_STATUS_CONFIG = {
  Pending:  { label: "Refund: Pending",  bg: "bg-yellow-100", text: "text-yellow-700", border: "border-yellow-300", icon: "⏳" },
  Approved: { label: "Refund: Approved", bg: "bg-blue-100",   text: "text-blue-700",   border: "border-blue-300",   icon: "🔵" },
  Refunded: { label: "Refund: Refunded", bg: "bg-green-100",  text: "text-green-700",  border: "border-green-300",  icon: "✅" },
  Rejected: { label: "Refund: Rejected", bg: "bg-red-100",    text: "text-red-600",    border: "border-red-300",    icon: "❌" },
  Failed:   { label: "Refund: Failed",   bg: "bg-red-100",    text: "text-red-600",    border: "border-red-300",    icon: "❌" },
};

const RefundStatusBadge = ({ status }) => {
  const cfg = REFUND_STATUS_CONFIG[status];
  if (!cfg) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
};

// ── Refund modal ──
const RefundModal = ({ booking, onConfirm, onClose, loading }) => {
  const [reason, setReason] = useState(REFUND_REASONS[0]);
  const [notes, setNotes]   = useState("");
  const { amountPaid } = getPaymentInfo(booking.payment);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-lg font-black text-gray-800 mb-1">Request Refund</h3>
        <p className="text-sm text-gray-500 mb-4">
          {booking.carName} — {peso(amountPaid)} paid
        </p>

        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Reason
        </label>
        <select
          className="w-full border border-gray-200 rounded-xl p-3 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-arl-primary/30"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        >
          {REFUND_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>

        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Additional notes (optional)
        </label>
        <textarea
          className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-arl-primary/30"
          rows={3}
          placeholder="Tell us more about your refund request..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        <p className="text-xs text-gray-400 mt-3">
          The refund covers everything you've paid for this booking ({peso(amountPaid)}) and the booking will be cancelled once it's approved. Our team will review it and you'll be notified once it's processed.
        </p>

        <div className="flex gap-3 mt-4">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason, notes)}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-arl-cta text-white text-sm font-bold hover:bg-arl-secondary transition disabled:opacity-60">
            {loading ? "Sending…" : "Confirm & Send"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Booking card ──
const BookingCard = ({ booking, user, existingRefund, hasActiveRefund = false, onRefundRequested, onCancelToPay }) => {
  const navigate = useNavigate();
  const [expanded,        setExpanded]        = useState(false);

  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refunding,       setRefunding]       = useState(false);
  const [payingNow,       setPayingNow]       = useState(false);
  const { showToast } = useToast();

  const {
    bookingID, carName, carImage, carBodyType,
    serviceType, duration, startDateTime, endDateTime,
    totalDays, totalFee,
    status, cancellationReason,
    modeOfDriving, destination, passengerName, createdAt,
    payment, carID,
  } = booking;

  const p = payment || {};


  const handleRebook = () => {
    navigate('/booking', {
      state: {
        carID,
        serviceType,
        duration,
        destination,
        driveType: modeOfDriving === 'With Chauffeur' ? 'chauffeur' : 'self-drive',
        // Start/End date & time are intentionally left out — those should
        // always be freshly chosen, not copied from the old booking.
      },
    });
  };

  const handleRefundRequest = async (reason, notes) => {
    if (!p.paymentID) return;
    setRefunding(true);
    try {
      const token = localStorage.getItem("arl_token");
      const res   = await fetch(`${process.env.REACT_APP_API_URL}/paymongo/refunds`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ paymentID: p.paymentID, reason, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to send refund request.");
      setShowRefundModal(false);
      onRefundRequested(); // re-fetch refund requests in the parent
    } catch (err) {
      showToast(err.message);
    } finally {
      setRefunding(false);
    }
  };

  // Deposit already paid, but this is a Partial booking still awaiting its
  // balance? Then "Pay Now" needs to charge the balance instead — this is
  // what decides which one the button below actually does.
  const depositPaid   = p.status === "paid";
  const isPartialPlan = String(p.methodOfPayment || "").toLowerCase() === "partial";
  const balanceDue    = depositPaid && isPartialPlan && p.balanceStatus !== "paid" && !p.balanceCollected;
  // The deposit alone confirms a booking ("upcoming"); the balance is normally
  // settled at pickup. Paying it early online is an OPTIONAL convenience.
  const canPayBalanceOnline = status === "upcoming" && balanceDue && !hasActiveRefund;

  // "Pay Now" / "Pay Balance" — for "to pay" bookings only. Same call
  // Booking.jsx's own handlePaymongoCheckout makes right after creating the
  // booking; this is just the version reachable later from My Bookings, for
  // a checkout that got abandoned/closed the first time (deposit), or the
  // separate balance step once the deposit has already cleared.
  const handlePayNow = async () => {
    if (!p.paymentID) return;
    setPayingNow(true);
    try {
      const token = localStorage.getItem("arl_token");
      const res   = await fetch(`${process.env.REACT_APP_API_URL}/paymongo/create-link`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({
          bookingID,
          paymentID:     p.paymentID,
          description:   `ARL Track Booking #${bookingID}${balanceDue ? " (Balance)" : ""}`,
          paymentMethod: p.paymentMethod,
          phase:         balanceDue ? "balance" : "deposit",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to create payment link.");
      // The server found the earlier attempt was actually paid (e.g. the webhook
      // was slow) and settled it — nothing to charge. Show the confirmation page
      // instead of opening a second checkout.
      if (data.alreadyPaid) {
        navigate(`/payment-return?paymentID=${p.paymentID}&bookingID=${bookingID}`);
        return;
      }
      window.location.href = data.checkoutUrl + `?paymentID=${p.paymentID}`;
    } catch (err) {
      showToast(err.message || "Could not connect to PayMongo. Please try again.");
      setPayingNow(false);
    }
  };

  return (
    <>
      {showRefundModal && (
        <RefundModal
          booking={booking}
          onConfirm={handleRefundRequest}
          onClose={() => setShowRefundModal(false)}
          loading={refunding}
        />
      )}

      <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden hover:shadow-md transition-all duration-300 ${
        status === "cancelled" ? "border-red-100" : status === "completed" ? "border-blue-100" : status === "ongoing" ? "border-purple-100" : status === "to pay" ? "border-yellow-200" : "border-gray-100"
      }`}>

        {/* ── Main row ── */}
        <div className="flex gap-3 sm:gap-4 p-4 sm:p-5">
          {/* Car image */}
          <div className="flex-shrink-0 w-20 h-16 sm:w-28 sm:h-20 rounded-xl overflow-hidden bg-gray-100">
            {carImage
              ? <img src={carImage} alt={carName} className="w-full h-full object-cover"
                  onError={(e) => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }} />
              : null}
            <div className="w-full h-full items-center justify-center text-2xl sm:text-3xl text-gray-300"
              style={{ display: carImage ? "none" : "flex" }}>🚗</div>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap mb-1">
              <div className="min-w-0">
                <h4 className="font-black text-arl-primary text-base sm:text-lg leading-tight break-words">{carName}</h4>
                {carBodyType && <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">{carBodyType}</p>}
              </div>
              <div className="flex flex-col items-end gap-1">
                {/* When there's a refund request on file, its own badge
                    (Pending/Approved/Refunded/Rejected/Failed) is more
                    specific than the payment badge, so it takes over instead
                    of showing two badges that both just say "Refunded". */}
                {existingRefund
                  ? <RefundStatusBadge status={existingRefund.status} />
                  : <PaymentStatusBadge payment={payment} />}
              </div>
            </div>

            <div className="space-y-0.5 mb-2">
              <p className="text-xs text-gray-500">
                <span className="font-semibold text-gray-600">Service:</span> {serviceType || "—"}
              </p>
              <p className="text-xs text-gray-500">
                <span className="font-semibold text-gray-600">Start:</span> {fmtDT(startDateTime)}
              </p>
              <p className="text-xs text-orange-700 font-bold bg-orange-50 border border-orange-200 rounded-md px-1.5 py-0.5 inline-block">
                ⏰ End: {fmtDT(endDateTime)}
              </p>
              <p className="text-xs text-gray-400">
                <span className="font-semibold text-gray-500">Booked on:</span> {fmtDT(createdAt)}
              </p>
              {cancellationReason && (
                <p className="text-xs text-red-500 font-medium mt-1">
                  Reason: {cancellationReason}
                </p>
              )}
              {/* Admin's reason for rejecting/failing the refund — was
                  already being captured and saved (rejectReason on the
                  refundRequests doc, set via the admin Reject action) but
                  never surfaced anywhere in the customer app before. Styled
                  as a small callout instead of loose text so it reads as a
                  distinct note rather than crowding the badge above. */}
              {existingRefund?.status === "Rejected" && existingRefund?.rejectReason && (
                <div className="mt-1.5 flex items-start gap-1.5 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5">
                  <span className="text-red-400 text-xs leading-none mt-0.5">✕</span>
                  <p className="text-xs text-red-600 leading-snug">
                    <span className="font-semibold">Refund rejected:</span> {existingRefund.rejectReason}
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-3">
                {p.discountAmount > 0 ? (
                  <span className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-lg sm:text-xl font-black text-arl-cta">{peso((p.amount || totalFee) - p.discountAmount)}</span>
                    <span className="text-sm text-gray-400 line-through">{peso(p.amount || totalFee)}</span>
                  </span>
                ) : (
                  <span className="text-lg sm:text-xl font-black text-arl-cta">{peso(p.amount || totalFee)}</span>
                )}
                <span className="text-xs text-gray-400">{totalDays} day(s)</span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Pay Now / Pay Balance — the primary action for a "to
                    pay" booking. Re-opens PayMongo checkout for whichever
                    phase is still outstanding (deposit, or the balance for
                    a Partial booking whose deposit already cleared) — same
                    call Booking.jsx makes right after creating it, for
                    when the customer closed/abandoned that checkout tab. */}
                {status === "to pay" && (
                  <button
                    onClick={handlePayNow}
                    disabled={payingNow}
                    className="text-xs font-bold text-white bg-arl-cta hover:bg-opacity-90 disabled:opacity-60 px-3 py-1.5 rounded-lg transition">
                    {payingNow ? "Redirecting…" : balanceDue ? "💳 Pay Balance" : "💳 Pay Now"}
                  </button>
                )}

                {/* Optional: pay the remaining balance online now instead of at
                    pickup. Only for a confirmed (upcoming) Partial booking. */}
                {canPayBalanceOnline && (
                  <button
                    onClick={handlePayNow}
                    disabled={payingNow}
                    className="text-xs font-bold text-arl-cta border border-arl-cta/40 hover:bg-arl-cta/10 disabled:opacity-60 px-3 py-1.5 rounded-lg transition">
                    {payingNow ? "Redirecting…" : "💳 Pay Balance Online (optional)"}
                  </button>
                )}

                {/* Cancel — only while NOTHING has been charged yet. Once a
                    Partial booking's deposit clears, it's in the same boat
                    as an "upcoming" booking (real money on it already) —
                    goes through Request Refund (admin review) instead. */}
                {status === "to pay" && !depositPaid && (
                  <button
                    onClick={() => onCancelToPay(bookingID)}
                    className="text-xs font-bold text-gray-500 border border-gray-200 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition">
                    ✕ Cancel
                  </button>
                )}

                {/* Cancel button removed — Request Refund is now the only
                    way to back out of an upcoming booking. Cancelling
                    directly used to skip the admin review a refund goes
                    through, which didn't make sense once refunds became
                    the standard path. */}

                {/* Request Refund — "upcoming" (fully paid) bookings only.
                    A "to pay" booking never qualifies anymore, even once
                    its deposit has cleared (Partial) — see requestRefund()
                    in refundRequest.controller.js: a booking that isn't
                    fully confirmed yet isn't something to refund, it's
                    something to finish paying or to cancel outright. No
                    active refund request already in flight. A past
                    Rejected/Failed request doesn't block this — the
                    customer can simply try again. */}
                { (status === "upcoming" && ["paid", "approved"].includes(String(p.status || "").toLowerCase())) && !hasActiveRefund && (
                  <button
                    onClick={() => setShowRefundModal(true)}
                    className="text-xs font-bold text-orange-600 border border-orange-200 hover:bg-orange-50 px-3 py-1.5 rounded-lg transition">
                    💸 Request Refund
                  </button>
                )}

                {/* Booking Details — pins + trip info for every booking */}
                <button
                  onClick={() => navigate(`/booking/${bookingID}/details`)}
                  className="text-xs font-bold text-purple-600 border border-purple-200 hover:bg-purple-50 px-3 py-1.5 rounded-lg transition">
                  📋 Details
                </button>

                {/* Rebook — for cancelled and completed */}
                {(status === "cancelled" || status === "completed") && (
                  <button
                    onClick={handleRebook}
                    className="text-xs font-bold text-arl-secondary border border-arl-secondary/30 hover:bg-arl-secondary/10 px-3 py-1.5 rounded-lg transition">
                    🔁 Rebook
                  </button>
                )}

                <button onClick={() => setExpanded(!expanded)}
                  className="text-xs font-bold text-arl-secondary hover:text-arl-primary transition flex items-center gap-1">
                  {expanded ? "Hide overview ▲" : "View overview ▼"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Expanded details ── */}
        {expanded && (
          <div className="border-t border-gray-100">
            <div className="px-5 py-4 bg-gray-50">
              <p className="text-xs font-black text-arl-primary uppercase tracking-widest mb-3">🚗 Booking Details</p>
              <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
                <DR label="Booking ID"  value={bookingID} mono />
                <DR label="Booked On"   value={fmtDT(createdAt)} />
                <DR label="Start"       value={fmtDT(startDateTime)} />
                <DR label="End"         value={fmtDT(endDateTime)} />
                <DR label="Duration"    value={duration ? `${duration}/day` : null} />
                <DR label="Days"        value={`${totalDays} day(s)`} />
                <DR label="Mode"        value={modeOfDriving} />
                <DR label="Destination" value={destination} />
                <DR label="Passenger"   value={passengerName} />
                <DR label="Service"     value={serviceType} />
              </div>
            </div>

            {payment ? (
              <div className="px-5 py-4 bg-blue-50/50 border-t border-blue-100">
                <p className="text-xs font-black text-arl-primary uppercase tracking-widest mb-3">💳 Payment Details</p>
                <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 mb-4">
                  <DR label="Payment ID"        value={p.paymentID} mono />
                  <DR label="Total Amount"      value={
                    p.discountAmount > 0
                      ? <span className="flex items-baseline gap-1.5 flex-wrap">
                          <span>{peso((p.amount || 0) - p.discountAmount)}</span>
                          <span className="text-xs text-gray-400 line-through font-normal">{peso(p.amount)}</span>
                        </span>
                      : peso(p.amount)
                  } />
                  <DR label="Deposit Paid"      value={peso(p.depositFee)} />
                  <DR label="Rental Fee"        value={peso(p.rentalFee)} />
                  <DR label="Service Fee"       value={peso(p.serviceFee)} />
                  <DR label="Gateway Fee"       value={peso(p.gatewayFee)} />
                  <DR label="Extra Fee"         value={peso(p.extraFee)} />
                  <DR label="Drivers Fee"       value={p.driversFee ? peso(p.driversFee) : null} />
                  <DR label="Discount Applied"  value={p.discountAmount ? peso(p.discountAmount) : null} />
                  <DR label="Balance on Pickup" value={peso(Math.max(0, (p.amount || 0) - (p.depositFee || 0)))} />
                  <DR label="Payment Method"    value={p.methodOfPayment || p.paymentMethod} />
                  <DR label="Reference No."     value={p.referenceNumber} mono />
                  <DR label="Payment Status"    value={p.status} />
                </div>
                {p.proofUrl && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Proof of Payment</p>
                    <img src={p.proofUrl} alt="Payment proof"
                      className="max-h-48 w-auto rounded-xl border border-gray-200 object-contain bg-white"
                      onError={(e) => { e.target.style.display = "none"; }}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="px-5 py-4 bg-gray-50 border-t border-gray-100">
                <p className="text-xs text-gray-400">No payment record found for this booking.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};

// ── Empty state ──
// A live calendar icon for the "upcoming" empty state — replaces the 📅
// emoji, which renders with a hard-coded, platform-specific date baked
// into the glyph itself (fixed at "17" on this Android build, something
// else elsewhere) rather than the actual current date, which read as a
// stuck/wrong date on-screen.
const LiveCalendarIcon = () => {
  const now   = new Date();
  const month = now.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  const day   = now.getDate();
  return (
    <div className="inline-flex flex-col w-16 rounded-lg overflow-hidden border border-gray-200 shadow-sm mx-auto">
      <div className="bg-red-500 text-white text-[10px] font-bold tracking-wide text-center py-0.5">
        {month}
      </div>
      <div className="bg-white text-gray-800 text-2xl font-black text-center py-1.5">
        {day}
      </div>
    </div>
  );
};

const EMPTY_STATE_COPY = {
  toPay:    { icon: "💳", title: "Nothing to pay",         body: "Unpaid bookings awaiting payment will show up here." },
  upcoming: { icon: "📅", title: "No upcoming bookings",  body: "Book a ride to see it here." },
  ongoing:  { icon: "🚗", title: "No trip in progress",    body: "Your active trip will show up here once it starts." },
  refunds:  { icon: "💸", title: "No refund requests",     body: "Bookings you've requested a refund for will show up here." },
  history:  { icon: "📜", title: "No booking history yet", body: "Your completed and cancelled bookings will appear here." },
};

const EmptyState = ({ tab }) => {
  const { icon, title, body } = EMPTY_STATE_COPY[tab] || EMPTY_STATE_COPY.upcoming;
  return (
    <div className="text-center py-20">
      <div className="mb-4">
        {tab === "upcoming" ? <LiveCalendarIcon /> : <p className="text-5xl">{icon}</p>}
      </div>
      <p className="text-gray-500 font-bold text-lg">{title}</p>
      <p className="text-gray-400 text-sm mt-1">{body}</p>
    </div>
  );
};

// ── My Bookings page ──
const MyBookings = ({ user }) => {
  const navigate   = useNavigate();
  const [bookings,  setBookings]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");
  // ?tab=to-pay lets PayMongo's "cancel" link (and notifications) land straight
  // on the unpaid booking with its Pay Now button.
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const t = new URLSearchParams(window.location.search).get("tab");
      const map = { "to-pay": "toPay", toPay: "toPay", upcoming: "upcoming", ongoing: "ongoing", refunds: "refunds", history: "history" };
      return map[t] || "upcoming";
    } catch { return "upcoming"; }
  });

  const [refundRequests, setRefundRequests] = useState([]);

  useEffect(() => {
    if (!user?.userID) { navigate("/"); return; }
    fetchBookings();
    fetchRefundRequests();
  }, [user]);

  const fetchBookings = async () => {
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("arl_token");
      const res   = await fetch(`${process.env.REACT_APP_API_URL}/bookings/user/${user.userID}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch bookings.");
      const data = await res.json();
      setBookings(data);
    } catch (err) {
      setError("Could not load bookings. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const fetchRefundRequests = async () => {
    try {
      const token = localStorage.getItem("arl_token");
      const res   = await fetch(`${process.env.REACT_APP_API_URL}/paymongo/refunds/mine`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setRefundRequests(data.data || []);
    } catch {
      // non-critical — refund badges/buttons just won't reflect the latest state
    }
  };

  // Cancel a still-unpaid "to pay" booking. Nothing's been charged yet, so
  // (unlike an already-paid "upcoming" booking) this goes straight through
  // rather than via the Request Refund/admin-review flow.
  const handleCancelToPay = async (bookingID) => {
    if (!window.confirm("Cancel this booking? This can't be undone.")) return;
    try {
      const token = localStorage.getItem("arl_token");
      const res   = await fetch(`${process.env.REACT_APP_API_URL}/bookings/${bookingID}/cancel`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ reason: "Cancelled by customer before payment." }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to cancel booking.");
      fetchBookings();
    } catch (err) {
      setError(err.message || "Failed to cancel booking.");
    }
  };

  // Only these statuses count as "there's already an active request" —
  // Rejected/Failed lets the customer try requesting again.
  const findActiveRefund = (paymentID) =>
    refundRequests.find((r) => r.paymentID === paymentID && ["Pending", "Approved", "Refunded"].includes(r.status));

  // Any refund request at all, regardless of status — used for the Refunds
  // tab (a true history/tracking view) and for the status badge, which
  // should still show e.g. "Rejected" even though that status doesn't
  // block a retry.
  const findAnyRefund = (paymentID) =>
    refundRequests.find((r) => r.paymentID === paymentID);

  // Whether a booking has an active or completed refund story right now
  // (Pending/Approved/Refunded, or a payment already marked "refunded"
  // outright). This is the single source of truth for both tabs below —
  // Upcoming and Refunds are meant to be mutually exclusive:
  //   - true  → belongs in Refunds, not Upcoming (something's actually
  //             in motion or done; that trip isn't happening as planned).
  //   - false → belongs in Upcoming, not Refunds. This also covers a
  //             booking whose ONLY refund history is Rejected/Failed —
  //             nothing about the booking actually changed, so it goes
  //             back to being a normal upcoming trip and drops out of
  //             Refunds entirely, until/unless a new request is filed
  //             (which flips this back to true and moves it over again).
  const hasActiveRefundStory = (b) =>
    (b.payment?.status || "").toLowerCase() === "refunded" ||
    !!(b.payment?.paymentID && findActiveRefund(b.payment.paymentID));
  const toPay     = bookings.filter(b => b.status === "to pay");
  const upcoming  = bookings.filter(b => b.status === "upcoming" && !hasActiveRefundStory(b));
  const ongoing   = bookings.filter(b => b.status === "ongoing");
  const refunded  = bookings.filter(hasActiveRefundStory);
  const history   = bookings.filter(b => ["cancelled", "completed"].includes(b.status));
  const displayed =
    activeTab === "toPay"    ? toPay    :
    activeTab === "upcoming" ? upcoming :
    activeTab === "ongoing"  ? ongoing  :
    activeTab === "refunds"  ? refunded :
    history;

  return (
    <div className="min-h-screen bg-gray-50 pt-24 pb-16">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">

        <div className="mb-8">
          <h1 className="text-3xl font-black text-arl-primary tracking-tight">My Bookings</h1>
          <p className="text-gray-500 text-sm mt-1">Track all your rides and payment details</p>
        </div>

        <div className="flex overflow-x-auto scrollbar-hide bg-white rounded-2xl border border-gray-100 shadow-sm p-1.5 mb-6 gap-1 -mx-1 px-1 sm:mx-0">
          {[
            { key: "toPay",    label: "To Pay",   count: toPay.length,    icon: "💳" },
            { key: "upcoming", label: "Upcoming", count: upcoming.length, icon: <CalendarGlyph /> },
            { key: "ongoing",  label: "Ongoing",  count: ongoing.length,  icon: "🚗" },
            { key: "refunds",  label: "Refunds",  count: refunded.length, icon: "💸" },
            { key: "history",  label: "History",  count: history.length,  icon: "📜" },
          ].map(({ key, label, count, icon }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`shrink-0 flex items-center gap-1.5 whitespace-nowrap py-2.5 px-3 sm:px-4 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                activeTab === key ? "bg-arl-primary text-white shadow" : "text-gray-500 hover:text-arl-primary hover:bg-gray-50"
              }`}>
              <span>{icon}</span>
              <span>{label}</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] sm:text-xs font-black ${
                activeTab === key ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
              }`}>
                {loading ? "…" : count}
              </span>
            </button>
          ))}
        </div>

        <p className="text-xs text-gray-400 mb-4 px-1">
          {activeTab === "toPay"
            ? "To Pay — Complete payment within 12 hours or the booking is auto-cancelled."
            : activeTab === "upcoming"
            ? "Upcoming — You can cancel bookings before they start."
            : activeTab === "ongoing"
            ? "Your trip is currently active."
            : activeTab === "refunds"
            ? "Bookings with an active or past refund request."
            : "Cancelled & Completed — Use Rebook to book the same car again."}
        </p>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
            ⚠️ {error}
          </div>
        )}

        <div className="space-y-4">
          {loading
            ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} />)
            : displayed.length > 0
            ? displayed.map(b => (
                <BookingCard
                  key={b.bookingID}
                  booking={b}
                  user={user}
                  existingRefund={b.payment?.paymentID ? findAnyRefund(b.payment.paymentID) : null}
                  hasActiveRefund={!!(b.payment?.paymentID && findActiveRefund(b.payment.paymentID))}
                  onRefundRequested={fetchRefundRequests}
                  onCancelToPay={handleCancelToPay}
                />
              ))
            : <EmptyState tab={activeTab} />
          }
        </div>

        {!loading && (
          <div className="text-center mt-8">
            <button onClick={fetchBookings}
              className="text-sm text-arl-secondary hover:text-arl-primary font-semibold transition">
              🔄 Refresh
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MyBookings;
