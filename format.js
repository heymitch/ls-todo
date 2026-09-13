/* format.js — the to-do file format. Plain text is the agent door.
   Browser: window.TodoFormat. Node: require("./format.js").

   ## Todo
   * [ ] **OUTCOME HEADLINE IN CAPS.** Optional detail sentence. Source: optional pointer
   * [ ] a raw line you typed and have not scribed yet
   * [x] **DONE ITEM.**

   ## Someday
   * [ ] **SOMETHING FOR LATER.**

   A line with bold is scribed. A line without bold is raw. Any other heading counts as Todo.
*/
(function (root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { root.TodoFormat = factory(); }
}(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var TODO = "Todo", SOMEDAY = "Someday", ASK = "Ask";
  var HEADING_RE = /^## (.+?)\s*$/;
  var ITEM_RE = /^\* \[( |x|X|\?)\] ?(.*)$/;
  var HEAD_RE = /^\*\*(.+?)\*\*\s*(.*)$/;
  var SOURCE_RE = /(?:^|\s)Source:\s*(.+?)\s*$/;
  var SOMEDAY_RE = /(?:^|[\s(,])(someday|some day|sometime|maybe|eventually|later|one day|if i get to it|when i get to it)(?=$|[\s,;:!?)]|\.(?:\s|$))/i;
  var NOW_RE = /(?:^|[\s(,])(now|today|tonight|this week|asap)(?=$|[\s,;:!?)]|\.(?:\s|$))/i;

  function sectionOf(heading) {
    var h = String(heading || "").trim();
    if (/^someday$/i.test(h)) return SOMEDAY;
    if (/^ask$/i.test(h)) return ASK;
    return TODO;
  }
  function normLine(s) { return String(s || "").replace(/^\s*someday:\s*/i, "").replace(/\s+/g, " ").trim().toLowerCase(); }
  function findOrAdd(sections, name) {
    for (var i = 0; i < sections.length; i++) if (sections[i].day === name) return sections[i];
    var s = { day: name, items: [] };
    sections.push(s);
    return s;
  }

  var DONE_RE = /(?:^|\s)Done:\s*(\d{4}-\d{2}-\d{2})\s*$/;

  function parseItem(done, body) {
    var head = "", detail = "", source = "", raw = true, doneAt = "";
    var rest = String(body || "").trim();
    var dn = rest.match(DONE_RE);
    if (dn) { doneAt = dn[1]; rest = rest.slice(0, dn.index).trim(); }
    var s = rest.match(SOURCE_RE);
    if (s) { source = s[1].trim(); rest = rest.slice(0, s.index).trim(); }
    var h = rest.match(HEAD_RE);
    if (h) { head = h[1].trim(); detail = h[2].trim(); raw = false; } else { head = rest; }
    return { done: done, head: head, detail: detail, source: source, raw: raw, doneAt: done ? doneAt : "" };
  }

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function isoDate(dt) { return dt.getFullYear() + "-" + pad(dt.getMonth() + 1) + "-" + pad(dt.getDate()); }
  function today(now) { return isoDate(now || new Date()); }

  /* {"2026-09-13": 2, ...} from checked lines that carry a Done: date. */
  function doneByDay(sections) {
    var m = {};
    sections.forEach(function (s) { s.items.forEach(function (it) { if (it.done && it.doneAt) m[it.doneAt] = (m[it.doneAt] || 0) + 1; }); });
    return m;
  }

  /* Text -> [{day: "Todo"|"Someday", items:[{done, head, detail, source, raw}]}]. Unknown lines are ignored. */
  function parse(text) {
    var sections = [], cur = null, inAsk = false;
    var lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var hd = line.match(HEADING_RE);
      if (hd) { var name = sectionOf(hd[1]); inAsk = name === ASK; cur = inAsk ? null : findOrAdd(sections, name); continue; }
      if (inAsk) continue;
      var m = line.replace(/^\s+/, "").match(ITEM_RE);
      if (m) {
        if (m[1] === "?") continue;
        if (!cur) cur = findOrAdd(sections, TODO);
        cur.items.push(parseItem(m[1] !== " ", m[2]));
        continue;
      }
      if (cur && cur.items.length && /^\s+\S/.test(line)) {
        var it = cur.items[cur.items.length - 1];
        if (it.raw) it.head += " " + line.trim();
        else it.detail = (it.detail ? it.detail + " " : "") + line.trim();
      }
    }
    return sections;
  }

  function serializeItem(it) {
    var s = "* [" + (it.done ? "x" : " ") + "] ";
    var head = (it.head || "").trim(), detail = (it.detail || "").trim(), source = (it.source || "").trim();
    if (head) s += it.raw ? head : "**" + head + "**";
    if (detail && !it.raw) s += (head ? " " : "") + detail;
    if (source) s += " Source: " + source;
    if (it.done && it.doneAt) s += " Done: " + it.doneAt;
    return s;
  }
  function sortSections(sections) {
    return sections.slice().sort(function (a, b) { return (a.day === SOMEDAY ? 1 : 0) - (b.day === SOMEDAY ? 1 : 0); });
  }
  function serialize(sections) {
    var out = [];
    sortSections(sections).forEach(function (s) {
      if (!s.items.length) return;
      out.push("## " + s.day + "\n\n" + s.items.map(serializeItem).join("\n"));
    });
    return out.length ? out.join("\n\n") + "\n" : "";
  }

  /* Add incoming into sections. Skips an item whose headline already exists in that section. */
  function merge(sections, incoming) {
    var added = 0;
    incoming.forEach(function (inc) {
      var s = findOrAdd(sections, sectionOf(inc.day));
      inc.items.forEach(function (it) {
        var key = (it.head || "").trim().toLowerCase();
        var dup = s.items.some(function (x) { return (x.head || "").trim().toLowerCase() === key; });
        if (!dup) { s.items.push(it); added++; }
      });
    });
    return added;
  }

  /* Raw open lines, in file order, as one capture. */
  function rawItems(sections) {
    var out = [];
    sortSections(sections).forEach(function (s) { s.items.forEach(function (it) { if (it.raw && !it.done) out.push(it); }); });
    return out;
  }
  /* Someday lines carry a "someday:" tag so the scribe keeps them there. */
  function rawText(sections) {
    var out = [];
    sortSections(sections).forEach(function (s) {
      s.items.forEach(function (it) { if (it.raw && !it.done) out.push((s.day === SOMEDAY ? "someday: " : "") + plainItem(it)); });
    });
    return out.join("\n");
  }

  /* Questions in a scribe reply: [{raw, options:[item]}]. The options are complete items. */
  function parseAsks(text) {
    var asks = [], inAsk = false, q = null;
    String(text || "").replace(/\r\n?/g, "\n").split("\n").forEach(function (line) {
      var hd = line.match(HEADING_RE);
      if (hd) { inAsk = sectionOf(hd[1]) === ASK; q = null; return; }
      if (!inAsk) return;
      var m = line.replace(/^\s+/, "").match(ITEM_RE);
      if (!m) return;
      if (m[1] === "?") { q = { raw: m[2].trim(), options: [] }; asks.push(q); return; }
      if (q) { var it = parseItem(m[1] !== " ", m[2]); if (it.head) { it.done = false; it.raw = false; q.options.push(it); } }
    });
    return asks.filter(function (a) { return a.raw && a.options.length; });
  }

  /* Replace the raw open lines with a scribed reply, except lines the scribe asked about. Returns items added. */
  function absorb(sections, replySections, keepRaw) {
    var keep = {};
    (keepRaw || []).forEach(function (r) { keep[normLine(r)] = true; });
    sections.forEach(function (s) {
      s.items = s.items.filter(function (it) { return !(it.raw && !it.done) || keep[normLine(plainItem(it))]; });
    });
    return merge(sections, replySections);
  }

  /* ---- Inference from plain text. No fields. ---- */
  function wantsSomeday(text) { return SOMEDAY_RE.test(String(text || "")); }
  function wantsNow(text) { return NOW_RE.test(String(text || "")); }

  /* A raw line as typed. Keeps the writer's words. Pulls out only an explicit "Source:". */
  function rawLine(text) {
    var t = String(text || "").replace(/\s+/g, " ").trim();
    var done = false;
    var mk = t.match(/^\*?\s*\[( |x|X)\]\s*/);
    if (mk) { done = mk[1] !== " "; t = t.slice(mk[0].length).trim(); }
    if (!t) return null;
    var source = "";
    var s = t.match(SOURCE_RE);
    if (s) { source = s[1].trim(); t = t.slice(0, s.index).trim(); }
    return { done: done, head: t, detail: "", source: source, raw: true };
  }

  /* A scribed line being edited as plain text: first sentence is the headline again. */
  function structuredLine(text) {
    var t = String(text || "").replace(/\s+/g, " ").trim();
    var source = "";
    var s = t.match(SOURCE_RE);
    if (s) { source = s[1].trim(); t = t.slice(0, s.index).trim(); }
    var head = t, detail = "";
    var h = t.match(HEAD_RE);
    if (h) { head = h[1].trim(); detail = h[2].trim(); }
    else { var m = t.match(/^(.+?[.!?])(?:\s+(.*))?$/); if (m) { head = m[1].trim(); detail = (m[2] || "").trim(); } }
    return { done: false, head: head, detail: detail, source: source, raw: false };
  }

  /* The editable text of an item: no markers, no bold. */
  function plainItem(it) {
    var s = (it.head || "").trim();
    if (it.detail && !it.raw) s += (s ? " " : "") + it.detail.trim();
    if (it.source) s += " Source: " + it.source.trim();
    return s;
  }
  function isFormatted(text) {
    return /^\s*\* \[[ xX]\] \*\*/m.test(String(text || "")) || /^\s*## (Todo|Someday)/mi.test(String(text || ""));
  }
  function countOpen(sections) {
    var n = 0;
    sections.forEach(function (s) { if (s.day !== SOMEDAY) s.items.forEach(function (it) { if (!it.done) n++; }); });
    return n;
  }

  /* ---- Accuracy guard: deterministic. Flags content the scribe added. ---- */
  var STOP = /^(about|after|again|another|before|being|could|doing|during|every|first|from|have|into|might|other|should|since|still|their|there|these|those|through|today|under|until|where|which|while|would|source|someday|maybe|later)$/;
  function words(text) { return String(text || "").toLowerCase().match(/[a-z][a-z'-]*/g) || []; }
  function stem(w) { w = w.replace(/'s$/, "").replace(/-/g, ""); return w.length > 4 ? w.slice(0, 4) : w; }
  function numbers(text) {
    return (String(text || "").match(/\d[\d.,:/-]*/g) || []).map(function (n) { return n.replace(/[.,:/-]+$/, ""); });
  }
  /* guard(rawCapture, proposedText) -> {days, items:[{day, item, flags[]}], flagged} */
  function guard(raw, proposedText) {
    var sections = parse(proposedText);
    var rawStems = {}, rawNums = {};
    words(raw).forEach(function (w) { rawStems[stem(w)] = true; });
    numbers(raw).forEach(function (n) { rawNums[n] = true; });
    var items = [], flagged = 0;
    sections.forEach(function (s) {
      s.items.forEach(function (it) {
        var text = [it.head, it.detail, it.source].join(" ");
        var flags = [], seen = {};
        numbers(text).forEach(function (n) { if (!rawNums[n] && !seen["#" + n]) { seen["#" + n] = true; flags.push("new number " + n); } });
        words(text).forEach(function (w) {
          if (w.length < 5 || STOP.test(w) || seen[w]) return;
          seen[w] = true;
          if (!rawStems[stem(w)]) flags.push("new word " + w);
        });
        if (flags.length) flagged++;
        items.push({ day: s.day, item: it, flags: flags });
      });
    });
    return { days: sections, items: items, flagged: flagged };
  }

  return {
    TODO: TODO, SOMEDAY: SOMEDAY, ASK: ASK,
    parse: parse, parseAsks: parseAsks, serialize: serialize, serializeItem: serializeItem, sortSections: sortSections,
    merge: merge, absorb: absorb, rawItems: rawItems, rawText: rawText, countOpen: countOpen, normLine: normLine,
    today: today, isoDate: isoDate, doneByDay: doneByDay,
    rawLine: rawLine, structuredLine: structuredLine, plainItem: plainItem, isFormatted: isFormatted,
    wantsSomeday: wantsSomeday, wantsNow: wantsNow,
    guard: guard
  };
}));
