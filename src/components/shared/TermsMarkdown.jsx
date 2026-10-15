import React from "react";

// Renders the Terms & Conditions Markdown the admin writes (termsVersions.content).
// Same small, safe subset the admin's own preview supports: # ## ### headings, paragraphs,
// - / 1. lists, **bold**, *italic*, [text](https://link), --- divider. It builds React
// elements (never dangerouslySetInnerHTML), so any HTML typed into the text shows as plain
// text and can't run.
const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[[^\]]+\]\([^)\s]+\))/g;
const SAFE_URL = /^(https?:\/\/|mailto:)/i;

const renderInline = (text, keyPrefix) =>
  text.split(INLINE).map((part, i) => {
    if (!part) return null;
    const key = `${keyPrefix}-${i}`;
    let m;
    if ((m = part.match(/^\*\*([^*]+)\*\*$/))) return <strong key={key} className="font-bold text-arl-primary">{m[1]}</strong>;
    if ((m = part.match(/^\*([^*]+)\*$/))) return <em key={key}>{m[1]}</em>;
    if ((m = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/))) {
      return SAFE_URL.test(m[2])
        ? <a key={key} href={m[2]} target="_blank" rel="noopener noreferrer" className="underline text-arl-secondary">{m[1]}</a>
        : <span key={key}>{m[1]}</span>;
    }
    return <React.Fragment key={key}>{part}</React.Fragment>;
  });

const parseBlocks = (source) => {
  const lines = String(source || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let para = [];
  let list = null;
  const flushPara = () => { if (para.length) { blocks.push({ type: "p", text: para.join(" ") }); para = []; } };
  const flushList = () => { if (list) { blocks.push(list); list = null; } };

  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if (/^\s*(---|\*\*\*)\s*$/.test(line)) { flushPara(); flushList(); blocks.push({ type: "hr" }); continue; }
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { flushPara(); flushList(); blocks.push({ type: "h", level: m[1].length, text: m[2] }); continue; }
    if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
      flushPara();
      if (!list || list.type !== "ul") { flushList(); list = { type: "ul", items: [] }; }
      list.items.push(m[1]); continue;
    }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      flushPara();
      if (!list || list.type !== "ol") { flushList(); list = { type: "ol", items: [] }; }
      list.items.push(m[1]); continue;
    }
    flushList();
    para.push(line.trim());
  }
  flushPara(); flushList();
  return blocks;
};

// compact = smaller text for the sign-up modal.
const HEADING = {
  1: "text-lg sm:text-xl font-bold text-arl-primary mt-2 mb-1",
  2: "text-base sm:text-lg font-bold text-arl-primary mt-5 mb-1",
  3: "text-sm sm:text-base font-bold text-arl-primary mt-3 mb-1",
};
const HEADING_COMPACT = {
  1: "text-base font-bold text-arl-primary mt-1 mb-1",
  2: "text-sm font-bold text-gray-800 mt-4 mb-1",
  3: "text-xs font-bold text-gray-800 mt-3 mb-1",
};

export default function TermsMarkdown({ source, compact = false }) {
  const H = compact ? HEADING_COMPACT : HEADING;
  const text = compact ? "text-xs text-gray-500 leading-relaxed" : "text-xs sm:text-sm text-gray-600 leading-relaxed";
  return (
    <div className="space-y-3">
      {parseBlocks(source).map((b, i) => {
        const k = `b${i}`;
        if (b.type === "h") { const Tag = `h${b.level + 1}`; return <Tag key={k} className={H[b.level]}>{renderInline(b.text, k)}</Tag>; }
        if (b.type === "hr") return <hr key={k} className="my-3 border-gray-200" />;
        if (b.type === "ul") return <ul key={k} className={`list-disc pl-5 space-y-1 ${text}`}>{b.items.map((t, j) => <li key={j}>{renderInline(t, `${k}-${j}`)}</li>)}</ul>;
        if (b.type === "ol") return <ol key={k} className={`list-decimal pl-5 space-y-1 ${text}`}>{b.items.map((t, j) => <li key={j}>{renderInline(t, `${k}-${j}`)}</li>)}</ol>;
        return <p key={k} className={text}>{renderInline(b.text, k)}</p>;
      })}
    </div>
  );
}
