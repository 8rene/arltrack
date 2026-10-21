// InspectionCard.jsx
// The vehicle inspection our staff record at pickup and at return — the saved photos and videos with their
// captions — for a booking with NO driver (self-drive, or a chauffeur booking nobody is assigned to). With a
// driver the driver handles the handover, so nothing shows. The parts condition is not shown to customers.
// The server decides who may see it (own booking, no driver, paid, from the plate-reveal time) and returns
// only a safe subset, so this card simply hides itself whenever there is nothing to show.
// Photo and video links expire after an hour; the card reloads them when the page is opened again.
import { useCallback, useEffect, useState } from "react";

const API = process.env.REACT_APP_API_URL;
const headers = () => ({ Authorization: `Bearer ${localStorage.getItem("arl_token")}` });
const fmt = (iso) => (iso ? new Date(iso).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }) : "");
const mmss = (sec) => (sec ? `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}` : "");
const REFRESH_AFTER_MS = 30 * 60 * 1000; // the links last 60 minutes; renew them well before that

const TABS = [
  { key: "before", label: "Before pickup" },
  { key: "after",  label: "After return" },
];

function Section({ title, children }) {
  return (
    <div className="mt-4">
      <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">{title}</p>
      {children}
    </div>
  );
}

function Thumb({ url, label, onOpen, square }) {
  return (
    <button type="button" onClick={() => onOpen(url)} className="text-left group">
      <span className={`block overflow-hidden rounded-xl border border-gray-100 bg-gray-50 ${square ? "aspect-square" : "aspect-[4/3]"}`}>
        <img src={url} alt={label || "Inspection photo"} loading="lazy" className="w-full h-full object-cover group-hover:opacity-90 transition" />
      </span>
      {label && <span className="block text-[11px] text-gray-500 mt-1">{label}</span>}
    </button>
  );
}

function PhaseView({ phase, rec, onOpen }) {
  if (!rec) {
    return (
      <p className="text-sm text-gray-500 mt-4">
        {phase === "after"
          ? "The return inspection will appear here once our team has recorded it."
          : "The pickup inspection hasn't been recorded yet."}
      </p>
    );
  }

  return (
    <div>
      {rec.recordedAt && <p className="text-xs text-gray-500 mt-4">Recorded {fmt(rec.recordedAt)}</p>}

      {rec.videos.length > 0 && (
        <Section title={rec.videos.length === 1 ? "Video" : `Videos (${rec.videos.length})`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {rec.videos.map((v) => (
              <div key={v.id || v.url}>
                <video src={v.url} controls preload="metadata" playsInline className="w-full aspect-video rounded-xl bg-black" />
                {v.durationSec ? <span className="block text-[11px] text-gray-400 mt-1">{mmss(v.durationSec)}</span> : null}
              </div>
            ))}
          </div>
        </Section>
      )}

      {rec.exterior.length > 0 && (
        <Section title="Exterior">
          <div className="grid grid-cols-3 gap-3">
            {rec.exterior.map((e) => <Thumb key={e.label} url={e.url} label={e.label} onOpen={onOpen} />)}
          </div>
        </Section>
      )}

      {rec.extraPhotos.length > 0 && (
        <Section title={`Additional photos (${rec.extraPhotos.length})`}>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {rec.extraPhotos.map((p) => <Thumb key={p.id || p.url} url={p.url} label={p.caption} onOpen={onOpen} square />)}
          </div>
        </Section>
      )}
    </div>
  );
}

export default function InspectionCard({ bookingID }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState(null);      // null = pick the most useful one (After return if it exists)
  const [photo, setPhoto] = useState(null);  // the picture open in the full-size viewer
  const [loadedAt, setLoadedAt] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/bookings/${bookingID}/inspection`, { headers: headers() });
      if (res.ok) { setData(await res.json()); setLoadedAt(Date.now()); }
    } catch { /* optional card — stay hidden if it can't load */ }
  }, [bookingID]);

  useEffect(() => { load(); }, [load]);

  // Coming back to this tab after a while: the signed links may be close to expiring, so renew them.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible" && loadedAt && Date.now() - loadedAt > REFRESH_AFTER_MS) load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadedAt, load]);

  // Esc closes the full-size viewer
  useEffect(() => {
    if (!photo) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setPhoto(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [photo]);

  if (!data) return null;

  // Inspection exists for this booking but the plate-reveal time hasn't come yet: say when, so a tap on the
  // "inspection confirmed" notification doesn't lead to a blank page.
  if (!data.applicable && data.availableFrom) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <p className="text-xs font-black text-arl-primary uppercase tracking-widest mb-1">Vehicle Inspection</p>
        <p className="text-sm text-gray-500">Photos of the car's inspection will be available here from {fmt(data.availableFrom)}.</p>
      </div>
    );
  }

  if (!data.applicable || (!data.before && !data.after)) return null;

  const active = tab || (data.after ? "after" : "before");

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <p className="text-xs font-black text-arl-primary uppercase tracking-widest mb-1">Vehicle Inspection</p>
      <p className="text-xs text-gray-500 mb-3">Photos and videos of the car, recorded by our team at pickup and return.</p>

      <div className="flex gap-2">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition ${
              active === t.key ? "bg-arl-primary text-white border-arl-primary" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <PhaseView phase={active} rec={data[active]} onOpen={setPhoto} />

      {photo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80" onClick={() => setPhoto(null)}>
          <button type="button" onClick={() => setPhoto(null)} aria-label="Close"
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/90 text-gray-800 font-bold">✕</button>
          <img src={photo} alt="Inspection" className="max-w-full max-h-full object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}