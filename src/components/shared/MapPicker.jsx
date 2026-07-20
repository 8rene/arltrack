import { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default marker icon (Leaflet webpack issue)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Just where the map visually centers on open — never a submitted value.
const DEFAULT_COORDS = [14.7619, 120.9603];

// Rough bounding box around the Philippine archipelago — stops the map from
// being panned/zoomed out to other countries. Doesn't by itself exclude open
// water between islands (still inside this box) — that's handled separately
// below via the reverse-geocode country check.
const PH_BOUNDS = L.latLngBounds([4.5, 116.0], [21.5, 127.0]);

// Inner component: handles map click + drag
const MapClickHandler = ({ onLocationChange }) => {
  useMapEvents({
    click(e) {
      onLocationChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

// Inner component: fly to coords when search result comes in
const MapFlyTo = ({ coords }) => {
  const map = useMap();
  useEffect(() => {
    if (coords) map.flyTo(coords, 15, { animate: true });
  }, [coords, map]);
  return null;
};

// Draggable marker
const DraggableMarker = ({ position, onDrag }) => {
  const markerRef = useRef(null);
  const eventHandlers = {
    dragend() {
      const m = markerRef.current;
      if (m) {
        const latlng = m.getLatLng();
        onDrag(latlng.lat, latlng.lng);
      }
    },
  };
  return <Marker draggable position={position} ref={markerRef} eventHandlers={eventHandlers} />;
};

// Reverse geocode using Nominatim (free, no API key).
// Returns both the display label and the raw address block, since the caller
// needs address.country_code to reject picks outside the Philippines
// (this also catches most open-water picks, since Nominatim generally can't
// resolve an address for open sea).
const reverseGeocode = async (lat, lng) => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const data = await res.json();
    return {
      label:   data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      address: data.address || null,
    };
  } catch {
    return { label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, address: null };
  }
};

// Search using Nominatim — returns up to 10 results, Philippines only
const searchAddress = async (query) => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=10&countrycodes=ph&addressdetails=1`,
      { headers: { 'Accept-Language': 'en' } }
    );
    return await res.json();
  } catch {
    return [];
  }
};

// ── MapPicker modal ──────────────────────────────────────────────
const MapPicker = ({ isOpen, onClose, onConfirm, initialLabel = '' }) => {
  const [markerPos,    setMarkerPos]    = useState(DEFAULT_COORDS);
  const [address,      setAddress]      = useState(initialLabel);
  const [resolvedCity, setResolvedCity] = useState(''); // structured city name, not the free-text label
  const [searchQuery,  setSearchQuery]  = useState('');
  const [searchResults,setSearchResults]= useState([]);
  const [searching,    setSearching]    = useState(false);
  const [flyTarget,    setFlyTarget]    = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [pickError,    setPickError]    = useState('');
  // True once the user has actually chosen a location this session — either
  // by reopening on a field that already had a real value, or by clicking/
  // dragging the pin or picking a search result. DEFAULT_COORDS/DEFAULT_LABEL
  // are just where the map centers visually; they must never be treated as
  // a real pick, or Confirm can submit a location nobody chose.
  const [hasSelected,  setHasSelected]  = useState(!!initialLabel);

  // Pick the best available locality field from Nominatim's structured
  // address block — this is what should be matched against a coding rule's
  // city, not a fuzzy substring search across the whole display address.
  const pickCity = (addr) => addr?.city || addr?.town || addr?.municipality || addr?.village || '';

  // When modal opens, reset to initial or default
  useEffect(() => {
    if (isOpen) {
      setMarkerPos(DEFAULT_COORDS);
      setAddress(initialLabel);
      setHasSelected(!!initialLabel);
      setResolvedCity('');
      setSearchQuery('');
      setSearchResults([]);
      setFlyTarget(null);
      setPickError('');
    }
  }, [isOpen, initialLabel]);

  const handleLocationChange = useCallback(async (lat, lng) => {
    setLoading(true);
    const { label, address } = await reverseGeocode(lat, lng);

    // A country match alone isn't enough — Nominatim happily returns
    // country_code "ph" for open water anywhere inside Philippine
    // territorial waters (a bay, the open sea between islands), with
    // nothing more specific because there's nothing there to name. That's
    // exactly what a bare "Philippines"-only result means: no real place.
    // Require at least one actual locality field before accepting the pick.
    const hasLocality = !!(
      address?.city || address?.town || address?.village ||
      address?.municipality || address?.suburb || address?.county ||
      address?.hamlet || address?.neighbourhood
    );

    if (!address || address.country_code !== 'ph' || !hasLocality) {
      setPickError('Please pick a location within the Philippines (on land).');
      setLoading(false);
      return; // marker/address left unchanged — previous valid pick stays
    }

    setPickError('');
    setMarkerPos([lat, lng]);
    setAddress(label);
    setResolvedCity(pickCity(address));
    setHasSelected(true);
    setLoading(false);
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    const results = await searchAddress(searchQuery);
    setSearchResults(results);
    setSearching(false);
  };

  const handleSearchSelect = async (result) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    setMarkerPos([lat, lng]);
    setFlyTarget([lat, lng]);
    setAddress(result.display_name);
    setResolvedCity(pickCity(result.address));
    setHasSelected(true);
    setSearchResults([]);
    setSearchQuery('');
  };

  const handleConfirm = () => {
    // Belt-and-suspenders: the button is already disabled without a real
    // pick, but never let a confirm through without one regardless of how
    // it was triggered.
    if (!hasSelected) return;
    onConfirm({ address, lat: markerPos[0], lng: markerPos[1], city: resolvedCity });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-black text-arl-primary">📍 Pick Location</h3>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 text-sm transition">
            ✕
          </button>
        </div>

        {/* Search bar */}
        <div className="px-6 py-3 border-b border-gray-100">
          <div className="flex gap-2">
            <input
              type="text"
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-arl-secondary text-sm"
              placeholder="Search address in Philippines…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button
              onClick={handleSearch}
              disabled={searching}
              className="px-4 py-2.5 rounded-xl bg-arl-primary text-white text-sm font-semibold hover:bg-arl-secondary transition disabled:opacity-50"
            >
              {searching ? '…' : 'Search'}
            </button>
          </div>

          {/* Search results */}
          {searchResults.length > 0 && (
            <div className="mt-2 border border-gray-200 rounded-xl overflow-hidden shadow-lg max-h-60 overflow-y-auto">
              {searchResults.map((r, i) => {
                const a = r.address || {};
                const parts = [
                  r.name || r.display_name.split(',')[0],
                  a.road || a.suburb || a.neighbourhood,
                  a.city || a.municipality || a.town || a.village,
                  a.province || a.state,
                ].filter(Boolean);
                return (
                  <button key={i}
                    onClick={() => handleSearchSelect(r)}
                    className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-arl-primary/5 border-b border-gray-100 last:border-0 transition">
                    <span className="font-semibold text-arl-primary">{parts[0]}</span>
                    {parts.length > 1 && (
                      <span className="text-gray-400 text-xs block">{parts.slice(1).join(', ')}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {searchResults.length === 0 && searchQuery && !searching && (
            <p className="text-xs text-gray-400 mt-2 px-1">No results. Try a different keyword.</p>
          )}
        </div>

        {/* Map */}
        <div className="flex-1 relative" style={{ minHeight: '350px' }}>
          <MapContainer
            center={DEFAULT_COORDS}
            zoom={15}
            minZoom={5}
            maxBounds={PH_BOUNDS}
            maxBoundsViscosity={1.0}
            style={{ height: '100%', width: '100%', minHeight: '350px' }}
            scrollWheelZoom
          >
            <TileLayer
              attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapClickHandler onLocationChange={handleLocationChange} />
            {flyTarget && <MapFlyTo coords={flyTarget} />}
            <DraggableMarker position={markerPos} onDrag={handleLocationChange} />
          </MapContainer>

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/60 z-[500]">
              <div className="text-sm text-arl-primary font-semibold animate-pulse">Getting address…</div>
            </div>
          )}
        </div>

        {/* Selected address + confirm */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-400 mb-1">Selected location:</p>
          <p className={`text-sm font-semibold mb-3 line-clamp-2 ${hasSelected ? 'text-arl-dark' : 'text-gray-400 italic'}`}>
            {loading ? 'Getting address…' : (hasSelected ? address : 'Tap the map, drag the pin, or search to choose a location')}
          </p>
          {pickError && (
            <p className="text-xs text-red-500 mb-3">⚠ {pickError}</p>
          )}
          <div className="flex gap-3">
            <button onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 text-gray-500 text-sm font-semibold hover:border-gray-300 transition">
              Cancel
            </button>
            <button onClick={handleConfirm} disabled={loading || !hasSelected}
              className="flex-1 py-2.5 rounded-xl bg-arl-primary text-white text-sm font-semibold hover:bg-arl-secondary transition disabled:opacity-50">
              ✓ Use this location
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default MapPicker;