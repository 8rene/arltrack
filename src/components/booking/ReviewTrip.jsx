import { Component, useState } from "react";
import ReviewModal from "./ReviewModal";

// The app has no error boundary, so an error thrown while drawing the review dialog used to blank the WHOLE page.
// This keeps a problem in the dialog inside the dialog: the page stays, the customer gets a message and a Close
// button, and the real error is written to the browser console (F12) so it can be found and fixed.
class DialogBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error("Review dialog failed to render:", error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={this.props.onClose}>
        <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm text-center" onClick={(e) => e.stopPropagation()}>
          <p className="font-black text-arl-primary mb-1">Couldn't open the review form</p>
          <p className="text-sm text-gray-500 mb-4">Please refresh the page and try again.</p>
          <button onClick={this.props.onClose} className="px-5 py-2 rounded-xl bg-arl-primary text-white text-sm font-bold">Close</button>
        </div>
      </div>
    );
  }
}

// The "Write a Review" entry point for one booking. It only shows for a COMPLETED booking:
//   - not reviewed yet  -> a "Write a Review" button that opens the review dialog
//   - already reviewed  -> a quiet "Reviewed" note (a review can't be edited)
// variant "chip" is the small button in a booking card's action row; "card" is the larger block on Booking Details.
export default function ReviewTrip({ booking, userID, reviewed, onReviewed, variant = "chip" }) {
  const [open, setOpen] = useState(false);
  if (String(booking?.status || "").toLowerCase() !== "completed") return null;

  const modal = open && (
    <DialogBoundary onClose={() => setOpen(false)}>
      <ReviewModal
        booking={booking}
        userID={userID}
        onClose={() => setOpen(false)}
        onSaved={() => onReviewed && onReviewed(booking.bookingID)}
      />
    </DialogBoundary>
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
