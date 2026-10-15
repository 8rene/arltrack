import { useEffect } from "react";
import Footer from "../components/layout/Footer";
import { useTermsDocument } from "../utils/terms";

// The text is no longer hard-coded here: it comes from the server (GET /api/terms/active),
// which also records exactly which text a customer accepted. `/terms?v=<hash>` shows an
// earlier version by its hash (linked from a booking's details).
export default function TermsPage() {
  const versionHash = new URLSearchParams(window.location.search).get("v");
  const { terms, loading, error, reload } = useTermsDocument(versionHash);
  const SECTIONS = terms?.sections || [];
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
          <p className="text-sm text-white/50">
            {terms ? `Version ${terms.version} · ` : ""}Accepted electronically when you sign up and when you confirm a booking
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-14">
        <div className="flex flex-col gap-4 sm:gap-8">
          {versionHash && terms && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-xs sm:text-sm text-amber-800">
              You are viewing the exact version you accepted (version {terms.version}). The current Terms &amp; Conditions
              may be different — open <a href="/terms" className="underline font-semibold">the current version</a>.
            </div>
          )}
          {loading && !terms && (
            <div className="bg-white rounded-2xl shadow-soft p-6 text-sm text-gray-500 text-center">Loading the Terms &amp; Conditions…</div>
          )}
          {error && !terms && (
            <div className="bg-white rounded-2xl shadow-soft p-6 text-center">
              <p className="text-sm text-red-600 mb-3">{error}</p>
              <button onClick={reload} className="px-5 py-2 rounded-full bg-arl-primary text-white text-sm font-semibold">Try again</button>
            </div>
          )}
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
