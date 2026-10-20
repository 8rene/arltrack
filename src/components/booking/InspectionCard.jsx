// InspectionCard.jsx
// The vehicle inspection our staff record at pickup and at return — photos, videos and the condition of the
// parts — for a SELF-DRIVE booking. (With a chauffeur the driver handles the handover, so nothing shows.)
// The server decides who may see it (own booking, self-drive, paid, from the plate-reveal time) and returns
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

  const n = rec.damagedParts.length;
  const pill = rec.condition === "good" ? ["No damage recorded", "bg-green-50 text-green-700"]
    : rec.condition === "has damage" ? [`${n} part${n === 1 ? "" : "s"} noted`, "bg-amber-50 text-amber-700"]
    : ["Parts condition not recorded", "bg-gray-100 text-gray-600"];

  const exterior = [["Front", rec.exterior.front], ["Side", rec.exterior.side], ["Back", rec.exterior.back]].filter(([, url]) => url);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mt-4">
        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${pill[1]}`}>{pill[0]}</span>
        {rec.recordedAt && <span className="text-xs text-gray-500">Recorded {fmt(rec.recordedAt)}</span>}
      </div>

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

      {exterior.length > 0 && (
        <Section title="Exterior">
          <div className="grid grid-cols-3 gap-3">
            {exterior.map(([label, url]) => <Thumb key={label} url={url} label={label} onOpen={onOpen} />)}
          </div>
        </Section>
      )}

      {n > 0 && (
        <Section title="Parts noted">
          <ul className="space-y-2">
            {rec.damagedParts.map((p, i) => (
              <li key={`${p.name}-${i}`} className="flex items-center gap-3 rounded-xl border border-gray-100 p-2.5">
                {p.photoUrl ? (
                  <button type="button" onClick={() => onOpen(p.photoUrl)} className="w-14 h-14 shrink-0 overflow-hidden rounded-lg border border-gray-100 bg-gray-50">
                    <img src={p.photoUrl} alt={p.name} loading="lazy" className="w-full h-full object-cover" />
                  </button>
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-800 truncate">{p.name}</p>
                  <p className="text-xs text-gray-500">{p.status}</p>
                </div>
                {p.notedAtPickup && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 shrink-0">Already noted at pickup</span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {rec.extraPhotos.length > 0 && (
        <Section title={`Additional photos (${rec.extraPhotos.length})`}>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {rec.extraPhotos.map((p) => <Thumb key={p.id || p.url} url={p.url} onOpen={onOpen} square />)}
          </div>
        </Section>
      )}

      {rec.videos.length === 0 && exterior.length === 0 && rec.extraPhotos.length === 0 && n === 0 && (
        <p className="text-sm text-gray-500 mt-3">No photos or videos were added to this record.</p>
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

  if (!data || !data.applicable || (!data.before && !data.after)) return null;

  const active = tab || (data.after ? "after" : "before");

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <p className="text-xs font-black text-arl-primary uppercase tracking-widest mb-1">Vehicle Inspection</p>
      <p className="text-xs text-gray-500 mb-3">Photos, videos and the condition of the car, recorded by our team at pickup and return.</p>

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