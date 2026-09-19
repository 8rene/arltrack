import { useState, useCallback, useEffect, useRef } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { getRedirectResult, signOut as firebaseSignOut } from "firebase/auth";
import { auth } from "./firebase";
import { useToast } from "./context/ToastContext";
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
  const autoLogoutTimer = useRef(null);
  const { showToast } = useToast();

  const handleLogout = useCallback(async (auto = false) => {
    if (autoLogoutTimer.current) {
      clearTimeout(autoLogoutTimer.current);
      autoLogoutTimer.current = null;
    }

    // Close out the userLogs entry on the backend — fire before clearing
    // the token, since the token is what authorizes this call. A failure
    // here should never block the user from actually logging out locally.
    const token = localStorage.getItem("arl_token");
    if (token) {
      try {
        await fetch(`${process.env.REACT_APP_API_URL}/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (err) {
        console.error("Logout logging failed:", err);
      }
    }

    setUser(null);
    setUserDetails(null);
    localStorage.removeItem("arl_token");

    if (auto) {
      alert("Your session has expired. Please log in again.");
    }
  }, []);

  // Schedules an automatic logout for the exact moment the current JWT
  // expires (a couple seconds early, so the logout call itself still
  // goes out with a technically-valid token).
  const scheduleAutoLogout = useCallback((token) => {
    if (autoLogoutTimer.current) {
      clearTimeout(autoLogoutTimer.current);
      autoLogoutTimer.current = null;
    }

    const decoded = decodeJWT(token);
    if (!decoded?.exp) return;

    const msUntilExpiry = decoded.exp * 1000 - Date.now() - 2000;
    if (msUntilExpiry <= 0) return; // already expired — handled elsewhere

    // setTimeout has a ~24.8 day max delay; our tokens are issued with a 1d
    // expiry (see login.controller.js / google.controller.js), so this is
    // fine. (msUntilExpiry is derived from decoded.exp on the real token,
    // not a hardcoded lifetime, so this comment is just documentation —
    // not something the logic depends on.)
    autoLogoutTimer.current = setTimeout(() => {
      handleLogout(true);
    }, msUntilExpiry);
  }, [handleLogout]);

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
        scheduleAutoLogout(token);
      } catch (err) {
        console.error("Session restore failed:", err);
      }
    };

    restoreSession();

    // Clear the timer if the App unmounts (page navigation away, HMR, etc.)
    return () => {
      if (autoLogoutTimer.current) clearTimeout(autoLogoutTimer.current);
    };
  }, [scheduleAutoLogout]);

  // Finishes the mobile Google sign-in flow. On mobile, LoginModal calls
  // signInWithRedirect instead of signInWithPopup (popups are unreliable
  // on mobile web), which fully navigates away to Google and back. When
  // the app remounts here after that round trip, getRedirectResult()
  // returns the signed-in Firebase user so we can finish the same
  // backend exchange the desktop popup flow does. If the user never went
  // through a Google redirect, this resolves to null and does nothing.
  useEffect(() => {
    const finishGoogleRedirectLogin = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (!result) return;

        const idToken = await result.user.getIdToken();
        const response = await fetch(`${process.env.REACT_APP_API_URL}/auth/google`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken }),
        });
        const data = await response.json();

        if (!response.ok) {
          await firebaseSignOut(auth).catch(() => {});
          showToast(data.message || "Google login failed. Please try again.");
          return;
        }

        localStorage.setItem("arl_token", data.token);
        handleLogin(data.user);
      } catch (err) {
        console.error("Google redirect login failed:", err);
        await firebaseSignOut(auth).catch(() => {});
        showToast("Google login failed. Please try again.");
      }
    };

    finishGoogleRedirectLogin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (token) scheduleAutoLogout(token);
  }, [scheduleAutoLogout]);

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
