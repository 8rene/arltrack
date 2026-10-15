import React, { useEffect, useRef } from "react";
import { useActiveTerms } from "../../utils/terms/terms";
import TermsMarkdown from "./TermsMarkdown";

// Same text as the Terms & Conditions page — both read the current version the admin published
// (GET /api/terms/active). One canonical text means what the customer reads here is what is recorded.
const TandC = ({ isOpen, onAgree, onCancel }) => {
  const { terms, loading, error, reload } = useActiveTerms();
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
              <p className="text-xs text-gray-400 mt-1">{terms ? `Version ${terms.version} · ` : ""}Accepted electronically</p>
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
            {loading && !terms && <p className="text-sm text-gray-500 text-center py-6">Loading the Terms &amp; Conditions…</p>}
            {error && !terms && (
              <div className="text-center py-6">
                <p className="text-sm text-red-600 mb-3">{error}</p>
                <button onClick={reload} className="px-5 py-2 rounded-full bg-arl-primary text-white text-sm font-semibold">Try again</button>
              </div>
            )}
            {terms && <TermsMarkdown source={terms.content} compact />}

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
            // Passes back the termsVersionID + version of the text that was on screen — the server
            // checks it and records it as the acceptance when the account is created.
            onClick={() => terms && onAgree({ termsVersionID: terms.termsVersionID, version: terms.version })}
            disabled={!terms}
            className="flex-1 bg-arl-cta text-white py-3 rounded-2xl text-sm font-bold hover:opacity-90 transition-all duration-200 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            I Agree
          </button>
        </div>
      </div>
    </div>
  );
};

export default TandC;
