import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, CheckCircle, MapPin } from 'lucide-react';
import MapPicker from '../components/shared/MapPicker';
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
  const map = {};
  carBookings.forEach(({ status, startDate, endDate }) => {
    if (!startDate) return;
    const start = toMidnight(new Date(startDate));
    const end   = endDate ? toMidnight(new Date(endDate)) : start;
    const s     = (status || 'pending').toLowerCase();

    let cur = new Date(start);
    while (cur <= end) {
      const key = toLocalDateStr(cur);
      // Priority: booked > preparation > pending > maintenance
      if (!map[key] || s === 'approved') map[key] = s === 'approved' ? 'booked' : s;
      cur = addDays(cur, 1);
    }

    // Preparation: 1 day before and after approved bookings
    if (s === 'approved') {
      const before = toLocalDateStr(addDays(start, -1));
      const after  = toLocalDateStr(addDays(end,    1));
      if (!map[before] || map[before] === 'available') map[before] = 'preparation';
      if (!map[after]  || map[after]  === 'available') map[after]  = 'preparation';
    }
  });
  return map;
};

const DATE_STYLES = {
  booked:      { bg: 'bg-red-500',    text: 'text-white',     label: 'Booked'      },
  preparation: { bg: 'bg-orange-400', text: 'text-white',     label: 'Preparation' },
  pending:     { bg: 'bg-yellow-400', text: 'text-gray-800',  label: 'Pending'     },
  maintenance: { bg: 'bg-blue-400',   text: 'text-white',     label: 'Maintenance' },
  available:   { bg: '',              text: 'text-gray-700',  label: 'Available'   },
};
const BLOCKED_STATUSES = new Set(['booked', 'preparation', 'maintenance']);

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

// ── Skeleton card ──────────────────────────────────────────────
const SkeletonCard = () => (
  <div className="rounded-2xl bg-white border border-gray-100 shadow-md overflow-hidden animate-pulse">
    <div className="w-full h-36 bg-gray-200" />
    <div className="p-4 space-y-2">
      <div className="h-4 bg-gray-200 rounded w-1/2" />
      <div className="h-3 bg-gray-100 rounded w-1/3" />
      <div className="flex gap-1 mt-2">
        <div className="h-5 bg-gray-100 rounded-full w-14" />
        <div className="h-5 bg-gray-100 rounded-full w-16" />
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
        <div className="absolute top-2 right-2 z-10 w-6 h-6 bg-arl-secondary rounded-full flex items-center justify-center">
          <CheckCircle size={14} className="text-white" />
        </div>
      )}
      <div className={`absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full text-xs font-bold ${avail ? 'bg-green-500 text-white' : 'bg-gray-400 text-white'}`}>
        {status || 'Available'}
      </div>
      <div className="relative overflow-hidden bg-gray-100">
        {imageURL
          ? <img src={imageURL} alt={name} className="w-full h-36 object-cover"
              onError={(e) => { e.target.style.display='none'; e.target.nextSibling.style.display='flex'; }} />
          : null}
        <div className="w-full h-36 items-center justify-center text-4xl text-gray-300 bg-gray-100" style={{ display: imageURL ? 'none' : 'flex' }}>🚗</div>
        <span className="absolute bottom-2 right-3 text-white/70 text-xs font-black tracking-widest uppercase drop-shadow">{brandName}</span>
      </div>
      <div className="p-4">
        <h4 className="text-lg font-black text-arl-primary tracking-tight">{name}</h4>
        {shortDescription && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{shortDescription}</p>}
        <div className="flex flex-wrap gap-1 mt-3">
          {tags.map((t,i) => <span key={i} className="px-2 py-0.5 bg-arl-secondary/10 text-arl-primary text-xs font-semibold rounded-full">{t}</span>)}
        </div>
        {lowest && <p className="mt-3 text-xs font-semibold text-arl-cta">From ₱{Number(lowest.price).toLocaleString()} / {lowest.durationType}</p>}
      </div>
    </div>
  );
};

// ── Location input with map button ────────────────────────────
const LocationInput = ({ label, value, onValueChange, placeholder, onCoordsChange, disabled = false, restrictToServiceArea = false, coords = null }) => {
  const [mapOpen, setMapOpen] = useState(false);

  return (
    <div>
      <label className="block text-xs text-gray-600 mb-1 font-medium">{label}</label>
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
          onConfirm={({ address: addr, lat, lng, city }) => {
            onValueChange(addr);
            onCoordsChange?.({ lat, lng, city });
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

// ── In-store pickup: fixed location configured via env ─────────
const STORE_LABEL = process.env.REACT_APP_STORE_LABEL || '';
const STORE_LAT   = parseFloat(process.env.REACT_APP_STORE_LAT);
const STORE_LNG   = parseFloat(process.env.REACT_APP_STORE_LNG);
const STORE_CONFIGURED = !!STORE_LABEL && !Number.isNaN(STORE_LAT) && !Number.isNaN(STORE_LNG);

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
  const [serviceType,       setServiceType]        = useState('');
  const [otherServiceNote,  setOtherServiceNote]   = useState('');
  const [duration,          setDuration]           = useState(initVal('duration',        'duration'));
  const [startDate,         setStartDate]          = useState(inboundStartDateIsPast ? '' : inboundStartDate);
  const [startTime,         setStartTime]          = useState(inboundStartDateIsPast ? '' : initVal('startTime', 'startTime'));
  const [endDate,           setEndDate]            = useState(inboundStartDateIsPast ? '' : initVal('endDate',   'endDate'));
  const [endTime,           setEndTime]            = useState(inboundStartDateIsPast ? '' : initVal('endTime',   'endTime'));
  const [pickupLocation,    setPickupLocation]     = useState(initValNoDraft('pickupLocation'));
  const [pickupInStore,     setPickupInStore]      = useState(false);
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
      setPickupLocation(STORE_LABEL);
      setPickupCoords({ lat: STORE_LAT, lng: STORE_LNG, city: '' });
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
  const [driveType,         setDriveType]          = useState('chauffeur');
  const [firstName,         setFirstName]          = useState(() => {
    return userDetails?.firstName || "";
  });
  const [lastName,          setLastName]           = useState(() => {
    return userDetails?.lastName || "";
  });
  const [contact,           setContact]            = useState(userDetails?.phone || user?.phone || "");
  const [email,             setEmail]              = useState(userDetails?.email || user?.email || "");
  const [rememberName,      setRememberName]       = useState(
!!(userDetails?.firstName || userDetails?.lastName)
  );
  const [specialNotes,      setSpecialNotes]       = useState('');
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
    } catch {
      setCarBookings([]); setDateStatuses({});
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
    serviceFee: 0, gatewayFee: 0, grandTotal: 0, payNow: 0, balance: 0,
  });
  const [quoteLoading, setQuoteLoading] = useState(false);

  useEffect(() => {
    if (!selectedCar?.carID || !duration) {
      setQuote({ days: 0, diffHrs: 0, total: 0, extraFee: 0, driversFee: 0, serviceFee: 0, gatewayFee: 0, grandTotal: 0, payNow: 0, balance: 0 });
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

  const { days, total, diffHrs, extraFee, driversFee, serviceFee, gatewayFee, grandTotal } = quote;
  const getPayNow  = () => quote.payNow;
  const getBalance = () => quote.balance;

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
        <div className="border-2 border-gray-200 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-4">
          <button type="button" onClick={() => navMonth(idx, -1)}
            className="w-9 h-9 flex items-center justify-center rounded-xl border-2 border-gray-200 hover:bg-arl-primary hover:text-white hover:border-arl-primary text-gray-600 text-xl font-bold transition-colors">‹</button>
          <span className="text-base font-bold text-arl-dark">{MONTHS[month]} {year}</span>
          <button type="button" onClick={() => navMonth(idx, 1)}
            className="w-9 h-9 flex items-center justify-center rounded-xl border-2 border-gray-200 hover:bg-arl-primary hover:text-white hover:border-arl-primary text-gray-600 text-xl font-bold transition-colors">›</button>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-2">
          {DAYS.map(d => <div key={d} className="text-center text-xs font-bold text-gray-400 py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
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

            let cls = `text-center text-sm py-2 rounded-xl transition-all font-medium relative `;
            if (isPast) {
              cls += 'text-gray-300 cursor-not-allowed ';
            } else if (isBlocked) {
              cls += `${style.bg} ${style.text} cursor-not-allowed text-xs `;
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
        <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-gray-100">
          {Object.entries(DATE_STYLES).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded-md ${v.bg || 'bg-gray-200 border border-gray-300'}`} />
              <span className="text-xs text-gray-500 capitalize">{v.label}</span>
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
    if (currentStep === 2) return !!(serviceType && duration && startDate && startTime && endDate && endTime && pickupLocation && dropoffLocation && destination && !codingError);
    if (currentStep === 3) return !!(firstName && lastName && /^(\+639|09)\d{9}$/.test(contact) && /\S+@\S+\.\S+/.test(email));
    if (currentStep === 4) {
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
      if (!serviceType)            missing.push('a service type');
      if (!duration)                missing.push('a duration');
      if (!startDate || !startTime) missing.push('a pickup date & time');
      if (!endDate || !endTime)     missing.push('an end date & time');
      if (!pickupLocation)          missing.push('a pickup location');
      if (!dropoffLocation)         missing.push('a drop-off location');
      if (!destination)             missing.push('a destination');
      if (codingError)              missing.push('a different date or vehicle (Number Coding restriction)');
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
      if (!isPaymongoMethod(paymentMethod)) {
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
      if (!serviceType)     e.serviceType     = 'Choose a service.';
      if (serviceType === 'Others' && !otherServiceNote.trim()) e.serviceType = 'Please describe the service.';
      if (!duration)        e.duration        = 'Choose a duration.';
      if (!startDate)       e.startDate       = 'Select a start date.';
      if (!startTime)       e.startTime       = 'Set a pickup time.';
      if (!endDate || !endTime) e.endDate     = 'End date/time is required.';
      if (!pickupLocation)  e.pickupLocation  = 'Enter a pickup location.';
      if (!dropoffLocation) e.dropoffLocation = 'Enter a drop-off location.';
      if (!destination)     e.destination     = 'Please enter a destination.';
      if (codingError)      e.coding          = codingError;
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
    if (currentStep === 4) {
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
      alert(err.message || "Could not connect to PayMongo. Please try again.");
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
          duration,
          startDate,
          startTime,
          endDate,
          endTime,
          // NOTE: totalDays / rentalFee / extraFee / driversFee / serviceFee /
          // gatewayFee / grandTotal / depositFee / methodOfPayment are no
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
        alert(data.message || "Booking failed. Please try again.");
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
      alert("Could not connect to server. Please try again.");
    } finally {
      setLoading(false);
    }
  };
  const handleBack = () => { if (currentStep > 1) setCurrentStep(currentStep - 1); };

  const resetBooking = () => {
    clearDraft();
    setShowConfirmModal(false); setCurrentStep(1); setSelectedCar(null);
    setServiceType(''); setOtherServiceNote(''); setDuration(''); setStartDate(''); setStartTime('');
    setEndDate(''); setEndTime(''); setPickupLocation(''); setPickupInStore(false);
    setDropoffLocation(''); setDestination(''); setDriveType('chauffeur');
    setPickupCoords(null); setDropoffCoords(null); setDestinationCoords(null); setExtraDestinations([]);
    preLockPickup.current = { location: '', coords: null };
    setFirstName(''); setLastName(''); setContact(''); setEmail('');
    setSpecialNotes(''); setRememberName(false); setPaymentAmount('partial'); setPaymentMethod('gcash');
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

  // ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-arl-primary/10 to-arl-secondary/10 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

        {/* Title */}
        <div className="mb-8">
          <h2 className="font-display font-bold text-4xl text-arl-dark mb-2">
            Reserve your <span className="text-arl-secondary">ride.</span>
          </h2>
          <p className="text-gray-600">Fill in the details below to complete your booking.</p>
        </div>

        {/* Step progress */}
        <div className="flex items-center justify-center mb-12">
          {steps.map((step, index) => (
            <React.Fragment key={step.number}>
              <div className="flex flex-col items-center">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg ${
                  currentStep === step.number ? 'bg-arl-cta text-white'
                  : currentStep > step.number ? 'bg-arl-primary text-white'
                  : 'bg-gray-300 text-gray-600'
                }`}>{step.number}</div>
                <span className="text-xs mt-1 text-gray-600">{step.label}</span>
              </div>
              {index < steps.length - 1 && (
                <div className={`w-16 h-1 mx-2 ${currentStep > step.number ? 'bg-arl-primary' : 'bg-gray-300'}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl border-2 border-arl-primary p-8 shadow-card">

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
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 max-h-[600px] overflow-y-auto pr-1">
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
                  {selectedCar && (
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

                  <h3 className="text-2xl font-bold text-arl-dark mb-2">Trip Details</h3>
                  <p className="text-gray-600 mb-6">Choose your service, duration, and dates.</p>

                  {/* Draft restored notice */}
                  {(duration || startDate || startTime || destination) && (
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

                  {/* Service type — from Firestore */}
                  <div className="mb-6">
                    <label className="block text-sm font-semibold text-arl-dark mb-3">Service Type</label>
                    {serviceTypesLoading
                      ? <div className="text-sm text-gray-400 animate-pulse">Loading services…</div>
                      : (
                        <>
                          <div className="grid grid-cols-2 gap-3">
                            {serviceTypes.map(s => (
                              <button key={s.serviceID} type="button"
                                onClick={() => { setServiceType(s.serviceType); setOtherServiceNote(''); }}
                                className={`px-4 py-3 rounded-xl border-2 text-sm font-medium text-left transition-colors ${
                                  serviceType === s.serviceType
                                    ? 'border-arl-secondary bg-blue-50 text-arl-primary'
                                    : 'border-gray-300 text-gray-700 hover:border-arl-primary'}`}>
                                {s.serviceType}
                              </button>
                            ))}
                            <button type="button"
                              onClick={() => setServiceType('Others')}
                              className={`px-4 py-3 rounded-xl border-2 text-sm font-medium text-left transition-colors ${
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

                  {/* Duration — from car's pricing */}
                  <div className="mb-6">
                    <label className="block text-sm font-semibold text-arl-dark mb-3">Duration per Day</label>
                    {pricingOptions.length > 0 ? (
                      <div className="grid grid-cols-2 gap-4">
                        {pricingOptions.map(p => (
                          <button key={p.durationType} type="button"
                            onClick={() => handleDurationSelect(p.durationType)}
                            className={`px-4 py-4 rounded-xl border-2 text-left transition-colors ${
                              duration === p.durationType ? 'border-arl-secondary bg-blue-50' : 'border-gray-300 hover:border-arl-primary'}`}>
                            <div className="text-base font-bold text-arl-dark">{p.durationType} / day</div>
                            <div className="text-arl-cta text-xl font-black mt-1">₱{Number(p.price).toLocaleString()}</div>
                            <div className="text-xs text-gray-400 mt-1">
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

                  {/* ── LOCATIONS — always visible ── */}
                  <div className="space-y-4 mb-6">
                    {STORE_CONFIGURED && (
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="pickupInStore"
                          checked={pickupInStore}
                          onChange={(e) => handleTogglePickupInStore(e.target.checked)}
                          className="w-4 h-4 accent-arl-primary rounded"
                        />
                        <label htmlFor="pickupInStore" className="text-xs font-semibold text-gray-600">
                          🏬 Pick up in-store — {STORE_LABEL}
                        </label>
                      </div>
                    )}

                    <LocationInput
                      label="Pickup Location"
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

                    <LocationInput
                      label="Destination"
                      value={destination}
                      onValueChange={(v) => { setDestination(v); setCodingError(''); }}
                      onCoordsChange={setDestinationCoords}
                      placeholder="Search for a destination…"
                    />
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
                      <div className="grid grid-cols-2 gap-4 mb-4">
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
                      <select
                        value={startTime || ''}
                        onChange={e => handleStartTimeChange(e.target.value)}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm text-gray-700 bg-white focus:border-arl-primary focus:outline-none cursor-pointer"
                      >
                        <option value="" disabled>Select a time…</option>
                        {Array.from({length:24},(_,h)=>h).flatMap(h =>
                          ['00','15','30','45'].map(m => {
                            const val = `${String(h).padStart(2,'0')}:${m}`;
                            const ap  = h >= 12 ? 'PM' : 'AM';
                            const h12 = ((h % 12) || 12);
                            return <option key={val} value={val}>{`${h12}:${m} ${ap}`}</option>;
                          })
                        )}
                      </select>
                      {errors.startTime && <p className="text-arl-cta text-xs mt-2">{errors.startTime}</p>}

                      {/* Auto-end banner */}
                      {duration === '12 Hours' && startDate && startTime && endDate && endTime && (
                        <div className="mt-4 bg-green-50 border-2 border-green-200 rounded-xl p-4 flex items-center gap-4">
                          <span className="text-2xl">🏁</span>
                          <div>
                            <p className="text-xs text-green-600 font-semibold uppercase tracking-wide mb-0.5">Auto End (12 hrs)</p>
                            <p className="text-base font-black text-green-700">{fmt(endDate)}</p>
                            <p className="text-sm text-green-600">{(() => { const [h,m]=endTime.split(':').map(Number); const ampm=h>=12?'PM':'AM'; return `${((h%12)||12)}:${String(m).padStart(2,'0')} ${ampm}`; })()}</p>
                            <p className="text-xs text-green-500 mt-1">{days} day(s) · ₱{total.toLocaleString()}</p>
                          </div>
                        </div>
                      )}
                      {duration === '22 Hours' && startDate && startTime && endDate && endTime && (
                        <div className="mt-4 bg-green-50 border-2 border-green-200 rounded-xl p-4 flex items-center gap-4">
                          <span className="text-2xl">🏁</span>
                          <div>
                            <p className="text-xs text-green-600 font-semibold uppercase tracking-wide mb-0.5">Auto End (22 hrs)</p>
                            <p className="text-xs text-green-500">{fmt(startDate)} →</p>
                            <p className="text-base font-black text-green-700">{fmt(endDate)} {(() => { const [h,m]=endTime.split(':').map(Number); const ampm=h>=12?'PM':'AM'; return `${((h%12)||12)}:${String(m).padStart(2,'0')} ${ampm}`; })()}</p>
                            <p className="text-xs text-green-500 mt-1">{diffHrs > 0 ? `${diffHrs.toFixed(0)}h · ${days} day(s) · ₱${total.toLocaleString()}` : ''}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Drive type */}
                  <div className="flex items-center gap-6">
                    {['chauffeur','self-drive'].map(type => (
                      <label key={type} className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="driveType" value={type}
                          checked={driveType === type}
                          onChange={e => setDriveType(e.target.value)}
                          className="w-4 h-4 text-arl-cta accent-arl-primary" />
                        <span className="text-sm font-medium">{type === 'chauffeur' ? 'With Chauffeur' : 'Self-Drive'}</span>
                      </label>
                    ))}
                  </div>

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
                </div>
              )}

              {/* ══ STEP 3 — PERSONAL DETAILS ═══════════════════════ */}
              {currentStep === 3 && (
                <div>
                  <h3 className="text-2xl font-bold text-arl-dark mb-2">Your Information</h3>
                  <p className="text-gray-600 mb-6">We'll use this to confirm your booking.</p>

                  {/* Name fields */}
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-2">First Name</label>
                      <input
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="First name"
                        className="w-full px-4 py-3 border-2 border-arl-primary rounded-xl focus:border-arl-secondary focus:outline-none"
                      />
                      {errors.firstName && <p className="text-arl-cta text-xs mt-1">{errors.firstName}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-2">Last Name</label>
                      <input
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Last name"
                        className="w-full px-4 py-3 border-2 border-arl-primary rounded-xl focus:border-arl-secondary focus:outline-none"
                      />
                      {errors.lastName && <p className="text-arl-cta text-xs mt-1">{errors.lastName}</p>}
                    </div>
                  </div>

                  {/* Remember name checkbox */}
                  <div className="flex items-center gap-2 mb-6">
                    <input
                      type="checkbox"
                      id="rememberName"
                      checked={rememberName}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setRememberName(checked);
                        if (checked) {
                          // firstName/lastName saved to backend below — no localStorage needed
                          // Also save to DB if logged in
                          if (user?.userID && (firstName || lastName)) {
                            const token = localStorage.getItem("arl_token");
                            fetch(`${process.env.REACT_APP_API_URL}/user/details/${user.userID}`, {
                              method: "PUT",
                              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                              body: JSON.stringify({ firstName, lastName }),
                            }).then(r => r.json()).then(() => {
                              if (onUserDetailsUpdate) {
                                onUserDetailsUpdate({ ...userDetails, firstName, lastName });
                              }
                            }).catch(console.error);
                          }
                        } else {

                        }
                      }}
                      className="accent-arl-primary w-4 h-4"
                    />
                    <label htmlFor="rememberName" className="text-sm text-gray-600 cursor-pointer select-none">
                      Remember my name for next time
                      {user && <span className="text-arl-secondary text-xs ml-1">(saves to your profile)</span>}
                    </label>
                  </div>

                  {/* Contact — read-only if logged in */}
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-2">Contact Number</label>
                      {user ? (
                        <div>
                          <input
                            type="tel"
                            value={contact}
                            readOnly
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl bg-gray-50 text-gray-500 cursor-not-allowed"
                          />
                          {errors.contact ? (
                            <p className="text-arl-cta text-xs mt-1">
                              {errors.contact}{' '}
                              <a href="/profile" className="underline">Update it in your profile</a>.
                            </p>
                          ) : (
                            <p className="text-xs text-gray-400 mt-1">From your account</p>
                          )}
                        </div>
                      ) : (
                        <div>
                          <input
                            type="tel"
                            value={contact}
                            onChange={(e) => setContact(e.target.value)}
                            placeholder="09XXXXXXXXX or +639XXXXXXXXX"
                            className="w-full px-4 py-3 border-2 border-arl-primary rounded-xl focus:border-arl-secondary focus:outline-none"
                          />
                          {errors.contact && <p className="text-arl-cta text-xs mt-1">{errors.contact}</p>}
                        </div>
                      )}
                    </div>

                    {/* Email — read-only if logged in */}
                    <div>
                      <label className="block text-sm font-medium text-gray-600 mb-2">Email</label>
                      {user ? (
                        <div>
                          <input
                            type="email"
                            value={email}
                            readOnly
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl bg-gray-50 text-gray-500 cursor-not-allowed"
                          />
                          {errors.email ? (
                            <p className="text-arl-cta text-xs mt-1">
                              {errors.email}{' '}
                              <a href="/profile" className="underline">Update it in your profile</a>.
                            </p>
                          ) : (
                            <p className="text-xs text-gray-400 mt-1">From your account</p>
                          )}
                        </div>
                      ) : (
                        <div>
                          <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-4 py-3 border-2 border-arl-primary rounded-xl focus:border-arl-secondary focus:outline-none"
                          />
                          {errors.email && <p className="text-arl-cta text-xs mt-1">{errors.email}</p>}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2">Special Notes</label>
                    <textarea value={specialNotes} rows="4" onChange={e => setSpecialNotes(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-arl-primary rounded-xl focus:border-arl-secondary focus:outline-none resize-none" />
                  </div>
                </div>
              )}

              {/* ══ STEP 4 — PAYMENT ════════════════════════════════ */}
              {currentStep === 4 && (
                <div>
                  <h3 className="text-2xl font-bold text-arl-dark mb-2">Payment</h3>
                  <p className="text-gray-600 mb-6">Choose how much to pay now.</p>

                  {/* Amount options */}
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    {[
                      { key:'partial', label:'Partial (50%)', amount: Math.floor(grandTotal*0.5), note: `Balance ₱${Math.ceil(grandTotal*0.5).toLocaleString()} on pickup.` },
                      { key:'full',    label:'Full Payment',  amount: grandTotal,                 note: 'No balance on pickup.' },
                    ].map(({ key, label, amount, note }) => (
                      <button key={key} type="button"
                        onClick={() => setPaymentAmount(key)}
                        className={`p-4 rounded-xl border-2 text-left transition-colors ${paymentAmount === key ? 'border-arl-secondary bg-blue-50' : 'border-gray-300 hover:border-arl-primary'}`}>
                        <div className="text-sm font-medium mb-1">{label}</div>
                        <div className="text-arl-cta text-xl font-black">₱{Number(amount).toLocaleString()}</div>
                        <div className="text-xs text-gray-500 mt-1">{note}</div>
                      </button>
                    ))}
                  </div>

                  <div className="bg-blue-50 text-sm text-arl-primary p-3 rounded-lg mb-6">
                    Remaining balance on pickup: <strong>₱{getBalance().toLocaleString()}</strong>
                  </div>

                  {/* Payment method — GCash, Maya, and PayMongo */}
                  <label className="block text-sm font-semibold text-arl-dark mb-3">Payment Method</label>
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    {[
                      { key: 'gcash',    label: 'GCash', img: gcashLogo  },
                      { key: 'maya',     label: 'Maya',  img: mayaLogo   },
                      { key: 'qrph',     label: 'QRPH',  img: qrphLogo   },
                    ].map((item) => (
                      <button key={item.key} type="button"
                        onClick={() => { setPaymentMethod(item.key); setGcashReference(''); setPaymentScreenshot(null); setScreenshotPreview(''); }}
                        className={`flex flex-col items-center justify-center gap-2 px-4 py-4 rounded-xl border-2 font-bold transition-all ${
                          paymentMethod === item.key
                            ? 'border-arl-secondary bg-blue-50 text-arl-primary shadow-md'
                            : 'border-gray-200 text-gray-600 hover:border-arl-primary'
                        }`}>
                        <img src={item.img} alt={item.label} className="w-12 h-10 object-contain rounded-md" />
                        <span className="text-sm font-bold">{item.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Manual ref + screenshot — only shown for non-PayMongo methods */}
                  {!isPaymongoMethod(paymentMethod) && (
                  <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5 space-y-4">
                    <p className="text-sm text-gray-600">
                      Send <strong>₱{getPayNow().toLocaleString()}</strong> to our {paymentMethod === 'gcash' ? 'GCash' : 'Maya'} number first, then fill in the details below.
                    </p>

                    {/* Reference number */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Reference Number <span className="text-arl-cta">*</span>
                      </label>
                      <input
                        type="text"
                        value={gcashReference}
                        onChange={e => setGcashReference(e.target.value)}
                        placeholder={paymentMethod === 'gcash' ? 'e.g. 1234567890123' : 'e.g. PY1234567890'}
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-arl-primary focus:outline-none text-sm font-mono"
                      />
                      {errors.gcashReference && (
                        <p className="text-arl-cta text-xs mt-1">⛔ {errors.gcashReference}</p>
                      )}
                    </div>

                    {/* Screenshot upload */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Payment Screenshot <span className="text-arl-cta">*</span>
                      </label>

                      {!screenshotPreview ? (
                        <label className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-arl-primary hover:bg-arl-primary/5 transition-all group">
                          <div className="text-4xl mb-2 group-hover:scale-110 transition-transform">📸</div>
                          <p className="text-sm font-semibold text-gray-500 group-hover:text-arl-primary">
                            Click to upload screenshot
                          </p>
                          <p className="text-xs text-gray-400 mt-1">PNG, JPG, JPEG (max 5MB)</p>
                          <input
                            type="file"
                            accept="image/png,image/jpg,image/jpeg"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files[0];
                              if (!file) return;
                              if (file.size > 5 * 1024 * 1024) {
                                alert('File too large. Max 5MB.'); return;
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
                </div>
              )}

              {/* ══ STEP 5 — REVIEW ═════════════════════════════════ */}
              {currentStep === 5 && (
                <div>
                  <h3 className="text-2xl font-bold text-arl-dark mb-2">Review & Confirm</h3>
                  <p className="text-gray-600 mb-6">Check everything before submitting.</p>
                  {/* Screenshot preview in review */}
                  {screenshotPreview && (
                    <div className="mb-6">
                      <p className="text-sm font-semibold text-gray-700 mb-2">Payment Screenshot</p>
                      <img src={screenshotPreview} alt="Payment proof"
                        className="w-full max-h-48 object-contain rounded-xl border border-gray-200 bg-gray-50" />
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
                      ['Service Fee',   `₱${serviceFee.toLocaleString()}`],
                      ['Gateway Fee',   `₱${gatewayFee.toLocaleString()}`],
                      ['Total Fee',     `₱${grandTotal.toLocaleString()}`],
                      ['Payment Type',  getMethodOfPayment()],
                      ['Pay Now',       `₱${getPayNow().toLocaleString()} (${paymentMethod === 'qrph' ? 'QRPH' : paymentMethod === 'gcash' ? 'GCash' : 'Maya'})`],
                      ['Ref. Number',   gcashReference || '-'],
                      ['Screenshot',    paymentScreenshot?.name || '-'],
                      ['Balance',       `₱${getBalance().toLocaleString()} on pickup`],
                    ].map(([label, value]) => (
                      <div key={label} className="grid grid-cols-2 py-3 border-b border-gray-100">
                        <div className="font-medium text-arl-dark">{label}</div>
                        <div className="text-gray-700">{value || '-'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Navigation */}
              <div className="flex justify-between items-start mt-8">
                <button onClick={handleBack}
                  className="px-8 py-3 bg-arl-dark text-white rounded-full font-medium hover:bg-gray-800 transition flex items-center gap-2">
                  <ChevronLeft size={20} />
                  {currentStep === 5 ? 'Edit' : 'Back'}
                </button>
                <div className="flex flex-col items-end gap-2">
                  <button onClick={handleNext} disabled={loading || codingChecking}
                    className={`px-8 py-3 rounded-full font-medium transition flex items-center gap-2 ${
                      (canProceed() && !codingChecking) ? 'bg-arl-cta text-white hover:bg-red-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}>
                    {currentStep === 5
                      ? (loading ? 'Submitting…' : 'Confirm Booking')
                      : codingChecking
                      ? 'Checking coding…'
                      : 'Next'}
                    {currentStep < 5 && !codingChecking && <ChevronRight size={20} />}
                  </button>
                  {!canProceed() && !loading && !codingChecking && (
                    <p className="text-xs text-gray-500 text-right max-w-xs">{getIncompleteReason()}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Sidebar ── */}
          <div className="lg:col-span-1">
            <div className="bg-arl-light rounded-2xl border-2 border-arl-secondary p-6 shadow-soft sticky top-4">
              <h3 className="text-arl-cta text-xl font-bold mb-4">BOOKING SUMMARY</h3>
              {selectedCar?.imageURL && (
                <img src={selectedCar.imageURL} alt={selectedCar.name}
                  className="w-full h-32 object-cover rounded-xl mb-4"
                  onError={e => e.target.style.display='none'} />
              )}
              <div className="space-y-3 text-sm">
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
                  <div key={label} className="flex justify-between">
                    <span className="font-medium text-arl-dark">{label}</span>
                    <span className="text-gray-700 text-right max-w-[60%] text-xs">{value}</span>
                  </div>
                ))}
              </div>
              <div className="border-t-2 border-arl-primary my-4" />
              <div className="text-arl-cta text-3xl font-black mb-1">
                {quoteLoading ? <span className="text-lg text-gray-400 font-medium">Computing…</span> : `₱${grandTotal.toLocaleString()}`}
              </div>
              <div className="text-sm text-arl-dark">Pay now: <span className="font-bold">₱{getPayNow().toLocaleString()}</span></div>
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