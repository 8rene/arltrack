import { useState, useRef, useEffect } from "react";

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()\-_=+[\]{};':"\\|,.<>/?]).{8,16}$/;

const ForgotPasswordModal = ({ onClose, onBackToLogin }) => {
  const [step,     setStep]     = useState(1); // 1: email, 2: otp + new password, 3: success
  const [email,    setEmail]    = useState("");
  const [digits,   setDigits]   = useState(["", "", "", "", "", ""]);
  const [newPw,    setNewPw]    = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [timer,    setTimer]    = useState(0);
  const inputs = useRef([]);

  useEffect(() => {
    if (timer === 0) return;
    const id = setInterval(() => setTimer((t) => t - 1), 1000);
    return () => clearInterval(id);
  }, [timer]);

  const handleSendOTP = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), purpose: "reset" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Could not send OTP.");
      if (data.emailSent === false) throw new Error("Could not send OTP email. Please try again.");
      setStep(2);
      setTimer(60);
      setTimeout(() => inputs.current[0]?.focus(), 150);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (timer > 0) return;
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/auth/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), purpose: "reset" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Could not resend OTP.");
      setDigits(["", "", "", "", "", ""]);
      setTimer(60);
      setTimeout(() => inputs.current[0]?.focus(), 150);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDigit = (val, idx) => {
    if (!/^[0-9]?$/.test(val)) return;
    const next = [...digits]; next[idx] = val; setDigits(next); setError("");
    if (val && idx < 5) inputs.current[idx + 1]?.focus();
  };
  const handleKeyDown = (e, idx) => {
    if (e.key === "Backspace" && !digits[idx] && idx > 0) inputs.current[idx - 1]?.focus();
  };
  const handlePaste = (e) => {
    const p = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (p.length === 6) { setDigits(p.split("")); inputs.current[5]?.focus(); }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setError("");

    const otp = digits.join("");
    if (otp.length < 6) { setError("Please enter all 6 digits."); return; }
    if (!PASSWORD_REGEX.test(newPw)) {
      setError("Password must be 8–16 characters with at least 1 uppercase, 1 lowercase, 1 number, and 1 special character.");
      return;
    }
    if (newPw !== confirmPw) { setError("Passwords do not match."); return; }

    setLoading(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), otp, newPassword: newPw }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDigits(["", "", "", "", "", ""]);
        setTimeout(() => inputs.current[0]?.focus(), 50);
        throw new Error(data.message || "Could not reset password.");
      }
      setStep(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-overlay" onClick={onClose}>
      <div className="login-modal" onClick={(e) => e.stopPropagation()}>
        <button className="login-close" onClick={onClose} type="button">✕</button>

        {step === 1 && (
          <>
            <h2>Forgot Password</h2>
            <p className="login-subtitle">Enter your account email — we'll send you a 6-digit code.</p>

            <form onSubmit={handleSendOTP}>
              <div className="login-group">
                <div>
                  <label className="login-label">Email</label>
                  <input
                    type="email"
                    className="login-input"
                    placeholder="yourname@email.com"
                    value={email}
                    required
                    autoComplete="email"
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              {error && <p className="login-error" style={{ marginBottom: "0.75rem" }}>⛔ {error}</p>}

              <button type="submit" className="login-btn" disabled={loading}>
                {loading ? "Sending…" : "Send Code"}
              </button>
            </form>

            <p className="login-footer">
              Remembered your password?{" "}
              <span onClick={onBackToLogin}>Back to Login</span>
            </p>
          </>
        )}

        {step === 2 && (
          <>
            <h2>Enter Code</h2>
            <p className="login-subtitle">
              We sent a 6-digit code to <strong>{email}</strong>
            </p>

            <form onSubmit={handleReset}>
              <div style={{ display: "flex", gap: "8px", justifyContent: "center", margin: "16px 0" }} onPaste={handlePaste}>
                {digits.map((d, idx) => (
                  <input
                    key={idx}
                    type="text"
                    inputMode="numeric"
                    maxLength="1"
                    value={d}
                    ref={(el) => (inputs.current[idx] = el)}
                    onChange={(e) => handleDigit(e.target.value, idx)}
                    onKeyDown={(e) => handleKeyDown(e, idx)}
                    autoComplete="off"
                    style={{
                      width: "42px", height: "52px", textAlign: "center", fontSize: "1.25rem",
                      fontWeight: 700, borderRadius: "10px", border: "2px solid #e5e7eb",
                      outline: "none", background: "#f9fafb",
                    }}
                  />
                ))}
              </div>

              <div className="login-group">
                <div>
                  <label className="login-label">New Password</label>
                  <div className="login-password-wrapper">
                    <input
                      type={showPw ? "text" : "password"}
                      className="login-input"
                      placeholder="Min 8 chars, uppercase, number, symbol"
                      value={newPw}
                      required
                      autoComplete="new-password"
                      onChange={(e) => setNewPw(e.target.value)}
                    />
                    <button type="button" className="login-toggle-pw" onClick={() => setShowPw(!showPw)} tabIndex={-1}>
                      {showPw ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="login-label">Confirm New Password</label>
                  <input
                    type={showPw ? "text" : "password"}
                    className="login-input"
                    placeholder="Re-enter your new password"
                    value={confirmPw}
                    required
                    autoComplete="new-password"
                    onChange={(e) => setConfirmPw(e.target.value)}
                  />
                </div>
              </div>

              {error && <p className="login-error" style={{ marginBottom: "0.75rem" }}>⛔ {error}</p>}

              <button type="submit" className="login-btn" disabled={loading}>
                {loading ? "Resetting…" : "Reset Password"}
              </button>
            </form>

            <p className="login-footer">
              {timer > 0 ? (
                <span>Resend code in {timer}s</span>
              ) : (
                <>
                  Didn't get a code?{" "}
                  <span onClick={handleResend}>Resend</span>
                </>
              )}
            </p>
          </>
        )}

        {step === 3 && (
          <>
            <h2>Password Reset!</h2>
            <p className="login-subtitle" style={{ marginBottom: "1.5rem" }}>
              ✓ Your password has been changed successfully. You can now log in with your new password.
            </p>
            <button type="button" className="login-btn" onClick={onBackToLogin}>
              Back to Login
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default ForgotPasswordModal;
