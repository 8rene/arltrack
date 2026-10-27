import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import PenaltyPayButton from "../components/shared/PenaltyPayButton";
import PaymentsReceiptsCard from "../components/booking/PaymentsReceiptsCard";
import InspectionCard from "../components/booking/InspectionCard";
import DiscountSummary, { DiscountHeldPill, discountPriceOff } from "../components/booking/DiscountSummary";

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

// Flat codingWarnings [{ city, plateLastDigit, ruleID, dayOfWeek, startTime, endTime }, …]
// -> grouped by city: [{ city, plateLastDigit, text: "Mon 7:00 AM - 10:00 AM, 3:00 PM - 7:00 PM; Fri 7:00 AM - 10:00 AM" }]
const DAY_SHORT = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]; // dayOfWeek 1-7, Monday = 1
// "7:00 AM" / "08:00 PM" -> minutes from midnight (used only to sort the hours; unknown -> 0)
const timeMins = (t) => {
  const m = String(t || "").trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return 0;
  return ((Number(m[1]) % 12) + (m[3].toUpperCase() === "PM" ? 12 : 0)) * 60 + Number(m[2]);
};
const groupCodingByCity = (list) => {
  const cities = [];
  (Array.isArray(list) ? list : []).forEach((w) => {
    if (!w) return;
    const city = w.city || "";
    let c = cities.find((x) => x.city === city);
    if (!c) { c = { city, plateLastDigit: w.plateLastDigit, days: [] }; cities.push(c); }
    let d = c.days.find((x) => x.dow === Number(w.dayOfWeek));
    if (!d) { d = { dow: Number(w.dayOfWeek), wins: [] }; c.days.push(d); }
    d.wins.push({ m: timeMins(w.startTime), t: `${String(w.startTime || "").trim()} - ${String(w.endTime || "").trim()}` });
  });
  return cities.map((c) => ({
    city: c.city,
    plateLastDigit: c.plateLastDigit,
    text: c.days
      .sort((a, b) => a.dow - b.dow)
      .map((d) => `${DAY_SHORT[d.dow] || "Day " + d.dow} ${d.wins.sort((a, b) => a.m - b.m).map((x) => x.t).join(", ")}`)
      .join("; "),
  }));
};

const STATUS_STYLE = {
  "to pay":  "bg-yellow-100 text-yellow-700 border-yellow-200",
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

// Same statuses/labels as MyBookings.jsx's RefundStatusBadge, so a booking
// reads consistently whether the customer is looking at the list or this
// details page.
const REFUND_STYLE = {
  Pending:  "bg-yellow-100 text-yellow-700 border-yellow-300",
  Approved: "bg-blue-100 text-blue-700 border-blue-300",
  Refunded: "bg-green-100 text-green-700 border-green-300",
  Rejected: "bg-red-100 text-red-600 border-red-300",
  Failed:   "bg-red-100 text-red-600 border-red-300",
};
const REFUND_LABEL = {
  Pending:  "Refund: Pending",
  Approved: "Refund: Approved",
  Refunded: "Refund: Refunded",
  Rejected: "Refund: Rejected",
  Failed:   "Refund: Failed",
};

const Badge = ({ text, styleMap }) => (
  <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold capitalize border ${styleMap[(text || "").toLowerCase()] || "bg-gray-100 text-gray-500 border-gray-200"}`}>
    {text || "—"}
  </span>
);

// hint: small note under the value (e.g. "5% of rental") so the label stays on one line.
// wide: spans the whole row (long addresses). Times keep "06:00 AM" together instead of
// breaking mid-number; only IDs (mono) are allowed to break anywhere.
const DR = ({ label, value, mono = false, hint = "", wide = false }) => {
  if (!value) return null;
  const text = typeof value === "string" ? value.replace(/\s(AM|PM)\b/g, "\u00a0$1") : value;
  return (
    <div className={wide ? "col-span-2 sm:col-span-3" : ""}>
      <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">{label}</p>
      <p className={`text-sm text-gray-700 font-medium ${mono ? "font-mono break-all" : "break-words"}`}>{text}</p>
      {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
};

// Unpaid penalties for this booking, with the Pay button.
//
// Data comes from GET /paymongo/penalty/outstanding (the same figures createPenaltyPaymentLink charges), so what is shown
// here always equals what PayMongo is asked for. The server decides everything: the ₱1,000 rule (the online payment fee
// only applies to a penalty HIGHER than ₱1,000), what the held deposit / discount credit covers (no fee), and the fee on
// the rest. This card only displays those numbers: nothing is worked out in the browser.
//   unpaid        every unpaid penalty on this booking
//   covered       what the held deposit (+ discount credit) pays at settlement, no fee
//   onlineDue     the penalty money left to pay online
//   fee           the online payment fee on onlineDue (0 when the penalty is ₱1,000 or less)
//   payTotal      onlineDue + fee: what the checkout charges
// A failed load never blocks the page.
const PenaltiesBox = ({ bookingID }) => {
  const [info, setInfo] = useState(null); // null = loading, false = failed to load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = localStorage.getItem("arl_token");
        const res = await fetch(`${process.env.REACT_APP_API_URL}/paymongo/penalty/outstanding`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error();
        const json = await res.json();
        if (!cancelled) setInfo(json.data || false);
      } catch {
        if (!cancelled) setInfo(false);
      }
    })();
    return () => { cancelled = true; };
  }, [bookingID]);

  if (!info) return null; // loading or failed: never block the page

  const unpaid    = Number(info.byBooking?.[bookingID]) || 0;
  if (!(unpaid > 0)) return null; // nothing owed on this booking
  const covered   = Number(info.coveredByBooking?.[bookingID]) || 0;
  const onlineDue = Number(info.onlineDueByBooking?.[bookingID]) || 0;
  const fee       = Number(info.feeByBooking?.[bookingID]) || 0;
  const payTotal  = Number(info.payableByBooking?.[bookingID]) || 0;
  const pending   = !!info.pendingByBooking?.[bookingID];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-black text-arl-primary uppercase tracking-widest">Penalties</p>
      </div>

      {/* Something to pay ONLINE */}
      {onlineDue > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-red-700">
              {pending ? "Penalty payment pending" : "Penalty payment required"}
            </p>
            <span className="text-xl font-black text-red-600">{peso(payTotal)}</span>
          </div>
          {fee > 0 && (
            <p className="text-xs text-red-600 mt-0.5">
              {peso(onlineDue)} penalty + {peso(fee)} online payment fee
            </p>
          )}
          <p className="text-xs text-red-500 mt-0.5 mb-3">
            {pending
              ? "You started an online payment but it isn't finished yet. Tap below to complete it."
              : "Pay online with GCash, Maya or QR Ph. You can't make a new booking until it is paid."}
            {covered > 0 && ` Your deposit and discount credit pay ${peso(covered)} of these penalties when the booking is settled, with no fee. Only the part they don't cover is paid online.`}
          </p>
          <PenaltyPayButton bookingID={bookingID} amount={payTotal} penaltyAmount={onlineDue} gatewayFee={fee}
            label={pending ? `Finish payment · ${peso(payTotal)}` : `Pay ${peso(payTotal)} now`}
            className="w-full text-sm font-bold text-white bg-red-600 hover:bg-red-700 px-4 py-2.5 rounded-xl transition" />
        </div>
      )}

      {/* The held deposit / credit pays all of it: nothing to pay online, so no online payment fee */}
      {onlineDue <= 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-sm font-bold text-blue-700">Covered by your security deposit</p>
          <p className="text-xs text-blue-600 mt-0.5">
            {peso(unpaid)} of penalties will be deducted from your deposit (and discount credit, if any) when the booking is settled. There is nothing to pay online, so no online payment fee applies.
          </p>
        </div>
      )}
    </div>
  );
};


export default function BookingDetailsPage() {
  const { bookingID } = useParams();
  const navigate = useNavigate();

  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  // Whichever refund request (any status) exists for this booking's
  // payment — same source/shape as MyBookings.jsx uses, fetched separately
  // since /bookings/:bookingID/details doesn't include refund info.
  const [refund, setRefund]   = useState(null);
  const [payingNow, setPayingNow] = useState(false);
  const [payError, setPayError]   = useState("");

  // "Complete Payment" used to open the STORED checkout URL directly. That URL can
  // belong to a session that was already paid (webhook slow) or has expired, so the
  // customer could be sent to a dead page — or pay twice. Going through create-link
  // makes the server ask PayMongo first: already paid → just confirm it; expired →
  // a fresh session; still open → the same link.
  const handleCompletePayment = async () => {
    const pay = data?.payment;
    if (!pay?.paymentID) return;
    setPayingNow(true); setPayError("");
    try {
      const token = localStorage.getItem("arl_token");
      // Balance phase = the deposit is already paid on a Partial booking and the balance isn't (not only while a balance
      // checkout is open): the balance is required now, so "Pay balance" must be able to start it from scratch.
      const depositPaidNow = ["paid", "approved"].includes(String(pay.status || "").toLowerCase());
      const isPartialPay   = String(pay.methodOfPayment || "").toLowerCase() === "partial";
      const phase = (pay.balanceStatus === "pending" || (depositPaidNow && isPartialPay && pay.balanceStatus !== "paid")) ? "balance" : "deposit";
      const res = await fetch(`${process.env.REACT_APP_API_URL}/paymongo/create-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          bookingID,
          paymentID: pay.paymentID,
          description: `ARL Track Booking #${bookingID}${phase === "balance" ? " (Balance)" : ""}`,
          paymentMethod: pay.paymentMethod,
          phase,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to open payment.");
      if (json.alreadyPaid) { navigate(`/payment-return?paymentID=${pay.paymentID}&bookingID=${bookingID}`); return; }
      window.location.href = json.checkoutUrl + `?paymentID=${pay.paymentID}`;
    } catch (err) {
      setPayError(err.message || "Could not connect to PayMongo. Please try again.");
      setPayingNow(false);
    }
  };

  // fetchDetails is re-created every render; this only needs to re-run when the booking changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

      if (json.payment?.paymentID) {
        try {
          const rRes = await fetch(`${process.env.REACT_APP_API_URL}/paymongo/refunds/mine`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (rRes.ok) {
            const refunds = await rRes.json();
            const match = (Array.isArray(refunds) ? refunds : []).find(
              (r) => r.paymentID === json.payment.paymentID
            );
            setRefund(match || null);
          }
        } catch {
          // Non-fatal — the page still works without the refund badge.
        }
      }
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
  // The remaining balance is REQUIRED and paid online before pickup (staff block the pickup until it is settled).
  const balanceRequired = !!payment && booking?.status === "upcoming"
    && ["paid", "approved"].includes(String(payment.status || "").toLowerCase())
    && String(payment.methodOfPayment || "").toLowerCase() === "partial"
    && String(payment.balanceStatus || "").toLowerCase() !== "paid"
    && Number(payment.balanceDue) > 0;
  const balancePending = balanceRequired && String(payment.balanceStatus || "").toLowerCase() === "pending";
  // pickupLocation/dropoffLocation come back as { address, lat, lng } objects
  // (or null) — never plain strings, so we must pull .address out here
  // rather than handing the whole object to <DR>, which would crash trying
  // to render an object as a React child.
  const pickupAddress  = pickupLocation?.address  || null;
  const dropoffAddress = dropoffLocation?.address || null;
  // Number Coding warnings saved on the booking (flat list) — grouped by city for display; empty for old bookings.
  const codingGroups = groupCodingByCity(data.codingWarnings);

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
                : <div className="w-full h-full flex items-center justify-center text-xs font-semibold text-gray-300 uppercase tracking-wide">No photo</div>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <h1 className="font-black text-lg sm:text-xl text-arl-primary">{booking.carName || "Unknown Vehicle"}</h1>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">{booking.bookingID}</p>
                  {booking.plateNumber ? (
                    <p className="text-xs text-gray-500 mt-1">
                      Plate no. <span className="font-mono font-bold text-gray-800 tracking-wider">{booking.plateNumber}</span>
                    </p>
                  ) : booking.plateRevealsAt ? (
                    <p className="text-xs text-gray-400 mt-1">Plate number is shown {fmtDT(booking.plateRevealsAt)} (2 hours before pickup).</p>
                  ) : booking.plateWithDriver ? (
                    <p className="text-xs text-gray-400 mt-1">Your driver will share the plate number when they're on the way to you.</p>
                  ) : null}
                </div>
                {/* Header badge priority: a matched refund request's own
                    status (most specific) → the payment's own "refunded"
                    state (covers refunds that didn't go through the
                    customer refund-request flow) → the raw booking status
                    as a last resort, which otherwise stays stuck on
                    "upcoming" forever once refunded. */}
                {refund
                  ? <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold border ${REFUND_STYLE[refund.status] || "bg-gray-100 text-gray-500 border-gray-200"}`}>
                      {REFUND_LABEL[refund.status] || `Refund: ${refund.status}`}
                    </span>
                  : (payment?.status || "").toLowerCase() === "refunded"
                  ? <Badge text="Refunded" styleMap={PAYMENT_STYLE} />
                  : <Badge text={booking.status} styleMap={STATUS_STYLE} />}
              </div>
              {/* Admin's reason for rejecting the refund — already captured
                  and saved on the refundRequests doc (rejectReason), just
                  never displayed anywhere in the customer app before. */}
              {refund?.status === "Rejected" && refund?.rejectReason && (
                <div className="mt-2 flex items-start gap-1.5 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  <span className="text-red-400 text-xs leading-none mt-0.5">✕</span>
                  <p className="text-xs text-red-600 leading-snug">
                    <span className="font-semibold">Refund rejected:</span> {refund.rejectReason}
                  </p>
                </div>
              )}
              {refund?.status === "Rejected" && ["upcoming", "ongoing"].includes(String(booking.status || "").toLowerCase()) && (
                <p className="mt-2 text-xs text-gray-600 leading-snug">
                  <span className="font-semibold">Your booking will continue as scheduled.</span>{" "}
                  This refund can't be requested again — please contact support if you need help.
                </p>
              )}
              <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500">
                {booking.serviceType && <span>{booking.serviceType}</span>}
                <span>{booking.totalDays} day(s)</span>
                <span>{booking.modeOfDriving || "With Chauffeur"}</span>
              </div>
              {/* discountPriceOff: only a discount that really lowers the price (see DiscountSummary.jsx). Credit held for
                  the customer is returned after the trip, so the total stays and a note says so. */}
              {discountPriceOff(payment) > 0 ? (
                <div className="flex items-baseline gap-2 mt-2 flex-wrap">
                  <p className="text-lg font-black text-arl-cta">{peso(booking.totalFee - discountPriceOff(payment))}</p>
                  <p className="text-sm text-gray-400 line-through">{peso(booking.totalFee)}</p>
                </div>
              ) : (
                <p className="text-lg font-black text-arl-cta mt-2">{peso(booking.totalFee)}</p>
              )}
              <DiscountHeldPill discount={payment?.discount} />
            </div>
          </div>
        </div>

        {/* Penalties first: if the customer owes something they must see it (and the Pay button) without scrolling */}
        {payment && <PenaltiesBox bookingID={bookingID} />}

        {/* Trip details */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-black text-arl-primary uppercase tracking-widest mb-3">Trip Details</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
            <DR label="Start"          value={fmtDT(booking.startDateTime)} />
            <DR label="End"            value={fmtDT(booking.endDateTime)} />
            <DR label="Days"           value={`${booking.totalDays} day(s)`} />
            <DR label="Service"        value={booking.serviceType} />
            <DR label="Drive Mode"     value={booking.modeOfDriving} />
            {/* Drop-off always mirrors pickup — show one row when they are the same place */}
            {pickupAddress && pickupAddress === dropoffAddress
              ? <DR label="Pickup & Drop-off" value={pickupAddress} wide />
              : (<>
                  <DR label="Pickup"   value={pickupAddress} />
                  <DR label="Drop-off" value={dropoffAddress} />
                </>)}
          </div>
        </div>

        {/* Agreement & Number Coding — what was accepted and the coding warnings found when the booking was made */}
        {(data.terms || codingGroups.length > 0) && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs font-black text-arl-primary uppercase tracking-widest mb-3">Agreement &amp; Number Coding</p>
            {data.terms && (
              <div className="mb-3">
                <DR label="Terms & Conditions accepted"
                    value={`${fmtDT(data.terms.acceptedAt)}${data.terms.version ? ` · version ${data.terms.version}` : ""}`} />
                <a href={`/terms?v=${encodeURIComponent(data.terms.viewID)}`} target="_blank" rel="noopener noreferrer"
                   className="inline-block mt-1 text-xs font-semibold text-arl-secondary hover:underline">
                  View the exact text you accepted →
                </a>
              </div>
            )}
            {codingGroups.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-bold text-amber-800 mb-2">
                  Number Coding applies to your plate
                  {codingGroups[0].plateLastDigit !== undefined && codingGroups[0].plateLastDigit !== null ? ` (ending in ${codingGroups[0].plateLastDigit})` : ""}
                </p>
                <ul className="space-y-1">
                  {codingGroups.map((g) => (
                    <li key={g.city || "unknown"} className="text-xs text-amber-800">
                      <span className="font-semibold">{g.city || "Your location"}</span>: {g.text}
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-amber-700 mt-2">
                  Coding schedules can change (holidays, MMDA advisories) — please confirm with MMDA or your city,
                  and plan your trip around the restricted hours.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Vehicle inspection — for bookings with no driver (self-drive, or a chauffeur booking nobody is assigned to).
            When a driver handles the trip, the driver sees the inspection instead. The server decides what may be
            shown; the card hides itself when there is nothing to show. */}
        <InspectionCard bookingID={booking.bookingID || bookingID} />

       
        {/* Payment */}
        {payment ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-black text-arl-primary uppercase tracking-widest">Payment Details</p>
              <Badge text={payment.status} styleMap={PAYMENT_STYLE} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 mb-4">
              <DR label="Payment ID"        value={payment.paymentID} mono />
              <DR label="Total Amount"      value={peso(payment.amount)} />
              <DR label="Rental Fee"        value={peso(payment.rentalFee)} />
              <DR label="Service Fee" hint={payment.serviceFeeRate > 0 ? `${payment.serviceFeeRate}% of rental` : ""} value={peso(payment.serviceFee)} />
              <DR label="Gateway Fee" hint={payment.gatewayFeeRate > 0 ? `${payment.gatewayFeeRate}% of total` : ""} value={peso(payment.gatewayFee)} />
              <DR label="Extra Fee"         value={payment.extraFee ? peso(payment.extraFee) : null} />
              <DR label="Driver's Fee"      value={payment.driversFee ? peso(payment.driversFee) : null} />
              <DR label="Balance Due"       value={peso(payment.balanceDue)} />
              <DR label="Payment Method"    value={payment.methodOfPayment} />
              <DR label="Reference No."     value={payment.referenceNumber} mono />
            </div>
            {/* An older backend sends no `discount`: show the old single figure. */}
            {payment.discount
              ? <DiscountSummary discount={payment.discount} className="mb-4" />
              : payment.discountAmount > 0 && <DiscountSummary discount={{ status: "legacy", total: payment.discountAmount }} className="mb-4" />}
            {balanceRequired && (
              <div className="mt-3">
                <div className={`rounded-xl border px-3 py-2 mb-3 ${balancePending ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200"}`}>
                  <p className={`text-sm font-bold ${balancePending ? "text-amber-700" : "text-red-700"}`}>
                    {balancePending ? "Balance payment pending" : "Balance payment required"} — {peso(payment.balanceDue)}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {balancePending
                      ? "You started paying online but it isn't finished yet. Finish it before pickup."
                      : "Pay the remaining balance online before pickup — we can't release the vehicle until it's paid."}
                  </p>
                </div>
                <button type="button" onClick={handleCompletePayment} disabled={payingNow}
                  className="inline-block px-5 py-2.5 bg-red-600 text-white rounded-full text-sm font-bold hover:bg-red-700 disabled:opacity-60 transition">
                  {payingNow ? "Opening…" : balancePending ? "Finish balance payment →" : "Pay balance now →"}
                </button>
                {payError && <p className="text-xs text-red-500 mt-2">{payError}</p>}
              </div>
            )}
            {!balanceRequired && payment.checkoutUrl && (payment.status === "pending" || payment.balanceStatus === "pending") && (
              <>
                <button type="button" onClick={handleCompletePayment} disabled={payingNow}
                  className="inline-block px-5 py-2.5 bg-arl-cta text-white rounded-full text-sm font-bold hover:bg-arl-secondary disabled:opacity-60 transition">
                  {payingNow ? "Opening…" : payment.balanceStatus === "pending" ? "Complete Balance Payment →" : "Complete Payment →"}
                </button>
                {payError && <p className="text-xs text-red-500 mt-2">{payError}</p>}
              </>
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

        {/* every payment / refund with its receipt, plus the booking statement (same documents the ARL staff print) */}
        {payment && <PaymentsReceiptsCard bookingID={booking.bookingID || bookingID} />}

      </div>
    </div>
  );
}