import { useEffect, useState } from "react";
import DocumentModal, { pendingLabel } from "./DocumentModal";

// "Payments & Receipts" on Booking Details: every peso that moved on this booking, in and out, with a receipt for each,
// plus the booking statement. Read from GET /bookings/:id/statement (the same figures the ARL staff see). Hides itself while
// loading, on error, or before anything was paid, so it can never block the page.

const API = process.env.REACT_APP_API_URL;
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("arl_token")}` });
const peso = (n) => `₱${(Number(n) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtWhen = (iso) => { const d = iso ? new Date(iso) : null; return d && !isNaN(d) ? d.toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }) : "—"; };
const METHOD = { gcash: "GCash", maya: "Maya", qrph: "QR Ph", cash: "Cash", bank_transfer: "Bank transfer" };

export default function PaymentsReceiptsCard({ bookingID }) {
  const [s, setS] = useState(null);          // null = loading / unavailable
  const [open, setOpen] = useState(null);    // { kind: "receipt", entryID } | { kind: "statement" }
  const [busy, setBusy] = useState("");      // entryID whose PDF is downloading
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    setS(null);
    fetch(`${API}/bookings/${encodeURIComponent(bookingID)}/statement`, { headers: authHeaders() })
      .then(async (res) => { if (!res.ok) throw new Error(); return (await res.json()).data; })
      .then((data) => alive && setS(data))
      .catch(() => alive && setS(null));
    return () => { alive = false; };
  }, [bookingID]);

  const downloadPdf = async (m) => {
    setBusy(m.entryID); setErr("");
    try {
      const res = await fetch(`${API}/bookings/${encodeURIComponent(bookingID)}/receipts/${encodeURIComponent(m.entryID)}/pdf`, { headers: authHeaders() });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message || "Could not download the PDF."); }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url; a.download = `${m.receiptNo}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) { setErr(e.message); }
    finally { setBusy(""); }
  };

  if (!s || (s.movements.length === 0 && s.pending.length === 0)) return null;
  const o = s.overall;
  const returned = (o.refunded || 0) + (o.depositReturned || 0);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-xs font-black text-arl-primary uppercase tracking-widest">Payments &amp; Receipts</p>
        <button type="button" onClick={() => setOpen({ kind: "statement" })}
          className="px-3.5 py-1.5 rounded-full border border-arl-primary text-arl-primary text-xs font-bold hover:bg-arl-primary hover:text-white transition whitespace-nowrap">
          Booking statement
        </button>
      </div>

      {/* totals */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="rounded-xl bg-gray-50 p-3">
          <p className="text-[11px] text-gray-500">Paid</p>
          <p className="text-sm font-black text-gray-900">{peso(o.paidIn)}</p>
        </div>
        <div className="rounded-xl bg-gray-50 p-3">
          <p className="text-[11px] text-gray-500">Returned to you</p>
          <p className="text-sm font-black text-gray-900">{peso(returned)}</p>
        </div>
        <div className={`rounded-xl p-3 ${o.stillOwed > 0 ? "bg-amber-50" : "bg-green-50"}`}>
          <p className="text-[11px] text-gray-500">Still owed</p>
          <p className={`text-sm font-black ${o.stillOwed > 0 ? "text-amber-800" : "text-green-700"}`}>{peso(o.stillOwed)}</p>
        </div>
      </div>

      {/* money flow */}
      <ul className="divide-y divide-gray-100">
        {s.movements.map((m) => {
          const out = m.direction === "out";
          return (
            <li key={m.entryID} className="py-2.5 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">{m.label}{m.count > 1 ? ` (${m.count} penalties)` : ""}</p>
                <p className="text-xs text-gray-500">{[fmtWhen(m.date), METHOD[m.method] || m.method].filter(Boolean).join(" · ")}</p>
                <p className="text-[11px] text-gray-400 font-mono">{m.receiptNo}</p>
                <div className="flex gap-3 mt-1">
                  <button type="button" onClick={() => setOpen({ kind: "receipt", entryID: m.entryID })} className="text-xs font-semibold text-arl-secondary hover:underline">View</button>
                  <button type="button" disabled={busy === m.entryID} onClick={() => downloadPdf(m)} className="text-xs font-semibold text-arl-secondary hover:underline disabled:opacity-50">
                    {busy === m.entryID ? "Preparing…" : "PDF"}
                  </button>
                </div>
              </div>
              <div className="text-right">
                {/* a penalty paid online also carried the online payment fee: show what was really charged */}
                <p className={`text-sm font-bold whitespace-nowrap ${out ? "text-green-700" : "text-gray-900"}`}>{out ? "+ " : ""}{peso(out ? m.amount : m.amount + (Number(m.fee) || 0))}</p>
                {!out && Number(m.fee) > 0 && <p className="text-[11px] text-gray-400 whitespace-nowrap">incl. {peso(m.fee)} online fee</p>}
              </div>
            </li>
          );
        })}
      </ul>
      {err && <p className="text-xs text-red-500 mt-2">{err}</p>}

      {/* not done yet: listed, never counted */}
      {s.pending.length > 0 && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-1.5">
          <p className="text-[11px] font-black uppercase tracking-widest text-amber-800">In progress</p>
          {s.pending.map((l) => (
            <div key={l.id} className="flex justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="text-gray-800">{l.label}{l.direction === "out" ? " (money back to you)" : ""}</p>
                <p className="text-xs text-amber-800">{pendingLabel(l)}</p>
              </div>
              <span className="text-gray-900 whitespace-nowrap">{peso(l.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {open && <DocumentModal kind={open.kind} bookingID={bookingID} entryID={open.entryID} onClose={() => setOpen(null)} />}
    </div>
  );
}
