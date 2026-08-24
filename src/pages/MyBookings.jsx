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
// sees the same paid/balance math the admin dashboard uses.
const getPaymentInfo = (payment) => {
  if (!payment) return { key: "due", extra: "", amountPaid: 0 };

  const amount     = Number(payment.amount) || 0;
  const depositFee = Number(payment.depositFee) || 0;
  const method     = (payment.methodOfPayment || "").toLowerCase();
  const status     = (payment.status || "").toLowerCase();

  if (status === "refunded") return { key: "refunded", extra: "", amountPaid: 0 };
  if (status === "failed" || status === "rejected") return { key: "failed", extra: "", amountPaid: 0 };
  if (status === "cancelled") return { key: "cancelled", extra: "", amountPaid: 0 };

  let amountPaid;
  if (method.includes("full")) {
    amountPaid = amount;
  } else if (method.includes("down")) {
    amountPaid = Math.round(amount / 2);
  } else if (method.includes("deposit") || method.includes("partial")) {
    amountPaid = depositFee;
  } else if (status === "paid" || status === "approved") {
    amountPaid = amount;
  } else {
    amountPaid = depositFee;
  }

  const balance = Math.max(0, amount - amountPaid);
  if (amountPaid > 0 && balance <= 0) return { key: "paid", extra: "", amountPaid };
  if (amountPaid > 0) return { key: "partial", extra: peso(balance), amountPaid };
  return { key: "due", extra: "", amountPaid: 0 };
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
          Your refund request will be reviewed by our team. You'll be notified once it's processed.
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

// ── Cancel modal ──
const CancelModal = ({ booking, onConfirm, onClose, loading }) => {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h3 className="text-lg font-black text-gray-800 mb-1">Cancel Booking</h3>
        <p className="text-sm text-gray-500 mb-4">
          Are you sure you want to cancel booking <span className="font-mono font-bold text-arl-primary">{booking.bookingID}</span>?
        </p>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Reason (optional)
        </label>
        <textarea
          className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-arl-primary/30"
          rows={3}
          placeholder="E.g. Change of plans..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="flex gap-3 mt-4">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition">
            Keep Booking
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition disabled:opacity-60">
            {loading ? "Cancelling…" : "Yes, Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Booking card ──
const BookingCard = ({ booking, user, onCancelled, existingRefund, hasActiveRefund = false, onRefundRequested }) => {
  const navigate = useNavigate();
  const [expanded,        setExpanded]        = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelling,      setCancelling]      = useState(false);

  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refunding,       setRefunding]       = useState(false);
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

  const handleCancel = async (reason) => {
    setCancelling(true);
    try {
      const token = localStorage.getItem("arl_token");
      const res   = await fetch(`${process.env.REACT_APP_API_URL}/bookings/${bookingID}/cancel`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ reason: reason || "Cancelled by user." }), // userID from JWT on backend
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Cancel failed.");
      }
      setShowCancelModal(false);
      onCancelled(bookingID, reason || "Cancelled by user.");
    } catch (err) {
      showToast(err.message);
    } finally {
      setCancelling(false);
    }
  };

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

  return (
    <>
      {showCancelModal && (
        <CancelModal
          booking={booking}
          onConfirm={handleCancel}
          onClose={() => setShowCancelModal(false)}
          loading={cancelling}
        />
      )}

      {showRefundModal && (
        <RefundModal
          booking={booking}
          onConfirm={handleRefundRequest}
          onClose={() => setShowRefundModal(false)}
          loading={refunding}
        />
      )}

      <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden hover:shadow-md transition-all duration-300 ${
        status === "cancelled" ? "border-red-100" : status === "completed" ? "border-blue-100" : status === "ongoing" ? "border-purple-100" : "border-gray-100"
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
              <p className="text-xs text-gray-500">
                <span className="font-semibold text-gray-600">End:</span> {fmtDT(endDateTime)}
              </p>
              <p className="text-xs text-gray-400">
                <span className="font-semibold text-gray-500">Booked on:</span> {fmtDT(createdAt)}
              </p>
              {cancellationReason && (
                <p className="text-xs text-red-500 font-medium mt-1">
                  Reason: {cancellationReason}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-3">
                <span className="text-lg sm:text-xl font-black text-arl-cta">{peso(p.amount || totalFee)}</span>
                <span className="text-xs text-gray-400">{totalDays} day(s)</span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Cancel — only upcoming bookings can be cancelled (matches
                    backend rule), and only if no refund request has ever
                    been filed on this booking — once a refund's been
                    requested (even a Rejected one), Cancel is off the table;
                    the customer would need to go through Request Refund
                    again instead. */}
                { status === "upcoming" && !existingRefund && (
                  <button
                    onClick={() => setShowCancelModal(true)}
                    className="text-xs font-bold text-red-500 border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-lg transition">
                    ✕ Cancel
                  </button>
                )}

                {/* Request Refund — only for upcoming bookings that are fully
                    paid, with no active refund request. A past Rejected/Failed
                    request doesn't block this — the customer can try again. */}
                { status === "upcoming" && p.status === "paid" && !hasActiveRefund && (
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
                  <DR label="Total Amount"      value={peso(p.amount)} />
                  <DR label="Deposit Paid"      value={peso(p.depositFee)} />
                  <DR label="Rental Fee"        value={peso(p.rentalFee)} />
                  <DR label="Service Fee"       value={peso(p.serviceFee)} />
                  <DR label="Gateway Fee"       value={peso(p.gatewayFee)} />
                  <DR label="Extra Fee"         value={peso(p.extraFee)} />
                  <DR label="Drivers Fee"       value={p.driversFee ? peso(p.driversFee) : null} />
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
const EMPTY_STATE_COPY = {
  upcoming: { icon: "📅", title: "No upcoming bookings",  body: "Book a ride to see it here." },
  ongoing:  { icon: "🚗", title: "No trip in progress",    body: "Your active trip will show up here once it starts." },
  refunds:  { icon: "💸", title: "No refund requests",     body: "Bookings you've requested a refund for will show up here." },
  history:  { icon: "📜", title: "No booking history yet", body: "Your completed and cancelled bookings will appear here." },
};

const EmptyState = ({ tab }) => {
  const { icon, title, body } = EMPTY_STATE_COPY[tab] || EMPTY_STATE_COPY.upcoming;
  return (
    <div className="text-center py-20">
      <p className="text-5xl mb-4">{icon}</p>
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
  const [activeTab, setActiveTab] = useState("upcoming");

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

  // Optimistically update cancelled booking in local state
  const handleCancelled = (bookingID, reason) => {
    setBookings((prev) =>
      prev.map((b) =>
        b.bookingID === bookingID
          ? { ...b, status: "cancelled", cancellationReason: reason }
          : b
      )
    );
  };

  // A booking with any refund request on file — even a Rejected one —
  // shouldn't linger in Upcoming. Once a refund's been requested, it belongs
  // in the Refunds tab (that's where Cancel is hidden and Request Refund
  // lives too), not mixed in with bookings nothing has happened to yet.
  const upcoming  = bookings.filter(b => b.status === "upcoming" && !(b.payment?.paymentID && findAnyRefund(b.payment.paymentID)));
  const ongoing   = bookings.filter(b => b.status === "ongoing");
  // Refunds tab: only bookings that already have a refund request on file
  // (any status). Paid bookings that are still eligible but haven't been
  // requested yet stay in their normal tab (Upcoming/Ongoing/History) —
  // the "Request Refund" button lives there instead, so this tab is purely
  // a history/tracking view of requests that were actually made.
  const refunded  = bookings.filter(b => b.payment?.paymentID && findAnyRefund(b.payment.paymentID));
  const history   = bookings.filter(b => ["cancelled", "completed"].includes(b.status));
  const displayed =
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

        <div className="flex bg-white rounded-2xl border border-gray-100 shadow-sm p-1.5 mb-6 gap-1">
          {[
            { key: "upcoming", label: "Upcoming", count: upcoming.length, icon: "📅" },
            { key: "ongoing",  label: "Ongoing",  count: ongoing.length,  icon: "🚗" },
            { key: "refunds",  label: "Refunds",  count: refunded.length, icon: "💸" },
            { key: "history",  label: "History",  count: history.length,  icon: "📜" },
          ].map(({ key, label, count, icon }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`flex-1 min-w-0 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-2 py-2.5 sm:py-3 px-1 rounded-xl text-[11px] sm:text-sm font-bold transition-all ${
                activeTab === key ? "bg-arl-primary text-white shadow" : "text-gray-500 hover:text-arl-primary hover:bg-gray-50"
              }`}>
              <span className="flex items-center gap-1 min-w-0">
                <span>{icon}</span>
                <span className="truncate">{label}</span>
              </span>
              <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-black ${
                activeTab === key ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
              }`}>
                {loading ? "…" : count}
              </span>
            </button>
          ))}
        </div>

        <p className="text-xs text-gray-400 mb-4 px-1">
          {activeTab === "upcoming"
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
                  onCancelled={handleCancelled}
                  existingRefund={b.payment?.paymentID ? findAnyRefund(b.payment.paymentID) : null}
                  hasActiveRefund={!!(b.payment?.paymentID && findActiveRefund(b.payment.paymentID))}
                  onRefundRequested={fetchRefundRequests}
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
