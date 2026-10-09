import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, CheckCircle, MapPin, Info, Clock } from 'lucide-react';
import MapPicker from '../components/shared/MapPicker';
import { fetchStoreLocation } from '../utils/storeLocation';
import { useToast } from '../context/ToastContext';
import gcashLogo  from '../assets/images/GCash_Logo.png';
import mayaLogo   from '../assets/images/PayMayaLogo.jpg';
import qrphLogo   from '../assets/images/qr-ph-logo-6f76723590.webp';

const LS_KEY = 'arl_booking_draft';
// Bump this whenever a field's meaning/default changes (like removing
// DEFAULT_LOCATION) so an old draft sitting in someone's browser gets
// discarded instead of silently resurfacing stale values forever — this
// exact class of bug (stale endDate, stale pickupLocation) has bitten
// multiple fixes in this file already.
const DRAFT_VERSION = 2;
const loadDraft = () => {
  try {
    const r = localStorage.getItem(LS_KEY);
    if (!r) return {};
    const parsed = JSON.parse(r);
    if (parsed.__v !== DRAFT_VERSION) return {}; // stale shape — discard, don't trust it
    return parsed;
  } catch { return {}; }
};
const saveDraft = (data) => { try { localStorage.setItem(LS_KEY, JSON.stringify({ ...data, __v: DRAFT_VERSION })); } catch {} };
const clearDraft = () => { try { localStorage.removeItem(LS_KEY); } catch {} };

// ── Date helpers ───────────────────────────────────────────────
const toMidnight  = (d) => { const c = new Date(d); c.setHours(0,0,0,0); return c; };
// ── Local calendar-date string, e.g. "2026-08-13" ──────────────
// NEVER use `.toISOString().split('T')[0]` for this. toISOString()
// always converts to UTC first, so for any user in a timezone ahead
// of UTC (e.g. Asia/Manila, UTC+8), a local midnight rolls back to
// the previous day once converted — silently shifting every date by
// one day. This was the root cause of the "22-hour end date shows
// the same day as start" bug and several other date-key mismatches
// in this file. Always build the string from local getFullYear /
// getMonth / getDate instead.
const toLocalDateStr = (d) => {
  const c = new Date(d);
  return `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, '0')}-${String(c.getDate()).padStart(2, '0')}`;
};
const sameDay     = (a, b) => a && b && toMidnight(a).getTime() === toMidnight(b).getTime();
const addDays     = (d, n) => { const c = new Date(d); c.setDate(c.getDate() + n); return c; };
const addHours    = (d, h) => new Date(new Date(d).getTime() + h * 3600000);
const fmt         = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
const fmtTime     = (d) => d ? new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '';
const fmt12       = (t) => { if (!t) return ''; const [h,m]=t.split(':').map(Number); const ap=h>=12?'PM':'AM'; return `${((h%12)||12)}:${String(m).padStart(2,'0')} ${ap}`; };
const MONTHS      = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS        = ['Su','Mo','Tu','We','Th','Fr','Sa'];

// ── Booking date status calculator ────────────────────────────
const getDateStatuses = (carBookings) => {
  // Returns a map of "YYYY-MM-DD" -> status string
  // carBookings entries come from GET /api/services/car-bookings/:carID, which
  // sends startDateTime/endDateTime (not startDate/endDate) and real booking
  // statuses: "to pay" | "upcoming" | "ongoing" | "maintenance".
  const map = {};
  carBookings.forEach(({ status, startDateTime, endDateTime }) => {
    if (!startDateTime) return;
    const start = toMidnight(new Date(startDateTime));
    const end   = endDateTime ? toMidnight(new Date(endDateTime)) : start;
    const raw   = (status || 'to pay').toLowerCase();
    // "upcoming"/"ongoing" are confirmed bookings → treated as fully booked.
    // "to pay" is an unpaid hold → shown as pending, doesn't block clicks.
    // "completed" (already returned) only still matters for its 1-day
    // post-rental buffer below — the rental window itself is in the past
    // and doesn't need marking.
    // "maintenance" passes through as-is.
    const isConfirmedBooking = raw === 'upcoming' || raw === 'ongoing';
    const isCompleted = raw === 'completed';
    const s = isConfirmedBooking ? 'booked' : raw === 'to pay' ? 'pending' : raw;

    if (!isCompleted) {
      let cur = new Date(start);
      while (cur <= end) {
        const key = toLocalDateStr(cur);
        // Priority: booked > preparation > pending > maintenance
        if (!map[key] || s === 'booked') map[key] = s;
        cur = addDays(cur, 1);
      }
    }

    // Preparation buffer: 1 day before a confirmed booking starts, and 1 day
    // after it ends OR after it was already returned ("completed") — a
    // returned booking no longer needs the "before" side, its start is in
    // the past. Kept in sync with the same buffer the backend enforces
    // in bookings.controller.js's availability guard, so what's shown here
    // always matches what's actually blockable.
    if (isConfirmedBooking) {
      const before = toLocalDateStr(addDays(start, -1));
      if (!map[before] || map[before] === 'available') map[before] = 'preparation';
    }
    if (isConfirmedBooking || isCompleted) {
      const after = toLocalDateStr(addDays(end, 1));
      if (!map[after] || map[after] === 'available') map[after] = 'preparation';
    }
  });
  return map;
};

// All non-available statuses render identically (flat grey, generic label) —
// the customer only needs to know a date can't be picked, not whether that's
// because it's booked, in prep, unpaid-pending, or maintenance.
const UNAVAILABLE_STYLE = { bg: 'bg-gray-300', text: 'text-gray-500', label: 'Unavailable' };
const DATE_STYLES = {
  booked:      UNAVAILABLE_STYLE,
  preparation: UNAVAILABLE_STYLE,
  pending:     UNAVAILABLE_STYLE,
  maintenance: UNAVAILABLE_STYLE,
  available:   { bg: '', text: 'text-gray-700', label: 'Available' },
};
const BLOCKED_STATUSES = new Set(['booked', 'preparation', 'maintenance']);

// Pure helper (no component state) so it can be reused both at click-time
// and for re-validating an already-set range (e.g. one restored from a
// stale localStorage draft, or one that was valid when saved but got
// booked by someone else since). Returns true if any day strictly between
// start and end is blocked.
const rangeCrossesBlocked = (dateStatuses, start, end) => {
  let cur = addDays(toMidnight(start), 1);
  const endMid = toMidnight(end);
  while (cur < endMid) {
    const key = toLocalDateStr(cur);
    if (BLOCKED_STATUSES.has(dateStatuses[key] || 'available')) return true;
    cur = addDays(cur, 1);
  }
  return false;
};

// ── End date/time calculator ───────────────────────────────────
const calcEnd = (startDate, startTime, hours) => {
  if (!startDate || !startTime) return { endDate: '', endTime: '' };
  const [h, m]   = startTime.split(':').map(Number);
  const startDT  = new Date(startDate);
  startDT.setHours(h, m, 0, 0);
  const endDT    = addHours(startDT, hours);
  return {
    endDate: toLocalDateStr(endDT),
    endTime: `${String(endDT.getHours()).padStart(2,'0')}:${String(endDT.getMinutes()).padStart(2,'0')}`,
  };
};

// ── 22-Hour end time: start time minus 2 hours, wrapping across midnight ──
const calc22EndTime = (startTimeStr) => {
  const [sh, sm] = startTimeStr.split(':').map(Number);
  const endTotalMins = (sh * 60 + sm) - 120; // minus 2 hours
  const adjMins = ((endTotalMins % 1440) + 1440) % 1440;
  const eh = Math.floor(adjMins / 60);
  const em = adjMins % 60;
  return `${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')}`;
};

// The default End date for a 22-Hour booking is always the day after Start
// — a 22-hour block, displayed with the -2h buffer time above, never fits
// inside the same calendar day for any realistic pickup time. Used to
// auto-fill End instead of leaving the right calendar blank for the
// customer to click themselves (which is where the "0 days billed" bug
// came from — clicking the same day as Start looked valid but wasn't).
const defaultNextDay = (dateStr) => toLocalDateStr(addDays(new Date(dateStr + 'T00:00:00'), 1));

// ── Pricing/day-count/fee math used to live here (calcDays, isBaseArea,
// extraFee/driversFee/serviceFee/gatewayFee/grandTotal) and was simply
// trusted by the backend when the booking was submitted — meaning the
// numbers shown on screen were also the numbers anyone could tamper with
// via devtools before checkout. All of that now lives server-side in
// arltrack-customer-backend/utils/pricing.js, and this page just displays
// whatever POST /bookings/quote returns (see the `quote` state + the
// debounced fetch effect below).

// ── Round clock time picker ─────────────────────────────────────
// Tap the hour on the clock, then tap the minutes (00/15/30/45).
// `value` / `onChange` use 24-hour "HH:MM" — same format the old
// dropdown used, so everything downstream stays unchanged.
const CLOCK_SIZE = 240, CLOCK_C = 120, CLOCK_LABEL_R = 90, CLOCK_FACE_R = 114, CLOCK_BUBBLE_R = 19;
const clockPolar = (i, r) => {
  const a = (i * 30 * Math.PI) / 180;
  return { x: CLOCK_C + r * Math.sin(a), y: CLOCK_C - r * Math.cos(a) };
};
const clockPad = (n) => String(n).padStart(2, '0');
const clockTo24 = (h12, m, ap) => `${clockPad((h12 % 12) + (ap === 'PM' ? 12 : 0))}:${clockPad(m)}`;

const ClockTimePicker = ({ value, onChange, onMinutePicked }) => {
  const parsed = /^\d{1,2}:\d{2}$/.test(value || '')
    ? (() => { const [h, m] = value.split(':').map(Number); return { h12: (h % 12) || 12, minute: m, ap: h >= 12 ? 'PM' : 'AM' }; })()
    : null;
  const [mode, setMode] = useState('hour');
  const [ap, setAp] = useState(parsed ? parsed.ap : 'AM');

  useEffect(() => {
    if (parsed) setAp(parsed.ap); else setMode('hour');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const h12 = parsed ? parsed.h12 : null;
  const minute = parsed ? parsed.minute : 0;

  const pickHour   = (h) => { onChange(clockTo24(h, minute, ap)); setMode('minute'); };
  const pickMinute = (m) => { if (h12 !== null) { onChange(clockTo24(h12, m, ap)); if (onMinutePicked) onMinutePicked(); } };
  const pickAp     = (p) => { setAp(p); if (h12 !== null) onChange(clockTo24(h12, minute, p)); };

  let handIndex = null;
  if (mode === 'hour' && h12 !== null) handIndex = h12 % 12;
  if (mode === 'minute' && parsed) handIndex = minute / 5;
  const handEnd = handIndex !== null ? clockPolar(handIndex, CLOCK_LABEL_R - CLOCK_BUBBLE_R) : null;

  const seg = 'px-2 py-1 rounded-lg text-3xl sm:text-4xl font-black leading-none transition';
  const renderMark = (key, idx, label, selected, onClick) => {
    const { x, y } = clockPolar(idx, CLOCK_LABEL_R);
    return (
      <g key={key} onClick={onClick} style={{ cursor: 'pointer' }}>
        <circle cx={x} cy={y} r={CLOCK_BUBBLE_R} fill={selected ? '#1a5f7a' : 'transparent'} />
        <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize="16" fontWeight="700"
          fill={selected ? '#ffffff' : '#374151'} style={{ pointerEvents: 'none' }}>{label}</text>
      </g>
    );
  };

  return (
    <div className="mx-auto w-full max-w-[280px] select-none">
      <div className="flex items-center justify-center gap-3 mb-3">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setMode('hour')} aria-label="Choose hour"
            className={`${seg} ${mode === 'hour' ? 'bg-arl-primary text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            {h12 !== null ? h12 : '--'}
          </button>
          <span className="text-3xl sm:text-4xl font-black text-gray-400 leading-none">:</span>
          <button type="button" onClick={() => h12 !== null && setMode('minute')} aria-label="Choose minutes"
            className={`${seg} ${mode === 'minute' ? 'bg-arl-primary text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            {parsed ? clockPad(minute) : '--'}
          </button>
        </div>
        <div className="flex flex-col gap-1">
          {['AM', 'PM'].map((p) => (
            <button key={p} type="button" onClick={() => pickAp(p)} aria-pressed={ap === p}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${ap === p ? 'bg-arl-cta text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${CLOCK_SIZE} ${CLOCK_SIZE}`} className="w-full h-auto" role="group"
        aria-label={mode === 'hour' ? 'Select hour' : 'Select minutes'}>
        <circle cx={CLOCK_C} cy={CLOCK_C} r={CLOCK_FACE_R} fill="#f3f4f6" stroke="#e5e7eb" strokeWidth="2" />
        {handEnd && <line x1={CLOCK_C} y1={CLOCK_C} x2={handEnd.x} y2={handEnd.y} stroke="#1a5f7a" strokeWidth="2.5" strokeLinecap="round" />}
        <circle cx={CLOCK_C} cy={CLOCK_C} r="4" fill={handEnd ? '#1a5f7a' : '#9ca3af'} />

        {mode === 'hour' && Array.from({ length: 12 }, (_, i) => {
          const hour = i === 0 ? 12 : i;
          return renderMark(hour, i, hour, h12 === hour, () => pickHour(hour));
        })}

        {mode === 'minute' && (
          <>
            {Array.from({ length: 12 }, (_, i) => {
              if (i % 3 === 0) return null;
              const { x, y } = clockPolar(i, CLOCK_LABEL_R);
              return <circle key={`t${i}`} cx={x} cy={y} r="2.5" fill="#d1d5db" />;
            })}
            {[0, 15, 30, 45].map((m) => renderMark(m, m / 5, clockPad(m), !!parsed && minute === m, () => pickMinute(m)))}
          </>
        )}
      </svg>

      <p className="text-[11px] text-gray-400 text-center mt-2">
        {mode === 'hour' ? 'Tap the hour on the clock, then choose the minutes.' : 'Now choose the minutes. Tap the hour above to change it.'}
      </p>
    </div>
  );
};

// ── Time field: looks like the old dropdown; clicking it opens the clock ──
const ClockTimeField = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm bg-white focus:border-arl-primary focus:outline-none cursor-pointer flex items-center justify-between text-left"
      >
        <span className={value ? 'text-gray-700' : 'text-gray-400'}>{value ? fmt12(value) : 'Select a time…'}</span>
        <Clock size={18} className="text-arl-primary flex-shrink-0" />
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-label="Select pickup time"
            className="bg-white rounded-3xl shadow-2xl p-5 sm:p-6 w-full max-w-[340px]"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-xs font-bold tracking-[0.15em] text-arl-secondary uppercase text-center mb-3">Select pickup time</p>
            <ClockTimePicker value={value} onChange={onChange} onMinutePicked={() => setOpen(false)} />
            <div className="flex gap-3 mt-4">
              <button type="button" onClick={() => setOpen(false)}
                className="flex-1 border border-gray-200 text-gray-500 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50 transition">
                Close
              </button>
              <button type="button" onClick={() => setOpen(false)} disabled={!value}
                className="flex-1 bg-arl-cta text-white py-2.5 rounded-xl text-sm font-bold hover:opacity-90 transition disabled:opacity-40">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ── KeyPoints: the rules that matter, as quick-scan cards ───────
// Replaces long Terms & Conditions paragraphs. Each point is an icon, a
// bold one-line headline and ONE short sentence. "must" points get an
// amber highlight + a MUST KNOW tag so they cannot be missed; "info"
// points are calmer. The full T&C stays one tap away as a link.
const KeyPoints = ({ title, subtitle, points }) => (
  <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
    <div className="bg-arl-primary px-3 sm:px-4 py-2.5">
      <p className="text-xs sm:text-sm font-bold text-white">{title}</p>
      {subtitle && <p className="text-[11px] sm:text-xs text-white/80">{subtitle}</p>}
    </div>
    <ul className="divide-y divide-gray-100">
      {points.map((pt, i) => {
        const must = pt.level === 'must';
        return (
          <li key={i} className={`flex gap-3 px-3 sm:px-4 py-3 border-l-4 ${must ? 'bg-amber-50 border-amber-400' : 'bg-white border-arl-secondary/40'}`}>
            <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-lg sm:text-xl flex-shrink-0 ${must ? 'bg-amber-100' : 'bg-blue-50'}`}>
              {pt.icon}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="text-sm sm:text-base font-extrabold text-arl-dark leading-snug">{pt.headline}</p>
                {must && (
                  <span className="text-[10px] font-black tracking-wide uppercase bg-amber-400 text-amber-950 px-1.5 py-0.5 rounded">Must know</span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-gray-700 mt-0.5 leading-relaxed">{pt.detail}</p>
              {pt.ref && <p className="text-[10px] sm:text-[11px] text-gray-400 mt-1">T&amp;C: {pt.ref}</p>}
            </div>
          </li>
        );
      })}
    </ul>
    <div className="px-3 sm:px-4 py-2 bg-gray-50 text-[10px] sm:text-[11px] text-gray-500">
      This is the short version. Full wording:{' '}
      <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline font-semibold text-arl-primary">Terms &amp; Conditions</a>
    </div>
  </div>
);

// ── Trip step, split into focused parts ─────────────────────────
// Only one part is visible at a time. Each part opens with a one-line
// description and the few rules that matter at that exact moment.
const TRIP_PARTS = [
  {
    key: 'service', label: 'Service',
    title: 'What is your trip for?',
    description: 'Pick the purpose of your rental. Choose Others if it is not listed.',
    points: [
      { icon: '🔍', headline: 'We review every booking', detail: 'We check your dates, vehicle and driver type before approving.', ref: 'Rental Inquiries and Approval' },
      { icon: '🚫', level: 'must', headline: 'Lawful use only', detail: 'No subletting, illegal transport, off-road driving, smoking inside, or hazardous items.', ref: 'Vehicle Usage' },
    ],
  },
  {
    key: 'duration', label: 'Duration',
    title: 'How long do you need the car?',
    description: '12 Hours ends automatically after 12 hours. 22 Hours lets you choose your pickup and return dates.',
    points: [
      { icon: '⏱️', level: 'must', headline: 'You choose the time, so make it enough', detail: 'Pick a duration that covers the whole trip, including travel, traffic and rest stops.', ref: 'Rental Time & Destination Selection' },
      { icon: '💸', level: 'must', headline: 'Late return is charged per hour', detail: 'Every hour after your return time is billed.', ref: 'Late Return & Penalties' },
    ],
  },
  {
    key: 'pickup', label: 'Pickup',
    title: 'Where will you get the car?',
    description: 'Choose where we hand over the car. Drop-off is the same place.',
    points: [
      { icon: '🪪', level: 'must', headline: 'Bring a valid government ID', detail: 'No valid ID on pickup day means the booking may be cancelled and the deposit is not refunded.', ref: 'Vehicle Pickup & Customer Identification' },
      { icon: '🔑', headline: 'We inspect the car with you', detail: 'Existing damage is noted first. The car is released once your payment is confirmed.', ref: 'Booking Guidelines' },
    ],
  },
  {
    key: 'destination', label: 'Destination',
    title: 'Where are you going?',
    description: 'Tell us where you are headed. This is saved for our records only.',
    points: [
      { icon: '📍', level: 'must', headline: 'We cannot compute your travel time', detail: 'The destination is for documentation only. Choosing enough time for the trip is up to you.', ref: 'Rental Time & Destination Selection' },
      { icon: '🔢', headline: 'Number coding applies', detail: 'Metro Manila, weekdays 7 AM to 7 PM. If your car is restricted, we will ask you to change the date or the car.', ref: 'Number Coding Scheme' },
      { icon: '⛽', headline: 'Fuel and tolls are yours', detail: 'Return the car with the same fuel level.', ref: 'Fuel Policy' },
    ],
  },
  {
    key: 'schedule', label: 'Date & Time',
    title: 'When do you need it?',
    description: 'Pick your pickup date and time. Your return is calculated from your duration.',
    points: [
      { icon: '⏰', level: 'must', headline: 'Choose your pickup time carefully', detail: 'The system will not estimate your travel time, so make sure your schedule fits the whole trip.', ref: 'Rental Time & Destination Selection' },
      { icon: '💸', level: 'must', headline: 'Late return is charged per hour', detail: 'Time past your agreed return is billed hourly.', ref: 'Late Return & Penalties' },
      { icon: '🔁', headline: 'Reschedule 24 hours ahead', detail: 'Subject to vehicle availability.', ref: 'Cancellation & Refund Policy' },
    ],
  },
  {
    key: 'drive', label: 'Driver',
    title: 'Who will drive?',
    description: 'Choose a chauffeur-driven rental or self-drive.',
    points: [
      { icon: '🪪', level: 'must', headline: 'Self-drive: 21+ with a valid license', detail: 'Only the registered renter may drive. Bring your license and a valid government ID.', ref: 'Driver Requirements (Self-Drive)' },
      { icon: '🧑‍✈️', headline: "Chauffeur: driver's fee applies", detail: 'It shows as its own line in your price breakdown.' },
      { icon: '⛽', headline: 'Fuel and tolls are yours either way', detail: 'Return the car with the same fuel level.', ref: 'Fuel Policy' },
    ],
  },
];

const TripPartIntro = ({ part, index, total }) => (
  <div className="mb-5">
    {/* Part progress */}
    <div className="flex items-center gap-1.5 mb-3" aria-label={`Trip details, part ${index + 1} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= index ? 'bg-arl-primary' : 'bg-gray-200'}`} />
      ))}
    </div>
    <p className="text-[11px] sm:text-xs font-bold tracking-wide uppercase text-arl-secondary mb-1">
      Trip details · Part {index + 1} of {total} · {part.label}
    </p>
    <h3 className="text-lg sm:text-2xl font-bold text-arl-dark mb-1 sm:mb-2">{part.title}</h3>
    <p className="text-sm sm:text-base text-gray-600 mb-4">{part.description}</p>
    <KeyPoints title="What you need to know" subtitle="The key rules for this step, in short." points={part.points} />
  </div>
);

// ── Skeleton card ──────────────────────────────────────────────
const SkeletonCard = () => (
  <div className="rounded-2xl bg-white border border-gray-100 shadow-md overflow-hidden animate-pulse">
    <div className="w-full h-20 sm:h-36 bg-gray-200" />
    <div className="p-2 sm:p-4 space-y-2">
      <div className="h-3 sm:h-4 bg-gray-200 rounded w-1/2" />
      <div className="h-2 sm:h-3 bg-gray-100 rounded w-1/3" />
      <div className="flex gap-1 mt-2">
        <div className="h-4 sm:h-5 bg-gray-100 rounded-full w-10 sm:w-14" />
        <div className="h-4 sm:h-5 bg-gray-100 rounded-full w-12 sm:w-16" />
      </div>
    </div>
  </div>
);

// ── Vehicle pick card ──────────────────────────────────────────
const VehiclePickCard = ({ car, selected, onSelect }) => {
  const { name='', brandName='', bodyType='', seatingCapacity=0, fuelType='', transmission='', shortDescription='', imageURL='', pricing=[], status='' } = car;
  const tags = [bodyType, seatingCapacity ? `${seatingCapacity} Seater` : '', transmission, fuelType].filter(Boolean);
  const lowest = pricing.length ? pricing.reduce((a,b) => a.price < b.price ? a : b, pricing[0]) : null;
  const avail  = ['active','available'].includes(status.toLowerCase());

  return (
    <div onClick={() => avail && onSelect(car)}
      className={`relative border-2 rounded-2xl cursor-pointer transition-all duration-300 overflow-hidden hover:-translate-y-1 ${
        selected ? 'border-arl-secondary bg-blue-50 shadow-xl'
        : avail   ? 'border-gray-200 bg-white hover:border-arl-primary hover:shadow-lg'
        : 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'}`}>
      {selected && (
        <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 z-10 w-5 h-5 sm:w-6 sm:h-6 bg-arl-secondary rounded-full flex items-center justify-center">
          <CheckCircle size={12} className="sm:w-3.5 sm:h-3.5 text-white" />
        </div>
      )}
      <div className={`absolute top-1.5 left-1.5 sm:top-2 sm:left-2 z-10 px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold ${avail ? 'bg-green-500 text-white' : 'bg-gray-400 text-white'}`}>
        {status || 'Available'}
      </div>
      <div className="relative overflow-hidden bg-gray-100">
        {imageURL
          ? <img src={imageURL} alt={name} className="w-full h-20 sm:h-36 object-cover"
              onError={(e) => { e.target.style.display='none'; e.target.nextSibling.style.display='flex'; }} />
          : null}
        <div className="w-full h-20 sm:h-36 items-center justify-center text-2xl sm:text-4xl text-gray-300 bg-gray-100" style={{ display: imageURL ? 'none' : 'flex' }}>🚗</div>
        <span className="absolute bottom-1 right-2 sm:bottom-2 sm:right-3 text-white/70 text-[10px] sm:text-xs font-black tracking-widest uppercase drop-shadow">{brandName}</span>
      </div>
      <div className="p-2 sm:p-4">
        <h4 className="text-sm sm:text-lg font-black text-arl-primary tracking-tight truncate">{name}</h4>
        {shortDescription && <p className="hidden sm:block text-xs text-gray-500 mt-1 line-clamp-2">{shortDescription}</p>}
        <div className="flex flex-wrap gap-1 mt-1.5 sm:mt-3">
          {tags.slice(0, 2).map((t,i) => <span key={i} className="px-1.5 sm:px-2 py-0.5 bg-arl-secondary/10 text-arl-primary text-[10px] sm:text-xs font-semibold rounded-full truncate max-w-full">{t}</span>)}
        </div>
        {lowest && <p className="mt-1.5 sm:mt-3 text-[10px] sm:text-xs font-semibold text-arl-cta">From ₱{Number(lowest.price).toLocaleString()} / {lowest.durationType}</p>}
      </div>
    </div>
  );
};

// ── Info "?" buttons + panels ─────────────────────────────────
// What each panel says comes from the Terms & Conditions and Booking
// Guidelines pages (the section is noted in the comment on each line) —
// keep these in sync by hand if those pages change. Lines marked "app"
// describe what this booking page itself does (fee lines in the price
// breakdown) rather than a T&C clause.
const INFO = {
  service: {
    title: 'About service types',
    items: [
      'Pick what your trip is for. If it is not listed, choose Others and describe it.',
      'ARL checks your dates, vehicle, rental duration and whether the rental is self-drive or with a driver before approving the booking. (T&C: Rental Inquiries and Approval)',
      'The vehicle may only be used for lawful purposes within the rental period. Not allowed: subletting or transferring it, illegal transport, off-road use (unless authorized in writing), smoking inside, and hazardous or prohibited materials. (T&C: Vehicle Usage)',
    ],
  },
  chauffeur: {
    title: 'With Chauffeur',
    items: [
      'ARL provides a professional driver for your trip. (Booking Guidelines: Service Types)',
      'ARL checks that your booking is self-drive or with a driver before approving it. (T&C: Rental Inquiries and Approval)',
      "If a Driver's Fee applies, it shows as its own line in your price breakdown. (app)",
      'Fuel and toll fees are the renter\'s full responsibility, and the vehicle must be returned with the same fuel level. (T&C: Fuel Policy)',
    ],
  },
  'self-drive': {
    title: 'Self-Drive requirements',
    items: [
      'Minimum age: 21 years old.',
      "A valid Philippine driver's license.",
      'A valid government-issued ID, presented on the pickup date.',
      'Only the registered renter may drive. Unauthorized drivers are strictly prohibited.',
      'If a requirement is not met at pickup, the booking may be cancelled without refund of the deposit. (Booking Guidelines: Self-Drive Requirements)',
    ],
  },
  destination: {
    title: 'About your destination',
    items: [
      'Metro Manila number coding is enforced on weekdays from 7:00 AM to 7:00 PM. If your vehicle\'s plate is restricted on your trip dates, you will be asked to pick another date or vehicle. (T&C: Number Coding Scheme)',
      'Use the vehicle for lawful purposes only. Off-road use is not allowed unless authorized in writing. (T&C: Vehicle Usage)',
      'Fuel and toll fees are the renter\'s full responsibility. (T&C: Fuel Policy)',
      'A destination outside our service area may add an extra fee, shown in your price breakdown. (app)',
      'Your destination is saved for documentation purposes only. The system cannot calculate or estimate travel time based on the location you pick. (app)',
      'You are responsible for choosing a pickup time and rental duration long enough to cover the whole trip, including travel, traffic and rest stops. Time beyond the agreed return is charged as a late return. (T&C: Rental Time & Destination Selection)',
    ],
  },
};

const pickupInfo = (storeConfigured) => ({
  title: 'About pickup & drop-off',
  items: [
    ...(storeConfigured ? ['Tick "Pick up in-store" to use our store as your pickup point.'] : []),
    'Drop-off is always the same as your pickup location.',
    'Present a valid government-issued ID on the pickup date. Without valid ID the booking may be cancelled without refund of the deposit. (T&C: Vehicle Pickup & Customer Identification)',
    'Our team verifies your booking, inspects the vehicle with you, and releases it only after full payment is confirmed. Existing damage is documented first. (Booking Guidelines: Pickup & Vehicle Release)',
    'Return the vehicle on the agreed date and time. Late returns are charged per hour. (T&C: Late Return & Penalties)',
  ],
});

const InfoButton = ({ open, onClick, label, text }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    aria-expanded={!!open}
    className={`inline-flex items-center gap-1 rounded-full text-[11px] font-semibold transition ${text ? 'px-2 py-0.5' : 'p-0.5'} ${open ? 'bg-arl-primary text-white' : 'text-arl-primary hover:bg-arl-light'}`}
  >
    <Info size={15} />
    {text}
  </button>
);

const InfoPanel = ({ title, items }) => (
  <div className="mt-2 mb-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5 text-xs text-gray-700">
    <p className="font-bold text-arl-primary mb-1.5">{title}</p>
    <ul className="space-y-1 list-disc pl-4">
      {items.map((it, idx) => <li key={idx}>{it}</li>)}
    </ul>
    <p className="mt-2 text-[11px] text-gray-500">
      Full details: <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline font-semibold text-arl-primary">Terms &amp; Conditions</a>
      {' '}·{' '}
      <a href="/booking-guidelines" target="_blank" rel="noopener noreferrer" className="underline font-semibold text-arl-primary">Booking Guidelines</a>
    </p>
  </div>
);


// Round "?" button used on each Payment Details row
const HelpButton = ({ open, onClick, label }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    aria-expanded={!!open}
    className={`inline-flex items-center justify-center w-5 h-5 rounded-full border text-[11px] font-black leading-none transition flex-shrink-0 ${
      open ? 'bg-arl-primary border-arl-primary text-white' : 'border-arl-primary/40 text-arl-primary hover:bg-arl-primary/10'
    }`}
  >?</button>
);


// ── Location input with map button ────────────────────────────
const LocationInput = ({ label, value, onValueChange, placeholder, onCoordsChange, disabled = false, restrictToServiceArea = false, coords = null, labelAddon = null, infoPanel = null }) => {
  const [mapOpen, setMapOpen] = useState(false);

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <label className="block text-xs text-gray-600 font-medium">{label}</label>
        {labelAddon}
      </div>
      {infoPanel}
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onValueChange(e.target.value)}
          disabled={disabled}
          className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-arl-primary focus:outline-none text-sm disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
        />
        {/* Map button stays clickable even while locked — opens in read-only
            view mode so the customer can still see exactly where it is,
            they just can't move the pin from here (see disabled note below). */}
        <button
          type="button"
          onClick={() => setMapOpen(true)}
          className="px-3 py-3 rounded-xl border-2 border-arl-secondary text-arl-secondary hover:bg-arl-secondary hover:text-white transition flex items-center gap-1 text-sm font-semibold"
        >
          <MapPin size={16} /> Map
        </button>
      </div>
      {mapOpen && (
        <MapPicker
          isOpen={mapOpen}
          onClose={() => setMapOpen(false)}
          onConfirm={({ address: addr, lat, lng, city, province }) => {
            onValueChange(addr);
            onCoordsChange?.({ lat, lng, city, province });
            setMapOpen(false);
          }}
          initialLabel={value}
          initialCoords={coords}
          restrictToServiceArea={restrictToServiceArea}
          readOnly={disabled}
        />
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// MAIN BOOKING PAGE
// ══════════════════════════════════════════════════════════════
const BookingPage = ({ user = null, userDetails = null, onUserDetailsUpdate }) => {
  // Scroll target for the top of each step's content — used to bring a
  // validation error into view when it clicking Next fails, since on Step 1
  // the error banner sits above a tall scrollable car grid and can end up
  // off-screen from the Next button otherwise.
  const stepTopRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();


  // ── Cars ────────────────────────────────────────────────────
  const [cars,        setCars]        = useState([]);
  const [carsLoading, setCarsLoading] = useState(true);
  const [carsError,   setCarsError]   = useState('');
  const [carSearch,   setCarSearch]   = useState('');
  const [filterBody,  setFilterBody]  = useState('All');
  const [selectedCar, setSelectedCar] = useState(null);

  // ── Service types ────────────────────────────────────────────
  const [serviceTypes,    setServiceTypes]    = useState([]);
  const [serviceTypesLoading, setServiceTypesLoading] = useState(true);

  // ── Car bookings (for calendar) ──────────────────────────────
  const [carBookings,  setCarBookings]  = useState([]);
  const [dateStatuses, setDateStatuses] = useState({});
  // Only true once GET /services/car-bookings/:carID has actually
  // succeeded for the currently selected car — gates the auto-revalidation
  // effect below so it never wipes a legitimate selection just because the
  // availability fetch hasn't resolved yet (or failed).
  const [carBookingsLoaded, setCarBookingsLoaded] = useState(false);

  // ── Booking form ─────────────────────────────────────────────
  // Pre-populate from Hero form if navigated from there
  const heroState = location.state || {};
  // Merge: heroState (from navigation) takes priority, then localStorage draft, then defaults
  const draft = loadDraft();
  const initVal = (heroKey, draftKey, fallback = '') =>
    (heroState[heroKey] !== undefined && heroState[heroKey] !== '')
      ? heroState[heroKey]
      : (draft[draftKey] !== undefined && draft[draftKey] !== '')
        ? draft[draftKey]
        : fallback;

  // pickupLocation/dropoffLocation/destination should never be recalled from
  // a past draft — only an explicit, same-visit hand-off from the Hero form
  // (heroState) counts. A fresh /booking visit always starts blank.
  const initValNoDraft = (heroKey, fallback = '') =>
    (heroState[heroKey] !== undefined && heroState[heroKey] !== '')
      ? heroState[heroKey]
      : fallback;

  // Guard against a stale/past date inherited from Hero navigation state or
  // a leftover localStorage draft (e.g. from an earlier session) — never
  // trust an inbound startDate/endDate that's already in the past.
  const todayStrInit = toLocalDateStr(new Date());
  const inboundStartDate = initVal('startDate', 'startDate');
  const inboundStartDateIsPast = !!inboundStartDate && inboundStartDate < todayStrInit;

  const [currentStep,       setCurrentStep]       = useState(1);
  const [tripPart,          setTripPart]          = useState(1); // 1..TRIP_PARTS.length — which part of the Trip step is shown
  const [payPart,           setPayPart]           = useState(1); // 1 = payment details & total, 2 = payment option + method
  const [serviceType,       setServiceType]        = useState('');
  // FK into the serviceType collection, sent alongside the label so admin
  // can resolve/display it (see admin-backend's resolveServiceType()).
  // Stays null for "Others" — that's free text with no matching doc.
  const [serviceTypeID,     setServiceTypeID]      = useState(null);
  const [otherServiceNote,  setOtherServiceNote]   = useState('');
  const [duration,          setDuration]           = useState(initVal('duration',        'duration'));
  const [startDate,         setStartDate]          = useState(inboundStartDateIsPast ? '' : inboundStartDate);
  const [startTime,         setStartTime]          = useState(inboundStartDateIsPast ? '' : initVal('startTime', 'startTime'));
  const [endDate,           setEndDate]            = useState(inboundStartDateIsPast ? '' : initVal('endDate',   'endDate'));
  const [endTime,           setEndTime]            = useState(inboundStartDateIsPast ? '' : initVal('endTime',   'endTime'));
  const [pickupLocation,    setPickupLocation]     = useState(initValNoDraft('pickupLocation'));
  const [pickupInStore,     setPickupInStore]      = useState(false);
  // Fetched from the admin-managed store location (utils/storeLocation.js)
  // instead of the old build-time env vars — changes on the admin side
  // now show up here without a redeploy.
  const [storeInfo, setStoreInfo] = useState({ storeName: '', storeLat: null, storeLng: null, configured: false });

  useEffect(() => {
    let cancelled = false;
    fetchStoreLocation().then((info) => { if (!cancelled) setStoreInfo(info); });
    return () => { cancelled = true; };
  }, []);
  // What pickupLocation/pickupCoords were right before checking "in-store" —
  // restored if the customer unchecks it, so they don't lose typed/mapped
  // work just from toggling the box on and off.
  const preLockPickup = useRef({ location: '', coords: null });
  const [dropoffLocation,   setDropoffLocation]    = useState(initValNoDraft('dropoffLocation'));
  const [destination,       setDestination]        = useState(initValNoDraft('destination'));
  // Coordinates picked via MapPicker — only populated when the map (not typed
  // text) was used to set the field. null until then; geofencing skips any
  // point that's still null when the booking is created.
  const [pickupCoords,      setPickupCoords]       = useState(null);
  const [dropoffCoords,     setDropoffCoords]      = useState(null);
  const [destinationCoords, setDestinationCoords]  = useState(null);
  const [sameAsPickup]                             = useState(true); // permanent — no path to uncheck this
  // Additional destination pins beyond the primary Destination field —
  // purely for geofencing multiple stops, not part of the coding-rule/
  // extra-fee logic (that stays keyed to the single primary `destination`,
  // which is a business rule about one city/area, not a per-stop thing).
  const [extraDestinations, setExtraDestinations]  = useState([]);

  const handleTogglePickupInStore = (checked) => {
    if (checked) {
      preLockPickup.current = { location: pickupLocation, coords: pickupCoords };
      setPickupLocation(storeInfo.storeName);
      setPickupCoords({ lat: storeInfo.storeLat, lng: storeInfo.storeLng, city: '' });
      setPickupInStore(true);
    } else {
      setPickupLocation(preLockPickup.current.location);
      setPickupCoords(preLockPickup.current.coords);
      setPickupInStore(false);
    }
  };

  // Dropoff always mirrors pickup now — this always runs.
  useEffect(() => {
    setDropoffLocation(pickupLocation);
    setDropoffCoords(pickupCoords);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickupLocation, pickupCoords]);

  const addExtraDestination = () => {
    setExtraDestinations(prev => [...prev, { id: `dest_${Date.now()}_${prev.length}`, address: '', lat: null, lng: null }]);
  };
  const updateExtraDestinationAddress = (id, address) => {
    setExtraDestinations(prev => prev.map(d => d.id === id ? { ...d, address } : d));
  };
  const updateExtraDestinationCoords = (id, { lat, lng, city }) => {
    setExtraDestinations(prev => prev.map(d => d.id === id ? { ...d, lat, lng, city } : d));
  };
  const removeExtraDestination = (id) => {
    setExtraDestinations(prev => prev.filter(d => d.id !== id));
  };
  const [driveType,         setDriveType]          = useState(initValNoDraft('driveType', 'chauffeur'));
  // Which "?" info panel is open on the Trip step (only one at a time).
  const [openInfo, setOpenInfo] = useState(null);
  const toggleInfo = (key) => setOpenInfo((cur) => (cur === key ? null : key));
  const [firstName,         setFirstName]          = useState(() => {
    return userDetails?.firstName || "";
  });
  const [lastName,          setLastName]           = useState(() => {
    return userDetails?.lastName || "";
  });
  const [contact,           setContact]            = useState(userDetails?.phone || user?.phone || "");
  const [email,             setEmail]              = useState(userDetails?.email || user?.email || "");
  const [specialNotes,      setSpecialNotes]       = useState(initValNoDraft('specialNotes'));

  // ── Keep the (read-only) account fields in sync with the account ──
  // These four fields are seeded from useState() only ONCE, on first render.
  // If userDetails/user arrive AFTER that (page refresh on /booking, slow
  // network, logging in mid-booking, or the profile being edited elsewhere)
  // the form stayed blank forever — and since the inputs are read-only for
  // logged-in users, the customer was stuck. So re-sync whenever the account
  // data changes. Guests (user === null) type their own values; leave those.
  useEffect(() => {
    if (!user) return;
    setFirstName(userDetails?.firstName || '');
    setLastName(userDetails?.lastName   || '');
    setContact(userDetails?.phone || user?.phone || '');
    setEmail(userDetails?.email   || user?.email || '');
    // Clear any stale "Required / No email saved" errors for these fields;
    // they get re-validated on the next click of "Next".
    setErrors(prev => {
      if (!prev.firstName && !prev.lastName && !prev.contact && !prev.email) return prev;
      const { firstName: _f, lastName: _l, contact: _c, email: _e, ...rest } = prev;
      return rest;
    });
  }, [user, userDetails]);

  // ── Re-fetch the account when the customer reaches the Details step ──
  // App.jsx only loads userDetails at login/refresh, so if the customer fixed
  // their profile in the meantime (another tab, or Profile page via in-app
  // navigation) the app-level copy is stale and this step would still say
  // "Not set". Pull a fresh copy whenever step 3 opens.
  useEffect(() => {
    if (currentStep !== 3 || !user?.userID) return;
    const token = localStorage.getItem('arl_token');
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${process.env.REACT_APP_API_URL}/user/details/${user.userID}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) return;
        const fresh = await res.json();
        if (cancelled || !onUserDetailsUpdate) return;
        const changed = ['firstName', 'lastName', 'phone', 'email']
          .some(k => (fresh?.[k] || '') !== (userDetails?.[k] || ''));
        if (changed) onUserDetailsUpdate(fresh);
      } catch (err) {
        console.error('Could not refresh account details:', err);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, user?.userID]);
  const [paymentAmount,     setPaymentAmount]      = useState('partial');
  const [paymentMethod,     setPaymentMethod]      = useState('gcash');
  const [gcashReference,    setGcashReference]     = useState('');
  const [paymentScreenshot, setPaymentScreenshot]  = useState(null);
  const [screenshotPreview, setScreenshotPreview]  = useState('');

  const [codingError,      setCodingError]      = useState("");
  const [codingChecking,   setCodingChecking]   = useState(false);

  const [errors,           setErrors]           = useState({});
  const [showConfirmModal,  setShowConfirmModal]  = useState(false);
  const [showAuthModal,     setShowAuthModal]     = useState(false);
  const [bookingReference, setBookingReference] = useState('');
  const [loading,          setLoading]          = useState(false);
  const [paymongoLoading,  setPaymongoLoading]  = useState(false);
  const [hoverDate,        setHoverDate]        = useState(null);

  // Calendar view: two months — start from the month of the pre-selected startDate if available
  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const [calViews, setCalViews] = useState(() => {
    const sd = initVal('startDate', 'startDate');
    const base = sd ? new Date(sd + 'T00:00:00') : new Date();
    return [
      new Date(base.getFullYear(), base.getMonth(), 1),
      new Date(base.getFullYear(), base.getMonth() + 1, 1),
    ];
  });

  // ── Fetch cars ───────────────────────────────────────────────
  useEffect(() => {
    fetch(`${process.env.REACT_APP_API_URL}/cars/all`)
      .then(r => r.json()).then(d => { setCars(d); setCarsLoading(false); })
      .catch(() => { setCarsError('Could not load vehicles.'); setCarsLoading(false); });
  }, []);

  // ── Persist booking draft to localStorage whenever fields change ──
  // pickupLocation/dropoffLocation/destination are deliberately excluded —
  // those should never be recalled on a fresh visit, only carried over
  // live via heroState within the same navigation.
  useEffect(() => {
    saveDraft({ duration, startDate, startTime, endDate, endTime });
  }, [duration, startDate, startTime, endDate, endTime]);

  // ── Auto-revalidate the current date selection against live availability ──
  // startDate/endDate can end up populated WITHOUT ever going through
  // handleDayClick's checks — e.g. restored from a stale localStorage draft,
  // or carried over from Hero navigation state. Previously that meant a
  // range that's no longer available (booked by someone else since it was
  // saved, or spans days that are now blocked) could sit there unvalidated
  // until the customer manually noticed and hit "Clear" themselves. Instead,
  // re-check as soon as we actually know current availability (right after
  // GET /services/car-bookings/:carID resolves) and silently clear+notify
  // if it's no longer valid — never depend on the customer catching it.
  useEffect(() => {
    if (!carBookingsLoaded || !startDate) return;
    const startD = new Date(`${startDate}T00:00:00`);
    const startStatus = dateStatuses[startDate] || 'available';
    const startInvalid = BLOCKED_STATUSES.has(startStatus) || startD < today;

    let endInvalid = false;
    if (endDate) {
      const endD = new Date(`${endDate}T00:00:00`);
      const endStatus = dateStatuses[endDate] || 'available';
      endInvalid = BLOCKED_STATUSES.has(endStatus)
        || rangeCrossesBlocked(dateStatuses, startD, endD);
    }

    if (startInvalid || endInvalid) {
      showToast('One or more of your saved dates are no longer available. Please pick new dates.');
      setStartDate(''); setStartTime(''); setEndDate(''); setEndTime('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carBookingsLoaded, dateStatuses]);

  // ── Fetch service types ──────────────────────────────────────
  useEffect(() => {
    fetch(`${process.env.REACT_APP_API_URL}/services/types`)
      .then(r => r.json()).then(d => { setServiceTypes(d); setServiceTypesLoading(false); })
      .catch(() => setServiceTypesLoading(false));
  }, []);

  // ── Pre-select car from showroom navigation ──────────────────
  useEffect(() => {
    if (!location.state?.carID || cars.length === 0) return;
    const match = cars.find(c => c.carID === location.state.carID);
    if (match) { handleCarSelect(match); setCurrentStep(2); }
  }, [cars, location.state]);

  // ── Fetch bookings when car is selected ──────────────────────
  const handleCarSelect = useCallback(async (car) => {
    setSelectedCar(car);
    setCarBookingsLoaded(false);
    // Only reset date fields if no pre-filled draft data exists
    // (so navigating from Hero with pre-filled data is preserved)
    const hasDraft = !!(duration || startDate || startTime);
    if (!hasDraft) {
      setDuration('');
      setStartDate(''); setStartTime(''); setEndDate(''); setEndTime('');
    }
    try {
      const token = localStorage.getItem("arl_token");
      const res  = await fetch(`${process.env.REACT_APP_API_URL}/services/car-bookings/${car.carID}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setCarBookings(data);
      setDateStatuses(getDateStatuses(data));
      setCarBookingsLoaded(true);
    } catch {
      setCarBookings([]); setDateStatuses({});
      // Deliberately NOT setting carBookingsLoaded here — a failed fetch
      // means we don't actually know availability, so the revalidation
      // effect should not treat this as "confirmed still valid" and should
      // not force-clear a legitimate selection over a network error either.
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration, startDate, startTime]);

  // ── Duration selection → auto-calc end ──────────────────────
  const DURATION_HOURS = { '12 Hours': 12 }; // 22 Hours = user picks end date/time

  const handleDurationSelect = (dur) => {
    setDuration(dur);
    setStartDate(''); setStartTime(''); setEndDate(''); setEndTime('');
    setCodingError('');
  };

  // ── Live coding check — fires whenever destination or schedule changes ──
  useEffect(() => {
    if (currentStep !== 2) return;
    if (!selectedCar?.carID || !startDate || !startTime || !destination) {
      setCodingError("");
      return;
    }
    // Debounce slightly so we don't fire on every keystroke
    const timer = setTimeout(() => {
      runCodingCheck({
        carID: selectedCar.carID,
        startDate, startTime, endDate, endTime, destination,
        destinationCity: destinationCoords?.city || "",
      });
    }, 400);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination, destinationCoords, startDate, startTime, endDate, endTime, selectedCar?.carID, currentStep]);

  const handleStartTimeChange = (time) => {
    setCodingError("");
    setStartTime(time);
    if (duration === '12 Hours' && startDate && time) {
      const { endDate: ed, endTime: et } = calcEnd(startDate, time, 12);
      setEndDate(ed); setEndTime(et);
    } else if (duration === '22 Hours' && startDate && time) {
      // Auto-fill End as soon as Start date + time are both known, instead
      // of leaving the right calendar blank and waiting for a manual click
      // (which was easy to get wrong — e.g. clicking the same day as Start,
      // which silently produced "0 day(s) billed"). Default End = the day
      // after Start; if the customer already picked a later End date
      // themselves (extending the rental), keep that date and just
      // recalculate its time. IMPORTANT: only trust `prev` if it's actually
      // valid (strictly after Start) — a same-day/earlier value can survive
      // here from a stale localStorage draft saved before this fix existed,
      // or from switching duration types, and must not be blindly kept.
      setEndDate(prev => (prev && prev > startDate) ? prev : defaultNextDay(startDate));
      setEndTime(calc22EndTime(time));
    }
  };


  // ── Pricing ──────────────────────────────────────────────────
  const pricingOptions = selectedCar?.pricing || [];

  // Every peso figure on this page (days billed, rental fee, extra/driver's/
  // service/gateway fees, grand total, pay-now/balance split) is computed
  // server-side by POST /bookings/quote — see the debounced effect below.
  // This state is purely a display cache of that response; nothing here is
  // ever sent back to the server as-is (booking creation and PayMongo
  // checkout both recompute their own authoritative totals independently).
  const [quote, setQuote] = useState({
    days: 0, diffHrs: 0, total: 0, extraFee: 0, driversFee: 0,
    serviceFee: 0, gatewayFee: 0, serviceFeeRate: 0, gatewayFeeRate: 0, securityDeposit: 0,
    grandTotal: 0, payNow: 0, balance: 0,
  });
  const [quoteLoading, setQuoteLoading] = useState(false);

  useEffect(() => {
    if (!selectedCar?.carID || !duration) {
      setQuote({ days: 0, diffHrs: 0, total: 0, extraFee: 0, driversFee: 0, serviceFee: 0, gatewayFee: 0, serviceFeeRate: 0, gatewayFeeRate: 0, securityDeposit: 0, grandTotal: 0, payNow: 0, balance: 0 });
      return;
    }
    let cancelled = false;
    setQuoteLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${process.env.REACT_APP_API_URL}/bookings/quote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            carID: selectedCar.carID, duration, startDate, startTime, endDate, endTime,
            destination, driveType, paymentAmount,
            // Structured, when we have one — backend prefers an exact match
            // against these over fuzzy substring-matching the address text
            // for the base-area fee (see pricing.js isBaseArea).
            destinationCity:     destinationCoords?.city     || "",
            destinationProvince: destinationCoords?.province || "",
          }),
        });
        const data = await res.json();
        if (!cancelled && res.ok) {
          setQuote({
            days: data.days || 0,
            diffHrs: data.diffHrs || 0,
            total: data.rentalFee || 0,
            extraFee: data.extraFee || 0,
            driversFee: data.driversFee || 0,
            serviceFee: data.serviceFee || 0,
            gatewayFee: data.gatewayFee || 0,
            serviceFeeRate: data.serviceFeeRate || 0,
            gatewayFeeRate: data.gatewayFeeRate || 0,
            securityDeposit: data.securityDeposit || 0,
            grandTotal: data.grandTotal || 0,
            payNow: data.payNow || 0,
            balance: data.balance || 0,
          });
        }
      } catch (err) {
        console.warn("Quote fetch failed:", err);
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    }, 300); // debounce — avoid a request per keystroke/calendar click

    return () => { cancelled = true; clearTimeout(timer); };
  }, [selectedCar?.carID, duration, startDate, startTime, endDate, endTime, destination, driveType, paymentAmount]);

  const { days, total, diffHrs, extraFee, driversFee, serviceFee, gatewayFee, serviceFeeRate, gatewayFeeRate, securityDeposit, grandTotal } = quote;
  const getPayNow  = () => quote.payNow;
  const getBalance = () => quote.balance;

  // Bookings of 10 billable days or more are not allowed. `days` comes
  // straight from the server-computed quote, so this mirrors the same
  // MAX_BOOKING_DAYS guard enforced authoritatively in bookings.controller.js.
  const MAX_BOOKING_DAYS = 10;
  const maxDaysError = days >= MAX_BOOKING_DAYS
    ? `Bookings of ${MAX_BOOKING_DAYS} days or more aren't allowed here. Please pick a shorter date range, or contact us directly for long-term rentals.`
    : '';

  // GCash, Maya, and QRPH now all go through PayMongo's hosted checkout
  // (redirect flow, like the "GCash Test Payment Page" in test mode)
  // instead of the manual send-money-then-upload-screenshot flow.
  const isPaymongoMethod = (m) => ['gcash', 'maya', 'qrph'].includes(m);

  // methodOfPayment label stored in DB
  const getMethodOfPayment = () => {
    if (paymentAmount === 'partial') return 'Partial';
    return 'Full';
  };

  // ── Calendar rendering ───────────────────────────────────────
  const navMonth = (idx, dir) => {
    setCalViews(prev => {
      const next = [...prev];
      next[idx]  = new Date(prev[idx].getFullYear(), prev[idx].getMonth() + dir, 1);
      return next;
    });
  };

  const handleDayClick = (date, idx) => {
    const key = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    const status = dateStatuses[key] || 'available';
    if (BLOCKED_STATUSES.has(status) || date < today) return;
    setCodingError("");

    if (duration === '12 Hours') {
      // 12 hours: end is always auto-calculated from start+time, never
      // independently pickable — so a click on the End calendar (idx 1)
      // must do nothing, not silently overwrite the start date. This was
      // the bug: previously any click here fell through to setStartDate()
      // regardless of which calendar it came from.
      if (idx === 1) return;
      setStartDate(key);
      setEndDate(''); setEndTime('');
      if (startTime) {
        const { endDate: ed, endTime: et } = calcEnd(key, startTime, 12);
        setEndDate(ed); setEndTime(et);
      }
    } else if (duration === '22 Hours') {
      if (idx === 0) {
        // Left calendar: always sets Start, never End. Default End to the
        // day after Start right away — the customer can still move it
        // further out via the right calendar to extend the rental, but
        // this way they're never left with a blank/wrong End by default.
        setStartDate(key);
        setEndDate(defaultNextDay(key));
        setEndTime('');
        setStartTime('');
      } else {
        // Right calendar: always sets End, never Start. With no start date
        // yet, there's nothing to set an end relative to — do nothing
        // (this calendar is rendered disabled in that state anyway).
        if (!startDate) return;
        const clickedDate  = new Date(key);
        const startDateObj = new Date(startDate);
        if (clickedDate <= startDateObj) {
          // Can't end on or before the day it starts — a 22-hour block
          // never fits inside the same calendar day for any realistic
          // pickup time, so same-day was the exact bug being fixed here.
          // Ignore rather than silently accepting a same-day End.
          return;
        }
        if (rangeCrossesBlocked(dateStatuses, startDateObj, clickedDate)) {
          showToast('That range includes a date that\'s already unavailable. Please choose a shorter range or a different start date.');
          return;
        }
        setEndDate(key);
        // Auto-calc end time: start time - 2 hours (22hrs = next day same time minus 2hrs)
        if (startTime) {
          setEndTime(calc22EndTime(startTime));
        }
      }
    }
  };

  const renderCalendar = (baseDate, idx) => {
    const year      = baseDate.getFullYear();
    const month     = baseDate.getMonth();
    const firstDay  = new Date(year, month, 1).getDay();
    const numDays   = new Date(year, month + 1, 0).getDate();
    const startDO   = startDate ? toMidnight(new Date(startDate)) : null;
    const endDO     = endDate   ? toMidnight(new Date(endDate))   : null;

    return (
      <div key={idx}>
        <div className="flex justify-center mb-2">
          <span className={`px-3 py-1 rounded-full text-xs font-bold text-white ${idx === 0 ? 'bg-green-600' : 'bg-red-600'}`}>
            {idx === 0 ? 'Start' : 'End'}
          </span>
        </div>
        <div className="border-2 border-gray-200 rounded-2xl p-2.5 sm:p-4">
        <div className="flex items-center justify-between mb-2.5 sm:mb-4">
          <button type="button" onClick={() => navMonth(idx, -1)}
            className="w-7 h-7 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl border-2 border-gray-200 hover:bg-arl-primary hover:text-white hover:border-arl-primary text-gray-600 text-base sm:text-xl font-bold transition-colors">‹</button>
          <span className="text-sm sm:text-base font-bold text-arl-dark">{MONTHS[month]} {year}</span>
          <button type="button" onClick={() => navMonth(idx, 1)}
            className="w-7 h-7 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl border-2 border-gray-200 hover:bg-arl-primary hover:text-white hover:border-arl-primary text-gray-600 text-base sm:text-xl font-bold transition-colors">›</button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 sm:gap-1 mb-1 sm:mb-2">
          {DAYS.map(d => <div key={d} className="text-center text-[10px] sm:text-xs font-bold text-gray-400 py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
          {Array(firstDay).fill(null).map((_,i) => <div key={`e${i}`} />)}
          {Array.from({ length: numDays }, (_, i) => {
            const date   = new Date(year, month, i + 1);
            date.setHours(0,0,0,0);
            const key    = toLocalDateStr(date);
            const ds     = dateStatuses[key] || 'available';
            const style  = DATE_STYLES[ds] || DATE_STYLES.available;
            const isPast = date < today;
            const isBlocked = BLOCKED_STATUSES.has(ds) || isPast;
            const isStart   = sameDay(date, startDO);
            const isEnd     = sameDay(date, endDO);
            const inRange   = startDO && endDO && date > startDO && date < endDO;
            const isHover   = hoverDate && startDO && !endDO && date > startDO && date <= toMidnight(hoverDate);

            // In 12-Hour mode, end = start + fixed hours, always. There's
            // nothing to independently pick on the End calendar — it's
            // purely a readout, so it shouldn't look or behave clickable.
            // Right calendar is locked in two different cases, for two
            // different reasons: 12-Hour mode never has an independent end
            // date at all (it's auto-calculated); 22-Hour mode's end date
            // is real, but meaningless with no start date to be relative to.
            const endCalendarLocked = idx === 1 && (duration === '12 Hours' || (duration === '22 Hours' && !startDate));
            // Same-day End is invalid in 22-Hour mode — a 22-hour block never
            // fits inside the calendar day it starts on for any realistic
            // pickup time. This is the exact cell that produced "0 day(s)
            // billed" when clicked, so it's shown disabled instead.
            const sameDayEndInvalid = idx === 1 && duration === '22 Hours' && isStart;
            const interactionDisabled = isBlocked || endCalendarLocked || sameDayEndInvalid;

            let cls = `text-center text-xs sm:text-sm py-1 sm:py-2 rounded-lg sm:rounded-xl transition-all font-medium relative `;
            if (isPast) {
              cls += 'text-gray-300 cursor-not-allowed ';
            } else if (isBlocked) {
              cls += `${style.bg} ${style.text} cursor-not-allowed text-[10px] sm:text-xs `;
            } else if (sameDayEndInvalid) {
              cls += 'bg-gray-100 text-gray-300 cursor-not-allowed ';
            } else if (idx === 1 ? isEnd : isStart) {
              // Each calendar shows its own role's color first when a date
              // is both (the 12-Hour same-day case) — Start calendar → green,
              // End calendar → red, even though it's the same calendar date.
              cls += idx === 1
                ? `bg-red-600 text-white font-black shadow-md scale-105 ${endCalendarLocked ? 'cursor-not-allowed' : 'cursor-pointer'} `
                : 'bg-green-600 text-white cursor-pointer font-black shadow-md scale-105 ';
            } else if (idx === 1 ? isStart : isEnd) {
              cls += idx === 1
                ? 'bg-green-600 text-white cursor-pointer font-black shadow-md scale-105 '
                : 'bg-red-600 text-white cursor-pointer font-black shadow-md scale-105 ';
            } else if (endCalendarLocked) {
              cls += 'text-gray-300 cursor-not-allowed ';
            } else if (inRange) {
              cls += 'bg-arl-secondary/20 text-arl-primary cursor-pointer ';
            } else if (isHover) {
              cls += 'bg-arl-secondary/10 text-arl-primary cursor-pointer ';
            } else {
              cls += 'text-gray-700 hover:bg-arl-primary/10 hover:text-arl-primary cursor-pointer ';
            }

            return (
              <button
                key={i}
                type="button"
                className={cls}
                title={!isPast && ds !== 'available' ? style.label : (sameDayEndInvalid ? 'Return date must be after your start date' : endCalendarLocked ? (duration === '12 Hours' ? 'Auto-calculated from pickup time' : 'Pick a start date first') : undefined)}
                onClick={() => !interactionDisabled && handleDayClick(date, idx)}
                onMouseEnter={() => { if (startDO && !endDO && !interactionDisabled) setHoverDate(date); }}
                onMouseLeave={() => setHoverDate(null)}
                disabled={interactionDisabled}>
                {i + 1}
              </button>
            );
          })}
        </div>
        {/* Legend */}
        <div className="flex flex-wrap gap-2 sm:gap-3 mt-2.5 sm:mt-4 pt-2.5 sm:pt-3 border-t border-gray-100">
          {[['available', DATE_STYLES.available], ['unavailable', UNAVAILABLE_STYLE]].map(([k, v]) => (
            <div key={k} className="flex items-center gap-1 sm:gap-1.5">
              <div className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-md ${v.bg || 'bg-gray-200 border border-gray-300'}`} />
              <span className="text-[10px] sm:text-xs text-gray-500 capitalize">{v.label}</span>
            </div>
          ))}
        </div>
        </div>
      </div>
    );
  };

  // ── Validation ───────────────────────────────────────────────
  const steps = [
    { number: 1, label: 'Vehicle' }, { number: 2, label: 'Trip' },
    { number: 3, label: 'Details' }, { number: 4, label: 'Pay'  }, { number: 5, label: 'Confirm' },
  ];

  const canProceed = () => {
    if (currentStep === 1) return !!selectedCar;
    if (currentStep === 2) {
      const allOk = !!(serviceType && duration && startDate && startTime && endDate && endTime && pickupLocation && dropoffLocation && destination && !codingError && !maxDaysError);
      if (tripPart === 1) return !!serviceType && !(serviceType === 'Others' && !otherServiceNote.trim());
      if (tripPart === 2) return !!duration;
      if (tripPart === 3) return !!(pickupLocation && dropoffLocation);
      if (tripPart === 4) return !!destination;
      if (tripPart === 5) return !!(startDate && startTime && endDate && endTime && !codingError && !maxDaysError);
      return allOk; // last part: everything must be complete
    }
    if (currentStep === 3) return !!(firstName && lastName && /^(\+639|09)\d{9}$/.test(contact) && /\S+@\S+\.\S+/.test(email));
    if (currentStep === 4) {
      if (payPart === 1) return !quoteLoading && grandTotal > 0; // details are read-only; wait for the total
      if (isPaymongoMethod(paymentMethod)) return true;
      return !!(gcashReference && paymentScreenshot);
    }
    return true;
  };

  // Plain-language list of what's still missing for the current step — shown
  // next to the Next button live, so the customer never has to click first
  // (or guess) to find out why it's grayed out. Mirrors canProceed()'s checks
  // exactly, one item per thing that's blocking.
  const getIncompleteReason = () => {
    const missing = [];
    if (currentStep === 1) {
      if (!selectedCar) missing.push('a vehicle');
    } else if (currentStep === 2) {
      const last = tripPart === TRIP_PARTS.length;
      if ((last || tripPart === 1) && !serviceType)            missing.push('a service type');
      if ((last || tripPart === 1) && serviceType === 'Others' && !otherServiceNote.trim()) missing.push('a description of the service');
      if ((last || tripPart === 2) && !duration)                missing.push('a duration');
      if ((last || tripPart === 5) && (!startDate || !startTime)) missing.push('a pickup date & time');
      if ((last || tripPart === 5) && (!endDate || !endTime))     missing.push('an end date & time');
      if ((last || tripPart === 3) && !pickupLocation)          missing.push('a pickup location');
      if ((last || tripPart === 3) && !dropoffLocation)         missing.push('a drop-off location');
      if ((last || tripPart === 4) && !destination)             missing.push('a destination');
      if (tripPart >= 5 && codingError)              missing.push('a different date or vehicle (Number Coding restriction)');
      if (tripPart >= 5 && maxDaysError)             missing.push('a shorter rental period (under 10 days)');
    } else if (currentStep === 3) {
      if (!firstName) missing.push('your first name');
      if (!lastName)  missing.push('your last name');
      if (!contact || !/^(\+639|09)\d{9}$/.test(contact)) {
        missing.push(user ? 'a valid contact number on your account' : 'a valid contact number');
      }
      if (!email || !/\S+@\S+\.\S+/.test(email)) {
        missing.push(user ? 'a valid email on your account' : 'a valid email');
      }
    } else if (currentStep === 4) {
      if (payPart === 1) {
        if (quoteLoading || !(grandTotal > 0)) return 'Please wait while your total is computed.';
      } else if (!isPaymongoMethod(paymentMethod)) {
        if (!gcashReference)    missing.push('a reference number');
        if (!paymentScreenshot) missing.push('a payment screenshot');
      }
    }
    if (missing.length === 0) return '';
    if (missing.length === 1) return `Add ${missing[0]} to continue.`;
    const last = missing[missing.length - 1];
    return `Add ${missing.slice(0, -1).join(', ')} and ${last} to continue.`;
  };

  const validateStep = () => {
    const e = {};
    if (currentStep === 1 && !selectedCar)  e.vehicle = 'Please select a vehicle.';
    if (currentStep === 2) {
      // Only the part currently on screen is validated (the last part
      // re-checks everything, as a safety net before leaving the step).
      const last = tripPart === TRIP_PARTS.length;
      if ((last || tripPart === 1) && !serviceType)     e.serviceType     = 'Choose a service.';
      if ((last || tripPart === 1) && serviceType === 'Others' && !otherServiceNote.trim()) e.serviceType = 'Please describe the service.';
      if ((last || tripPart === 2) && !duration)        e.duration        = 'Choose a duration.';
      if ((last || tripPart === 5) && !startDate)       e.startDate       = 'Select a start date.';
      if ((last || tripPart === 5) && !startTime)       e.startTime       = 'Set a pickup time.';
      if ((last || tripPart === 5) && (!endDate || !endTime)) e.endDate     = 'End date/time is required.';
      if ((last || tripPart === 3) && !pickupLocation)  e.pickupLocation  = 'Enter a pickup location.';
      if ((last || tripPart === 3) && !dropoffLocation) e.dropoffLocation = 'Enter a drop-off location.';
      if ((last || tripPart === 4) && !destination)     e.destination     = 'Please enter a destination.';
      if (tripPart >= 5 && codingError)      e.coding          = codingError;
      if (tripPart >= 5 && maxDaysError)     e.maxDays         = maxDaysError;
    }
    if (currentStep === 3) {
      if (!firstName) e.firstName = 'Required.';
      if (!lastName)  e.lastName  = 'Required.';
      if (!contact) {
        e.contact = user
          ? 'No contact number saved on your account.'
          : 'Required.';
      } else if (!/^(\+639|09)\d{9}$/.test(contact)) {
        e.contact = user
          ? 'The contact number on your account is not a valid PH number.'
          : 'Enter a valid PH number.';
      }
      if (!email) {
        e.email = user
          ? 'No email saved on your account.'
          : 'Required.';
      } else if (!/\S+@\S+\.\S+/.test(email)) {
        e.email = user
          ? 'The email on your account is not valid.'
          : 'Invalid email.';
      }
    }
    if (currentStep === 4 && payPart === 2) {
      if (!isPaymongoMethod(paymentMethod)) {
        if (!gcashReference)    e.gcashReference    = 'Reference number required.';
        if (!paymentScreenshot) e.paymentScreenshot = 'Please upload your payment screenshot.';
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Shared coding rule checker ─────────────────────────────
  const runCodingCheck = useCallback(async ({ carID, startDate, startTime, endDate, endTime, destination, destinationCity }) => {
    if (!carID || !startDate || !startTime) return; // not enough info yet
    setCodingChecking(true);
    setCodingError("");
    try {
      const startDT = new Date(`${startDate}T${startTime}:00`);
      const endDT   = endDate && endTime ? new Date(`${endDate}T${endTime}:00`) : null;
      const res = await fetch(`${process.env.REACT_APP_API_URL}/bookings/check-coding`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("arl_token")}` },
        body: JSON.stringify({
          carID,
          startDateTime:   startDT.toISOString(),
          endDateTime:     endDT ? endDT.toISOString() : null,
          destination:     destination || "",
          // Exact structured city, when we have one (map-picked, not typed) —
          // backend prefers this over the fuzzy substring match on destination.
          destinationCity: destinationCity || "",
        }),
      });
      const data = await res.json();
      if (data.holiday) {
        // Holiday detected — coding rules are suspended, allow booking
        setCodingError(""); 
        return false; // not blocked
      }
      if (data.blocked) {
        setCodingError(data.reason || "This vehicle is not allowed due to Number Coding Scheme on the selected date/time.");
        return true; // blocked
      }
      return false; // clear
    } catch (err) {
      console.warn("Coding rule check failed:", err);
      setCodingError("Could not verify Number Coding rules. Please check your connection and try again.");
      return true; // block on error to be safe
    } finally {
      setCodingChecking(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePaymongoCheckout = async (bookingID, paymentID) => {
    setPaymongoLoading(true);
    try {
      const token = localStorage.getItem("arl_token");
      const res = await fetch(`${process.env.REACT_APP_API_URL}/paymongo/create-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          bookingID,
          paymentID,
          description: `ARL Track Booking #${bookingID}`,
          paymentMethod,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to create payment link.");
      // Redirect to PayMongo checkout — paymentID in return URL so we can poll status
      window.location.href = data.checkoutUrl + `?paymentID=${paymentID}`;
    } catch (err) {
      showToast(err.message || "Could not connect to PayMongo. Please try again.");
    } finally {
      setPaymongoLoading(false);
    }
  };

  const handleNext = async () => {
    if (!validateStep()) {
      stepTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    // ── Auth check — only when user tries to go past Step 1 ──
    if (currentStep === 1 && !user) {
      setShowAuthModal(true);
      return;
    }

    // ── Pay step: details first, then option + method ──
    if (currentStep === 4 && payPart === 1) {
      setPayPart(2);
      setTimeout(() => stepTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
      return;
    }

    // ── Trip step is split into parts — advance within it first ──
    if (currentStep === 2 && tripPart < TRIP_PARTS.length) {
      setTripPart(tripPart + 1);
      setTimeout(() => stepTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
      return;
    }


    // ── Coding rule check when leaving Step 2 ────────────────
    if (currentStep === 2) {
      if (selectedCar?.carID && startDate && startTime) {
        const blocked = await runCodingCheck({
          carID: selectedCar.carID,
          startDate, startTime, endDate, endTime, destination,
          destinationCity: destinationCoords?.city || "",
        });
        if (blocked) return; // stop — don't advance to step 3
      }
    }

    if (currentStep < 5) {
      if (currentStep === 1) setTripPart(1); // always start the Trip step from its first part
      if (currentStep === 3) setPayPart(1);  // always open Payment on the details/total first
      setCurrentStep(currentStep + 1);
      return;
    }

    // Step 5 — submit booking to backend
    setLoading(true);
    try {
      // Convert screenshot to base64
      let proofBase64 = "";
      if (paymentScreenshot) {
        proofBase64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result.split(",")[1]);
          reader.readAsDataURL(paymentScreenshot);
        });
      }

      const response = await fetch(`${process.env.REACT_APP_API_URL}/bookings/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("arl_token")}` },
        body: JSON.stringify({
          userID:          user?.userID    || "",
          carID:           selectedCar?.carID || "",
          serviceType: serviceType === "Others" ? otherServiceNote || "Others" : serviceType,
          serviceTypeID: serviceType === "Others" ? null : serviceTypeID,
          duration,
          startDate,
          startTime,
          endDate,
          endTime,
          // NOTE: totalDays / rentalFee / extraFee / driversFee / serviceFee /
          // gatewayFee / grandTotal / methodOfPayment are no
          // longer sent — the backend recomputes every one of these itself
          // (from the car's Firestore pricing + these dates/destination/
          // driveType) instead of trusting whatever the browser calculated.
          pickupLocation:  pickupLocation,
          dropoffLocation: dropoffLocation,
          destination,
          // Only set if the customer actually used the map picker for that
          // field — backend skips geofencing for whichever ones are missing.
          pickupLat:       pickupCoords?.lat      ?? null,
          pickupLng:       pickupCoords?.lng      ?? null,
          dropoffLat:      dropoffCoords?.lat     ?? null,
          dropoffLng:      dropoffCoords?.lng     ?? null,
          destinationLat:  destinationCoords?.lat ?? null,
          destinationLng:  destinationCoords?.lng ?? null,
          // Structured city, when we have one — backend prefers this over
          // fuzzy substring-matching the address string for coding rules.
          pickupCity:      pickupCoords?.city      || "",
          destinationCity: destinationCoords?.city || "",
          // Same reasoning as destinationCity — exact match preferred over
          // substring-matching the raw address for the base-area fee.
          destinationProvince: destinationCoords?.province || "",
          // Additional stop pins beyond the primary destination — only sent
          // for entries that actually have coordinates (map-picked, not just
          // typed text with no pin).
          extraDestinations: extraDestinations
            .filter(d => d.lat != null && d.lng != null)
            .map(d => ({ address: d.address || "", lat: d.lat, lng: d.lng, city: d.city || "" })),
          driveType,
          firstName,
          lastName,
          contact,
          email,
          specialNotes,
          paymentAmount,
          paymentMethod,
          referenceNumber: gcashReference,
          proofBase64,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // For the duplicate-booking guard specifically, the backend now also
        // sends the conflicting booking's own dates — show them instead of
        // just repeating the generic message, so it's clear which existing
        // reservation is actually in the way (and not a false positive).
        if (response.status === 409 && data.existingStartDateTime && data.existingEndDateTime) {
          showToast(
            `${data.message} (Existing booking: ${fmt(data.existingStartDateTime)} – ${fmt(data.existingEndDateTime)}, status: ${data.existingStatus || 'unknown'}. Check My Bookings.)`
          );
        } else {
          showToast(data.message || "Booking failed. Please try again.");
        }
        return;
      }

      // Update userDetails in app state if firstName/lastName was saved
      if (onUserDetailsUpdate && firstName && lastName && !userDetails?.firstName) {
        onUserDetailsUpdate({ ...userDetails, firstName, lastName });
      }

      setBookingReference(data.bookingID);

      // If GCash / Maya / QRPH, redirect to PayMongo checkout instead of showing confirmation modal
      if (isPaymongoMethod(paymentMethod)) {
        await handlePaymongoCheckout(data.bookingID, data.paymentID);
        setLoading(false);
        return;
      }

      setShowConfirmModal(true);

    } catch (err) {
      console.error("Booking error:", err);
      showToast("Could not connect to server. Please try again.");
    } finally {
      setLoading(false);
    }
  };
  const handleBack = () => {
    if (currentStep === 2 && tripPart > 1) {
      setTripPart(tripPart - 1);
      setTimeout(() => stepTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
      return;
    }
    if (currentStep === 4 && payPart > 1) {
      setPayPart(payPart - 1);
      setTimeout(() => stepTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
      return;
    }
    if (currentStep === 5) setPayPart(2);                  // coming back from Review lands on the payment choice
    if (currentStep === 3) setTripPart(TRIP_PARTS.length); // coming back lands on the last Trip part
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const resetBooking = () => {
    clearDraft();
    setShowConfirmModal(false); setCurrentStep(1); setTripPart(1); setPayPart(1); setSelectedCar(null);
    setServiceType(''); setOtherServiceNote(''); setDuration(''); setStartDate(''); setStartTime('');
    setEndDate(''); setEndTime(''); setPickupLocation(''); setPickupInStore(false);
    setDropoffLocation(''); setDestination(''); setDriveType('chauffeur');
    setPickupCoords(null); setDropoffCoords(null); setDestinationCoords(null); setExtraDestinations([]);
    preLockPickup.current = { location: '', coords: null };
    // Logged-in customers can't retype these (read-only), so restore them from
    // the account instead of blanking them. Guests start empty.
    setFirstName(user ? (userDetails?.firstName || '') : '');
    setLastName(user  ? (userDetails?.lastName  || '') : '');
    setContact(user   ? (userDetails?.phone || user?.phone || '') : '');
    setEmail(user     ? (userDetails?.email || user?.email || '') : '');
    setSpecialNotes(''); setPaymentAmount('partial'); setPaymentMethod('gcash');
    setGcashReference(''); setPaymentScreenshot(null); setScreenshotPreview(''); setErrors({});
  };

  // ── Body types for filter ────────────────────────────────────
  const bodyTypes = useMemo(() => ['All', ...new Set(cars.map(c => c.bodyType).filter(Boolean))].sort(), [cars]);

  const filteredCars = useMemo(() => {
    let r = [...cars];
    if (carSearch.trim()) {
      const q = carSearch.toLowerCase();
      r = r.filter(c => c.name.toLowerCase().includes(q) || c.brandName.toLowerCase().includes(q) || c.bodyType.toLowerCase().includes(q));
    }
    if (filterBody !== 'All') r = r.filter(c => c.bodyType === filterBody);
    return r;
  }, [cars, carSearch, filterBody]);

  // ── Payment step: detail rows (each has a "?" explanation) + split amounts ──
  const peso = (n) => `₱${Number(n || 0).toLocaleString()}`;
  const depositPaidUpfront = Math.min(Math.max(0, securityDeposit || 0), grandTotal || 0);
  // Mirrors the server's computePaymentSplit: Partial = full deposit + 50% of everything else.
  const partialNow     = depositPaidUpfront + Math.floor(((grandTotal || 0) - depositPaidUpfront) * 0.5);
  const partialBalance = Math.max(0, (grandTotal || 0) - partialNow);

  const payDetailRows = [
    {
      key: 'rental', label: 'Rental Fee', value: peso(total),
      title: 'Rental Fee',
      items: [
        'The price of the vehicle for the duration and number of days you selected.',
        'It is the base amount your service fee is computed from.',
      ],
    },
    ...(extraFee > 0 ? [{
      key: 'extra', label: 'Extra Fee (Outside Area)', value: peso(extraFee),
      title: 'Extra Fee (Outside Area)',
      items: [
        'Added when your destination is outside our base service area.',
        'It is shown here so there are no surprises on pickup day.',
      ],
    }] : []),
    ...(driversFee > 0 ? [{
      key: 'driver', label: "Driver's Fee", value: peso(driversFee),
      title: "Driver's Fee",
      items: [
        'Charged for the driver when you book With Chauffeur.',
        'The amount depends on whether your trip is inside or outside our base service area.',
        "Fuel and toll fees are still the renter's responsibility.",
      ],
    }] : []),
    ...(securityDeposit > 0 ? [{
      key: 'deposit', label: 'Security Deposit (refundable)', value: peso(securityDeposit),
      title: 'Security Deposit (refundable)',
      items: [
        'A refundable amount held to protect the vehicle during your rental.',
        'It is included in your total and is always paid upfront, even with Partial Payment.',
        'Refunded in full when the vehicle is returned in satisfactory condition with no outstanding charges. (T&C: Security Deposit)',
      ],
    }] : []),
    {
      key: 'service', label: serviceFeeRate > 0 ? `Service Fee (${serviceFeeRate}% of rental)` : 'Service Fee', value: peso(serviceFee),
      title: 'Service Fee',
      items: [
        serviceFeeRate > 0
          ? `ARL's service fee, computed as ${serviceFeeRate}% of the rental fee only.`
          : "ARL's service fee, computed from the rental fee only.",
        "It is not charged on the extra fee, driver's fee, or security deposit.",
        'It is refunded together with your booking amount when a refund applies. (T&C: Cancellation & Refund Policy)',
      ],
    },
    {
      key: 'gateway', label: gatewayFeeRate > 0 ? `Online Gateway Fee (${gatewayFeeRate}% of total)` : 'Online Gateway Fee', value: peso(gatewayFee),
      title: 'Online Gateway Fee',
      items: [
        'The fee for processing your payment online through our secure payment gateway (GCash, Maya, or QRPH checkout).',
        gatewayFeeRate > 0
          ? `Computed as ${gatewayFeeRate}% of everything else on your booking: rental fee, extra fee, driver's fee, service fee, and security deposit.`
          : "Computed from everything else on your booking: rental fee, extra fee, driver's fee, service fee, and security deposit.",
        'It is refunded together with your booking amount when a refund applies. (T&C: Payment Terms)',
      ],
    },
  ];

  // ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-arl-primary/10 to-arl-secondary/10 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12">

        {/* Title */}
        <div className="mb-6 sm:mb-8">
          <h2 className="font-display font-bold text-2xl sm:text-4xl text-arl-dark mb-2">
            Reserve your <span className="text-arl-secondary">ride.</span>
          </h2>
          <p className="text-sm sm:text-base text-gray-600">Fill in the details below to complete your booking.</p>
        </div>

        {/* Step progress */}
        <div className="flex items-center justify-center mb-8 sm:mb-12 overflow-x-auto px-2">
          {steps.map((step, index) => (
            <React.Fragment key={step.number}>
              <div className="flex flex-col items-center flex-shrink-0">
                <div className={`w-8 h-8 sm:w-12 sm:h-12 rounded-full flex items-center justify-center font-bold text-sm sm:text-lg ${
                  currentStep === step.number ? 'bg-arl-cta text-white'
                  : currentStep > step.number ? 'bg-arl-primary text-white'
                  : 'bg-gray-300 text-gray-600'
                }`}>{step.number}</div>
                <span className="hidden sm:block text-xs mt-1 text-gray-600">{step.label}</span>
              </div>
              {index < steps.length - 1 && (
                <div className={`w-6 sm:w-16 h-1 mx-1 sm:mx-2 flex-shrink-0 ${currentStep > step.number ? 'bg-arl-primary' : 'bg-gray-300'}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl border-2 border-arl-primary p-4 sm:p-8 shadow-card">

              {/* ══ STEP 1 — VEHICLE ═══════════════════════════════ */}
              <div ref={stepTopRef} />
              {currentStep === 1 && (
                <div>
                  <h3 className="text-2xl font-bold text-arl-dark mb-1">Choose your vehicle</h3>
                  <p className="text-gray-500 text-sm mb-6">Select the car that suits your trip.</p>
                  <div className="flex flex-col sm:flex-row gap-3 mb-4">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
                      <input type="text" placeholder="Search by name or brand…" value={carSearch}
                        onChange={e => setCarSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-arl-secondary text-sm" />
                    </div>
                    <select value={filterBody} onChange={e => setFilterBody(e.target.value)}
                      className="px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-arl-secondary text-sm bg-white text-gray-600">
                      {bodyTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  {!carsLoading && !carsError && (
                    <p className="text-xs text-gray-400 mb-4">
                      Showing <span className="font-semibold text-arl-primary">{filteredCars.length}</span> of <span className="font-semibold">{cars.length}</span> vehicles
                    </p>
                  )}
                  {carsError  && <p className="text-red-400 text-sm mb-4">⚠ {carsError}</p>}
                  {errors.vehicle && <p className="text-arl-cta text-sm mb-4">⚠ {errors.vehicle}</p>}
                  <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-4 max-h-[600px] overflow-y-auto pr-1">
                    {carsLoading
                      ? Array.from({length:6}).map((_,i) => <SkeletonCard key={i} />)
                      : filteredCars.length > 0
                      ? filteredCars.map(car => (
                          <VehiclePickCard key={car.carID} car={car}
                            selected={selectedCar?.carID === car.carID}
                            onSelect={handleCarSelect} />
                        ))
                      : <div className="col-span-3 text-center py-12 text-gray-400"><p className="text-3xl mb-2">🔍</p><p className="text-sm">No vehicles found.</p></div>
                    }
                  </div>
                </div>
              )}

              {/* ══ STEP 2 — TRIP DETAILS ══════════════════════════ */}
              {currentStep === 2 && (
                <div>
                  {/* Selected car banner */}
                  {tripPart === 1 && selectedCar && (
                    <div className="flex items-center gap-4 bg-arl-primary/5 border border-arl-primary/20 rounded-xl p-4 mb-6">
                      {selectedCar.imageURL
                        ? <img src={selectedCar.imageURL} alt={selectedCar.name} className="w-20 h-14 object-cover rounded-lg" onError={e => e.target.style.display='none'} />
                        : <div className="w-20 h-14 bg-gray-100 rounded-lg flex items-center justify-center text-2xl">🚗</div>}
                      <div>
                        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Selected Vehicle</p>
                        <p className="text-lg font-black text-arl-primary">{selectedCar.name}</p>
                        <p className="text-xs text-gray-500">{[selectedCar.bodyType, selectedCar.transmission, selectedCar.fuelType].filter(Boolean).join(' · ')}</p>
                      </div>
                    </div>
                  )}

                  <TripPartIntro part={TRIP_PARTS[tripPart - 1]} index={tripPart - 1} total={TRIP_PARTS.length} />

                  {/* Draft restored notice */}
                  {tripPart === 1 && (duration || startDate || startTime || destination) && (
                    <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-6 text-sm">
                      <span className="text-lg">💾</span>
                      <span className="text-green-700 font-medium">Your previous selections were restored. You can change them below.</span>
                      <button
                        type="button"
                        onClick={() => { clearDraft(); setDuration(''); setStartDate(''); setStartTime(''); setEndDate(''); setEndTime(''); setDestination(''); setPickupLocation(''); setPickupInStore(false); setDropoffLocation(''); setPickupCoords(null); setDropoffCoords(null); setDestinationCoords(null); setExtraDestinations([]); preLockPickup.current = { location: '', coords: null }; }}
                        className="ml-auto text-xs text-red-500 hover:text-red-700 font-semibold underline"
                      >Clear</button>
                    </div>
                  )}

                  {tripPart === 1 && (<>
                  {/* Service type — from Firestore */}
                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                      <label className="block text-sm font-semibold text-arl-dark">Service Type</label>
                      <InfoButton open={openInfo === 'service'} onClick={() => toggleInfo('service')} label="About service types" />
                    </div>
                    {openInfo === 'service' && <InfoPanel {...INFO.service} />}
                    {serviceTypesLoading
                      ? <div className="text-sm text-gray-400 animate-pulse">Loading services…</div>
                      : (
                        <>
                          <div className="grid grid-cols-2 gap-2 sm:gap-3">
                            {serviceTypes.map(s => (
                              <button key={s.serviceID} type="button"
                                onClick={() => { setServiceType(s.serviceType); setServiceTypeID(s.serviceID); setOtherServiceNote(''); }}
                                className={`px-2.5 sm:px-4 py-2 sm:py-3 rounded-xl border-2 text-xs sm:text-sm font-medium text-left transition-colors ${
                                  serviceType === s.serviceType
                                    ? 'border-arl-secondary bg-blue-50 text-arl-primary'
                                    : 'border-gray-300 text-gray-700 hover:border-arl-primary'}`}>
                                {s.serviceType}
                              </button>
                            ))}
                            <button type="button"
                              onClick={() => { setServiceType('Others'); setServiceTypeID(null); }}
                              className={`px-2.5 sm:px-4 py-2 sm:py-3 rounded-xl border-2 text-xs sm:text-sm font-medium text-left transition-colors ${
                                serviceType === 'Others'
                                  ? 'border-arl-secondary bg-blue-50 text-arl-primary'
                                  : 'border-gray-300 text-gray-700 hover:border-arl-primary'}`}>
                              Others
                            </button>
                          </div>
                          {serviceType === 'Others' && (
                            <div className="mt-3">
                              <input
                                type="text"
                                placeholder="Please describe your service…"
                                value={otherServiceNote}
                                onChange={e => setOtherServiceNote(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl border-2 border-arl-secondary bg-blue-50 text-sm text-arl-dark placeholder-gray-400 focus:outline-none focus:border-arl-primary transition-colors"
                              />
                            </div>
                          )}
                        </>
                      )
                    }
                    {errors.serviceType && <p className="text-arl-cta text-xs mt-2">{errors.serviceType}</p>}
                  </div>

                  </>)}

                  {tripPart === 2 && (<>
                  {/* Duration — from car's pricing */}
                  <div className="mb-6">
                    <label className="block text-sm font-semibold text-arl-dark mb-3">Duration per Day</label>
                    {pricingOptions.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        {pricingOptions.map(p => (
                          <button key={p.durationType} type="button"
                            onClick={() => handleDurationSelect(p.durationType)}
                            className={`px-3 sm:px-4 py-3 sm:py-4 rounded-xl border-2 text-left transition-colors ${
                              duration === p.durationType ? 'border-arl-secondary bg-blue-50' : 'border-gray-300 hover:border-arl-primary'}`}>
                            <div className="text-sm sm:text-base font-bold text-arl-dark">{p.durationType} / day</div>
                            <div className="text-arl-cta text-lg sm:text-xl font-black mt-1">₱{Number(p.price).toLocaleString()}</div>
                            <div className="text-[11px] sm:text-xs text-gray-400 mt-1">
                              {p.durationType === '12 Hours'
                                ? 'End time auto-calculated.'
                                : 'Pick start + end date/time. ~2 calendar days.'}
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : <p className="text-sm text-gray-400">No pricing available.</p>}
                    {errors.duration && <p className="text-arl-cta text-xs mt-2">{errors.duration}</p>}
                  </div>

                  </>)}

                  {/* ── LOCATIONS ── */}
                  {tripPart === 3 && (
                  <div className="space-y-4 mb-6">
                    {storeInfo.configured && (
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="pickupInStore"
                          checked={pickupInStore}
                          onChange={(e) => handleTogglePickupInStore(e.target.checked)}
                          className="w-4 h-4 accent-arl-primary rounded"
                        />
                        <label htmlFor="pickupInStore" className="text-xs font-semibold text-gray-600">
                          🏬 Pick up in-store — {storeInfo.storeName}
                        </label>
                      </div>
                    )}

                    <LocationInput
                      label="Pickup Location"
                      labelAddon={<InfoButton open={openInfo === 'pickup'} onClick={() => toggleInfo('pickup')} label="About pickup and drop-off" />}
                      infoPanel={openInfo === 'pickup' && <InfoPanel {...pickupInfo(storeInfo.configured)} />}
                      value={pickupLocation}
                      onValueChange={setPickupLocation}
                      onCoordsChange={setPickupCoords}
                      placeholder="Enter pick-up location…"
                      disabled={pickupInStore}
                      restrictToServiceArea
                      coords={pickupCoords}
                    />
                    {errors.pickupLocation && <p className="text-arl-cta text-xs mt-1">{errors.pickupLocation}</p>}

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="sameAsPickup"
                        checked={sameAsPickup}
                        disabled
                        readOnly
                        className="w-4 h-4 accent-arl-primary rounded opacity-70 cursor-not-allowed"
                      />
                      <label htmlFor="sameAsPickup" className="text-xs font-semibold text-gray-500">
                        Drop-off is always the same as pickup
                      </label>
                    </div>

                    <div>
                      <label className="text-sm font-bold text-arl-dark mb-1 block">Drop-off Location</label>
                      <div className="w-full border-2 border-gray-100 bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-500">
                        {pickupLocation || 'Same as pickup'}
                      </div>
                    </div>
                    {errors.dropoffLocation && <p className="text-arl-cta text-xs mt-1">{errors.dropoffLocation}</p>}

                  </div>
                  )}

                  {tripPart === 4 && (
                  <div className="space-y-4 mb-6">
                    <LocationInput
                      label="Destination"
                      labelAddon={<InfoButton open={openInfo === 'destination'} onClick={() => toggleInfo('destination')} label="About your destination" />}
                      infoPanel={openInfo === 'destination' && <InfoPanel {...INFO.destination} />}
                      value={destination}
                      onValueChange={(v) => { setDestination(v); setCodingError(''); }}
                      onCoordsChange={setDestinationCoords}
                      placeholder="Search for a destination…"
                    />
                    <p className="text-[11px] sm:text-xs text-gray-500 -mt-2">
                      Your destination is for documentation purposes only. Our system cannot calculate travel time from the location you select, so please choose your pickup time and rental duration carefully.
                    </p>
                    {errors.destination && <p className="text-arl-cta text-xs mt-1">{errors.destination}</p>}

                    {extraDestinations.map((d, i) => (
                      <div key={d.id} className="relative">
                        <LocationInput
                          label={`Additional Destination ${i + 1}`}
                          value={d.address}
                          onValueChange={(v) => updateExtraDestinationAddress(d.id, v)}
                          onCoordsChange={(c) => updateExtraDestinationCoords(d.id, c)}
                          placeholder="Search for another stop…"
                        />
                        <button
                          type="button"
                          onClick={() => removeExtraDestination(d.id)}
                          className="absolute top-0 right-0 text-xs font-bold text-red-500 hover:text-red-700">
                          Remove
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addExtraDestination}
                      className="text-xs font-bold text-arl-primary hover:text-arl-secondary transition">
                      + Add another destination
                    </button>
                  </div>
                  )}

                  {tripPart === 5 && (<>
                  {/* ── CALENDAR ── */}
                  {duration && (
                    <div className="mb-6">
                      <label className="block text-sm font-semibold text-arl-dark mb-1">
                        {duration === '22 Hours' ? 'Pickup & Return Dates' : 'Pickup Date'}
                      </label>
                      <p className="text-xs text-gray-500 mb-3">
                        {duration === '22 Hours'
                          ? (startDate && endDate)
                            ? `${fmt(startDate)} → ${fmt(endDate)} · ${days} day(s) billed`
                            : 'Left calendar picks your start date, right calendar picks your end date.'
                          : 'Click any available date. End time auto-calculated.'
                        }
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                        {calViews.map((v, i) => renderCalendar(v, i))}
                      </div>
                      {errors.startDate && <p className="text-arl-cta text-xs">{errors.startDate}</p>}
                    </div>
                  )}

                  {/* ── TIME PICKER ── */}
                  {duration && (
                    <div className="mb-6">
                      <label className="block text-sm font-semibold text-arl-dark mb-1">Pickup Time</label>
                      <p className="text-xs text-gray-400 mb-3">
                        {startDate ? `Pickup on ${fmt(startDate)}` : 'Select a date above first.'}
                      </p>
                      <ClockTimeField value={startTime || ''} onChange={handleStartTimeChange} />
                      {errors.startTime && <p className="text-arl-cta text-xs mt-2">{errors.startTime}</p>}

                      {/* Auto-end banner */}
                      {duration === '12 Hours' && startDate && startTime && endDate && endTime && (
                        <div className="mt-3 sm:mt-4 bg-green-50 border-2 border-green-200 rounded-xl p-2.5 sm:p-4 flex items-center gap-2.5 sm:gap-4">
                          <span className="text-lg sm:text-2xl">🏁</span>
                          <div>
                            <p className="text-[10px] sm:text-xs text-green-600 font-semibold uppercase tracking-wide mb-0.5">Auto End (12 hrs)</p>
                            <p className="text-sm sm:text-base font-black text-green-700">{fmt(endDate)}</p>
                            <p className="text-xs sm:text-sm text-green-600">{(() => { const [h,m]=endTime.split(':').map(Number); const ampm=h>=12?'PM':'AM'; return `${((h%12)||12)}:${String(m).padStart(2,'0')} ${ampm}`; })()}</p>
                            <p className="text-[10px] sm:text-xs text-green-500 mt-1">{days} day(s) · ₱{total.toLocaleString()}</p>
                          </div>
                        </div>
                      )}
                      {duration === '22 Hours' && startDate && startTime && endDate && endTime && (
                        <div className="mt-3 sm:mt-4 bg-green-50 border-2 border-green-200 rounded-xl p-2.5 sm:p-4 flex items-center gap-2.5 sm:gap-4">
                          <span className="text-lg sm:text-2xl">🏁</span>
                          <div>
                            <p className="text-[10px] sm:text-xs text-green-600 font-semibold uppercase tracking-wide mb-0.5">Auto End (22 hrs)</p>
                            <p className="text-[10px] sm:text-xs text-green-500">{fmt(startDate)} →</p>
                            <p className="text-sm sm:text-base font-black text-green-700">{fmt(endDate)} {(() => { const [h,m]=endTime.split(':').map(Number); const ampm=h>=12?'PM':'AM'; return `${((h%12)||12)}:${String(m).padStart(2,'0')} ${ampm}`; })()}</p>
                            <p className="text-[10px] sm:text-xs text-green-500 mt-1">{diffHrs > 0 ? `${diffHrs.toFixed(0)}h · ${days} day(s) · ₱${total.toLocaleString()}` : ''}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  </>)}

                  {tripPart === 6 && (<>
                  {/* Drive type — each option has its own "?" with the T&C details */}
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    {['chauffeur','self-drive'].map(type => (
                      <div key={type} className="flex items-center gap-1.5">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name="driveType" value={type}
                            checked={driveType === type}
                            onChange={e => setDriveType(e.target.value)}
                            className="w-4 h-4 text-arl-cta accent-arl-primary" />
                          <span className="text-sm font-medium">{type === 'chauffeur' ? 'With Chauffeur' : 'Self-Drive'}</span>
                        </label>
                        <InfoButton open={openInfo === type} onClick={() => toggleInfo(type)} label={type === 'chauffeur' ? 'About the chauffeur service' : 'About self-drive requirements'} />
                      </div>
                    ))}
                  </div>
                  {(openInfo === 'chauffeur' || openInfo === 'self-drive') && <InfoPanel {...INFO[openInfo]} />}

                  </>)}

                  {tripPart >= 5 && (<>
                  {/* ── Max rental length error ── */}
                  {maxDaysError && (
                    <div className="mt-6 flex gap-3 items-start bg-red-50 border-2 border-red-300 rounded-2xl p-4">
                      <span className="text-2xl flex-shrink-0">🚫</span>
                      <div>
                        <p className="text-sm font-black text-red-700 mb-1">Rental Period Too Long</p>
                        <p className="text-sm text-red-600">{maxDaysError}</p>
                      </div>
                    </div>
                  )}

                  {/* ── Number Coding error ── */}
                  {codingError && (
                    <div className="mt-6 flex gap-3 items-start bg-red-50 border-2 border-red-300 rounded-2xl p-4">
                      <span className="text-2xl flex-shrink-0">🚫</span>
                      <div>
                        <p className="text-sm font-black text-red-700 mb-1">Number Coding Restriction</p>
                        <p className="text-sm text-red-600">{codingError}</p>
                        <p className="text-xs text-red-400 mt-2">Please choose a different date, time, or select another vehicle.</p>
                      </div>
                    </div>
                  )}
                  </>)}
                </div>
              )}

              {/* ══ STEP 3 — PERSONAL DETAILS ═══════════════════════ */}
              {currentStep === 3 && (
                <div>
                  <h3 className="text-lg sm:text-2xl font-bold text-arl-dark mb-1 sm:mb-2">Your Information</h3>
                  <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">We'll use this to confirm your booking.</p>

                  {/* Name fields — always locked; must be set/updated via Profile */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-3 sm:mb-4">
                    <div>
                      <label className="block text-xs sm:text-sm font-medium text-gray-600 mb-1.5 sm:mb-2">First Name</label>
                      <input
                        type="text"
                        value={firstName}
                        readOnly
                        placeholder="Not set"
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border-2 border-gray-200 rounded-xl bg-gray-50 text-gray-500 text-sm sm:text-base cursor-not-allowed"
                      />
                      {errors.firstName ? (
                        <p className="text-arl-cta text-[11px] sm:text-xs mt-1">
                          {errors.firstName}{' '}
                          <a href="/profile" className="underline">Add it in your profile</a>.
                        </p>
                      ) : (
                        <p className="text-[11px] sm:text-xs text-gray-400 mt-1">
                          From your account —{' '}
                          <a href="/profile" className="underline">update it in your profile</a>.
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs sm:text-sm font-medium text-gray-600 mb-1.5 sm:mb-2">Last Name</label>
                      <input
                        type="text"
                        value={lastName}
                        readOnly
                        placeholder="Not set"
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border-2 border-gray-200 rounded-xl bg-gray-50 text-gray-500 text-sm sm:text-base cursor-not-allowed"
                      />
                      {errors.lastName ? (
                        <p className="text-arl-cta text-[11px] sm:text-xs mt-1">
                          {errors.lastName}{' '}
                          <a href="/profile" className="underline">Add it in your profile</a>.
                        </p>
                      ) : (
                        <p className="text-[11px] sm:text-xs text-gray-400 mt-1">
                          From your account —{' '}
                          <a href="/profile" className="underline">update it in your profile</a>.
                        </p>
                      )}
                    </div>
                  </div>



                  {/* Contact — read-only if logged in */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-3 sm:mb-4">
                    <div>
                      <label className="block text-xs sm:text-sm font-medium text-gray-600 mb-1.5 sm:mb-2">Contact Number</label>
                      {user ? (
                        <div>
                          <input
                            type="tel"
                            value={contact}
                            readOnly
                            className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border-2 border-gray-200 rounded-xl bg-gray-50 text-gray-500 text-sm sm:text-base cursor-not-allowed"
                          />
                          {errors.contact ? (
                            <p className="text-arl-cta text-[11px] sm:text-xs mt-1">
                              {errors.contact}{' '}
                              <a href="/profile" className="underline">Update it in your profile</a>.
                            </p>
                          ) : (
                            <p className="text-[11px] sm:text-xs text-gray-400 mt-1">From your account</p>
                          )}
                        </div>
                      ) : (
                        <div>
                          <input
                            type="tel"
                            value={contact}
                            onChange={(e) => setContact(e.target.value)}
                            placeholder="09XXXXXXXXX or +639XXXXXXXXX"
                            className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border-2 border-arl-primary rounded-xl focus:border-arl-secondary focus:outline-none text-sm sm:text-base"
                          />
                          {errors.contact && <p className="text-arl-cta text-[11px] sm:text-xs mt-1">{errors.contact}</p>}
                        </div>
                      )}
                    </div>

                    {/* Email — read-only if logged in */}
                    <div>
                      <label className="block text-xs sm:text-sm font-medium text-gray-600 mb-1.5 sm:mb-2">Email</label>
                      {user ? (
                        <div>
                          <input
                            type="email"
                            value={email}
                            readOnly
                            className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border-2 border-gray-200 rounded-xl bg-gray-50 text-gray-500 text-sm sm:text-base cursor-not-allowed"
                          />
                          {errors.email ? (
                            <p className="text-arl-cta text-[11px] sm:text-xs mt-1">
                              {errors.email}{' '}
                              <a href="/profile" className="underline">Update it in your profile</a>.
                            </p>
                          ) : (
                            <p className="text-[11px] sm:text-xs text-gray-400 mt-1">From your account</p>
                          )}
                        </div>
                      ) : (
                        <div>
                          <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border-2 border-arl-primary rounded-xl focus:border-arl-secondary focus:outline-none text-sm sm:text-base"
                          />
                          {errors.email && <p className="text-arl-cta text-[11px] sm:text-xs mt-1">{errors.email}</p>}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-600 mb-1.5 sm:mb-2">Special Notes</label>
                    <textarea value={specialNotes} rows="4" onChange={e => setSpecialNotes(e.target.value)}
                      className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border-2 border-arl-primary rounded-xl focus:border-arl-secondary focus:outline-none resize-none text-sm sm:text-base" />
                  </div>
                </div>
              )}

              {/* ══ STEP 4 — PAYMENT ════════════════════════════════ */}
              {currentStep === 4 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-3" aria-label={`Payment, part ${payPart} of 2`}>
                    {[1, 2].map((n) => (
                      <div key={n} className={`h-1.5 flex-1 rounded-full ${n <= payPart ? 'bg-arl-primary' : 'bg-gray-200'}`} />
                    ))}
                  </div>
                  <p className="text-[11px] sm:text-xs font-bold tracking-wide uppercase text-arl-secondary mb-1">
                    Payment · Part {payPart} of 2 · {payPart === 1 ? 'Details & total' : 'How to pay'}
                  </p>
                  <h3 className="text-lg sm:text-2xl font-bold text-arl-dark mb-1 sm:mb-2">{payPart === 1 ? 'Payment Details' : 'Choose How to Pay'}</h3>
                  <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">
                    {payPart === 1
                      ? 'This is how your total is computed. Review it first, then you will choose how to pay.'
                      : 'Pick how much to pay now, then your payment method.'}
                  </p>

                  {/* ── Part 1: payment details & computation (shown first) ── */}
                  {payPart === 1 && (
                  <div className="mb-4 sm:mb-6">
                    <p className="text-[11px] sm:text-xs text-gray-500 mb-2">Tap the <span className="font-bold text-arl-primary">?</span> beside any item to see what it is for.</p>
                    <div className="rounded-2xl border border-gray-200 bg-white px-3 sm:px-4">
                      {payDetailRows.map((row) => (
                        <div key={row.key} className="border-b border-gray-100 last:border-b-0">
                          <div className="flex items-center justify-between gap-2 py-2.5 sm:py-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs sm:text-sm font-medium text-arl-dark">{row.label}</span>
                              <HelpButton open={openInfo === `pay-${row.key}`} onClick={() => toggleInfo(`pay-${row.key}`)} label={`About ${row.title}`} />
                            </div>
                            <span className="text-xs sm:text-sm font-bold text-gray-700 flex-shrink-0">{quoteLoading ? '…' : row.value}</span>
                          </div>
                          {openInfo === `pay-${row.key}` && <InfoPanel title={row.title} items={row.items} />}
                        </div>
                      ))}
                      <div className="flex items-center justify-between gap-2 py-3 border-t-2 border-arl-primary">
                        <span className="text-sm sm:text-base font-black text-arl-dark">Total</span>
                        <span className="text-base sm:text-lg font-black text-arl-cta">{quoteLoading ? 'Computing…' : peso(grandTotal)}</span>
                      </div>
                    </div>

                    {/* Notes: security deposit */}
                    {securityDeposit > 0 && (
                      <div className="mt-3">
                        <KeyPoints
                          title="Notes: Security Deposit"
                          subtitle="What the deposit is and when you get it back."
                          points={[
                            { icon: '💰', level: 'must', headline: `${peso(securityDeposit)} deposit is paid upfront`, detail: 'It is part of your total and is always paid first, even with Partial Payment.', ref: 'Security Deposit' },
                            { icon: '✅', level: 'must', headline: 'Refundable in full', detail: 'You get it back when the car is returned in good condition with no unpaid charges.', ref: 'Security Deposit' },
                            { icon: '⚠️', headline: 'Damage or unpaid charges may reduce it', detail: 'For example fuel or a late return.' },
                            { icon: '❌', headline: 'Not refunded if you cancel late or do not show up', detail: 'Cancelling within the refund window or missing your pickup keeps the deposit.', ref: 'Cancellation & Refund Policy' },
                          ]}
                        />
                      </div>
                    )}

                    <p className="mt-4 text-xs sm:text-sm text-gray-500 text-center">
                      Next, you will choose how much to pay now and your payment method.
                    </p>
                  </div>
                  )}

                  {/* ── Part 2: payment option, then payment method ── */}
                  {payPart === 2 && (<>
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-arl-primary/5 border border-arl-primary/20 px-3 sm:px-4 py-2.5 mb-4 sm:mb-6">
                    <div>
                      <p className="text-[11px] sm:text-xs text-gray-500 font-semibold uppercase tracking-wide">Your total</p>
                      <p className="text-lg sm:text-xl font-black text-arl-cta">{quoteLoading ? 'Computing…' : peso(grandTotal)}</p>
                    </div>
                    <button type="button" onClick={() => setPayPart(1)} className="text-xs font-bold text-arl-primary underline">
                      View breakdown
                    </button>
                  </div>

                  <p className="text-xs sm:text-sm font-semibold text-arl-dark mb-2 sm:mb-3">Payment Option</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-3 sm:mb-4">
                    {[
                      { key:'partial', label:'Partial Payment', amount: partialNow, note: `${securityDeposit > 0 ? 'Security deposit + 50% of the rest. ' : '50% of the total. '}Balance ${peso(partialBalance)} on pickup (or pay it online anytime from My Bookings).` },
                      { key:'full',    label:'Full Payment',    amount: grandTotal,  note: 'Pay everything now. No balance on pickup.' },
                    ].map(({ key, label, amount, note }) => (
                      <button key={key} type="button"
                        onClick={() => setPaymentAmount(key)}
                        className={`p-3 sm:p-4 rounded-xl border-2 text-left transition-colors ${paymentAmount === key ? 'border-arl-secondary bg-blue-50' : 'border-gray-300 hover:border-arl-primary'}`}>
                        <div className="text-xs sm:text-sm font-medium mb-1">{label}</div>
                        <div className="text-arl-cta text-lg sm:text-xl font-black">{peso(amount)}</div>
                        <div className="text-[11px] sm:text-xs text-gray-500 mt-1">{note}</div>
                      </button>
                    ))}
                  </div>

                  <div className="mb-3 sm:mb-4">
                    <KeyPoints
                      title="Before you pay"
                      subtitle="This applies to both Partial and Full Payment."
                      points={[
                        { icon: '🌐', level: 'must', headline: `Pay ${peso(getPayNow())} online to confirm`, detail: 'The required amount must be paid online first. Your booking is not confirmed until payment is received.', ref: 'Reservation & Booking Policy' },
                        { icon: '🥇', headline: 'First to pay gets the car', detail: 'Bookings without payment are not held. Priority goes to the first customer who completes payment.', ref: 'Payment Terms' },
                      ]}
                    />
                  </div>

                  <div className="bg-blue-50 text-xs sm:text-sm text-arl-primary p-2.5 sm:p-3 rounded-lg mb-4 sm:mb-6">
                    Remaining balance on pickup: <strong>{peso(getBalance())}</strong>
                  </div>

                  {/* Payment method — GCash, Maya, and PayMongo */}
                  <label className="block text-xs sm:text-sm font-semibold text-arl-dark mb-2 sm:mb-3">Payment Method</label>
                  <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4 sm:mb-6">
                    {[
                      { key: 'gcash',    label: 'GCash', img: gcashLogo  },
                      { key: 'maya',     label: 'Maya',  img: mayaLogo   },
                      { key: 'qrph',     label: 'QRPH',  img: qrphLogo   },
                    ].map((item) => (
                      <button key={item.key} type="button"
                        onClick={() => { setPaymentMethod(item.key); setGcashReference(''); setPaymentScreenshot(null); setScreenshotPreview(''); }}
                        className={`flex flex-col items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2.5 sm:py-4 rounded-xl border-2 font-bold transition-all ${
                          paymentMethod === item.key
                            ? 'border-arl-secondary bg-blue-50 text-arl-primary shadow-md'
                            : 'border-gray-200 text-gray-600 hover:border-arl-primary'
                        }`}>
                        <img src={item.img} alt={item.label} className="w-9 h-7 sm:w-12 sm:h-10 object-contain rounded-md" />
                        <span className="text-xs sm:text-sm font-bold">{item.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Manual ref + screenshot — only shown for non-PayMongo methods */}
                  {!isPaymongoMethod(paymentMethod) && (
                  <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3 sm:p-5 space-y-3 sm:space-y-4">
                    <p className="text-xs sm:text-sm text-gray-600">
                      Send <strong>₱{getPayNow().toLocaleString()}</strong> to our {paymentMethod === 'gcash' ? 'GCash' : 'Maya'} number first, then fill in the details below.
                    </p>

                    {/* Reference number */}
                    <div>
                      <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1.5 sm:mb-2">
                        Reference Number <span className="text-arl-cta">*</span>
                      </label>
                      <input
                        type="text"
                        value={gcashReference}
                        onChange={e => setGcashReference(e.target.value)}
                        placeholder={paymentMethod === 'gcash' ? 'e.g. 1234567890123' : 'e.g. PY1234567890'}
                        className="w-full px-3 sm:px-4 py-2.5 sm:py-3 border-2 border-gray-300 rounded-xl focus:border-arl-primary focus:outline-none text-xs sm:text-sm font-mono"
                      />
                      {errors.gcashReference && (
                        <p className="text-arl-cta text-[11px] sm:text-xs mt-1">⛔ {errors.gcashReference}</p>
                      )}
                    </div>

                    {/* Screenshot upload */}
                    <div>
                      <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1.5 sm:mb-2">
                        Payment Screenshot <span className="text-arl-cta">*</span>
                      </label>

                      {!screenshotPreview ? (
                        <label className="flex flex-col items-center justify-center w-full h-28 sm:h-36 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-arl-primary hover:bg-arl-primary/5 transition-all group">
                          <div className="text-2xl sm:text-4xl mb-1 sm:mb-2 group-hover:scale-110 transition-transform">📸</div>
                          <p className="text-xs sm:text-sm font-semibold text-gray-500 group-hover:text-arl-primary">
                            Click to upload screenshot
                          </p>
                          <p className="text-[10px] sm:text-xs text-gray-400 mt-1">PNG, JPG, JPEG (max 5MB)</p>
                          <input
                            type="file"
                            accept="image/png,image/jpg,image/jpeg"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files[0];
                              if (!file) return;
                              if (file.size > 5 * 1024 * 1024) {
                                showToast('File too large. Max 5MB.'); return;
                              }
                              setPaymentScreenshot(file);
                              const reader = new FileReader();
                              reader.onload = (ev) => setScreenshotPreview(ev.target.result);
                              reader.readAsDataURL(file);
                            }}
                          />
                        </label>
                      ) : (
                        <div className="relative">
                          <img
                            src={screenshotPreview}
                            alt="Payment screenshot"
                            className="w-full max-h-64 object-contain rounded-xl border-2 border-green-400 bg-gray-50"
                          />
                          <div className="absolute top-2 right-2 flex gap-2">
                            <span className="bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                              ✓ Uploaded
                            </span>
                            <button
                              type="button"
                              onClick={() => { setPaymentScreenshot(null); setScreenshotPreview(''); }}
                              className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full hover:bg-red-600 transition"
                            >
                              ✕ Remove
                            </button>
                          </div>
                          <p className="text-xs text-gray-400 mt-2 text-center">
                            {paymentScreenshot?.name}
                          </p>
                        </div>
                      )}
                      {errors.paymentScreenshot && (
                        <p className="text-arl-cta text-xs mt-1">⛔ {errors.paymentScreenshot}</p>
                      )}
                    </div>
                  </div>
                  )}
                  </>)}
                </div>
              )}

              {/* ══ STEP 5 — REVIEW ═════════════════════════════════ */}
              {currentStep === 5 && (
                <div>
                  <h3 className="text-lg sm:text-2xl font-bold text-arl-dark mb-1 sm:mb-2">Review & Confirm</h3>
                  <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">Check everything before submitting.</p>
                  {/* Screenshot preview in review */}
                  {screenshotPreview && (
                    <div className="mb-4 sm:mb-6">
                      <p className="text-sm font-semibold text-gray-700 mb-2">Payment Screenshot</p>
                      <img src={screenshotPreview} alt="Payment proof"
                        className="w-full max-h-36 sm:max-h-48 object-contain rounded-xl border border-gray-200 bg-gray-50" />
                    </div>
                  )}
                  <div className="space-y-0">
                    {[
                      ['Vehicle',       selectedCar?.name],
                      ['Type',          [selectedCar?.bodyType, selectedCar?.transmission, selectedCar?.fuelType].filter(Boolean).join(' · ')],
                      ['Service',       serviceType],
                      ['Duration',      duration ? `${duration}/day` : '-'],
                      ['Start',         `${fmt(startDate)} ${fmt12(startTime)}`],
                      ['End (auto)',     `${fmt(endDate)} ${fmt12(endTime)}`],
                      ['Days',          `${days} day(s)`],
                      ['Pickup Addr.',  pickupLocation],
                      ['Drop-off',      dropoffLocation],
                      ['Destination',   destination || '-'],
                      ['Drive Type',    driveType === 'self-drive' ? 'Self-Drive' : 'With Chauffeur'],
                      ['Passenger',     `${firstName} ${lastName}`],
                      ['Contact',       contact],
                      ['Email',         email],
                      ['Rental Fee',    `₱${total.toLocaleString()}`],
                      ...(extraFee > 0   ? [['Extra Fee (Outside Area)', `₱${extraFee.toLocaleString()}`]] : []),
                      ...(driversFee > 0 ? [["Driver's Fee",             `₱${driversFee.toLocaleString()}`]] : []),
                      ...(securityDeposit > 0 ? [['Security Deposit (refundable)', `₱${securityDeposit.toLocaleString()}`]] : []),
                      [serviceFeeRate > 0 ? `Service Fee (${serviceFeeRate}% of rental)` : 'Service Fee', `₱${serviceFee.toLocaleString()}`],
                      [gatewayFeeRate > 0 ? `Gateway Fee (${gatewayFeeRate}% of total)` : 'Gateway Fee', `₱${gatewayFee.toLocaleString()}`],
                      ['Total Fee',     `₱${grandTotal.toLocaleString()}`],
                      ['Payment Type',  getMethodOfPayment()],
                      ['Pay Now',       `₱${getPayNow().toLocaleString()} (${paymentMethod === 'qrph' ? 'QRPH' : paymentMethod === 'gcash' ? 'GCash' : 'Maya'})`],
                      ['Ref. Number',   gcashReference || '-'],
                      ['Balance',       `₱${getBalance().toLocaleString()} on pickup`],
                    ].map(([label, value]) => (
                      <div key={label} className="grid grid-cols-1 sm:grid-cols-2 gap-0.5 sm:gap-0 py-2 sm:py-3 border-b border-gray-100">
                        <div className="text-xs sm:text-base font-medium text-arl-dark">{label}</div>
                        <div className="text-xs sm:text-base text-gray-700 break-words">{value || '-'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 5 — consent notice. There is no separate checkbox: pressing Confirm is the agreement. */}
              {currentStep === 5 && (
                <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 px-3 sm:px-4 py-3 text-xs sm:text-sm text-gray-700">
                  By clicking <strong>Confirm</strong>, you automatically agree to our{' '}
                  <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline font-semibold text-arl-primary">Terms &amp; Conditions</a>
                  {isPaymongoMethod(paymentMethod)
                    ? ' and will be redirected to PayMongo to complete your payment.'
                    : ' and your booking will be submitted.'}
                </div>
              )}

              {/* Navigation */}
              <div className="flex justify-between items-start mt-6 sm:mt-8 gap-2">
                <button onClick={handleBack}
                  className="px-4 sm:px-8 py-2.5 sm:py-3 bg-arl-dark text-white rounded-full font-medium hover:bg-gray-800 transition flex items-center gap-1 sm:gap-2 text-sm sm:text-base flex-shrink-0">
                  <ChevronLeft size={18} className="sm:w-5 sm:h-5" />
                  {currentStep === 5 ? 'Edit' : 'Back'}
                </button>
                <div className="flex flex-col items-end gap-2 min-w-0">
                  <button onClick={handleNext} disabled={loading || codingChecking}
                    className={`px-4 sm:px-8 py-2.5 sm:py-3 rounded-full font-medium transition flex items-center gap-1 sm:gap-2 text-sm sm:text-base ${
                      (canProceed() && !codingChecking) ? 'bg-arl-cta text-white hover:bg-red-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}>
                    {currentStep === 5
                      ? (loading ? 'Submitting…' : isPaymongoMethod(paymentMethod) ? 'Confirm & Pay' : 'Confirm Booking')
                      : codingChecking
                      ? 'Checking coding…'
                      : 'Next'}
                    {currentStep < 5 && !codingChecking && <ChevronRight size={18} className="sm:w-5 sm:h-5" />}
                  </button>
                  {!canProceed() && !loading && !codingChecking && (
                    <p className="text-xs text-gray-500 text-right max-w-[180px] sm:max-w-xs">{getIncompleteReason()}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Sidebar ── */}
          <div className="lg:col-span-1">
            <div className="bg-arl-light rounded-2xl border-2 border-arl-secondary p-3 sm:p-6 shadow-soft lg:sticky lg:top-4">
              <h3 className="text-arl-cta text-base sm:text-xl font-bold mb-2.5 sm:mb-4">BOOKING SUMMARY</h3>
              {selectedCar?.imageURL && (
                <img src={selectedCar.imageURL} alt={selectedCar.name}
                  className="w-full h-20 sm:h-32 object-cover rounded-xl mb-2.5 sm:mb-4"
                  onError={e => e.target.style.display='none'} />
              )}
              <div className="space-y-1.5 sm:space-y-3 text-xs sm:text-sm">
                {[
                  ['Vehicle',    selectedCar?.name || '-'],
                  ['Service',    serviceType || '-'],
                  ['Duration',   duration ? `${duration}/day` : '-'],
                  ['Start',      startDate && startTime ? `${fmt(startDate)} ${fmt12(startTime)}` : '-'],
                  ['End (auto)', endDate && endTime ? `${fmt(endDate)} ${fmt12(endTime)}` : '-'],
                  ['Days',       days ? `${days} day(s)` : '-'],
                  ['Hire',       driveType === 'self-drive' ? 'Self-Drive' : 'With Chauffeur'],
                  ['Destination', destination || '-'],
                  ['Passenger',  firstName && lastName ? `${firstName} ${lastName}` : '-'],
                  ['Payment',    `${paymentAmount} — ${paymentMethod === 'qrph' ? 'QRPH' : paymentMethod === 'gcash' ? 'GCash' : 'Maya'}`],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-2">
                    <span className="font-medium text-arl-dark flex-shrink-0">{label}</span>
                    <span className="text-gray-700 text-right max-w-[60%] text-[11px] sm:text-xs break-words">{value}</span>
                  </div>
                ))}
              </div>
              <div className="border-t-2 border-arl-primary my-2.5 sm:my-4" />
              <div className="text-arl-cta text-xl sm:text-3xl font-black mb-1">
                {quoteLoading ? <span className="text-base sm:text-lg text-gray-400 font-medium">Computing…</span> : `₱${grandTotal.toLocaleString()}`}
              </div>
              <div className="text-xs sm:text-sm text-arl-dark">Pay now: <span className="font-bold">₱{getPayNow().toLocaleString()}</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* Auth required modal */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-arl-cta" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 11h14l1 9H4l1-9z" />
              </svg>
            </div>
            <h3 className="font-display text-2xl text-arl-primary mb-2">Login Required</h3>
            <p className="text-gray-500 text-sm mb-6">
              You need to be logged in to proceed with your booking. Please log in or create an account to continue.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowAuthModal(false)}
                className="flex-1 border border-gray-300 text-gray-600 py-2.5 rounded-full font-medium hover:bg-gray-50 transition text-sm">
                Cancel
              </button>
              <button
                onClick={() => { setShowAuthModal(false); window.scrollTo(0,0); }}
                className="flex-1 bg-arl-cta text-white py-2.5 rounded-full font-medium hover:bg-red-700 transition text-sm">
                Log In
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center">
            <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={48} className="text-white" />
            </div>
            <h3 className="font-display text-3xl text-arl-primary mb-3">Booking Confirmed!</h3>
            <p className="text-gray-600 mb-4">
              Thank you, <strong>{firstName}</strong>! Your booking is submitted and pending approval.
              We'll reach out to <strong>{contact}</strong> shortly.
            </p>
            <div className="bg-gray-50 rounded-xl p-4 mb-4 text-left space-y-2">
              <div>
                <p className="text-xs text-gray-400">Booking ID</p>
                <p className="text-sm font-mono font-bold text-arl-primary break-all">{bookingReference}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Vehicle</p>
                <p className="text-sm font-semibold text-arl-dark">{selectedCar?.name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Total Fee</p>
                <p className="text-sm font-black text-arl-cta">₱{grandTotal.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Status</p>
                <p className="text-sm font-semibold text-yellow-600">⏳ Pending Approval</p>
              </div>
            </div>
            <button onClick={resetBooking}
              className="w-full bg-arl-cta text-white py-3 rounded-full font-medium hover:bg-red-700 transition">
              Make another Booking
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BookingPage;
