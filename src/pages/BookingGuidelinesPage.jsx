import { useEffect } from "react";
import Footer from "../components/layout/Footer";
import { usePolicySettings } from "../utils/policySettings";

const buildSections = ({ depositText, serviceFeePercent, gatewayFeePercent, fullRefundHours }) => [
  {
    num: "01",
    title: "How to Make a Reservation",
    body: `To book a vehicle with ARL Car Rental, browse our available fleet and select your preferred vehicle. Choose your rental dates, service type (self-drive or with driver), and pickup location. Submit your booking request through the platform. Your reservation is only confirmed once the required ${depositText} deposit has been received — unconfirmed bookings are not held.`,
  },
  {
    num: "02",
    title: "Reservation Deposit",
    highlight: `${depositText} minimum deposit to secure your booking`,
    body: `A minimum deposit of ${depositText} is required to confirm your reservation. This deposit is applied toward your total rental fee. Priority is given strictly on a first-come, first-served basis to the customer who completes payment first. Pencil bookings or verbal reservations without deposit are not accepted.`,
  },
  {
    num: "03",
    title: "Payment Schedule",
    body: `After the deposit is received and the booking is confirmed, the remaining balance must be paid in full before the vehicle is released on your pickup date. Note that a service fee (${serviceFeePercent}% of the rental fee) and an online payment gateway fee (${gatewayFeePercent}% of the booking total) are added to every booking and shown in your price breakdown before you pay.`,
    list: [
      { label: "Step 1", value: `Pay ${depositText} deposit to confirm` },
      { label: "Step 2", value: "Receive booking confirmation" },
      { label: "Step 3", value: "Settle balance before pickup" },
      { label: "Step 4", value: "Present valid ID on pickup date" },
    ],
  },
  {
    num: "04",
    title: "Available Discounts",
    list: [
      { label: "5 days or more rental", value: "5% off total" },
      { label: "2 or more vehicles", value: "10% off total" },
      { label: "PWD / Senior Citizen ID", value: "Not applicable" },
      { label: "Other ID discounts", value: "Not applicable" },
    ],
  },
  {
    num: "05",
    title: "Service Types",
    body: "ARL Car Rental offers two types of rental service. Choose the one that best fits your needs when making a booking.",
    list: [
      { label: "Self-Drive", value: "You drive the rented vehicle" },
      { label: "With Driver", value: "ARL provides a professional driver" },
    ],
  },
  {
    num: "06",
    title: "Self-Drive Requirements",
    body: "To qualify for a self-drive rental, you must meet all of the following requirements at the time of pickup. Failure to meet any requirement may result in cancellation without refund of the deposit.",
    list: [
      { label: "Minimum age", value: "21 years old" },
      { label: "Valid driver's license", value: "Philippine-issued" },
      { label: "Government-issued ID", value: "Required for verification" },
      { label: "Authorized driver", value: "Only the registered renter" },
    ],
  },
  {
    num: "07",
    title: "Pickup & Vehicle Release",
    body: "On your scheduled pickup date, arrive at the agreed location and present a valid government-issued ID. Our team will verify your booking details, conduct a vehicle inspection with you, and release the vehicle only after full payment is confirmed. Any pre-existing damage will be documented before you drive off.",
  },
  {
    num: "08",
    title: "Rental Duration & Extensions",
    highlight: "₱100.00 per hour for late returns",
    body: "Rental periods are based on the agreed start and return date and time. If you need to extend your rental, contact ARL Car Rental at least a few hours before your return time to check vehicle availability. Extensions are subject to approval. Late returns without prior notice are charged ₱100 per hour beyond the agreed return time.",
  },
  {
    num: "09",
    title: "Fuel & Toll Fees",
    body: "ARL Car Rental operates on an unlimited mileage basis. However, all fuel costs and toll fees during the rental period are the full responsibility of the renter. Vehicles must be returned with the same fuel level as when they were released. Returning a vehicle with less fuel will incur a charge for the difference at current pump prices plus an administrative fee.",
  },
  {
    num: "10",
    title: "Cancellation & Rescheduling",
    body: `If you need to cancel or reschedule your booking, please notify ARL Car Rental through official channels as early as possible. The ${fullRefundHours} hours are counted from the moment you send your refund request, not from the moment it is reviewed. Service and gateway fees are refunded together with your booking amount; when a refund falls under the ${fullRefundHours}-hour limit, only the ${depositText} deposit is withheld.`,
    list: [
      { label: `${fullRefundHours} hours or more before pickup`, value: "Full refund of everything you paid" },
      { label: `Less than ${fullRefundHours} hours before pickup`, value: `Everything refunded except the ${depositText} deposit` },
      { label: "No-show on pickup date", value: `${depositText} deposit forfeited; everything else refunded` },
      { label: "Rescheduling notice", value: "At least 24 hours prior" },
    ],
  },
  {
    num: "11",
    title: "Number Coding (Metro Manila)",
    body: "If your rental vehicle is subject to the UVVRP, the renter is responsible for complying with the coding scheme. Coding is enforced 7:00 AM – 7:00 PM on weekdays in most Metro Manila cities.",
    list: [
      { label: "Monday", value: "Plates ending in 1 or 2" },
      { label: "Tuesday", value: "Plates ending in 3 or 4" },
      { label: "Wednesday", value: "Plates ending in 5 or 6" },
      { label: "Thursday", value: "Plates ending in 7 or 8" },
      { label: "Friday", value: "Plates ending in 9 or 0" },
    ],
  },
  {
    num: "12",
    title: "Contact & Support",
    highlight: "09665303323 · (044)-3228335",
    body: "For booking inquiries, changes, or assistance, reach ARL Car Rental through our official Facebook page, phone numbers, or email at manalastas.arlene299@gmail.com. We are located at Villa Roma V, Lias, Marilao, Bulacan. Our team is ready to help you find the right vehicle and service for your needs.",
  },
];

export default function BookingGuidelinesPage() {
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
            Booking Guidelines
          </h1>
          <p className="text-sm text-white/50">Everything you need to know before renting a vehicle</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-14">
        <div className="flex flex-col gap-4 sm:gap-8">

          {/* Intro note */}
          <div className="bg-white rounded-2xl sm:rounded-3xl shadow-soft p-4 sm:p-6 border-l-4"
            style={{ borderLeftColor: "#4FC3F7" }}>
            <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
              These guidelines are designed to make your rental experience with{" "}
              <strong className="text-arl-primary">ARL Car Rental</strong> smooth and straightforward. Please read through each section carefully before completing your booking.
            </p>
          </div>

          {SECTIONS.map((s) => (
            <div key={s.num} className="bg-white rounded-2xl sm:rounded-3xl shadow-soft p-4 sm:p-8 flex flex-col sm:flex-row gap-3 sm:gap-6">

              {/* Number badge — inline on mobile */}
              <div className="flex items-center gap-3 sm:block">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex-shrink-0 flex items-center justify-center"
                  style={{ backgroundColor: "rgba(26,95,122,0.08)" }}>
                  <span className="text-xs sm:text-sm font-black text-arl-primary">{s.num}</span>
                </div>
                <h2 className="text-base font-bold text-arl-primary sm:hidden">{s.title}</h2>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
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

          {/* Closing acknowledgment */}
          <div className="bg-arl-primary rounded-2xl sm:rounded-3xl p-6 sm:p-8 text-center">
            <p className="text-white/70 text-xs sm:text-sm leading-relaxed max-w-xl mx-auto">
              By proceeding with a booking, you confirm that you have read and understood these Booking Guidelines and agree to comply with all policies set forth by ARL Car Rental.
            </p>
            <p className="text-white/40 text-xs mt-4">© 2026 ARL Car Rental. All rights reserved.</p>
          </div>

        </div>
      </div>

      <Footer />
    </div>
  );
}
