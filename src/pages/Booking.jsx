import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../fireabase";
import { useCurrency } from "../context/CurrencyContext";
import { useAuth } from "../context/AuthContext";
import TripMapModal from "../components/TripMapModal";

// Same shape MyTrips.jsx's tripStops() builds for TripMapModal — pickup,
// dropoff, and any extra stops the customer selected at booking time
// (booking.geofenceZones, now resolved by getAllBookings alongside
// pickupLocation/dropoffLocation — see booking.service.js's
// resolveHistoryInfo). Kept as its own small copy here rather than a
// shared import: duplicating small resolvers/helpers per-module is the
// existing convention in this codebase (see driverDispatch.service.js).
const SAME_SPOT_DEG = 0.0005;
const isSameSpot = (a, b) =>
  !!a && !!b && Math.abs(a.lat - b.lat) < SAME_SPOT_DEG && Math.abs(a.lng - b.lng) < SAME_SPOT_DEG;

function tripStops(booking) {
  const stops = [];
  if (booking.pickupLocation) stops.push({ key: "pickup", type: "pickup", ...booking.pickupLocation });
  if (booking.dropoffLocation) stops.push({ key: "dropoff", type: "dropoff", ...booking.dropoffLocation });
  (booking.geofenceZones || []).forEach((zone, i) => {
    if (typeof zone.lat !== "number" || typeof zone.lng !== "number") return;
    const label = (zone.label || "").toLowerCase();
    if (label.includes("pickup") || label.includes("drop")) return;
    if (isSameSpot(zone, booking.pickupLocation) || isSameSpot(zone, booking.dropoffLocation)) return;
    stops.push({ key: `stop-${i}`, type: "stop", address: zone.label || `Stop ${i + 1}`, lat: zone.lat, lng: zone.lng });
  });
  return stops;
}

// ─── SVG ICONS ───────────────────────────────────────────────────────────────

const IconTrash = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconWarning = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

const IconCheck = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconBlock = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

const IconClock = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
    <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
  </svg>
);

const IconRefresh = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M23 4v6h-6M1 20v-6h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3.51 9a9 9 0 0114.36-3.36L23 10M1 14l5.13 4.36A9 9 0 0020.49 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconX = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

// Used for the "All Bookings" stat tab icon.
const IconGrid = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
  </svg>
);

// Used for the "Ongoing" stat tab icon — a pulse/activity line.
const IconActivity = ({ className = "w-5 h-5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 12h4l3 8 4-16 3 8h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ─── DATA ────────────────────────────────────────────────────────────────────

// "To Pay" = the customer created the booking but the deposit hasn't cleared yet.
// Nothing has been paid, so staff can't act on it (no pickup/driver) — it's listed so
// pending bookings (and the car being held for them) are visible. It flips to
// "Upcoming" by itself the moment the deposit is paid, or auto-cancels after 12 hours.
const STATUS_TABS = ["All", "To Pay", "Upcoming", "Ongoing", "Cancelled", "Completed"];

// Icon + color per stat tab — colors match STATUS_DOT/STATUS_BG below so a
// status looks the same in the tab card as it does in the table badge.
const TAB_ICON = {
  All:       IconGrid,
  "To Pay":  IconClock,
  Upcoming:  IconClock,
  Ongoing:   IconActivity,
  Cancelled: IconX,
  Completed: IconCheck,
};

const TAB_ICON_COLOR = {
  All:       "bg-teal-50 text-teal-600",
  "To Pay":  "bg-orange-50 text-orange-600",
  Upcoming:  "bg-yellow-50 text-yellow-600",
  Ongoing:   "bg-blue-50 text-blue-600",
  Cancelled: "bg-red-50 text-red-600",
  Completed: "bg-green-50 text-green-600",
};

// STATUS_DOT / STATUS_BG / StatusBadge — kept identical to the copy in
// Dashboard.jsx so the same status always looks the same on both pages.
// If a new status is added, update both files.
const STATUS_DOT = {
  "to pay":  "bg-orange-400",
  upcoming:  "bg-yellow-400",
  ongoing:   "bg-blue-500",
  completed: "bg-green-500",
  cancelled: "bg-red-500",
  stolen:    "bg-red-700",
};

const STATUS_BG = {
  "to pay":  "bg-orange-50 border border-orange-200",
  upcoming:  "bg-yellow-50 border border-yellow-200",
  ongoing:   "bg-blue-50 border border-blue-200",
  completed: "bg-green-50 border border-green-200",
  cancelled: "bg-red-50 border border-red-200",
  stolen:    "bg-red-100 border border-red-300",
};

function StatusBadge({ status }) {
  const s   = (status || "").toLowerCase();
  const dot = STATUS_DOT[s] || "bg-gray-400";
  const bg  = STATUS_BG[s]  || "bg-gray-50 border border-gray-200";
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full capitalize text-black ${bg}`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
      {status?.replace("_", " ")}
    </span>
  );
}

const fmtDate = (val) => {
  if (!val) return "—";
  try {
    let d;
    if (typeof val?.toDate === "function") d = val.toDate();
    else if (val?._seconds !== undefined) d = new Date(val._seconds * 1000);
    else d = new Date(val);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
  } catch { return "—"; }
};

// Same Firestore-Timestamp-or-string-or-seconds handling as fmtDate above,
// but returns a raw millisecond number (or -Infinity for unparsable/empty
// values) so sort() has something numeric to compare rather than strings.
const toMillis = (val) => {
  if (!val) return -Infinity;
  try {
    let d;
    if (typeof val?.toDate === "function") d = val.toDate();
    else if (val?._seconds !== undefined) d = new Date(val._seconds * 1000);
    else d = new Date(val);
    const ms = d.getTime();
    return isNaN(ms) ? -Infinity : ms;
  } catch { return -Infinity; }
};

// ─── SORT HEADER ────────────────────────────────────────────────────────────
// Clickable <th> that toggles asc/desc on the given sortKey. Shows a neutral
// up/down chevrons icon when the column isn't the active sort (so it reads
// as "sortable" even before you've clicked it), and a bold single arrow in
// the active color once it is. Keeps Bookings/Users sort UI visually and
// behaviorally identical.
const IconChevronsUpDown = ({ className = "w-3.5 h-3.5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M7 15l5 5 5-5M7 9l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconSortArrow = ({ dir, className = "w-3.5 h-3.5" }) => (
  <svg
    className={`${className} transition-transform ${dir === "desc" ? "rotate-180" : ""}`}
    viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function SortableTh({ label, sortKey: key, sortKeyState, sortDir, onSort, className = "" }) {
  const active = sortKeyState === key;
  return (
    <th className={`px-4 py-3 text-left select-none ${className}`}>
      <button
        onClick={() => onSort(key)}
        className={`flex items-center gap-1.5 uppercase tracking-wide text-xs font-semibold px-2 py-1 -mx-2 rounded-lg transition-colors ${
          active ? "text-teal-700 bg-teal-50" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
        }`}
      >
        {label}
        {active ? <IconSortArrow dir={sortDir} /> : <IconChevronsUpDown />}
      </button>
    </th>
  );
}

const canEdit  = (status) => ["upcoming", "ongoing"].includes(status?.toLowerCase());
const isLocked = (status) => ["completed", "cancelled", "stolen"].includes(status?.toLowerCase());

const PAGE_SIZE = 10;

// ─── PAGINATION ───────────────────────────────────────────────────────────────
function usePagination(items, pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  // Clamp if the list shrinks (filter/search/refresh) and we were on a now-empty page.
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);
  return { page: safePage, setPage, totalPages, pageItems, start, count: items.length };
}

function Pagination({ page, totalPages, onChange, start, pageSize, count }) {
  if (totalPages <= 1) return null;

  const nums = [];
  const add = (n) => nums.push(n);
  add(1);
  for (let n = page - 1; n <= page + 1; n++) if (n > 1 && n < totalPages) add(n);
  if (totalPages > 1) add(totalPages);
  const dedup = [...new Set(nums)].sort((a, b) => a - b);

  const rangeEnd = Math.min(start + pageSize, count);

  return (
    <div className="flex items-center justify-between px-5 py-3 border-t bg-gray-50/50">
      <p className="text-xs text-gray-400">
        Showing {count === 0 ? 0 : start + 1}–{rangeEnd} of {count}
      </p>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed">
          Prev
        </button>
        {dedup.map((n, i) => (
          <span key={n} className="flex items-center">
            {i > 0 && n - dedup[i - 1] > 1 && <span className="px-1.5 text-gray-300 text-xs">…</span>}
            <button onClick={() => onChange(n)}
              className={`w-8 h-8 rounded-lg text-xs font-medium transition-all ${
                n === page ? "bg-teal-600 text-white shadow" : "border text-gray-600 hover:bg-white"
              }`}>
              {n}
            </button>
          </span>
        ))}
        <button onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page === totalPages}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border text-gray-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed">
          Next
        </button>
      </div>
    </div>
  );
}


// ─── DELETE CONFIRM MODAL ─────────────────────────────────────────────────────

function DeleteModal({ booking, onClose, onConfirm, deleting }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600">
            <IconTrash className="w-5 h-5" />
          </div>
          <h2 className="font-bold text-lg text-gray-800">Delete Booking</h2>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1">
          <p className="text-sm font-semibold text-amber-800">This will cascade-delete:</p>
          <ul className="text-sm text-amber-700 list-disc ml-4 space-y-0.5">
            <li>The booking record</li>
            <li>Its linked payment (if any)</li>
            <li>All linked reviews (if any)</li>
          </ul>
          <p className="text-xs text-amber-600 mt-2">All records will be archived before deletion and can be found in their respective Archive pages.</p>
        </div>
        <p className="text-sm text-gray-600">
          Are you sure you want to delete booking <span className="font-mono font-semibold text-gray-800">{booking.bookingID || booking.id}</span>?
        </p>
        <div className="flex gap-3 justify-end pt-1">
          <button onClick={onClose} disabled={deleting} className="px-4 py-2 border rounded-xl text-sm disabled:opacity-50">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-red-700 transition-colors"
          >
            {deleting ? "Deleting…" : "Yes, Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── EDIT MODAL ───────────────────────────────────────────────────────────────

function EditModal({ booking, onClose, onSave }) {
  const currentStatus     = booking.status?.toLowerCase() || "";
  const defaultNextStatus = currentStatus === "upcoming" ? "ongoing" : "completed";
  const [form, setForm] = useState({
    location:   booking.location || "",
    notesAdmin: booking.notesAdmin || "",
    status:     defaultNextStatus,
  });
  const [saving, setSaving]                 = useState(false);
  const [error, setError]                   = useState(null);
  const [paymentStatus, setPaymentStatus]   = useState(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const { getToken } = useAuth();

  useEffect(() => {
    const bID = booking.bookingID || booking.id;
    if (!bID || currentStatus !== "upcoming") return;
    setPaymentLoading(true);
    fetch(`${process.env.REACT_APP_API_URL}/api/payments?bookingID=${encodeURIComponent(bID)}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(r => r.json())
      .then(json => {
        const list  = json.data || json.payments || [];
        const match = list.find(p => p.bookingID === bID);
        setPaymentStatus(match?.status ?? null);
      })
      .catch(() => setPaymentStatus(null))
      .finally(() => setPaymentLoading(false));
  }, [booking, currentStatus, getToken]);

  const approvedStatuses = ["approved", "paid"];
  const isApprovingWithUnpaidPayment =
    form.status === "ongoing" &&
    currentStatus === "upcoming" &&
    !paymentLoading &&
    (paymentStatus === null || !approvedStatuses.includes(paymentStatus?.toLowerCase()));

  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/bookings/${booking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to save");
      onSave();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h2 className="font-bold text-lg text-gray-800">Edit Booking</h2>
        <p className="text-xs text-gray-400 font-mono break-all">{booking.bookingID || booking.id}</p>
        {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 p-3 rounded-xl">{error}</div>}
        {form.status === "ongoing" && currentStatus === "upcoming" && (
          paymentLoading ? (
            <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 border border-gray-200 p-3 rounded-xl">
              <IconClock className="w-4 h-4 shrink-0" />
              Checking payment status…
            </div>
          ) : paymentStatus === null ? (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 p-3 rounded-xl">
              <IconBlock className="w-5 h-5 shrink-0 text-red-500 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-700">No payment record found</p>
                <p className="text-xs text-red-600 mt-0.5">Cannot mark as picked up / ongoing — no payment has been submitted for this booking yet.</p>
              </div>
            </div>
          ) : approvedStatuses.includes(paymentStatus?.toLowerCase()) ? (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 p-3 rounded-xl">
              <IconCheck className="w-5 h-5 text-green-600 shrink-0" />
              <p className="text-sm text-green-700 font-medium">Payment is <span className="font-bold">{paymentStatus}</span> — booking can be marked as picked up (ongoing).</p>
            </div>
          ) : (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-300 p-3 rounded-xl">
              <IconWarning className="w-5 h-5 shrink-0 text-amber-500 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Payment not yet approved</p>
                <p className="text-xs text-amber-700 mt-0.5">Payment status is currently <span className="font-bold">"{paymentStatus}"</span>. Go to the <span className="font-semibold">Payments page</span> and approve the payment first.</p>
              </div>
            </div>
          )
        )}
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">Location
            <input className="mt-1 w-full border rounded-xl px-3 py-2 text-sm outline-none" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </label>
          <label className="block text-sm font-medium text-gray-700">Admin Notes
            <textarea rows={3} className="mt-1 w-full border rounded-xl px-3 py-2 text-sm outline-none resize-none" value={form.notesAdmin} onChange={(e) => setForm({ ...form, notesAdmin: e.target.value })} />
          </label>
          <label className="block text-sm font-medium text-gray-700">Status
            <select className="mt-1 w-full border rounded-xl px-3 py-2 text-sm outline-none" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {booking.status?.toLowerCase() === "upcoming" ? (
                <><option value="ongoing">Ongoing (Picked Up)</option><option value="cancelled">Cancelled</option></>
              ) : (
                <><option value="completed">Completed</option><option value="cancelled">Cancelled</option></>
              )}
            </select>
          </label>
        </div>
        <div className="flex gap-3 justify-end pt-2">
          <button onClick={onClose} className="px-4 py-2 border rounded-xl text-sm">Cancel</button>
          <button onClick={handleSave} disabled={saving || isApprovingWithUnpaidPayment} className="px-4 py-2 bg-teal-600 text-white rounded-xl text-sm disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── VIEW DETAILS MODAL ───────────────────────────────────────────────────────

// ─── CUSTOMER PROFILE MODAL ─────────────────────────────────────────────
// Opened from the Customer name in either the table row or ViewModal,
// instead of navigating to /users. Pulls the base user doc (by-uid) and
// the userDetails doc (details) — the same two pieces Customers.jsx's own
// detail view uses for its "Account" and "Personal Details" sections.
// Address/document images live in separate collections with no REST
// endpoint yet, so this stays a lighter, quicker profile than the full
// Customers.jsx view rather than trying to replicate all of it here.
function CustomerProfileModal({ userID, onClose }) {
  const { getToken } = useAuth();
  const [basic, setBasic]     = useState(null);
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    if (!userID) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const headers = { Authorization: `Bearer ${getToken()}` };
    Promise.all([
      fetch(`${process.env.REACT_APP_API_URL}/api/users/by-uid/${userID}`, { headers }).then((r) => r.json()),
      fetch(`${process.env.REACT_APP_API_URL}/api/users/details/${userID}`, { headers }).then((r) => r.json()).catch(() => null),
    ])
      .then(([basicRes, detailsRes]) => {
        if (cancelled) return;
        if (!basicRes?.success) throw new Error(basicRes?.message || "Could not load customer profile.");
        setBasic(basicRes.data);
        // Details 404s for a customer who never filled in personal info —
        // that's a normal state here, not an error worth surfacing.
        setDetails(detailsRes?.success ? detailsRes.data : null);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [userID, getToken]);

  const fullName = details
    ? `${details.firstName || ""} ${details.middleName ? details.middleName + " " : ""}${details.lastName || ""}`.trim()
    : "";

  const refBy = basic?.referral?.referredBy;
  const refByText = refBy
    ? (refBy.removed
        ? `${refBy.code || "—"} (account removed)`
        : (refBy.name && refBy.username ? `${refBy.name} (@${refBy.username})`
          : refBy.name || (refBy.username ? `@${refBy.username}` : refBy.code)))
    : "None";

  const row = (label, value) => (
    <div className="flex justify-between py-2 border-b border-gray-50 last:border-0 text-sm">
      <span className="text-gray-500 font-medium w-32 shrink-0">{label}</span>
      <span className="text-gray-800 text-right break-words">{value || "—"}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-2 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-lg text-gray-800">
            {fullName || basic?.username || "Customer Profile"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <IconX className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-gray-400">Loading…</div>
        ) : error ? (
          <div className="py-8 text-center text-sm text-red-500">{error}</div>
        ) : (
          <div>
            {row("Email",     basic?.email)}
            {row("Phone",     basic?.phone)}
            {row("Username",  basic?.username)}
            {row("Status",    basic?.status)}
            {row("ID Status", basic?.isVerified ? "✓ Verified" : "Pending")}
            {row("Joined",    fmtDate(basic?.createdAt))}
            {row("Referral Code", basic?.referral?.code)}
            {row("Referred By",   refByText)}
            {row("Invited",       String(basic?.referral?.invitedCount || 0))}
            {basic?.referral?.invited?.length > 0 && (
              <ul className="mt-1 mb-1 text-xs text-gray-600 list-disc pl-5 space-y-0.5">
                {basic.referral.invited.map((p) => (
                  <li key={p.id}>{p.name || "—"}{p.username ? ` (@${p.username})` : ""}</li>
                ))}
              </ul>
            )}
            {details && (
              <>
                {row("Birth Date", details.birthDate ? fmtDate(details.birthDate) : "—")}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ViewModal({ booking, onClose, onViewCustomer }) {
  const { fmt } = useCurrency();
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const row = (label, value) => (
    <div className="flex justify-between py-2 border-b border-gray-50 last:border-0 text-sm">
      <span className="text-gray-500 font-medium w-36 shrink-0">{label}</span>
      <span className="text-gray-800 text-right">{value || "—"}</span>
    </div>
  );

  // Inline check: does THIS booking actually have before/after-trip
  // inventory records? Don't just link off to Vehicle Inspections and
  // hope it lands on the right one — that page defaults to a car's
  // nearest/upcoming booking, which for a completed booking is very
  // likely the wrong record entirely.
  const [inventoryCheck, setInventoryCheck]     = useState(null); // { before, after } | null
  const [inventoryLoading, setInventoryLoading] = useState(true);

  useEffect(() => {
    const bID = booking.bookingID || booking.id;
    if (!bID) { setInventoryLoading(false); return; }
    setInventoryLoading(true);
    fetch(`${process.env.REACT_APP_API_URL}/api/inventory/booking/${encodeURIComponent(bID)}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((r) => r.json())
      .then((json) => setInventoryCheck(json.data || { before: null, after: null }))
      .catch(() => setInventoryCheck(null))
      .finally(() => setInventoryLoading(false));
  }, [booking, getToken]);

  const goToHistory = () => {
    navigate("/car-tracking", {
      state: {
        tab: "history",
        carID: booking.carID,
        bookingID: booking.bookingID || booking.id,
      },
    });
  };

  const goToPayments = () => {
    navigate(`/payments?bookingID=${encodeURIComponent(booking.bookingID || booking.id)}`);
  };

  // Vehicle Inspections page (system inventory: before/after-trip part
  // condition + photos) is keyed by carID first, bookingID second — same
  // deep-link shape it already reads elsewhere (?carID=...&bookingID=...).
  const goToInventory = () => {
    const params = new URLSearchParams({
      carID: booking.carID || "",
      bookingID: booking.bookingID || booking.id || "",
    });
    navigate(`/vehicle-documentation?${params.toString()}`);
  };

  // Maintenance.jsx already handles ?carID= (from Fleet.jsx); this reuses
  // that same effect, extended to also pre-fill ?bookingID= and default
  // the basis to "Post-Rental" — see that file's deep-link effect.
  const goToMaintenance = () => {
    const params = new URLSearchParams({
      carID: booking.carID || "",
      bookingID: booking.bookingID || booking.id || "",
    });
    navigate(`/maintenance?${params.toString()}`);
  };

  // Maintenance records already linked to THIS booking (auto-scheduled by
  // postRentalMaintenance.job.js, or filed manually via the button below)
  // — so staff can see at a glance whether post-rental cleaning/repair
  // has already been scheduled instead of guessing or re-filing it.
  const [linkedMaintenance, setLinkedMaintenance] = useState(null); // null = loading
  useEffect(() => {
    const bID = booking.bookingID || booking.id;
    if (!bID) { setLinkedMaintenance([]); return; }
    fetch(`${process.env.REACT_APP_API_URL}/api/maintenance/booking/${encodeURIComponent(bID)}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((r) => r.json())
      .then((json) => setLinkedMaintenance(json.data || []))
      .catch(() => setLinkedMaintenance([]));
  }, [booking, getToken]);

  // Every stop for this booking's trip (pickup, dropoff, any extra stops
  // selected at booking time) — same shape MyTrips.jsx's map already uses.
  // Only ever non-empty once getAllBookings has resolved a session for
  // this booking (see booking.service.js's resolveHistoryInfo).
  const [mapOpen, setMapOpen] = useState(false);
  const locationStops = tripStops(booking);

  // Existing penalties already tied to this booking — same "always shown,
  // even when empty" treatment as Linked Maintenance below, so staff can
  // see at a glance whether anything's been noted against this booking
  // instead of guessing or re-checking on the Penalties page.
  const [linkedPenalties, setLinkedPenalties] = useState(null); // null = loading
  useEffect(() => {
    const bID = booking.bookingID || booking.id;
    if (!bID) { setLinkedPenalties([]); return; }
    fetch(`${process.env.REACT_APP_API_URL}/api/penalties/booking/${encodeURIComponent(bID)}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((r) => r.json())
      .then((json) => setLinkedPenalties(json.data || []))
      .catch(() => setLinkedPenalties([]));
  }, [booking, getToken]);

  // Penalties.jsx is where penalties actually get drafted (see its own
  // CreatePenaltyModal) — this hands it the bookingID via query param so
  // the draft it opens is pre-filled and locked to THIS booking, instead
  // of staff having to copy/type the ID over there themselves.
  const goToNotePenalty = () => {
    navigate(`/penalties?bookingID=${encodeURIComponent(booking.bookingID || booking.id)}`);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg text-gray-800">Booking Details</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <IconX className="w-5 h-5" />
          </button>
        </div>
        <StatusBadge status={booking.status} />

        {/* Two columns side by side: core booking details on the left,
            payment + driving mode (each with a jump-to-page button) on
            the right — instead of one long stacked list where the
            payment/chauffeur rows were easy to scroll past. */}
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            {row("Booking ID",      booking.bookingID || booking.id)}
            <div className="flex justify-between py-2 border-b border-gray-50 last:border-0 text-sm">
              <span className="text-gray-500 font-medium w-36 shrink-0">Customer</span>
              {booking.userID ? (
                <button
                  onClick={() => onViewCustomer(booking.userID)}
                  className="text-indigo-600 hover:underline font-medium text-right"
                >
                  {booking.customerName || "—"}
                </button>
              ) : (
                <span className="text-gray-800 text-right">{booking.customerName || "—"}</span>
              )}
            </div>
            {row("Phone",           booking.phone)}
            {row("Vehicle",         booking.vehicleName)}
            {row("Service Type",    booking.serviceTypeName)}
            {row("Car ID",          booking.carID)}
            {row("Start Date",      fmtDate(booking.startDateTime))}
            {row("End Date",        fmtDate(booking.endDateTime))}
            {row("Duration",        booking.totalDays != null ? `${booking.totalDays} day${booking.totalDays > 1 ? "s" : ""}` : "—")}
            {/* Location — the address string, plus a map (same component
                MyTrips.jsx uses) plotting pickup, dropoff, and any extra
                stops, instead of just printing the raw address text. */}
            <div className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0 text-sm">
              <span className="text-gray-500 font-medium w-36 shrink-0">Location</span>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-gray-800 text-right truncate">{booking.location || "—"}</span>
                {locationStops.length > 0 ? (
                  <button
                    onClick={() => setMapOpen(true)}
                    className="text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg px-2.5 py-1 transition-colors shrink-0"
                  >
                    View Map →
                  </button>
                ) : (
                  <span className="text-xs text-gray-300 shrink-0">No map data</span>
                )}
              </div>
            </div>
          </div>

          <div>
            {row("Rental Fee",  fmt(booking.rentalFee))}
            {row("Service Fee", fmt(booking.serviceFee))}
            {Number(booking.gatewayFee) > 0 && row("Gateway Fee", fmt(booking.gatewayFee))}
            {row("Extra Fee",   fmt(booking.extraFee))}
            {Number(booking.driversFee) > 0 && row("Driver's Fee", fmt(booking.driversFee))}
            {/* Refundable security deposit — charged inside the booking total
                and marked Held (payments.deposit) once the first payment
                settles; Penalties settles against it at Return. */}
            {row("Security Deposit", booking.paymentStatus === "Refunded" && booking.securityDeposit > 0
              ? `${fmt(booking.securityDeposit)} · Refunded`
              : booking.deposit
                ? (booking.deposit.status === "Waived"
                    ? "Waived"
                    : `${fmt(booking.deposit.amount)} · ${booking.deposit.status || "Held"}`)
                : Number(booking.securityDeposit) > 0
                  ? `${fmt(booking.securityDeposit)} · Awaiting payment`
                  : "Not collected")}
            {row("Total Fee",   fmt(booking.totalFee))}

            {/* Payment Method — paired with a jump straight to the matching
                Payments record instead of just showing the method as inert
                text, since "what's the actual payment status/proof" is the
                natural next question. Payments.jsx already supports
                ?bookingID= to pre-filter to this booking (same pattern as
                goToHistory's Car Tracking link below). */}
            <div className="flex justify-between items-center py-2 border-b border-gray-50 text-sm">
              <span className="text-gray-500 font-medium w-28 shrink-0">Payment</span>
              <div className="flex items-center gap-2">
                <span className="text-gray-800">{booking.paymentMethod || "—"}</span>
                <button
                  onClick={goToPayments}
                  className="text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg px-2.5 py-1 transition-colors shrink-0"
                >
                  View →
                </button>
              </div>
            </div>

            {/* Mode of Driving (Self-drive / With Chauffeur) — when a
                chauffeur is involved, jump straight to Driver Dispatch to
                see or assign one, same idea as the payment button above. */}
            <div className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0 text-sm">
              <span className="text-gray-500 font-medium w-28 shrink-0">Driving</span>
              <div className="flex items-center gap-2">
                <span className="text-gray-800">{booking.modeOfDriving || "—"}</span>
                {booking.modeOfDriving?.toLowerCase().includes("chauffeur") && (
                  <button
                    onClick={() => navigate("/driver-dispatch", {
                      state: { assignBookingId: booking.bookingID || booking.id, assignCustomerName: booking.customerName },
                    })}
                    className="text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg px-2.5 py-1 transition-colors shrink-0"
                  >
                    View →
                  </button>
                )}
              </div>
            </div>

            {/* Driver — the actual chauffeur assigned via Driver Dispatch
                (booking.driverID, resolved to a name/phone by
                getAllBookings), or an explicit "No driver assigned" so an
                unassigned chauffeur booking never just looks like a
                blank/missing field. */}
            <div className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0 text-sm">
              <span className="text-gray-500 font-medium w-28 shrink-0">Driver</span>
              {booking.driverID ? (
                <span className="text-gray-800 text-right">
                  {booking.driverName || "—"}
                  {booking.driverPhone && booking.driverPhone !== "—" ? ` · ${booking.driverPhone}` : ""}
                </span>
              ) : (
                <span className="text-gray-400 italic text-right">No driver assigned</span>
              )}
            </div>

            {/* System Inventory — before/after-trip part condition, checked
                inline against THIS booking's own records (not a link that
                assumes you'll land on the right one — Vehicle Inspections'
                own deep-link picks a car's nearest/upcoming booking, which
                for a past booking is very likely a different one).
                The jump-to-inspection action lives here now instead of as
                its own top "Inspect Vehicle" button — same goToInventory
                target either way, just worded as "Inspect Vehicle" when
                nothing's recorded yet vs "View full record" once it is, so
                there's one action for this, not two doing the same thing. */}
            <div className="py-2 border-b border-gray-50 last:border-0 text-sm space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-gray-500 font-medium w-28 shrink-0">Inventory</span>
                {inventoryLoading && (
                  <span className="text-xs text-gray-400 italic">Checking…</span>
                )}
              </div>

              {!inventoryLoading && !inventoryCheck?.before && !inventoryCheck?.after && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-300">Not recorded</span>
                  <button
                    onClick={goToInventory}
                    className="text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg px-2.5 py-1 transition-colors"
                  >
                    📸 Inspect Vehicle →
                  </button>
                </div>
              )}

              {!inventoryLoading && (inventoryCheck?.before || inventoryCheck?.after) && (
                <div className="flex flex-col gap-1 pl-0">
                  {["before", "after"].map((slot) => {
                    const rec = inventoryCheck?.[slot];
                    if (!rec) {
                      return (
                        <div key={slot} className="flex justify-between items-center text-xs text-gray-300">
                          <span className="capitalize">{slot}-trip</span>
                          <span>Not recorded</span>
                        </div>
                      );
                    }
                    const hasDamage = rec.inventoryOverallStatus === "has damage";
                    return (
                      <div key={slot} className="flex justify-between items-center text-xs">
                        <span className="capitalize text-gray-500">{slot}-trip</span>
                        <span className={`font-semibold ${hasDamage ? "text-red-600" : "text-green-600"}`}>
                          {hasDamage ? `Has damage (${rec.damageParts?.length || 0})` : "Good"}
                        </span>
                      </div>
                    );
                  })}
                  <button
                    onClick={goToInventory}
                    className="self-end text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg px-2.5 py-1 transition-colors mt-1"
                  >
                    View full record →
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Notes / additional info — full width beneath the two columns. */}
        <div className="pt-1 border-t border-gray-100">
          {row("Notes (User)",    booking.notesUser)}
          {row("Notes (Admin)",   booking.notesAdmin)}
        </div>

        {/* Trip History — always shown, not just when history exists, so it's
            clear whether this booking's GPS trail was ever archived. */}
        <div className="flex justify-between items-center py-2.5 px-3 rounded-xl bg-gray-50 border border-gray-100">
          <div>
            <p className="text-sm font-medium text-gray-700">Trip History</p>
            <p className="text-xs text-gray-400">
              {booking.hasHistory ? "GPS trail available for playback" : "No archived GPS trail for this booking"}
            </p>
          </div>
          {booking.hasHistory ? (
            <button
              onClick={goToHistory}
              className="text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg px-3 py-1.5 transition-colors shrink-0"
            >
              View in Car Tracking →
            </button>
          ) : (
            <span className="text-xs text-gray-300 shrink-0">—</span>
          )}
        </div>

        {/* Linked Maintenance — same "always shown" treatment as Trip
            History above, so an empty state is a deliberate "none yet",
            not a section that silently disappears. */}
        <div className="flex justify-between items-center py-2.5 px-3 rounded-xl bg-gray-50 border border-gray-100">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-700">Linked Maintenance</p>
            {linkedMaintenance === null ? (
              <p className="text-xs text-gray-400">Loading…</p>
            ) : linkedMaintenance.length === 0 ? (
              <p className="text-xs text-gray-400">No maintenance record linked to this booking yet</p>
            ) : (
              <ul className="mt-1 space-y-0.5">
                {linkedMaintenance.map((m) => (
                  <li key={m.id} className="text-xs text-gray-600">
                    {m.basis} — <span className={m.status === "Completed" ? "text-green-600" : "text-amber-600"}>{m.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            onClick={goToMaintenance}
            className="text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg px-3 py-1.5 transition-colors shrink-0"
          >
            {linkedMaintenance?.length ? "View / add another →" : "+ Post-Rental Maintenance"}
          </button>
        </div>

        {/* Penalties already noted against this booking — same "always
            shown" treatment as Trip History / Linked Maintenance above.
            "Note a Penalty" hands off to Penalties.jsx (see goToNotePenalty)
            with the bookingID pre-filled and locked, so the penalty it
            creates is guaranteed to link back to this exact booking. A
            penalty is confirmed and the customer notified the instant
            it's created there — no Draft step in between anymore. */}
        <div className="flex justify-between items-center py-2.5 px-3 rounded-xl bg-gray-50 border border-gray-100">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-700">Penalties</p>
            {linkedPenalties === null ? (
              <p className="text-xs text-gray-400">Loading…</p>
            ) : linkedPenalties.length === 0 ? (
              <p className="text-xs text-gray-400">No penalty noted against this booking yet</p>
            ) : (
              <ul className="mt-1 space-y-0.5">
                {linkedPenalties.map((p) => (
                  <li key={p.penaltyID} className="text-xs text-gray-600">
                    {fmt(p.amount)} — <span className={
                      p.status === "Confirmed" ? "text-green-600"
                      : "text-gray-400"
                    }>{p.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            onClick={goToNotePenalty}
            className="text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 rounded-lg px-3 py-1.5 transition-colors shrink-0"
          >
            {linkedPenalties?.length ? "View / note another →" : "+ Note a Penalty"}
          </button>
        </div>

        <button onClick={onClose} className="w-full mt-2 py-2 border rounded-xl text-sm">Close</button>
      </div>

      <TripMapModal
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        title={`${booking.customerName || "Booking"} — ${booking.vehicleName || ""}`}
        stops={locationStops}
      />
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function Bookings() {
  const { fmt } = useCurrency();
  const { getToken } = useAuth();
  const [activeTab, setActiveTab]           = useState("All");
  const [search, setSearch]                 = useState("");
  const [allBookings, setAllBookings]       = useState([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState(null);
  const [viewBooking, setViewBooking]       = useState(null);
  const [editBooking, setEditBooking]       = useState(null);
  const [deleteBooking, setDeleteBooking]   = useState(null);
  const [deleting, setDeleting]             = useState(false);
  const [deleteToast, setDeleteToast]       = useState(null);
  // Customer name → profile modal, in place, instead of navigating to /users.
  // Shared by both the table row and ViewModal (ViewModal passes its own
  // trigger down to this same modal via the userID it's given).
  const [profileUserID, setProfileUserID]   = useState(null);
  const [searchParams, setSearchParams]     = useSearchParams();
  const [sortKey, setSortKey]               = useState(null);  // null = default/unsorted (API order)
  const [sortDir, setSortDir]               = useState("asc");

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const showToast = (msg, type = "success") => {
    setDeleteToast({ msg, type });
    setTimeout(() => setDeleteToast(null), 4000);
  };

  // `silent` skips the loading spinner — used by the live-refresh listener below
  // so a change from another admin/customer doesn't flash the whole table blank.
  const fetchBookings = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/bookings?status=all`, { headers: { Authorization: `Bearer ${getToken()}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Failed to load bookings");
      setAllBookings(json.data);
    } catch (err) { if (!silent) setError(err.message); }
    finally { if (!silent) setLoading(false); }
  }, [getToken]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  // ── Live refresh ────────────────────────────────────────────────────────────
  // The REST endpoint does all the real work (joins car/user/driver info, sorts,
  // filters), so instead of re-implementing that here off raw Firestore docs,
  // we just listen for *any* change to the bookings collection and re-run the
  // existing fetch. Bursts of writes (e.g. a booking + its history doc changing
  // together) are coalesced with a short debounce so we don't hammer the API.
  const refetchTimer = useRef(null);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "bookings"), () => {
      clearTimeout(refetchTimer.current);
      refetchTimer.current = setTimeout(() => fetchBookings(true), 400);
    });
    return () => { unsub(); clearTimeout(refetchTimer.current); };
  }, [fetchBookings]);

  // Opens a specific status tab when linked in via ?tab=<Upcoming|Ongoing|...>
  // (used by Dashboard's stat cards). Runs once, on mount — doesn't need to
  // wait on bookings to load like ?open= below does.
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (!tabParam) return;
    const match = STATUS_TABS.find((t) => t.toLowerCase() === tabParam.toLowerCase());
    if (match) setActiveTab(match);
    setSearchParams((prev) => { prev.delete("tab"); return prev; }, { replace: true });
  }, [searchParams, setSearchParams]);

  // Opens the exact booking a notification click pointed to (?open=<refID>,
  // set by Header.jsx). Runs once bookings are loaded so the record is
  // actually there to find; strips the param afterward so refreshing/
  // navigating away doesn't keep re-opening it.
  useEffect(() => {
    const openID = searchParams.get("open");
    if (!openID || loading || allBookings.length === 0) return;
    const match = allBookings.find((b) => b.id === openID || b.bookingID === openID);
    if (match) setViewBooking(match);
    setSearchParams((prev) => { prev.delete("open"); return prev; }, { replace: true });
  }, [searchParams, allBookings, loading, setSearchParams]);

  const handleDeleteConfirm = async () => {
    if (!deleteBooking) return;
    setDeleting(true);
    try {
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/bookings/${deleteBooking.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Delete failed.");
      setAllBookings((prev) => prev.filter((b) => b.id !== deleteBooking.id));
      showToast(`Booking archived and deleted. ${json.data?.reviewsArchivedCount > 0 ? `${json.data.reviewsArchivedCount} review(s) also archived.` : ""}`, "success");
      setDeleteBooking(null);
    } catch (err) { showToast(err.message, "error"); }
    finally { setDeleting(false); }
  };

  const counts = {
    All:       allBookings.length,
    "To Pay":  allBookings.filter((b) => b.status?.toLowerCase() === "to pay").length,
    Upcoming:  allBookings.filter((b) => b.status?.toLowerCase() === "upcoming").length,
    Ongoing:   allBookings.filter((b) => b.status?.toLowerCase() === "ongoing").length,
    Cancelled: allBookings.filter((b) => b.status?.toLowerCase() === "cancelled").length,
    Completed: allBookings.filter((b) => b.status?.toLowerCase() === "completed").length,
  };
  const cancellationRequestCount = allBookings.filter((b) => b.status?.toLowerCase() === "cancellation_request").length;

  const tabFiltered  = activeTab === "All"
    ? allBookings
    : allBookings.filter((b) => b.status?.toLowerCase() === activeTab.toLowerCase());

  const filtered = tabFiltered.filter((b) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (b.bookingID || b.id || "").toLowerCase().includes(q) ||
      (b.customerName || "").toLowerCase().includes(q) ||
      (b.vehicleName || "").toLowerCase().includes(q) ||
      (b.phone || "").toLowerCase().includes(q)
    );
  });

  // Sort (dates/fee only — everything else stays in API/insertion order).
  // Applied after search+tab filtering, before pagination, so page counts
  // reflect the sorted set and Page 1 always shows the "top" of the sort.
  const sorted = [...filtered].sort((a, b) => {
    if (!sortKey) return 0;
    let av, bv;
    if (sortKey === "dates") { av = toMillis(a.startDateTime); bv = toMillis(b.startDateTime); }
    else if (sortKey === "fee") { av = a.totalFee ?? -Infinity; bv = b.totalFee ?? -Infinity; }
    else return 0;
    return sortDir === "asc" ? av - bv : bv - av;
  });

  const { page, setPage, totalPages, pageItems, start, count } = usePagination(sorted);
  // Jump back to page 1 whenever the visible set changes shape (new search/filter/tab).
  useEffect(() => { setPage(1); }, [search, activeTab, allBookings]); // eslint-disable-line react-hooks/exhaustive-deps

  const fmtDuration = (days) => { if (days == null) return "—"; return days <= 1 ? `${days} day` : `${days} days`; };

  return (
    <div className="p-4 space-y-5 font-sans">

      {/* TOAST */}
      {deleteToast && (
        <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${deleteToast.type === "error" ? "bg-red-500" : "bg-teal-600"}`}>
          {deleteToast.msg}
        </div>
      )}

      {/* STAT TABS */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {STATUS_TABS.map((tab) => {
          const TabIcon = TAB_ICON[tab];
          return (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`p-4 rounded-2xl border text-left transition-all ${activeTab === tab ? "border-teal-500 bg-teal-50 shadow-sm" : "bg-white hover:bg-gray-50"}`}
            >
              <div className="flex items-start justify-between">
                <div className={`text-2xl font-bold ${activeTab === tab ? "text-teal-600" : "text-gray-800"}`}>{loading ? "…" : counts[tab] ?? 0}</div>
                <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${TAB_ICON_COLOR[tab]}`}>
                  <TabIcon className="w-4 h-4" />
                </span>
              </div>
              <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                {tab === "All" ? "All Bookings" : tab}
                {tab === "Cancelled" && cancellationRequestCount > 0 && <span className="w-2 h-2 bg-red-500 rounded-full inline-block" />}
              </div>
            </button>
          );
        })}
      </div>

      {/* SEARCH */}
      <div className="flex gap-3 items-center bg-white p-4 rounded-2xl border">
        <input
          type="text"
          placeholder="Search by booking ID, customer, vehicle, phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 px-4 py-2 border rounded-xl text-sm outline-none"
        />
        <button
          onClick={fetchBookings}
          className="px-4 py-2 border rounded-xl text-sm text-teal-600 font-medium hover:bg-teal-50 flex items-center gap-1.5"
        >
          <IconRefresh className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex justify-between items-center">
          <span className="flex items-center gap-2">
            <IconWarning className="w-4 h-4 shrink-0" />
            {error}
          </span>
          <button onClick={fetchBookings} className="underline font-semibold">Retry</button>
        </div>
      )}

      {/* TABLE */}
      <div className="bg-white rounded-2xl border overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">
            {activeTab === "All" ? "All Bookings" : `${activeTab} Bookings`}
            <span className="text-gray-400 text-sm font-normal ml-2">{filtered.length} results</span>
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Booking ID</th>
                <th className="px-4 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-left">Vehicle</th>
                <SortableTh label="Dates" sortKey="dates" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
                <th className="px-4 py-3 text-left">Duration</th>
                <SortableTh label="Total Fee" sortKey="fee" sortKeyState={sortKey} sortDir={sortDir} onSort={handleSort} />
                <th className="px-4 py-3 text-left">Payment</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-t">
                    {Array.from({ length: 9 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center text-gray-400 py-12">No bookings found</td></tr>
              ) : (
                pageItems.map((b) => {
                  const needsAction = b.status?.toLowerCase() === "cancellation_request";
                  return (
                    <tr key={b.id} className={`border-t hover:bg-gray-50 transition-colors ${needsAction ? "bg-orange-50 border-l-4 border-l-orange-500" : ""}`}>
                      <td className="px-4 py-3 text-gray-700 text-xs">
                        {b.bookingID || b.id}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setProfileUserID(b.userID)}
                          disabled={!b.userID}
                          className="font-medium text-gray-800 hover:text-indigo-600 hover:underline text-left disabled:no-underline disabled:cursor-default disabled:hover:text-gray-800"
                        >
                          {b.customerName}
                        </button>
                        <div className="text-xs text-gray-400">{b.phone}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-gray-700">{b.vehicleName}</div>
                        <div className="text-xs text-gray-400">{b.serviceTypeName}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(b.startDateTime)} – {fmtDate(b.endDateTime)}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {fmtDuration(b.totalDays)}
                        {b.durationType && <span className="text-xs text-gray-400 ml-1">· {b.durationType}</span>}
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-800">{fmt(b.totalFee)}</td>
                      <td className="px-4 py-3 text-gray-600">{b.paymentMethod}</td>
                      <td className="px-4 py-3"><StatusBadge status={b.status} /></td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => setViewBooking(b)} className="px-3 py-1 border rounded-lg text-xs hover:bg-gray-50">View</button>
                          <button
                            onClick={() => canEdit(b.status) && setEditBooking(b)}
                            disabled={isLocked(b.status)}
                            className={`px-3 py-1 border rounded-lg text-xs transition-colors ${isLocked(b.status) ? "border-gray-200 text-gray-300 cursor-not-allowed" : "border-teal-400 text-teal-600 hover:bg-teal-50"}`}
                          >Edit</button>
                          <button
                            onClick={() => setDeleteBooking(b)}
                            className="px-3 py-1 border border-red-200 text-red-500 rounded-lg text-xs hover:bg-red-50 transition-colors"
                          >Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={totalPages} onChange={setPage} start={start} pageSize={PAGE_SIZE} count={count} />
      </div>

      {viewBooking   && <ViewModal booking={viewBooking} onClose={() => setViewBooking(null)} onViewCustomer={setProfileUserID} />}
      {editBooking   && <EditModal booking={editBooking} onClose={() => setEditBooking(null)} onSave={() => { setEditBooking(null); fetchBookings(); }} />}
      {profileUserID && <CustomerProfileModal userID={profileUserID} onClose={() => setProfileUserID(null)} />}
      {deleteBooking && (
        <DeleteModal
          booking={deleteBooking}
          onClose={() => !deleting && setDeleteBooking(null)}
          onConfirm={handleDeleteConfirm}
          deleting={deleting}
        />
      )}
    </div>
  );
}