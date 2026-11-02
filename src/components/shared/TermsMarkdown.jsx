import React from "react";

// Renders the Terms & Conditions Markdown the admin writes (termsVersions.content).
// Same small, safe subset the admin's own preview supports: # ## ### headings, paragraphs,
// - / 1. lists (indent with spaces for sub-lists), **bold**, *italic*, [text](https://link),
// --- divider. ## headings are numbered 1, 2, 3 … in order, and a paragraph / list that starts
// with spaces is indented — exactly like the admin's preview. It builds React
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
  let paraLvl = 0; // indent steps of the paragraph's first line (2 spaces = 1 step)
  let list = null;
  const flushPara = () => { if (para.length) { blocks.push({ type: "p", text: para.join(" "), level: paraLvl }); para = []; paraLvl = 0; } };
  const flushList = () => { if (list) { blocks.push(list); list = null; } };

  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if (/^\s*(---|\*\*\*)\s*$/.test(line)) { flushPara(); flushList(); blocks.push({ type: "hr" }); continue; }
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { flushPara(); flushList(); blocks.push({ type: "h", level: m[1].length, text: m[2] }); continue; }
    // Items indented with spaces/tabs (2 spaces = 1 step, up to 3 steps) become nested lists.
    const lead = raw.match(/^[ \t]*/)[0].replace(/\t/g, "  ").length;
    const lvl = Math.min(3, Math.floor(lead / 2));
    if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
      flushPara();
      if (list && lvl === 0 && list.type !== "ul") flushList();
      if (!list) list = { type: "ul", items: [] };
      list.items.push({ text: m[1], level: lvl, type: "ul" }); continue;
    }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      flushPara();
      if (list && lvl === 0 && list.type !== "ol") flushList();
      if (!list) list = { type: "ol", items: [] };
      list.items.push({ text: m[1], level: lvl, type: "ol" }); continue;
    }
    flushList();
    if (!para.length) paraLvl = lvl;
    para.push(line.trim());
  }
  flushPara(); flushList();
  return blocks;
};

// Flat list items (each with an indent level) → a tree, so sub-bullets nest under their parent.
const nestItems = (items) => {
  const root = [];
  const stack = [{ level: -1, children: root }];
  items.forEach((it) => {
    const node = { text: it.text, type: it.type, level: it.level, children: [] };
    while (stack.length > 1 && stack[stack.length - 1].level >= it.level) stack.pop();
    stack[stack.length - 1].children.push(node);
    stack.push({ level: it.level, children: node.children });
  });
  return root;
};

const renderList = (nodes, type, key, textCls, depth, parentLevel = -1) => {
  const Tag = type;
  const style = type === "ol" ? (depth % 2 ? "list-[lower-alpha]" : "list-decimal") : depth % 2 ? "list-[circle]" : "list-disc";
  // A list that starts further in than one step (indented bullets with nothing above them) is shifted in.
  const extra = Math.max(0, nodes[0].level - parentLevel - 1);
  return (
    <Tag key={key} style={extra ? { marginLeft: `${extra * 1.5}rem` } : undefined}
      className={`${style} pl-5 space-y-1 ${depth ? "mt-1" : ""} ${textCls}`}>
      {nodes.map((n, j) => (
        <li key={j}>
          {renderInline(n.text, `${key}-${j}`)}
          {n.children.length > 0 && renderList(n.children, n.children[0].type, `${key}-${j}c`, textCls, depth + 1, n.level)}
        </li>
      ))}
    </Tag>
  );
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
  // Section headings (##) are numbered 1, 2, 3 … in order, so "Section 10" in the text matches what is shown.
  // A heading that already starts with a typed number is left as it is.
  let n = 0;
  return (
    <div className="space-y-3">
      {parseBlocks(source).map((b, i) => {
        const k = `b${i}`;
        if (b.type === "h") {
          const Tag = `h${b.level + 1}`;
          const num = b.level === 2 && !/^\d+[.)]\s/.test(b.text) ? `${++n}. ` : "";
          return <Tag key={k} className={H[b.level]}>{num}{renderInline(b.text, k)}</Tag>;
        }
        if (b.type === "hr") return <hr key={k} className="my-3 border-gray-200" />;
        if (b.type === "ul" || b.type === "ol") return renderList(nestItems(b.items), b.type, k, text, 0);
        return <p key={k} className={text} style={b.level ? { textIndent: `${b.level * 2}rem` } : undefined}>{renderInline(b.text, k)}</p>;
      })}
    </div>
  );
}