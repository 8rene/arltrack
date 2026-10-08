import React, { useEffect, useRef } from "react";
import { usePolicySettings } from "../../utils/policySettings";

const buildSections = ({ depositText, serviceFeePercent, gatewayFeePercent, fullRefundHours }) => [
  {
    num: "01",
    title: "Acceptance of Agreement",
    body: "By renting a vehicle from ARL Car Rental, the renter agrees to comply with all terms, policies, and conditions stated in this agreement. These conditions protect both the renter and the business.",
  },
  {
    num: "02",
    title: "Reservation & Booking Policy",
    body: `Reservations are confirmed only once the required deposit is received. A minimum deposit of ${depositText} is required to secure your rental date. Pencil bookings without deposit are not accepted — priority goes to the first customer who completes payment.`,
  },
  {
    num: "03",
    title: "Rental Inquiries and Approval",
    body: "Upon receiving an inquiry, the supervisor verifies the requested rental date, vehicle type, rental duration, and type of service (self-drive or with driver) before approving the booking.",
  },
  {
    num: "04",
    title: "Payment Terms",
    highlight: `${serviceFeePercent}% service fee (of the rental fee) · ${gatewayFeePercent}% online gateway fee (of the booking total)`,
    body: "Full payment must be completed before the vehicle is released. Discounts for PWD, Senior Citizen, or other ID cards are not applicable to this service.",
  },
  {
    num: "05",
    title: "Cancellation & Refund Policy",
    list: [
      { label: `${fullRefundHours} hrs or more before pickup`, value: "Full refund of everything you paid" },
      { label: `Less than ${fullRefundHours} hrs before pickup`, value: `Everything refunded except the ${depositText} deposit` },
      { label: "No-show", value: `${depositText} deposit forfeited; everything else refunded` },
    ],
    body: `The ${fullRefundHours} hours are counted from the moment you send your refund request, not from the moment it is reviewed. Service and gateway fees are refunded together with your booking amount; when a refund falls under the ${fullRefundHours}-hour limit, only the ${depositText} deposit is withheld. Rescheduling is allowed with at least 24 hours' notice, subject to vehicle availability.`,
  },
  {
    num: "06",
    title: "Vehicle Pickup & Identification",
    body: "A valid government-issued ID must be presented on the scheduled pickup date. Failure to provide valid identification may result in cancellation without refund.",
  },
  {
    num: "07",
    title: "Driver Requirements (Self-Drive)",
    list: [
      { label: "Minimum age", value: "21 years old" },
      { label: "License", value: "Valid Philippine driver's license" },
      { label: "Primary driver", value: "Only the registered renter may drive" },
    ],
  },
  {
    num: "08",
    title: "Vehicle Usage",
    body: "The vehicle must only be used for lawful purposes. Strictly prohibited: subletting, illegal transport, off-road use, smoking inside the vehicle, and transporting hazardous or prohibited materials.",
  },
  {
    num: "09",
    title: "Rental Time & Destination Selection",
    body: "The renter is solely responsible for carefully choosing the pickup date, pickup time, and rental duration, and for making sure the selected schedule gives enough time to complete the entire trip, including travel to and from every destination, traffic, rest stops, and possible delays. The destination entered during booking is recorded for documentation and record-keeping purposes only. The ARL booking system does not calculate or estimate travel time or distance based on the selected destination, and an accepted booking does not mean that the chosen schedule is sufficient for the trip. Any time used beyond the agreed return time, including time lost because the schedule was underestimated, is treated as a late return and is charged under Late Return & Penalties.",
  },
  {
    num: "10",
    title: "Security Deposit",
    body: "A security deposit may be required prior to vehicle release. It will be refunded in full upon return of the vehicle in satisfactory condition with no outstanding charges.",
  },
  {
    num: "11",
    title: "Accidents & Incidents",
    body: "In the event of an accident: stop immediately, contact ARL Car Rental, and file a PNP report. Do not admit fault or settle with third parties without prior written consent from ARL Car Rental.",
  },
  {
    num: "12",
    title: "Damages & Repair Liability",
    body: "The renter is responsible for all damages during the rental period — whether caused by accident, negligence, or misuse. Charges include repair costs, replacement costs, and administrative fees.",
  },
  {
    num: "13",
    title: "Fuel Policy",
    body: "Fuel and toll fees are the renter's full responsibility. Vehicles must be returned with the same fuel level. A handling fee applies if returned with less fuel than provided.",
  },
  {
    num: "14",
    title: "Late Return & Penalties",
    highlight: "₱100.00 per hour beyond the agreed return time",
    body: "Failure to return the vehicle within 12 hours without prior communication may result in the unit being treated as unreturned and subject to legal action.",
  },
  {
    num: "15",
    title: "Number Coding Scheme (UVVRP)",
    body: "Enforced 7:00 AM – 7:00 PM on weekdays in Metro Manila:",
    list: [
      { label: "Monday", value: "Plates ending in 1 or 2" },
      { label: "Tuesday", value: "Plates ending in 3 or 4" },
      { label: "Wednesday", value: "Plates ending in 5 or 6" },
      { label: "Thursday", value: "Plates ending in 7 or 8" },
      { label: "Friday", value: "Plates ending in 9 or 0" },
    ],
  },
  {
    num: "16",
    title: "Vehicle Security & Responsibility",
    body: "The renter assumes full responsibility for the vehicle and its contents during the entire rental period. ARL Car Rental is not liable for any loss of personal belongings left inside the vehicle.",
  },
  {
    num: "17",
    title: "Force Majeure",
    body: "Neither party is liable for failure due to circumstances beyond reasonable control — natural disasters, typhoons, floods, government-imposed restrictions, road closures, or civil unrest.",
  },
  {
    num: "18",
    title: "Governing Law",
    body: "This agreement is governed by the laws of the Republic of the Philippines. Disputes shall be submitted to the proper courts where ARL Car Rental's principal office is located.",
  },
];

const TandC = ({ isOpen, onAgree, onCancel }) => {
  const policy = usePolicySettings();
  const SECTIONS = buildSections(policy);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white w-full max-w-xl rounded-3xl shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: "88vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-8 pt-8 pb-5 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold tracking-[0.2em] text-arl-secondary uppercase mb-1">ARL Car Rental</p>
              <h2 className="font-display text-2xl text-arl-primary leading-tight">Terms &amp; Conditions</h2>
              <p className="text-xs text-gray-400 mt-1">Effective upon signing of rental agreement</p>
            </div>
            <button
              onClick={onCancel}
              className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 transition flex-shrink-0 mt-1"
            >✕</button>
          </div>
        </div>

        {/* Scrollable body */}
        <div ref={scrollRef} className="overflow-y-auto flex-1 px-8 py-6">
          <div className="flex flex-col gap-5">
            {SECTIONS.map((s) => (
              <div key={s.num} className="flex gap-4">
                {/* Section number */}
                <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-arl-primary/8 flex items-center justify-center mt-0.5"
                  style={{ backgroundColor: "rgba(26,95,122,0.08)" }}>
                  <span className="text-xs font-black text-arl-primary">{s.num}</span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-gray-800 mb-1.5">{s.title}</h3>

                  {s.highlight && (
                    <div className="inline-flex items-center gap-1.5 bg-arl-secondary/10 text-arl-primary text-xs font-bold px-3 py-1 rounded-full mb-2"
                      style={{ backgroundColor: "rgba(79,195,247,0.12)" }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-arl-secondary inline-block" />
                      {s.highlight}
                    </div>
                  )}

                  {s.body && (
                    <p className="text-xs text-gray-500 leading-relaxed">{s.body}</p>
                  )}

                  {s.list && (
                    <div className="mt-2 flex flex-col gap-1.5">
                      {s.list.map((item, i) => (
                        <div key={i} className="flex items-center justify-between bg-gray-50 rounded-xl px-3 py-2">
                          <span className="text-xs text-gray-500">{item.label}</span>
                          <span className="text-xs font-bold text-arl-primary">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Acknowledgment note */}
            <div className="mt-2 p-4 rounded-2xl border border-arl-primary/20 bg-arl-light"
              style={{ borderColor: "rgba(26,95,122,0.15)" }}>
              <p className="text-xs text-gray-500 leading-relaxed text-center">
                By clicking <strong className="text-arl-primary">I Agree</strong>, you confirm that you have read, understood, and agree to all Terms and Conditions set forth in this agreement.
              </p>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-8 py-5 border-t border-gray-100 flex-shrink-0 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 border border-gray-200 text-gray-500 py-3 rounded-2xl text-sm font-semibold hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={onAgree}
            className="flex-1 bg-arl-cta text-white py-3 rounded-2xl text-sm font-bold hover:opacity-90 transition-all duration-200 shadow-sm"
          >
            I Agree
          </button>
        </div>
      </div>
    </div>
  );
};

export default TandC;
