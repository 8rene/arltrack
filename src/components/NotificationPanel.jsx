import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
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
  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
// full list + which flow creates each one). `badge` drives the status
// pill shown on each card, `action` drives the CTA button — both are
// exactly what the customer needs to know: what happened, and what (if
// anything) they should do next.
const META_BY_TYPE = {
  booking_created: {
    bg: "bg-teal-100", emoji: "📅", title: "Booking Created",
    badge: { text: "Created", className: "bg-teal-50 text-teal-700" },
    action: "View Booking",
  },
  payment_pending: {
    bg: "bg-amber-100", emoji: "⏳", title: "Payment Pending",
    badge: { text: "Awaiting Payment", className: "bg-amber-50 text-amber-700" },
    action: "Pay Now",
  },
  payment_successful: {
    bg: "bg-green-100", emoji: "✅", title: "Payment Successful",
    badge: { text: "Paid", className: "bg-green-50 text-green-700" },
    action: "View Details",
  },
  payment_failed: {
    bg: "bg-red-100", emoji: "❌", title: "Payment Failed",
    badge: { text: "Failed", className: "bg-red-50 text-red-700" },
    action: "Try Again",
  },
  booking_confirmed: {
    bg: "bg-blue-100", emoji: "🎉", title: "Booking Confirmed",
    badge: { text: "Confirmed", className: "bg-blue-50 text-blue-700" },
    action: "View Booking",
  },
  upcoming_booking: {
    bg: "bg-indigo-100", emoji: "🚗", title: "Upcoming Booking",
    badge: { text: "Upcoming", className: "bg-indigo-50 text-indigo-700" },
    action: "View Booking",
  },
  booking_reminder: {
    bg: "bg-indigo-100", emoji: "⏰", title: "Booking Reminder",
    badge: { text: "Starting Soon", className: "bg-indigo-50 text-indigo-700" },
    action: "View Booking",
  },
  booking_cancelled: {
    bg: "bg-gray-200", emoji: "🚫", title: "Booking Cancelled",
    badge: { text: "Cancelled", className: "bg-gray-100 text-gray-600" },
    action: "View Details",
  },
  booking_expired: {
    bg: "bg-orange-100", emoji: "⌛", title: "Booking Expired",
    badge: { text: "Expired", className: "bg-orange-50 text-orange-700" },
    action: "View Details",
  },
  booking_rescheduled: {
    bg: "bg-purple-100", emoji: "🔄", title: "Booking Rescheduled",
    badge: { text: "Rescheduled", className: "bg-purple-50 text-purple-700" },
    action: "View Booking",
  },
  refund_approved: {
    bg: "bg-emerald-100", emoji: "💸", title: "Refund Approved",
    badge: { text: "Refund Approved", className: "bg-emerald-50 text-emerald-700" },
    action: "View Details",
  },
  refund_rejected: {
    bg: "bg-red-100", emoji: "🚫", title: "Refund Rejected",
    badge: { text: "Refund Rejected", className: "bg-red-50 text-red-700" },
    action: "View Details",
  },
  refund_completed: {
    bg: "bg-emerald-100", emoji: "✅", title: "Refund Completed",
    badge: { text: "Refunded", className: "bg-emerald-50 text-emerald-700" },
    action: "View Details",
  },
  refund_failed: {
    bg: "bg-red-100", emoji: "❌", title: "Refund Failed",
    badge: { text: "Refund Failed", className: "bg-red-50 text-red-700" },
    action: "View Details",
  },
};

const DEFAULT_META = {
  bg: "bg-gray-100", emoji: "🔔", title: "Notification",
  badge: { text: "Update", className: "bg-gray-100 text-gray-600" },
  action: "View Details",
};

/* ── Notification Row ── */
function NotifRow({ n, onAction, onDelete }) {
  const meta = META_BY_TYPE[n.type] || { ...DEFAULT_META, title: n.title || DEFAULT_META.title };

  return (
    <div className="flex items-start gap-3 px-5 py-3.5 hover:bg-arl-light/60 transition-colors group">
      <div className={`w-9 h-9 rounded-full ${meta.bg} flex items-center justify-center shrink-0 mt-0.5 text-base`}>
        {meta.emoji}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-arl-dark leading-snug">{meta.title}</p>
          <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${meta.badge.className}`}>
            {meta.badge.text}
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-1 leading-relaxed">{n.message}</p>
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-gray-400">{timeAgo(n.createdAt)}</p>
          {n.refID && (
            <button
              onClick={() => onAction(n)}
              className="text-xs font-bold text-arl-primary hover:text-arl-cta transition-colors"
            >
              {meta.action} →
            </button>
          )}
        </div>
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); onDelete(n.id); }}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-500 p-1 shrink-0"
        title="Dismiss"
      >
        <XIcon />
      </button>
    </div>
  );
}

/* ── Notification Dropdown ── */
function NotificationDropdown({ notifications, onAction, onDelete }) {
  return (
    <div className="absolute right-0 top-full mt-2 w-96 max-w-[92vw] bg-white rounded-2xl shadow-card border border-gray-100 z-50 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b bg-arl-light/50">
        <span className="font-semibold text-arl-dark text-sm">Notifications</span>
      </div>

      <div className="max-h-96 overflow-y-auto divide-y divide-gray-50">
        {notifications.length === 0 ? (
          <div className="py-10 flex flex-col items-center gap-2 text-gray-400">
            <BellIcon />
            <p className="text-sm">No new notifications</p>
          </div>
        ) : (
          notifications.map((n) => (
            <NotifRow key={n.id} n={n} onAction={onAction} onDelete={onDelete} />
          ))
        )}
      </div>

      {notifications.length > 0 && (
        <div className="px-5 py-3 border-t bg-arl-light/50 text-xs text-gray-400 text-center">
          Bookings · Payments · Reminders
        </div>
      )}
    </div>
  );
}

/* ── Main Notification Panel ── */
export default function NotificationPanel({ user }) {
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen]         = useState(false);
  const [notifications, setNotifications] = useState([]);
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

  const handleBellClick = () => {
    const opening = !notifOpen;
    setNotifOpen(opening);
    if (opening) {
      // Mark all currently loaded notifications as read in Firestore (not
      // localStorage) so the badge is consistent across devices/browsers.
      notifications.forEach((n) => {
        if (!n.isRead) {
          updateDoc(doc(db, "notifications", n.id), { isRead: true }).catch(() => {});
        }
      });
    }
  };

  // Every current notification type points at the same place: the
  // booking's own details page, where "Pay Now" already lives as a real
  // link (see BookingDetails.jsx) once a checkout session exists.
  const handleAction = (n) => {
    setNotifOpen(false);
    if (n.refID) {
      navigate(`/booking/${n.refID}/details`);
    } else {
      navigate("/my-bookings");
    }
  };

  const handleDelete = (notifID) => {
    deleteDoc(doc(db, "notifications", notifID)).catch(() => {});
  };

  return (
    <div className="relative" ref={notifRef}>
      <button
        onClick={handleBellClick}
        className="relative w-10 h-10 flex items-center justify-center rounded-full bg-white/90 border border-white/40 text-arl-primary hover:bg-arl-light transition-colors"
        aria-label="Notifications"
      >
        <BellIcon />
        {hasNew && (
          <>
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-arl-cta rounded-full animate-ping" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-arl-cta rounded-full" />
            {unreadCount > 1 && (
              <span className="absolute -top-1 -right-1 bg-arl-cta text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </>
        )}
      </button>

      {notifOpen && (
        <NotificationDropdown
          notifications={notifications}
          onAction={handleAction}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
