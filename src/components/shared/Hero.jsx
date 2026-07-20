import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import heroBg from "../../assets/images/web-hero-img.jpg";
import MapPicker from "./MapPicker";

const DURATION_OPTIONS = [
  { label: "12 Hours", hours: 12 },
  { label: "22 Hours", hours: 22 },
];

const LS_KEY = "arl_booking_draft";

const loadDraft = () => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
};

const saveDraft = (data) => {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch {}
};

// Same logic as Booking.jsx calcEnd
const calcEnd = (startDate, startTime, hours) => {
  if (!startDate || !startTime) return { endDate: "", endTime: "" };
  const [h, m]  = startTime.split(":").map(Number);
  const startDT = new Date(startDate);
  startDT.setHours(h, m, 0, 0);
  const endDT   = new Date(startDT.getTime() + hours * 60 * 60 * 1000);
  return {
    endDate: endDT.toISOString().split("T")[0],
    endTime: `${String(endDT.getHours()).padStart(2, "0")}:${String(endDT.getMinutes()).padStart(2, "0")}`,
  };
};

export default function Hero() {
  const navigate = useNavigate();

  // Load from localStorage on first render
  const draft = loadDraft();

  // Guard against a stale/past draft date sitting in localStorage from a
  // previous session — if it's already in the past, drop it instead of
  // silently pre-filling an invalid date.
  const todayStr = new Date().toISOString().split("T")[0];
  const draftStartDateIsPast = !!draft.startDate && draft.startDate < todayStr;

  // Pickup/dropoff/destination intentionally never recall a past draft value —
  // a fresh visit always starts blank, even if a location was typed before.
  const [pickupLocation,   setPickupLocation]   = useState("");
  const [dropoffLocation,  setDropoffLocation]  = useState("");
  const [sameAsPickup,     setSameAsPickup]     = useState(draft.sameAsPickup    || false);
  const [selectedDuration, setSelectedDuration] = useState(draft.duration        || "");
  const [startDate,        setStartDate]        = useState(draftStartDateIsPast ? "" : (draft.startDate || ""));
  const [startTime,        setStartTime]        = useState(draft.startTime       || "");
  const [endDate,          setEndDate]          = useState(draftStartDateIsPast ? "" : (draft.endDate   || ""));
  const [endTime,          setEndTime]          = useState(draft.endTime         || "");
  const [destination,      setDestination]      = useState("");
  const [mapOpen,          setMapOpen]          = useState(false);

  // Persist to localStorage whenever any booking field changes.
  // pickupLocation/dropoffLocation/destination are deliberately excluded —
  // those should never be recalled on a fresh visit.
  useEffect(() => {
    saveDraft({
      sameAsPickup,
      duration: selectedDuration,
      startDate,
      startTime,
      endDate,
      endTime,
    });
  }, [sameAsPickup, selectedDuration, startDate, startTime, endDate, endTime]);

  // Auto-calculate endDate & endTime whenever startDate, startTime, or duration changes
  useEffect(() => {
    if (!selectedDuration) return;
    const dur = DURATION_OPTIONS.find(d => d.label === selectedDuration);
    if (!dur) return;
    if (startDate && startTime) {
      const { endDate: ed, endTime: et } = calcEnd(startDate, startTime, dur.hours);
      setEndDate(ed);
      setEndTime(et);
    } else {
      setEndDate("");
      setEndTime("");
    }
  }, [selectedDuration, startDate, startTime]);

  const handleSameAsPickup = (checked) => {
    setSameAsPickup(checked);
    if (checked) setDropoffLocation(pickupLocation);
  };

  const handlePickupChange = (val) => {
    setPickupLocation(val);
    if (sameAsPickup) setDropoffLocation(val);
  };

  const handleViewVehicles = () => {
    saveDraft({
      sameAsPickup,
      duration: selectedDuration,
      startDate,
      startTime,
      endDate,
      endTime,
    });
    navigate("/booking", {
      state: {
        pickupLocation,
        dropoffLocation,
        duration: selectedDuration,
        startDate,
        startTime,
        endDate,
        endTime,
        destination,
      },
    });
  };

  // Label helpers
  const fmtDate = (d) => {
    if (!d) return "";
    const dt = new Date(d + "T00:00:00");
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };
  const fmt12 = (t) => {
    if (!t) return "";
    const [h, m] = t.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    return `${((h % 12) || 12)}:${String(m).padStart(2, "0")} ${ampm}`;
  };

  return (
    <section
      className="relative min-h-screen flex items-center bg-cover bg-center"
      style={{
        backgroundImage: `
          linear-gradient(
            90deg,
            rgba(5,10,20,0.82) 0%,
            rgba(5,10,20,0.65) 35%,
            rgba(5,10,20,0.25) 65%,
            rgba(5,10,20,0.10) 100%
          ),
          url(${heroBg})
        `,
      }}
    >
      {/* Glow Accent */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-arl-secondary/20 blur-3xl rounded-full"></div>

      <div className="relative max-w-7xl mx-auto px-6 w-full flex flex-col items-start justify-center py-16 gap-8">

        {/* HEADLINE */}
        <div>
          <h1 className="font-display text-white text-5xl md:text-7xl font-medium leading-tight tracking-tight py-5">
            Where You Are. <br />
            <span className="text-arl-secondary">
              Where You Want <br /> To Be.
            </span>
          </h1>
        </div>

        {/* BOOKING FORM */}
        <div className="relative z-20 w-full max-w-4xl bg-white/85 backdrop-blur-xl rounded-3xl p-8 shadow-lg">

          <h3 className="text-2xl font-bold text-arl-primary mb-2">Book Your Ride</h3>
          <p className="text-sm text-gray-500 mb-6">Quick reservation in just a few steps.</p>

          <div className="space-y-5">

            {/* Pick-up / Drop-off */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide pl-1">Pick-up Location</label>
                <input
                  type="text"
                  value={pickupLocation}
                  onChange={(e) => handlePickupChange(e.target.value)}
                  placeholder="Enter pick-up location…"
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:ring-2 ring-arl-secondary bg-white"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide pl-1">Drop-off Location</label>
                <input
                  type="text"
                  value={dropoffLocation}
                  onChange={(e) => setDropoffLocation(e.target.value)}
                  disabled={sameAsPickup}
                  placeholder="Enter drop-off location…"
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:ring-2 ring-arl-secondary bg-white disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            {/* Same as pickup checkbox */}
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer -mt-1">
              <input
                type="checkbox"
                className="accent-arl-cta"
                checked={sameAsPickup}
                onChange={(e) => handleSameAsPickup(e.target.checked)}
              />
              Same as pick-up location
            </label>

            {/* Duration radio buttons */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide pl-1">Duration</label>
              <div className="flex gap-3">
                {DURATION_OPTIONS.map(({ label }) => (
                  <label
                    key={label}
                    className={`flex items-center gap-2 flex-1 cursor-pointer border-2 rounded-xl px-4 py-3 transition-all ${
                      selectedDuration === label
                        ? "border-arl-primary bg-arl-primary/5 text-arl-primary"
                        : "border-gray-200 bg-white text-gray-600 hover:border-arl-secondary"
                    }`}
                  >
                    <input
                      type="radio"
                      name="heroDuration"
                      value={label}
                      checked={selectedDuration === label}
                      onChange={() => setSelectedDuration(label)}
                      className="accent-arl-cta w-4 h-4"
                    />
                    <span className="text-sm font-semibold">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Destination — map picker */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide pl-1">Destination</label>
              <button
                type="button"
                onClick={() => setMapOpen(true)}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-left outline-none focus:ring-2 ring-arl-secondary bg-white hover:border-arl-secondary transition flex items-center justify-between gap-2"
              >
                <span className={destination ? "text-gray-800 truncate" : "text-gray-400"}>
                  {destination || "📍 Pick destination on map…"}
                </span>
                <span className="text-arl-secondary text-xs font-bold flex-shrink-0">
                  {destination ? "Change" : "Open Map"}
                </span>
              </button>
            </div>

            {/* Start Date */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide pl-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:ring-2 ring-arl-secondary"
              />
            </div>

            {/* Start Time */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide pl-1">Start Time</label>
              <select
                value={startTime || ''}
                onChange={e => setStartTime(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-700 bg-white outline-none focus:ring-2 ring-arl-secondary cursor-pointer"
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
            </div>

            {/* Auto-calculated end — show as read-only when filled */}
            {endDate && endTime && (
              <div className="rounded-xl bg-arl-primary/5 border border-arl-primary/20 px-4 py-3 flex items-center gap-3">
                <span className="text-lg">🏁</span>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Auto-calculated End</p>
                  <p className="text-sm font-bold text-arl-primary">
                    {fmtDate(endDate)} &nbsp;·&nbsp; {fmt12(endTime)}
                  </p>
                </div>
                <span className="ml-auto text-xs text-arl-secondary font-semibold bg-arl-secondary/10 px-2 py-1 rounded-full">
                  {selectedDuration}
                </span>
              </div>
            )}

            {/* CTA */}
            <button
              onClick={handleViewVehicles}
              className="group w-full mt-2 rounded-xl bg-arl-cta text-white py-3.5 font-semibold hover:bg-arl-secondary transition-colors duration-300"
            >
              <span className="inline-flex items-center gap-2">
                View Vehicles
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </span>
            </button>

          </div>
        </div>
      </div>

      {/* Map Picker Modal */}
      <MapPicker
        isOpen={mapOpen}
        onClose={() => setMapOpen(false)}
        onConfirm={({ address }) => {
          setDestination(address);
          setMapOpen(false);
        }}
        initialLabel={destination}
      />
    </section>
  );
}