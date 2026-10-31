/**
 * SignUpModal.jsx  –  ARL Track  –  Complete 5-step Registration
 *
 * Step 0 : Username · Email · Phone           (+ email duplicate check)
 * Step 1 : First/Middle/Last name · Suffix · Birthdate (18+, no numbers in names)
 * Step 2 : Region → Province → Municipality → Barangay · Street · Terms checkbox
 * Step 3 : Gov ID (type + number + camera photo) · Driver's Licence (camera) · Selfie
 * Step 4 : OTP verification → writes to Firestore → approval modal
 *
 * Firestore writes (keyed by Firebase Auth UID returned by backend)
 *   users          : username, email, phoneNumber, firstName, middleName,
 *                    lastName, suffix, birthdate, isVerified:false, status:"locked"
 *   addresses      : region, province, municipality, barangay, street, userID
 *   userDocuments  : govIdType, govIdNumber, govIdImage, licenseNumber,
 *                    licenseImage, selfieImage, userID
 *
 * OTP is sent via backend POST /api/auth/send-otp (EmailJS).
 * NO welcome email on registration.
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchRegions,
  fetchProvinces,
  fetchMunicipalities,
  fetchBarangays,
} from "../../utils/firestoreLocation";
import TandC from "../shared/TandC";

// ── Small inline icons (replace the emojis the form used to show) ─────────────
const Svg = ({ d, className = "w-4 h-4", extra = null, fill = false }) => (
  <svg viewBox={fill ? "0 0 20 20" : "0 0 24 24"} className={className} aria-hidden="true"
    fill={fill ? "currentColor" : "none"} stroke={fill ? "none" : "currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} fillRule={fill ? "evenodd" : undefined} clipRule={fill ? "evenodd" : undefined} />
    {extra && <path d={extra} />}
  </svg>
);
const IconAlert  = ({ className = "w-3.5 h-3.5" }) => <Svg fill className={className} d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" />;
const IconInfo   = ({ className = "w-4 h-4" })     => <Svg fill className={className} d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" />;
const IconCamera = ({ className = "w-4 h-4" })     => <Svg className={className} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" extra="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />;
const IconPhoto  = ({ className = "w-4 h-4" })     => <Svg className={className} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />;
const IconFlip   = ({ className = "w-6 h-6" })     => <Svg className={className} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />;
const IconMail   = ({ className = "w-8 h-8" })     => <Svg className={className} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />;
const IconTag    = ({ className = "w-4 h-4" })     => <Svg className={className} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />;
const IconEye    = ({ className = "w-5 h-5" })     => <Svg className={className} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" extra="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />;
const IconEyeOff = ({ className = "w-5 h-5" })     => <Svg className={className} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />;

// ── No client-side Firebase writes needed — backend handles everything ────────

const API = `${process.env.REACT_APP_API_URL}`;

// ═══════════════════════════════ Helpers ══════════════════════════════════════

/** Checks email and username availability via backend.
 *  Returns { email, username } — each is an error string or null. */
async function checkAvailability(email, username) {
  try {
    const params = new URLSearchParams({
      email:    email    || "",
      username: username || "",
    });
    const res  = await fetch(`${API}/auth/check-availability?${params}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Server error");
    return {
      email:    data.email    ? (data.emailArchived
                          ? "This email belongs to an archived account. Please contact the administrator to have it restored."
                          : "This email is already registered. Please use a different email or log in.") : null,
      username: data.username ? "This username is already taken. Please choose a different one."           : null,
    };
  } catch (err) {
    console.error("Availability check:", err);
    const msg = "Could not verify availability. Please check your connection and try again.";
    return { email: msg, username: null, failed: true };
  }
}

/** Returns age in full completed years */
// Minimum age to register. Keep in sync with MIN_SIGNUP_AGE in signup.controller.js (backend).
// (Booking Without Driver still needs 21+ — enforced separately when booking.)
const MIN_AGE = 18;

function calcAge(yyyy, mm, dd) {
  const today = new Date();
  let age = today.getFullYear() - parseInt(yyyy);
  const m = today.getMonth() + 1 - parseInt(mm);
  if (m < 0 || (m === 0 && today.getDate() < parseInt(dd))) age--;
  return age;
}

/** Only letters, spaces, hyphens, apostrophes — no digits */
const NAME_RE = /^[A-Za-zÀ-ÖØ-öø-ÿ\s'-]+$/;
function validateName(v) {
  if (!v.trim()) return "This field is required.";
  if (/\d/.test(v)) return "Numbers are not allowed in names.";
  if (!NAME_RE.test(v)) return "Only letters, spaces, hyphens, and apostrophes are allowed.";
  return "";
}

/** Compress a base-64 image to ≤ 800 px wide */
function compressImage(dataUrl, maxWidth = 800) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = img.width > maxWidth ? maxWidth / img.width : 1;
      const canvas = document.createElement("canvas");
      canvas.width  = img.width  * scale;
      canvas.height = img.height * scale;
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.75));
    };
    img.src = dataUrl;
  });
}

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
function daysInMonth(m, y) {
  if (!m) return 31;
  return new Date(y || 2000, MONTHS.indexOf(m) + 1, 0).getDate();
}
const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: THIS_YEAR - 1900 + 1 }, (_, i) => THIS_YEAR - i);

const GOV_ID_TYPES = [
  "Philippine National ID (PhilSys)",
  "UMID",
  "SSS ID",
  "GSIS ID",
  "Voter's ID",
  "PRC ID",
  "Postal ID",
  "Senior Citizen ID",
  "OFW ID",
  "Passport",
  "TIN ID",
  "Pag-IBIG ID",
  "Barangay ID",
  "PWD ID",
];

// ══════════════════════════ Shared Tailwind strings ═══════════════════════════
const inputCls =
  "w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-arl-secondary bg-white text-sm transition";
const inputErrCls =
  "w-full px-4 py-3 rounded-xl border border-red-400 focus:outline-none focus:ring-2 focus:ring-red-300 bg-white text-sm transition";
const labelCls = "block text-sm font-semibold text-gray-700 mb-1";
const selectCls =
  "w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-arl-secondary bg-white text-sm transition disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed";

// ═══════════════════════════ Step labels ══════════════════════════════════════
const STEP_LABELS = ["Account", "Personal", "Address", "Documents", "Verify"];

// ═══════════════════════════ Sub-components ═══════════════════════════════════

const FieldErr = ({ msg }) =>
  msg ? (
    <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
      <IconAlert />{msg}
    </p>
  ) : null;

// ── Progress bar ──────────────────────────────────────────────────────────────
const StepBar = ({ step }) => (
  <div className="flex items-center justify-center gap-1 mb-6 flex-wrap">
    {STEP_LABELS.map((label, i) => (
      <React.Fragment key={label}>
        <div className="flex items-center gap-1">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
            i < step  ? "bg-green-500 text-white"
            : i === step ? "bg-arl-primary text-white ring-4 ring-arl-primary/20"
            : "bg-gray-100 text-gray-400"
          }`}>
            {i < step ? "✓" : i + 1}
          </div>
          <span className={`text-xs font-semibold hidden sm:block ${i <= step ? "text-arl-primary" : "text-gray-400"}`}>
            {label}
          </span>
        </div>
        {i < STEP_LABELS.length - 1 && (
          <div className={`h-0.5 w-4 rounded-full transition-all ${i < step ? "bg-green-500" : "bg-gray-200"}`} />
        )}
      </React.Fragment>
    ))}
  </div>
);

// ── Camera / Upload widget ────────────────────────────────────────────────────
const ImageCapture = ({ label, cameraOnly = false, value, onChange, required }) => {
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const fileRef   = useRef(null);
  const streamRef = useRef(null);
  const [open,       setOpen]       = useState(false);
  const [facingMode, setFacingMode] = useState("environment");
  const [camErr,     setCamErr]     = useState("");

  const startCamera = async (mode) => {
    setCamErr("");
    try {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      setCamErr(
        err.name === "NotAllowedError"
          ? "Camera permission denied. Please allow camera access in your browser settings."
          : err.name === "NotFoundError"
          ? "No camera detected on this device."
          : `Camera error: ${err.message}`
      );
    }
  };

  const stopCamera = () => {
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
  };

  const openCamera = () => {
    setOpen(true);
    setTimeout(() => startCamera(facingMode), 200);
  };

  const closeCamera = () => { stopCamera(); setOpen(false); setCamErr(""); };

  const flipCamera = () => {
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    startCamera(next);
  };

  const capture = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const v = videoRef.current;
    const c = canvasRef.current;
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    const compressed = await compressImage(c.toDataURL("image/jpeg", 0.9));
    stopCamera(); setOpen(false);
    onChange(compressed);
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => onChange(await compressImage(ev.target.result));
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  useEffect(() => () => stopCamera(), []);

  return (
    <div>
      <label className={labelCls}>
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>

      {value ? (
        <div className="relative rounded-2xl overflow-hidden border-2 border-arl-secondary/40 mb-2">
          <img src={value} alt="capture" className="w-full max-h-48 object-cover" />
          <button type="button" onClick={() => onChange(null)}
            className="absolute top-2 right-2 bg-white/90 text-red-500 rounded-full w-7 h-7 flex items-center justify-center shadow hover:bg-red-50 transition">✕</button>
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/40 to-transparent py-2 px-3">
            <span className="text-white text-xs font-semibold">✓ Captured</span>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center py-6 mb-2 gap-1">
          <IconCamera className="w-9 h-9 text-gray-300" />
          <p className="text-gray-400 text-xs text-center px-4">
            {cameraOnly ? "Camera capture only — no gallery upload allowed." : "Capture with camera or upload a photo."}
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={openCamera}
          className="flex-1 flex items-center justify-center gap-1.5 border border-arl-primary text-arl-primary py-2.5 rounded-xl text-xs font-semibold hover:bg-arl-primary hover:text-white transition">
          <IconCamera />{value ? "Retake" : "Open Camera"}
        </button>
        {!cameraOnly && (
          <button type="button" onClick={() => fileRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-1.5 border border-gray-300 text-gray-600 py-2.5 rounded-xl text-xs font-semibold hover:bg-gray-50 transition">
            <IconPhoto />Upload
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>

      {/* Camera overlay */}
      {open && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[80] flex flex-col items-center justify-center p-4">
          <div className="bg-black rounded-3xl overflow-hidden w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-900">
              <span className="text-white text-sm font-semibold">{label}</span>
              <button type="button" onClick={closeCamera} className="text-gray-400 hover:text-white text-lg leading-none">✕</button>
            </div>

            {camErr ? (
              <div className="p-6 text-center">
                <IconAlert className="w-10 h-10 text-red-400 mx-auto mb-3" />
                <p className="text-white text-sm">{camErr}</p>
                <button type="button" onClick={() => startCamera(facingMode)}
                  className="mt-4 bg-arl-secondary text-white px-5 py-2 rounded-xl text-sm font-semibold">Retry</button>
              </div>
            ) : (
              <>
                <div className="relative bg-black aspect-video">
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                  <div className="absolute inset-4 border-2 border-white/30 rounded-2xl pointer-events-none" />
                </div>
                <canvas ref={canvasRef} className="hidden" />
                <div className="flex items-center justify-around py-5 px-4 bg-gray-900">
                  <button type="button" onClick={flipCamera}
                    className="text-white text-2xl w-12 h-12 flex items-center justify-center rounded-full hover:bg-white/10 transition" title="Flip">
                    <IconFlip />
                  </button>
                  <button type="button" onClick={capture}
                    className="w-16 h-16 rounded-full bg-white border-4 border-gray-400 hover:bg-gray-100 transition shadow-lg active:scale-95" />
                  <div className="w-12 h-12" />
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── OTP step ──────────────────────────────────────────────────────────────────
const MAX_ATTEMPTS = 3;

const OTPStep = ({ email, onVerify, onRestart, loading }) => {
  const [digits,      setDigits]      = useState(["", "", "", "", "", ""]);
  const [timer,       setTimer]       = useState(60);
  const [attempts,    setAttempts]    = useState(0);
  const [errMsg,      setErrMsg]      = useState("");
  const [blocked,     setBlocked]     = useState(false);
  const [verifying,   setVerifying]   = useState(false);
  // otpKey increments on every new OTP send — resets UI cleanly
  const [otpKey,      setOtpKey]      = useState(0);
  const inputs = useRef([]);

  // Reset UI when a new OTP is sent (otpKey bumped by parent via onRestart)
  useEffect(() => {
    setDigits(["", "", "", "", "", ""]); setTimer(60);
    setAttempts(0); setErrMsg(""); setBlocked(false);
    setTimeout(() => inputs.current[0]?.focus(), 150);
  }, [otpKey]);

  useEffect(() => {
    if (timer === 0 || blocked) return;
    const id = setInterval(() => setTimer((t) => t - 1), 1000);
    return () => clearInterval(id);
  }, [timer, blocked]);

  const handleChange = (val, idx) => {
    if (!/^[0-9]?$/.test(val)) return;
    const next = [...digits]; next[idx] = val; setDigits(next); setErrMsg("");
    if (val && idx < 5) inputs.current[idx + 1]?.focus();
  };
  const handleKeyDown = (e, idx) => {
    if (e.key === "Backspace" && !digits[idx] && idx > 0) inputs.current[idx - 1]?.focus();
  };
  const handlePaste = (e) => {
    const p = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (p.length === 6) { setDigits(p.split("")); inputs.current[5]?.focus(); }
  };

  const verify = async () => {
    if (blocked || verifying) return;
    const entered = digits.join("");
    if (entered.length < 6) { setErrMsg("Please enter all 6 digits."); return; }

    setVerifying(true);
    try {
      const res  = await fetch(`${API}/auth/verify-otp`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email, otp: entered }),
      });
      const data = await res.json();

      if (res.ok) {
        // OTP correct — proceed to save registration
        onVerify();
        return;
      }

      // Wrong OTP — parse remaining attempts from backend message
      const na = attempts + 1;
      setAttempts(na);
      setDigits(["", "", "", "", "", ""]);
      setTimeout(() => inputs.current[0]?.focus(), 50);

      if (res.status === 429 || na >= MAX_ATTEMPTS) {
        setBlocked(true);
        setErrMsg("Too many incorrect attempts. Please request a new OTP.");
      } else {
        setErrMsg(data.message || `Incorrect OTP. ${MAX_ATTEMPTS - na} attempt${MAX_ATTEMPTS - na === 1 ? "" : "s"} remaining.`);
      }
    } catch {
      setErrMsg("Network error. Please try again.");
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    await onRestart();
    setOtpKey((k) => k + 1); // bumps the reset useEffect
  };

  const isLoading = loading || verifying;

  return (
    <div className="flex flex-col items-center py-2">
      <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 mb-4"><IconMail /></div>
      <h3 className="text-xl font-black text-arl-primary mb-1">Email Verification</h3>
      <p className="text-sm text-gray-500 text-center mb-1">Enter the 6-digit OTP sent to</p>
      <p className="text-sm font-bold text-arl-primary text-center break-all mb-4">{email}</p>

      {/* Attempt dots — fill red as attempts are used */}
      <div className="flex gap-2 mb-1">
        {[...Array(MAX_ATTEMPTS)].map((_, i) => (
          <span key={i} className={`w-2.5 h-2.5 rounded-full inline-block transition-colors duration-300 ${i < attempts ? "bg-red-400" : "bg-gray-200"}`} />
        ))}
      </div>
      <p className="text-xs text-gray-400 mb-4">
        {attempts === 0
          ? `${MAX_ATTEMPTS} attempts allowed`
          : `${MAX_ATTEMPTS - attempts} attempt${MAX_ATTEMPTS - attempts === 1 ? "" : "s"} remaining`}
      </p>

      <div className="flex gap-1.5 sm:gap-2 mb-4" onPaste={handlePaste}>
        {digits.map((d, idx) => (
          <input key={idx} type="text" inputMode="numeric" maxLength="1" value={d}
            ref={(el) => (inputs.current[idx] = el)}
            onChange={(e) => handleChange(e.target.value, idx)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            autoComplete="off"
            className="w-9 h-12 sm:w-11 sm:h-14 border-2 border-gray-200 rounded-xl text-center text-lg sm:text-xl font-bold text-arl-primary bg-gray-50 outline-none focus:border-arl-secondary focus:ring-2 focus:ring-arl-secondary/20 focus:bg-white transition-all caret-transparent"
          />
        ))}
      </div>

      {errMsg && <p className="text-red-500 text-xs mb-3 flex items-center gap-1"><IconAlert />{errMsg}</p>}

      <button type="button" onClick={verify} disabled={isLoading || blocked || digits.filter(Boolean).length < 6}
        className="w-full py-3 bg-arl-primary text-white rounded-xl font-bold text-sm hover:bg-arl-secondary transition-all disabled:opacity-50 disabled:cursor-not-allowed mb-3">
        {verifying ? "Checking…" : isLoading ? "Saving registration…" : "Verify OTP"}
      </button>

      <div className="text-sm text-gray-500">
        {blocked ? (
          <button type="button" onClick={handleResend} className="text-red-500 font-bold hover:underline text-xs">Get new OTP</button>
        ) : timer > 0 ? (
          <span className="inline-flex items-center gap-1 bg-gray-100 rounded-full px-3 py-1 text-xs font-bold text-arl-primary">
            ⏱ Resend in {timer}s
          </span>
        ) : (
          <button type="button" onClick={handleResend} className="text-arl-secondary font-bold hover:underline text-xs">Resend OTP</button>
        )}
      </div>
    </div>
  );
};

// ── Approval notice ───────────────────────────────────────────────────────────
const ApprovalModal = ({ onClose }) => (
  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
    <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full text-center">
      <div className="w-20 h-20 rounded-full bg-amber-50 flex items-center justify-center text-4xl mx-auto mb-5">⏳</div>
      <h2 className="text-2xl font-black text-arl-primary mb-3">Registration Submitted!</h2>
      <p className="text-gray-600 text-sm leading-relaxed mb-6">
        Your account has been created successfully. Please wait for{" "}
        <span className="font-bold text-arl-primary">admin approval</span> before you can book a car.
        You will be notified once your account is activated.
      </p>
      <button onClick={onClose}
        className="w-full bg-arl-primary text-white py-3 rounded-xl font-bold text-sm hover:bg-arl-secondary transition">
        Got it, I'll wait!
      </button>
    </div>
  </div>
);

// ═════════════════════════════════════════════════════════════════════════════
//  Main Component
// ═════════════════════════════════════════════════════════════════════════════
const SignUpModal = ({ onClose, onSwitchToLogin }) => {
  const [step,         setStep]         = useState(0);
  const [loading,      setLoading]      = useState(false);
  const [showApproval, setShowApproval] = useState(false);

  // ── Step 0: Account ────────────────────────────────────────────────────────
  const [s0, setS0] = useState({ username: "", email: "", phoneDigits: "", password: "", confirmPassword: "", referralCode: "" });
  const [fieldErrors,   setFieldErrors]   = useState({ email: "", username: "" });
  const [showPassword,  setShowPassword]  = useState(false);
  const [checkingFields, setCheckingFields] = useState(false);
  const [checkingEmail,  setCheckingEmail]  = useState(false);
  const lastCheckedEmail = useRef(""); // the email last looked up, so tabbing in and out doesn't repeat the request

  // ── Live referral code check — purely informational, never blocks
  // signup. { checking, valid: true|false|null, referrerName } — valid
  // is null before anything's been typed / checked yet.
  const [referralStatus, setReferralStatus] = useState({ checking: false, valid: null, referrerName: "" });

  useEffect(() => {
    const code = s0.referralCode.trim();
    if (!code) {
      setReferralStatus({ checking: false, valid: null, referrerName: "" });
      return;
    }
    let cancelled = false;
    setReferralStatus((p) => ({ ...p, checking: true }));
    const timer = setTimeout(async () => {
      try {
        const res  = await fetch(`${API}/auth/check-referral?code=${encodeURIComponent(code)}`);
        const data = await res.json();
        if (cancelled) return;
        setReferralStatus({
          checking: false,
          valid: !!data.valid,
          referrerName: data.referrerName || "",
        });
      } catch (err) {
        if (!cancelled) setReferralStatus({ checking: false, valid: null, referrerName: "" });
      }
    }, 400); // debounce — avoid a request per keystroke

    return () => { cancelled = true; clearTimeout(timer); };
  }, [s0.referralCode]);

  const phoneValid = s0.phoneDigits.length === 10 && s0.phoneDigits[0] === "9";
  const fullPhone  = s0.phoneDigits ? `+63${s0.phoneDigits}` : "";

  const handlePhone = (e) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 10);
    if (raw.length > 0 && raw[0] !== "9") return;
    setS0((p) => ({ ...p, phoneDigits: raw }));
  };

  // ── Step 1: Personal ───────────────────────────────────────────────────────
  const [s1, setS1] = useState({
    firstName: "", middleName: "", lastName: "", suffix: "",
    bdMonth: "", bdDay: "", bdYear: "",
  });
  const [s1Err, setS1Err] = useState({});

  const validateS1 = () => {
    const e = {};
    const fnErr = validateName(s1.firstName);
    const lnErr = validateName(s1.lastName);
    const mnErr = s1.middleName.trim() ? validateName(s1.middleName) : "";
    if (fnErr) e.firstName  = fnErr;
    if (lnErr) e.lastName   = lnErr;
    if (mnErr) e.middleName = mnErr;
    if (!s1.bdMonth || !s1.bdDay || !s1.bdYear) {
      e.birthdate = "Please complete your date of birth.";
    } else if (calcAge(s1.bdYear, MONTHS.indexOf(s1.bdMonth) + 1, s1.bdDay) < MIN_AGE) {
      e.birthdate = `You must be at least ${MIN_AGE} years old to register.`;
    }
    setS1Err(e);
    return Object.keys(e).length === 0;
  };

  const bdMaxDays   = daysInMonth(s1.bdMonth, s1.bdYear);
  const bdDayOpts   = Array.from({ length: bdMaxDays }, (_, i) => i + 1);
  const birthdateISO = s1.bdYear && s1.bdMonth && s1.bdDay
    ? `${s1.bdYear}-${String(MONTHS.indexOf(s1.bdMonth)+1).padStart(2,"0")}-${String(s1.bdDay).padStart(2,"0")}`
    : "";
  const ageOk = birthdateISO && calcAge(s1.bdYear, MONTHS.indexOf(s1.bdMonth)+1, s1.bdDay) >= MIN_AGE;

  // ── Step 2: Address ────────────────────────────────────────────────────────
  const [regions,        setRegions]        = useState([]);
  const [provinces,      setProvinces]      = useState([]);
  const [municipalities, setMunicipalities] = useState([]);
  const [barangays,      setBarangays]      = useState([]);
  const [loadingReg,  setLoadingReg]  = useState(false);
  const [loadingProv, setLoadingProv] = useState(false);
  const [loadingMun,  setLoadingMun]  = useState(false);
  const [loadingBar,  setLoadingBar]  = useState(false);
  const [selRegion,  setSelRegion]  = useState(null);
  const [selProv,    setSelProv]    = useState(null);
  const [selMun,     setSelMun]     = useState(null);
  const [selBar,     setSelBar]     = useState(null);
  const [street,     setStreet]     = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsInfo,     setTermsInfo]     = useState(null); // { termsVersionID, version } of the text the customer actually accepted
  const [showTerms,     setShowTerms]     = useState(false);
  const [addrErr,       setAddrErr]       = useState("");

  useEffect(() => {
    setLoadingReg(true);
    fetchRegions().then(setRegions).catch(console.error).finally(() => setLoadingReg(false));
  }, []);

  useEffect(() => {
    if (!selRegion) { setProvinces([]); return; }
    setLoadingProv(true);
    setProvinces([]); setSelProv(null); setMunicipalities([]); setSelMun(null); setBarangays([]); setSelBar(null);
    fetchProvinces(selRegion.regionID).then(setProvinces).catch(console.error).finally(() => setLoadingProv(false));
  }, [selRegion]);

  useEffect(() => {
    if (!selProv) { setMunicipalities([]); return; }
    setLoadingMun(true);
    setMunicipalities([]); setSelMun(null); setBarangays([]); setSelBar(null);
    fetchMunicipalities(selProv.provinceID).then(setMunicipalities).catch(console.error).finally(() => setLoadingMun(false));
  }, [selProv]);

  useEffect(() => {
    if (!selMun) { setBarangays([]); return; }
    setLoadingBar(true);
    setBarangays([]); setSelBar(null);
    fetchBarangays(selMun.municipalityID).then(setBarangays).catch(console.error).finally(() => setLoadingBar(false));
  }, [selMun]);

  const handleRegion = useCallback((e) => setSelRegion(regions.find((r) => r.regionID === e.target.value) || null), [regions]);
  const handleProv   = useCallback((e) => setSelProv(provinces.find((p) => p.provinceID === e.target.value) || null), [provinces]);
  const handleMun    = useCallback((e) => { setSelMun(municipalities.find((m) => m.municipalityID === e.target.value) || null); setSelBar(null); }, [municipalities]);
  const handleBar    = useCallback((e) => setSelBar(barangays.find((b) => b.barangayID === e.target.value) || null), [barangays]);

  // ── Step 3: Documents ──────────────────────────────────────────────────────
  const [s3, setS3] = useState({
    govIdType: "", govIdNumber: "", govIdImage: null,
    licenseNumber: "", licenseImage: null,
    selfieImage: null,
  });
  const [s3Err, setS3Err] = useState({});

  const validateS3 = () => {
    const e = {};
    if (!s3.govIdType)           e.govIdType     = "Please select a government ID type.";
    if (!s3.govIdNumber.trim())  e.govIdNumber   = "Please enter your government ID number.";
    if (!s3.govIdImage)          e.govIdImage    = "Please capture or upload your government ID photo.";
    // The driver's license is optional. Skipping it is fine (the account can only book With Driver), but the number
    // and the photo go together — a half-filled license is not accepted.
    const hasLicNo = !!s3.licenseNumber.trim();
    const hasLicImg = !!s3.licenseImage;
    if (hasLicNo && !hasLicImg) e.licenseImage  = "Please add the photo of your driver's license, or clear the number to skip it.";
    if (hasLicImg && !hasLicNo) e.licenseNumber = "Please enter your driver's license number, or remove the photo to skip it.";
    if (!s3.selfieImage)         e.selfieImage   = "Please provide a selfie photo.";
    setS3Err(e);
    return Object.keys(e).length === 0;
  };

  // ── Step 4: OTP ────────────────────────────────────────────────────────────

  const sendOTP = async () => {
    const res = await fetch(`${API}/auth/send-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: s0.email, name: s0.username }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to send OTP.");
  };

  const handleOTPRestart = async () => {
    try { await sendOTP(); }
    catch (err) { console.error("OTP resend failed:", err); throw err; }
  };

  // ── Save everything to Firestore (backend handles Auth + Storage + Firestore) ─
  const saveToFirestore = async () => {
    const signupRes = await fetch(`${API}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // Step 0 — account
        username:  s0.username.trim(),
        email:     s0.email.trim().toLowerCase(),
        password:  s0.password,
        phone:     fullPhone,
        referralCode: s0.referralCode.trim() || null,
        // Step 1 — personal
        firstName:  s1.firstName.trim(),
        middleName: s1.middleName.trim(),
        lastName:   s1.lastName.trim(),
        suffix:     s1.suffix,
        birthdate:  birthdateISO,
        // Step 2 — address
        address: {
          region:       selRegion?.regionName   || "",
          province:     selProv?.provinceName    || "",
          city:         selMun?.municipalityName || "",  // city and municipality share the same value
          municipality: selMun?.municipalityName || "",
          barangay:     selBar?.barangayName     || "",
          street:       street.trim(),
        },
        // Step 3 — documents (base64 images — backend uploads to Storage)
        documentType:         s3.govIdType,
        documentNumber:       s3.govIdNumber.trim(),
        documentImageBase64:  s3.govIdImage,
        driversLicenseNumber: s3.licenseNumber.trim(),
        driverLicenseBase64:  s3.licenseImage,
        selfieWithIdBase64:   s3.selfieImage,
        // Hash of the Terms & Conditions text they accepted — the server checks it is the current one and records it.
        termsVersionID:       termsInfo?.termsVersionID || null,
      }),
    });

    const signupData = await signupRes.json();
    if (!signupRes.ok) {
      // The terms changed (or weren't accepted) — the old acceptance no longer counts.
      if (signupData.termsChanged || signupData.termsRequired) {
        setTermsAccepted(false);
        setTermsInfo(null);
        throw new Error(`${signupData.message || "Please accept the Terms & Conditions."} Go back to the address step and accept them again.`);
      }
      throw new Error(signupData.message || "Signup failed.");
    }
    if (!signupData.userID) throw new Error("No user ID returned from server.");
  };

  const handleVerifyOTP = async () => {
    setLoading(true);
    try {
      await saveToFirestore();
      setShowApproval(true);
    } catch (err) {
      console.error("Registration error:", err);
      alert(err.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Live email check: runs when the person leaves the email box, so "already registered" / "archived" shows right
  // away instead of only after they fill in everything and press Next. Next still re-checks. A connection problem
  // stays silent here (Next reports it); the server limits how often this can be called.
  const handleEmailBlur = async () => {
    const typed = s0.email.trim().toLowerCase();
    if (!typed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(typed)) return;
    if (typed === lastCheckedEmail.current) return;
    setCheckingEmail(true);
    const errs = await checkAvailability(typed, "");
    setCheckingEmail(false);
    if (errs.failed) return;
    lastCheckedEmail.current = typed;
    setS0((cur) => {
      // ignore the answer if they've changed the email while this was running
      if (cur.email.trim().toLowerCase() === typed) setFieldErrors((p) => ({ ...p, email: errs.email || "" }));
      return cur;
    });
  };

  // ── Next / submit handler ──────────────────────────────────────────────────
  const handleNext = async (e) => {
    e.preventDefault();

    if (step === 0) {
      if (!s0.username.trim())       return alert("Please enter a username.");
      if (s0.username.trim().length > 12) return alert("Username must be 12 characters or less.");
      if (!s0.email.trim())          return alert("Please enter your email.");
      if (!s0.phoneDigits)           return alert("Please enter your phone number.");
      if (!phoneValid)               return alert("Phone must be 10 digits starting with 9.");
      if (!s0.password)              return alert("Please enter a password.");
      const pwdRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()\-_=+[\]{};':"\\|,.<>/?]).{8,64}$/;
      if (!pwdRegex.test(s0.password)) return alert("Password must be 8–64 characters with at least 1 uppercase, 1 lowercase, 1 number, and 1 special character.");
      if (s0.password !== s0.confirmPassword) return alert("Passwords do not match.");

      setCheckingFields(true);
      setFieldErrors({ email: "", username: "" });
      const errs = await checkAvailability(
        s0.email.trim().toLowerCase(),
        s0.username.trim().toLowerCase()
      );
      setCheckingFields(false);
      setFieldErrors({ email: errs.email || "", username: errs.username || "" });
      if (errs.email || errs.username) return;
      setStep(1);

    } else if (step === 1) {
      if (!validateS1()) return;
      setStep(2);

    } else if (step === 2) {
      if (!selRegion)       { setAddrErr("Please select a Region."); return; }
      if (!selProv)         { setAddrErr("Please select a Province."); return; }
      if (!selMun)          { setAddrErr("Please select a Municipality."); return; }
      if (!selBar)          { setAddrErr("Please select a Barangay."); return; }
      if (!termsAccepted)   { setAddrErr("You must accept the Terms & Conditions to continue."); return; }
      setAddrErr("");
      setStep(3);

    } else if (step === 3) {
      if (!validateS3()) return;
      setLoading(true);
      try {
        await sendOTP();
        setStep(4);
      } catch (err) {
        alert(err.message || "Could not send OTP. Please try again.");
      } finally {
        setLoading(false);
      }
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
        onClick={step < 4 ? onClose : undefined}
      >
        <div
          className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl px-6 pt-6 pb-8 relative overflow-y-auto max-h-[94vh]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4 sm:hidden" />

          <h2 className="text-2xl sm:text-3xl font-black text-arl-primary mb-1 text-center tracking-tight">
            {step === 4 ? "Verify Your Email" : "Create Account"}
          </h2>
          {step < 4 && (
            <p className="text-center text-xs text-gray-400 mb-3">Step {step + 1} of {STEP_LABELS.length}</p>
          )}

          <StepBar step={step} />

          <form onSubmit={handleNext} className="space-y-4" noValidate>

            {/* ════════ STEP 0 — Account Info ════════ */}
            {step === 0 && (
              <>
                <div>
                  <label className={labelCls}>Username <span className="text-red-400">*</span></label>
                  <input type="text"
                    className={fieldErrors.username ? inputErrCls : inputCls}
                    placeholder="Choose a unique username"
                    value={s0.username}
                    maxLength={12}
                    onChange={(e) => {
                        // Allow letters, numbers, underscores, dots only — strip everything else (incl. emojis)
                        const clean = e.target.value.replace(/[^\w.]/g, '').slice(0, 12);
                        setS0((p) => ({ ...p, username: clean }));
                        setFieldErrors((p) => ({ ...p, username: "" }));
                      }}
                    required autoComplete="username"
                  />
                  {fieldErrors.username && (
                    <div className="mt-2 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                      <span className="text-red-500 flex-shrink-0 mt-0.5"><IconAlert /></span>
                      <p className="text-red-600 text-xs leading-snug">{fieldErrors.username}</p>
                    </div>
                  )}
                </div>

                <div>
                  <label className={labelCls}>Email <span className="text-red-400">*</span></label>
                  <input type="email"
                    className={fieldErrors.email ? inputErrCls : inputCls}
                    placeholder="yourname@email.com"
                    value={s0.email}
                    onChange={(e) => { setS0((p) => ({ ...p, email: e.target.value })); setFieldErrors((p) => ({ ...p, email: "" })); lastCheckedEmail.current = ""; }}
                    onBlur={handleEmailBlur}
                    required autoComplete="email"
                  />
                  {checkingEmail && !fieldErrors.email && (
                    <p className="text-gray-400 text-xs mt-1">Checking email…</p>
                  )}
                  {fieldErrors.email && (
                    <div className="mt-2 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                      <span className="text-red-500 flex-shrink-0 mt-0.5"><IconAlert /></span>
                      <p className="text-red-600 text-xs leading-snug">{fieldErrors.email}</p>
                    </div>
                  )}
                </div>

                <div>
                  <label className={labelCls}>Phone Number <span className="text-red-400">*</span></label>
                  <div className="flex">
                    <div className="flex items-center px-4 py-3 bg-gray-100 border border-r-0 border-gray-200 rounded-l-xl text-sm font-semibold text-gray-600 whitespace-nowrap select-none">
                      PH +63
                    </div>
                    <input type="text" inputMode="numeric"
                      className="flex-1 px-4 py-3 rounded-r-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-arl-secondary bg-white text-sm transition"
                      placeholder="9XXXXXXXXX" maxLength={10}
                      value={s0.phoneDigits} onChange={handlePhone} required
                    />
                  </div>
                  {s0.phoneDigits.length > 0 && !phoneValid && (
                    <p className="text-orange-500 text-xs mt-1">Must be 10 digits starting with 9</p>
                  )}
                  {phoneValid && <p className="text-green-600 text-xs mt-1">✓ {fullPhone}</p>}
                </div>

                {/* Password */}
                <div>
                  <label className={labelCls}>Password <span className="text-red-400">*</span></label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      className={inputCls}
                      placeholder="Min 8 chars, uppercase, number, symbol"
                      value={s0.password}
                      onChange={(e) => setS0((p) => ({ ...p, password: e.target.value }))}
                      autoComplete="new-password"
                    />
                    <button type="button" onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg select-none">
                      {showPassword ? <IconEyeOff /> : <IconEye />}
                    </button>
                  </div>
                  {s0.password.length > 0 && (() => {
                    const ok = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()\-_=+[\]{};':"|,.<>/?]).{8,64}$/.test(s0.password);
                    return ok
                      ? <p className="text-green-600 text-xs mt-1">✓ Strong password</p>
                      : <p className="text-orange-500 text-xs mt-1">8–64 chars · uppercase · lowercase · number · symbol</p>;
                  })()}
                </div>

                {/* Confirm Password */}
                <div>
                  <label className={labelCls}>Confirm Password <span className="text-red-400">*</span></label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      className={s0.confirmPassword && s0.password !== s0.confirmPassword ? inputErrCls : inputCls}
                      placeholder="Re-enter your password"
                      value={s0.confirmPassword}
                      onChange={(e) => setS0((p) => ({ ...p, confirmPassword: e.target.value }))}
                      autoComplete="new-password"
                    />
                  </div>
                  {s0.confirmPassword && s0.password !== s0.confirmPassword && (
                    <p className="text-red-500 text-xs mt-1">Passwords do not match</p>
                  )}
                  {s0.confirmPassword && s0.password === s0.confirmPassword && (
                    <p className="text-green-600 text-xs mt-1">✓ Passwords match</p>
                  )}
                </div>

                {/* Referral Code */}
                <div>
                  <label className={labelCls}>
                    Referral Code{" "}
                    <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm select-none">
                      <IconTag />
                    </span>
                    <input
                      type="text"
                      className={`${inputCls} pl-10 uppercase tracking-widest`}
                      placeholder="e.g. ARL-ABCD1234"
                      value={s0.referralCode}
                      onChange={(e) =>
                        setS0((p) => ({ ...p, referralCode: e.target.value.toUpperCase() }))
                      }
                      autoComplete="off"
                      maxLength={20}
                    />
                  </div>
                  {referralStatus.checking && (
                    <p className="text-gray-400 text-xs mt-1">Checking code…</p>
                  )}
                  {!referralStatus.checking && referralStatus.valid === true && (
                    <p className="text-green-600 text-xs mt-1">✓ Referred by {referralStatus.referrerName}</p>
                  )}
                  {!referralStatus.checking && referralStatus.valid === false && (
                    <p className="text-amber-500 text-xs mt-1">
                      We couldn't find that code — you can still continue, it just won't be linked to anyone.
                    </p>
                  )}
                  {referralStatus.valid === null && !referralStatus.checking && (
                    <p className="text-gray-400 text-xs mt-1">
                      Have a referral code from a friend? Enter it here.
                    </p>
                  )}
                </div>
              </>
            )}

            {/* ════════ STEP 1 — Personal Info ════════ */}
            {step === 1 && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>First Name <span className="text-red-400">*</span></label>
                    <input type="text" className={s1Err.firstName ? inputErrCls : inputCls}
                      placeholder="e.g. Juan"
                      value={s1.firstName}
                      onChange={(e) => { setS1((p) => ({ ...p, firstName: e.target.value })); setS1Err((p) => ({ ...p, firstName: "" })); }}
                    />
                    <FieldErr msg={s1Err.firstName} />
                  </div>
                  <div>
                    <label className={labelCls}>Last Name <span className="text-red-400">*</span></label>
                    <input type="text" className={s1Err.lastName ? inputErrCls : inputCls}
                      placeholder="e.g. Dela Cruz"
                      value={s1.lastName}
                      onChange={(e) => { setS1((p) => ({ ...p, lastName: e.target.value })); setS1Err((p) => ({ ...p, lastName: "" })); }}
                    />
                    <FieldErr msg={s1Err.lastName} />
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Middle Name <span className="font-normal text-gray-400">(optional)</span></label>
                  <input type="text" className={s1Err.middleName ? inputErrCls : inputCls}
                    placeholder="e.g. Santos"
                    value={s1.middleName}
                    onChange={(e) => { setS1((p) => ({ ...p, middleName: e.target.value })); setS1Err((p) => ({ ...p, middleName: "" })); }}
                  />
                  <FieldErr msg={s1Err.middleName} />
                </div>

                <div>
                  <label className={labelCls}>Suffix <span className="font-normal text-gray-400">(optional)</span></label>
                  <select className={selectCls} value={s1.suffix}
                    onChange={(e) => setS1((p) => ({ ...p, suffix: e.target.value }))}>
                    <option value="">— None —</option>
                    {["Jr.", "Sr.", "II", "III", "IV", "V"].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div>
                  <label className={labelCls}>Date of Birth <span className="text-red-400">*</span></label>
                  <p className="text-gray-400 text-xs mb-2">Must be at least {MIN_AGE} years old.</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Month</label>
                      <select
                        className={`${selectCls} ${s1Err.birthdate ? "border-red-400" : s1.bdMonth ? "border-green-400" : ""}`}
                        value={s1.bdMonth}
                        onChange={(e) => {
                          const nm = e.target.value;
                          const maxD = daysInMonth(nm, s1.bdYear);
                          setS1((p) => ({ ...p, bdMonth: nm, bdDay: parseInt(p.bdDay) > maxD ? "" : p.bdDay }));
                          setS1Err((p) => ({ ...p, birthdate: "" }));
                        }}
                      >
                        <option value="">Month</option>
                        {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Day</label>
                      <select
                        className={`${selectCls} ${s1Err.birthdate ? "border-red-400" : s1.bdDay ? "border-green-400" : ""}`}
                        value={s1.bdDay} disabled={!s1.bdMonth}
                        onChange={(e) => { setS1((p) => ({ ...p, bdDay: e.target.value })); setS1Err((p) => ({ ...p, birthdate: "" })); }}
                      >
                        <option value="">Day</option>
                        {bdDayOpts.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Year</label>
                      <select
                        className={`${selectCls} ${s1Err.birthdate ? "border-red-400" : s1.bdYear ? "border-green-400" : ""}`}
                        value={s1.bdYear}
                        onChange={(e) => { setS1((p) => ({ ...p, bdYear: e.target.value })); setS1Err((p) => ({ ...p, birthdate: "" })); }}
                      >
                        <option value="">Year</option>
                        {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                  </div>
                  {s1Err.birthdate
                    ? <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><IconAlert />{s1Err.birthdate}</p>
                    : ageOk && <p className="text-green-600 text-xs mt-1">✓ Age requirement met.</p>}
                </div>
              </>
            )}

            {/* ════════ STEP 2 — Address + Terms ════════ */}
            {step === 2 && (
              <>
                <div>
                  <label className={labelCls}>Region <span className="text-red-400">*</span></label>
                  <select className={selectCls} value={selRegion?.regionID || ""} onChange={handleRegion} disabled={loadingReg}>
                    <option value="">{loadingReg ? "Loading…" : "— Select Region —"}</option>
                    {regions.map((r) => <option key={r.regionID} value={r.regionID}>{r.regionName}</option>)}
                  </select>
                </div>

                <div>
                  <label className={labelCls}>Province <span className="text-red-400">*</span></label>
                  <select className={selectCls} value={selProv?.provinceID || ""} onChange={handleProv} disabled={!selRegion || loadingProv}>
                    <option value="">{loadingProv ? "Loading…" : selRegion ? "— Select Province —" : "— Select a region first —"}</option>
                    {provinces.map((p) => <option key={p.provinceID} value={p.provinceID}>{p.provinceName}</option>)}
                  </select>
                </div>

                <div>
                  <label className={labelCls}>Municipality / City <span className="text-red-400">*</span></label>
                  <select className={selectCls} value={selMun?.municipalityID || ""} onChange={handleMun} disabled={!selProv || loadingMun}>
                    <option value="">{loadingMun ? "Loading…" : selProv ? "— Select Municipality —" : "— Select a province first —"}</option>
                    {municipalities.map((m) => <option key={m.municipalityID} value={m.municipalityID}>{m.municipalityName}</option>)}
                  </select>
                </div>

                <div>
                  <label className={labelCls}>Barangay <span className="text-red-400">*</span></label>
                  <select className={selectCls} value={selBar?.barangayID || ""} onChange={handleBar} disabled={!selMun || loadingBar}>
                    <option value="">{loadingBar ? "Loading…" : selMun ? "— Select Barangay —" : "— Select a municipality first —"}</option>
                    {barangays.map((b) => <option key={b.barangayID} value={b.barangayID}>{b.barangayName}</option>)}
                  </select>
                </div>

                <div>
                  <label className={labelCls}>Street / House No. <span className="font-normal text-gray-400">(optional)</span></label>
                  <input type="text" className={inputCls} placeholder="e.g. 123 Rizal St."
                    value={street} onChange={(e) => setStreet(e.target.value)} />
                </div>

                {/* Terms */}
                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-3">
                  <p className="text-sm text-gray-600">Please read our Terms & Conditions before completing registration.</p>
                  <button type="button" onClick={() => setShowTerms(true)}
                    className="w-full text-sm font-semibold text-arl-secondary border border-arl-secondary rounded-xl py-2.5 hover:bg-arl-secondary hover:text-white transition">
                    Read Terms & Conditions
                  </button>
                  <div className="flex items-center gap-2.5">
                    <div onClick={() => termsAccepted ? (setTermsAccepted(false), setTermsInfo(null)) : setShowTerms(true)}
                      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center cursor-pointer transition-all flex-shrink-0 ${
                        termsAccepted ? "bg-arl-primary border-arl-primary" : "border-gray-300 hover:border-arl-secondary"
                      }`}>
                      {termsAccepted && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className="text-sm text-gray-600">
                      I have read and agree to the{" "}
                      <button type="button" onClick={() => setShowTerms(true)} className="text-arl-secondary font-semibold hover:underline">
                        Terms & Conditions
                      </button>
                    </span>
                  </div>
                  {addrErr && <p className="text-red-500 text-xs flex items-center gap-1"><IconAlert />{addrErr}</p>}
                </div>
              </>
            )}

            {/* ════════ STEP 3 — Documents ════════ */}
            {step === 3 && (
              <>
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700 flex gap-2">
                  <span className="flex-shrink-0 mt-0.5"><IconInfo /></span>
                  <span>Government ID and Driver's License photos can be captured with your camera or uploaded from your gallery. Ensure documents are clearly visible and not blurry.</span>
                </div>

                {/* Gov ID type */}
                <div>
                  <label className={labelCls}>Government ID Type <span className="text-red-400">*</span></label>
                  <select className={s3Err.govIdType ? `${selectCls} border-red-400` : selectCls}
                    value={s3.govIdType}
                    onChange={(e) => { setS3((p) => ({ ...p, govIdType: e.target.value })); setS3Err((p) => ({ ...p, govIdType: "" })); }}>
                    <option value="">— Select ID Type —</option>
                    {GOV_ID_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <FieldErr msg={s3Err.govIdType} />
                </div>

                {/* Gov ID number */}
                <div>
                  <label className={labelCls}>Government ID Number <span className="text-red-400">*</span></label>
                  <input type="text" className={s3Err.govIdNumber ? inputErrCls : inputCls}
                    placeholder="Enter your ID number"
                    value={s3.govIdNumber}
                    onChange={(e) => { setS3((p) => ({ ...p, govIdNumber: e.target.value })); setS3Err((p) => ({ ...p, govIdNumber: "" })); }}
                  />
                  <FieldErr msg={s3Err.govIdNumber} />
                </div>

                {/* Gov ID photo — camera or upload */}
                <ImageCapture label="Government ID Photo" cameraOnly={false}
                  value={s3.govIdImage}
                  onChange={(v) => { setS3((p) => ({ ...p, govIdImage: v })); setS3Err((p) => ({ ...p, govIdImage: "" })); }}
                  required
                />
                <FieldErr msg={s3Err.govIdImage} />

                <hr className="border-gray-100 my-1" />

                {/* License is OPTIONAL — without one the customer can only book With Driver */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700 flex gap-2">
                  <span className="flex-shrink-0 mt-0.5"><IconInfo /></span>
                  <span>
                    <b>Driver's license (optional).</b> You can create your account without one, but you can only book <b>With Driver</b>.
                    To book <b>Without Driver</b> you need a valid license and must be 21 or older. You can add your license later in your Profile.
                  </span>
                </div>

                {/* License number */}
                <div>
                  <label className={labelCls}>Driver's License Number <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input type="text" className={s3Err.licenseNumber ? inputErrCls : inputCls}
                    placeholder="e.g. N01-12-123456"
                    value={s3.licenseNumber}
                    onChange={(e) => { setS3((p) => ({ ...p, licenseNumber: e.target.value })); setS3Err((p) => ({ ...p, licenseNumber: "" })); }}
                  />
                  <FieldErr msg={s3Err.licenseNumber} />
                </div>

                {/* License photo — camera or upload */}
                <ImageCapture label="Driver's License Photo (optional)" cameraOnly={false}
                  value={s3.licenseImage}
                  onChange={(v) => { setS3((p) => ({ ...p, licenseImage: v })); setS3Err((p) => ({ ...p, licenseImage: "" })); }}
                />
                <FieldErr msg={s3Err.licenseImage} />

                <hr className="border-gray-100 my-1" />

                {/* Selfie — camera or upload */}
                <ImageCapture label="Selfie Photo" cameraOnly={false}
                  value={s3.selfieImage}
                  onChange={(v) => { setS3((p) => ({ ...p, selfieImage: v })); setS3Err((p) => ({ ...p, selfieImage: "" })); }}
                  required
                />
                <FieldErr msg={s3Err.selfieImage} />
              </>
            )}

            {/* ════════ STEP 4 — OTP ════════ */}
            {step === 4 && (
              <OTPStep
                email={s0.email}
                onVerify={handleVerifyOTP}
                onRestart={handleOTPRestart}
                loading={loading}
              />
            )}

            {/* Nav buttons */}
            {step < 4 && (
              <div className="flex gap-3 pt-2">
                {step > 0 && (
                  <button type="button" onClick={() => setStep((s) => s - 1)}
                    className="flex-1 border-2 border-gray-200 text-gray-500 py-3 rounded-xl font-semibold text-sm hover:border-arl-primary hover:text-arl-primary transition-all">
                    ← Back
                  </button>
                )}
                <button type="submit" disabled={loading || checkingFields}
                  className="flex-1 bg-arl-primary text-white py-3 rounded-xl font-semibold text-sm hover:bg-arl-secondary transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                  {checkingFields ? "Checking availability…"
                    : loading ? "Please wait…"
                    : step < 3 ? "Next →"
                    : "Send OTP & Continue"}
                </button>
              </div>
            )}
          </form>

          {step < 4 && (
            <p className="text-center text-sm text-gray-400 mt-5">
              Already have an account?{" "}
              <span onClick={onSwitchToLogin} className="text-arl-secondary font-semibold cursor-pointer hover:underline">
                Login
              </span>
            </p>
          )}
        </div>
      </div>

      {/* Terms modal */}
      <TandC
        isOpen={showTerms}
        onAgree={(info) => { setTermsAccepted(true); setTermsInfo(info || null); setShowTerms(false); }}
        onCancel={() => { setTermsAccepted(false); setTermsInfo(null); setShowTerms(false); }}
      />

      {/* Post-registration approval notice */}
      {showApproval && (
        <ApprovalModal onClose={() => { setShowApproval(false); onClose(); }} />
      )}
    </>
  );
};

export default SignUpModal;
