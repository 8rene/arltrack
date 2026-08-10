import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { storage } from "../firebase";
import { ref, uploadString, getDownloadURL } from "firebase/storage";

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: currentYear - 1900 + 1 }, (_, i) => currentYear - i);
const getDaysInMonth = (month, year) => {
  if (!month) return 31;
  return new Date(year || 2000, MONTHS.indexOf(month) + 1, 0).getDate();
};
const fmtDT = (val) => {
  if (!val) return "—";
  if (val?.toDate) return val.toDate().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" });
  if (val?._seconds !== undefined) return new Date(val._seconds * 1000).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const d = new Date(val);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

// ─────────────────────────────────────────────────────────────
// PENCIL-EDIT FIELD
// ─────────────────────────────────────────────────────────────
const EditableField = ({ label, value, onSave, type = "text", placeholder = "", locked = false, lockNote = "", maxLength }) => {
  const [editing,  setEditing]  = useState(false);
  const [draft,    setDraft]    = useState(value);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState("");
  const inputRef = useRef(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  const handleSave = async () => {
    if (draft === value) { setEditing(false); return; }
    setSaving(true); setError("");
    try {
      await onSave(draft);
      setEditing(false);
    } catch (e) {
      setError(e.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => { setDraft(value); setEditing(false); setError(""); };

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</label>
      {locked ? (
        <div>
          <div className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-500 cursor-not-allowed select-none">
            {value || <span className="text-gray-300 italic">Not set</span>}
          </div>
          <p className="text-xs text-gray-400 mt-1">🔒 {lockNote || "Cannot be changed"}</p>
        </div>
      ) : editing ? (
        <div>
          <input
            ref={inputRef}
            type={type}
            value={draft}
            placeholder={placeholder || label}
            onChange={e => {
              const val = maxLength
                ? e.target.value.replace(/[^\w.]/g, '').slice(0, maxLength)
                : e.target.value;
              setDraft(val);
            }}
            maxLength={maxLength}
            className="w-full px-4 py-3 rounded-xl border-2 border-arl-secondary text-sm focus:outline-none focus:ring-2 focus:ring-arl-secondary/30 bg-white"
          />
          {maxLength && (
            <p className={`text-xs mt-1 text-right ${draft.length >= maxLength ? "text-red-500" : "text-gray-400"}`}>
              {draft.length}/{maxLength}
            </p>
          )}
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          <div className="flex gap-2 mt-2">
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-1.5 bg-arl-primary text-white text-xs font-bold rounded-lg hover:bg-arl-secondary transition disabled:opacity-60">
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={handleCancel} disabled={saving}
              className="px-4 py-1.5 border border-gray-200 text-gray-600 text-xs font-bold rounded-lg hover:bg-gray-50 transition">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 group">
          <div className="flex-1 px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm text-gray-700">
            {value || <span className="text-gray-300 italic">Not set</span>}
          </div>
          <button onClick={() => setEditing(true)}
            title="Edit"
            className="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 text-gray-400 hover:text-arl-primary hover:border-arl-primary hover:bg-arl-primary/5 transition flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};

// Read-only display field (for locked data like email, phone, doc type, etc.)
const ReadOnlyField = ({ label, value, lockNote = "Cannot be changed" }) => (
  <div>
    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</label>
    <div className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-500 select-none">
      {value || <span className="text-gray-300 italic">Not set</span>}
    </div>
    <p className="text-xs text-gray-400 mt-1">🔒 {lockNote}</p>
  </div>
);

// ── Request Edit modal — bundles ALL locked fields into one request ──
// If a pending bundle already exists, shows the Current vs Requested
// comparison instead (matches the admin's own EditProfileModal UX).
const LOCKED_FIELDS = [
  { key: "email",          label: "Email" },
  { key: "phone",          label: "Phone" },
  { key: "birthDate",      label: "Birth Date", type: "date" },
  { key: "province",       label: "Province" },
  { key: "municipality",   label: "Municipality / City" },
  { key: "barangay",       label: "Barangay" },
  { key: "documentType",   label: "Document Type" },
  { key: "documentNumber", label: "Document Number" },
];

const RequestEditModal = ({ currentValues, pendingRequest, onClose, onSubmit, onCancelRequest, submitting, cancelling }) => {
  const [form, setForm] = useState(() =>
    Object.fromEntries(LOCKED_FIELDS.map(f => [f.key, currentValues[f.key] || ""]))
  );
  const [reason, setReason] = useState("");
  const [error, setError]   = useState("");

  const handleSubmit = () => {
    const changes = LOCKED_FIELDS
      .filter(f => (form[f.key] || "").trim() !== (currentValues[f.key] || "").trim())
      .map(f => ({ field: f.key, requestedValue: form[f.key].trim() }));

    if (changes.length === 0) {
      setError("You haven't changed anything yet.");
      return;
    }
    setError("");
    onSubmit(changes, reason);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-5 border-b sticky top-0 bg-white z-10">
          <h2 className="font-black text-lg text-gray-800">
            {pendingRequest ? "Pending Edit Request" : "Request Profile Edit"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>

        {pendingRequest ? (
          <div className="p-5 space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
              You already have a pending edit request. Cancel it below if you want to submit different changes instead.
            </div>

            <div className="border rounded-xl overflow-hidden">
              <div className="grid grid-cols-2 text-xs font-semibold text-gray-400 uppercase bg-gray-50 px-4 py-2">
                <span>Current</span>
                <span>Requested</span>
              </div>
              {(pendingRequest.changes || []).map((c, i) => (
                <div key={i} className="border-t">
                  <p className="px-4 pt-2 text-xs font-semibold text-gray-500">{c.label}</p>
                  <div className="grid grid-cols-2 px-4 pb-2.5 pt-1 text-sm bg-orange-50/60">
                    <div className="text-gray-500">{c.oldValue || "—"}</div>
                    <div className="text-arl-primary font-semibold">{c.newValue || "—"}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition">
                Close
              </button>
              <button onClick={onCancelRequest} disabled={cancelling}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition disabled:opacity-60">
                {cancelling ? "Cancelling…" : "Cancel Request"}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <p className="text-xs text-gray-400">
              Change any of the fields below. An admin will review your request before it takes effect.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {LOCKED_FIELDS.map((f) => (
                <div key={f.key}>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{f.label}</label>
                  <input
                    type={f.type || "text"}
                    value={form[f.key]}
                    onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-arl-primary/30"
                  />
                </div>
              ))}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Reason (optional)</label>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why does this need to change?"
                className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-arl-primary/30"
              />
            </div>

            {error && <p className="text-xs text-red-500">⛔ {error}</p>}

            <div className="flex gap-3">
              <button onClick={onClose} disabled={submitting}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition">
                Cancel
              </button>
              <button onClick={handleSubmit} disabled={submitting}
                className="flex-1 py-2.5 rounded-xl bg-arl-primary text-white text-sm font-bold hover:bg-arl-secondary transition disabled:opacity-60">
                {submitting ? "Sending…" : "Send Request"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Section wrapper
const Section = ({ title, icon, children }) => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
    <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 bg-gray-50">
      <span className="text-xl">{icon}</span>
      <h3 className="font-bold text-arl-primary text-base">{title}</h3>
    </div>
    <div className="p-6">{children}</div>
  </div>
);

// ─────────────────────────────────────────────────────────────
// REVIEWS TAB COMPONENTS
// ─────────────────────────────────────────────────────────────
const StarPicker = ({ value, onChange }) => (
  <div className="flex gap-1">
    {[1,2,3,4,5].map((s) => (
      <button key={s} type="button" onClick={() => onChange(s)}
        className={`text-3xl transition-transform hover:scale-110 ${s <= value ? "text-yellow-400" : "text-gray-200 hover:text-yellow-200"}`}
      >★</button>
    ))}
  </div>
);

const Stars = ({ rating }) => (
  <span>{[1,2,3,4,5].map(s => <span key={s} className={s <= rating ? "text-yellow-400" : "text-gray-200"}>★</span>)}</span>
);

const ReviewModal = ({ booking, existingReview, userID, onClose, onSaved }) => {
  const [rating,  setRating]  = useState(existingReview?.rating  || 0);
  const [comment, setComment] = useState(existingReview?.comment || "");
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");
  const LABELS = { 1: "Poor", 2: "Fair", 3: "Good", 4: "Very Good", 5: "Excellent" };

  const handleSubmit = async () => {
    if (rating === 0) { setError("Please select a star rating."); return; }
    setSaving(true); setError("");
    try {
      const token  = localStorage.getItem("arl_token");
      const method = existingReview ? "PUT" : "POST";
      const url    = existingReview
        ? `${process.env.REACT_APP_API_URL}/reviews/${existingReview.reviewID}`
        : `${process.env.REACT_APP_API_URL}/reviews/create`;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userID, carID: booking.carID, bookingID: booking.bookingID, rating, comment }),
      });
      if (!res.ok) throw new Error();
      onSaved({ rating, comment, reviewID: existingReview?.reviewID || `new-${Date.now()}` });
      onClose();
    } catch {
      setError("Could not save review. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center gap-4 p-6 border-b border-gray-100 bg-gray-50">
          <div className="w-14 h-11 rounded-xl overflow-hidden bg-gray-200 flex-shrink-0">
            {booking.carImage
              ? <img src={booking.carImage} alt={booking.carName} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-xl">🚗</div>}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-black text-arl-primary truncate">{booking.carName || "Vehicle"}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Booking: {booking.bookingID}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 text-gray-400 text-lg">✕</button>
        </div>
        <div className="p-6 space-y-5">
          <div>
            <p className="text-sm font-semibold text-gray-600 mb-2">Your Rating</p>
            <StarPicker value={rating} onChange={setRating} />
            {rating > 0 && <p className="text-sm text-yellow-600 font-bold mt-1">{LABELS[rating]}</p>}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-600 mb-2">Your Review <span className="font-normal text-gray-400">(optional)</span></p>
            <textarea className="w-full border border-gray-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-arl-secondary"
              rows={4} placeholder="Share your experience with this vehicle…"
              value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} />
            <p className="text-xs text-gray-400 text-right mt-1">{comment.length}/500</p>
          </div>
          {error && <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-2">⛔ {error}</p>}
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">Cancel</button>
            <button onClick={handleSubmit} disabled={saving || rating === 0}
              className="flex-1 py-3 rounded-xl bg-arl-primary text-white text-sm font-bold hover:bg-arl-secondary transition disabled:opacity-50 disabled:cursor-not-allowed">
              {saving ? "Saving…" : existingReview ? "Update Review" : "Submit Review"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const STATUS_BADGE = {
  pending:   { bg: "bg-yellow-100", text: "text-yellow-700", label: "⏳ Pending"   },
  approved:  { bg: "bg-blue-100",   text: "text-blue-700",   label: "✅ Approved"  },
  cancelled: { bg: "bg-red-100",    text: "text-red-600",    label: "❌ Cancelled" },
  completed: { bg: "bg-green-100",  text: "text-green-700",  label: "🏁 Completed" },
};

const CancelReasonInput = ({ onConfirm, onClose, loading, error }) => {
  const [reason, setReason] = useState("");
  return (
    <>
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
      {error && <p className="text-xs text-red-500 mt-2">⛔ {error}</p>}
      <div className="flex gap-3 mt-4">
        <button onClick={onClose} disabled={loading}
          className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition">
          Keep Booking
        </button>
        <button onClick={() => onConfirm(reason)} disabled={loading}
          className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition disabled:opacity-60">
          {loading ? "Cancelling…" : "Yes, Cancel"}
        </button>
      </div>
    </>
  );
};

const BookingReviewCard = ({ booking, userID, onReviewSaved, onCancelled }) => {
  const [showModal,       setShowModal]       = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelling,      setCancelling]      = useState(false);
  const [cancelError,     setCancelError]     = useState("");
  const rev          = booking.myReview;
  const isCompleted  = (booking.status || "").toLowerCase() === "completed";
  const isCancellable = ["pending", "approved"].includes((booking.status || "").toLowerCase());
  const badge        = STATUS_BADGE[(booking.status || "pending").toLowerCase()] || STATUS_BADGE.pending;

  const handleCancel = async (reason) => {
    setCancelling(true); setCancelError("");
    try {
      const token = localStorage.getItem("arl_token");
      const res   = await fetch(`${process.env.REACT_APP_API_URL}/bookings/${booking.bookingID}/cancel`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ userID, reason: reason || "Cancelled by user." }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.message || "Cancel failed."); }
      setShowCancelModal(false);
      if (onCancelled) onCancelled(booking.bookingID, reason || "Cancelled by user.");
    } catch (err) {
      setCancelError(err.message);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <>
      {showModal && (
        <ReviewModal booking={booking} existingReview={rev || null} userID={userID}
          onClose={() => setShowModal(false)}
          onSaved={(saved) => onReviewSaved(booking.bookingID, saved)} />
      )}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-black text-gray-800 mb-1">Cancel Booking</h3>
            <p className="text-sm text-gray-500 mb-4">
              Are you sure you want to cancel booking <span className="font-mono font-bold text-arl-primary">{booking.bookingID}</span>?
            </p>
            <CancelReasonInput
              onConfirm={handleCancel}
              onClose={() => { setShowCancelModal(false); setCancelError(""); }}
              loading={cancelling}
              error={cancelError}
            />
          </div>
        </div>
      )}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition overflow-hidden">
        <div className="flex gap-4 p-5">
          <div className="w-28 h-20 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
            {booking.carImage
              ? <img src={booking.carImage} alt={booking.carName} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-3xl text-gray-300">🚗</div>}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <h3 className="font-bold text-arl-primary truncate">{booking.carName || "Unknown Vehicle"}</h3>
                <p className="text-xs text-gray-400 mt-0.5 font-mono">{booking.bookingID}</p>
              </div>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${badge.bg} ${badge.text}`}>{badge.label}</span>
            </div>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              {booking.bodyType && <span className="px-2 py-0.5 bg-gray-100 rounded-full text-xs text-gray-500">{booking.bodyType}</span>}
              {booking.totalDays && <span className="text-xs text-gray-500">{booking.totalDays} day(s)</span>}
              <span className="text-xs text-gray-400">{fmtDT(booking.startDateTime)}</span>
            </div>
            {cancelError && <p className="text-xs text-red-500 mt-2">⛔ {cancelError}</p>}
            {isCompleted ? (
              rev ? (
                <div className="mt-3 p-3 bg-yellow-50 rounded-xl border border-yellow-100">
                  <div className="flex items-center justify-between mb-1">
                    <Stars rating={rev.rating} />
                    <button onClick={() => setShowModal(true)} className="text-xs text-arl-cta font-bold hover:underline">Edit Review</button>
                  </div>
                  {rev.comment && <p className="text-xs text-gray-600 leading-relaxed line-clamp-2">{rev.comment}</p>}
                </div>
              ) : (
                <button onClick={() => setShowModal(true)}
                  className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-arl-primary text-white text-xs font-bold rounded-full hover:bg-arl-secondary transition shadow">
                  ⭐ Write a Review
                </button>
              )
            ) : isCancellable ? (
              <button onClick={() => setShowCancelModal(true)}
                className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 border border-red-200 text-red-500 text-xs font-bold rounded-full hover:bg-red-50 transition">
                ✕ Cancel Booking
              </button>
            ) : (
              <p className="mt-3 text-xs text-gray-400 italic">Reviews are only available for completed bookings.</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

// ─────────────────────────────────────────────────────────────
// REVIEWS TAB
// ─────────────────────────────────────────────────────────────
const ReviewsTab = ({ user, navigate }) => {
  const [bookings, setBookings] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [filter,   setFilter]   = useState("all");

  useEffect(() => { fetchBookingsWithReviews(); }, []);

  const fetchBookingsWithReviews = async () => {
    setLoading(true); setError("");
    try {
      const token = localStorage.getItem("arl_token");
      const bRes  = await fetch(`${process.env.REACT_APP_API_URL}/bookings/user/${user.userID}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!bRes.ok) throw new Error();
      const bData       = await bRes.json();
      const allBookings = Array.isArray(bData) ? bData : (bData.bookings || []);
      let reviewsByBooking = {};
      try {
        const rRes = await fetch(`${process.env.REACT_APP_API_URL}/reviews/user/${user.userID}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (rRes.ok) {
          const rData  = await rRes.json();
          const revArr = Array.isArray(rData) ? rData : (rData.reviews || []);
          revArr.forEach((r) => { if (r.bookingID) reviewsByBooking[r.bookingID] = r; });
        }
      } catch { /* optional */ }
      setBookings(allBookings.map((b) => ({ ...b, myReview: reviewsByBooking[b.bookingID] || null })));
    } catch {
      setError("Could not load bookings. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleReviewSaved = (bookingID, saved) => {
    setBookings((prev) => prev.map((b) =>
      b.bookingID === bookingID ? { ...b, myReview: { ...b.myReview, ...saved } } : b
    ));
  };

  const handleCancelled = (bookingID, reason) => {
    setBookings((prev) => prev.map((b) =>
      b.bookingID === bookingID ? { ...b, status: "cancelled", cancellationReason: reason } : b
    ));
  };

  const completedBookings = bookings.filter(b => (b.status || "").toLowerCase() === "completed");
  const reviewedCount     = completedBookings.filter(b => !!b.myReview).length;
  const pendingCount      = completedBookings.filter(b => !b.myReview).length;
  const filtered          = (filter === "all" ? bookings : completedBookings).filter((b) => {
    if (filter === "reviewed") return !!b.myReview;
    if (filter === "pending")  return !b.myReview;
    return true;
  });

  return (
    <div className="space-y-6">
      {!loading && !error && completedBookings.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Completed Trips", value: completedBookings.length, icon: "🏁" },
            { label: "Reviewed",        value: reviewedCount,   icon: "⭐" },
            { label: "Pending Review",  value: pendingCount,    icon: "✍️" },
          ].map(({ label, value, icon }) => (
            <div key={label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
              <p className="text-2xl mb-1">{icon}</p>
              <p className="text-2xl font-black text-arl-primary">{value}</p>
              <p className="text-xs text-gray-400 font-medium">{label}</p>
            </div>
          ))}
        </div>
      )}
      {!loading && !error && completedBookings.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {[
            { key: "all",      label: `All (${bookings.length})` },
            { key: "pending",  label: `To Review (${pendingCount})` },
            { key: "reviewed", label: `Reviewed (${reviewedCount})` },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setFilter(key)}
              className={`px-4 py-2 rounded-full text-xs font-bold border transition ${
                filter === key ? "bg-arl-primary text-white border-arl-primary" : "bg-white text-gray-600 border-gray-200 hover:border-arl-primary"
              }`}>{label}</button>
          ))}
        </div>
      )}
      {error && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">⛔ {error}</div>}
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
      {!loading && !error && completedBookings.length === 0 && (
        <div className="text-center py-16">
          <p className="text-5xl mb-4">🏁</p>
          <p className="text-gray-600 font-semibold text-lg">No completed trips yet</p>
          <p className="text-gray-400 text-sm mt-1">You can only review vehicles after your booking is completed.</p>
          <button onClick={() => navigate("/vehicles")}
            className="mt-5 px-6 py-3 bg-arl-cta text-white rounded-full font-bold text-sm hover:bg-arl-secondary transition">
            Browse Vehicles →
          </button>
        </div>
      )}
      {!loading && !error && completedBookings.length > 0 && filtered.length === 0 && (
        <div className="text-center py-16">
          <p className="text-5xl mb-4">{filter === "reviewed" ? "⭐" : "✍️"}</p>
          <p className="text-gray-600 font-semibold text-lg">
            {filter === "reviewed" ? "No reviews written yet" : "All completed trips reviewed!"}
          </p>
          <p className="text-gray-400 text-sm mt-1">
            {filter === "reviewed" ? "Write a review for your completed trips below." : "Thank you for reviewing all your bookings."}
          </p>
        </div>
      )}
      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-4">
          {filtered.map((b) => (
            <BookingReviewCard key={b.bookingID} booking={b} userID={user.userID} onReviewSaved={handleReviewSaved} onCancelled={handleCancelled} />
          ))}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// MAIN PROFILE PAGE
// ─────────────────────────────────────────────────────────────
const ProfilePage = ({ user }) => {
  const navigate   = useNavigate();
  const fileRef    = useRef(null);
  const [activeTab, setActiveTab] = useState("profile");

  const [profile,      setProfile]      = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");
  const [avatarURL,    setAvatarURL]    = useState("");
  const [uploading,    setUploading]    = useState(false);
  const [uploadError,  setUploadError]  = useState("");

  // Flat field state (for display/EditableField)
  const [firstName,    setFirstName]    = useState("");
  const [lastName,     setLastName]     = useState("");
  const [middleName,   setMiddleName]   = useState("");
  const [suffix,       setSuffix]       = useState("");
  const [username,     setUsername]     = useState("");
  const [email,        setEmail]        = useState("");
  const [phone,        setPhone]        = useState("");
  const [province,     setProvince]     = useState("");
  const [city,         setCity]         = useState("");
  const [municipality, setMunicipality] = useState("");
  const [barangay,     setBarangay]     = useState("");
  const [street,       setStreet]       = useState("");
  const [postalCode,   setPostalCode]   = useState("");
  const [village,      setVillage]      = useState("");
  const [birthDate,    setBirthDate]    = useState("");
  const [userAddressID, setUserAddressID] = useState("");

  // Locked-field edit requests (bundled — one modal covers all locked fields)
  const [editRequests, setEditRequests]     = useState([]);
  const [showEditModal, setShowEditModal]   = useState(false);
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [cancellingEdit, setCancellingEdit] = useState(false);
  const [editToast, setEditToast]           = useState(null);

  const pendingEditRequest = editRequests.find((r) => r.status === "pending");

  const fetchEditRequests = async () => {
    try {
      const token = localStorage.getItem("arl_token");
      const res = await fetch(`${process.env.REACT_APP_API_URL}/user/edit-requests/mine`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setEditRequests(data.data || []);
    } catch {
      // non-critical — pending banner just won't show
    }
  };

  const submitEditRequest = async (changes, reason) => {
    setSubmittingEdit(true);
    try {
      const token = localStorage.getItem("arl_token");
      const res = await fetch(`${process.env.REACT_APP_API_URL}/user/edit-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ changes, reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to send request.");
      setEditToast({ type: "success", msg: data.message || "Edit request sent." });
      setShowEditModal(false);
      fetchEditRequests();
    } catch (err) {
      setEditToast({ type: "error", msg: err.message });
    } finally {
      setSubmittingEdit(false);
      setTimeout(() => setEditToast(null), 3500);
    }
  };

  const cancelEditRequest = async () => {
    if (!pendingEditRequest) return;
    setCancellingEdit(true);
    try {
      const token = localStorage.getItem("arl_token");
      const res = await fetch(`${process.env.REACT_APP_API_URL}/user/edit-requests/${pendingEditRequest.id}/cancel`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to cancel request.");
      setEditToast({ type: "success", msg: "Request cancelled." });
      setShowEditModal(false);
      fetchEditRequests();
    } catch (err) {
      setEditToast({ type: "error", msg: err.message });
    } finally {
      setCancellingEdit(false);
      setTimeout(() => setEditToast(null), 3500);
    }
  };

  useEffect(() => {
    if (!user?.userID) { navigate("/"); return; }
    fetchProfile();
    fetchEditRequests();
  }, [user]);

  const fetchProfile = async () => {
    setLoading(true); setError("");
    try {
      const token = localStorage.getItem("arl_token");
      const res   = await fetch(`${process.env.REACT_APP_API_URL}/user/profile/${user.userID}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setProfile(data);
      setFirstName(data.firstName      || "");
      setLastName(data.lastName        || "");
      setMiddleName(data.middleName    || "");
      setSuffix(data.suffix            || "");
      setUsername(data.username        || "");
      setEmail(data.email              || "");
      setPhone(data.phone              || "");
      setProvince(data.province        || "");
      setCity(data.city                || "");
      setMunicipality(data.municipality|| "");
      setBarangay(data.barangay        || "");
      setStreet(data.street            || "");
      setPostalCode(data.postalCode    || "");
      setVillage(data.village          || "");
      setAvatarURL(data.profileImage || "");
      setBirthDate(data.birthDate      || "");
      setUserAddressID(data.userAddressID || "");
    } catch {
      setError("Could not load profile. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Per-field save — sends only the changed field + userAddressID for address fields
  const ADDRESS_FIELDS = new Set(["street", "village", "province", "city", "municipality", "barangay", "postalCode"]);
  const saveField = async (field, value) => {
    const token = localStorage.getItem("arl_token");
    const body  = { [field]: value };
    if (ADDRESS_FIELDS.has(field) && userAddressID) body.userAddressID = userAddressID;
    const res = await fetch(`${process.env.REACT_APP_API_URL}/user/profile/${user.userID}`, {
      method:  "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Failed to save.");
    const setters = {
      firstName: setFirstName, lastName: setLastName, middleName: setMiddleName,
      suffix: setSuffix, username: setUsername, street: setStreet, village: setVillage,
      birthDate: setBirthDate, postalCode: setPostalCode,
    };
    if (setters[field]) setters[field](value);
  };

  // Profile photo upload
  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setUploadError("Please select an image file."); return; }
    if (file.size > 5 * 1024 * 1024)    { setUploadError("Image must be under 5MB.");       return; }
    setUploading(true); setUploadError("");
    try {
      const token = localStorage.getItem("arl_token");

      // 1. Convert file to base64
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // 2. Upload to Firebase Storage directly from frontend
      const storageRef   = ref(storage, `avatars/${user.userID}`);
      await uploadString(storageRef, base64, "base64", { contentType: file.type });
      const profileImage = await getDownloadURL(storageRef);

      // 3. Send URL to backend — JSON body, not FormData
      const res = await fetch(`${process.env.REACT_APP_API_URL}/user/profile/${user.userID}/avatar`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ profileImage }),
      });
      if (!res.ok) throw new Error("Upload failed.");
      const data = await res.json();
      setAvatarURL(data.profileImage || profileImage);
      setProfile(prev => ({ ...prev, profileImage: data.profileImage || profileImage }));
    } catch (err) {
      // Fallback: show local preview even if server upload fails
      setAvatarURL(URL.createObjectURL(file));
      setUploadError("Could not save to server, showing preview only.");
    } finally {
      setUploading(false);
    }
  };

  // Postal code — use value from Firestore directly (saved during registration/profile update)
  const derivedPostalCode = postalCode;

  if (!user?.userID) return null;

  const TABS = [
    { key: "profile", label: "My Profile", icon: "👤" },
    { key: "reviews", label: "My Reviews",  icon: "⭐" },
  ];

  // Initials fallback for avatar
  const initials = `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase() || "?";

  return (
    <div className="min-h-screen bg-gray-50 pt-24 pb-16">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">

        {/* Toast */}
        {editToast && (
          <div className={`fixed top-24 right-5 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${
            editToast.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
          }`}>{editToast.msg}</div>
        )}

        {/* Request Edit modal */}
        {showEditModal && (
          <RequestEditModal
            currentValues={{ email, phone, birthDate, province, municipality: municipality || city, barangay, documentType: profile?.documentType || "", documentNumber: profile?.documentNumber || "" }}
            pendingRequest={pendingEditRequest}
            onClose={() => setShowEditModal(false)}
            onSubmit={submitEditRequest}
            onCancelRequest={cancelEditRequest}
            submitting={submittingEdit}
            cancelling={cancellingEdit}
          />
        )}

        {/* Page header */}
        <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-3xl font-black text-arl-primary tracking-tight">
              {activeTab === "profile" ? "My Profile" : "My Reviews"}
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              {activeTab === "profile" ? "View and update your personal information" : "Rate and review the vehicles you've booked"}
            </p>
          </div>
          {activeTab === "profile" && (
            <button
              onClick={() => setShowEditModal(true)}
              className={`text-sm font-bold rounded-xl px-4 py-2.5 transition ${
                pendingEditRequest
                  ? "bg-yellow-50 text-yellow-700 border border-yellow-200 hover:bg-yellow-100"
                  : "bg-arl-primary text-white hover:bg-arl-secondary"
              }`}
            >
              {pendingEditRequest ? "⏳ Pending Edit Request" : "Request Profile Edit"}
            </button>
          )}
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mb-8 bg-white rounded-2xl border border-gray-100 shadow-sm p-1.5 w-fit">
          {TABS.map(({ key, label, icon }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
                activeTab === key
                  ? "bg-arl-primary text-white shadow"
                  : "text-gray-500 hover:text-arl-primary hover:bg-gray-50"
              }`}>
              <span>{icon}</span> {label}
            </button>
          ))}
        </div>

        {error && activeTab === "profile" && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">⛔ {error}</div>
        )}

        {/* ── PROFILE TAB ── */}
        {activeTab === "profile" && (
          <>
            {loading ? (
              <div className="space-y-6">
                {[1,2,3].map(i => (
                  <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-1/4 mb-4" />
                    <div className="grid grid-cols-2 gap-4">
                      <div className="h-10 bg-gray-100 rounded-xl" />
                      <div className="h-10 bg-gray-100 rounded-xl" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-6">

                {/* ── Profile Photo ── */}
                <Section title="Profile Photo" icon="📷">
                  <div className="flex items-center gap-6">
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      <div className="w-24 h-24 rounded-full overflow-hidden bg-arl-primary/10 border-4 border-white shadow-md flex items-center justify-center">
                        {avatarURL
                          ? <img src={avatarURL} alt="Profile" className="w-full h-full object-cover" onError={() => setAvatarURL("")} />
                          : <span className="text-2xl font-black text-arl-primary">{initials}</span>
                        }
                      </div>
                      {/* Upload button overlay */}
                      <button
                        onClick={() => fileRef.current?.click()}
                        disabled={uploading}
                        className="absolute bottom-0 right-0 w-7 h-7 bg-arl-primary text-white rounded-full flex items-center justify-center shadow hover:bg-arl-secondary transition disabled:opacity-60"
                        title="Change photo">
                        {uploading
                          ? <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                          : <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        }
                      </button>
                      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                    </div>
                    {/* Info */}
                    <div>
                      <p className="font-bold text-gray-700">{firstName} {lastName}</p>
                      <p className="text-sm text-gray-400 mt-0.5">{email}</p>
                      <button
                        onClick={() => fileRef.current?.click()}
                        disabled={uploading}
                        className="mt-3 px-4 py-2 bg-arl-primary/10 text-arl-primary text-xs font-bold rounded-full hover:bg-arl-primary/20 transition disabled:opacity-60">
                        {uploading ? "Uploading…" : "Upload new photo"}
                      </button>
                      {uploadError && <p className="text-xs text-red-500 mt-2">{uploadError}</p>}
                      <p className="text-xs text-gray-400 mt-1">JPG, PNG or WEBP · Max 5MB</p>
                    </div>
                  </div>
                </Section>

                {/* ── Account Information ── */}
                <Section title="Account Information" icon="👤">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <ReadOnlyField label="Email" value={email} lockNote="Cannot be changed" />
                    <ReadOnlyField label="Phone" value={phone} lockNote="Cannot be changed" />
                    <EditableField
                      label="Username"
                      value={username}
                      onSave={(v) => saveField("username", v)}
                      maxLength={12}
                    />
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Account Status</label>
                      <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold ${
                        profile?.isVerified ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700"
                      }`}>
                        {profile?.isVerified ? "✓ Verified" : "⏳ Unverified"}
                      </div>
                    </div>
                  </div>
                </Section>

                {/* ── Personal Details ── */}
                <Section title="Personal Details" icon="📋">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <EditableField label="First Name"  value={firstName}  onSave={(v) => saveField("firstName",  v)} />
                    <EditableField label="Last Name"   value={lastName}   onSave={(v) => saveField("lastName",   v)} />
                    <EditableField label="Middle Name" value={middleName} onSave={(v) => saveField("middleName", v)} />
                    <EditableField label="Suffix"      value={suffix}     onSave={(v) => saveField("suffix",     v)} placeholder="Jr., Sr., III…" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Date of Birth</label>
                    <ReadOnlyField
                      value={birthDate ? (() => {
                        const [y, m, d] = birthDate.split("-");
                        return `${MONTHS[parseInt(m, 10) - 1] || ""} ${parseInt(d, 10)}, ${y}`;
                      })() : ""}
                      lockNote="Contact support to update"
                    />
                  </div>
                </Section>

                {/* ── Home Address ── */}
                <Section title="Home Address" icon="📍">
                  <div className="mb-3 p-3 bg-yellow-50 rounded-xl border border-yellow-100 flex items-start gap-2">
                    <span className="text-yellow-500 mt-0.5">🔒</span>
                    <p className="text-xs text-yellow-700">Province, Municipality, and Barangay are set during registration. Contact support to update them.</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <ReadOnlyField label="Province"          value={province}               lockNote="Cannot be changed" />
                    <ReadOnlyField label="Municipality / City" value={municipality || city} lockNote="Cannot be changed" />
                    <ReadOnlyField label="Barangay"          value={barangay}               lockNote="Cannot be changed" />
                    <ReadOnlyField label="Postal Code"       value={derivedPostalCode}      lockNote="Auto-filled from location" />
                    <EditableField label="Village / Subdivision" value={village} onSave={(v) => saveField("village", v)} />
                    <EditableField label="Street / House No."    value={street}  onSave={(v) => saveField("street",  v)} />
                  </div>
                </Section>

                {/* ── Verification Documents ── */}
                <Section title="Verification Documents" icon="🪪">
                  <p className="text-xs text-gray-400 mb-4">Document information is managed by administrators. Contact us to update your documents.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <ReadOnlyField label="Document Type"   value={profile?.documentType   || ""} lockNote="Managed by admin" />
                    <ReadOnlyField label="Document Number" value={profile?.documentNumber || ""} lockNote="Managed by admin" />
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Document Status</label>
                      <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold ${
                        profile?.documentVerified ? "bg-green-50 text-green-700" : "bg-red-50 text-red-500"
                      }`}>
                        {profile?.documentVerified ? "✓ Verified" : "✗ Not Verified"}
                      </div>
                    </div>
                  </div>
                </Section>

              </div>
            )}
          </>
        )}

        {/* ── REVIEWS TAB ── */}
        {activeTab === "reviews" && (
          <ReviewsTab user={user} navigate={navigate} />
        )}

      </div>
    </div>
  );
};

export default ProfilePage;
