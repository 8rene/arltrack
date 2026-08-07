import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import VehicleCard from "./VehicleCard";

// Skeleton card while loading
const SkeletonCard = () => (
  <div className="rounded-3xl border border-gray-100 bg-white shadow-md overflow-hidden animate-pulse">
    <div className="w-full h-32 sm:h-52 bg-gray-200" />
    <div className="p-3 sm:p-5 space-y-2 sm:space-y-3">
      <div className="h-4 sm:h-5 bg-gray-200 rounded w-2/3" />
      <div className="flex gap-1.5 sm:gap-2">
        <div className="h-3 sm:h-4 bg-gray-100 rounded-full w-12 sm:w-16" />
        <div className="h-3 sm:h-4 bg-gray-100 rounded-full w-16 sm:w-20" />
        <div className="h-3 sm:h-4 bg-gray-100 rounded-full w-10 sm:w-14" />
      </div>
      <div className="hidden sm:block h-4 bg-gray-100 rounded w-full" />
      <div className="h-9 sm:h-10 bg-gray-200 rounded-xl w-full mt-2" />
    </div>
  </div>
);

// Reusable sub-section
const CarSubSection = ({ title, subtitle, badge, cars, loading, error }) => (
  <div>
    {/* Sub-heading */}
    <div className="mb-5 sm:mb-10 text-center">
      <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.2em] sm:tracking-[0.3em] text-arl-cta mb-1.5 sm:mb-2">
        {subtitle}
      </p>
      <h3 className="font-display text-xl sm:text-3xl md:text-4xl font-bold text-arl-primary tracking-tight">
        {title}
      </h3>
    </div>

    {/* Cards */}
    {error ? (
      <p className="text-center text-red-400 text-sm">{error}</p>
    ) : (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-8">
        {loading
          ? [0, 1, 2].map((i) => <SkeletonCard key={i} />)
          : cars.map((car) => (
              <VehicleCard key={car.carID} car={car} badge={badge} />
            ))}
      </div>
    )}
  </div>
);

const VehiclesSection = () => {
  const navigate = useNavigate();
  const [mostReviewed, setMostReviewed] = useState([]);
  const [mostBooked,   setMostBooked]   = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");

  useEffect(() => {
    const fetchFeaturedCars = async () => {
      try {
        const res = await fetch(`${process.env.REACT_APP_API_URL}/cars/featured`);
        if (!res.ok) throw new Error("Failed to load cars.");
        const data = await res.json();
        setMostReviewed(data.mostReviewed || []);
        setMostBooked(data.mostBooked     || []);
      } catch (err) {
        console.error(err);
        setError("Could not load vehicles. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    fetchFeaturedCars();
  }, []);

  return (
    <section className="relative py-12 sm:py-28 overflow-hidden bg-gradient-to-b from-white via-arl-light to-white">

      {/* Background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-arl-secondary/20 blur-3xl rounded-full pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 space-y-10 sm:space-y-24">

        {/* Section header */}
        <div className="text-center">
          <p className="text-xs sm:text-sm font-semibold uppercase tracking-[0.2em] sm:tracking-[0.3em] text-arl-cta mb-2 sm:mb-4">
            Our Fleet
          </p>
          <h2 className="font-display text-3xl sm:text-5xl md:text-6xl font-bold text-arl-primary leading-tight tracking-tight">
            Drive in Comfort <br />
            <span className="text-arl-cta">Travel in Style</span>
          </h2>
          <p className="mt-3 sm:mt-5 text-gray-500 text-sm sm:text-lg max-w-2xl mx-auto leading-relaxed">
            Explore our modern, well-maintained fleet designed for solo trips,
            family adventures, airport transfers, and business travel.
          </p>
        </div>

        {/* ── Most Reviewed ── */}
        <CarSubSection
          title="Most Reviewed"
          subtitle="Customer Favorites"
          badge="⭐ Top Rated"
          cars={mostReviewed}
          loading={loading}
          error={error}
        />

        {/* Divider */}
        {!loading && !error && (
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-gray-400 text-xs sm:text-sm font-medium whitespace-nowrap">Also Popular</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
        )}

        {/* ── Most Booked ── */}
        <CarSubSection
          title="Most Booked"
          subtitle="Highly In Demand"
          badge="🔥 Most Booked"
          cars={mostBooked}
          loading={loading}
          error={error}
        />

        {/* CTA */}
        {!loading && !error && (
          <div className="text-center">
            <button
              onClick={() => navigate("/vehicles")}
              className="group inline-flex items-center gap-2 px-5 sm:px-8 py-2.5 sm:py-4 rounded-full bg-arl-cta hover:bg-arl-secondary text-white text-sm sm:text-base font-semibold shadow-lg hover:shadow-2xl hover:-translate-y-1 transition-all duration-300"
            >
              View All Vehicles
              <span className="group-hover:translate-x-1 transition-transform duration-300">→</span>
            </button>
          </div>
        )}

      </div>
    </section>
  );
};

export default VehiclesSection;
