import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

// ── Formatting helpers (same conventions as MyBookings.jsx) ──
const fmtDT = (val) => {
  if (!val) return "—";
  if (val?.toDate) return val.toDate().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  if (val?._seconds !== undefined) return new Date(val._seconds * 1000).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const d = new Date(val);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
const peso = (v) => `₱${Number(v || 0).toLocaleString()}`;

const STATUS_STYLE = {
  upcoming:  "bg-blue-100 text-blue-700 border-blue-200",
  ongoing:   "bg-purple-100 text-purple-700 border-purple-200",
  completed: "bg-green-100 text-green-700 border-green-200",
  cancelled: "bg-red-100 text-red-600 border-red-200",
  pending:   "bg-yellow-100 text-yellow-700 border-yellow-200",
};
const PAYMENT_STYLE = {
  paid:      "bg-green-100 text-green-700 border-green-200",
  pending:   "bg-yellow-100 text-yellow-700 border-yellow-200",
  partial:   "bg-orange-100 text-orange-700 border-orange-200",
  failed:    "bg-red-100 text-red-600 border-red-200",
  cancelled: "bg-gray-100 text-gray-500 border-gray-200",
  refunded:  "bg-blue-100 text-blue-700 border-blue-200",
};

const Badge = ({ text, styleMap }) => (
  <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold capitalize border ${styleMap[(text || "").toLowerCase()] || "bg-gray-100 text-gray-500 border-gray-200"}`}>
    {text || "—"}
  </span>
);

const DR = ({ label, value, mono = false }) =>
  value ? (
    <div>
      <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">{label}</p>
      <p className={`text-sm text-gray-700 font-medium break-all ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  ) : null;

export default function BookingDetailsPage() {
  const { bookingID } = useParams();
  const navigate = useNavigate();

  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  useEffect(() => { fetchDetails(); }, [bookingID]);

  const fetchDetails = async () => {
    setLoading(true); setError("");
    try {
      const token = localStorage.getItem("arl_token");
      const res = await fetch(`${process.env.REACT_APP_API_URL}/bookings/${bookingID}/details`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load booking details.");
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err.message || "Could not load this booking.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 pt-24 pb-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3" />
          <div className="h-40 bg-gray-200 rounded-2xl" />
          <div className="h-60 bg-gray-100 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 pt-24 pb-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center py-20">
          <p className="text-5xl mb-4">🚫</p>
          <p className="text-gray-600 font-semibold">{error || "Booking not found."}</p>
          <button onClick={() => navigate("/my-bookings")}
            className="mt-5 px-6 py-2.5 bg-arl-primary text-white rounded-full text-sm font-bold hover:bg-arl-secondary transition">
            ← Back to My Bookings
          </button>
        </div>
      </div>
    );
  }

  const { booking, pickupLocation, dropoffLocation, payment } = data;

  return (
    <div className="min-h-screen bg-gray-50 pt-24 pb-16">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 space-y-4 sm:space-y-6">

        <button onClick={() => navigate(-1)}
          className="text-sm font-semibold text-arl-secondary hover:text-arl-primary transition inline-flex items-center gap-1">
          ← Back
        </button>

        {/* Header card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex gap-4 p-5">
            <div className="w-28 h-20 sm:w-36 sm:h-24 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
              {booking.carImage
                ? <img src={booking.carImage} alt={booking.carName} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-3xl text-gray-300">🚗</div>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <h1 className="font-black text-lg sm:text-xl text-arl-primary">{booking.carName || "Unknown Vehicle"}</h1>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">{booking.bookingID}</p>
                </div>
                <Badge text={booking.status} styleMap={STATUS_STYLE} />
              </div>
              <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500">
                {booking.serviceType && <span>{booking.serviceType}</span>}
                <span>{booking.totalDays} day(s)</span>
                <span>{booking.modeOfDriving || "With Chauffeur"}</span>
              </div>
              <p className="text-lg font-black text-arl-cta mt-2">{peso(booking.totalFee)}</p>
            </div>
          </div>
        </div>

        {/* Trip details */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-black text-arl-primary uppercase tracking-widest mb-3">🗓️ Trip Details</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
            <DR label="Start"          value={fmtDT(booking.startDateTime)} />
            <DR label="End"            value={fmtDT(booking.endDateTime)} />
            <DR label="Days"           value={`${booking.totalDays} day(s)`} />
            <DR label="Service"        value={booking.serviceType} />
            <DR label="Drive Mode"     value={booking.modeOfDriving} />
            <DR label="Pickup"         value={pickupLocation} />
            <DR label="Drop-off"       value={dropoffLocation} />
          </div>
        </div>

        {/* Payment */}
        {payment ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-black text-arl-primary uppercase tracking-widest">💳 Payment Details</p>
              <Badge text={payment.status} styleMap={PAYMENT_STYLE} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 mb-4">
              <DR label="Payment ID"        value={payment.paymentID} mono />
              <DR label="Total Amount"      value={peso(payment.amount)} />
              <DR label="Deposit Paid"      value={peso(payment.depositFee)} />
              <DR label="Rental Fee"        value={peso(payment.rentalFee)} />
              <DR label="Service Fee"       value={peso(payment.serviceFee)} />
              <DR label="Gateway Fee"       value={peso(payment.gatewayFee)} />
              <DR label="Extra Fee"         value={payment.extraFee ? peso(payment.extraFee) : null} />
              <DR label="Driver's Fee"      value={payment.driversFee ? peso(payment.driversFee) : null} />
              <DR label="Balance Due"       value={peso(payment.balanceDue)} />
              <DR label="Payment Method"    value={payment.methodOfPayment} />
              <DR label="Reference No."     value={payment.referenceNumber} mono />
            </div>
            {payment.checkoutUrl && payment.status === "pending" && (
              <a href={payment.checkoutUrl} target="_blank" rel="noopener noreferrer"
                className="inline-block px-5 py-2.5 bg-arl-cta text-white rounded-full text-sm font-bold hover:bg-arl-secondary transition">
                Complete Payment →
              </a>
            )}
            {payment.proofUrl && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Proof of Payment</p>
                <img src={payment.proofUrl} alt="Payment proof"
                  className="max-h-48 w-auto rounded-xl border border-gray-200 object-contain bg-white"
                  onError={(e) => { e.target.style.display = "none"; }} />
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs text-gray-400">No payment record found for this booking.</p>
          </div>
        )}
      </div>
    </div>
  );
}
