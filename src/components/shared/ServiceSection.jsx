import { useState, useEffect } from "react";
import ServiceCard from "./ServiceCard";
import {
  Plane,
  Hotel,
  Briefcase,
  Users,
  MapPinned,
  HeartHandshake,
  Truck,
  Car,
} from "lucide-react";

// Map service type keywords → icon
const getIcon = (serviceType = "") => {
  const s = serviceType.toLowerCase();
  if (s.includes("airport"))                    return <Plane        size={24} strokeWidth={2} />;
  if (s.includes("hotel"))                      return <Hotel        size={24} strokeWidth={2} />;
  if (s.includes("business") || s.includes("personal")) return <Briefcase size={24} strokeWidth={2} />;
  if (s.includes("family") || s.includes("barkada") || s.includes("group")) return <Users size={24} strokeWidth={2} />;
  if (s.includes("tour") || s.includes("provincial") || s.includes("city")) return <MapPinned size={24} strokeWidth={2} />;
  if (s.includes("wedding"))                    return <HeartHandshake size={24} strokeWidth={2} />;
  if (s.includes("move") || s.includes("cargo") || s.includes("delivery"))  return <Truck size={24} strokeWidth={2} />;
  return <Car size={24} strokeWidth={2} />;
};

const ServiceSection = () => {
  const [services, setServices] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");

  useEffect(() => {
    const fetchServices = async () => {
      try {
        const res = await fetch(`${process.env.REACT_APP_API_URL}/services`);
        if (!res.ok) throw new Error("Failed to fetch services");
        const data = await res.json();
        setServices(data);
      } catch (err) {
        console.error(err);
        setError("Could not load services.");
      } finally {
        setLoading(false);
      }
    };

    fetchServices();
  }, []);

  return (
    <section
      id="services"
      className="relative py-10 sm:py-16 bg-gradient-to-b from-white via-arl-light to-white overflow-hidden"
    >
      {/* Glow */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-arl-secondary/10 blur-3xl rounded-full" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
        {/* Label */}
        <p className="text-center text-xs sm:text-sm font-semibold uppercase tracking-[0.2em] sm:tracking-[0.3em] text-arl-cta mb-2 sm:mb-4">
          What We Offer
        </p>

        {/* Heading */}
        <h2 className="font-display text-center text-3xl sm:text-5xl md:text-6xl font-bold text-arl-primary leading-tight tracking-tight">
          Services Built for <br />
          <span className="font-display text-arl-cta">Every Journey</span>
        </h2>

        {/* Subtext */}
        <p className="mt-3 sm:mt-5 text-center text-sm sm:text-lg text-gray-500 max-w-2xl mx-auto leading-relaxed">
          Whether it's airport transfers, family outings, business rides, or
          special occasions — we've got the perfect ride for you.
        </p>

        {/* States */}
        {loading && (
          <div className="mt-8 sm:mt-16 flex justify-center">
            <div className="flex items-center gap-3 text-gray-400 text-sm">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Loading services…
            </div>
          </div>
        )}

        {error && !loading && (
          <p className="mt-8 sm:mt-16 text-center text-red-500 text-sm">{error}</p>
        )}

        {/* Cards */}
        {!loading && !error && services.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 mt-8 sm:mt-16">
            {services.map((service) => (
              <ServiceCard
                key={service.serviceID}
                title={service.serviceType}
                description={getDescription(service.serviceType)}
                vehicles={service.vehicles}
                icon={getIcon(service.serviceType)}
              />
            ))}
          </div>
        )}

        {!loading && !error && services.length === 0 && (
          <p className="mt-8 sm:mt-16 text-center text-gray-400">No services available.</p>
        )}
      </div>
    </section>
  );
};

// Fallback description per service type keyword
const getDescription = (serviceType = "") => {
  const s = serviceType.toLowerCase();
  if (s.includes("airport"))    return "Reliable and punctual rides to and from the airport.";
  if (s.includes("hotel"))      return "Smooth transportation between hotels and airports.";
  if (s.includes("business"))   return "Comfortable rides for meetings, errands, and private travel.";
  if (s.includes("family") || s.includes("barkada")) return "Spacious and fun rides for group adventures.";
  if (s.includes("tour"))       return "Travel around the city or provinces with ease.";
  if (s.includes("wedding"))    return "Elegant and memorable rides for your special day.";
  if (s.includes("move"))       return "Cargo-ready vehicles for moving homes and transporting goods.";
  return "Professional and comfortable transportation service.";
};

export default ServiceSection;
