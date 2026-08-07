import { useState } from "react";

// ── Date formatter ────────────────────────────────────────────
const fmtDT = (val) => {
  if (!val) return "—";
  if (val?.toDate) return val.toDate().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  if (val?._seconds !== undefined) return new Date(val._seconds * 1000).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const d = new Date(val);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

// ── Star renderer ─────────────────────────────────────────────
const Stars = ({ rating, size = "text-sm" }) => (
  <span className={size}>
    {[1, 2, 3, 4, 5].map((s) => (
      <span key={s} className={s <= rating ? "text-yellow-400" : "text-gray-200"}>★</span>
    ))}
  </span>
);





// ── View Details Modal ────────────────────────────────────────
const ViewDetailsModal = ({ car, onClose }) => {
  const [loading, setLoading]   = useState(true);
  const [data, setData]         = useState(null);
  const [filterStar, setFilterStar] = useState(0);
  const [activeTab, setActiveTab] = useState("details");

  const REVIEWS_PAGE_SIZE = 10;
  const [visibleCount, setVisibleCount] = useState(REVIEWS_PAGE_SIZE);

  // Fetch on first render
  const [fetched, setFetched] = useState(false);
  if (!fetched) {
    setFetched(true);
    fetch(`${process.env.REACT_APP_API_URL}/cars/${car.carID}/details`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((json) => { setData(json); setLoading(false); })
      .catch(() => { setData({ error: true }); setLoading(false); });
  }

  const allReviews = data?.reviews || [];

  const filteredReviews = filterStar === 0
    ? allReviews
    : allReviews.filter((r) => r.rating === filterStar);

  const starCounts = [5, 4, 3, 2, 1].map((s) => ({
    star: s,
    count: allReviews.filter((r) => r.rating === s).length,
  }));
  const avgRating = allReviews.length
    ? (allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length).toFixed(1)
    : "—";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-4 p-6 border-b border-gray-100">
          <div className="w-20 h-16 rounded-2xl overflow-hidden bg-gray-100 flex-shrink-0">
            {car.imageURL
              ? <img src={car.imageURL} alt={car.name} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-2xl text-gray-300">🚗</div>
            }
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-black text-arl-primary truncate">{car.name}</h2>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mt-0.5">{car.bodyType}</p>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-xs text-gray-500">⭐ {allReviews.length} reviews</span>
              {car.startingPrice && (
                <span className="text-xs font-bold text-arl-cta">₱{Number(car.startingPrice).toLocaleString()} / {car.durationType}</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition flex-shrink-0 text-lg"
          >✕</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-6">
          <button
            onClick={() => setActiveTab("details")}
            className={`py-3 px-4 text-sm font-bold border-b-2 -mb-px transition ${
              activeTab === "details" ? "border-arl-cta text-arl-cta" : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            Details
          </button>
          <button
            onClick={() => setActiveTab("reviews")}
            className={`py-3 px-4 text-sm font-bold border-b-2 -mb-px transition ${
              activeTab === "reviews" ? "border-arl-cta text-arl-cta" : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            Reviews ({allReviews.length})
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">

          {loading && (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-arl-secondary border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && data?.error && (
            <p className="text-center text-red-400 py-12 text-sm">Failed to load details.</p>
          )}

          {/* DETAILS */}
          {!loading && !data?.error && activeTab === "details" && (
            <div className="p-6 space-y-6">
              {car.longDescription ? (
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2">About this vehicle</h3>
                  <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{car.longDescription}</p>
                </div>
              ) : car.shortDescription ? (
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2">About this vehicle</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{car.shortDescription}</p>
                </div>
              ) : null}

              <div>
                <h3 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3">Specifications</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {car.bodyType && (
                    <div>
                      <p className="text-xs text-gray-400">Body Type</p>
                      <p className="text-sm font-semibold text-gray-700">{car.bodyType}</p>
                    </div>
                  )}
                  {!!car.seatingCapacity && (
                    <div>
                      <p className="text-xs text-gray-400">Seats</p>
                      <p className="text-sm font-semibold text-gray-700">{car.seatingCapacity}</p>
                    </div>
                  )}
                  {car.fuelType && (
                    <div>
                      <p className="text-xs text-gray-400">Fuel Type</p>
                      <p className="text-sm font-semibold text-gray-700">{car.fuelType}</p>
                    </div>
                  )}
                  {car.transmission && (
                    <div>
                      <p className="text-xs text-gray-400">Transmission</p>
                      <p className="text-sm font-semibold text-gray-700">{car.transmission}</p>
                    </div>
                  )}
                  {car.color && (
                    <div>
                      <p className="text-xs text-gray-400">Color</p>
                      <p className="text-sm font-semibold text-gray-700">{car.color}</p>
                    </div>
                  )}
                  {car.year && (
                    <div>
                      <p className="text-xs text-gray-400">Year</p>
                      <p className="text-sm font-semibold text-gray-700">{car.year}</p>
                    </div>
                  )}
                </div>
              </div>

              {car.pricing?.length > 0 && (
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-3">Pricing</h3>
                  <div className="flex gap-4 flex-wrap">
                    {car.pricing.map((p, i) => (
                      <div key={i} className="bg-gray-50 rounded-xl px-4 py-2 text-center">
                        <p className="text-xs text-gray-400">{p.durationType}</p>
                        <p className="text-sm font-black text-arl-dark">₱{Number(p.price).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* REVIEWS */}
          {!loading && !data?.error && activeTab === "reviews" && (
            <div className="p-6">
              <div className="flex items-center gap-6 mb-6 p-4 bg-gray-50 rounded-2xl">
                <div className="text-center flex-shrink-0">
                  <p className="text-5xl font-black text-arl-primary">{avgRating}</p>
                  <Stars rating={Math.round(parseFloat(avgRating))} size="text-lg" />
                  <p className="text-xs text-gray-400 mt-1">{allReviews.length} reviews</p>
                </div>
                <div className="flex-1 space-y-1.5">
                  {starCounts.map(({ star, count }) => (
                    <div key={star} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-4 text-right">{star}</span>
                      <span className="text-yellow-400 text-xs">★</span>
                      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-yellow-400 rounded-full"
                          style={{ width: allReviews.length ? `${(count / allReviews.length) * 100}%` : "0%" }}
                        />
                      </div>
                      <span className="text-xs text-gray-400 w-6">{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Star filter */}
              <div className="flex gap-2 flex-wrap mb-4">
                <button
                  onClick={() => { setFilterStar(0); setVisibleCount(REVIEWS_PAGE_SIZE); }}
                  className={`px-3 py-1 rounded-full text-xs font-bold border transition ${
                    filterStar === 0 ? "bg-arl-primary text-white border-arl-primary" : "bg-white text-gray-600 border-gray-200 hover:border-arl-primary"
                  }`}
                >All</button>
                {[5, 4, 3, 2, 1].map((s) => (
                  <button
                    key={s}
                    onClick={() => { setFilterStar(filterStar === s ? 0 : s); setVisibleCount(REVIEWS_PAGE_SIZE); }}
                    className={`px-3 py-1 rounded-full text-xs font-bold border transition flex items-center gap-1 ${
                      filterStar === s ? "bg-yellow-400 text-white border-yellow-400" : "bg-white text-gray-600 border-gray-200 hover:border-yellow-300"
                    }`}
                  >
                    {s} ★ <span className="opacity-60 font-normal">({starCounts.find(x => x.star === s)?.count || 0})</span>
                  </button>
                ))}
              </div>

              <div className="space-y-4">
                {filteredReviews.length === 0 && (
                  <p className="text-center text-gray-400 text-sm py-8">No reviews for this rating.</p>
                )}
                {filteredReviews.slice(0, visibleCount).map((r) => (
                  <div key={r.reviewID} className="border border-gray-100 rounded-2xl p-4 hover:bg-gray-50 transition">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-arl-secondary/20 flex items-center justify-center text-xs font-black text-arl-primary">
                          {(r.userName || r.userID || "?")[0].toUpperCase()}
                        </div>
                        <span className="text-sm font-semibold text-gray-700">
                          {r.userName || (r.userID ? `User ${r.userID.slice(0, 6)}` : "Anonymous")}
                        </span>
                      </div>
                      <Stars rating={r.rating} />
                    </div>
                    {r.comment && (
                      <p className="text-sm text-gray-600 mt-2 leading-relaxed pl-10">{r.comment}</p>
                    )}
                    {r.createdAt && (
                      <p className="text-xs text-gray-400 mt-1 pl-10">{fmtDT(r.createdAt)}</p>
                    )}
                  </div>
                ))}

                {visibleCount < filteredReviews.length && (
                  <button
                    onClick={() => setVisibleCount((c) => c + REVIEWS_PAGE_SIZE)}
                    className="w-full py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-arl-primary hover:bg-gray-50 transition"
                  >
                    See more ({filteredReviews.length - visibleCount} more)
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Main VehicleCard ──────────────────────────────────────────
const VehicleCard = ({ car, badge }) => {
  const [showModal, setShowModal] = useState(false);

  const {
    name            = "",
    bodyType        = "",
    seatingCapacity = 0,
    fuelType        = "",
    transmission    = "",
    shortDescription = "",
    imageURL        = "",
    startingPrice   = null,
    durationType    = null,
    reviewCount     = 0,
    bookingCount    = 0,
  } = car;

  const tags = [
    bodyType,
    seatingCapacity ? `${seatingCapacity} Seater` : "",
    fuelType,
    transmission,
  ].filter(Boolean);

  return (
    <>
      {showModal && (
        <ViewDetailsModal car={car} onClose={() => setShowModal(false)} />
      )}

      <div className="group relative overflow-hidden rounded-3xl border border-white/20 bg-white/80 backdrop-blur-xl shadow-lg hover:shadow-2xl transition-all duration-500 hover:-translate-y-2">

        <div className="absolute inset-0 bg-gradient-to-br from-arl-secondary/10 via-transparent to-arl-primary/10 opacity-0 group-hover:opacity-100 transition duration-500 pointer-events-none" />

        {badge && (
          <div className="absolute top-2 left-2 sm:top-3 sm:left-3 z-10 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-bold bg-arl-cta text-white shadow-md">
            {badge}
          </div>
        )}

        <div className="relative overflow-hidden rounded-t-3xl bg-gray-100">
          {imageURL ? (
            <img
              src={imageURL}
              alt={name}
              className="w-full h-32 sm:h-52 object-cover transition-transform duration-700 group-hover:scale-110"
              onError={(e) => { e.target.style.display = "none"; }}
            />
          ) : (
            <div className="w-full h-32 sm:h-52 flex items-center justify-center bg-gray-100 text-gray-300 text-3xl sm:text-4xl">🚗</div>
          )}
        </div>

        <div className="relative p-3 sm:p-5">
          <h3 className="text-base sm:text-xl font-bold text-arl-primary tracking-tight mb-2 sm:mb-3">{name}</h3>

          <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-2 sm:mb-4">
            {tags.map((tag, i) => (
              <span key={i} className="px-2 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-xs font-medium rounded-full bg-arl-secondary/10 text-arl-primary border border-arl-secondary/20">
                {tag}
              </span>
            ))}
          </div>

          {shortDescription && (
            <p className="hidden sm:block text-sm text-gray-600 leading-relaxed mb-3">{shortDescription}</p>
          )}

          <div className="flex items-center justify-between text-[10px] sm:text-xs text-gray-400 mb-2 sm:mb-4">
            {reviewCount > 0 && (
              <span className="flex items-center gap-1">⭐ {reviewCount} review{reviewCount !== 1 ? "s" : ""}</span>
            )}
            {bookingCount > 0 && (
              <span className="flex items-center gap-1">📅 {bookingCount} booking{bookingCount !== 1 ? "s" : ""}</span>
            )}
          </div>

          {startingPrice !== null && (
            <p className="text-xs sm:text-sm font-semibold text-arl-cta mb-2 sm:mb-4">
              Starts at ₱{startingPrice.toLocaleString()}{durationType ? ` / ${durationType}` : ""}
            </p>
          )}

          <button
            onClick={() => setShowModal(true)}
            className="w-full rounded-xl bg-arl-secondary hover:bg-arl-primary text-white py-2 sm:py-2.5 text-sm font-medium shadow-lg hover:shadow-2xl transition"
          >
            View Details
          </button>
        </div>
      </div>
    </>
  );
};

export { ViewDetailsModal };
export default VehicleCard;
