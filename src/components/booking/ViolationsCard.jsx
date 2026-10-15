// ViolationsCard.jsx
// Traffic notices for one booking: the ones recorded for it, and a form for the renter to report
// a ticket or notice they received. Reports are only accepted once the rental has started (the
// server enforces it too). Staff work each notice through to recovery in the admin app.
import { useCallback, useEffect, useState } from "react";
import { useToast } from "../../context/ToastContext";

const API = process.env.REACT_APP_API_URL;
const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("arl_token")}` });
const fmt = (iso) => (iso ? new Date(iso).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "—");
const peso = (v) => `₱${Number(v || 0).toLocaleString()}`;

const STATUS = {
  reported:       ["We're reviewing your report", "bg-amber-50 text-amber-700"],
  recorded:       ["Recorded by our team", "bg-blue-50 text-blue-700"],
  "under review": ["Under review", "bg-amber-50 text-amber-700"],
  contesting:     ["Being contested", "bg-blue-50 text-blue-700"],
  paid:           ["Paid", "bg-green-50 text-green-700"],
  billed:         ["Billed to you", "bg-red-50 text-red-700"],
  recovered:      ["Settled", "bg-green-50 text-green-700"],
  dismissed:      ["Dismissed", "bg-gray-100 text-gray-600"],
};

// value for <input type="datetime-local"> (local clock, minutes precision)
const localInputValue = (d = new Date()) => {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function ViolationsCard({ bookingID, bookingStatus }) {
  const { showToast } = useToast();
  const [state, setState] = useState({ violations: [], types: [], loaded: false });
  const [open, setOpen] = useState(false);
  const canReport = ["ongoing", "completed"].includes(bookingStatus);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/violations/booking/${bookingID}`, { headers: headers() });
      if (res.ok) { const d = await res.json(); setState({ violations: d.violations || [], types: d.types || [], loaded: true }); }
    } catch { /* optional card */ }
  }, [bookingID]);

  useEffect(() => { load(); }, [load]);

  if (!state.loaded || (!canReport && state.violations.length === 0)) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <p className="text-xs font-black text-arl-primary uppercase tracking-widest mb-3">🚨 Traffic Notices</p>

      {state.violations.length === 0 ? (
        <p className="text-sm text-gray-600">No notices have been recorded for this booking.</p>
      ) : (
        <ul className="space-y-2 mb-3">
          {state.violations.map((v) => {
            const [label, tone] = STATUS[v.status] || [v.status, "bg-gray-100 text-gray-600"];
            return (
              <li key={v.violationID} className="rounded-xl border border-gray-100 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-semibold text-gray-800">{v.type}</span>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${tone}`}>{label}</span>
                </div>
                <p className="text-xs text-gray-600">{fmt(v.occurredAt)} · {v.location}</p>
                <p className="text-xs text-gray-500">
                  {v.noticeNumber ? `Notice ${v.noticeNumber}` : "No notice number"}{v.amount != null ? ` · ${peso(v.amount)}` : ""}
                  {v.contestDeadline ? ` · Contest by ${fmt(v.contestDeadline)}` : ""}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {canReport && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-xs text-gray-500 flex-1">Received a ticket or notice during your rental? Report it right away — contest deadlines are short.</p>
          <button onClick={() => setOpen(true)} className="px-4 py-2 border border-arl-primary text-arl-primary rounded-full text-sm font-bold hover:bg-arl-primary hover:text-white transition">
            Report a ticket
          </button>
        </div>
      )}

      {open && (
        <ReportModal bookingID={bookingID} types={state.types} onClose={() => setOpen(false)}
          onDone={() => { setOpen(false); showToast("Thank you — we received your report.", "success"); load(); }} />
      )}
    </div>
  );
}

function ReportModal({ bookingID, types, onClose, onDone }) {
  const [f, setF] = useState({ type: "", occurredAt: localInputValue(), location: "", noticeNumber: "", amount: "", details: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const submit = async () => {
    setError("");
    if (!f.type) return setError("Please choose the type of violation.");
    if (!f.location.trim()) return setError("Please enter where it happened.");
    setBusy(true);
    try {
      const res = await fetch(`${API}/violations/report`, { method: "POST", headers: headers(), body: JSON.stringify({ bookingID, ...f }) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) { setError(out.message || "Could not send your report. Please try again."); return; }
      onDone();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const input = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-black text-arl-primary mb-1">Report a ticket or notice</h3>
        <p className="text-xs text-gray-500 mb-4">Tell us what you received. Our team will review it and contact you if we need anything else.</p>

        <label className="block text-sm font-semibold text-gray-800 mb-1">Type</label>
        <select value={f.type} onChange={set("type")} className={`${input} mb-3`}>
          <option value="">Choose…</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        <label className="block text-sm font-semibold text-gray-800 mb-1">When did it happen?</label>
        <input type="datetime-local" value={f.occurredAt} max={localInputValue()} onChange={set("occurredAt")} className={`${input} mb-3`} />

        <label className="block text-sm font-semibold text-gray-800 mb-1">Where?</label>
        <input value={f.location} onChange={set("location")} placeholder="Street / city" className={`${input} mb-3`} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1">Notice / ticket number <span className="font-normal text-gray-400">(optional)</span></label>
            <input value={f.noticeNumber} onChange={set("noticeNumber")} className={input} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1">Amount (₱) <span className="font-normal text-gray-400">(optional)</span></label>
            <input type="number" min="0" value={f.amount} onChange={set("amount")} className={input} />
          </div>
        </div>

        <label className="block text-sm font-semibold text-gray-800 mb-1">Anything else? <span className="font-normal text-gray-400">(optional)</span></label>
        <textarea value={f.details} onChange={set("details")} rows={3} maxLength={1000} className={`${input} mb-3`} />

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-full border border-gray-200 text-sm font-semibold text-gray-600">Cancel</button>
          <button onClick={submit} disabled={busy} className="flex-1 py-2.5 rounded-full bg-arl-primary text-white text-sm font-bold disabled:opacity-60">
            {busy ? "Sending…" : "Send report"}
          </button>
        </div>
      </div>
    </div>
  );
}
