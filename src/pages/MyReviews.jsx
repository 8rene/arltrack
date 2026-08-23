import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

// ── Helpers ───────────────────────────────────────────────────
const fmtDT = (val) => {
  if (!val) return "—";
  if (val?.toDate) return val.toDate().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" });
  if (val?._seconds !== undefined) return new Date(val._seconds * 1000).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const d = new Date(val);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

// ── Star picker ───────────────────────────────────────────────
const StarPicker = ({ value, onChange }) => (
  <div className="flex gap-1">
    {[1, 2, 3, 4, 5].map((s) => (
      <button
        key={s}
        type="button"
        onClick={() => onChange(s)}
        className={`text-3xl transition-transform hover:scale-110 ${s <= value ? "text-yellow-400" : "text-gray-200 hover:text-yellow-200"}`}
      >★</button>
    ))}
  </div>
);

// ── Star display ──────────────────────────────────────────────
const Stars = ({ rating }) => (
  <span>
    {[1,2,3,4,5].map(s => (
      <span key={s} className={s <= rating ? "text-yellow-400" : "text-gray-200"}>★</span>
    ))}
  </span>
);

// ── Review Modal ──────────────────────────────────────────────
const ReviewModal = ({ booking, existingReview, userID, onClose, onSaved }) => {
  const [rating,  setRating]  = useState(existingReview?.rating  || 0);
  const [comment, setComment] = useState(existingReview?.comment || "");
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");

  const handleSubmit = async () => {
    if (rating === 0) { setError("Please select a star rating."); return; }
    setSaving(true);
    setError("");
    try {
      const token = localStorage.getItem("arl_token");
      const method = existingReview ? "PUT" : "POST";
      const url    = existingReview
        ? `${process.env.REACT_APP_API_URL}/reviews/${existingReview.reviewID}`
        : `${process.env.REACT_APP_API_URL}/reviews/create`;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          // userID intentionally omitted — backend uses req.user.userID from JWT
          carID:     booking.carID,
          bookingID: booking.bookingID,
          rating,
          comment,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Failed to save review.");
      onSaved({ rating, comment, reviewID: existingReview?.reviewID || `new-${Date.now()}` });
      onClose();
    } catch (err) {
      setError(err.message || "Could not save review. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const STAR_LABELS = { 1: "Poor", 2: "Fair", 3: "Good", 4: "Very Good", 5: "Excellent" };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-4 p-6 border-b border-gray-100 bg-gray-50">
          <div className="w-14 h-11 rounded-xl overflow-hidden bg-gray-200 flex-shrink-0">
            {booking.carImage
              ? <img src={booking.carImage} alt={booking.carName} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-xl">🚗</div>
            }
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-black text-arl-primary truncate">{booking.carName || "Vehicle"}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Booking: {booking.bookingID}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 text-gray-400 text-lg">✕</button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          <div>
            <p className="text-sm font-semibold text-gray-600 mb-2">Your Rating</p>
            <StarPicker value={rating} onChange={setRating} />
            {rating > 0 && (
              <p className="text-sm text-yellow-600 font-bold mt-1">{STAR_LABELS[rating]}</p>
            )}
          </div>

          <div>
            <p className="text-sm font-semibold text-gray-600 mb-2">Your Review <span className="font-normal text-gray-400">(optional)</span></p>
            <textarea
              className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-arl-secondary"
              rows={4}
              placeholder="Share your experience with this vehicle…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={500}
            />
            <p className="text-xs text-gray-400 text-right mt-1">{comment.length}/500</p>
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-2">⛔ {error}</p>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition"
            >Cancel</button>
            <button
              onClick={handleSubmit}
              disabled={saving || rating === 0}
              className="flex-1 py-3 rounded-xl bg-arl-primary text-white text-sm font-bold hover:bg-arl-secondary transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : existingReview ? "Update Review" : "Submit Review"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Booking card ──────────────────────────────────────────────
const BookingReviewCard = ({ booking, userID, onReviewSaved }) => {
  const [showModal, setShowModal] = useState(false);
  const rev = booking.myReview;

  return (
    <>
      {showModal && (
        <ReviewModal
          booking={booking}
          existingReview={rev || null}
          userID={userID}
          onClose={() => setShowModal(false)}
          onSaved={(saved) => onReviewSaved(booking.bookingID, saved)}
        />
      )}

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition overflow-hidden">
        <div className="flex gap-3 sm:gap-4 p-4 sm:p-5">

          {/* Car image */}
          <div className="w-20 h-16 sm:w-28 sm:h-20 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
            {booking.carImage
              ? <img src={booking.carImage} alt={booking.carName} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-2xl sm:text-3xl text-gray-300">🚗</div>
            }
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-arl-primary truncate">{booking.carName || "Unknown Vehicle"}</h3>
                <p className="text-xs text-gray-400 mt-0.5 font-mono truncate">{booking.bookingID}</p>
              </div>
              <span className="text-xs text-gray-400 flex-shrink-0">{fmtDT(booking.startDateTime)}</span>
            </div>

            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {booking.bodyType && (
                <span className="px-2 py-0.5 bg-gray-100 rounded-full text-xs text-gray-500">{booking.bodyType}</span>
              )}
              {booking.totalDays && (
                <span className="text-xs text-gray-500">{booking.totalDays} day(s)</span>
              )}
            </div>

            {/* Existing review */}
            {rev ? (
              <div className="mt-3 p-3 bg-yellow-50 rounded-xl border border-yellow-100">
                <div className="flex items-center justify-between mb-1">
                  <Stars rating={rev.rating} />
                  <button
                    onClick={() => setShowModal(true)}
                    className="text-xs text-arl-cta font-bold hover:underline"
                  >Edit Review</button>
                </div>
                {rev.comment && (
                  <p className="text-xs text-gray-600 leading-relaxed line-clamp-2">{rev.comment}</p>
                )}
              </div>
            ) : (
              <button
                onClick={() => setShowModal(true)}
                className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-arl-primary text-white text-xs font-bold rounded-full hover:bg-arl-secondary transition shadow"
              >
                ⭐ Write a Review
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

// ── Main MyReviews page ───────────────────────────────────────
const MyReviews = ({ user }) => {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [filter,   setFilter]   = useState("all"); // "all" | "reviewed" | "pending"

  useEffect(() => {
    if (!user?.userID) { navigate("/"); return; }
    fetchBookingsWithReviews();
  }, [user]);

  const fetchBookingsWithReviews = async () => {
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("arl_token");

      // 1. Get user's bookings
      const bRes = await fetch(`${process.env.REACT_APP_API_URL}/bookings/user/${user.userID}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!bRes.ok) throw new Error("Failed to fetch bookings.");
      const bData = await bRes.json();
      const allBookings = Array.isArray(bData) ? bData : (bData.bookings || []);

      // 2. Get user's reviews — try endpoint, fallback gracefully
      let reviewsByBooking = {};
      try {
        const rRes = await fetch(`${process.env.REACT_APP_API_URL}/reviews/user/${user.userID}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (rRes.ok) {
          const rData = await rRes.json();
          const revArr = Array.isArray(rData) ? rData : (rData.reviews || []);
          revArr.forEach((r) => {
            if (r.bookingID) reviewsByBooking[r.bookingID] = r;
          });
        }
      } catch {
        // reviews endpoint may not exist yet — that's fine
      }

      // 3. Merge — completed bookings, plus anything refunded (a refund can
      // land on a cancelled booking too, but the customer still rode/used
      // the car and should be able to leave a review either way).
      const merged = allBookings
        .filter((b) =>
          (b.status || "").toLowerCase() === "completed" ||
          (b.payment?.status || "").toLowerCase() === "refunded"
        )
        .map((b) => ({
          ...b,
          myReview: reviewsByBooking[b.bookingID] || null,
        }));

      setBookings(merged);
    } catch (err) {
      setError("Could not load bookings. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleReviewSaved = (bookingID, saved) => {
    setBookings((prev) =>
      prev.map((b) =>
        b.bookingID === bookingID
          ? { ...b, myReview: { ...b.myReview, ...saved } }
          : b
      )
    );
  };

  const filtered = bookings.filter((b) => {
    if (filter === "reviewed") return !!b.myReview;
    if (filter === "pending")  return !b.myReview;
    return true;
  });

  const reviewedCount = bookings.filter(b => !!b.myReview).length;
  const pendingCount  = bookings.filter(b => !b.myReview).length;

  return (
    <div className="min-h-screen bg-gray-50 pt-24 pb-16">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-black text-arl-primary tracking-tight">My Reviews</h1>
          <p className="text-gray-500 text-sm mt-1">Rate and review vehicles from your completed or refunded bookings</p>
        </div>

        {/* Stats */}
        {!loading && !error && bookings.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6">
            {[
              { label: "Total Bookings", value: bookings.length,  icon: "📅" },
              { label: "Reviewed",       value: reviewedCount,    icon: "⭐" },
              { label: "Pending Review", value: pendingCount,     icon: "✍️" },
            ].map(({ label, value, icon }) => (
              <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-2.5 sm:p-4 text-center">
                <p className="text-lg sm:text-2xl mb-1">{icon}</p>
                <p className="text-xl sm:text-2xl font-black text-arl-primary">{value}</p>
                <p className="text-[10px] sm:text-xs text-gray-400 font-medium leading-tight">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Filter pills */}
        {!loading && !error && bookings.length > 0 && (
          <div className="flex gap-2 mb-5 flex-wrap">
            {[
              { key: "all",      label: `All (${bookings.length})` },
              { key: "pending",  label: `To Review (${pendingCount})` },
              { key: "reviewed", label: `Reviewed (${reviewedCount})` },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs font-bold border transition ${
                  filter === key
                    ? "bg-arl-primary text-white border-arl-primary"
                    : "bg-white text-gray-600 border-gray-200 hover:border-arl-primary"
                }`}
              >{label}</button>
            ))}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3 mb-6">
            ⛔ {error}
          </div>
        )}

        {loading && (
          <div className="space-y-4">
            {[1,2,3].map(i => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 animate-pulse">
                <div className="flex gap-4">
                  <div className="w-28 h-20 bg-gray-200 rounded-xl flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-1/3" />
                    <div className="h-3 bg-gray-100 rounded w-1/2" />
                    <div className="h-8 bg-gray-100 rounded-full w-32 mt-3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-16">
            <p className="text-5xl mb-4">{filter === "reviewed" ? "⭐" : filter === "pending" ? "✍️" : "📅"}</p>
            <p className="text-gray-600 font-semibold text-lg">
              {filter === "reviewed" ? "No reviews yet" : filter === "pending" ? "All bookings reviewed!" : "No reviewable bookings found"}
            </p>
            <p className="text-gray-400 text-sm mt-1">
              {filter === "reviewed"
                ? "Book a vehicle and share your experience!"
                : filter === "pending"
                ? "Thank you for reviewing all your bookings."
                : "You have no completed or refunded bookings to review yet."}
            </p>
            {filter === "all" && (
              <button
                onClick={() => navigate("/vehicles")}
                className="mt-5 px-6 py-3 bg-arl-cta text-white rounded-full font-bold text-sm hover:bg-arl-secondary transition"
              >Browse Vehicles →</button>
            )}
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="space-y-4">
            {filtered.map((b) => (
              <BookingReviewCard
                key={b.bookingID}
                booking={b}
                userID={user.userID}
                onReviewSaved={handleReviewSaved}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MyReviews;
