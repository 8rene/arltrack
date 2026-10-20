import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

// -----------------------------------------------------------------------------
// DriverArrival.jsx
//
// The temporary "your driver is on the way" page. The notification the driver's "On my way" tap sends opens it.
// It shows the car, its plate number and which driver is coming. It does NOT show a live position (customers never
// see one, and the car isn't tracked before pickup).
//
// The server decides everything: the page exists only while the driver is en route and the booking is still upcoming.
// It refreshes itself every ~12 seconds, so it closes on its own once the pickup starts.
//
// URL: /booking/:bookingID/arrival
// -----------------------------------------------------------------------------

const API = process.env.REACT_APP_API_URL;
const POLL_MS = 12000;

const fmtTime = (iso) =>
  iso ? new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }) : "";

// Defined outside the component on purpose: a component created inside would remount (and reload the photo) on every refresh.
const Shell = ({ children }) => (
  <div className="min-h-screen bg-gray-50 pt-24 pb-16">
    <div className="max-w-md mx-auto px-4 sm:px-6 space-y-4">{children}</div>
  </div>
);

export default function DriverArrival() {
  const { bookingID } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState("loading"); // loading | ready | not_on_the_way | closed | error
  const [data, setData]   = useState(null);
  const [message, setMessage] = useState("");
  const timer = useRef(null);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const token = localStorage.getItem("arl_token");
        const res  = await fetch(`${API}/bookings/${bookingID}/arrival`, { headers: { Authorization: `Bearer ${token}` } });
        const json = await res.json().catch(() => ({}));
        if (!alive) return;
        if (res.ok) {
          setData(json);
          setState("ready");
          timer.current = setTimeout(load, POLL_MS);
          return;
        }
        setMessage(json.message || "");
        if (json.reason === "closed") setState("closed");
        else if (json.reason === "not_on_the_way") { setState("not_on_the_way"); timer.current = setTimeout(load, POLL_MS); }
        else setState("error");
      } catch {
        if (!alive) return;
        setState("error");
        setMessage("Couldn't reach the server. Check your connection and try again.");
      }
    };

    load();
    return () => { alive = false; clearTimeout(timer.current); };
  }, [bookingID]);

  const goDetails = () => navigate(`/booking/${bookingID}/details`);

  if (state === "loading") {
    return (
      <Shell>
        <div className="animate-pulse space-y-4">
          <div className="h-48 bg-gray-200 rounded-2xl" />
          <div className="h-24 bg-gray-200 rounded-2xl" />
        </div>
      </Shell>
    );
  }

  if (state !== "ready") {
    const title = state === "not_on_the_way" ? "Your driver hasn't left yet"
                : state === "closed"         ? "This page has closed"
                :                              "Something went wrong";
    const text  = state === "closed" ? "Your driver has already reached you, so this page is no longer available."
                : message || "Please try again in a moment.";
    return (
      <Shell>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
          <p className="text-lg font-black text-arl-primary">{title}</p>
          <p className="text-sm text-gray-500 mt-2">{text}</p>
          <button onClick={goDetails} className="mt-5 px-5 py-2 rounded-xl bg-arl-primary text-white text-sm font-semibold">
            View booking details
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="bg-green-50 px-5 py-4 border-b border-green-100">
          <p className="text-xs font-black text-green-700 uppercase tracking-widest">On the way</p>
          <p className="text-base font-bold text-arl-primary mt-1">
            {data.driverFirstName || "Your driver"} is heading to your pickup location
          </p>
          {data.enRouteAt && <p className="text-xs text-gray-500 mt-0.5">Left at {fmtTime(data.enRouteAt)}</p>}
        </div>

        {data.carImage && (
          <img src={data.carImage} alt={data.carName} className="w-full h-48 object-cover bg-gray-100" />
        )}

        <div className="p-5 space-y-4">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider">Car</p>
            <p className="text-lg font-black text-arl-primary">{data.carName}</p>
          </div>

          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wider">Plate number</p>
            <p className="inline-block mt-1 px-3 py-1.5 rounded-lg border-2 border-gray-800 font-mono font-black text-xl tracking-widest text-gray-900">
              {data.plateNumber || "—"}
            </p>
          </div>

          {data.pickupAddress && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider">Pickup location</p>
              <p className="text-sm text-gray-700">{data.pickupAddress}</p>
            </div>
          )}

          <p className="text-xs text-gray-400">
            Please check the plate number before you get in. This page updates by itself and closes once your trip starts.
          </p>
        </div>
      </div>

      <button onClick={goDetails} className="w-full px-5 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-arl-primary">
        View booking details
      </button>
    </Shell>
  );
}