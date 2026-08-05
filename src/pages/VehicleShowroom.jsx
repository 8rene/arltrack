import { useState, useEffect, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { ViewDetailsModal } from "../components/shared/VehicleCard";

// ── Skeleton card ─────────────────────────────────────────────
const SkeletonCard = () => (
  <div className="rounded-3xl bg-white border border-gray-100 shadow-md overflow-hidden animate-pulse">
    <div className="w-full h-52 bg-gray-200" />
    <div className="p-6 space-y-3">
      <div className="h-5 bg-gray-200 rounded w-1/2" />
      <div className="h-3 bg-gray-100 rounded w-1/3" />
      <div className="h-3 bg-gray-100 rounded w-full" />
      <div className="flex gap-2 mt-2">
        <div className="h-6 bg-gray-100 rounded-full w-20" />
        <div className="h-6 bg-gray-100 rounded-full w-24" />
      </div>
      <div className="flex justify-between items-center pt-3 border-t border-gray-100">
        <div className="h-5 bg-gray-100 rounded w-24" />
        <div className="h-8 bg-gray-200 rounded-full w-20" />
      </div>
    </div>
  </div>
);

// ── Car card ──────────────────────────────────────────────────
const CarCard = ({ car, heroState }) => {
  const [showModal, setShowModal] = useState(false);

  const {
    carID,
    name            = "",
    brandName       = "",
    modelName       = "",
    bodyType        = "",
    color           = "",
    fuelType        = "",
    transmission    = "",
    seatingCapacity = 0,
    shortDescription = "",
    imageURL        = "",
    pricing         = [],
    status          = "",
  } = car;

  const tags = [
    bodyType,
    seatingCapacity ? `${seatingCapacity} Seater` : "",
    fuelType,
    transmission,
    color,
  ].filter(Boolean);

  const isAvailable = status.toLowerCase() === "active" || status.toLowerCase() === "available";

  return (
    <>
      {showModal && (
        <ViewDetailsModal car={car} onClose={() => setShowModal(false)} />
      )}
      <div className="group bg-white rounded-3xl shadow-md hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 overflow-hidden border border-gray-100 flex flex-col">

      {/* Image */}
      <div className="relative overflow-hidden">
        {imageURL ? (
          <img
            src={imageURL}
            alt={name}
            className="w-full h-52 object-cover group-hover:scale-105 transition-transform duration-700"
            onError={(e) => {
              e.target.style.display = "none";
              e.target.nextSibling.style.display = "flex";
            }}
          />
        ) : null}
        <div
          className="w-full h-52 bg-gray-100 items-center justify-center text-5xl text-gray-300"
          style={{ display: imageURL ? "none" : "flex" }}
        >
          🚗
        </div>

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

        {/* Status badge */}
        <span className={`absolute top-3 left-3 text-white text-xs font-bold px-3 py-1 rounded-full shadow ${
          isAvailable ? "bg-green-500" : "bg-gray-500"
        }`}>
          {status || "Available"}
        </span>

        {/* Brand watermark */}
        <span className="absolute bottom-3 right-4 text-white/70 text-xs font-black tracking-widest uppercase">
          {brandName}
        </span>
      </div>

      {/* Content */}
      <div className="p-6 flex flex-col flex-1">
        <h3 className="text-2xl font-black text-arl-primary tracking-tight">{name}</h3>
        <p className="text-xs text-arl-secondary font-semibold mt-1 uppercase tracking-wide">{bodyType}</p>

        {shortDescription && (
          <p className="text-sm text-gray-500 mt-3 leading-relaxed">{shortDescription}</p>
        )}

        {/* Tags */}
        <div className="mt-4 flex gap-2 flex-wrap">
          {tags.map((tag, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-600 text-xs font-semibold px-3 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-arl-secondary inline-block" />
              {tag}
            </span>
          ))}
        </div>

        {/* Pricing */}
        {pricing.length > 0 && (
          <div className="mt-4 border-t border-gray-100 pt-4 flex gap-4 flex-wrap">
            {pricing.map((p, i) => (
              <div key={i}>
                <p className="text-xs text-gray-400 font-medium">{p.durationType}</p>
                <p className="font-black text-arl-dark">₱{Number(p.price).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}

        {/* Book + View Details buttons */}
        <div className="mt-auto pt-5 flex gap-2">
          <Link
            to="/booking"
            state={{ vehicleName: name, carID, ...(heroState || {}) }}
            className="flex-1 text-center bg-arl-cta text-white px-5 py-2.5 rounded-full text-sm font-bold hover:bg-arl-primary transition-all duration-300 shadow-md hover:shadow-lg"
          >
            Book →
          </Link>
          <button
            onClick={() => setShowModal(true)}
            className="flex-1 text-center bg-white border border-gray-200 text-arl-primary px-5 py-2.5 rounded-full text-sm font-bold hover:border-arl-primary hover:bg-gray-50 transition-all duration-300"
          >
            View Details
          </button>
        </div>
      </div>
    </div>
    </>
  );
};

// ── Filter pill ───────────────────────────────────────────────
const FilterPill = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 rounded-full text-sm font-semibold border transition-all ${
      active
        ? "bg-arl-primary text-white border-arl-primary shadow"
        : "bg-white text-gray-600 border-gray-200 hover:border-arl-primary hover:text-arl-primary"
    }`}
  >
    {label}
  </button>
);

// ── Main page ─────────────────────────────────────────────────
const VehicleShowroom = () => {
  const location  = useLocation();
  const heroState = location.state || null; // passed from Hero form

  const [cars,    setCars]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  // Filter state
  const [search,       setSearch]       = useState("");
  const [filterBody,   setFilterBody]   = useState("All");
  const [filterFuel,   setFilterFuel]   = useState("All");
  const [filterTrans,  setFilterTrans]  = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [sortBy,       setSortBy]       = useState("name");

  useEffect(() => {
    const fetchCars = async () => {
      try {
        const res = await fetch(`${process.env.REACT_APP_API_URL}/cars/all`);
        if (!res.ok) throw new Error("Failed to fetch cars");
        const data = await res.json();
        setCars(data);
      } catch (err) {
        console.error(err);
        setError("Could not load vehicles. Please try again later.");
      } finally {
        setLoading(false);
      }
    };
    fetchCars();
  }, []);

  // Derive unique filter options from data
  const bodyTypes  = useMemo(() => ["All", ...new Set(cars.map((c) => c.bodyType).filter(Boolean))].sort(), [cars]);
  const fuelTypes  = useMemo(() => ["All", ...new Set(cars.map((c) => c.fuelType).filter(Boolean))].sort(), [cars]);
  const transTypes = useMemo(() => ["All", ...new Set(cars.map((c) => c.transmission).filter(Boolean))].sort(), [cars]);
  const statuses   = ["All", "Active", "Rented", "Maintenance"];

  // Filtered + sorted cars
  const displayed = useMemo(() => {
    let result = [...cars];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        c.brandName.toLowerCase().includes(q) ||
        c.modelName.toLowerCase().includes(q) ||
        c.bodyType.toLowerCase().includes(q)
      );
    }
    if (filterBody   !== "All") result = result.filter((c) => c.bodyType    === filterBody);
    if (filterFuel   !== "All") result = result.filter((c) => c.fuelType    === filterFuel);
    if (filterTrans  !== "All") result = result.filter((c) => c.transmission === filterTrans);
    if (filterStatus !== "All") result = result.filter((c) => c.status       === filterStatus);

    result.sort((a, b) => {
      if (sortBy === "name")         return a.name.localeCompare(b.name);
      if (sortBy === "price_asc")    return (a.startingPrice || 0) - (b.startingPrice || 0);
      if (sortBy === "price_desc")   return (b.startingPrice || 0) - (a.startingPrice || 0);
      if (sortBy === "seats")        return b.seatingCapacity - a.seatingCapacity;
      return 0;
    });

    return result;
  }, [cars, search, filterBody, filterFuel, filterTrans, filterStatus, sortBy]);

  const clearFilters = () => {
    setSearch(""); setFilterBody("All"); setFilterFuel("All");
    setFilterTrans("All"); setFilterStatus("All"); setSortBy("name");
  };

  const hasFilters = search || filterBody !== "All" || filterFuel !== "All" ||
    filterTrans !== "All" || filterStatus !== "All" || sortBy !== "name";

  return (
    <section className="relative pt-28 pb-24 bg-gray-50 overflow-hidden min-h-screen">

      {/* Decorative blobs */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-arl-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-arl-secondary/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-6">

        {/* ── Header ── */}
        <div className="text-center mb-12">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-arl-cta mb-3">
            Our Fleet
          </p>
          <h1 className="text-5xl font-display font-black text-arl-primary leading-tight">
            Car Showroom
          </h1>
          <p className="mt-4 text-gray-500 text-lg max-w-xl mx-auto">
            Browse our full fleet. Every car is well-maintained and ready for your next ride.
          </p>
          <div className="flex items-center justify-center gap-3 mt-6">
            <div className="h-px w-16 bg-arl-secondary/40" />
            <div className="w-2 h-2 rounded-full bg-arl-cta" />
            <div className="h-px w-16 bg-arl-secondary/40" />
          </div>
        </div>

        {/* ── Search + Sort bar ── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6 flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
            <input
              type="text"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-arl-secondary text-sm"
              placeholder="Search by brand, model, type…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Sort */}
          <select
            className="px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-arl-secondary text-sm bg-white text-gray-600 font-medium"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="name">Sort: A–Z</option>
            <option value="price_asc">Sort: Price ↑</option>
            <option value="price_desc">Sort: Price ↓</option>
            <option value="seats">Sort: Most Seats</option>
          </select>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="px-4 py-2.5 rounded-xl border border-red-200 text-red-500 text-sm font-semibold hover:bg-red-50 transition"
            >
              ✕ Clear
            </button>
          )}
        </div>

        {/* ── Filter pills ── */}
        {!loading && !error && (
          <div className="space-y-3 mb-8">
            {/* Body type */}
            <div className="flex gap-2 flex-wrap items-center">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide w-20">Type</span>
              {bodyTypes.map((t) => (
                <FilterPill key={t} label={t} active={filterBody === t} onClick={() => setFilterBody(t)} />
              ))}
            </div>

            {/* Fuel */}
            <div className="flex gap-2 flex-wrap items-center">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide w-20">Fuel</span>
              {fuelTypes.map((t) => (
                <FilterPill key={t} label={t} active={filterFuel === t} onClick={() => setFilterFuel(t)} />
              ))}
            </div>

            {/* Transmission */}
            <div className="flex gap-2 flex-wrap items-center">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide w-20">Trans.</span>
              {transTypes.map((t) => (
                <FilterPill key={t} label={t} active={filterTrans === t} onClick={() => setFilterTrans(t)} />
              ))}
            </div>

            {/* Status */}
            <div className="flex gap-2 flex-wrap items-center">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide w-20">Status</span>
              {statuses.map((t) => (
                <FilterPill key={t} label={t} active={filterStatus === t} onClick={() => setFilterStatus(t)} />
              ))}
            </div>
          </div>
        )}

        {/* ── Results count ── */}
        {!loading && !error && (
          <p className="text-sm text-gray-400 mb-6">
            Showing <span className="font-semibold text-arl-primary">{displayed.length}</span> of{" "}
            <span className="font-semibold">{cars.length}</span> vehicles
          </p>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="text-center py-20">
            <p className="text-4xl mb-4">🚗</p>
            <p className="text-red-400 font-semibold">{error}</p>
          </div>
        )}

        {/* ── Grid ── */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
            : displayed.length > 0
            ? displayed.map((car) => <CarCard key={car.carID} car={car} heroState={heroState} />)
            : (
              <div className="col-span-3 text-center py-20">
                <p className="text-4xl mb-4">🔍</p>
                <p className="text-gray-400 font-semibold">No vehicles match your filters.</p>
                <button onClick={clearFilters} className="mt-4 text-arl-secondary font-semibold hover:underline text-sm">
                  Clear all filters
                </button>
              </div>
            )
          }
        </div>

      </div>
    </section>
  );
};

export default VehicleShowroom;
