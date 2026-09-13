/* app.js — the human door. One list, one someday, real boxes.
   Every line is editable in place and saves when you stop typing. Scribe cleans lines you already logged. */
(function () {
  "use strict";
  const F = window.TodoFormat, S = window.TodoScribe;
  const el = {};
  ["todo", "someday", "somedayItems", "openCount", "scribeStatus", "scribe",
   "settingsWrap", "settingsWin", "storeNote", "exportBtn", "copyBtn", "importFile", "importBtn", "promptBtn", "rawEditor", "clearBtn",
   "presets", "agentNote", "githubLine", "serverV", "connectBtn", "connectNote", "modes", "extraLine", "keeps", "settingsClose",
   "settingsBtn", "toast", "toastMsg", "undoBtn", "themeName", "swatches",
   "askWrap", "ask", "askCount", "askRaw", "askOptions", "askOther", "askOtherLine", "askHint",
   "heatWin", "heatFact", "heatMonths", "heatGrid"].forEach((id) => { el[id] = document.getElementById(id); });

  /* ---------------- Store: server file when served by `todo serve`, else this device ---------------- */
  const LocalStore = {
    kind: "local",
    async load() { try { return localStorage.getItem("todo.md") || ""; } catch (e) { return ""; } },
    async save(t) { try { localStorage.setItem("todo.md", t); } catch (e) {} return true; }
  };
  /* The server is same-origin when `todo serve` serves this page, or a URL you set in settings when the page is hosted elsewhere. */
  const RemoteStore = {
    kind: "server", etag: null, base: "", status: null,
    url(p) { return (this.base ? this.base.replace(/\/+$/, "") + "/" : "") + p; },
    get via() { return this.status ? this.status.via : ""; },
    get file() { return this.status ? this.status.file : ""; },
    get hasAgent() { return !!(this.status && this.status.command); },
    async probeAt(base) {
      try {
        const r = await fetch((base ? base.replace(/\/+$/, "") + "/" : "") + "api/status", { cache: "no-store" });
        if (!r.ok) return null;
        const j = await r.json();
        return j.ok ? j : null;
      } catch (e) { return null; }
    },
    async probe() {
      let saved = "";
      try { saved = localStorage.getItem("todo.server") || ""; } catch (e) {}
      let s = await this.probeAt("");
      if (s) { this.base = ""; this.status = s; return true; }
      if (saved) { s = await this.probeAt(saved); if (s) { this.base = saved; this.status = s; return true; } }
      return false;
    },
    async refresh() { const s = await this.probeAt(this.base); if (s) this.status = s; return s; },
    async load() {
      const r = await fetch(this.url("api/file"), { cache: "no-store" });
      this.etag = r.headers.get("ETag");
      return r.ok ? await r.text() : "";
    },
    async save(t) {
      const r = await fetch(this.url("api/file"), { method: "PUT", headers: { "Content-Type": "text/plain; charset=utf-8", "If-Match": this.etag || "*" }, body: t });
      if (r.status === 409) return false;
      this.etag = r.headers.get("ETag");
      return r.ok;
    },
    async post(p, bodyObj, method) {
      const r = await fetch(this.url(p), { method: method || "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bodyObj) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || (p + " failed with " + r.status));
      return j;
    },
    async scribe(raw) { return this.post("api/scribe", { raw }); },
    async config(patch) { this.status = await this.post("api/config", patch, "PUT"); return this.status; },
    async testAgent() { return this.post("api/agent-test", {}); }
  };

  let store = LocalStore;
  let sections = [];      // [{day: "Todo"|"Someday", items:[{id, done, head, detail, source, raw}]}]
  let flags = {};         // id -> [flag strings]; session only
  let prevText = null;    // undo snapshot
  let nextId = 1;
  const uid = () => "i" + (nextId++);
  const TODO = F.TODO, SOMEDAY = F.SOMEDAY;

  function load(text) { sections = F.parse(text); sections.forEach((s) => s.items.forEach((it) => { it.id = uid(); })); flags = {}; }
  function currentText() { return F.serialize(sections); }
  function ensure(name) { let s = sections.find((x) => x.day === name); if (!s) { s = { day: name, items: [] }; sections.push(s); } return s; }
  function findItem(id) {
    for (const s of sections) { const i = s.items.findIndex((x) => x.id === id); if (i > -1) return { s, it: s.items[i], i }; }
    return null;
  }
  function removeItem(id) { const f = findItem(id); if (f) f.s.items.splice(f.i, 1); return !!f; }
  function moveItem(it, from, toName) { const i = from.items.indexOf(it); if (i > -1) from.items.splice(i, 1); ensure(toName).items.push(it); }

  /* ---------------- Save: one write at a time, half a second after you stop ---------------- */
  let saveTimer = null, saving = null, pending = false, lastSaved = null;
  function scheduleSave(ms) { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, ms == null ? 500 : ms); }
  function saveNow() {
    clearTimeout(saveTimer); saveTimer = null;
    if (saving) { pending = true; return saving; }
    saving = (async () => {
      do {
        pending = false;
        const text = currentText();
        let ok = await store.save(text);
        if (!ok) {
          const remote = await store.load();
          if (remote === lastSaved || remote === text) ok = await store.save(text);
          else { toast("The file changed elsewhere. Reloaded it."); load(remote); lastSaved = remote; scheduleRender(); ok = true; }
        }
        if (ok) lastSaved = text;
      } while (pending);
      saving = null;
      updateCounts();
    })();
    return saving;
  }
  window.addEventListener("pagehide", () => { if (saveTimer) saveNow(); });

  /* ---------------- Render ---------------- */
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c])); }
  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function isLineFocused() { const a = document.activeElement; return !!(a && a.classList && a.classList.contains("line")); }
  let dirty = false;
  function scheduleRender() { setTimeout(() => { if (isLineFocused()) dirty = true; else render(); }, 60); }
  function updateCounts() { el.openCount.textContent = F.countOpen(sections) + " open"; el.rawEditor.value = currentText(); }

  /* Preferences: how the scribe works and how long done lines linger. Kept on the server when there is one, else in this browser. */
  const KEEP_LABELS = { gone: "gone", "1h": "an hour", today: "today", week: "a week", forever: "forever" };
  function prefs() {
    const s = RemoteStore.status;
    if (s) return { mode: s.scribe || "unbundle", extra: s.extra || "", keep: s.keep || "today" };
    let p = {};
    try { p = JSON.parse(localStorage.getItem("todo.prefs") || "{}"); } catch (e) {}
    return { mode: S.MODES[p.mode] ? p.mode : "unbundle", extra: p.extra || "", keep: F.KEEPS.indexOf(p.keep) > -1 ? p.keep : "today" };
  }
  async function setPrefs(patch) {
    if (RemoteStore.status) { await RemoteStore.config(patch); }
    else { const p = Object.assign(prefs(), patch); try { localStorage.setItem("todo.prefs", JSON.stringify(p)); } catch (e) {} }
  }
  /* Done lines stay in the file with their stamp. The list keeps them for as long as the done setting says. */
  function visible(it) { return F.doneVisible(it, prefs().keep, new Date()); }
  setInterval(() => { if (prefs().keep === "1h" && !isLineFocused() && el.settingsWrap.hidden) render(); }, 60000);
  function render(focus) {
    dirty = false;
    const todo = ensure(TODO), someday = ensure(SOMEDAY);
    el.todo.innerHTML = "";
    todo.items.filter(visible).sort((a, b) => Number(a.done) - Number(b.done)).forEach((it) => el.todo.appendChild(itemEl(todo, it)));
    el.todo.appendChild(newLineEl());
    el.somedayItems.innerHTML = "";
    const somedayVisible = someday.items.filter(visible);
    somedayVisible.sort((a, b) => Number(a.done) - Number(b.done)).forEach((it) => el.somedayItems.appendChild(itemEl(someday, it)));
    el.someday.hidden = !somedayVisible.length;
    updateCounts();
    renderHeat();
    if (focus) focusLine(focus);
  }

  /* ---------------- Heat: checked boxes plus real commits, one square per day ---------------- */
  let gh = {}, ghUser = "", heatDefault = "";
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  async function loadGithub() {
    if (store !== RemoteStore) return;
    try {
      const r = await fetch(RemoteStore.url("api/github"), { cache: "no-store" });
      const j = await r.json();
      gh = j.days || {}; ghUser = j.user || "";
      renderHeat();
    } catch (e) {}
  }
  function heatLabel(x) {
    const parts = [MONTHS[x.d.getMonth()] + " " + x.d.getDate()];
    if (x.dn) parts.push(x.dn + " done");
    if (x.g) parts.push(x.g + " gh");
    if (!x.dn && !x.g) parts.push("quiet");
    return parts.join(" · ");
  }
  function renderHeat() {
    const done = F.doneByDay(sections);
    const cell = 11, gap = 3;
    const cs = getComputedStyle(el.heatWin);
    const width = el.heatWin.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) || 300;
    const cols = Math.max(8, Math.min(53, Math.floor((width + gap) / (cell + gap))));
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayIso = F.isoDate(today);
    const start = new Date(today); start.setDate(today.getDate() - today.getDay() - (cols - 1) * 7);
    const days = [];
    let max = 0, totalDone = 0, totalGh = 0;
    for (let i = 0; i < cols * 7; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const iso = F.isoDate(d), future = d > today;
      const dn = done[iso] || 0, g = gh[iso] || 0;
      const score = future ? 0 : dn + 2 * g;          /* real commits weigh double */
      if (!future) { max = Math.max(max, score); totalDone += dn; totalGh += g; }
      days.push({ iso, d, dn, g, score, future });
    }
    el.heatGrid.style.gridTemplateRows = "repeat(7, " + cell + "px)";
    el.heatGrid.style.gridAutoColumns = cell + "px";
    el.heatGrid.style.gap = gap + "px";
    el.heatGrid.innerHTML = "";
    days.forEach((x) => {
      const c = document.createElement("div");
      c.className = "cell" + (x.future ? " future" : "") + (x.iso === todayIso ? " today" : "");
      c.dataset.l = x.score === 0 ? 0 : Math.max(1, Math.ceil(4 * x.score / max));
      c.title = heatLabel(x);
      c.addEventListener("pointerenter", () => { el.heatFact.textContent = heatLabel(x); });
      c.addEventListener("click", () => { el.heatFact.textContent = heatLabel(x); });
      el.heatGrid.appendChild(c);
    });
    el.heatGrid.onpointerleave = () => { el.heatFact.textContent = heatDefault; };
    el.heatMonths.style.gridAutoColumns = cell + "px";
    el.heatMonths.style.gap = gap + "px";
    el.heatMonths.innerHTML = "";
    for (let c = 0; c < cols; c++) {
      const span = document.createElement("span");
      const first = days.slice(c * 7, c * 7 + 7).find((x) => x.d.getDate() === 1 && !x.future);
      span.textContent = first ? MONTHS[first.d.getMonth()] : "";
      el.heatMonths.appendChild(span);
    }
    let streak = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      const x = days[i];
      if (x.future) continue;
      if (x.dn + x.g > 0) streak++;
      else if (x.iso === todayIso) continue;
      else break;
    }
    heatDefault = (streak ? streak + "d streak · " : "") + totalDone + " done" + (ghUser ? " · " + totalGh + " gh" : "");
    el.heatFact.textContent = heatDefault;
    placeHeat();
  }
  /* Pin the chart to the screen bottom. On touch devices, remember the tallest viewport seen at this width:
     when the keyboard shrinks the window, the chart keeps its place and the keyboard covers it. */
  const touch = matchMedia("(hover: none) and (pointer: coarse)").matches || /[?&]touch=1/.test(location.search);
  let baseH = window.innerHeight, baseW = window.innerWidth;
  function placeHeat() {
    const h = el.heatWin.offsetHeight;
    const safe = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--safe-bottom")) || 0;
    document.body.style.paddingBottom = (h + 24 + safe) + "px";
    if (!touch) { document.body.classList.remove("kb-aware"); el.heatWin.style.top = ""; return; }
    if (window.innerWidth !== baseW) { baseW = window.innerWidth; baseH = window.innerHeight; }
    else if (window.innerHeight > baseH) baseH = window.innerHeight;
    document.body.classList.add("kb-aware");
    el.heatWin.style.top = Math.max(0, baseH - h - 12 - safe) + "px";
  }
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (window.innerWidth !== baseW || !touch) renderHeat(); else placeHeat(); }, 150);
  });
  function itemEl(s, it) {
    const row = document.createElement("div");
    row.className = "item" + (it.done ? " done" : "") + (it.raw ? " raw" : ""); row.dataset.id = it.id;
    const box = document.createElement("button");
    box.type = "button"; box.className = "box"; box.setAttribute("aria-label", it.done ? "Reopen" : "Mark done");
    box.addEventListener("click", () => toggleDone(it.id));
    const line = document.createElement("div");
    line.className = "line"; line.contentEditable = "plaintext-only"; line.dataset.id = it.id; line.dataset.sec = s.day;
    paint(line, it);
    wire(line);
    row.append(box, line);
    return row;
  }
  function newLineEl() {
    const row = document.createElement("div");
    row.className = "item new";
    const box = document.createElement("span"); box.className = "box";
    const line = document.createElement("div");
    line.className = "line"; line.contentEditable = "plaintext-only"; line.dataset.sec = TODO; line.dataset.placeholder = "add";
    wire(line);
    row.append(box, line);
    return row;
  }
  function paint(line, it) {
    const plain = F.plainItem(it);
    line.dataset.text = plain;
    line.innerHTML = "";
    if (it.raw) {
      line.textContent = it.head;
      if (it.source) { line.appendChild(document.createTextNode(" ")); const s = document.createElement("span"); s.className = "s"; s.textContent = "Source: " + it.source; line.appendChild(s); }
      return;
    }
    const fl = flags[it.id] || [];
    const b = document.createElement("b"); appendMarked(b, it.head, fl); line.appendChild(b);
    if (it.detail) { line.appendChild(document.createTextNode(" ")); const d = document.createElement("span"); d.className = "d"; appendMarked(d, it.detail, fl); line.appendChild(d); }
    if (it.source) { line.appendChild(document.createTextNode(" ")); const s = document.createElement("span"); s.className = "s"; s.textContent = "Source: " + it.source; line.appendChild(s); }
    if (it.from) { line.appendChild(document.createTextNode(" ")); const f = document.createElement("span"); f.className = "s"; f.textContent = "↳ " + it.from; line.appendChild(f); }
  }
  function appendMarked(parent, text, fl) {
    const words = fl.map((f) => (f.match(/^new (?:word|number) (.+)$/) || [])[1]).filter(Boolean);
    if (!words.length) { parent.textContent = text; return; }
    const re = new RegExp("(" + words.map(escapeRe).join("|") + ")", "gi");
    text.split(re).forEach((part, i) => {
      if (!part) return;
      if (i % 2) { const m = document.createElement("mark"); m.textContent = part; parent.appendChild(m); }
      else parent.appendChild(document.createTextNode(part));
    });
  }
  function focusLine(spec) {
    let line = null;
    if (spec.id) line = document.querySelector('.line[data-id="' + spec.id + '"]');
    else if (spec.add) line = el.todo.querySelector(".item.new .line");
    if (!line) return;
    line.focus();
    placeCaret(line, null);
  }

  /* ---------------- Editing ---------------- */
  let tapPoint = null;
  function wire(line) {
    line.addEventListener("pointerdown", (e) => { tapPoint = { x: e.clientX, y: e.clientY }; });
    line.addEventListener("focus", () => {
      if (line.dataset.id !== undefined && line.dataset.text !== undefined) line.textContent = line.dataset.text;
      const pt = tapPoint; tapPoint = null;
      requestAnimationFrame(() => placeCaret(line, pt));
    });
    line.addEventListener("input", () => { clearTimeout(line._t); line._t = setTimeout(() => commitLine(line, true), 500); });
    line.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); onEnter(line); }
      else if (e.key === "Backspace" && !line.textContent) { e.preventDefault(); onBackspaceEmpty(line); }
      else if (e.key === "Escape") { line.blur(); }
    });
    line.addEventListener("blur", () => { clearTimeout(line._t); if (!line.isConnected) return; commitLine(line, false); scheduleRender(); });
  }
  function placeCaret(line, pt) {
    let range = null;
    try {
      if (pt && document.caretRangeFromPoint) range = document.caretRangeFromPoint(pt.x, pt.y);
      else if (pt && document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(pt.x, pt.y); if (p) { range = document.createRange(); range.setStart(p.offsetNode, p.offset); range.collapse(true); } }
    } catch (e) { range = null; }
    if (!range || !line.contains(range.startContainer)) { range = document.createRange(); range.selectNodeContents(line); range.collapse(false); }
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
  }
  function lineText(line) { return (line.textContent || "").replace(/ /g, " "); }

  /* Write what the line says into the model. live = still typing: no moves, no removals. */
  function commitLine(line, live) {
    const text = lineText(line);
    const parts = text.split("\n").map((s) => s.trim()).filter(Boolean);
    let id = line.dataset.id;
    if (!id) {
      if (!parts.length) return;
      const home = ensure(F.wantsSomeday(parts[0]) ? SOMEDAY : line.dataset.sec);
      const it = Object.assign(F.rawLine(parts[0]) || { done: false, head: parts[0], detail: "", source: "", raw: true }, { id: uid() });
      home.items.push(it);
      line.dataset.id = it.id; line.dataset.text = ""; id = it.id;
    }
    const found = findItem(id);
    if (!found) return;
    const { s, it } = found;
    if (!parts.length) { if (!live) { removeItem(id); delete flags[id]; scheduleSave(0); } return; }
    const changed = text.trim() !== (line.dataset.text || "").trim();
    if (!changed && live) return;
    if (changed) delete flags[id];

    if (!live && F.isFormatted(text)) { absorbReply(id, text); return; }
    if (it.raw) {
      const r = F.rawLine(parts[0]);
      if (r) { it.head = r.head; it.source = r.source; it.done = it.done || r.done; }
      if (!live && parts.length > 1) {
        const idx = s.items.indexOf(it);
        parts.slice(1).forEach((p, k) => { const x = F.rawLine(p); if (x) s.items.splice(idx + 1 + k, 0, Object.assign(x, { id: uid() })); });
      }
    } else {
      const st = F.structuredLine(parts.join(" "));
      it.head = st.head; it.detail = st.detail; it.source = st.source;
    }
    if (!live && changed) {
      if (s.day === TODO && F.wantsSomeday(text)) moveItem(it, s, SOMEDAY);
      else if (s.day === SOMEDAY && F.wantsNow(text)) moveItem(it, s, TODO);
    }
    line.dataset.text = F.plainItem(it);
    scheduleSave(live ? 600 : 0);
  }
  function onEnter(line) {
    clearTimeout(line._t);
    commitLine(line, false);
    saveNow();
    render({ add: true });
  }
  function onBackspaceEmpty(line) {
    const id = line.dataset.id;
    const prev = previousLine(line);
    if (id) { removeItem(id); delete flags[id]; saveNow(); }
    render(prev ? { id: prev } : { add: true });
  }
  function previousLine(line) {
    const all = [...document.querySelectorAll(".line")];
    const i = all.indexOf(line);
    for (let k = i - 1; k >= 0; k--) if (all[k].dataset.id) return all[k].dataset.id;
    return null;
  }
  function toggleDone(id) {
    const f = findItem(id); if (!f) return;
    prevText = currentText();
    f.it.done = !f.it.done;
    f.it.doneAt = f.it.done ? F.now() : "";
    saveNow();
    scheduleRender();
    toast(f.it.done ? "Done. Another person can use it, read it, or buy it?" : "Reopened.", true);
  }

  /* ---------------- Toast + undo ---------------- */
  let toastTimer = null;
  function toast(msg, undoable) {
    el.toastMsg.textContent = msg;
    el.undoBtn.hidden = !undoable;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.hidden = true; }, undoable ? 7000 : 3000);
  }
  el.undoBtn.addEventListener("click", async () => {
    if (prevText === null) return;
    load(prevText); prevText = null;
    await saveNow(); render();
    el.toast.hidden = true;
  });

  /* ---------------- Scribe: clean the lines you already logged ---------------- */
  function setStatus(word, cls) { el.scribeStatus.textContent = word || ""; el.scribeStatus.className = "status" + (cls ? " " + cls : ""); }
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch (e) {}
    const ta = document.createElement("textarea");
    ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch (e) {}
    ta.remove(); return ok;
  }
  function commitFocused() { const a = document.activeElement; if (a && a.classList && a.classList.contains("line")) { clearTimeout(a._t); commitLine(a, false); a.blur(); } }

  el.scribe.addEventListener("click", async () => {
    commitFocused();
    const raw = F.rawText(sections);
    if (!raw) { toast("Nothing raw to scribe. Type a line first."); focusLine({ add: true }); return; }
    if (store !== RemoteStore || !RemoteStore.hasAgent) {
      const ok = await copyText(S.buildPrompt(raw, prefs()));
      setStatus(ok ? "prompt copied" : "copy failed", ok ? "ok" : "err");
      toast(ok ? "Prompt copied. Paste it into any AI, then paste the reply into a line." : "Could not copy.");
      return;
    }
    el.scribe.disabled = true;
    setStatus("working", "busy");
    try {
      const j = await RemoteStore.scribe(raw);
      applyScribe(raw, j.cleaned || j.reply || "");
      setStatus(statusWord(), "ok");
    } catch (e) {
      setStatus("failed", "err");
      toast(e.message);
    } finally { el.scribe.disabled = false; }
  });
  function applyScribe(raw, cleaned) {
    const reply = F.parseReply(cleaned);
    const g = F.guard(raw, reply.sections);
    const askList = reply.asks;
    if (!g.items.length && !askList.length) { toast("The scribe returned nothing in the format."); return; }
    prevText = currentText();
    reply.sections.forEach((s) => s.items.forEach((it) => { it.id = uid(); }));
    F.absorb(sections, reply.sections, askList.map((a) => a.raw));
    g.items.forEach((e) => { if (e.flags.length) flags[e.item.id] = e.flags; });
    saveNow();
    render();
    const parents = new Set(g.items.map((e) => e.item.from).filter(Boolean));
    const parts = [g.items.length + " scribed"];
    if (parents.size) parts.push(parents.size + " broken down");
    if (g.flagged) parts.push(g.flagged + " flagged");
    if (askList.length) parts.push(askList.length + " question" + (askList.length > 1 ? "s" : ""));
    toast(parts.join(", ") + ".", true);
    queueAsks(askList);
  }

  /* ---------------- Ask: the scribe's third move. An omarchy menu over the list. ---------------- */
  let asks = [], hi = 0;
  const hoverable = matchMedia("(hover: hover)").matches;
  function findRawByText(raw) {
    const n = F.normLine(raw);
    for (const s of sections) for (const it of s.items) if (it.raw && !it.done && F.normLine(F.plainItem(it)) === n) return it;
    return null;
  }
  function queueAsks(list) {
    list.forEach((a) => { const it = findRawByText(a.raw); if (it) asks.push({ raw: a.raw.replace(/^\s*someday:\s*/i, ""), options: a.options, id: it.id }); });
    showAsk();
  }
  function showAsk() {
    const a = asks[0];
    if (!a) { el.askWrap.hidden = true; return; }
    el.askRaw.textContent = a.raw;
    el.askCount.textContent = asks.length > 1 ? asks.length + " questions" : "";
    el.askOptions.innerHTML = "";
    a.options.forEach((opt, i) => el.askOptions.appendChild(optionEl(i + 1, opt.head, opt.detail, () => pickOption(i))));
    el.askOptions.appendChild(optionEl(a.options.length + 1, "other…", "", showOther, true));
    el.askOther.hidden = true; el.askOtherLine.textContent = "";
    el.askHint.innerHTML = hoverable
      ? "<kbd>1</kbd>–<kbd>" + (a.options.length + 1) + "</kbd> pick · <kbd>esc</kbd> keep my words"
      : "tap to pick · tap outside to keep my words";
    hi = 0; highlight();
    el.askWrap.hidden = false;
  }
  function optionEl(n, head, detail, onPick, other) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "opt" + (other ? " other" : "");
    const num = document.createElement("span"); num.className = "n"; num.textContent = n;
    const t = document.createElement("span"); t.className = "t";
    if (other) t.textContent = head;
    else { const bb = document.createElement("b"); bb.textContent = head; t.appendChild(bb); if (detail) { t.appendChild(document.createTextNode(" ")); const d = document.createElement("span"); d.className = "d"; d.textContent = detail; t.appendChild(d); } }
    b.append(num, t);
    b.addEventListener("click", onPick);
    return b;
  }
  function highlight() { [...el.askOptions.children].forEach((b, i) => b.classList.toggle("hi", i === hi)); }
  function pickOption(i) {
    const a = asks.shift();
    const opt = a && a.options[i];
    if (!opt) { showAsk(); return; }
    prevText = currentText();
    const f = findItem(a.id);
    const sec = f ? f.s.day : TODO;
    if (f) removeItem(a.id);
    const it = Object.assign({}, opt, { id: uid(), done: false, raw: false });
    ensure(sec).items.push(it);
    const g = F.guard(a.raw, F.serializeItem(it));
    if (g.items[0] && g.items[0].flags.length) flags[it.id] = g.items[0].flags;
    saveNow(); render();
    toast("Filed.", true);
    showAsk();
  }
  function skipAsk() { if (!asks.length) return; asks.shift(); showAsk(); }
  function showOther() { el.askOther.hidden = false; el.askOtherLine.focus(); }
  async function answerOther(text) {
    text = text.trim();
    if (!text) { el.askOther.hidden = true; return; }
    const a = asks.shift();
    const f = findItem(a.id);
    if (!f) { showAsk(); return; }
    const kept = () => { f.it.head = a.raw + " (" + text + ")"; saveNow(); render(); };
    if (store !== RemoteStore || !RemoteStore.hasAgent) { kept(); toast("Kept your words with the answer."); showAsk(); return; }
    el.askWrap.hidden = true;
    setStatus("working", "busy");
    try {
      const j = await RemoteStore.scribe((f.s.day === SOMEDAY ? "someday: " : "") + a.raw + " [answer: " + text + "]");
      const cleaned = S.clean(j.cleaned || j.reply || "");
      const items = [];
      F.parseReply(cleaned).sections.forEach((s) => s.items.forEach((it) => items.push({ it, sec: s.day })));
      if (items.length) {
        prevText = currentText();
        removeItem(a.id);
        items.forEach(({ it, sec }) => {
          it.id = uid(); ensure(sec).items.push(it);
          const g = F.guard(a.raw + " " + text, F.serializeItem(it));
          if (g.items[0] && g.items[0].flags.length) flags[it.id] = g.items[0].flags;
        });
        saveNow(); render(); toast("Filed.", true);
      } else { kept(); toast("Kept your words with the answer."); }
      setStatus(statusWord(), "ok");
    } catch (e) { setStatus("failed", "err"); toast(e.message); }
    showAsk();
  }
  el.askWrap.addEventListener("click", (e) => { if (e.target === el.askWrap) skipAsk(); });
  el.askOtherLine.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); answerOther(el.askOtherLine.textContent || ""); }
    else if (e.key === "Escape") { e.preventDefault(); el.askOther.hidden = true; }
    e.stopPropagation();
  });
  function askKeys(e) {
    if (el.askWrap.hidden) return false;
    if (document.activeElement === el.askOtherLine) return true;
    const count = el.askOptions.children.length;
    if (/^[1-9]$/.test(e.key)) { const i = parseInt(e.key, 10) - 1; if (i < count) el.askOptions.children[i].click(); }
    else if (e.key === "j" || e.key === "ArrowDown") { hi = (hi + 1) % count; highlight(); }
    else if (e.key === "k" || e.key === "ArrowUp") { hi = (hi - 1 + count) % count; highlight(); }
    else if (e.key === "Enter") { el.askOptions.children[hi].click(); }
    else if (e.key === "Escape") { skipAsk(); }
    else return true;
    e.preventDefault();
    return true;
  }
  /* A pasted scribe reply is recognized by its shape. The other raw lines are the capture it came from. */
  function absorbReply(id, text) {
    const raw = F.rawItems(sections).filter((it) => it.id !== id).map(F.plainItem).join("\n");
    removeItem(id);
    applyScribe(raw, text);
  }

  /* ---------------- Settings: a config file, rendered ---------------- */
  el.settingsBtn.addEventListener("click", () => {
    if (el.settingsWrap.hidden) openSettings(); else closeSettings();
  });
  function openSettings() { el.rawEditor.value = currentText(); renderSettings(); el.settingsWrap.hidden = false; el.settingsWrap.scrollTop = 0; }
  function closeSettings() { const a = document.activeElement; if (a && el.settingsWin.contains(a)) a.blur(); el.settingsWrap.hidden = true; }
  el.settingsWrap.addEventListener("click", (e) => { if (e.target === el.settingsWrap) closeSettings(); });
  el.settingsClose.addEventListener("click", closeSettings);
  function statusWord() {
    if (store !== RemoteStore) return "paste door";
    return RemoteStore.hasAgent ? RemoteStore.via : "paste door";
  }
  function renderSettings() {
    const s = RemoteStore.status;
    el.presets.innerHTML = "";
    const names = (s && s.presets) || ["claude", "codex", "hermes", "grok", "paste"];
    names.forEach((name) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "opt-t"; b.textContent = name;
      b.setAttribute("aria-pressed", String(!!s && s.via === name));
      b.disabled = !s;
      b.addEventListener("click", () => setAgent(name));
      el.presets.appendChild(b);
    });
    if (s && s.command) {
      const t = document.createElement("button");
      t.type = "button"; t.className = "act test"; t.textContent = "test";
      t.addEventListener("click", testAgent);
      el.presets.appendChild(t);
    }
    el.agentNote.className = "note";
    if (!s) el.agentNote.textContent = "no server. the scribe copies its prompt for the AI you carry; paste the reply into a line.";
    else if (!s.command) el.agentNote.textContent = "paste door: the scribe copies its prompt for the AI you carry.";
    else el.agentNote.innerHTML = "runs <b>" + esc(s.command) + "</b> on " + esc(s.host || "the server") + (s.custom ? " (custom command, set on that machine)" : "");
    const p = prefs();
    el.modes.innerHTML = "";
    Object.keys(S.MODES).forEach((m) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "opt-t"; b.textContent = S.MODES[m]; b.title = m;
      b.setAttribute("aria-pressed", String(p.mode === m));
      b.addEventListener("click", async () => { try { await setPrefs({ scribe: m }); renderSettings(); toast("Scribe will " + S.MODES[m] + "."); } catch (e) { toast(e.message); } });
      el.modes.appendChild(b);
    });
    el.extraLine.textContent = p.extra;
    el.keeps.innerHTML = "";
    F.KEEPS.forEach((k) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "opt-t"; b.textContent = KEEP_LABELS[k]; b.title = k;
      b.setAttribute("aria-pressed", String(p.keep === k));
      b.addEventListener("click", async () => { try { await setPrefs({ keep: k }); renderSettings(); render(); toast("Done lines stay " + (k === "gone" ? "out of the list" : k === "forever" ? "forever" : "for " + KEEP_LABELS[k]) + "."); } catch (e) { toast(e.message); } });
      el.keeps.appendChild(b);
    });
    el.githubLine.textContent = s ? (s.github || "") : "";
    el.githubLine.contentEditable = s ? "plaintext-only" : "false";
    el.serverV.innerHTML = "";
    if (s) {
      const d = document.createElement("div"); d.className = "serverline";
      d.innerHTML = "<b>" + esc(s.file) + "</b> on " + esc(s.host || "") + (RemoteStore.base ? " via " + esc(RemoteStore.base) : "");
      el.serverV.appendChild(d);
    }
    const line = document.createElement("div");
    line.className = "line one"; line.contentEditable = "plaintext-only";
    line.dataset.placeholder = s ? "or another server URL" : "server URL, e.g. https://your-machine.your-tailnet.ts.net:8790";
    let saved = ""; try { saved = localStorage.getItem("todo.server") || ""; } catch (e) {}
    line.textContent = RemoteStore.base || saved;
    line.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); line.blur(); } e.stopPropagation(); });
    line.addEventListener("blur", () => setServer(line.textContent.trim()));
    el.serverV.appendChild(line);
    el.storeNote.textContent = s ? "one file. the CLI and any agent edit the same one." : "items live in this browser until a server is set.";
  }
  async function setAgent(name) {
    try {
      await RemoteStore.config({ via: name });
      setStatus(statusWord(), "ok");
      renderSettings();
      toast(name === "paste" ? "Paste door on." : "Scribe runs " + name + ".");
    } catch (e) { toast(e.message); }
  }
  async function testAgent() {
    const btn = el.presets.querySelector(".test");
    if (btn) { btn.disabled = true; btn.textContent = "testing…"; }
    el.agentNote.className = "note status-busy"; el.agentNote.textContent = "asking the agent for one word…";
    try {
      const j = await RemoteStore.testAgent();
      el.agentNote.className = "note " + (j.ok ? "status-ok" : "status-err");
      el.agentNote.textContent = j.ok ? "answered in " + (j.ms / 1000).toFixed(1) + "s" : "answered oddly in " + (j.ms / 1000).toFixed(1) + "s: " + (j.reply || j.error || "");
    } catch (e) { el.agentNote.className = "note status-err"; el.agentNote.textContent = e.message; }
    if (btn) { btn.disabled = false; btn.textContent = "test"; }
  }
  el.connectBtn.addEventListener("click", async () => {
    const s = RemoteStore.status;
    const server = RemoteStore.base || (store === RemoteStore ? location.origin : "");
    if (!s || !server) { toast("Connect needs a server. Run todo serve and open the page from it."); return; }
    const ok = await copyText(S.connectPrompt({ server, file: s.file, host: s.host }));
    if (!ok) { toast("Could not copy."); return; }
    el.connectBtn.textContent = "command copied";
    el.connectBtn.disabled = true;
    setTimeout(() => { el.connectBtn.textContent = "connect agent"; el.connectBtn.disabled = false; }, 2500);
  });
  el.extraLine.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); el.extraLine.blur(); } e.stopPropagation(); });
  el.extraLine.addEventListener("blur", async () => {
    const v = el.extraLine.textContent.replace(/\s+/g, " ").trim().slice(0, S.EXTRA_MAX);
    if (v === prefs().extra) return;
    try { await setPrefs({ extra: v }); toast(v ? "The scribe will follow that." : "Extra instruction cleared."); }
    catch (e) { toast(e.message); el.extraLine.textContent = prefs().extra; }
  });
  el.githubLine.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); el.githubLine.blur(); } e.stopPropagation(); });
  el.githubLine.addEventListener("blur", async () => {
    if (!RemoteStore.status) return;
    const v = el.githubLine.textContent.trim();
    if (v === (RemoteStore.status.github || "")) return;
    try { await RemoteStore.config({ github: v }); toast(v ? "Heat map follows " + v + "." : "GitHub off."); gh = {}; loadGithub(); }
    catch (e) { toast(e.message); el.githubLine.textContent = RemoteStore.status.github || ""; }
  });
  async function setServer(url) {
    const current = RemoteStore.base || "";
    if (url === current) return;
    if (!url) { try { localStorage.removeItem("todo.server"); } catch (e) {} if (RemoteStore.base) location.reload(); return; }
    if (!/^https?:\/\//.test(url)) { toast("A server URL starts with http:// or https://"); return; }
    const s = await RemoteStore.probeAt(url);
    if (!s) { toast("No todo server answered at " + url); return; }
    try { localStorage.setItem("todo.server", url); } catch (e) {}
    toast("Connected to " + (s.host || url) + ". Reloading.");
    setTimeout(() => location.reload(), 600);
  }
  let rawTimer = null;
  el.rawEditor.addEventListener("input", () => {
    clearTimeout(rawTimer);
    rawTimer = setTimeout(() => { load(el.rawEditor.value); store.save(currentText()); dirty = true; }, 800);
  });
  el.rawEditor.addEventListener("blur", () => { clearTimeout(rawTimer); load(el.rawEditor.value); saveNow(); render(); });
  el.clearBtn.addEventListener("click", async () => {
    if (!confirm("Delete every item?")) return;
    prevText = currentText(); load("");
    await saveNow(); render();
    toast("Deleted.", true);
  });
  el.copyBtn.addEventListener("click", async () => { toast((await copyText(currentText())) ? "Copied." : "Could not copy."); });
  el.promptBtn.addEventListener("click", async () => {
    commitFocused();
    const raw = F.rawText(sections);
    if (!raw) { toast("Nothing raw to scribe."); return; }
    toast((await copyText(S.buildPrompt(raw, prefs()))) ? "Prompt copied. Paste the reply into a line." : "Could not copy.");
  });
  el.exportBtn.addEventListener("click", async () => {
    const text = currentText();
    const file = new File([text], "todo.md", { type: "text/markdown" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "todo.md" }); return; } catch (e) {}
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
    a.download = "todo.md"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  el.importBtn.addEventListener("click", () => el.importFile.click());
  el.importFile.addEventListener("change", async () => {
    const f = el.importFile.files[0]; if (!f) return;
    prevText = currentText();
    const added = F.merge(sections, F.parse(await f.text()));
    sections.forEach((s) => s.items.forEach((it) => { if (!it.id) it.id = uid(); }));
    await saveNow(); render();
    toast(added + " imported.", true);
    el.importFile.value = "";
  });

  /* ---------------- Keys ---------------- */
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (askKeys(e)) return;
    const a = document.activeElement;
    if (a && (/^(INPUT|TEXTAREA)$/.test(a.tagName) || a.isContentEditable)) return;
    if (e.key === "n" || e.key === "N") { e.preventDefault(); focusLine({ add: true }); }
    if (e.key === ",") { e.preventDefault(); el.settingsBtn.click(); }
    if (e.key === "t" || e.key === "T") { cycleTheme(); }
    if (e.key === "Escape") { closeSettings(); }
  });

  /* ---------------- Themes: data, not structure ---------------- */
  const THEMES = [
    { id: "tokyo-night", bg: "#1a1b26", ac: "#7aa2f7" }, { id: "heymitch", bg: "#1c1612", ac: "#e8682a" },
    { id: "gruvbox", bg: "#282828", ac: "#fe8019" }, { id: "catppuccin", bg: "#1e1e2e", ac: "#cba6f7" },
    { id: "nord", bg: "#2e3440", ac: "#88c0d0" }, { id: "everforest", bg: "#2d353b", ac: "#a7c080" },
    { id: "rose-pine", bg: "#191724", ac: "#ebbcba" }, { id: "latte", bg: "#eff1f5", ac: "#8839ef" }
  ];
  const DEFAULT_THEME = "tokyo-night", THEME_KEY = "hm-palette-v2";
  let currentTheme = DEFAULT_THEME;
  function applyTheme(id) {
    currentTheme = id;
    document.documentElement.setAttribute("data-palette", id);
    el.themeName.textContent = id;
    const t = THEMES.find((x) => x.id === id);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && t) meta.setAttribute("content", t.bg);
    [...el.swatches.children].forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.id === id)));
    try { localStorage.setItem(THEME_KEY, id); } catch (e) {}
  }
  function cycleTheme() { const i = THEMES.findIndex((t) => t.id === currentTheme); applyTheme(THEMES[(i + 1) % THEMES.length].id); }
  el.themeName.style.minWidth = Math.max(...THEMES.map((t) => t.id.length)) + "ch";
  THEMES.forEach((t) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "swatch"; b.dataset.id = t.id;
    b.style.setProperty("--sw-bg", t.bg); b.style.setProperty("--sw-ac", t.ac);
    b.setAttribute("aria-label", "Switch to " + t.id);
    b.title = t.id;
    b.addEventListener("click", () => applyTheme(t.id));
    el.swatches.appendChild(b);
  });
  (function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
    applyTheme(THEMES.some((t) => t.id === saved) ? saved : DEFAULT_THEME);
  })();

  /* ---------------- Boot ---------------- */
  (async function boot() {
    if (await RemoteStore.probe()) store = RemoteStore;
    setStatus(statusWord(), store === RemoteStore ? "ok" : "");
    const initial = await store.load();
    load(initial); lastSaved = initial;
    render();
    loadGithub();
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
      let hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadController) location.reload(); hadController = true; });
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  })();
})();
