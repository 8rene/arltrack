import WhyARL from "./WhyARL";
import { ShieldCheck, Infinity, Car } from "lucide-react";

const WhySection = () => {
    return (
        <section className="py-10 sm:py-16 bg-gradient-to-b from-white via-sky-50 to-white relative overflow-hidden">

            {/* soft sky glow */}
            <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-sky-200/20 blur-3xl rounded-full"></div>

            <div className="relative max-w-6xl mx-auto px-4 sm:px-6">

                <p className="text-center text-xs sm:text-sm uppercase tracking-[0.2em] sm:tracking-[0.3em] text-arl-cta mb-2 sm:mb-4">
                    Why Travel With Us
                </p>

                <h2 className="font-display text-center text-3xl sm:text-5xl md:text-6xl font-bold text-arl-primary leading-tight tracking-tight mb-8 sm:mb-14">
                    Smooth Journey, <br />
                    <span className="font-display text-arl-cta">Trusted Service</span>
                </h2>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-8">

                    <WhyARL
                        title="Pristine Fleet"
                        description="Clean, safe, and well-maintained vehicles for every trip."
                        icon={<ShieldCheck size={30} strokeWidth={2} />}
                    />

                    <WhyARL
                        title="Unlimited Mileage"
                        description="Go anywhere without worrying about distance limits."
                        icon={<Infinity size={30} strokeWidth={2} />}
                    />

                    <WhyARL
                        title="Easy Booking"
                        description="Quick and simple reservation process anytime you need a ride."
                        icon={<Car size={30} strokeWidth={2} />}
                    />

                </div>
            </div>
        </section>
    );
};

export default WhySection;
