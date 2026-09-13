"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const F = require(path.join(__dirname, "..", "format.js"));
const S = require(path.join(__dirname, "..", "scribe.js"));

const SAMPLE = [
  "## Todo",
  "",
  "* [ ] **THE DECK SENT TO ALEX.** Ask about the budget first. Source: notes/deck.md",
  "* [x] **QUARTERLY GOALS WRITTEN DOWN.**",
  "* [ ] call sam about the video",
  "    * [ ] **NESTED ITEM FLATTENS.**",
  "",
  "## Someday",
  "",
  "* [ ] **OLD LAPTOP WIPED.**",
  ""
].join("\n");

test("parse extracts section, done state, head, detail, source, and raw", () => {
  const s = F.parse(SAMPLE);
  assert.equal(s.length, 2);
  assert.equal(s[0].day, "Todo");
  assert.equal(s[0].items.length, 4);
  const first = s[0].items[0];
  assert.equal(first.done, false);
  assert.equal(first.raw, false);
  assert.equal(first.head, "THE DECK SENT TO ALEX.");
  assert.equal(first.detail, "Ask about the budget first.");
  assert.equal(first.source, "notes/deck.md");
  assert.equal(s[0].items[1].done, true);
  assert.equal(s[0].items[2].raw, true);
  assert.equal(s[0].items[2].head, "call sam about the video");
  assert.equal(s[0].items[3].head, "NESTED ITEM FLATTENS.");
  assert.equal(s[1].day, "Someday");
});

test("old dated headings and Unplaced fold into Todo", () => {
  const s = F.parse("## 2026-09-13\n\n* [ ] **A.**\n\n## Unplaced\n\n* [ ] b\n\n## someday\n\n* [ ] c\n");
  assert.equal(s.length, 2);
  assert.equal(s[0].day, "Todo");
  assert.equal(s[0].items.length, 2);
  assert.equal(s[1].day, "Someday");
});

test("serialize then parse is a fixed point; raw lines stay unbolded; Todo before Someday", () => {
  const once = F.serialize(F.parse(SAMPLE));
  const twice = F.serialize(F.parse(once));
  assert.equal(once, twice);
  assert.ok(once.startsWith("## Todo\n"));
  assert.ok(once.includes("\n* [ ] call sam about the video\n"));
  assert.ok(once.indexOf("## Todo") < once.indexOf("## Someday"));
});

test("absorb replaces raw open lines with the scribed reply and keeps everything else", () => {
  const s = F.parse(SAMPLE);
  assert.equal(F.rawText(s), "call sam about the video");
  const withSomeday = F.parse("## Todo\n\n* [ ] a\n\n## Someday\n\n* [ ] b\n* [x] c\n");
  assert.equal(F.rawText(withSomeday), "a\nsomeday: b");
  const reply = F.parse("## Todo\n\n* [ ] **SAM CALLED ABOUT THE VIDEO.**\n");
  const added = F.absorb(s, reply);
  assert.equal(added, 1);
  assert.equal(F.rawItems(s).length, 0);
  assert.equal(s[0].items.length, 4);
  assert.ok(s[0].items.some((it) => it.head === "SAM CALLED ABOUT THE VIDEO."));
});

test("an Ask section yields questions with complete options and never leaks into Todo", () => {
  const reply = [
    "## Todo", "", "* [ ] **RUST LEARNED.**", "",
    "## Ask", "",
    "* [?] someday: cancel the meeting with alex or move it to thursday",
    "  * [ ] **ALEX MEETING CANCELLED.**",
    "  * [ ] **ALEX MEETING MOVED TO THURSDAY.**", ""
  ].join("\n");
  const sections = F.parse(reply);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].items.length, 1);
  const asks = F.parseAsks(reply);
  assert.equal(asks.length, 1);
  assert.equal(asks[0].raw, "someday: cancel the meeting with alex or move it to thursday");
  assert.equal(asks[0].options.length, 2);
  assert.equal(asks[0].options[1].head, "ALEX MEETING MOVED TO THURSDAY.");
  assert.equal(asks[0].options[1].raw, false);

  const file = F.parse("## Todo\n\n* [ ] learn rust\n\n## Someday\n\n* [ ] cancel the meeting with alex or move it to thursday\n");
  const added = F.absorb(file, sections, asks.map((a) => a.raw));
  assert.equal(added, 1);
  assert.equal(F.rawItems(file).length, 1, "the questioned line stays raw");
  assert.equal(F.normLine(F.plainItem(F.rawItems(file)[0])), F.normLine(asks[0].raw));
  assert.ok(S.clean("## Ask\n* [?] x\n  * [ ] **Y.**\n").includes("* [?] x"));
  assert.ok(S.buildPrompt("x").includes("## Ask"));
});

test("rawLine keeps the writer's words; structuredLine re-splits an edited scribed line", () => {
  const r = F.rawLine("call alex by friday Source: notes/x.md");
  assert.deepEqual(r, { done: false, head: "call alex by friday", detail: "", source: "notes/x.md", raw: true });
  assert.equal(F.rawLine("   "), null);
  const st = F.structuredLine("ALEX CALLED. Ask Sam first. Source: notes/x.md");
  assert.deepEqual(st, { done: false, head: "ALEX CALLED.", detail: "Ask Sam first.", source: "notes/x.md", raw: false });
  assert.equal(F.structuredLine("ship v0.4.0 tues").head, "ship v0.4.0 tues");
  assert.ok(F.wantsSomeday("maybe read the rust book sometime"));
  assert.ok(!F.wantsSomeday("later.md is a file"));
  assert.ok(F.wantsNow("do this today"));
});

test("a checked line carries its Done: date, which survives a round trip and feeds doneByDay", () => {
  const text = "## Todo\n\n* [x] **A.** Source: x.md Done: 2026-09-12\n* [x] **B.** Done: 2026-09-12\n* [x] **OLD.**\n* [ ] **C.** Done: 2026-09-13\n";
  const s = F.parse(text);
  assert.equal(s[0].items[0].doneAt, "2026-09-12");
  assert.equal(s[0].items[0].source, "x.md");
  assert.equal(s[0].items[2].doneAt, "");
  assert.equal(s[0].items[3].doneAt, "", "an open line ignores a stray Done:");
  assert.equal(F.serialize(s), "## Todo\n\n* [x] **A.** Source: x.md Done: 2026-09-12\n* [x] **B.** Done: 2026-09-12\n* [x] **OLD.**\n* [ ] **C.**\n");
  assert.deepEqual(F.doneByDay(s), { "2026-09-12": 2 });
  assert.equal(F.plainItem(s[0].items[0]), "A. Source: x.md", "the date is not part of the editable text");
  assert.match(F.today(new Date(2026, 8, 13)), /^2026-09-13$/);
});

test("plainItem is the editable text and round-trips", () => {
  const it = { done: false, head: "THE DECK SENT.", detail: "Writes stay off.", source: "notes/alex.md", raw: false };
  const plain = F.plainItem(it);
  assert.equal(plain, "THE DECK SENT. Writes stay off. Source: notes/alex.md");
  assert.deepEqual(F.structuredLine(plain), it);
  assert.ok(F.isFormatted("## Todo\n\n* [ ] **X.**"));
  assert.ok(!F.isFormatted("call alex by friday"));
});

test("guard flags an invented number and an invented word, not the captured ones", () => {
  const raw = "call alex about the deck and send sam the video by friday";
  const good = "## Todo\n\n* [ ] **SAM HAS THE VIDEO BY FRIDAY.**\n* [ ] **ALEX CALLED ABOUT THE DECK.**\n";
  const g1 = F.guard(raw, good);
  assert.equal(g1.items.length, 2);
  assert.equal(g1.flagged, 0);
  const bad = "## Todo\n\n* [ ] **ALEX CALLED ABOUT THE DECK AND THE 12 WEEK GUARANTEE.** Jordan agreed.\n";
  const g2 = F.guard(raw, bad);
  assert.equal(g2.flagged, 1);
  const flags = g2.items[0].flags.join(" | ");
  assert.match(flags, /new number 12/);
  assert.match(flags, /new word guarantee/);
  assert.match(flags, /new word jordan/);
});

test("scribe prompt carries the raw lines and both sections; clean strips chatter and terminal codes", () => {
  const p = S.buildPrompt("buy milk\nmaybe learn rust someday");
  assert.ok(p.includes("## Someday"));
  assert.ok(p.includes("<<<\nbuy milk\nmaybe learn rust someday\n>>>"));
  assert.equal(S.PRESETS.claude, "claude -p");
  const cleaned = S.clean("Sure!\n```\n\x1b[2m## Todo\x1b[0m\n\n* [ ] **MILK BOUGHT.**\n```\nDone.");
  assert.equal(cleaned, "## Todo\n\n* [ ] **MILK BOUGHT.**\n");
});
