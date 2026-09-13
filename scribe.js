/* scribe.js — the reformat-after-logging contract.
   One prompt, three doors: paste it into any AI, pipe it to any CLI agent, or hit the server.
   Browser: window.TodoScribe. Node: require("./scribe.js"). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) { module.exports = factory(); }
  else { root.TodoScribe = factory(); }
}(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* Agent commands take the prompt on stdin and print only the result. */
  var PRESETS = {
    claude: "claude -p",
    codex: "codex exec --skip-git-repo-check -",
    hermes: "hermes -z \"$(cat)\"",
    grok: "grok -p \"$(cat)\""
  };

  /* What the scribe does with your lines. Pick one in settings, or add your own instruction on top. */
  var MODES = {
    unbundle: "break big lines down",
    one: "one line, one item",
    merge: "merge lines about the same thing"
  };
  var EXTRA_MAX = 400;

  function buildPrompt(raw, opts) {
    opts = opts || {};
    var mode = MODES[opts.mode] ? opts.mode : "unbundle";
    var extra = String(opts.extra || "").replace(/\s+/g, " ").trim().slice(0, EXTRA_MAX);

    var format = [
      "FORMAT",
      "## Todo",
      "* [ ] **OUTCOME HEADLINE IN CAPS.** One optional detail sentence. Source: optional pointer"
    ];
    if (mode === "unbundle") format.push(
      "* [ ] a big line exactly as written",
      "  * [ ] **FIRST SMALLER OUTCOME, DOABLE TODAY.**",
      "  * [ ] **SECOND SMALLER OUTCOME.**",
      "  * [ ] **LAST SMALLER OUTCOME, WHICH FINISHES THE BIG LINE.**"
    );
    format.push(
      "",
      "## Someday",
      "* [ ] **OUTCOME HEADLINE IN CAPS.**",
      "",
      "## Ask",
      "* [?] the line exactly as written",
      "  * [ ] **ONE COMPLETE ITEM AS THE FIRST OPTION.**",
      "  * [ ] **ONE COMPLETE ITEM AS THE SECOND OPTION.**"
    );

    var rules = [
      "One item per outcome. A headline is a short complete sentence in capital letters that states a checkable state of the world, ending in a period. If the line states a purpose, the headline is that purpose achieved. If it only states an action, the headline is that action done: \"call alex\" becomes \"ALEX CALLED.\"",
      "Accuracy over polish. Keep every name, number, date, product, place, and quoted phrase exactly as written. Never add a name, number, date, product, reason, or source that is not in the lines. If an outcome cannot be written without inventing one of those, use the writer's own words as the headline."
    ];
    if (mode === "unbundle") rules.push(
      "Break big lines down. A line that is a project or a goal, something that cannot be finished in one sitting, becomes two to five smaller outcomes that get it done: write the line exactly as written, then indent the smaller outcomes beneath it with two spaces. Put them in the order they get done. The first must be doable today. Each must be finishable in one sitting. The last must finish the big line. The steps may use ordinary words for the work, but rule 2 still holds for names, numbers, dates, products, and sources. Keep a deadline on the step it belongs to.",
      "A line that is already one small outcome stays one item. Never split a small line. Never merge two lines."
    );
    else if (mode === "one") rules.push(
      "One line, one item. Never split a line into several items, however big it is. Never merge two lines."
    );
    else rules.push(
      "Merge lines that describe the same outcome into one item, and put the extra details from the other lines in the detail sentence, in the writer's words. Never merge two different outcomes. Never split a line."
    );
    rules.push(
      "A line that begins with \"someday:\" goes under \"## Someday\" with that tag removed. So does a line the writer marks as maybe, someday, sometime, eventually, later, or \"if I get to it\". Every other line goes under \"## Todo\". Keep any day or deadline the writer names as words inside the item, such as \"by Friday\".",
      "Drop filler, false starts, and repeated words. Keep everything else.",
      "A detail sentence is optional and uses the writer's own words. Add \"Source:\" only when the line names a file, link, or document.",
      "If a line has two plausible outcomes and choosing wrong would change the item, do not guess. Put it under \"## Ask\": \"* [?] \" then the line exactly as written, followed by two or three complete items indented beneath it as the options, each built only from the writer's words. Ask at most two questions per reply. Never ask about wording, capitalization, or order. A line under Ask must not also appear under Todo or Someday. When nothing is ambiguous, omit \"## Ask\" entirely.",
      "A line that ends with \"[answer: ...]\" is the writer answering an earlier question. Use the answer and produce items, not another question."
    );
    if (extra) rules.push("The writer adds this instruction: \"" + extra.replace(/"/g, "'") + "\". Follow it unless it conflicts with rule 2.");

    return [
      "You are a scribe for a to-do list. Rewrite the RAW LINES into to-do items.",
      "Output ONLY the items in the exact format below. No preamble, no commentary, no code fences.",
      ""
    ].concat(format, ["", "RULES"], rules.map(function (r, i) { return (i + 1) + ". " + r; }), ["", "RAW LINES", "<<<", String(raw || "").trim(), ">>>"]).join("\n");
  }

  /* Some agents wrap output in fences, add a lead-in line, or print terminal chrome. Keep only format lines. */
  function clean(reply) {
    var text = String(reply || "")
      .replace(/\x1b\][^\x07]*\x07/g, "")
      .replace(/\x1b\[[\d;?]*[A-Za-z]/g, "")
      .replace(/\r\n?/g, "\n");
    var lines = text.split("\n");
    return lines.filter(function (l) {
      var t = l.replace(/^\s+/, "");
      return /^## /.test(t) || /^\* \[[ xX?]\]/.test(t) || t === "";
    }).join("\n").trim() + "\n";
  }

  /* The agent door as a prompt. Paste it into any agent, anywhere it can reach the server, and it can read and write the list. */
  function connectPrompt(o) {
    o = o || {};
    var server = o.server || "http://127.0.0.1:8791";
    return [
      "Connect to my todo list. It is one plain-text file served by a small HTTP server.",
      "",
      "Server: " + server + (o.host ? "  (the machine is \"" + o.host + "\"; reachable on my private network, Tailscale)" : ""),
      o.file ? "File on that machine: " + o.file + "  (if you run on that machine, edit the file directly or use the `todo` CLI)" : "",
      "",
      "The file format:",
      "  ## Todo",
      "  * [ ] **OUTCOME HEADLINE IN CAPS.** Optional detail sentence. Source: optional pointer",
      "  * [ ] a raw line in my own words, not yet scribed",
      "  * [x] **A DONE LINE.** Done: 2026-01-31T09:30",
      "  ## Someday",
      "  * [ ] **SOMETHING FOR LATER.**",
      "",
      "Bold lines are scribed outcomes. Plain lines are raw. Never delete a done line. Keep the format exactly.",
      "",
      "HTTP:",
      "  GET  " + server + "/api/file      the whole file as text; the ETag header is its version",
      "  PUT  " + server + "/api/file      the whole file as text, with header If-Match: <that ETag>; 409 means it changed under you, GET again",
      "  GET  " + server + "/api/summary   open count, the next lines, the streak",
      "  POST " + server + "/api/scribe    {\"raw\": \"lines\"} returns those lines rewritten as outcomes by the server's own agent",
      "",
      "Rules for you:",
      "  1. To add work, append raw lines in my words under ## Todo. Do not invent names, numbers, dates, or sources.",
      "  2. To finish work, change [ ] to [x] and append \" Done: YYYY-MM-DDTHH:MM\" with the current local time.",
      "  3. Only write lines you have a reason for. Ask me before adding more than three at once.",
      "",
      "Prove the connection now: GET the file, tell me how many lines are open, append one raw line that says",
      "\"connected: <your name>\", PUT it back with the ETag, and GET it once more to confirm."
    ].join("\n");
  }

  return { PRESETS: PRESETS, MODES: MODES, EXTRA_MAX: EXTRA_MAX, buildPrompt: buildPrompt, clean: clean, connectPrompt: connectPrompt };
}));
