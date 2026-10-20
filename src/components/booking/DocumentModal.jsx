import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// One window for the two documents a customer can open from Booking Details:
//   <DocumentModal kind="receipt"   bookingID="..." entryID="..." onClose={...} />
//   <DocumentModal kind="statement" bookingID="..."               onClose={...} />
// Both are the SAME documents the ARL staff print (same number, same figures), read from
//   GET /bookings/:id/receipts/:entryID   and   GET /bookings/:id/statement
// "Download PDF" fetches the PDF with the customer's login and saves it (the server builds it on the spot; there is no
// public link). "Email me" sends it to the address on the account -- the server never takes an address from here.

const API = process.env.REACT_APP_API_URL;
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("arl_token")}` });

const peso = (n) => `₱${(Number(n) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtWhen = (iso) => { const d = iso ? new Date(iso) : null; return d && !isNaN(d) ? d.toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }) : "—"; };
const fmtDay = (iso) => { const d = iso ? new Date(iso) : null; return d && !isNaN(d) ? d.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" }) : null; };
const METHOD = { gcash: "GCash", maya: "Maya", qrph: "QR Ph", cash: "Cash", bank_transfer: "Bank transfer" };
const DEPOSIT_LABEL = { Held: "Still held", Settled: "Settled", Waived: "Waived", Forfeited: "Forfeited", Refunded: "Refunded" };
// what a customer reads for money that is not done yet
export const pendingLabel = (l) => (l.status === "unrefundable" ? "We'll contact you to hand it back" : l.direction === "out" ? "Refund being processed" : "Awaiting confirmation");
const detailLine = (l) => [fmtWhen(l.date), METHOD[l.method] || l.method, l.source === "in_person" ? "In person" : null, l.referenceNumber ? `Ref. ${l.referenceNumber}` : null]
  .filter((v) => v && v !== "—").join(" · ");

function Row({ label, children, strong = false }) {
  if (children == null || children === "") return null;
  return (
    <div className={`flex justify-between gap-4 text-sm py-0.5 ${strong ? "font-bold" : ""}`}>
      <span className={strong ? "text-gray-900" : "text-gray-500"}>{label}</span>
      <span className="text-right text-gray-900 break-words">{children}</span>
    </div>
  );
}
function Section({ title, children }) {
  return (
    <div className="border-t border-dashed border-gray-300 pt-3 space-y-1.5">
      <p className="text-[11px] font-black uppercase tracking-widest text-arl-primary">{title}</p>
      {children}
    </div>
  );
}
function Item({ label, detail, amount, bold = true }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <div className="min-w-0">
        <p className="text-gray-800">{label}</p>
        {detail && <p className="text-xs text-gray-500 break-words">{detail}</p>}
      </div>
      <span className={`text-gray-900 whitespace-nowrap ${bold ? "font-semibold" : ""}`}>{amount}</span>
    </div>
  );
}

function ReceiptBody({ r }) {
  const out = r.direction === "out";
  const period = fmtDay(r.booking?.startDateTime) ? `${fmtDay(r.booking.startDateTime)} – ${fmtDay(r.booking.endDateTime) || "—"}` : null;
  return (
    <div className="space-y-4">
      <div className="border-t border-dashed border-gray-300 pt-3">
        <Row label="Receipt no.">{r.receiptNo}</Row>
        <Row label={out ? "Paid to" : "Received from"}>{r.customer?.name}</Row>
        <Row label="Booking">{r.booking?.bookingID}</Row>
        <Row label="Vehicle">{r.booking?.vehicle}</Row>
        <Row label="Rental period">{period}</Row>
      </div>

      <Section title={out ? "Returned" : "Paid for"}>
        {r.lines.map((l, i) => <Item key={i} label={l.label} amount={peso(l.amount)} />)}
        <div className="border-t border-gray-200 mt-1 pt-1"><Row label={out ? "Total returned" : "Total received"} strong>{peso(r.total)}</Row></div>
        {r.note && <p className="text-xs text-gray-500 pt-1">{r.note}</p>}
      </Section>

      {(r.penalties || []).map((p, i, all) => (
        <Section key={i} title={all.length > 1 ? `Penalty ${i + 1}` : "Penalty charges"}>
          {p.items.map((it, j) => <Item key={j} label={it.description} amount={peso(it.amount)} bold={false} />)}
          {p.total != null && (
            <div className="border-t border-gray-200 mt-1 pt-1">
              <Row label="Penalty total">{peso(p.total)}</Row>
              {p.paidBefore > 0 && <Row label="Paid before">{peso(p.paidBefore)}</Row>}
              {p.coveredByDeposit > 0 && <Row label="Covered by security deposit">{peso(p.coveredByDeposit)}</Row>}
              {p.coveredByCredit > 0 && <Row label="Covered by discount credit">{peso(p.coveredByCredit)}</Row>}
              <Row label="This payment">{peso(p.thisPayment)}</Row>
              <Row label="Remaining" strong>{peso(p.remaining)}</Row>
            </div>
          )}
        </Section>
      ))}

      {r.depositSummary && (
        <Section title="Security deposit">
          <Row label="Deposit held">{peso(r.depositSummary.held)}</Row>
          <Row label="Used for penalties">{peso(r.depositSummary.usedForPenalties)}</Row>
          <Row label="Returned to you" strong>{peso(r.depositSummary.returned)}</Row>
        </Section>
      )}

      <Section title="Payment">
        <Row label="Method">{METHOD[r.method] || r.method}</Row>
        <Row label="Channel">{r.source === "in_person" ? "In person" : "Online"}</Row>
        <Row label="Reference no.">{r.referenceNumber}</Row>
      </Section>

      {r.summary && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
          <Row label="Booking total">{peso(r.summary.bookingTotal)}</Row>
          <Row label="Paid to date">{peso(r.summary.paidToDate)}</Row>
          <Row label="Balance remaining" strong>{peso(r.summary.balanceAfter)}</Row>
        </div>
      )}
    </div>
  );
}

function StatementBody({ s }) {
  const o = s.overall;
  const period = fmtDay(s.booking.startDateTime) ? `${fmtDay(s.booking.startDateTime)} – ${fmtDay(s.booking.endDateTime) || "—"}` : null;
  return (
    <div className="space-y-4">
      <div className="border-t border-dashed border-gray-300 pt-3">
        <Row label="Statement no.">{s.statementNo}</Row>
        <Row label="Booking">{s.booking.bookingID}</Row>
        <Row label="Vehicle">{s.booking.vehicle}</Row>
        <Row label="Rental period">{period}</Row>
      </div>

      <Section title="Payments">
        {s.payments.length === 0 && <p className="text-sm text-gray-400 italic">No payments have been recorded yet.</p>}
        {s.payments.map((l, i) => <Item key={l.id} label={`${i + 1}. ${l.label}`} detail={detailLine(l)} amount={peso(l.amount)} />)}
        {s.charges && (
          <div className="border-t border-gray-200 mt-1 pt-1">
            <Row label="Booking total">{peso(s.charges.total)}</Row>
            {s.charges.discount > 0 && <Row label={`Discount applied${s.charges.discountReason ? ` (${s.charges.discountReason})` : ""}`}>{peso(s.charges.discount)}</Row>}
            <Row label="Total paid">{peso(s.paymentTotals.paid)}</Row>
            <Row label="Balance remaining" strong>{peso(s.paymentTotals.balanceRemaining)}</Row>
          </div>
        )}
      </Section>

      {s.pending.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-1.5">
          <p className="text-[11px] font-black uppercase tracking-widest text-amber-800">Pending · not counted in any total</p>
          {s.pending.map((l) => (
            <Item key={l.id} label={`${l.label}${l.direction === "out" ? " (money back to you)" : ""}`} detail={pendingLabel(l)} amount={peso(l.amount)} bold={false} />
          ))}
        </div>
      )}

      <Section title="Penalties">
        {s.penalties.length === 0 && <p className="text-sm text-gray-400 italic">No penalties on this booking.</p>}
        {s.penalties.map((p, i) => (
          <div key={p.penaltyID || i} className={`rounded-xl border p-3 space-y-1 ${p.active ? "border-gray-200" : "border-gray-200 bg-gray-50"}`}>
            <p className="text-xs font-bold text-gray-600">Penalty {i + 1}{!p.active && <span className="font-medium text-gray-500"> · {p.status} (not counted)</span>}</p>
            {p.items.map((it, j) => <Item key={j} label={it.description} amount={peso(it.amount)} bold={false} />)}
            <div className="border-t border-gray-200 mt-1 pt-1">
              <Row label="Penalty total">{peso(p.amount)}</Row>
              {p.active ? (
                <>
                  {p.payments.map((l) => (
                    <React.Fragment key={l.id}>
                      <Item label="Paid" detail={detailLine(l)} amount={peso(l.amount)} bold={false} />
                      {Number(l.fee) > 0 && <Item label="Online payment fee" amount={peso(l.fee)} bold={false} />}
                    </React.Fragment>
                  ))}
                  {p.coveredByDeposit > 0 && <Row label="Covered by security deposit">{peso(p.coveredByDeposit)}</Row>}
                  {p.coveredByCredit > 0 && <Row label="Covered by discount credit">{peso(p.coveredByCredit)}</Row>}
                  <Row label="Still owed on this penalty" strong>{peso(p.outstanding)}</Row>
                </>
              ) : (p.reason && <p className="text-xs text-gray-500 pt-0.5">{p.reason}</p>)}
            </div>
          </div>
        ))}
        {s.penaltyTotals.count > 0 && (
          <div className="border-t border-gray-300 pt-1">
            <Row label="Total penalties">{peso(s.penaltyTotals.charged)}</Row>
            <Row label="Paid (cash / online)">{peso(s.penaltyTotals.paid)}</Row>
            {s.penaltyTotals.coveredByDeposit > 0 && <Row label="Covered by security deposit">{peso(s.penaltyTotals.coveredByDeposit)}</Row>}
            {s.penaltyTotals.coveredByCredit > 0 && <Row label="Covered by discount credit">{peso(s.penaltyTotals.coveredByCredit)}</Row>}
            <Row label="Still owed on penalties" strong>{peso(s.penaltyTotals.outstanding)}</Row>
          </div>
        )}
      </Section>

      {s.deposit && (
        <Section title="Security deposit">
          <Row label="Deposit held">{peso(s.deposit.held)}</Row>
          <Row label="Used for penalties">{peso(s.deposit.usedForPenalties)}</Row>
          <Row label="Returned to you">{peso(s.deposit.returned)}</Row>
          {s.deposit.status && <Row label="Status" strong>{DEPOSIT_LABEL[s.deposit.status] || s.deposit.status}</Row>}
        </Section>
      )}
      {s.refunds.length > 0 && (
        <Section title="Refunds">
          {s.refunds.map((l) => <Item key={l.id} label={l.label} detail={detailLine(l)} amount={peso(l.amount)} />)}
        </Section>
      )}

      <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
        <p className="text-[11px] font-black uppercase tracking-widest text-arl-primary pb-1">Overall</p>
        <Row label="Total charges">{peso(o.totalCharges)}</Row>
        <Row label="Total paid">{peso(o.paidIn)}</Row>
        {o.coveredByDeposit > 0 && <Row label="Covered by security deposit">{peso(o.coveredByDeposit)}</Row>}
        {o.coveredByCredit > 0 && <Row label="Covered by discount credit">{peso(o.coveredByCredit)}</Row>}
        {o.onlineFees > 0 && <Row label="Online payment fees (not counted above)">{peso(o.onlineFees)}</Row>}
        {o.refunded > 0 && <Row label="Refunded to you">{peso(o.refunded)}</Row>}
        {o.depositReturned > 0 && <Row label="Security deposit returned">{peso(o.depositReturned)}</Row>}
        <div className="border-t border-blue-200 mt-1 pt-1">
          <Row label="Net received">{peso(o.netReceived)}</Row>
          <Row label="Amount still owed" strong>{peso(o.stillOwed)}</Row>
        </div>
      </div>
    </div>
  );
}

export default function DocumentModal({ kind, bookingID, entryID, onClose }) {
  const isStatement = kind === "statement";
  const base = `${API}/bookings/${encodeURIComponent(bookingID)}/${isStatement ? "statement" : `receipts/${encodeURIComponent(entryID)}`}`;

  const [state, setState] = useState({ loading: true, error: "", doc: null });
  const [mail, setMail] = useState({ stage: "idle", ok: null, msg: "" });   // idle -> confirm -> sending
  const [dl, setDl] = useState({ busy: false, error: "" });

  useEffect(() => {
    let alive = true;
    setState({ loading: true, error: "", doc: null });
    fetch(base, { headers: authHeaders() })
      .then(async (res) => { const json = await res.json().catch(() => ({})); if (!res.ok) throw new Error(json.message || "Could not load this document."); return json.data; })
      .then((doc) => alive && setState({ loading: false, error: "", doc }))
      .catch((e) => alive && setState({ loading: false, error: e.message, doc: null }));
    return () => { alive = false; };
  }, [base]);

  // Escape closes only this window
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.stopImmediatePropagation(); onClose?.(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const download = async () => {
    setDl({ busy: true, error: "" });
    try {
      const res = await fetch(`${base}/pdf`, { headers: authHeaders() });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message || "Could not download the PDF."); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${state.doc?.receiptNo || state.doc?.statementNo || "document"}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setDl({ busy: false, error: "" });
    } catch (e) { setDl({ busy: false, error: e.message }); }
  };

  const sendEmail = async () => {
    setMail({ stage: "sending", ok: null, msg: "" });
    try {
      const res = await fetch(`${base}/email`, { method: "POST", headers: authHeaders() });
      const json = await res.json().catch(() => ({}));
      setMail({ stage: "idle", ok: res.ok, msg: json.message || (res.ok ? "Sent to your email." : "Couldn't send the email.") });
    } catch { setMail({ stage: "idle", ok: false, msg: "Couldn't reach the server. Please try again." }); }
  };

  const { loading, error, doc } = state;
  const stop = (e) => e.stopPropagation();

  return createPortal(
    <div className="fixed inset-0 z-[3000] bg-black/50 overflow-auto p-3 sm:p-6" onClick={() => onClose?.()}>
      <div className="mx-auto max-w-lg bg-white rounded-2xl shadow-xl border border-gray-200 p-5 sm:p-6" onClick={stop}>
        {loading && <p className="text-sm text-gray-400 py-10 text-center">Preparing…</p>}
        {error && (
          <div className="space-y-3">
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>
            <button onClick={onClose} className="w-full rounded-full border border-gray-300 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Close</button>
          </div>
        )}

        {doc && (
          <div className="space-y-4">
            <div className="text-center space-y-0.5">
              <p className="text-lg font-black text-arl-primary">{doc.business.name}</p>
              {doc.business.address && <p className="text-xs text-gray-500">{doc.business.address}</p>}
              {(doc.business.phone || doc.business.email) && <p className="text-xs text-gray-500">{[doc.business.phone, doc.business.email].filter(Boolean).join(" · ")}</p>}
              <p className="pt-2 text-sm font-bold uppercase tracking-wide text-gray-700">{doc.title}</p>
              <p className="text-xs text-gray-500">{isStatement ? `As of ${fmtWhen(doc.asOf)}` : fmtWhen(doc.date)}</p>
            </div>

            {isStatement ? <StatementBody s={doc} /> : <ReceiptBody r={doc} />}

            <p className="text-[11px] text-gray-400 text-center border-t border-dashed border-gray-300 pt-3">
              {isStatement
                ? `This statement shows your booking as of ${fmtWhen(doc.asOf)}. Later payments or charges are not included.`
                : "This is a system-generated acknowledgment of the transaction above."}
            </p>

            <div className="space-y-2">
              {mail.msg && <p className={`text-xs rounded-lg border p-2 ${mail.ok ? "text-green-700 bg-green-50 border-green-200" : "text-red-600 bg-red-50 border-red-200"}`}>{mail.msg}</p>}
              {dl.error && <p className="text-xs rounded-lg border p-2 text-red-600 bg-red-50 border-red-200">{dl.error}</p>}

              {mail.stage !== "idle" && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 space-y-2">
                  <p className="text-sm text-blue-900">Send this {isStatement ? "statement" : "receipt"} to <b>{doc.customer.emailMasked || "your email"}</b>?</p>
                  <div className="flex gap-2">
                    <button disabled={mail.stage === "sending"} onClick={() => setMail({ stage: "idle", ok: null, msg: "" })} className="flex-1 rounded-full border border-gray-300 bg-white py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
                    <button disabled={mail.stage === "sending"} onClick={sendEmail} className="flex-1 rounded-full bg-arl-primary py-1.5 text-sm font-bold text-white hover:bg-arl-secondary disabled:opacity-50">{mail.stage === "sending" ? "Sending…" : "Send"}</button>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2">
                <button onClick={onClose} className="sm:flex-1 rounded-full border border-gray-300 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Close</button>
                <button disabled={!doc.customer.emailMasked || mail.stage !== "idle"} onClick={() => setMail({ stage: "confirm", ok: null, msg: "" })}
                  className="sm:flex-1 rounded-full border border-arl-primary py-2 text-sm font-bold text-arl-primary hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed">Email me</button>
                <button disabled={dl.busy} onClick={download}
                  className="sm:flex-1 rounded-full bg-arl-primary py-2 text-sm font-bold text-white hover:bg-arl-secondary disabled:opacity-60">{dl.busy ? "Preparing PDF…" : "Download PDF"}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}