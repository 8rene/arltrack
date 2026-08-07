import { useNavigate } from "react-router-dom";
import heroBg from "../../assets/images/web-hero-img.jpg";

export default function Hero() {
  const navigate = useNavigate();

  return (
    <section
      className="relative min-h-screen flex items-center bg-cover bg-center"
      style={{
        backgroundImage: `
          linear-gradient(
            90deg,
            rgba(5,10,20,0.82) 0%,
            rgba(5,10,20,0.65) 35%,
            rgba(5,10,20,0.25) 65%,
            rgba(5,10,20,0.10) 100%
          ),
          url(${heroBg})
        `,
      }}
    >
      {/* Glow Accent */}
      <div className="absolute top-20 left-10 w-72 h-72 bg-arl-secondary/20 blur-3xl rounded-full"></div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 w-full flex flex-col items-start justify-center py-10 sm:py-16 gap-5 sm:gap-8">

        {/* HEADLINE */}
        <div>
          <h1 className="font-display text-white text-3xl sm:text-5xl md:text-7xl font-medium leading-tight tracking-tight py-2 sm:py-5">
            Where You Are. <br />
            <span className="text-arl-secondary">
              Where You Want <br /> To Be.
            </span>
          </h1>
        </div>

        {/* CTA */}
        <button
          onClick={() => navigate("/booking")}
          className="group rounded-xl bg-arl-cta text-white px-5 sm:px-8 py-2.5 sm:py-3.5 text-sm sm:text-base font-semibold hover:bg-arl-secondary transition-colors duration-300"
        >
          <span className="inline-flex items-center gap-2">
            Book Your Ride
            <span className="transition-transform group-hover:translate-x-1">→</span>
          </span>
        </button>

      </div>
    </section>
  );
}
