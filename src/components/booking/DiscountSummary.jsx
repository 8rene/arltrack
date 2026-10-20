// What the customer sees about a staff discount. The numbers come from `payment.discount`, built by the customer
// backend (utils/payments/discountView.util.js) from the same ledger the admin app uses:
//
//   offBalance        came off what they still owed: the booking really costs this much less
//   usedForPenalties  was used to pay a penalty
//   held              credit still held for them: the booking was already fully paid, so the discount is returned after the
//                     trip together with the security deposit. It is NOT a lower price.
//   returned          credit already sent back (returnedInRefund of it went back inside a cancellation refund)
//   payout            the credit's own payout: { state: processing | returned | failed, amount, via, method }
//   priceOff          the pesos to take off the total shown
//
// An older backend sends only `discountAmount` (no `discount`): everything below falls back to the old meaning.

const peso = (n) => `₱${Number(n || 0).toLocaleString()}`;

/** Pesos to subtract from the booking total shown to the customer. */
export const discountPriceOff = (payment) => {
  if (!payment) return 0;
  const d = payment.discount;
  if (d && typeof d.priceOff === "number") return d.priceOff;
  return Number(payment.discountAmount) || 0;
};

const viaText = (payout) =>
  payout.via === "paymongo" ? "to your original payment method" : payout.method ? `in store (${payout.method})` : "in store";

const Line = ({ label, amount, note, tone = "text-green-800" }) => (
  <div>
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-gray-700">{label}</span>
      <span className={`text-sm font-bold ${tone}`}>{peso(amount)}</span>
    </div>
    {note && <p className="text-xs text-gray-500 mt-0.5">{note}</p>}
  </div>
);

/** A one-line reminder for a booking card: credit is held for the customer. Renders nothing otherwise. */
export const DiscountHeldPill = ({ discount }) => {
  if (!discount || !(discount.held > 0)) return null;
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border bg-green-50 text-green-700 border-green-200">
      {peso(discount.held)} discount held, returned after your trip
    </span>
  );
};

export default function DiscountSummary({ discount, className = "" }) {
  if (!discount || !(discount.total > 0)) return null;
  const d = discount;
  const payout = d.payout || null;
  // The part of `returned` that was paid out on its own (the rest went back inside a cancellation refund).
  const paidOutPart = Math.max(0, (d.returned || 0) - (d.returnedInRefund || 0));

  const lines = [];
  if (d.status === "legacy") {
    lines.push(<Line key="legacy" label="Taken off your booking total" amount={d.total} />);
  } else {
    if (d.offBalance > 0) lines.push(<Line key="off" label="Taken off what you owe" amount={d.offBalance} />);
    if (d.usedForPenalties > 0) lines.push(<Line key="pen" label="Used to pay a penalty" amount={d.usedForPenalties} />);
    if (d.held > 0) {
      lines.push(
        <Line key="held" label="Held for you" amount={d.held}
          note="Your booking was already fully paid, so this discount is returned to you after your trip, together with your security deposit." />
      );
    }
    if (d.returnedInRefund > 0) {
      lines.push(<Line key="inrefund" label="Returned with your refund" amount={d.returnedInRefund} note="It was included in your cancellation refund." />);
    }
    if (payout && payout.state === "processing") {
      lines.push(
        <Line key="proc" label="Being returned to you" amount={payout.amount} tone="text-amber-700"
          note={`Sent ${viaText(payout)}. It can take a few days to show.`} />
      );
    } else if (payout && payout.state === "returned") {
      lines.push(<Line key="ret" label="Returned to you" amount={payout.amount} note={`Returned ${viaText(payout)}.`} />);
    } else if (payout && payout.state === "failed") {
      lines.push(
        <Line key="fail" label="Return needs attention" amount={payout.amount} tone="text-red-600"
          note="We couldn't send this back automatically. Our staff will return it to you, you don't need to do anything." />
      );
    } else if (paidOutPart > 0) {
      lines.push(<Line key="ret2" label="Returned to you" amount={paidOutPart} />);
    }
  }

  return (
    <div className={`rounded-xl border border-green-200 bg-green-50/60 px-4 py-3 ${className}`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-black text-green-800 uppercase tracking-widest">Discount</p>
        <p className="text-sm font-black text-green-700">{peso(d.total)}</p>
      </div>
      {d.reason && <p className="text-xs text-green-800/80 mt-0.5">{d.reason}</p>}
      {lines.length > 0 && <div className="mt-2 space-y-2">{lines}</div>}
    </div>
  );
}
