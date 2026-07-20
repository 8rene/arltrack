import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { ChevronLeft, MapPin, AlertCircle, Navigation2 } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Same icon fix used in MapPicker.jsx — Leaflet's default marker breaks under webpack.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const DEFAULT_COORDS = [14.7767, 120.9650]; // Saog, Marilao, Bulacan — same fallback as MapPicker

// Colored teardrop pins built as inline SVG divIcons — no extra image
// requests, and colors match each pin's meaning at a glance: orange for
// pickup/drop-off, green for the destination and any extra stops.
const PIN_COLORS = { pickup: '#f97316', dropoff: '#f97316', stop: '#16a34a' };

const makePinIcon = (color) => L.divIcon({
  className: '',
  html: `
    <svg width="30" height="42" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 2px rgba(0,0,0,0.35))">
      <path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 27 15 27s15-16.5 15-27C30 6.7 23.3 0 15 0z" fill="${color}"/>
      <circle cx="15" cy="15" r="6" fill="white"/>
    </svg>`,
  iconSize:  [30, 42],
  iconAnchor:[15, 42],
  popupAnchor:[0, -38],
});

const pinIconFor = (kind) => makePinIcon(PIN_COLORS[kind] || PIN_COLORS.stop);

// Pans/zooms the map to a pin when its list item is clicked. Lives inside
// MapContainer (needs useMap's context), so it's its own tiny component
// rather than logic inline in the page — same pattern as MapFlyTo in
// MapPicker.jsx.
const FlyToPin = ({ target }) => {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], 16, { animate: true });
  }, [target, map]);
  return null;
};

// Handles Firestore Timestamps (both the SDK's own {toDate} shape and the
// {_seconds, _nanoseconds} shape they serialize to over JSON), JS Dates,
// and ISO strings — same logic as fmtDT in MyBookings.jsx, which this page
// never got when it was split out.
const fmtDateTime = (val) => {
  if (!val) return '—';
  if (val?.toDate) return val.toDate().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
  if (val?._seconds !== undefined) return new Date(val._seconds * 1000).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
  const d = new Date(val);
  return isNaN(d) ? '—' : d.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
};

const BookingDetailsPage = () => {
  const { bookingID } = useParams();
  const navigate = useNavigate();

  const [details,  setDetails]  = useState(null); // full payload from /details
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [focusTarget, setFocusTarget] = useState(null); // { lat, lng } — set when a pin-list row is clicked
  const markerRefs = useRef({}); // keyed by pin index, so clicking a list row can also pop its marker open

  const authHeader = { Authorization: `Bearer ${localStorage.getItem('arl_token')}` };

  // Booking + pins — fetched once. This is trip metadata and destination
  // pins set at booking time, not something that changes minute to minute.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${process.env.REACT_APP_API_URL}/bookings/${bookingID}/details`, { headers: authHeader });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.message || 'Failed to load booking details.');
        } else {
          setDetails(data);
        }
      } catch {
        if (!cancelled) setError('Could not reach the server.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingID]);

  // Customers don't see live position at all — informed that tracking is
  // active during an ongoing chauffeur trip, not shown how granular/live it
  // actually is. No polling, no /live call, nothing to leak here.
  const isBeingTracked = details?.booking?.modeOfDriving === 'With Chauffeur' && details?.booking?.status === 'ongoing';

  if (loading) {
    return <div className="max-w-3xl mx-auto px-4 py-10 text-sm text-gray-400">Loading booking details…</div>;
  }

  if (error || !details) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">
          <AlertCircle size={16} /> {error || 'Booking not found.'}
        </div>
      </div>
    );
  }

  const { booking, pickupLocation, dropoffLocation, geofenceZones } = details;

  // Pins to plot: pickup, drop-off (always shown as its own pin even when
  // it's the same point as pickup today — the customer still booked a
  // drop-off, so it should still show up as one), every geofence zone
  // (destination + extra stops).
  const pins = [];
  if (pickupLocation)  pins.push({ label: 'Pickup',   kind: 'pickup',  ...pickupLocation });
  if (dropoffLocation) pins.push({ label: 'Drop-off', kind: 'dropoff', ...dropoffLocation });
  // The backend's own "Pickup" zone (from makeZone) would duplicate the pin
  // above at the same coordinates — skip it here, everything else (the
  // destination and any extra stops) already carries its own real label
  // (an address, or a literal "Destination"/stop name) straight from the
  // backend now, no more remapping fixed keywords to display text.
  (geofenceZones || [])
    .filter((z) => (z.label || '').toLowerCase() !== 'pickup')
    .forEach((z) => pins.push({ label: z.label || 'Stop', kind: 'stop', lat: z.lat, lng: z.lng }));

  const center = pins[0] ? [pins[0].lat, pins[0].lng] : DEFAULT_COORDS;

  const focusPin = (p, i) => {
    setFocusTarget({ lat: p.lat, lng: p.lng });
    // Popup opens right after the fly-to fires; a small delay so the map's
    // had a moment to actually move before the popup pops up on top of it.
    setTimeout(() => markerRefs.current[i]?.openPopup(), 300);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 pt-24 pb-10">
      <button
        onClick={() => navigate('/my-bookings')}
        className="flex items-center gap-1 text-sm font-semibold text-arl-secondary hover:text-arl-primary mb-4 transition">
        <ChevronLeft size={18} /> Back to My Bookings
      </button>

      <h1 className="text-xl font-black text-gray-800 mb-1 flex items-center gap-2">
        <MapPin size={20} className="text-arl-cta" /> Booking Details
      </h1>
      <p className="text-xs text-gray-500 mb-4">{booking.carName || 'Your vehicle'} · {booking.serviceType || '—'}</p>

      {/* Trip info */}
      <div className="grid grid-cols-2 gap-3 mb-5 text-sm">
        <div className="border border-gray-200 rounded-xl px-4 py-3">
          <p className="text-xs text-gray-400 mb-0.5">Start</p>
          <p className="font-semibold text-arl-dark">{fmtDateTime(booking.startDateTime)}</p>
        </div>
        <div className="border border-gray-200 rounded-xl px-4 py-3">
          <p className="text-xs text-gray-400 mb-0.5">End</p>
          <p className="font-semibold text-arl-dark">{fmtDateTime(booking.endDateTime)}</p>
        </div>
        <div className="border border-gray-200 rounded-xl px-4 py-3">
          <p className="text-xs text-gray-400 mb-0.5">Driving mode</p>
          <p className="font-semibold text-arl-dark">{booking.modeOfDriving || '—'}</p>
        </div>
        <div className="border border-gray-200 rounded-xl px-4 py-3">
          <p className="text-xs text-gray-400 mb-0.5">Status</p>
          <p className="font-semibold text-arl-dark capitalize">{booking.status}</p>
        </div>
      </div>

      {/* Pin list */}
      {pins.length > 0 && (
        <div className="mb-4 space-y-1">
          {pins.map((p, i) => (
            <button
              key={i}
              onClick={() => focusPin(p, i)}
              className="w-full flex items-start gap-2 text-sm text-left hover:bg-gray-50 rounded-lg px-1 py-0.5 transition">
              <MapPin size={14} className="mt-0.5 shrink-0" style={{ color: PIN_COLORS[p.kind] || PIN_COLORS.stop }} />
              <span><span className="font-semibold">{p.label}:</span> {p.address || `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`}</span>
            </button>
          ))}
        </div>
      )}

      {isBeingTracked && (
        <div className="flex items-center gap-2 text-xs font-semibold text-purple-600 bg-purple-50 border border-purple-200 rounded-xl px-3 py-2 mb-3">
          <Navigation2 size={14} /> This trip is being tracked for your safety.
        </div>
      )}

      <div className="rounded-2xl overflow-hidden border-2 border-gray-200" style={{ height: 380 }}>
        <MapContainer
          center={center}
          zoom={pins.length ? 13 : 11}
          maxZoom={18}
          scrollWheelZoom={true}
          touchZoom={true}
          doubleClickZoom={true}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          <FlyToPin target={focusTarget} />
          {pins.map((p, i) => (
            <Marker
              key={i}
              position={[p.lat, p.lng]}
              icon={pinIconFor(p.kind)}
              ref={(el) => { if (el) markerRefs.current[i] = el; }}
            >
              <Popup>{p.label}{p.address ? ` — ${p.address}` : ''}</Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {pins.length > 0 && (
        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: PIN_COLORS.pickup }} />
            Pickup / Drop-off
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: PIN_COLORS.stop }} />
            Destination
          </span>
        </div>
      )}

      {pins.length === 0 && (
        <p className="text-xs text-gray-400 mt-3">No location pins recorded for this booking.</p>
      )}
    </div>
  );
};

export default BookingDetailsPage;