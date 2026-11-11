// The booking IDs the signed-in customer has already reviewed, so a booking card / details page knows whether to offer
// "Write a Review". Same source the My Reviews page uses (GET /reviews/user/:userID). Never throws: when it can't be
// loaded it returns an empty set (the server still refuses a second review of the same booking).
export const fetchReviewedBookingIDs = async (userID) => {
  const ids = new Set();
  if (!userID) return ids;
  try {
    const token = localStorage.getItem("arl_token");
    const res = await fetch(`${process.env.REACT_APP_API_URL}/reviews/user/${userID}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return ids;
    const data = await res.json();
    (Array.isArray(data) ? data : data.reviews || []).forEach((r) => { if (r.bookingID) ids.add(r.bookingID); });
  } catch { /* leave it empty */ }
  return ids;
};
