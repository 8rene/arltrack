import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

// ── Formatting helpers ──────────────────────────────────────────
const fmtDateTime = (val) => {
  if (!val) return '—';
  const d = val?._seconds ? new Date(val._seconds * 1000) : new Date(val);
  if (isNaN(d)) return '—';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
};
const peso = (n) => `₱${(Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

const REFUND_REASONS = [
  'Cancelled trip',
  'Overcharged',
  'Service issue',
  'Duplicate payment',
  'Other',
];

// ── Status badges ───────────────────────────────────────────────
const bookingStatusStyle = {
  upcoming:  'bg-blue-50 text-blue-700 border border-blue-200',
  active:    'bg-green-50 text-green-700 border border-green-200',
  ended:     'bg-gray-100 text-gray-600 border border-gray-200',
  cancelled: 'bg-red-50 text-red-600 border border-red-200',
};
const paymentStatusStyle = {
  paid:    'bg-green-50 text-green-700 border border-green-200',
  pending: 'bg-yellow-50 text-yellow-700 border border-yellow-200',
  failed:  'bg-red-50 text-red-600 border border-red-200',
};
const refundStatusStyle = {
  'Refund: Pending':  'bg-yellow-50 text-yellow-700 border border-yellow-200',
  'Refund: Approved': 'bg-blue-50 text-blue-700 border border-blue-200',
  'Refund: Refunded': 'bg-green-50 text-green-700 border border-green-200',
  'Refund: Rejected': 'bg-red-50 text-red-600 border border-red-200',
  'Refund: Failed':   'bg-red-50 text-red-600 border border-red-200',
};

function Badge({ text, styleMap, fallback = 'bg-gray-100 text-gray-600 border border-gray-200' }) {
  const cls = styleMap[text] || styleMap[(text || '').toLowerCase()] || fallback;
  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${cls}`}>
      {text || '—'}
    </span>
  );
}

export default function MyBookings({ user }) {
  const navigate = useNavigate();

  const [bookings, setBookings]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');

  const [refundRequests, setRefundRequests] = useState([]); // customer's own requests

  const [refundTarget, setRefundTarget] = useState(null); // booking being refunded
  const [refundReason, setRefundReason] = useState(REFUND_REASONS[0]);
  const [refundNotes, setRefundNotes]   = useState('');
  const [submitting, setSubmitting]     = useState(false);

  const [toast, setToast] = useState(null);
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const token = localStorage.getItem('arl_token');

  const fetchBookings = useCallback(async () => {
    if (!user?.userID) return;
    setLoading(true); setError('');
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/bookings/user/${user.userID}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load your bookings.');
      setBookings(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [user?.userID, token]);

  const fetchRefundRequests = useCallback(async () => {
    if (!user?.userID) return;
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/paymongo/refunds/mine`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setRefundRequests(data.data || []);
    } catch {
      // non-critical — refund status badges just won't show
    }
  }, [user?.userID, token]);

  useEffect(() => { fetchBookings(); fetchRefundRequests(); }, [fetchBookings, fetchRefundRequests]);

  const refundRequestFor = (paymentID) =>
    refundRequests.find((r) => r.paymentID === paymentID && ['Pending', 'Approved', 'Refunded'].includes(r.status));

  const openRefundModal = (booking) => {
    setRefundTarget(booking);
    setRefundReason(REFUND_REASONS[0]);
    setRefundNotes('');
  };

  const submitRefund = async () => {
    if (!refundTarget?.payment?.paymentID) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/paymongo/refunds`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentID: refundTarget.payment.paymentID,
          reason: refundReason,
          notes: refundNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to send refund request.');
      showToast(data.message || 'Refund request sent.');
      setRefundTarget(null);
      fetchRefundRequests();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 text-center">
        <p className="text-gray-500">Please log in to view your bookings.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>{toast.msg}</div>
      )}

      {/* Refund modal */}
      {refundTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => !submitting && setRefundTarget(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div>
              <h3 className="font-bold text-arl-dark text-lg">Request Refund</h3>
              <p className="text-sm text-gray-500">{refundTarget.carName} — {peso(refundTarget.payment?.amount)}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
              <select
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-arl-dark/20"
              >
                {REFUND_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Additional notes (optional)</label>
              <textarea
                value={refundNotes}
                onChange={(e) => setRefundNotes(e.target.value)}
                rows={3}
                placeholder="Tell us more about your refund request…"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-arl-dark/20"
              />
            </div>

            <p className="text-xs text-gray-400">
              Your refund request will be reviewed by our team. You'll be notified once it's processed.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setRefundTarget(null)}
                disabled={submitting}
                className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={submitRefund}
                disabled={submitting}
                className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-arl-cta hover:bg-arl-secondary disabled:opacity-50"
              >
                {submitting ? 'Sending…' : 'Confirm & Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-display font-bold text-arl-dark">My Bookings</h1>
        <p className="text-gray-500 text-sm mt-1">Track your rentals and payment status.</p>
      </div>

      {loading ? (
        <div className="py-20 text-center text-gray-400 text-sm">Loading your bookings…</div>
      ) : error ? (
        <div className="py-20 text-center text-red-500 text-sm">{error}</div>
      ) : bookings.length === 0 ? (
        <div className="py-20 text-center space-y-4">
          <p className="text-gray-400 text-sm">You don't have any bookings yet.</p>
          <button
            onClick={() => navigate('/booking')}
            className="px-6 py-2.5 rounded-xl bg-arl-cta text-white text-sm font-semibold hover:bg-arl-secondary transition-colors"
          >
            Book a Ride
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map((b) => {
            const existingRefund = b.payment?.paymentID ? refundRequestFor(b.payment.paymentID) : null;
            const canRequestRefund =
              b.payment?.status === 'paid' && !existingRefund;

            return (
              <div key={b.bookingID} className="rounded-2xl border border-gray-100 bg-white shadow-soft p-5 flex flex-col sm:flex-row gap-4">
                {b.carImage && (
                  <img src={b.carImage} alt={b.carName} className="w-full sm:w-40 h-28 object-cover rounded-xl bg-gray-100" />
                )}

                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-bold text-arl-dark">{b.carName}</h3>
                    <div className="flex gap-2">
                      <Badge text={b.status} styleMap={bookingStatusStyle} />
                      {b.payment && <Badge text={b.payment.status} styleMap={paymentStatusStyle} />}
                      {existingRefund && <Badge text={`Refund: ${existingRefund.status}`} styleMap={refundStatusStyle} />}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs text-gray-500">
                    <p><span className="text-gray-400">Service:</span> {b.serviceType || '—'}</p>
                    <p><span className="text-gray-400">Duration:</span> {b.duration || '—'}</p>
                    <p><span className="text-gray-400">Start:</span> {fmtDateTime(b.startDateTime)}</p>
                    <p><span className="text-gray-400">End:</span> {fmtDateTime(b.endDateTime)}</p>
                  </div>

                  {b.destination && (
                    <p className="text-xs text-gray-500"><span className="text-gray-400">Destination:</span> {b.destination}</p>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <p className="text-sm font-semibold text-arl-dark">{peso(b.totalFee)}</p>
                    {canRequestRefund && (
                      <button
                        onClick={() => openRefundModal(b)}
                        className="text-xs font-semibold text-red-600 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50"
                      >
                        Request Refund
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
