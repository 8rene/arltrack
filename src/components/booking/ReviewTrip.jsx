import { useState } from "react";
import ReviewModal from "./ReviewModal";

// The "Write a Review" entry point for one booking. It only shows for a COMPLETED booking:
//   - not reviewed yet  -> a "Write a Review" button that opens the review dialog
//   - already reviewed  -> a quiet "Reviewed" note (a review can't be edited)
// variant "chip" is the small button in a booking card's action row; "card" is the larger block on Booking Details.
export default function ReviewTrip({ booking, userID, reviewed, onReviewed, variant = "chip" }) {
  const [open, setOpen] = useState(false);
  if (String(booking?.status || "").toLowerCase() !== "completed") return null;

  const modal = open && (
    <ReviewModal
      booking={booking}
      userID={userID}
      onClose={() => setOpen(false)}
      onSaved={() => onReviewed && onReviewed(booking.bookingID)}
    />
  );

  if (variant === "card") {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-black text-arl-primary uppercase tracking-widest mb-1">Your Review</p>
          <p className="text-sm text-gray-600">
            {reviewed ? "Thank you! You already reviewed this trip." : "How was your trip? Rate the vehicle and tell others about it."}
          </p>
        </div>
        {!reviewed && (
          <button
            onClick={() => setOpen(true)}
            className="text-sm font-bold bg-yellow-400 hover:bg-yellow-500 text-yellow-950 px-5 py-2 rounded-xl transition"
          >★ Write a Review</button>
        )}
        {modal}
      </div>
    );
  }

  return (
    <>
      {reviewed ? (
        <span className="text-xs font-bold text-gray-400 px-3 py-1.5">★ Reviewed</span>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="text-xs font-bold text-yellow-700 border border-yellow-300 bg-yellow-50 hover:bg-yellow-100 px-3 py-1.5 rounded-lg transition"
        >★ Write a Review</button>
      )}
      {modal}
    </>
  );
}
