import { useEffect } from "react";
import Footer from "../components/layout/Footer";
import { usePolicySettings } from "../utils/policySettings";

const buildSections = ({ depositText, serviceFeePercent, gatewayFeePercent, fullRefundHours }) => [
  {
    num: "01",
    title: "Acceptance of Agreement",
    body: "By renting a vehicle from ARL Car Rental, the renter agrees to comply with all terms, policies, and conditions stated in this agreement. These conditions are established to ensure the proper use of rental vehicles and to protect both the renter and the business.",
  },
  {
    num: "02",
    title: "Reservation & Booking Policy",
    body: `ARL Car Rental follows a first-come, first-served reservation policy. Reservations are only confirmed once the required deposit or downpayment has been received. A minimum deposit of ${depositText} is required to reserve a vehicle and secure the requested rental date. Pencil bookings or temporary reservations without deposit are not accepted.`,
  },
  {
    num: "03",
    title: "Rental Inquiries and Approval",
    body: "Customers may send rental inquiries through the official communication channels of ARL Car Rental. Upon receiving an inquiry, the supervisor verifies the requested rental date, vehicle type, rental duration, and type of service (self-drive or with driver) before approving the booking.",
  },
  {
    num: "04",
    title: "Payment Terms",
    highlight: `${serviceFeePercent}% service fee (of the rental fee) · ${gatewayFeePercent}% online payment gateway fee (of the booking total, including the service fee and security deposit)`,
    body: "After reservation approval, the renter must settle the remaining rental balance. Full payment must be completed before the vehicle is released. ARL Car Rental offers promotional discounts for rentals of 5 days or more (5% off) and for two or more vehicles in a single transaction (10% off). Discounts for PWD, Senior Citizen, or other identification cards are not applicable.",
  },
  {
    num: "05",
    title: "Cancellation & Refund Policy",
    body: `Renters who wish to cancel must notify ARL Car Rental through official channels as early as possible. The ${fullRefundHours} hours are counted from the moment you send your refund request, not from the moment it is reviewed. Service and gateway fees are refunded together with your booking amount; when a refund falls under the ${fullRefundHours}-hour limit, only the ${depositText} deposit is withheld.`,
    list: [
      { label: `${fullRefundHours} hours or more before pickup`, value: "Full refund of everything you paid" },
      { label: `Less than ${fullRefundHours} hours before pickup`, value: `Everything refunded except the ${depositText} deposit` },
      { label: "No-show on pickup date", value: `${depositText} deposit forfeited; everything else refunded` },
    ],
    footer: `Rescheduling is allowed with at least 24 hours' notice, subject to vehicle availability. The ${depositText} deposit may be applied to the rescheduled booking at management's discretion.`,
  },
  {
    num: "06",
    title: "Vehicle Pickup & Customer Identification",
    body: "On the scheduled pickup date, the renter is required to present a valid government-issued identification card to verify identity, confirm booking details, and serve as a security measure. Failure to provide valid identification may result in cancellation without refund of the deposit.",
  },
  {
    num: "07",
    title: "Driver Requirements (Self-Drive Rentals)",
    list: [
      { label: "Minimum age", value: "21 years old" },
      { label: "License required", value: "Valid Philippine driver's license" },
      { label: "Primary driver", value: "Only the registered renter may drive" },
      { label: "Unauthorized drivers", value: "Strictly prohibited" },
    ],
  },
  {
    num: "08",
    title: "Vehicle Usage & Rental Period",
    body: "The renter agrees to use the vehicle only within the agreed rental period and for lawful purposes. Strictly prohibited: subletting or transferring the vehicle, illegal transport, off-road use (unless authorized in writing), smoking inside the vehicle, and transporting hazardous or prohibited materials. The vehicle must be returned to ARL Car Rental once the rental agreement has ended.",
  },
  {
    num: "09",
    title: "Rental Time & Destination Selection",
    body: "The renter is solely responsible for carefully choosing the pickup date, pickup time, and rental duration, and for making sure the selected schedule gives enough time to complete the entire trip, including travel to and from every destination, traffic, rest stops, and possible delays. The destination entered during booking is recorded for documentation and record-keeping purposes only. The ARL booking system does not calculate or estimate travel time or distance based on the selected destination, and an accepted booking does not mean that the chosen schedule is sufficient for the trip. Any time used beyond the agreed return time, including time lost because the schedule was underestimated, is treated as a late return and is charged under Late Return & Penalties.",
  },
  {
    num: "10",
    title: "Security Deposit",
    body: "In addition to the reservation deposit, ARL Car Rental may require a separate security deposit prior to vehicle release. The amount depends on the vehicle type and rental duration. It will be refunded in full upon return of the vehicle in satisfactory condition, free of damage, and with no outstanding charges.",
  },
  {
    num: "11",
    title: "Accidents & Incidents",
    body: "In the event of an accident or road incident during the rental period, the renter must: immediately stop the vehicle and ensure the safety of all parties; contact ARL Car Rental as soon as possible; file a report with the nearest PNP station and obtain a copy; and not admit fault or make settlements with third parties without prior written consent from ARL Car Rental.",
  },
  {
    num: "12",
    title: "Damages & Repair Liability",
    body: "The renter is responsible for any damages that occur during the rental period, whether caused by accident, negligence, or misuse. Charges may apply for major or minor vehicle damages, repair or replacement costs, and administrative fees. ARL Car Rental's assessment of damages shall be final and binding.",
  },
  {
    num: "13",
    title: "Fuel Policy",
    body: "ARL Car Rental operates on an unlimited mileage basis. However, fuel and toll fees are the full responsibility of the renter. Vehicles must be returned with the same fuel level as when released. If returned with less fuel, the renter will be charged for the difference at current pump prices plus an administrative handling fee.",
  },
  {
    num: "14",
    title: "Late Return & Penalties",
    highlight: "₱100.00 per hour beyond the agreed return time",
    body: "Vehicles must be returned on the agreed date and time. If the vehicle is not returned within 12 hours of the agreed return time without prior communication, ARL Car Rental reserves the right to treat the unit as unreturned and pursue appropriate legal action. Extensions must be confirmed in advance.",
  },
  {
    num: "15",
    title: "Number Coding Scheme (Metro Manila – UVVRP)",
    body: "The Number Coding Scheme is strictly enforced in most Metro Manila cities from 7:00 AM to 7:00 PM on weekdays.",
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
    title: "Vehicle Security & Renter Responsibility",
    body: "The renter assumes full responsibility for the vehicle and its contents during the entire rental period. ARL Car Rental shall not be held liable for any loss of personal belongings left inside the vehicle. Failure to return the vehicle or intentional damage may result in legal action under applicable Philippine laws.",
  },
  {
    num: "17",
    title: "Force Majeure",
    body: "Neither party shall be held liable for failure or delay in fulfilling obligations due to circumstances beyond reasonable control, including natural disasters, typhoons, floods, government-imposed restrictions, road closures, or civil unrest. Both parties shall communicate promptly to agree on a fair resolution.",
  },
  {
    num: "18",
    title: "Governing Law & Dispute Resolution",
    body: "This agreement shall be governed by and construed in accordance with the laws of the Republic of the Philippines. Any disputes that cannot be resolved amicably shall be submitted to the proper courts of competent jurisdiction in the city or municipality where ARL Car Rental's principal office is located.",
  },
];

export default function TermsPage() {
  const policy = usePolicySettings();
  const SECTIONS = buildSections(policy);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return (
    <div className="bg-arl-light min-h-screen pt-16">

      {/* Hero banner */}
      <div className="bg-arl-primary relative overflow-hidden">
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: "radial-gradient(circle at 70% 50%, #4FC3F7 0%, transparent 60%)" }} />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
          <p className="text-xs font-bold tracking-[0.25em] text-arl-secondary uppercase mb-3">ARL Car Rental</p>
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl text-white font-black leading-tight mb-3">
            Terms &amp; Conditions
          </h1>
          <p className="text-sm text-white/50">Effective upon signing of rental agreement</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-14">
        <div className="flex flex-col gap-4 sm:gap-8">
          {SECTIONS.map((s) => (
            <div key={s.num} className="bg-white rounded-2xl sm:rounded-3xl shadow-soft p-4 sm:p-8 flex flex-col sm:flex-row gap-3 sm:gap-6">

              {/* Number badge — inline on mobile, column on desktop */}
              <div className="flex items-center gap-3 sm:block">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex-shrink-0 flex items-center justify-center"
                  style={{ backgroundColor: "rgba(26,95,122,0.08)" }}>
                  <span className="text-xs sm:text-sm font-black text-arl-primary">{s.num}</span>
                </div>
                {/* Title next to badge on mobile */}
                <h2 className="text-base font-bold text-arl-primary sm:hidden">{s.title}</h2>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Title hidden on mobile (shown inline above) */}
                <h2 className="hidden sm:block text-lg font-bold text-arl-primary mb-3">{s.title}</h2>

                {s.highlight && (
                  <div className="flex items-center gap-2 mb-3 px-3 py-1.5 rounded-full text-xs sm:text-sm font-bold text-arl-primary w-fit"
                    style={{ backgroundColor: "rgba(79,195,247,0.12)" }}>
                    <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-arl-secondary inline-block flex-shrink-0" />
                    <span className="leading-snug">{s.highlight}</span>
                  </div>
                )}

                {s.body && (
                  <p className="text-xs sm:text-sm text-gray-600 leading-relaxed mb-3">{s.body}</p>
                )}

                {s.list && (
                  <div className="flex flex-col gap-1.5 sm:gap-2 my-2 sm:my-3">
                    {s.list.map((item, i) => (
                      <div key={i} className="flex flex-col xs:flex-row xs:items-center xs:justify-between bg-arl-light rounded-xl px-3 sm:px-4 py-2 sm:py-2.5 gap-0.5 xs:gap-2">
                        <span className="text-xs sm:text-sm text-gray-500">{item.label}</span>
                        <span className="text-xs sm:text-sm font-bold text-arl-primary">{item.value}</span>
                      </div>
                    ))}
                  </div>
                )}

                {s.footer && (
                  <p className="text-xs sm:text-sm text-gray-500 leading-relaxed mt-2">{s.footer}</p>
                )}
              </div>

            </div>
          ))}

          {/* Acknowledgment */}
          <div className="bg-arl-primary rounded-2xl sm:rounded-3xl p-6 sm:p-8 text-center">
            <p className="text-white/70 text-xs sm:text-sm leading-relaxed max-w-xl mx-auto">
              By proceeding with a rental, I confirm that I have read, understood, and agree to all of the Terms and Conditions set forth in this agreement.
            </p>
            <p className="text-white/40 text-xs mt-4">© 2026 ARL Car Rental. All rights reserved.</p>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
