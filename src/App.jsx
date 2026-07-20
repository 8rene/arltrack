import { useState, useCallback, useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "./components/NavBar";
import Booking from "./pages/Booking";
import ProfilePage from "./pages/ProfilePage";
import MyBookings from "./pages/MyBookings";
import BookingDetailsPage from "./pages/BookingDetails";
import MyReviews  from "./pages/MyReviews";
import TermsPage  from "./pages/TermsPage";
import PrivacyPage from "./pages/PrivacyPage";
import BookingGuidelinesPage from "./pages/BookingGuidelinesPage";
import ServiceSection from "./components/shared/ServiceSection";
import WhySection from "./components/shared/WhySection";
import VehiclesSection from "./components/shared/VehiclesSection";
import Footer from "./components/layout/Footer";
import Hero from "./components/shared/Hero";
import VehicleShowroom from "./pages/VehicleShowroom";
import PaymentReturn from "./pages/PaymentReturn"; // ← NEW

function Home() {
  return (
    <div className="bg-arl-light text-arl-dark">
      <Hero />
      <ServiceSection />
      <WhySection />
      <VehiclesSection />
      <Footer />
    </div>
  );
}

const decodeJWT = (token) => {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
};

function App() {
  const [user,        setUser]        = useState(null);
  const [userDetails, setUserDetails] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("arl_token");
    if (!token) return;

    const decoded = decodeJWT(token);
    if (!decoded || !decoded.userID) return;

    if (decoded.exp && decoded.exp * 1000 < Date.now()) {
      localStorage.removeItem("arl_token");
      return;
    }

    const restoreSession = async () => {
      try {
        const res = await fetch(
          `${process.env.REACT_APP_API_URL}/user/details/${decoded.userID}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok) {
          localStorage.removeItem("arl_token");
          return;
        }
        const details = await res.json();
        setUser({
          userID:       decoded.userID,
          email:        decoded.email        || "",
          roleID:       decoded.roleID       || "",
          username:     decoded.username     || "",
          profileImage: details.profileImage || "",
          isVerified:   details.isVerified   || false,
        });
        setUserDetails(details);
      } catch (err) {
        console.error("Session restore failed:", err);
      }
    };

    restoreSession();
  }, []);

  const handleLogin = useCallback(async (loginData) => {
    setUser(loginData);
    const token = localStorage.getItem("arl_token");
    try {
      const res = await fetch(
        `${process.env.REACT_APP_API_URL}/user/details/${loginData.userID}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const details = await res.json();
        setUserDetails(details);
      }
    } catch (err) {
      console.error("Failed to fetch user details:", err);
    }
  }, []);

  const handleLogout = useCallback(() => {
    setUser(null);
    setUserDetails(null);
    localStorage.removeItem("arl_token");
  }, []);

  const handleUserDetailsUpdate = useCallback((updated) => {
    setUserDetails(updated);
  }, []);

  return (
    <BrowserRouter>
      <Navbar
        user={user}
        userDetails={userDetails}
        onLogin={handleLogin}
        onLogout={handleLogout}
      />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/booking" element={
          <Booking
            user={user}
            userDetails={userDetails}
            onUserDetailsUpdate={handleUserDetailsUpdate}
          />
        } />
        <Route path="/vehicles"    element={<VehicleShowroom />} />
        <Route path="/profile"     element={<ProfilePage user={user} />} />
        <Route path="/my-bookings" element={<MyBookings  user={user} />} />
        <Route path="/booking/:bookingID/details" element={<BookingDetailsPage />} />
        <Route path="/my-reviews"  element={<MyReviews   user={user} />} />
        <Route path="/terms"        element={<TermsPage />} />
        <Route path="/privacy"      element={<PrivacyPage />} />
        <Route path="/booking-guidelines" element={<BookingGuidelinesPage />} />
        <Route path="/payment-return" element={<PaymentReturn />} /> {/* ← NEW */}
      </Routes>
    </BrowserRouter>
  );
}

export default App;