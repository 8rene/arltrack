// HandoverCard.jsx
// Pickup handover on the booking details page. Opens 24 hours before pickup (the server decides),
// and lets the renter confirm a few statements and sign with their typed name. For a self-drive
// booking the renter also lists any additional drivers (name + licence number) so a traffic
// violation can later be traced to the right person. The staff then check the licence at the
// counter in the admin app, and that shows up here as "verified".
import { useCallback, useEffect, useState } from "react";
import { useToast } from "../../context/ToastContext";

const API = process.env.REACT_APP_API_URL;
const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("arl_token")}` });
const fmt = (iso) => (iso ? new Date(iso).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "—");

export default function HandoverCard({ bookingID }) {
  const { showToast } = useToast();
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/handovers/${bookingID}`, { headers: headers() });
      if (res.ok) setData(await res.json());
    } catch { /* the card is optional — stay hidden if it can't load */ }
  }, [bookingID]);

  useEffect(() => { load(); }, [load]);

  if (!data) return null;
  const signed = data.handover;
  const showOpensNote = !signed && !data.eligible && data.reason === "opens" && data.status === "upcoming";
  if (!signed && !data.eligible && !showOpensNote) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <p className="text-xs font-black text-arl-primary uppercase tracking-widest mb-3">🤝 Pickup Handover</p>

      {signed && (
        <div className="text-sm text-gray-700 space-y-1">
          <p className="font-semibold text-green-700">✅ Signed by {signed.signedName} on {fmt(signed.signedAt)}</p>
          {signed.drivers.length > 0 && (
            <p className="text-xs text-gray-600">
              Drivers: {signed.drivers.map((d) => `${d.fullName}${d.role === "renter" ? " (renter)" : d.licenseLast4 ? ` (licence ····${d.licenseLast4})` : ""}`).join(", ")}
            </p>
          )}
          <p className="text-xs text-gray-500">
            {signed.verifiedAt ? `Checked by our staff on ${fmt(signed.verifiedAt)}.` : "Our staff will check your driver's licence at the counter."}
          </p>
        </div>
      )}

      {showOpensNote && (
        <p className="text-sm text-gray-600">You'll be able to sign your pickup handover from {fmt(data.opensAt)} (24 hours before pickup).</p>
      )}

      {data.eligible && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-sm text-gray-600 flex-1">Please review and sign your pickup handover when you collect the vehicle.</p>
          <button onClick={() => setOpen(true)}
            className="px-5 py-2.5 bg-arl-primary text-white rounded-full text-sm font-bold hover:bg-arl-secondary transition">
            Sign handover
          </button>
        </div>
      )}

      {open && (
        <HandoverModal bookingID={bookingID} data={data}
          onClose={() => setOpen(false)}
          onDone={() => { setOpen(false); showToast("Handover signed. Thank you.", "success"); load(); }}
          onStale={() => { load(); }} />
      )}
    </div>
  );
}

function HandoverModal({ bookingID, data, onClose, onDone, onStale }) {
  const [signedName, setSignedName] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [extra, setExtra] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const setDriver = (i, key, value) => setExtra((rows) => rows.map((r, j) => (j === i ? { ...r, [key]: value } : r)));

  const submit = async () => {
    setError("");
    if (!signedName.trim()) return setError("Please type your full name.");
    if (!confirmed) return setError("Please tick the box to confirm the statements.");
    setBusy(true);
    try {
      const res = await fetch(`${API}/handovers/${bookingID}/sign`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          signedName: signedName.trim(),
          confirmed: true,
          statementsVersion: data.statementsVersion,
          drivers: extra.filter((d) => d.fullName.trim() || d.licenseNumber.trim()),
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (out.statementsChanged) onStale();
        setError(out.message || "Could not save your signature. Please try again.");
        return;
      }
      onDone();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-black text-arl-primary mb-1">Pickup handover</h3>
        <p className="text-xs text-gray-500 mb-4">Please read, then sign with your full name.</p>

        <ul className="space-y-2 mb-4">
          {data.statements.map((s, i) => (
            <li key={i} className="text-sm text-gray-700 flex gap-2"><span className="text-arl-primary font-bold">{i + 1}.</span><span>{s}</span></li>
          ))}
        </ul>

        {data.selfDrive && (
          <div className="mb-4">
            <p className="text-sm font-semibold text-gray-800 mb-1">Who will drive?</p>
            <p className="text-xs text-gray-500 mb-2">You ({data.renterName || "the renter"}) are listed automatically. Add anyone else who will drive — their licence number is needed so a violation can be traced to the right person.</p>
            {extra.map((d, i) => (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 mb-2">
                <input value={d.fullName} onChange={(e) => setDriver(i, "fullName", e.target.value)} placeholder="Full name"
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                <input value={d.licenseNumber} onChange={(e) => setDriver(i, "licenseNumber", e.target.value)} placeholder="Licence number"
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                <button type="button" onClick={() => setExtra((rows) => rows.filter((_, j) => j !== i))}
                  className="text-xs text-red-500 font-semibold px-2">Remove</button>
              </div>
            ))}
            {extra.length < data.maxAdditionalDrivers && (
              <button type="button" onClick={() => setExtra((rows) => [...rows, { fullName: "", licenseNumber: "" }])}
                className="text-sm font-semibold text-arl-secondary hover:underline">+ Add another driver</button>
            )}
          </div>
        )}

        <label className="flex items-start gap-2.5 cursor-pointer text-sm text-gray-700 mb-3">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-arl-primary" />
          <span>I confirm the statements above.</span>
        </label>

        <label className="block text-sm font-semibold text-gray-800 mb-1">Type your full name to sign</label>
        <input value={signedName} onChange={(e) => setSignedName(e.target.value)} placeholder={data.renterName || "Full name"}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-1" />
        <p className="text-[11px] text-gray-400 mb-3">Typing your name here counts as your electronic signature.</p>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-full border border-gray-200 text-sm font-semibold text-gray-600">Cancel</button>
          <button onClick={submit} disabled={busy}
            className="flex-1 py-2.5 rounded-full bg-arl-primary text-white text-sm font-bold disabled:opacity-60">
            {busy ? "Saving…" : "Sign handover"}
          </button>
        </div>
      </div>
    </div>
  );
}
