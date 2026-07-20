import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import SignUpModal from "./auth/SignUpModal";
import LoginModal from "./auth/LoginModal";

export default function Navbar({ user, userDetails, onLogin, onLogout }) {
  const [scrolled,      setScrolled]      = useState(false);
  const [showSignup,    setShowSignup]    = useState(false);
  const [showLogin,     setShowLogin]     = useState(false);
  const [showDropdown,  setShowDropdown]  = useState(false);

  const location = useLocation();
  const navigate  = useNavigate();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = (id) => {
    const element = document.getElementById(id);
    if (!element) return;
    const top = element.getBoundingClientRect().top + window.pageYOffset - 80;
    window.scrollTo({ top, behavior: "smooth" });
  };

  const handleNavClick = (id) => {
    if (location.pathname !== "/") {
      navigate("/");
      setTimeout(() => scrollToSection(id), 100);
    } else {
      scrollToSection(id);
    }
  };

  // Display name: firstName + lastName if available, else email prefix
  const displayName = userDetails?.firstName && userDetails?.lastName
    ? `${userDetails.firstName} ${userDetails.lastName}`
    : userDetails?.firstName
    ? userDetails.firstName
    : user?.email?.split("@")[0] || "User";

  const avatarLetter = (userDetails?.firstName?.[0] || user?.email?.[0] || "U").toUpperCase();

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-white/20 backdrop-blur-xl shadow-lg border-b border-white/20"
            : "bg-white shadow-md"
        }`}
      >
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between h-16">
          <Link to="/" className="font-display font-black text-5xl tracking-tight text-arl-cta">
            ARL
          </Link>

          <nav className="hidden md:flex items-center gap-10 text-md font-semibold text-arl-dark">
            <Link to="/" className={`transition ${location.pathname === "/" ? "text-arl-cta" : "hover:text-arl-cta"}`}>Home</Link>
            <Link to="/vehicles" className={`transition ${location.pathname === "/vehicles" ? "text-arl-cta" : "hover:text-arl-cta"}`}>Cars</Link>
            <Link to="/booking" className={`transition ${location.pathname === "/booking" ? "text-arl-cta" : "hover:text-arl-cta"}`}>Booking</Link>
            <button onClick={() => handleNavClick("services")} className="hover:text-arl-cta transition">
              Services
            </button>
            <button onClick={() => handleNavClick("footer")} className="hover:text-arl-cta transition">
              Contact
            </button>
          </nav>

          {user ? (
            <div className="relative">
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="flex items-center gap-2 bg-arl-primary text-white text-sm font-semibold px-4 py-2 rounded-full hover:bg-arl-secondary transition-colors"
              >
                {user?.profileImage ? (
                  <img
                    src={user.profileImage}
                    alt={displayName}
                    className="w-7 h-7 rounded-full object-cover flex-shrink-0 border border-white/30"
                  />
                ) : (
                  <span className="w-7 h-7 rounded-full bg-white text-arl-primary font-bold flex items-center justify-center text-xs flex-shrink-0">
                    {avatarLetter}
                  </span>
                )}
                <span className="hidden sm:block max-w-[120px] truncate">{displayName}</span>
              </button>

              {showDropdown && (
                <div
                  className="absolute right-0 mt-2 w-52 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50"
                  onMouseLeave={() => setShowDropdown(false)}
                >
                  {/* User info header */}
                  <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                    <p className="text-xs text-gray-400">Logged in as</p>
                    <p className="text-sm font-bold text-arl-primary truncate">{displayName}</p>
                    <p className="text-xs text-gray-400 truncate">{user.email}</p>
                  </div>

                  <button
                    onClick={() => { setShowDropdown(false); navigate("/profile"); }}
                    className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition"
                  >
                    👤 My Profile
                  </button>
                  <button
                    onClick={() => { setShowDropdown(false); navigate("/my-bookings"); }}
                    className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition"
                  >
                    📅 My Bookings
                  </button>
                  <button
                    onClick={() => { setShowDropdown(false); navigate("/my-reviews"); }}
                    className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition"
                  >
                    ⭐ My Reviews
                  </button>
                  <div className="h-px bg-gray-100" />
                  <button
                    onClick={() => { setShowDropdown(false); onLogout(); }}
                    className="w-full text-left px-4 py-3 text-sm text-red-500 hover:bg-red-50 transition"
                  >
                    🚪 Log Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowLogin(true)}
                className="border-2 border-arl-secondary text-arl-secondary font-bold text-sm px-5 py-2 rounded-full hover:border-arl-primary hover:text-arl-primary transition-colors"
              >
                Login
              </button>
              <button
                onClick={() => setShowSignup(true)}
                className="bg-arl-cta text-white font-bold text-sm px-5 py-2 rounded-full hover:bg-arl-primary transition-colors"
              >
                Sign Up
              </button>
            </div>
          )}
        </div>
      </header>

      {showSignup && (
        <SignUpModal
          onClose={() => setShowSignup(false)}
          onSwitchToLogin={() => { setShowSignup(false); setShowLogin(true); }}
        />
      )}

      {showLogin && (
        <LoginModal
          onLogin={onLogin}
          onClose={() => setShowLogin(false)}
          onSwitchToSignUp={() => { setShowLogin(false); setShowSignup(true); }}
        />
      )}
    </>
  );
}