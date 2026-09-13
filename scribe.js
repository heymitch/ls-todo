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

  function buildPrompt(raw) {
    return [
      "You are a scribe for a to-do list. Rewrite the RAW LINES into to-do items.",
      "Output ONLY the items in the exact format below. No preamble, no commentary, no code fences.",
      "",
      "FORMAT",
      "## Todo",
      "* [ ] **OUTCOME HEADLINE IN CAPS.** One optional detail sentence. Source: optional pointer",
      "",
      "## Someday",
      "* [ ] **OUTCOME HEADLINE IN CAPS.**",
      "",
      "## Ask",
      "* [?] the line exactly as written",
      "  * [ ] **ONE COMPLETE ITEM AS THE FIRST OPTION.**",
      "  * [ ] **ONE COMPLETE ITEM AS THE SECOND OPTION.**",
      "",
      "RULES",
      "1. One item per outcome. A headline is a short complete sentence in capital letters that states a checkable state of the world, ending in a period. If the line states a purpose, the headline is that purpose achieved. If it only states an action, the headline is that action done: \"call alex\" becomes \"ALEX CALLED.\"",
      "2. Accuracy over polish. Keep every name, number, date, product, place, and quoted phrase exactly as written. Never add a fact, name, number, reason, or source that is not in the lines. If an outcome cannot be written without inventing, use the writer's own words as the headline.",
      "3. Do not merge two outcomes into one item. Do not split one outcome into two.",
      "4. A line that begins with \"someday:\" goes under \"## Someday\" with that tag removed. So does a line the writer marks as maybe, someday, sometime, eventually, later, or \"if I get to it\". Every other line goes under \"## Todo\". Keep any day or deadline the writer names as words inside the item, such as \"by Friday\".",
      "5. Drop filler, false starts, and repeated words. Keep everything else.",
      "6. A detail sentence is optional and uses the writer's own words. Add \"Source:\" only when the line names a file, link, or document.",
      "7. If a line has two plausible outcomes and choosing wrong would change the item, do not guess. Put it under \"## Ask\": \"* [?] \" then the line exactly as written, followed by two or three complete items indented beneath it as the options, each built only from the writer's words. Ask at most two questions per reply. Never ask about wording, capitalization, or order. A line under Ask must not also appear under Todo or Someday. When nothing is ambiguous, omit \"## Ask\" entirely.",
      "8. A line that ends with \"[answer: ...]\" is the writer answering an earlier question. Use the answer and produce one item, not another question.",
      "",
      "RAW LINES",
      "<<<",
      String(raw || "").trim(),
      ">>>"
    ].join("\n");
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

  return { PRESETS: PRESETS, buildPrompt: buildPrompt, clean: clean };
}));
