import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../../firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";

/* ── Icons ── */
const BellIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-arl-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
  </svg>
);

const XIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

/* ── Helpers ── */
const timeAgo = (ts) => {
  if (!ts) return "";
  let date;
  if (typeof ts?.toDate === "function") date = ts.toDate();
  else if (ts?._seconds !== undefined) date = new Date(ts._seconds * 1000);
  else date = new Date(ts);
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

// Every booking-related notification type the customer backend/admin
// backend write into the shared "notifications" collection (see
// customer-backend's models/notification/notification.model.js for the
// full list + which flow creates each one). Same shape as the admin
// header's META_BY_TYPE: a tinted circle (`bg`) with an emoji, and the title.
const META_BY_TYPE = {
  booking_created:     { bg: "bg-teal-100",    emoji: "📅", title: "Booking Created" },
  payment_pending:     { bg: "bg-amber-100",   emoji: "💳", title: "Payment Pending" },
  payment_successful:  { bg: "bg-green-100",   emoji: "💰", title: "Payment Successful" },
  payment_failed:      { bg: "bg-red-100",     emoji: "❌", title: "Payment Failed" },
  booking_confirmed:   { bg: "bg-blue-100",    emoji: "✅", title: "Booking Confirmed" },
  upcoming_booking:    { bg: "bg-indigo-100",  emoji: "📅", title: "Upcoming Booking" },
  booking_reminder:    { bg: "bg-indigo-100",  emoji: "⏰", title: "Booking Reminder" },
  booking_cancelled:   { bg: "bg-red-100",     emoji: "🚫", title: "Booking Cancelled" },
  booking_expired:     { bg: "bg-orange-100",  emoji: "⌛", title: "Booking Expired" },
  booking_rescheduled: { bg: "bg-purple-100",  emoji: "🔄", title: "Booking Rescheduled" },
  refund_approved:     { bg: "bg-emerald-100", emoji: "💸", title: "Refund Approved" },
  refund_rejected:     { bg: "bg-red-100",     emoji: "❌", title: "Refund Rejected" },
  refund_completed:    { bg: "bg-emerald-100", emoji: "💰", title: "Refund Completed" },
  // Written by the admin app when a deposit or discount payout is started (depositReturn.service.js). The notification's own
  // message says which one (deposit or discount); it is confirmed later by refund_completed.
  deposit_return_processing: { bg: "bg-amber-100", emoji: "💸", title: "Return in Progress" },
  // Written by the ADMIN app when the driver taps "On my way" (refID = the bookingID). Opens the temporary arrival page
  // (car + plate number), not the booking details -- see handleOpen.
  driver_en_route:     { bg: "bg-green-100",   emoji: "🚗", title: "Your Driver Is On The Way" },
  refund_failed:       { bg: "bg-red-100",     emoji: "⚠️", title: "Refund Failed" },
  // Written by the ADMIN app when staff record / update a traffic notice or check a handover
  // (refID = the bookingID, so tapping the card opens that booking's details, where the notice
  // and the handover are shown). Contract: customer backend docs/violations-and-handover-contract.md
  violation_recorded:  { bg: "bg-red-100",     emoji: "🚨", title: "Traffic Notice Recorded" },
  handover_verified:   { bg: "bg-green-100",   emoji: "✅", title: "Handover Checked" },
  discount_applied:    { bg: "bg-pink-100",    emoji: "🏷️", title: "Discount Applied" },
  // Written by the admin app's penalty.service.js (notifyCustomer). Lands on BookingDetails, whose
  // "Security Deposit & Penalties" card lists each charge, what was deducted and what comes back.
  PenaltyConfirmed:    { bg: "bg-red-100",     emoji: "⚠️", title: "Penalty Added" },
  PenaltyWaived:       { bg: "bg-emerald-100", emoji: "✅", title: "Penalty Waived" },
  PenaltyVoided:       { bg: "bg-gray-200",    emoji: "↩️", title: "Penalty Removed" },
  // Written by the ADMIN app (services/terms/terms.service.js → notifyAllUsers) to every
  // user when a new Terms & Conditions version is published. refID is the new termsVersionID,
  // but tapping it opens the CURRENT terms page, not a booking (see handleOpen).
  terms_updated:       { bg: "bg-blue-100",    emoji: "📄", title: "Terms & Conditions Updated" },
};

/* ── Notification Row ── */
function NotifRow({ n, onOpen, onDelete }) {
  const meta = META_BY_TYPE[n.type] || { bg: "bg-gray-100", emoji: "🔔", title: n.title || "Notification" };
  const unread = !n.isRead;
  const title = n.type === "deposit_return_processing" && n.title ? n.title : meta.title;

  return (
    <div className={`flex items-start gap-2 pl-3 pr-4 py-3.5 hover:bg-teal-50 transition-colors ${unread ? "bg-teal-50/60" : "bg-white"}`}>
      {/* unread dot (blank spacer when read so rows stay aligned) */}
      <span
        className={`w-2 h-2 rounded-full shrink-0 mt-4 ${unread ? "bg-teal-500" : "bg-transparent"}`}
        title={unread ? "Unread" : "Read"}
      />
      <button
        onClick={() => onOpen(n)}
        className="flex items-start gap-3 flex-1 min-w-0 text-left"
      >
        <div className="flex-1 min-w-0">
          <p className={`text-sm leading-snug ${unread ? "font-semibold text-gray-800" : "font-medium text-gray-500"}`}>{title}</p>
          <p className={`text-xs mt-0.5 leading-relaxed ${unread ? "text-gray-600" : "text-gray-400"}`}>{n.message}</p>
          <p className="text-xs text-gray-400 mt-1">{timeAgo(n.createdAt)}</p>
        </div>
      </button>

      <button
        onClick={(e) => { e.stopPropagation(); onDelete(n.id); }}
        className="text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full p-1.5 shrink-0 transition-colors"
        title="Delete notification"
        aria-label="Delete notification"
      >
        <XIcon />
      </button>
    </div>
  );
}

/* ── Notification Dropdown ── */
const EMPTY_TEXT = { all: "No notifications", unread: "No unread notifications" };

function NotificationDropdown({ notifications, tab, onTab, error, onOpen, onDelete, onMarkAllRead, onClear, onClose }) {
  const unread = notifications.filter((n) => !n.isRead);
  const shown  = tab === "unread" ? unread : notifications;

  const tabs = [
    { key: "all",    label: "All",    count: notifications.length },
    { key: "unread", label: "Unread", count: unread.length },
  ];

  return (
    <>
      {/* Mobile-only dim backdrop so the sheet reads as a distinct layer
          and gives an obvious, large tap target to dismiss. Hidden on
          sm+ where the panel is a small anchored dropdown instead. */}
      <div
        className="fixed inset-0 z-40 bg-black/20 sm:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Mobile: fixed sheet pinned to the viewport (with side margins)
          so its width/position never depends on where the bell sits in
          the header. sm+: dropdown anchored under the bell, same as the
          admin header's. */}
      <div
        className="fixed left-3 right-3 top-[72px] z-50
                   sm:absolute sm:inset-auto sm:left-auto sm:right-0 sm:top-full sm:mt-2
                   sm:w-96 sm:max-w-[92vw]
                   bg-white rounded-2xl shadow-card border overflow-hidden"
      >
        <div className="px-5 pt-3 border-b bg-gray-50">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-gray-800 text-sm flex items-center gap-2">
              Notifications
              <span className="text-[11px] font-semibold text-gray-500 bg-gray-200 rounded-full px-2 py-0.5">{notifications.length}</span>
            </span>
            <div className="flex items-center gap-3">
              {unread.length > 0 && (
                <button onClick={onMarkAllRead} className="text-xs font-semibold text-teal-600 hover:text-teal-700">
                  Mark all read
                </button>
              )}
              {tab !== "unread" && shown.length > 0 && (
                <button onClick={() => onClear("all")} className="text-xs font-semibold text-red-500 hover:text-red-600">
                  Clear all
                </button>
              )}
              <button
                onClick={onClose}
                className="sm:hidden text-gray-400 hover:text-gray-600 p-1 -m-1"
                aria-label="Close notifications"
              >
                <XIcon />
              </button>
            </div>
          </div>

          <div className="flex gap-1 mt-2">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => onTab(t.key)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg border-b-2 transition-colors ${
                  tab === t.key ? "text-teal-700 border-teal-500" : "text-gray-400 border-transparent hover:text-gray-600"
                }`}
              >
                {t.label} <span className="ml-0.5">{t.count}</span>
              </button>
            ))}
          </div>
        </div>

        {error && <p className="px-5 py-2 text-xs text-red-600 bg-red-50 border-b border-red-100">{error}</p>}

        <div className="max-h-[65vh] sm:max-h-96 overflow-y-auto divide-y divide-gray-50">
          {shown.length === 0 ? (
            <div className="py-10 flex flex-col items-center gap-2 text-gray-400">
              <p className="text-sm">{EMPTY_TEXT[tab]}</p>
            </div>
          ) : (
            shown.map((n) => (
              <NotifRow key={n.id} n={n} onOpen={onOpen} onDelete={onDelete} />
            ))
          )}
        </div>

        {notifications.length > 0 && (
          <div className="px-5 py-3 border-t bg-gray-50 text-xs text-gray-400 text-center">
            Bookings · Payments · Reminders · Updates
          </div>
        )}
      </div>
    </>
  );
}

/* ── Main Notification Panel ── */
export default function NotificationPanel({ user }) {
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen]         = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notifTab, setNotifTab]           = useState("all"); // "all" | "unread"
  const [notifError, setNotifError]       = useState("");
  const notifRef = useRef(null);

  // Live listener, scoped to this customer's own userID — mirrors the
  // admin bell's own query in Header.jsx one-for-one, just pointed at the
  // customer's booking-related types instead of staff-facing ones.
  useEffect(() => {
    if (!user?.userID) {
      setNotifications([]);
      return;
    }

    const unsub = onSnapshot(
      query(
        collection(db, "notifications"),
        where("status", "==", "active"),
        where("userID", "==", user.userID)
      ),
      (snap) => {
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
        setNotifications(rows);
      }
    );

    return () => unsub();
  }, [user?.userID]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (!user?.userID) return null;

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const hasNew      = unreadCount > 0;

  // Opening the bell no longer marks everything read (it used to, which made every
  // notification look "read" the instant the panel was opened, so there was no way to
  // tell new from old — same change the admin header made). A notification is marked
  // read when it's clicked (see handleOpen), or all at once with "Mark all read".
  // Read state lives in Firestore, so it's the same on every device.
  const handleBellClick = () => setNotifOpen((v) => !v);

  const showNotifError = (msg) => {
    setNotifError(msg);
    setTimeout(() => setNotifError(""), 4000);
  };

  const markRead = (n) => {
    if (n.isRead) return;
    updateDoc(doc(db, "notifications", n.id), { isRead: true }).catch(() => {});
  };

  const handleMarkAllRead = async () => {
    try {
      await Promise.all(
        notifications
          .filter((n) => !n.isRead)
          .map((n) => updateDoc(doc(db, "notifications", n.id), { isRead: true }))
      );
    } catch {
      showNotifError("Couldn't mark notifications as read. Try again.");
    }
  };

  // Click → mark read, then go to the right page. Every current notification type points
  // at the booking's own details page, where "Pay Now" already lives as a real link (see
  // BookingDetails.jsx) once a checkout session exists.
  //
  // Exceptions: a Terms & Conditions update isn't about a booking — it opens the current
  // Terms page. No ?v= on purpose: /terms?v=<id> is the "version you accepted" view (with a
  // banner saying so), whereas here the customer should read the NEW terms. And "driver on
  // the way" opens the temporary arrival page (car + plate number).
  const handleOpen = (n) => {
    markRead(n);
    setNotifOpen(false);
    if (n.type === "terms_updated") {
      navigate("/terms");
      return;
    }
    if (n.type === "driver_en_route" && n.refID) {
      navigate(`/booking/${n.refID}/arrival`);
      return;
    }
    // Nothing to open for a notification without a booking — it is just marked read.
    if (n.refID) navigate(`/booking/${n.refID}/details`);
  };

  const handleDelete = async (notifID) => {
    try {
      await deleteDoc(doc(db, "notifications", notifID));
    } catch {
      showNotifError("Couldn't delete that notification. Try again.");
    }
  };

  // scope "all" clears every notification of this account; "read" only the ones already read.
  const handleClear = async (scope) => {
    const targets = scope === "read" ? notifications.filter((n) => n.isRead) : notifications;
    if (targets.length === 0) return;
    const what = scope === "read" ? "read notification" : "notification";
    if (!window.confirm(`Delete ${targets.length} ${what}${targets.length === 1 ? "" : "s"}? This can't be undone.`)) return;
    try {
      await Promise.all(targets.map((n) => deleteDoc(doc(db, "notifications", n.id))));
    } catch {
      showNotifError("Couldn't clear notifications. Try again.");
    }
  };

  return (
    <div className="relative" ref={notifRef}>
      <button
        onClick={handleBellClick}
        className="relative w-10 h-10 flex items-center justify-center rounded-full bg-arl-light border hover:bg-teal-50 transition-colors"
        aria-label="Notifications"
      >
        <BellIcon />
        {hasNew && (
          <>
            <span className="absolute -top-1 -right-1 min-w-[1rem] h-4 rounded-full bg-red-500 animate-ping opacity-60" />
            <span className="absolute -top-1 -right-1 min-w-[1rem] h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          </>
        )}
      </button>

      {notifOpen && (
        <NotificationDropdown
          notifications={notifications}
          tab={notifTab}
          onTab={setNotifTab}
          error={notifError}
          onOpen={handleOpen}
          onDelete={handleDelete}
          onMarkAllRead={handleMarkAllRead}
          onClear={handleClear}
          onClose={() => setNotifOpen(false)}
        />
      )}
    </div>
  );
}
