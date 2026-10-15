import { useEffect } from "react";
import Footer from "../components/layout/Footer";
import TermsMarkdown from "../components/shared/TermsMarkdown";
import { useTermsDocument } from "../utils/terms/terms";

// The text is not hard-coded here: it comes from the server (GET /api/terms/active), which reads
// the newest version the admin published. `/terms?v=<id>` shows an earlier version by its ID
// (linked from a booking's details).
export default function TermsPage() {
  const versionID = new URLSearchParams(window.location.search).get("v");
  const { terms, loading, error, reload } = useTermsDocument(versionID);
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
          {versionID && terms && (
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
          {terms && (
            <div className="bg-white rounded-2xl sm:rounded-3xl shadow-soft p-5 sm:p-10">
              <TermsMarkdown source={terms.content} />
            </div>
          )}

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
