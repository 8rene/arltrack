import React, { useState, useRef, useEffect } from "react";
import "../../styles/otpModal.css";

const RESEND_COOLDOWN_S = 60; // must match backend's OTP_COOLDOWN_MS in otp.controller.js

const OTPModal = ({ email, onVerifySuccess, onClose }) => {

  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0); // seconds left before Resend is clickable again

  const inputRefs = useRef([]);

  // Tick the cooldown down once a second while it's active
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleChange = (value, index) => {

    if (!/^[0-9]?$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value && index < 5) {
      inputRefs.current[index + 1].focus();
    }

  };

  const handleKeyDown = (e, index) => {

    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1].focus();
    }

  };

  const handleVerify = async () => {

    const code = otp.join("");

    if (code.length !== 6) {
      setError("Enter the 6 digit OTP");
      return;
    }

    try {

      const response = await fetch(`${process.env.REACT_APP_API_URL}/auth/verify-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          otp: code
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setError("Invalid OTP code");
        return;
      }

      setError("");

      // login success
      onVerifySuccess(data);

    } catch (err) {

      console.error(err);
      setError("Server error");

    }

  };

  const handleResend = async () => {

    if (resending || cooldown > 0) return; // already sending, or still cooling down

    setResending(true);
    setError("");

    try {

      const response = await fetch(`${process.env.REACT_APP_API_URL}/auth/send-otp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        // Backend sends a specific "wait Xs" message on 429 (still cooling
        // down server-side) — surface that instead of pretending it worked.
        setError(data.message || "Could not resend OTP. Please try again.");
        // Backend rejected it, so don't restart the cooldown from 0 —
        // best-effort parse the seconds it told us, else just leave the
        // button enabled so the person can retry once they read the message.
        const match = /(\d+)\s*seconds?/.exec(data.message || "");
        if (match) setCooldown(Number(match[1]));
        return;
      }

      setCooldown(RESEND_COOLDOWN_S);

    } catch (err) {

      console.error(err);
      setError("Server error — please check your connection and try again.");

    } finally {

      setResending(false);

    }

  };

  return (
    <div className="otp-overlay" onClick={onClose}>
      <div className="otp-modal" onClick={(e) => e.stopPropagation()}>

        <h2>OTP Verification</h2>
        <p>Enter the 6 digit code sent to your phone</p>

        <div className="otp-inputs">

          {otp.map((digit, index) => (
            <input
              key={index}
              type="text"
              maxLength="1"
              value={digit}
              ref={(el) => (inputRefs.current[index] = el)}
              onChange={(e) => handleChange(e.target.value, index)}
              onKeyDown={(e) => handleKeyDown(e, index)}
            />
          ))}

        </div>

        {error && <p className="otp-error">{error}</p>}

        <button className="verify-btn" onClick={handleVerify}>
          Verify OTP
        </button>

        <button
          className="resend-btn"
          onClick={handleResend}
          disabled={resending || cooldown > 0}
        >
          {cooldown > 0
            ? `Resend OTP (${cooldown}s)`
            : resending
              ? "Sending…"
              : "Resend OTP"}
        </button>

      </div>
    </div>
  );
};

export default OTPModal;
