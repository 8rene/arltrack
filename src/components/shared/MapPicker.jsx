import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, GeoJSON, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchBaseAreaConfig, getBaseAreaOutline, isInsideBaseArea } from '../../utils/baseArea';
import { fetchCodingCities, getCodingZoneOutline } from '../../utils/codingZones';

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

// Loose place-name match for the coding-zone note — same normalisation idea as
// utils/baseArea.js's normalizePlace (lowercase, drop "City of"/"City", punctuation).
const normalizePlaceLoose = (v) =>
  String(v || '')
    .toLowerCase()
    .replace(/\b(city|province|municipality) of\b/g, ' ')
    .replace(/\bcity\b/g, ' ')
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

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

const pickRegion = (addr) => addr?.region || addr?.state || addr?.state_district || '';

// Water detection. Nominatim tags lakes, rivers, bays, seas etc. with these
// class/type pairs; a pin that resolves to one of them is not a place a car can
// be handed over at.
const WATER_TYPES = new Set([
  'water', 'bay', 'strait', 'sea', 'ocean', 'coastline', 'reef', 'wetland', 'lake', 'lagoon',
  'river', 'stream', 'canal', 'drain', 'ditch', 'riverbank', 'basin', 'reservoir', 'harbour',
  'cove', 'channel', 'fjord', 'spring', 'waterfall', 'dock',
]);
const isWaterResult = (r) => {
  const cls  = String(r?.class || r?.category || '').toLowerCase();
  const type = String(r?.type || '').toLowerCase();
  if (cls === 'waterway') return true;
  if (cls === 'natural' && WATER_TYPES.has(type)) return true;
  if (cls === 'water') return true;
  return false;
};

// Reverse geocode using Nominatim (free, no API key).
// Returns the display label, the raw address block (caller needs
// address.country_code to reject picks outside the Philippines), a `water` flag
// (the pin landed on a sea / bay / lake / river — see isWaterResult), and an `error` flag so a failed request can be
// told apart from a location that was resolved and simply rejected.
const reverseGeocode = async (lat, lng) => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&zoom=18`,
      { headers: { 'Accept-Language': 'en' } }
    );
    if (!res.ok) throw new Error(`Reverse geocode failed: ${res.status}`);
    const data = await res.json();
    return {
      label:   data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      address: data.address || null,
      water:   isWaterResult(data),
      error:   false,
    };
  } catch (err) {
    console.error('[MapPicker] reverseGeocode failed:', err.message);
    return { label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, address: null, water: false, error: true };
  }
};

// Search using Nominatim — returns up to 10 results, Philippines only.
// `error: true` means the request itself failed (network/CORS/rate-limit),
// as distinct from the request succeeding with zero matches.
const searchAddress = async (query) => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=10&countrycodes=ph&addressdetails=1`,
      { headers: { 'Accept-Language': 'en' } }
    );
    if (!res.ok) throw new Error(`Search failed: ${res.status}`);
    const results = (await res.json()).filter((r) => !isWaterResult(r));
    return { results, error: false };
  } catch (err) {
    console.error('[MapPicker] searchAddress failed:', err.message);
    return { results: [], error: true };
  }
};

// ── MapPicker modal ──────────────────────────────────────────────
// `readOnly`: view-only mode — pin is fixed, search bar is hidden, and the
// footer is just a Close button. Used for the "Pick up in-store" lock, so
// the customer can still see exactly where the store is on the map without
// being able to move the pin while it's locked.
// `initialCoords`: { lat, lng } to center on immediately when opening —
// without this the map always starts at DEFAULT_COORDS regardless of what
// location is already selected.
// showBaseArea  — shade the base area on the map and say whether the chosen spot is inside/outside it.
// baseAreaRole  — 'pickup' | 'destination': which location this map is picking. The note only shows
//                 when that location is one that decides the out-of-area charge.
const MapPicker = ({ isOpen, onClose, onConfirm, initialLabel = '', readOnly = false, initialCoords = null, showBaseArea = false, baseAreaRole = 'pickup', showCodingZones = false, codingCarID = '', codingStart = '', codingEnd = '' }) => {
  const [markerPos,    setMarkerPos]    = useState(DEFAULT_COORDS);
  const [address,      setAddress]      = useState(initialLabel);
  const [resolvedCity, setResolvedCity] = useState(''); // structured city name, not the free-text label
  const [resolvedProvince, setResolvedProvince] = useState(''); // structured province/state name
  const [resolvedRegion, setResolvedRegion] = useState('');     // region name as returned by the geocoder
  const [resolvedCounty, setResolvedCounty] = useState('');     // geocoder "county" — often the province (base-area match)
  const [baseCfg,     setBaseCfg]     = useState(null);   // { baseAreaKeywords, basis, fee amounts }
  const [baseShapes,  setBaseShapes]  = useState({});     // keyword -> GeoJSON geometry (progressively filled)
  const [codingCities, setCodingCities] = useState([]);   // city names with at least one coding rule
  const [codingShapes, setCodingShapes] = useState({});   // city name -> GeoJSON geometry (progressively filled)
  const [searchQuery,  setSearchQuery]  = useState('');
  const [searchResults,setSearchResults]= useState([]);
  const [searching,    setSearching]    = useState(false);
  const [searchError,  setSearchError]  = useState(''); // request itself failed — distinct from "no matches"
  // Whether the CURRENT searchQuery has actually been submitted (Enter or
  // Search click) and come back. Typing alone must not count — otherwise
  // "No results" flashes for text the user hasn't searched yet at all.
  const [hasSearched,  setHasSearched]  = useState(false);
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

  // Same idea, one level up — province/state. Used for base-area fee
  // matching (e.g. "Bulacan" is a province covering many municipalities,
  // not a single city — see pricing.js isBaseArea).
  const pickProvince = (addr) => addr?.province || addr?.state || '';

  // When modal opens, reset to initial or default
  useEffect(() => {
    if (isOpen) {
      const startPos = initialCoords ? [initialCoords.lat, initialCoords.lng] : DEFAULT_COORDS;
      setMarkerPos(startPos);
      setAddress(initialLabel);
      setHasSelected(!!initialLabel);
      setResolvedCity('');
      setResolvedProvince('');
      setResolvedRegion('');
      setResolvedCounty('');
      setSearchQuery('');
      setSearchResults([]);
      setSearchError('');
      setHasSearched(false);
      // Center on the known location immediately rather than making the
      // customer hunt for a pin that's already sitting at DEFAULT_COORDS.
      setFlyTarget(initialCoords ? startPos : null);
      setPickError('');
    }
  }, [isOpen, initialLabel, initialCoords]);

  const handleLocationChange = useCallback(async (lat, lng) => {
    if (readOnly) return; // pin is fixed — see MapClickHandler/DraggableMarker below, which also don't wire up in this mode
    setLoading(true);
    const { label, address, water, error } = await reverseGeocode(lat, lng);

    if (error) {
      setPickError("Couldn't look up that location — check your connection and try again.");
      setLoading(false);
      return;
    }

    if (water) {
      setPickError("That spot is on water (sea, bay, lake or river). Please pick a spot on land.");
      setLoading(false);
      return;
    }

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
    setResolvedProvince(pickProvince(address));
    setResolvedRegion(pickRegion(address));
    setResolvedCounty(address?.county || '');
    setHasSelected(true);
    setLoading(false);
  }, [readOnly]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchError('');
    const { results, error } = await searchAddress(searchQuery);
    setSearchResults(results);
    if (error) setSearchError("Search failed — check your connection and try again.");
    setHasSearched(true);
    setSearching(false);
  };

  const handleSearchSelect = async (result) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);

    if (result.address?.country_code !== 'ph') {
      setPickError('Please pick a location within the Philippines.');
      return; // don't accept the pick; leave the previous valid selection in place
    }

    setPickError('');
    setMarkerPos([lat, lng]);
    setFlyTarget([lat, lng]);
    setAddress(result.display_name);
    setResolvedCity(pickCity(result.address));
    setResolvedProvince(pickProvince(result.address));
    setResolvedRegion(pickRegion(result.address));
    setResolvedCounty(result.address?.county || '');
    setHasSelected(true);
    setSearchResults([]);
    setSearchQuery('');
  };

  const handleConfirm = () => {
    // Belt-and-suspenders: the button is already disabled without a real
    // pick, but never let a confirm through without one regardless of how
    // it was triggered.
    if (!hasSelected) return;
    onConfirm({ address, lat: markerPos[0], lng: markerPos[1], city: resolvedCity, province: resolvedProvince, region: resolvedRegion, county: resolvedCounty });
  };

  // ── Base area: load the admin's keywords, then draw each one's outline ──
  // Outlines come in one at a time (cached after the first load — see utils/baseArea.js),
  // so the map is usable immediately and the shading fills in.
  useEffect(() => {
    if (!isOpen || !showBaseArea) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const cfg = await fetchBaseAreaConfig();
        if (cancelled) return;
        setBaseCfg(cfg);
        for (const kw of cfg.baseAreaKeywords) {
          if (cancelled) return;
          try {
            const shape = await getBaseAreaOutline(kw);
            if (cancelled) return;
            if (shape?.geometry) setBaseShapes((prev) => ({ ...prev, [kw]: shape.geometry }));
          } catch (err) {
            console.warn('[MapPicker] base-area outline failed for', kw, err.message);
          }
        }
      } catch (err) {
        console.warn('[MapPicker] base-area config failed:', err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, showBaseArea]);

  // ── Coding-rule cities: general heads-up shading for the Destination map ──
  // Loads the distinct cities with at least one coding rule, then each
  // one's outline, one at a time (cached — see utils/codingZones.js). This
  // is NOT the exact date/plate check (that stays in Booking.jsx's
  // runCodingCheck/codingNote, which fires once a car + dates are chosen) —
  // it's just a proactive "this city may have coding" visual.
  useEffect(() => {
    if (!isOpen || !showCodingZones) return undefined;
    let cancelled = false;
    setCodingCities([]);
    setCodingShapes({});
    (async () => {
      try {
        const { cities } = await fetchCodingCities({ carID: codingCarID, startDateTime: codingStart, endDateTime: codingEnd });
        if (cancelled) return;
        setCodingCities(cities);
        for (const city of cities) {
          if (cancelled) return;
          try {
            const shape = await getCodingZoneOutline(city);
            if (cancelled) return;
            if (shape?.geometry) setCodingShapes((prev) => ({ ...prev, [city]: shape.geometry }));
          } catch (err) {
            console.warn('[MapPicker] coding-zone outline failed for', city, err.message);
          }
        }
      } catch (err) {
        console.warn('[MapPicker] coding cities failed:', err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, showCodingZones, codingCarID, codingStart, codingEnd]);

  // Is the currently-picked spot inside one of those coding-rule cities?
  // Display only — Booking.jsx's exact date/plate check is what actually warns/blocks.
  const inCodingCity = showCodingZones && hasSelected && !loading
    ? codingCities.some((c) => normalizePlaceLoose(c) && normalizePlaceLoose(c) === (normalizePlaceLoose(resolvedCity) || normalizePlaceLoose(resolvedCounty)))
    : false;

  // Inside / outside note for the spot currently chosen. Display only — the server
  // recalculates the fee itself. Shown only when this map's role is one of the locations
  // the admin's rule actually charges on.
  const roleCounts = baseCfg && (baseCfg.basis === 'either' || baseCfg.basis === baseAreaRole);
  const baseInside = (showBaseArea && roleCounts && hasSelected && !loading)
    ? isInsideBaseArea({ city: resolvedCity, province: resolvedProvince, county: resolvedCounty }, baseCfg.baseAreaKeywords)
    : null;
  const peso = (n) => `₱${Number(n || 0).toLocaleString()}`;
  const baseAreaNote = baseInside === false ? (
    <div role="note" className="mb-2.5 sm:mb-3 rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-2">
      <p className="text-[11px] sm:text-xs font-black text-amber-800">Outside our base area</p>
      <p className="text-[10px] sm:text-xs text-amber-800 mt-0.5">
        An extra {peso(baseCfg.extraFeeOutsideArea)} applies to this booking. It is charged once, even if other locations are outside too.
        {` With a driver, the driver's fee becomes ${peso(baseCfg.driversFeeOutsideArea)} instead of ${peso(baseCfg.driversFeeBaseArea)}, with no extra fee on top.`}
      </p>
    </div>
  ) : baseInside === true ? (
    <p className="text-[10px] sm:text-xs text-green-700 font-semibold mb-2.5 sm:mb-3">Inside our base area — no extra fee for this location.</p>
  ) : null;

  // General coding-restriction heads-up for the chosen destination. This is NOT
  // the exact check — just lets the customer know this city has SOME coding rule
  // before they've even picked a car/date; Booking.jsx's runCodingCheck/codingNote
  // does the real date+plate-accurate warning/block right after.
  const codingZoneNote = inCodingCity ? (
    <div role="note" className="mb-2.5 sm:mb-3 rounded-xl border-2 border-orange-300 bg-orange-50 px-3 py-2">
      <p className="text-[11px] sm:text-xs font-black text-orange-800">
        {codingCarID ? 'Your car is under number coding in this city' : 'This city has a vehicle coding restriction'}
      </p>
      <p className="text-[10px] sm:text-xs text-orange-800 mt-0.5">
        {codingCarID
          ? 'Your car\'s plate is coded here on at least one day of your booking. The exact days and hours are listed below the destination.'
          : 'Some plate numbers can\'t drive here on certain days/times. We\'ll check your exact dates once you pick a car.'}
      </p>
    </div>
  ) : null;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4">
      <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col h-[95vh] sm:h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 border-b border-gray-100">
          <div>
            <h3 className="text-sm sm:text-lg font-black text-arl-primary">Pick Location</h3>
            {readOnly ? (
              <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5">Fixed pickup location — uncheck "Pick up in-store" to choose elsewhere</p>
            ) : (
              <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5">Pickup is available anywhere in the Philippines (on land)</p>
            )}
          </div>
          <button onClick={onClose}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 text-sm transition flex-shrink-0">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8"/></svg>
          </button>
        </div>

        {/* Search bar — hidden in read-only mode, since there's nothing to search for */}
        {!readOnly && (
        <div className="px-4 py-2.5 sm:px-6 sm:py-3 border-b border-gray-100">
          <div className="flex gap-1.5 sm:gap-2">
            <input
              type="text"
              className="flex-1 min-w-0 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-arl-secondary text-xs sm:text-sm"
              placeholder="Search address in Philippines…"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setHasSearched(false);
                setSearchResults([]);
                setSearchError('');
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button
              onClick={handleSearch}
              disabled={searching}
              className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-arl-primary text-white text-xs sm:text-sm font-semibold hover:bg-arl-secondary transition disabled:opacity-50 flex-shrink-0"
            >
              {searching ? '…' : 'Search'}
            </button>
          </div>

          {/* Search results */}
          {searchResults.length > 0 && (
            <div className="mt-2 border border-gray-200 rounded-xl overflow-hidden shadow-lg max-h-48 sm:max-h-60 overflow-y-auto">
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
                    className="w-full text-left px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm text-gray-700 hover:bg-arl-primary/5 border-b border-gray-100 last:border-0 transition">
                    <span className="font-semibold text-arl-primary">{parts[0]}</span>
                    {parts.length > 1 && (
                      <span className="text-gray-400 text-[10px] sm:text-xs block">{parts.slice(1).join(', ')}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {searchError && !searching && (
            <p className="text-[10px] sm:text-xs text-red-500 mt-2 px-1">{searchError}</p>
          )}
          {!searchError && hasSearched && searchResults.length === 0 && !searching && (
            <p className="text-[10px] sm:text-xs text-gray-400 mt-2 px-1">No results. Try a different keyword.</p>
          )}
        </div>
        )}

        {/* Map */}
        <div className="flex-1 relative min-h-0" style={{ minHeight: '320px' }}>
          <MapContainer
            center={DEFAULT_COORDS}
            zoom={15}
            minZoom={5}
            maxBounds={PH_BOUNDS}
            maxBoundsViscosity={1.0}
            style={{ height: '100%', width: '100%', minHeight: '320px' }}
            scrollWheelZoom
          >
            <TileLayer
              attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {showBaseArea && Object.entries(baseShapes).map(([kw, geometry]) => (
              <GeoJSON
                key={kw}
                data={geometry}
                interactive={false}
                style={{ color: '#16a34a', weight: 2, fillColor: '#22c55e', fillOpacity: 0.12, dashArray: '4 4' }}
              />
            ))}
            {showCodingZones && Object.entries(codingShapes).map(([city, geometry]) => (
              <GeoJSON
                key={city}
                data={geometry}
                interactive={false}
                style={{ color: '#ea580c', weight: 2, fillColor: '#fb923c', fillOpacity: 0.18, dashArray: '2 6' }}
              />
            ))}
            <MapClickHandler onLocationChange={readOnly ? () => {} : handleLocationChange} />
            {flyTarget && <MapFlyTo coords={flyTarget} />}
            {readOnly
              ? <Marker position={markerPos} />
              : <DraggableMarker position={markerPos} onDrag={handleLocationChange} />}
          </MapContainer>

          {((showBaseArea && Object.keys(baseShapes).length > 0) || (showCodingZones && Object.keys(codingShapes).length > 0)) && (
            <div className="absolute left-2 bottom-2 z-[500] flex flex-col gap-1 rounded-lg bg-white/90 px-2 py-1.5 shadow text-[10px] sm:text-xs text-gray-700">
              {showBaseArea && Object.keys(baseShapes).length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded-sm border border-green-600 bg-green-400/40" /> Base area (fee zone)
                </div>
              )}
              {showCodingZones && Object.keys(codingShapes).length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded-sm border border-orange-600 bg-orange-400/40" /> {codingCarID ? 'Your car is coded here on your booking dates' : 'May coding restriction — checked once car/dates are set'}
                </div>
              )}
            </div>
          )}

          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/60 z-[500]">
              <div className="text-xs sm:text-sm text-arl-primary font-semibold animate-pulse">Getting address…</div>
            </div>
          )}
        </div>

        {/* Selected address + confirm */}
        <div className="px-4 py-3 sm:px-6 sm:py-4 border-t border-gray-100 bg-gray-50">
          <p className="text-[10px] sm:text-xs text-gray-400 mb-1">Selected location:</p>
          <p className={`text-xs sm:text-sm font-semibold mb-2.5 sm:mb-3 line-clamp-2 ${hasSelected ? 'text-arl-dark' : 'text-gray-400 italic'}`}>
            {loading ? 'Getting address…' : (hasSelected ? address : 'Tap the map, drag the pin, or search to choose a location')}
          </p>
          {pickError && (
            <p className="text-[10px] sm:text-xs text-red-500 mb-2.5 sm:mb-3">{pickError}</p>
          )}
          {baseAreaNote}
          {codingZoneNote}
          <div className="flex gap-2 sm:gap-3">
            {readOnly ? (
              <button onClick={onClose}
                className="flex-1 py-2 sm:py-2.5 rounded-xl bg-arl-primary text-white text-xs sm:text-sm font-semibold hover:bg-arl-secondary transition">
                Close
              </button>
            ) : (
              <>
                <button onClick={onClose}
                  className="flex-1 py-2 sm:py-2.5 rounded-xl border-2 border-gray-200 text-gray-500 text-xs sm:text-sm font-semibold hover:border-gray-300 transition">
                  Cancel
                </button>
                <button onClick={handleConfirm} disabled={loading || !hasSelected}
                  className="flex-1 py-2 sm:py-2.5 rounded-xl bg-arl-primary text-white text-xs sm:text-sm font-semibold hover:bg-arl-secondary transition disabled:opacity-50">
                  Use this location
                </button>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default MapPicker;